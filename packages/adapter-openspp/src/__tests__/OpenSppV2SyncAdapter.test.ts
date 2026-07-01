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
  createChangeRequest: jest.fn().mockResolvedValue({ id: "cr-1", status: "pending" }),
  getChangeRequest: jest.fn().mockResolvedValue(null),
};

jest.mock("../v2/OpenSppV2Client", () => {
  const actual = jest.requireActual("../v2/OpenSppV2Client");
  return {
    __esModule: true,
    OpenSppV2Client: jest.fn().mockImplementation(() => mockV2ClientImplementation),
    default: jest.fn().mockImplementation(() => mockV2ClientImplementation),
    PreconditionFailedError: actual.PreconditionFailedError,
    ConflictError: actual.ConflictError,
    ChangeRequestRevisionNeededError: actual.ChangeRequestRevisionNeededError,
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
      getMetadataValue: jest.fn().mockResolvedValue(null),
      setMetadataValue: jest.fn(),
      deleteMetadataValue: jest.fn(),
      listMetadataKeys: jest.fn().mockResolvedValue([]),
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

      // Adapter probes GET first to fetch current versionId for optimistic
      // locking; only PATCHes when the remote actually exists. A null GET
      // sends the push down the discovery-then-POST recovery path.
      mockV2ClientImplementation.getIndividual.mockResolvedValueOnce({
        type: "Individual",
        identifier: [{ system: "urn:openspp:vocab:id-type#system_id", value: "individual-1" }],
        meta: { versionId: "remote-version-1" },
      });

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
        "remote-version-1",
      );
      expect(mockV2ClientImplementation.createIndividual).not.toHaveBeenCalled();
    });

    it("does not discover/patch a record via a client-supplied identifier (H1/H2/H3)", async () => {
      // Entity carries a server-set externalId that no longer resolves on
      // OpenSPP, plus an attacker-controlled national_id pointing at a victim.
      const entityPair: EntityPair = {
        guid: "attacker-1",
        initial: {
          id: "e-att", guid: "attacker-1", type: EntityType.Individual, version: 1,
          externalId: "stale-ext",
          data: { entityName: "individual", firstName: "Mal", lastName: "Lory", externalId: "stale-ext" },
          lastUpdated: "2024-01-01T12:00:00.000Z",
        },
        modified: {
          id: "e-att", guid: "attacker-1", type: EntityType.Individual, version: 2,
          externalId: "stale-ext",
          data: {
            entityName: "individual", firstName: "Mal", lastName: "Lory", externalId: "stale-ext",
            national_id: "VICTIM-NID", uin: "VICTIM-NID",
          },
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

      // The victim resolves ONLY if queried by the client-supplied identifier.
      // The stale externalId resolves to nothing.
      mockV2ClientImplementation.getIndividual.mockImplementation(async (id: string) => {
        if (id.includes("VICTIM-NID")) {
          return {
            type: "Individual",
            identifier: [{ system: "urn:openspp:vocab:id-type#national_id", value: "VICTIM-NID" }],
            meta: { versionId: "victim-version" },
          } as IndividualResource;
        }
        return null;
      });

      adapter = new OpenSppV2SyncAdapter(eventStore, eventApplierService, config);
      await adapter.pushData();

      // Discovery must never probe the victim's client-supplied identifier...
      const queried = mockV2ClientImplementation.getIndividual.mock.calls.map((c) => c[0] as string);
      expect(queried.some((id) => id.includes("VICTIM-NID"))).toBe(false);
      // ...so the victim is never PATCHed; the entity is POSTed as new instead.
      expect(mockV2ClientImplementation.patchIndividual).not.toHaveBeenCalled();
      expect(mockV2ClientImplementation.createIndividual).toHaveBeenCalled();
    });

    it("pushes back under the preserved identifierType, not the default system (H10 cycle 2)", async () => {
      const entityPair: EntityPair = {
        guid: "ind-h10",
        initial: {
          id: "e", guid: "ind-h10", type: EntityType.Individual, version: 1, externalId: "PH-123",
          data: { entityName: "individual", firstName: "Ana", lastName: "Cruz", externalId: "PH-123", identifierType: "national_id" },
          lastUpdated: "2024-01-01T12:00:00.000Z",
        },
        modified: {
          id: "e", guid: "ind-h10", type: EntityType.Individual, version: 2, externalId: "PH-123",
          data: { entityName: "individual", firstName: "Ana", lastName: "Cruz", externalId: "PH-123", identifierType: "national_id" },
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
      mockV2ClientImplementation.getIndividual.mockResolvedValue({
        type: "Individual",
        identifier: [{ system: "urn:openspp:vocab:id-type#national_id", value: "PH-123" }],
        meta: { versionId: "v9" },
      });

      adapter = new OpenSppV2SyncAdapter(eventStore, eventApplierService, config);
      const result = await adapter.pushData();

      expect(result.failed).toBe(0);
      expect(mockV2ClientImplementation.patchIndividual).toHaveBeenCalledWith(
        "urn:openspp:vocab:id-type#national_id|PH-123",
        expect.anything(),
        "v9",
      );
    });

    it("tolerates a non-string identifierType without failing the push (H22)", async () => {
      const entityPair: EntityPair = {
        guid: "ind-h22",
        initial: {
          id: "e", guid: "ind-h22", type: EntityType.Individual, version: 1, externalId: "ind-h22",
          data: { entityName: "individual", firstName: "Sam", lastName: "Ng", externalId: "ind-h22" },
          lastUpdated: "2024-01-01T12:00:00.000Z",
        },
        modified: {
          id: "e", guid: "ind-h22", type: EntityType.Individual, version: 2, externalId: "ind-h22",
          data: {
            entityName: "individual", firstName: "Sam", lastName: "Ng", externalId: "ind-h22",
            identifierType: { malicious: true } as unknown as string,
          },
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
      mockV2ClientImplementation.getIndividual.mockResolvedValue({
        type: "Individual",
        identifier: [{ system: "urn:openspp:vocab:id-type#system_id", value: "ind-h22" }],
        meta: { versionId: "v1" },
      });

      adapter = new OpenSppV2SyncAdapter(eventStore, eventApplierService, config);
      const result = await adapter.pushData();

      expect(result.failed).toBe(0);
      // Falls back to the configured default system, not the bogus identifierType.
      expect(mockV2ClientImplementation.patchIndividual).toHaveBeenCalledWith(
        "urn:openspp:vocab:id-type#system_id|ind-h22",
        expect.anything(),
        "v1",
      );
    });

    it("pushes enrolments only, without re-patching a baseline-parity entity (H4)", async () => {
      // initial.version === modified.version (no genuine local entity edit), but
      // the entity carries client-controllable pendingProgramEnrolments.
      const entityPair: EntityPair = {
        guid: "ind-enr",
        initial: {
          id: "e", guid: "ind-enr", type: EntityType.Individual, version: 3, externalId: "ind-enr",
          data: { entityName: "individual", firstName: "Pat", lastName: "Lee", externalId: "ind-enr" },
          lastUpdated: "2024-01-01T12:00:00.000Z",
        },
        modified: {
          id: "e", guid: "ind-enr", type: EntityType.Individual, version: 3, externalId: "ind-enr",
          data: {
            entityName: "individual", firstName: "Pat", lastName: "Lee", externalId: "ind-enr",
            pendingProgramEnrolments: [{ programId: 42 }],
          },
          lastUpdated: "2024-01-01T12:00:00.000Z",
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
      await adapter.pushData();

      // The entity itself must NOT be written (no stale overwrite)...
      expect(mockV2ClientImplementation.patchIndividual).not.toHaveBeenCalled();
      expect(mockV2ClientImplementation.createIndividual).not.toHaveBeenCalled();
      // ...but the enrolment CR still flows.
      expect(mockV2ClientImplementation.createChangeRequest).toHaveBeenCalled();
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

      // GET first to fetch versionId; mock the existence so the push hits the
      // PATCH branch instead of the discovery-then-POST recovery path.
      mockV2ClientImplementation.getGroup.mockResolvedValueOnce({
        type: "Group",
        identifier: [{ system: "urn:openspp:vocab:id-type#system_id", value: "group-1" }],
        meta: { versionId: "remote-group-version-1" },
      });

      adapter = new OpenSppV2SyncAdapter(eventStore, eventApplierService, config);
      const result = await adapter.pushData();
      expect(result).toEqual({ pushed: 1, failed: 0, skipped: 0, errors: [] });

      expect(mockV2ClientImplementation.getGroup).toHaveBeenCalledWith(
        "urn:openspp:vocab:id-type#system_id|group-1",
      );
      expect(mockV2ClientImplementation.patchGroup).toHaveBeenCalledWith(
        "urn:openspp:vocab:id-type#system_id|group-1",
        expect.objectContaining({ name: "New Name" }),
        "remote-group-version-1",
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

    it("preserves the OpenSPP identifier system as identifierType on pull (H10)", async () => {
      const mockSearchResult: SearchResult<IndividualResource> = {
        data: [
          {
            type: "Individual",
            identifier: [{ system: "urn:openspp:vocab:id-type#national_id", value: "PH-123" }],
            name: { given: "Ana", family: "Cruz", text: "Cruz, Ana" },
          },
        ],
        meta: { total: 1, count: 1, offset: 0 },
        links: { self: "/api/v2/spp/Individual?_count=100&_offset=0" },
      };
      // Reset to drop any mockResolvedValueOnce queue left by earlier tests.
      mockV2ClientImplementation.searchIndividuals.mockReset();
      mockV2ClientImplementation.searchIndividuals.mockResolvedValueOnce(mockSearchResult);
      mockV2ClientImplementation.searchIndividuals.mockResolvedValueOnce({
        data: [],
        meta: { total: 1, count: 0, offset: 1 },
        links: { self: "/api/v2/spp/Individual?_count=100&_offset=1" },
      });

      adapter = new OpenSppV2SyncAdapter(eventStore, eventApplierService, config);
      await adapter.pullData();

      // externalId keeps the value; identifierType keeps the system's vocab code
      // so a later push targets national_id|PH-123 — not the default system_id.
      expect(eventApplierService.submitForm).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ externalId: "PH-123", identifierType: "national_id" }),
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

    it("skips individuals whose only identifier system is out-of-namespace (H12)", async () => {
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

      // Out-of-namespace records must not be imported as DataCollect entities.
      expect(result.pulled).toBe(0);
      expect(result.skipped).toBe(1);
      expect(eventApplierService.submitForm).not.toHaveBeenCalled();
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

    describe("submitVia option", () => {
      // Reading a private field is intentional — A2 only wires the option
      // into the ctor; A4 will exercise it via push behaviour. Until then,
      // tests verify the wiring via the stored field directly.
      const readSubmitVia = (a: OpenSppV2SyncAdapter): unknown =>
        (a as unknown as { submitVia: unknown }).submitVia;
      const readCRTypeMap = (a: OpenSppV2SyncAdapter): unknown =>
        (a as unknown as { changeRequestTypeMap: unknown }).changeRequestTypeMap;

      it("defaults submitVia to 'direct' when not provided", () => {
        adapter = new OpenSppV2SyncAdapter(eventStore, eventApplierService, config);
        expect(readSubmitVia(adapter)).toBe("direct");
      });

      it("preserves explicit submitVia: 'change-request'", () => {
        const crConfig: ExternalSyncConfig = {
          ...config,
          adapterConfig: {
            ...(config.adapterConfig ?? {}),
            submitVia: "change-request",
          },
        };
        adapter = new OpenSppV2SyncAdapter(eventStore, eventApplierService, crConfig);
        expect(readSubmitVia(adapter)).toBe("change-request");
      });

      it("treats unknown submitVia values as 'direct'", () => {
        const weirdConfig: ExternalSyncConfig = {
          ...config,
          adapterConfig: {
            ...(config.adapterConfig ?? {}),
            submitVia: "auto",
          },
        };
        adapter = new OpenSppV2SyncAdapter(eventStore, eventApplierService, weirdConfig);
        expect(readSubmitVia(adapter)).toBe("direct");
      });

      it("reads submitVia via legacy extraFields", () => {
        const legacyConfig: ExternalSyncConfig = {
          type: "openspp-v2-adapter",
          url: "http://legacy.openspp.com",
          extraFields: [
            { name: "clientId", value: "x" },
            { name: "clientSecret", value: "y" },
            { name: "submitVia", value: "change-request" },
          ],
        };
        adapter = new OpenSppV2SyncAdapter(eventStore, eventApplierService, legacyConfig);
        expect(readSubmitVia(adapter)).toBe("change-request");
      });

      it("defaults changeRequestTypeMap to {} when absent", () => {
        adapter = new OpenSppV2SyncAdapter(eventStore, eventApplierService, config);
        expect(readCRTypeMap(adapter)).toEqual({});
      });

      it("preserves an inline changeRequestTypeMap object on config", () => {
        const override = { "update-individual": "custom_edit" };
        const overrideConfig = {
          ...config,
          changeRequestTypeMap: override,
        } as ExternalSyncConfig;
        adapter = new OpenSppV2SyncAdapter(eventStore, eventApplierService, overrideConfig);
        expect(readCRTypeMap(adapter)).toEqual(override);
      });

      it("parses a JSON-stringified changeRequestTypeMap from adapterConfig", () => {
        const override = { "delete-entity": "custom_archive_group" };
        const stringConfig: ExternalSyncConfig = {
          ...config,
          adapterConfig: {
            ...(config.adapterConfig ?? {}),
            changeRequestTypeMap: JSON.stringify(override),
          },
        };
        adapter = new OpenSppV2SyncAdapter(eventStore, eventApplierService, stringConfig);
        expect(readCRTypeMap(adapter)).toEqual(override);
      });

      it("returns {} for an unparseable changeRequestTypeMap string", () => {
        const broken: ExternalSyncConfig = {
          ...config,
          adapterConfig: {
            ...(config.adapterConfig ?? {}),
            changeRequestTypeMap: "not-json",
          },
        };
        adapter = new OpenSppV2SyncAdapter(eventStore, eventApplierService, broken);
        expect(readCRTypeMap(adapter)).toEqual({});
      });
    });
  });
});
