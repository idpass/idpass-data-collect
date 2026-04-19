/*
 * Licensed to the Association pour la cooperation numerique (ACN) under one
 * or more contributor license agreements. See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership. The ACN licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License. You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

jest.mock("../../../datacollect/src/utils/logger", () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn(),
    fatal: jest.fn(),
    child: jest.fn().mockReturnThis(),
  }),
}));

import type { EntityPair, EventStore } from "@idpass/data-collect-core";
import { EntityType } from "@idpass/data-collect-core";
import { EventApplierService } from "@idpass/data-collect-core";
import { MockRegistrySyncAdapter } from "../MockRegistrySyncAdapter";
import {
  MockRegistryClient,
  NotFoundError,
  PreconditionFailedError,
  RetryableError,
} from "../MockRegistryClient";
import type { Group, PaginatedResponse, Person } from "../types";

// Mock the client module so we can drive the adapter without real HTTP.
jest.mock("../MockRegistryClient", () => {
  const actual = jest.requireActual("../MockRegistryClient");
  return {
    __esModule: true,
    ...actual,
    MockRegistryClient: jest.fn(),
  };
});

type ClientMock = {
  getToken: jest.Mock;
  clearToken: jest.Mock;
  health: jest.Mock;
  listPersons: jest.Mock<Promise<PaginatedResponse<Person>>, unknown[]>;
  getPerson: jest.Mock;
  createPerson: jest.Mock;
  updatePerson: jest.Mock;
  deletePerson: jest.Mock;
  addIdentifier: jest.Mock;
  addIdentityDocument: jest.Mock;
  listGroups: jest.Mock<Promise<PaginatedResponse<Group>>, unknown[]>;
  getGroup: jest.Mock;
  createGroup: jest.Mock;
  updateGroup: jest.Mock;
  deleteGroup: jest.Mock;
  addMember: jest.Mock;
  removeMember: jest.Mock;
};

function emptyPersonPage(): PaginatedResponse<Person> {
  return { items: [], total: 0, limit: 100, offset: 0, next_offset: null };
}
function emptyGroupPage(): PaginatedResponse<Group> {
  return { items: [], total: 0, limit: 100, offset: 0, next_offset: null };
}

function createClientMock(): ClientMock {
  return {
    getToken: jest.fn().mockResolvedValue("mock-token"),
    clearToken: jest.fn(),
    health: jest.fn().mockResolvedValue({ status: "ok" }),
    listPersons: jest.fn().mockResolvedValue(emptyPersonPage()),
    getPerson: jest.fn(),
    createPerson: jest.fn(),
    updatePerson: jest.fn(),
    deletePerson: jest.fn(),
    addIdentifier: jest.fn(),
    addIdentityDocument: jest.fn(),
    listGroups: jest.fn().mockResolvedValue(emptyGroupPage()),
    getGroup: jest.fn(),
    createGroup: jest.fn(),
    updateGroup: jest.fn(),
    deleteGroup: jest.fn(),
    addMember: jest.fn(),
    removeMember: jest.fn(),
  };
}

function createEventStoreMock(): jest.Mocked<EventStore> {
  return {
    getLastPushExternalSyncTimestamp: jest.fn().mockResolvedValue(""),
    setLastPushExternalSyncTimestamp: jest.fn().mockResolvedValue(undefined),
    getLastPullExternalSyncTimestamp: jest.fn().mockResolvedValue(""),
    setLastPullExternalSyncTimestamp: jest.fn().mockResolvedValue(undefined),
    getEventsSince: jest.fn(),
    getAllEvents: jest.fn(),
  } as unknown as jest.Mocked<EventStore>;
}

function createEventApplierServiceMock(entityStoreOverrides: Record<string, jest.Mock> = {}) {
  const entityStore = {
    getAllEntities: jest.fn().mockResolvedValue([]),
    getModifiedEntitiesSince: jest.fn().mockResolvedValue([]),
    getEntity: jest.fn().mockResolvedValue(null),
    getEntityByExternalId: jest.fn().mockResolvedValue(null),
    saveEntity: jest.fn().mockResolvedValue(undefined),
    ...entityStoreOverrides,
  };

  const submitForm = jest.fn();
  const eas = {
    submitForm,
    getEntityStore: jest.fn().mockReturnValue(entityStore),
  } as unknown as EventApplierService;

  return { eventApplierService: eas, entityStore, submitForm };
}

const VALID_CONFIG = {
  type: "mock" as const,
  url: "http://localhost:9999",
  clientId: "mock-client",
  clientSecret: "mock-secret",
  identifierScheme: "urn:mock:vocab:id-type",
  identifierType: "system_id",
};

describe("MockRegistrySyncAdapter", () => {
  let clientMock: ClientMock;

  beforeEach(() => {
    jest.clearAllMocks();
    clientMock = createClientMock();
    (MockRegistryClient as unknown as jest.Mock).mockImplementation(() => clientMock);
  });

  describe("descriptor", () => {
    it("returns the expected adapter descriptor", () => {
      const adapter = new MockRegistrySyncAdapter(
        createEventStoreMock(),
        createEventApplierServiceMock().eventApplierService,
      );
      const desc = adapter.descriptor();
      expect(desc.type).toBe("mock");
      expect(desc.version).toBe("2.0.0");
      expect(desc.capabilities).toEqual(["push", "pull"]);
      expect(desc.configSchema).toBeDefined();
    });
  });

  describe("initialize", () => {
    it("accepts valid config", async () => {
      const adapter = new MockRegistrySyncAdapter(
        createEventStoreMock(),
        createEventApplierServiceMock().eventApplierService,
      );
      await expect(adapter.initialize(VALID_CONFIG)).resolves.not.toThrow();
    });

    it("rejects config missing clientId", async () => {
      const adapter = new MockRegistrySyncAdapter(
        createEventStoreMock(),
        createEventApplierServiceMock().eventApplierService,
      );
      await expect(
        adapter.initialize({ ...VALID_CONFIG, clientId: "" }),
      ).rejects.toThrow(/Invalid mock adapter config/);
    });

    it("rejects invalid url", async () => {
      const adapter = new MockRegistrySyncAdapter(
        createEventStoreMock(),
        createEventApplierServiceMock().eventApplierService,
      );
      await expect(
        adapter.initialize({ ...VALID_CONFIG, url: "not-a-url" }),
      ).rejects.toThrow(/Invalid mock adapter config/);
    });
  });

  describe("healthCheck", () => {
    it("returns healthy when /health returns ok", async () => {
      const adapter = new MockRegistrySyncAdapter(
        createEventStoreMock(),
        createEventApplierServiceMock().eventApplierService,
      );
      await adapter.initialize(VALID_CONFIG);
      const result = await adapter.healthCheck();
      expect(result.healthy).toBe(true);
      expect(result.latency).toBeGreaterThanOrEqual(0);
    });

    it("returns unhealthy before initialize", async () => {
      const adapter = new MockRegistrySyncAdapter(
        createEventStoreMock(),
        createEventApplierServiceMock().eventApplierService,
      );
      const result = await adapter.healthCheck();
      expect(result.healthy).toBe(false);
      expect(result.message).toBe("Not initialized");
    });

    it("returns unhealthy on server failure", async () => {
      const adapter = new MockRegistrySyncAdapter(
        createEventStoreMock(),
        createEventApplierServiceMock().eventApplierService,
      );
      await adapter.initialize(VALID_CONFIG);
      clientMock.health.mockRejectedValueOnce(new RetryableError("down"));
      const result = await adapter.healthCheck();
      expect(result.healthy).toBe(false);
      expect(result.message).toContain("down");
    });
  });

  describe("pull", () => {
    it("returns NOT_INITIALIZED before init", async () => {
      const adapter = new MockRegistrySyncAdapter(
        createEventStoreMock(),
        createEventApplierServiceMock().eventApplierService,
      );
      const result = await adapter.pull();
      expect(result.success).toBe(false);
      expect(result.errors[0].code).toBe("NOT_INITIALIZED");
    });

    it("pulls persons and submits create-individual form submissions", async () => {
      const { eventApplierService, submitForm } = createEventApplierServiceMock();
      const adapter = new MockRegistrySyncAdapter(createEventStoreMock(), eventApplierService);
      await adapter.initialize(VALID_CONFIG);

      const person: Person = {
        uuid: "uuid-1",
        given_name: "Ada",
        family_name: "Lovelace",
        date_of_birth: "1815-12-10",
        gender: "2",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-02T00:00:00Z",
        identifiers: [
          {
            identifier_type: "national_id_number",
            identifier_value: "NID-001",
            identifier_scheme_id: "urn:mock:vocab:id-type",
            identifier_scheme_name: "National ID",
          },
          {
            identifier_type: "system_id",
            identifier_value: "uuid-1",
            identifier_scheme_id: "urn:mock:vocab:id-type",
            identifier_scheme_name: "System ID",
          },
        ],
      };

      clientMock.listPersons.mockResolvedValueOnce({
        items: [person],
        total: 1,
        limit: 100,
        offset: 0,
        next_offset: null,
      });

      const result = await adapter.pull();
      expect(result.success).toBe(true);
      expect(result.pulled).toBe(1);
      expect(submitForm).toHaveBeenCalledTimes(1);
      expect(submitForm).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "create-individual",
          data: expect.objectContaining({
            firstName: "Ada",
            lastName: "Lovelace",
            dateOfBirth: "1815-12-10",
            gender: "female",
            externalId: "NID-001",
          }),
        }),
      );
    });

    it("prefers non-system_id identifier over system_id", async () => {
      const { eventApplierService, submitForm } = createEventApplierServiceMock();
      const adapter = new MockRegistrySyncAdapter(createEventStoreMock(), eventApplierService);
      await adapter.initialize(VALID_CONFIG);

      clientMock.listPersons.mockResolvedValueOnce({
        items: [
          {
            uuid: "uuid-1",
            created_at: "2024-01-01T00:00:00Z",
            updated_at: "2024-01-01T00:00:00Z",
            identifiers: [
              {
                identifier_type: "system_id",
                identifier_value: "sys-1",
                identifier_scheme_id: "urn:mock:vocab:id-type",
              },
              {
                identifier_type: "passport",
                identifier_value: "P-12345",
                identifier_scheme_id: "urn:mock:vocab:id-type",
              },
            ],
          },
        ],
        total: 1,
        limit: 100,
        offset: 0,
        next_offset: null,
      });

      await adapter.pull();
      expect(submitForm.mock.calls[0][0].data.externalId).toBe("P-12345");
    });

    it("falls back to system_id when no real identifier exists", async () => {
      const { eventApplierService, submitForm } = createEventApplierServiceMock();
      const adapter = new MockRegistrySyncAdapter(createEventStoreMock(), eventApplierService);
      await adapter.initialize(VALID_CONFIG);

      clientMock.listPersons.mockResolvedValueOnce({
        items: [
          {
            uuid: "uuid-1",
            created_at: "2024-01-01T00:00:00Z",
            updated_at: "2024-01-01T00:00:00Z",
            identifiers: [
              {
                identifier_type: "system_id",
                identifier_value: "sys-1",
                identifier_scheme_id: "urn:mock:vocab:id-type",
              },
            ],
          },
        ],
        total: 1,
        limit: 100,
        offset: 0,
        next_offset: null,
      });

      await adapter.pull();
      expect(submitForm.mock.calls[0][0].data.externalId).toBe("sys-1");
    });

    it("paginates across multiple pages", async () => {
      const { eventApplierService, submitForm } = createEventApplierServiceMock();
      const adapter = new MockRegistrySyncAdapter(createEventStoreMock(), eventApplierService);
      await adapter.initialize(VALID_CONFIG);

      const makePerson = (i: number): Person => ({
        uuid: `uuid-${i}`,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
        identifiers: [
          {
            identifier_type: "system_id",
            identifier_value: `sys-${i}`,
            identifier_scheme_id: "urn:mock:vocab:id-type",
          },
        ],
      });

      // Page size is 100. Simulate two full pages and one short page.
      const page1: Person[] = Array.from({ length: 100 }, (_, i) => makePerson(i));
      const page2: Person[] = Array.from({ length: 50 }, (_, i) => makePerson(100 + i));

      clientMock.listPersons
        .mockResolvedValueOnce({
          items: page1,
          total: 150,
          limit: 100,
          offset: 0,
          next_offset: 100,
        })
        .mockResolvedValueOnce({
          items: page2,
          total: 150,
          limit: 100,
          offset: 100,
          next_offset: null,
        });

      const result = await adapter.pull();
      expect(result.pulled).toBe(150);
      expect(submitForm).toHaveBeenCalledTimes(150);
      expect(clientMock.listPersons).toHaveBeenCalledTimes(2);
    });

    it("passes updated_since on subsequent sync", async () => {
      const adapter = new MockRegistrySyncAdapter(
        createEventStoreMock(),
        createEventApplierServiceMock().eventApplierService,
      );
      await adapter.initialize(VALID_CONFIG);

      await adapter.pull("2024-01-01T00:00:00Z");

      expect(clientMock.listPersons).toHaveBeenCalledWith(
        expect.objectContaining({ updatedSince: "2024-01-01T00:00:00Z" }),
      );
      expect(clientMock.listGroups).toHaveBeenCalledWith(
        expect.objectContaining({ updatedSince: "2024-01-01T00:00:00Z" }),
      );
    });

    it("treats empty string since as undefined", async () => {
      const adapter = new MockRegistrySyncAdapter(
        createEventStoreMock(),
        createEventApplierServiceMock().eventApplierService,
      );
      await adapter.initialize(VALID_CONFIG);

      await adapter.pull("");

      expect(clientMock.listPersons).toHaveBeenCalledWith(
        expect.objectContaining({ updatedSince: undefined }),
      );
    });

    it("routes to update-individual when entity exists locally", async () => {
      const { eventApplierService, submitForm, entityStore } =
        createEventApplierServiceMock();
      entityStore.getEntityByExternalId = jest.fn().mockResolvedValue({
        guid: "local-guid-1",
        modified: {
          id: "1",
          guid: "local-guid-1",
          type: EntityType.Individual,
          version: 1,
          data: {},
          lastUpdated: "2024-01-01T00:00:00Z",
          externalId: "NID-001",
        },
        initial: null,
      });

      const adapter = new MockRegistrySyncAdapter(createEventStoreMock(), eventApplierService);
      await adapter.initialize(VALID_CONFIG);

      clientMock.listPersons.mockResolvedValueOnce({
        items: [
          {
            uuid: "uuid-1",
            given_name: "Ada",
            family_name: "Lovelace",
            created_at: "2024-01-01T00:00:00Z",
            updated_at: "2024-01-02T00:00:00Z",
            identifiers: [
              {
                identifier_type: "national_id_number",
                identifier_value: "NID-001",
                identifier_scheme_id: "urn:mock:vocab:id-type",
              },
            ],
          },
        ],
        total: 1,
        limit: 100,
        offset: 0,
        next_offset: null,
      });

      await adapter.pull();
      expect(submitForm).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "update-individual",
          entityGuid: "local-guid-1",
        }),
      );
    });

    it("skips persons with no identifier", async () => {
      const { eventApplierService, submitForm } = createEventApplierServiceMock();
      const adapter = new MockRegistrySyncAdapter(createEventStoreMock(), eventApplierService);
      await adapter.initialize(VALID_CONFIG);

      clientMock.listPersons.mockResolvedValueOnce({
        items: [
          {
            uuid: "uuid-1",
            created_at: "2024-01-01T00:00:00Z",
            updated_at: "2024-01-01T00:00:00Z",
            identifiers: [],
          },
        ],
        total: 1,
        limit: 100,
        offset: 0,
        next_offset: null,
      });

      const result = await adapter.pull();
      expect(result.pulled).toBe(0);
      expect(result.skipped).toBe(1);
      expect(submitForm).not.toHaveBeenCalled();
    });

    it("records PULL_PERSONS_FAILED when listing blows up", async () => {
      const adapter = new MockRegistrySyncAdapter(
        createEventStoreMock(),
        createEventApplierServiceMock().eventApplierService,
      );
      await adapter.initialize(VALID_CONFIG);

      clientMock.listPersons.mockRejectedValueOnce(new RetryableError("boom"));

      const result = await adapter.pull();
      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.code === "PULL_PERSONS_FAILED")).toBe(true);
    });
  });

  describe("push", () => {
    function makeIndividualPair(overrides: Partial<EntityPair["modified"]> = {}): EntityPair {
      const modified = {
        id: "e1",
        guid: "dc-guid-1",
        type: EntityType.Individual,
        version: 1,
        data: {
          entityName: "individual",
          firstName: "Ada",
          lastName: "Lovelace",
          gender: "female",
        },
        lastUpdated: "2024-06-01T00:00:00Z",
        ...overrides,
      };
      return {
        guid: modified.guid,
        initial: { ...modified, version: 1 },
        modified,
      };
    }

    it("returns NOT_INITIALIZED before init", async () => {
      const adapter = new MockRegistrySyncAdapter(
        createEventStoreMock(),
        createEventApplierServiceMock().eventApplierService,
      );
      const result = await adapter.push([]);
      expect(result.success).toBe(false);
      expect(result.errors[0].code).toBe("NOT_INITIALIZED");
    });

    it("POSTs new entities without externalId and stores returned uuid", async () => {
      const pair = makeIndividualPair();
      const saveEntity = jest.fn();
      const { eventApplierService } = createEventApplierServiceMock({
        getAllEntities: jest.fn().mockResolvedValue([pair]),
        getModifiedEntitiesSince: jest.fn().mockResolvedValue([pair]),
        getEntity: jest.fn().mockResolvedValue(pair),
        saveEntity,
      });

      const adapter = new MockRegistrySyncAdapter(createEventStoreMock(), eventApplierService);
      await adapter.initialize(VALID_CONFIG);

      clientMock.createPerson.mockResolvedValueOnce({
        uuid: "remote-uuid-1",
        created_at: "2024-06-02T00:00:00Z",
        updated_at: "2024-06-02T00:00:00Z",
      } as Person);

      const result = await adapter.push([]);
      expect(result.success).toBe(true);
      expect(result.pushed).toBe(1);
      expect(clientMock.createPerson).toHaveBeenCalledWith(
        expect.objectContaining({
          given_name: "Ada",
          family_name: "Lovelace",
          gender: "2",
          identifiers: expect.arrayContaining([
            expect.objectContaining({
              identifier_type: "system_id",
              identifier_value: "dc-guid-1",
            }),
          ]),
        }),
      );
      expect(saveEntity).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          externalId: "remote-uuid-1",
        }),
      );
    });

    it("PATCHes existing entities with If-Match", async () => {
      const pair = makeIndividualPair({
        version: 2,
        externalId: "remote-uuid-1",
        data: {
          entityName: "individual",
          firstName: "Ada",
          lastName: "Byron", // name changed locally
          externalId: "remote-uuid-1",
        },
      });
      pair.initial = { ...pair.modified, version: 1 };

      const { eventApplierService } = createEventApplierServiceMock({
        getAllEntities: jest.fn().mockResolvedValue([pair]),
        getModifiedEntitiesSince: jest.fn().mockResolvedValue([pair]),
      });

      const adapter = new MockRegistrySyncAdapter(createEventStoreMock(), eventApplierService);
      await adapter.initialize(VALID_CONFIG);

      clientMock.getPerson.mockResolvedValueOnce({
        uuid: "remote-uuid-1",
        given_name: "Ada",
        family_name: "Lovelace",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-06-01T12:00:00Z",
        identifiers: [
          {
            identifier_type: "system_id",
            identifier_value: "remote-uuid-1",
            identifier_scheme_id: "urn:mock:vocab:id-type",
          },
        ],
      } as Person);
      clientMock.updatePerson.mockResolvedValueOnce({ uuid: "remote-uuid-1" } as Person);

      const result = await adapter.push([]);
      expect(result.success).toBe(true);
      expect(result.pushed).toBe(1);
      expect(clientMock.getPerson).toHaveBeenCalledWith("remote-uuid-1");
      expect(clientMock.updatePerson).toHaveBeenCalledWith(
        "remote-uuid-1",
        expect.objectContaining({ family_name: "Byron" }),
        "2024-06-01T12:00:00Z",
      );
    });

    it("filters out stale pulled entities (initial.version === modified.version with externalId)", async () => {
      const pair = makeIndividualPair({
        externalId: "remote-uuid-1",
        data: {
          entityName: "individual",
          externalId: "remote-uuid-1",
        },
      });
      pair.initial = { ...pair.modified };

      const { eventApplierService } = createEventApplierServiceMock({
        getAllEntities: jest.fn().mockResolvedValue([pair]),
        getModifiedEntitiesSince: jest.fn().mockResolvedValue([pair]),
      });

      const adapter = new MockRegistrySyncAdapter(createEventStoreMock(), eventApplierService);
      await adapter.initialize(VALID_CONFIG);

      const result = await adapter.push([]);
      expect(result.pushed).toBe(0);
      expect(clientMock.createPerson).not.toHaveBeenCalled();
      expect(clientMock.updatePerson).not.toHaveBeenCalled();
    });

    it("handles 412 conflict as skipped", async () => {
      const pair = makeIndividualPair({
        version: 2,
        externalId: "remote-uuid-1",
      });
      pair.initial = { ...pair.modified, version: 1 };

      const { eventApplierService } = createEventApplierServiceMock({
        getAllEntities: jest.fn().mockResolvedValue([pair]),
        getModifiedEntitiesSince: jest.fn().mockResolvedValue([pair]),
      });

      const adapter = new MockRegistrySyncAdapter(createEventStoreMock(), eventApplierService);
      await adapter.initialize(VALID_CONFIG);

      clientMock.getPerson.mockResolvedValueOnce({
        uuid: "remote-uuid-1",
        created_at: "2024-01-01",
        updated_at: "2024-06-01T12:00:00Z",
      } as Person);
      clientMock.updatePerson.mockRejectedValueOnce(
        new PreconditionFailedError("stale"),
      );

      const result = await adapter.push([]);
      expect(result.success).toBe(true);
      expect(result.pushed).toBe(0);
      expect(result.skipped).toBe(1);
      expect(result.failed).toBe(0);
    });

    it("falls back to create when PATCH target is missing (404)", async () => {
      const pair = makeIndividualPair({
        version: 2,
        externalId: "remote-uuid-1",
      });
      pair.initial = { ...pair.modified, version: 1 };

      const saveEntity = jest.fn();
      const { eventApplierService } = createEventApplierServiceMock({
        getAllEntities: jest.fn().mockResolvedValue([pair]),
        getModifiedEntitiesSince: jest.fn().mockResolvedValue([pair]),
        getEntity: jest.fn().mockResolvedValue(pair),
        saveEntity,
      });

      const adapter = new MockRegistrySyncAdapter(createEventStoreMock(), eventApplierService);
      await adapter.initialize(VALID_CONFIG);

      clientMock.getPerson.mockRejectedValueOnce(new NotFoundError("gone"));
      clientMock.createPerson.mockResolvedValueOnce({
        uuid: "remote-uuid-2",
        created_at: "2024-06-02",
        updated_at: "2024-06-02",
      } as Person);

      const result = await adapter.push([]);
      expect(result.pushed).toBe(1);
      expect(clientMock.createPerson).toHaveBeenCalled();
    });

    it("advances push watermark only when no failures", async () => {
      const eventStore = createEventStoreMock();
      const pair1 = makeIndividualPair({ guid: "ok" });
      const pair2 = makeIndividualPair({ guid: "bad", id: "e2" });

      const { eventApplierService } = createEventApplierServiceMock({
        getAllEntities: jest.fn().mockResolvedValue([pair1, pair2]),
        getModifiedEntitiesSince: jest.fn().mockResolvedValue([pair1, pair2]),
        getEntity: jest.fn().mockResolvedValue(pair1),
      });

      const adapter = new MockRegistrySyncAdapter(eventStore, eventApplierService);
      await adapter.initialize(VALID_CONFIG);

      clientMock.createPerson
        .mockResolvedValueOnce({ uuid: "r1", created_at: "x", updated_at: "x" } as Person)
        .mockRejectedValueOnce(new RetryableError("boom"));

      const result = await adapter.push([]);
      expect(result.pushed).toBe(1);
      expect(result.failed).toBe(1);
      expect(eventStore.setLastPushExternalSyncTimestamp).not.toHaveBeenCalled();
    });

    it("advances push watermark when all entities pushed cleanly", async () => {
      const eventStore = createEventStoreMock();
      const pair = makeIndividualPair();

      const { eventApplierService } = createEventApplierServiceMock({
        getAllEntities: jest.fn().mockResolvedValue([pair]),
        getModifiedEntitiesSince: jest.fn().mockResolvedValue([pair]),
        getEntity: jest.fn().mockResolvedValue(pair),
      });

      const adapter = new MockRegistrySyncAdapter(eventStore, eventApplierService);
      await adapter.initialize(VALID_CONFIG);

      clientMock.createPerson.mockResolvedValueOnce({
        uuid: "r1",
        created_at: "x",
        updated_at: "x",
      } as Person);

      await adapter.push([]);
      expect(eventStore.setLastPushExternalSyncTimestamp).toHaveBeenCalledTimes(1);
    });

    it("reports transient push errors as retryable", async () => {
      const pair = makeIndividualPair();
      const { eventApplierService } = createEventApplierServiceMock({
        getAllEntities: jest.fn().mockResolvedValue([pair]),
        getModifiedEntitiesSince: jest.fn().mockResolvedValue([pair]),
        getEntity: jest.fn().mockResolvedValue(pair),
      });

      const adapter = new MockRegistrySyncAdapter(createEventStoreMock(), eventApplierService);
      await adapter.initialize(VALID_CONFIG);

      clientMock.createPerson.mockRejectedValueOnce(new RetryableError("503 server"));

      const result = await adapter.push([]);
      expect(result.failed).toBe(1);
      expect(result.errors[0].retryable).toBe(true);
      expect(result.errors[0].entityGuid).toBe("dc-guid-1");
    });

    it("second sync (re-pull) is idempotent: pulled entities are not re-pushed", async () => {
      // Simulate a pull that writes an entity, then a push sees the same entity
      // already has externalId and initial.version === modified.version.
      const pair = makeIndividualPair({
        externalId: "remote-uuid-1",
        data: {
          entityName: "individual",
          firstName: "Ada",
          externalId: "remote-uuid-1",
        },
      });
      // Post-pull state: initial matches modified (no local edits)
      pair.initial = { ...pair.modified };

      const { eventApplierService } = createEventApplierServiceMock({
        getAllEntities: jest.fn().mockResolvedValue([pair]),
        getModifiedEntitiesSince: jest.fn().mockResolvedValue([pair]),
      });

      const adapter = new MockRegistrySyncAdapter(createEventStoreMock(), eventApplierService);
      await adapter.initialize(VALID_CONFIG);

      const result = await adapter.push([]);
      expect(result.pushed).toBe(0);
      expect(result.skipped).toBe(0);
      expect(clientMock.updatePerson).not.toHaveBeenCalled();
      expect(clientMock.createPerson).not.toHaveBeenCalled();
    });
  });

  describe("disconnect", () => {
    it("clears token and config", async () => {
      const adapter = new MockRegistrySyncAdapter(
        createEventStoreMock(),
        createEventApplierServiceMock().eventApplierService,
      );
      await adapter.initialize(VALID_CONFIG);
      await adapter.disconnect();

      expect(clientMock.clearToken).toHaveBeenCalled();
      const result = await adapter.push([]);
      expect(result.errors[0].code).toBe("NOT_INITIALIZED");
    });
  });
});
