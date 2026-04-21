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

import type { EventStore, ExternalSyncConfig, EntityPair } from "@idpass/data-collect-core";
import { EntityType } from "@idpass/data-collect-core";
import OpenSppV2SyncAdapter from "../v2/OpenSppV2SyncAdapter";
import { EventApplierService } from "@idpass/data-collect-core";
import { PreconditionFailedError } from "../v2/OpenSppV2Client";
import type { IndividualResource, GroupResource, SearchResult } from "../v2/types";

const mockV2ClientImplementation = {
  authenticate: jest.fn().mockResolvedValue(undefined),
  isAuthenticated: jest.fn().mockReturnValue(true),
  formatIdentifier: jest.fn((system: string, value: string) => `${system}|${value}`),
  createIdentifier: jest.fn((system: string, value: string) => ({ system, value })),
  getIndividual: jest.fn().mockResolvedValue(null),
  searchIndividuals: jest.fn().mockResolvedValue({
    data: [],
    meta: { total: 0, count: 0, offset: 0 },
    links: { self: "/api/v2/spp/Individual" },
  }),
  createIndividual: jest.fn().mockImplementation((resource: IndividualResource) => ({
    ...resource,
    identifier: resource.identifier,
    meta: { versionId: "123456" },
  })),
  updateIndividual: jest.fn().mockImplementation((_: string, resource: IndividualResource) => resource),
  patchIndividual: jest.fn().mockImplementation(() => ({ type: "Individual", identifier: [] })),
  getGroup: jest.fn().mockResolvedValue(null),
  searchGroups: jest.fn().mockResolvedValue({
    data: [],
    meta: { total: 0, count: 0, offset: 0 },
    links: { self: "/api/v2/spp/Group" },
  }),
  createGroup: jest.fn().mockImplementation((resource: GroupResource) => ({
    ...resource,
    identifier: resource.identifier,
    meta: { versionId: "123456" },
  })),
  updateGroup: jest.fn().mockImplementation((_: string, resource: GroupResource) => resource),
  patchGroup: jest.fn().mockImplementation(() => ({ type: "Group", identifier: [] })),
};

jest.mock("../v2/OpenSppV2Client", () => {
  const actual = jest.requireActual("../v2/OpenSppV2Client");
  return {
    __esModule: true,
    OpenSppV2Client: jest.fn().mockImplementation(() => mockV2ClientImplementation),
    default: jest.fn().mockImplementation(() => mockV2ClientImplementation),
    PreconditionFailedError: actual.PreconditionFailedError,
  };
});

describe("OpenSppV2SyncAdapter", () => {
  let eventStore: jest.Mocked<EventStore>;
  let eventApplierService: jest.Mocked<EventApplierService>;
  let adapter: OpenSppV2SyncAdapter;
  let config: ExternalSyncConfig;

  beforeEach(() => {
    jest.clearAllMocks();

    eventStore = {
      getAllEvents: jest.fn(),
      getEventsSince: jest.fn(),
      getLastPushExternalSyncTimestamp: jest.fn().mockResolvedValue("1970-01-01T00:00:00.000Z"),
      setLastPushExternalSyncTimestamp: jest.fn(),
      getLastPullExternalSyncTimestamp: jest.fn().mockResolvedValue("1970-01-01T00:00:00.000Z"),
      setLastPullExternalSyncTimestamp: jest.fn(),
    } as unknown as jest.Mocked<EventStore>;

    const mockEntityStore = {
      getAllEntities: jest.fn().mockResolvedValue([]),
      getModifiedEntitiesSince: jest.fn().mockResolvedValue([]),
      getEntity: jest.fn().mockResolvedValue(null),
      getEntityByExternalId: jest.fn().mockResolvedValue(null),
      saveEntity: jest.fn(),
    };

    eventApplierService = {
      submitForm: jest.fn(),
      getEntityStore: jest.fn().mockReturnValue(mockEntityStore),
    } as unknown as jest.Mocked<EventApplierService>;

    config = {
      type: "openspp-v2-adapter",
      url: "http://openspp.example.com",
      adapterConfig: {
        clientId: "test-client-id",
        clientSecret: "test-client-secret",
        batchSize: 50,
        includeStudioExtensions: "true",
      },
    };
  });

  describe("authenticate", () => {
    it("authenticates successfully with valid credentials", async () => {
      adapter = new OpenSppV2SyncAdapter(eventStore, eventApplierService, config);
      const result = await adapter.authenticate();
      expect(result).toBe(true);
      expect(mockV2ClientImplementation.authenticate).toHaveBeenCalled();
    });

    it("returns false on authentication failure", async () => {
      mockV2ClientImplementation.authenticate.mockRejectedValueOnce(new Error("Auth failed"));
      adapter = new OpenSppV2SyncAdapter(eventStore, eventApplierService, config);
      const result = await adapter.authenticate();
      expect(result).toBe(false);
    });
  });

  describe("pushData - individuals", () => {
    it("creates new individuals with type discriminator", async () => {
      const entityPair: EntityPair = {
        guid: "individual-1",
        initial: {
          id: "entity-1",
          guid: "individual-1",
          type: EntityType.Individual,
          version: 1,
          data: {
            entityName: "individual",
            firstName: "Jane",
            lastName: "Doe",
            gender: "female",
            dateOfBirth: "1999-01-01",
          },
          lastUpdated: "2024-01-01T12:00:00.000Z",
        },
        modified: {
          id: "entity-1",
          guid: "individual-1",
          type: EntityType.Individual,
          version: 1,
          data: {
            entityName: "individual",
            firstName: "Jane",
            lastName: "Doe",
            gender: "female",
            dateOfBirth: "1999-01-01",
          },
          lastUpdated: "2024-01-01T12:00:00.000Z",
        },
      };

      const mockEntityStore = {
        getAllEntities: jest.fn().mockResolvedValue([entityPair]),
        getModifiedEntitiesSince: jest.fn().mockResolvedValue([entityPair]),
        getEntity: jest.fn().mockResolvedValue(entityPair),
        getEntityByExternalId: jest.fn().mockResolvedValue(null),
        saveEntity: jest.fn(),
      };
      eventApplierService.getEntityStore = jest.fn().mockReturnValue(mockEntityStore);

      adapter = new OpenSppV2SyncAdapter(eventStore, eventApplierService, config);
      const result = await adapter.pushData();
      expect(result).toEqual({ pushed: 1, failed: 0, skipped: 0, errors: [] });

      expect(mockEntityStore.getModifiedEntitiesSince).toHaveBeenCalled();
      expect(mockV2ClientImplementation.createIndividual).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "Individual",
          identifier: expect.arrayContaining([
            expect.objectContaining({
              system: "urn:openspp:vocab:id-type#system_id",
              value: "individual-1",
            }),
          ]),
          name: expect.objectContaining({
            given: "Jane",
            family: "Doe",
          }),
        }),
      );
    });

    it("uses PATCH for existing individuals with externalId", async () => {
      const entityPair: EntityPair = {
        guid: "individual-1",
        initial: {
          id: "entity-1",
          guid: "individual-1",
          type: EntityType.Individual,
          version: 1,
          externalId: "individual-1",
          data: { entityName: "individual", firstName: "Jane", lastName: "Doe", externalId: "individual-1" },
          lastUpdated: "2024-01-01T12:00:00.000Z",
        },
        modified: {
          id: "entity-1",
          guid: "individual-1",
          type: EntityType.Individual,
          version: 2,
          externalId: "individual-1",
          data: { entityName: "individual", firstName: "Jane", lastName: "Smith", externalId: "individual-1" },
          lastUpdated: "2024-01-02T12:00:00.000Z",
        },
      };

      const mockEntityStore = {
        getAllEntities: jest.fn().mockResolvedValue([entityPair]),
        getModifiedEntitiesSince: jest.fn().mockResolvedValue([entityPair]),
        getEntity: jest.fn().mockResolvedValue(entityPair),
        getEntityByExternalId: jest.fn().mockResolvedValue(entityPair),
        saveEntity: jest.fn(),
      };
      eventApplierService.getEntityStore = jest.fn().mockReturnValue(mockEntityStore);

      adapter = new OpenSppV2SyncAdapter(eventStore, eventApplierService, config);
      const result = await adapter.pushData();
      expect(result).toEqual({ pushed: 1, failed: 0, skipped: 0, errors: [] });

      expect(mockV2ClientImplementation.getIndividual).toHaveBeenCalledWith(
        "urn:openspp:vocab:id-type#system_id|individual-1",
      );
      expect(mockV2ClientImplementation.patchIndividual).toHaveBeenCalledWith(
        "urn:openspp:vocab:id-type#system_id|individual-1",
        expect.objectContaining({
          name: expect.objectContaining({ family: "Smith" }),
        }),
        undefined,
      );
      expect(mockV2ClientImplementation.createIndividual).not.toHaveBeenCalled();
    });

    it("handles empty entity list", async () => {
      const mockEntityStore = {
        getAllEntities: jest.fn().mockResolvedValue([]),
        getModifiedEntitiesSince: jest.fn().mockResolvedValue([]),
        getEntity: jest.fn().mockResolvedValue(null),
        getEntityByExternalId: jest.fn().mockResolvedValue(null),
        saveEntity: jest.fn(),
      };
      eventApplierService.getEntityStore = jest.fn().mockReturnValue(mockEntityStore);

      adapter = new OpenSppV2SyncAdapter(eventStore, eventApplierService, config);
      const result = await adapter.pushData();
      expect(result).toEqual({ pushed: 0, failed: 0, skipped: 0, errors: [] });

      expect(mockV2ClientImplementation.createIndividual).not.toHaveBeenCalled();
      expect(mockV2ClientImplementation.patchIndividual).not.toHaveBeenCalled();
    });

    it("only pushes locally-modified entities (delta push)", async () => {
      const unchangedPair: EntityPair = {
        guid: "ind-old-1",
        initial: {
          id: "e-old", guid: "ind-old-1", type: EntityType.Individual, version: 1,
          data: { entityName: "individual", firstName: "Unchanged", lastName: "Person" },
          lastUpdated: "2024-01-01T12:00:00.000Z",
        },
        modified: {
          id: "e-old", guid: "ind-old-1", type: EntityType.Individual, version: 1,
          data: { entityName: "individual", firstName: "Unchanged", lastName: "Person" },
          lastUpdated: "2024-01-01T12:00:00.000Z",
        },
      };

      const modifiedPair: EntityPair = {
        guid: "ind-new-1",
        initial: {
          id: "e-new", guid: "ind-new-1", type: EntityType.Individual, version: 1,
          data: { entityName: "individual", firstName: "Modified", lastName: "Person" },
          lastUpdated: "2024-06-01T12:00:00.000Z",
        },
        modified: {
          id: "e-new", guid: "ind-new-1", type: EntityType.Individual, version: 2,
          data: { entityName: "individual", firstName: "Modified", lastName: "Person" },
          lastUpdated: "2024-06-02T12:00:00.000Z",
        },
      };

      const lastPushTimestamp = "2024-05-01T00:00:00.000Z";
      eventStore.getLastPushExternalSyncTimestamp.mockResolvedValue(lastPushTimestamp);

      const mockEntityStore = {
        getAllEntities: jest.fn().mockResolvedValue([unchangedPair, modifiedPair]),
        getModifiedEntitiesSince: jest.fn().mockResolvedValue([modifiedPair]),
        getEntity: jest.fn().mockResolvedValue(modifiedPair),
        getEntityByExternalId: jest.fn().mockResolvedValue(null),
        saveEntity: jest.fn(),
      };
      eventApplierService.getEntityStore = jest.fn().mockReturnValue(mockEntityStore);

      adapter = new OpenSppV2SyncAdapter(eventStore, eventApplierService, config);
      const result = await adapter.pushData();

      expect(result).toEqual({ pushed: 1, failed: 0, skipped: 0, errors: [] });
      expect(mockEntityStore.getModifiedEntitiesSince).toHaveBeenCalledWith(lastPushTimestamp);
      expect(mockEntityStore.getAllEntities).not.toHaveBeenCalled();
      expect(mockV2ClientImplementation.createIndividual).toHaveBeenCalledTimes(1);
      expect(mockV2ClientImplementation.createIndividual).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "Individual",
          identifier: expect.arrayContaining([
            expect.objectContaining({ value: "ind-new-1" }),
          ]),
        }),
      );
      expect(eventStore.setLastPushExternalSyncTimestamp).toHaveBeenCalled();
    });
  });

  describe("pushData - groups", () => {
    it("creates new groups with type and groupType", async () => {
      const groupPair: EntityPair = {
        guid: "group-1",
        initial: {
          id: "entity-g1",
          guid: "group-1",
          type: EntityType.Group,
          version: 1,
          data: { entityName: "group", name: "Santos Household", groupType: "household" },
          lastUpdated: "2024-01-01T12:00:00.000Z",
        },
        modified: {
          id: "entity-g1",
          guid: "group-1",
          type: EntityType.Group,
          version: 1,
          data: { entityName: "group", name: "Santos Household", groupType: "household" },
          lastUpdated: "2024-01-01T12:00:00.000Z",
        },
      };

      const mockEntityStore = {
        getAllEntities: jest.fn().mockResolvedValue([groupPair]),
        getModifiedEntitiesSince: jest.fn().mockResolvedValue([groupPair]),
        getEntity: jest.fn().mockResolvedValue(groupPair),
        getEntityByExternalId: jest.fn().mockResolvedValue(null),
        saveEntity: jest.fn(),
      };
      eventApplierService.getEntityStore = jest.fn().mockReturnValue(mockEntityStore);

      adapter = new OpenSppV2SyncAdapter(eventStore, eventApplierService, config);
      const result = await adapter.pushData();
      expect(result).toEqual({ pushed: 1, failed: 0, skipped: 0, errors: [] });

      expect(mockV2ClientImplementation.createGroup).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "Group",
          groupType: "household",
          name: "Santos Household",
        }),
      );
    });

    it("uses PATCH for existing groups with externalId", async () => {
      const groupPair: EntityPair = {
        guid: "group-1",
        initial: {
          id: "entity-g1",
          guid: "group-1",
          type: EntityType.Group,
          version: 1,
          externalId: "group-1",
          data: { entityName: "group", name: "Old Name", externalId: "group-1" },
          lastUpdated: "2024-01-01T12:00:00.000Z",
        },
        modified: {
          id: "entity-g1",
          guid: "group-1",
          type: EntityType.Group,
          version: 2,
          externalId: "group-1",
          data: { entityName: "group", name: "New Name", externalId: "group-1" },
          lastUpdated: "2024-01-02T12:00:00.000Z",
        },
      };

      const mockEntityStore = {
        getAllEntities: jest.fn().mockResolvedValue([groupPair]),
        getModifiedEntitiesSince: jest.fn().mockResolvedValue([groupPair]),
        getEntity: jest.fn().mockResolvedValue(groupPair),
        getEntityByExternalId: jest.fn().mockResolvedValue(groupPair),
        saveEntity: jest.fn(),
      };
      eventApplierService.getEntityStore = jest.fn().mockReturnValue(mockEntityStore);

      adapter = new OpenSppV2SyncAdapter(eventStore, eventApplierService, config);
      const result = await adapter.pushData();
      expect(result).toEqual({ pushed: 1, failed: 0, skipped: 0, errors: [] });

      expect(mockV2ClientImplementation.getGroup).toHaveBeenCalledWith(
        "urn:openspp:vocab:id-type#system_id|group-1",
      );
      expect(mockV2ClientImplementation.patchGroup).toHaveBeenCalledWith(
        "urn:openspp:vocab:id-type#system_id|group-1",
        expect.objectContaining({ name: "New Name" }),
        undefined,
      );
    });
  });

  describe("pullData - individuals", () => {
    it("pulls individuals using SearchResult format", async () => {
      const mockSearchResult: SearchResult<IndividualResource> = {
        data: [
          {
            type: "Individual",
            identifier: [{ system: "urn:openspp:vocab:id-type#national_id", value: "pulled-individual-1" }],
            name: { given: "John", family: "Doe", text: "Doe, John" },
            birthDate: "1990-05-15",
            gender: { coding: [{ system: "urn:iso:std:iso:5218", code: "1", display: "Male" }] },
          },
        ],
        meta: { total: 1, count: 1, offset: 0 },
        links: { self: "/api/v2/spp/Individual?_count=100&_offset=0" },
      };

      mockV2ClientImplementation.searchIndividuals.mockResolvedValueOnce(mockSearchResult);
      mockV2ClientImplementation.searchIndividuals.mockResolvedValueOnce({
        data: [],
        meta: { total: 1, count: 0, offset: 1 },
        links: { self: "/api/v2/spp/Individual?_count=100&_offset=1" },
      });

      adapter = new OpenSppV2SyncAdapter(eventStore, eventApplierService, config);
      await adapter.pullData();

      expect(mockV2ClientImplementation.searchIndividuals).toHaveBeenCalled();
      expect(eventApplierService.submitForm).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "create-individual",
          data: expect.objectContaining({
            firstName: "John",
            lastName: "Doe",
            dateOfBirth: "1990-05-15",
            gender: "male",
          }),
        }),
      );
    });

    it("updates existing entities during pull", async () => {
      const existingEntityPair: EntityPair = {
        guid: "existing-guid",
        initial: {
          id: "entity-1",
          guid: "existing-guid",
          type: EntityType.Individual,
          version: 1,
          externalId: "pulled-individual-1",
          data: {},
          lastUpdated: "2024-01-01T00:00:00.000Z",
        },
        modified: {
          id: "entity-1",
          guid: "existing-guid",
          type: EntityType.Individual,
          version: 1,
          externalId: "pulled-individual-1",
          data: {},
          lastUpdated: "2024-01-01T00:00:00.000Z",
        },
      };

      const mockEntityStore = {
        getAllEntities: jest.fn().mockResolvedValue([]),
        getModifiedEntitiesSince: jest.fn().mockResolvedValue([]),
        getEntity: jest.fn().mockResolvedValue(existingEntityPair),
        getEntityByExternalId: jest.fn().mockResolvedValue(existingEntityPair),
        saveEntity: jest.fn(),
      };
      eventApplierService.getEntityStore = jest.fn().mockReturnValue(mockEntityStore);

      mockV2ClientImplementation.searchIndividuals.mockReset();
      mockV2ClientImplementation.searchIndividuals.mockResolvedValueOnce({
        data: [{
          type: "Individual",
          identifier: [{ system: "urn:openspp:vocab:id-type#national_id", value: "pulled-individual-1" }],
          name: { given: "Updated", family: "Name" },
        }],
        meta: { total: 1, count: 1, offset: 0 },
        links: { self: "/api/v2/spp/Individual" },
      } as SearchResult<IndividualResource>);
      mockV2ClientImplementation.searchIndividuals.mockResolvedValueOnce({
        data: [],
        meta: { total: 1, count: 0, offset: 1 },
        links: { self: "/api/v2/spp/Individual" },
      });
      mockV2ClientImplementation.searchGroups.mockReset();
      mockV2ClientImplementation.searchGroups.mockResolvedValue({
        data: [],
        meta: { total: 0, count: 0, offset: 0 },
        links: { self: "/api/v2/spp/Group" },
      });

      adapter = new OpenSppV2SyncAdapter(eventStore, eventApplierService, config);
      await adapter.pullData();

      expect(eventApplierService.submitForm).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "update-individual",
          entityGuid: "existing-guid",
        }),
      );
    });

    it("handles empty search results", async () => {
      mockV2ClientImplementation.searchIndividuals.mockReset();
      mockV2ClientImplementation.searchIndividuals.mockResolvedValue({
        data: [],
        meta: { total: 0, count: 0, offset: 0 },
        links: { self: "/api/v2/spp/Individual" },
      });
      mockV2ClientImplementation.searchGroups.mockReset();
      mockV2ClientImplementation.searchGroups.mockResolvedValue({
        data: [],
        meta: { total: 0, count: 0, offset: 0 },
        links: { self: "/api/v2/spp/Group" },
      });

      const freshMockEntityStore = {
        getAllEntities: jest.fn().mockResolvedValue([]),
        getModifiedEntitiesSince: jest.fn().mockResolvedValue([]),
        getEntity: jest.fn().mockResolvedValue(null),
        getEntityByExternalId: jest.fn().mockResolvedValue(null),
        saveEntity: jest.fn(),
      };
      const freshEventApplierService = {
        submitForm: jest.fn(),
        getEntityStore: jest.fn().mockReturnValue(freshMockEntityStore),
      } as unknown as jest.Mocked<EventApplierService>;

      adapter = new OpenSppV2SyncAdapter(eventStore, freshEventApplierService, config);
      await adapter.pullData();

      expect(freshEventApplierService.submitForm).not.toHaveBeenCalled();
    });

    it("pulls individuals with non-matching identifier system", async () => {
      mockV2ClientImplementation.searchIndividuals.mockReset();
      mockV2ClientImplementation.searchIndividuals.mockResolvedValueOnce({
        data: [{
          type: "Individual",
          identifier: [{ system: "urn:other:system", value: "foreign-id-1" }],
          name: { given: "Maria", family: "Santos" },
        }],
        meta: { total: 1, count: 1, offset: 0 },
        links: { self: "/api/v2/spp/Individual" },
      } as SearchResult<IndividualResource>);
      mockV2ClientImplementation.searchIndividuals.mockResolvedValueOnce({
        data: [],
        meta: { total: 1, count: 0, offset: 1 },
        links: { self: "/api/v2/spp/Individual" },
      });
      mockV2ClientImplementation.searchGroups.mockReset();
      mockV2ClientImplementation.searchGroups.mockResolvedValue({
        data: [],
        meta: { total: 0, count: 0, offset: 0 },
        links: { self: "/api/v2/spp/Group" },
      });

      adapter = new OpenSppV2SyncAdapter(eventStore, eventApplierService, config);
      const result = await adapter.pullData();

      expect(result.pulled).toBe(1);
      expect(result.skipped).toBe(0);
      expect(eventApplierService.submitForm).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "create-individual",
          data: expect.objectContaining({
            firstName: "Maria",
            lastName: "Santos",
          }),
        }),
      );
    });

    it("pulls individuals with no identifiers at all", async () => {
      mockV2ClientImplementation.searchIndividuals.mockReset();
      mockV2ClientImplementation.searchIndividuals.mockResolvedValueOnce({
        data: [{
          type: "Individual",
          identifier: [],
          name: { given: "Ghost", family: "NoId" },
        }],
        meta: { total: 1, count: 1, offset: 0 },
        links: { self: "/api/v2/spp/Individual" },
      } as SearchResult<IndividualResource>);
      mockV2ClientImplementation.searchIndividuals.mockResolvedValueOnce({
        data: [],
        meta: { total: 1, count: 0, offset: 1 },
        links: { self: "/api/v2/spp/Individual" },
      });
      mockV2ClientImplementation.searchGroups.mockReset();
      mockV2ClientImplementation.searchGroups.mockResolvedValue({
        data: [],
        meta: { total: 0, count: 0, offset: 0 },
        links: { self: "/api/v2/spp/Group" },
      });

      adapter = new OpenSppV2SyncAdapter(eventStore, eventApplierService, config);
      const result = await adapter.pullData();

      expect(result.pulled).toBe(0);
      expect(result.skipped).toBe(1);
      expect(eventApplierService.submitForm).not.toHaveBeenCalled();
    });
  });

  describe("pullData - groups", () => {
    it("pulls groups using SearchResult format", async () => {
      mockV2ClientImplementation.searchIndividuals.mockReset();
      mockV2ClientImplementation.searchIndividuals.mockResolvedValue({
        data: [],
        meta: { total: 0, count: 0, offset: 0 },
        links: { self: "/api/v2/spp/Individual" },
      });

      const mockGroupResult: SearchResult<GroupResource> = {
        data: [
          {
            type: "Group",
            identifier: [{ system: "urn:openspp:vocab:id-type#national_id", value: "pulled-group-1" }],
            groupType: "household",
            name: "Santos Household",
          },
        ],
        meta: { total: 1, count: 1, offset: 0 },
        links: { self: "/api/v2/spp/Group" },
      };

      mockV2ClientImplementation.searchGroups.mockReset();
      mockV2ClientImplementation.searchGroups.mockResolvedValueOnce(mockGroupResult);
      mockV2ClientImplementation.searchGroups.mockResolvedValueOnce({
        data: [],
        meta: { total: 1, count: 0, offset: 1 },
        links: { self: "/api/v2/spp/Group" },
      });

      adapter = new OpenSppV2SyncAdapter(eventStore, eventApplierService, config);
      await adapter.pullData();

      expect(eventApplierService.submitForm).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "create-group",
          data: expect.objectContaining({
            entityName: "group",
            name: "Santos Household",
            groupType: "household",
          }),
        }),
      );
    });
  });

  describe("pull timestamp preservation", () => {
    it("uses source meta.lastUpdated for pulled individuals", async () => {
      const sourceTimestamp = "2024-06-15T10:30:00.000Z";
      mockV2ClientImplementation.searchIndividuals.mockReset();
      mockV2ClientImplementation.searchIndividuals.mockResolvedValueOnce({
        data: [{
          type: "Individual",
          identifier: [{ system: "urn:openspp:vocab:id-type#national_id", value: "ts-ind-1" }],
          name: { given: "Alice", family: "Test" },
          meta: { lastUpdated: sourceTimestamp, versionId: "v1" },
        }],
        meta: { total: 1, count: 1, offset: 0 },
        links: { self: "/api/v2/spp/Individual" },
      } as SearchResult<IndividualResource>);
      mockV2ClientImplementation.searchIndividuals.mockResolvedValueOnce({
        data: [], meta: { total: 1, count: 0, offset: 1 }, links: { self: "" },
      });
      mockV2ClientImplementation.searchGroups.mockReset();
      mockV2ClientImplementation.searchGroups.mockResolvedValue({
        data: [], meta: { total: 0, count: 0, offset: 0 }, links: { self: "" },
      });

      adapter = new OpenSppV2SyncAdapter(eventStore, eventApplierService, config);
      await adapter.pullData();

      expect(eventApplierService.submitForm).toHaveBeenCalledWith(
        expect.objectContaining({ timestamp: sourceTimestamp }),
      );
    });

    it("uses source meta.lastUpdated for pulled groups", async () => {
      const sourceTimestamp = "2024-07-20T14:00:00.000Z";
      mockV2ClientImplementation.searchIndividuals.mockReset();
      mockV2ClientImplementation.searchIndividuals.mockResolvedValue({
        data: [], meta: { total: 0, count: 0, offset: 0 }, links: { self: "" },
      });
      mockV2ClientImplementation.searchGroups.mockReset();
      mockV2ClientImplementation.searchGroups.mockResolvedValueOnce({
        data: [{
          type: "Group",
          identifier: [{ system: "urn:openspp:vocab:id-type#national_id", value: "ts-grp-1" }],
          name: "Test Group",
          meta: { lastUpdated: sourceTimestamp, versionId: "v2" },
        }],
        meta: { total: 1, count: 1, offset: 0 },
        links: { self: "/api/v2/spp/Group" },
      } as SearchResult<GroupResource>);
      mockV2ClientImplementation.searchGroups.mockResolvedValueOnce({
        data: [], meta: { total: 1, count: 0, offset: 1 }, links: { self: "" },
      });

      adapter = new OpenSppV2SyncAdapter(eventStore, eventApplierService, config);
      await adapter.pullData();

      expect(eventApplierService.submitForm).toHaveBeenCalledWith(
        expect.objectContaining({ timestamp: sourceTimestamp }),
      );
    });

    it("falls back to current time when meta.lastUpdated is absent", async () => {
      const before = new Date().toISOString();
      mockV2ClientImplementation.searchIndividuals.mockReset();
      mockV2ClientImplementation.searchIndividuals.mockResolvedValueOnce({
        data: [{
          type: "Individual",
          identifier: [{ system: "urn:openspp:vocab:id-type#national_id", value: "no-meta-1" }],
          name: { given: "Bob", family: "NoMeta" },
        }],
        meta: { total: 1, count: 1, offset: 0 },
        links: { self: "/api/v2/spp/Individual" },
      } as SearchResult<IndividualResource>);
      mockV2ClientImplementation.searchIndividuals.mockResolvedValueOnce({
        data: [], meta: { total: 1, count: 0, offset: 1 }, links: { self: "" },
      });
      mockV2ClientImplementation.searchGroups.mockReset();
      mockV2ClientImplementation.searchGroups.mockResolvedValue({
        data: [], meta: { total: 0, count: 0, offset: 0 }, links: { self: "" },
      });

      adapter = new OpenSppV2SyncAdapter(eventStore, eventApplierService, config);
      await adapter.pullData();

      const call = eventApplierService.submitForm.mock.calls[0][0];
      const after = new Date().toISOString();
      expect(call.timestamp >= before).toBe(true);
      expect(call.timestamp <= after).toBe(true);
    });
  });

  describe("push optimistic locking", () => {
    it("passes versionId to patchIndividual", async () => {
      const entityPair: EntityPair = {
        guid: "ind-lock-1",
        initial: {
          id: "e1", guid: "ind-lock-1", type: EntityType.Individual, version: 1,
          externalId: "ind-lock-1",
          data: { entityName: "individual", firstName: "Jane", externalId: "ind-lock-1" },
          lastUpdated: "2024-01-01T12:00:00.000Z",
        },
        modified: {
          id: "e1", guid: "ind-lock-1", type: EntityType.Individual, version: 2,
          externalId: "ind-lock-1",
          data: { entityName: "individual", firstName: "Janet", externalId: "ind-lock-1" },
          lastUpdated: "2024-01-02T12:00:00.000Z",
        },
      };

      const mockEntityStore = {
        getAllEntities: jest.fn().mockResolvedValue([entityPair]),
        getModifiedEntitiesSince: jest.fn().mockResolvedValue([entityPair]),
        getEntity: jest.fn().mockResolvedValue(entityPair),
        getEntityByExternalId: jest.fn().mockResolvedValue(entityPair),
        saveEntity: jest.fn(),
      };
      eventApplierService.getEntityStore = jest.fn().mockReturnValue(mockEntityStore);

      mockV2ClientImplementation.getIndividual.mockResolvedValueOnce({
        type: "Individual",
        identifier: [{ system: "urn:openspp:vocab:id-type#national_id", value: "ind-lock-1" }],
        meta: { versionId: "abc-123" },
      });

      adapter = new OpenSppV2SyncAdapter(eventStore, eventApplierService, config);
      await adapter.pushData();

      expect(mockV2ClientImplementation.patchIndividual).toHaveBeenCalledWith(
        "urn:openspp:vocab:id-type#system_id|ind-lock-1",
        expect.any(Object),
        "abc-123",
      );
    });

    it("passes versionId to patchGroup", async () => {
      const groupPair: EntityPair = {
        guid: "grp-lock-1",
        initial: {
          id: "g1", guid: "grp-lock-1", type: EntityType.Group, version: 1,
          externalId: "grp-lock-1",
          data: { entityName: "group", name: "Old", externalId: "grp-lock-1" },
          lastUpdated: "2024-01-01T12:00:00.000Z",
        },
        modified: {
          id: "g1", guid: "grp-lock-1", type: EntityType.Group, version: 2,
          externalId: "grp-lock-1",
          data: { entityName: "group", name: "New", externalId: "grp-lock-1" },
          lastUpdated: "2024-01-02T12:00:00.000Z",
        },
      };

      const mockEntityStore = {
        getAllEntities: jest.fn().mockResolvedValue([groupPair]),
        getModifiedEntitiesSince: jest.fn().mockResolvedValue([groupPair]),
        getEntity: jest.fn().mockResolvedValue(groupPair),
        getEntityByExternalId: jest.fn().mockResolvedValue(groupPair),
        saveEntity: jest.fn(),
      };
      eventApplierService.getEntityStore = jest.fn().mockReturnValue(mockEntityStore);

      mockV2ClientImplementation.getGroup.mockResolvedValueOnce({
        type: "Group",
        identifier: [{ system: "urn:openspp:vocab:id-type#national_id", value: "grp-lock-1" }],
        meta: { versionId: "def-456" },
      });

      adapter = new OpenSppV2SyncAdapter(eventStore, eventApplierService, config);
      await adapter.pushData();

      expect(mockV2ClientImplementation.patchGroup).toHaveBeenCalledWith(
        "urn:openspp:vocab:id-type#system_id|grp-lock-1",
        expect.any(Object),
        "def-456",
      );
    });

    it("skips entity on 412 Precondition Failed without retrying", async () => {
      const entityPair: EntityPair = {
        guid: "ind-412-1",
        initial: {
          id: "e1", guid: "ind-412-1", type: EntityType.Individual, version: 1,
          externalId: "ind-412-1",
          data: { entityName: "individual", firstName: "Stale", externalId: "ind-412-1" },
          lastUpdated: "2024-01-01T12:00:00.000Z",
        },
        modified: {
          id: "e1", guid: "ind-412-1", type: EntityType.Individual, version: 2,
          externalId: "ind-412-1",
          data: { entityName: "individual", firstName: "Stale", externalId: "ind-412-1" },
          lastUpdated: "2024-01-02T12:00:00.000Z",
        },
      };

      const mockEntityStore = {
        getAllEntities: jest.fn().mockResolvedValue([entityPair]),
        getModifiedEntitiesSince: jest.fn().mockResolvedValue([entityPair]),
        getEntity: jest.fn().mockResolvedValue(entityPair),
        getEntityByExternalId: jest.fn().mockResolvedValue(entityPair),
        saveEntity: jest.fn(),
      };
      eventApplierService.getEntityStore = jest.fn().mockReturnValue(mockEntityStore);

      mockV2ClientImplementation.getIndividual.mockResolvedValueOnce({
        type: "Individual",
        identifier: [{ system: "urn:openspp:vocab:id-type#national_id", value: "ind-412-1" }],
        meta: { versionId: "old-version" },
      });
      mockV2ClientImplementation.patchIndividual.mockRejectedValueOnce(
        new PreconditionFailedError("Resource was modified since last read"),
      );

      adapter = new OpenSppV2SyncAdapter(eventStore, eventApplierService, config);
      const result = await adapter.pushData();

      expect(result).toEqual(expect.objectContaining({
        pushed: 0,
        failed: 0,
        skipped: 1,
      }));
      expect(mockV2ClientImplementation.patchIndividual).toHaveBeenCalledTimes(1);
    });

    it("handles null versionId gracefully", async () => {
      const entityPair: EntityPair = {
        guid: "ind-nometa-1",
        initial: {
          id: "e1", guid: "ind-nometa-1", type: EntityType.Individual, version: 1,
          externalId: "ind-nometa-1",
          data: { entityName: "individual", firstName: "Jane", externalId: "ind-nometa-1" },
          lastUpdated: "2024-01-01T12:00:00.000Z",
        },
        modified: {
          id: "e1", guid: "ind-nometa-1", type: EntityType.Individual, version: 2,
          externalId: "ind-nometa-1",
          data: { entityName: "individual", firstName: "Janet", externalId: "ind-nometa-1" },
          lastUpdated: "2024-01-02T12:00:00.000Z",
        },
      };

      const mockEntityStore = {
        getAllEntities: jest.fn().mockResolvedValue([entityPair]),
        getModifiedEntitiesSince: jest.fn().mockResolvedValue([entityPair]),
        getEntity: jest.fn().mockResolvedValue(entityPair),
        getEntityByExternalId: jest.fn().mockResolvedValue(entityPair),
        saveEntity: jest.fn(),
      };
      eventApplierService.getEntityStore = jest.fn().mockReturnValue(mockEntityStore);

      mockV2ClientImplementation.getIndividual.mockResolvedValueOnce({
        type: "Individual",
        identifier: [{ system: "urn:openspp:vocab:id-type#national_id", value: "ind-nometa-1" }],
      });

      adapter = new OpenSppV2SyncAdapter(eventStore, eventApplierService, config);
      const result = await adapter.pushData();

      expect(result).toEqual(expect.objectContaining({ pushed: 1, failed: 0, skipped: 0 }));
      expect(mockV2ClientImplementation.patchIndividual).toHaveBeenCalledWith(
        "urn:openspp:vocab:id-type#system_id|ind-nometa-1",
        expect.any(Object),
        undefined,
      );
    });
  });

  describe("configuration", () => {
    it("uses adapterConfig values", async () => {
      const customConfig: ExternalSyncConfig = {
        type: "openspp-v2-adapter",
        url: "http://custom.openspp.com",
        adapterConfig: {
          clientId: "custom-client",
          clientSecret: "custom-secret",
          batchSize: 100,
          includeStudioExtensions: "false",
        },
      };

      adapter = new OpenSppV2SyncAdapter(eventStore, eventApplierService, customConfig);
      await adapter.authenticate();
      expect(mockV2ClientImplementation.authenticate).toHaveBeenCalled();
    });

    it("falls back to extraFields for legacy config", async () => {
      const legacyConfig: ExternalSyncConfig = {
        type: "openspp-v2-adapter",
        url: "http://legacy.openspp.com",
        extraFields: [
          { name: "clientId", value: "legacy-client" },
          { name: "clientSecret", value: "legacy-secret" },
        ],
      };

      adapter = new OpenSppV2SyncAdapter(eventStore, eventApplierService, legacyConfig);
      await adapter.authenticate();
      expect(mockV2ClientImplementation.authenticate).toHaveBeenCalled();
    });
  });
});
