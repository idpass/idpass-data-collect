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

import type { EventStore, ExternalSyncConfig, EntityPair } from "../interfaces/types";
import { EntityType } from "../interfaces/types";
import OpenSppV2SyncAdapter from "../components/openspp-v2/OpenSppV2SyncAdapter";
import { EventApplierService } from "../services/EventApplierService";
import type { IndividualResource, SearchBundle } from "../components/openspp-v2/types";

// Mock the OpenSppV2Client
const mockV2ClientImplementation = {
  authenticate: jest.fn().mockResolvedValue(undefined),
  isAuthenticated: jest.fn().mockReturnValue(true),
  formatIdentifier: jest.fn((value: string) => `urn:datacollect:entity|${value}`),
  createIdentifier: jest.fn((value: string) => ({ system: "urn:datacollect:entity", value })),
  getIndividual: jest.fn().mockResolvedValue(null),
  searchIndividuals: jest.fn().mockResolvedValue({ resourceType: "Bundle", type: "searchset", entry: [] }),
  createIndividual: jest.fn().mockImplementation((resource: IndividualResource) => ({
    ...resource,
    identifier: resource.identifier,
  })),
  updateIndividual: jest.fn().mockImplementation((_, resource: IndividualResource) => resource),
};

jest.mock("../components/openspp-v2/OpenSppV2Client", () => {
  return {
    __esModule: true,
    OpenSppV2Client: jest.fn().mockImplementation(() => mockV2ClientImplementation),
    default: jest.fn().mockImplementation(() => mockV2ClientImplementation),
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
        identifierNamespace: "urn:datacollect:entity",
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

  describe("pushData", () => {
    it("pushes individuals to OpenSPP V2", async () => {
      const individualEntityPair: EntityPair = {
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
        getAllEntities: jest.fn().mockResolvedValue([individualEntityPair]),
        getEntity: jest.fn().mockResolvedValue(individualEntityPair),
        getEntityByExternalId: jest.fn().mockResolvedValue(null),
        saveEntity: jest.fn(),
      };

      eventApplierService.getEntityStore = jest.fn().mockReturnValue(mockEntityStore);

      adapter = new OpenSppV2SyncAdapter(eventStore, eventApplierService, config);

      await expect(adapter.pushData()).resolves.toBeUndefined();

      expect(mockEntityStore.getAllEntities).toHaveBeenCalled();
      expect(mockV2ClientImplementation.createIndividual).toHaveBeenCalledWith(
        expect.objectContaining({
          resourceType: "Individual",
          identifier: expect.arrayContaining([
            expect.objectContaining({
              system: "urn:datacollect:entity",
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

    it("updates existing individuals with externalId", async () => {
      const individualEntityPair: EntityPair = {
        guid: "individual-1",
        initial: {
          id: "entity-1",
          guid: "individual-1",
          type: EntityType.Individual,
          version: 1,
          externalId: "individual-1",
          data: {
            entityName: "individual",
            firstName: "Jane",
            lastName: "Doe",
            externalId: "individual-1",
          },
          lastUpdated: "2024-01-01T12:00:00.000Z",
        },
        modified: {
          id: "entity-1",
          guid: "individual-1",
          type: EntityType.Individual,
          version: 1,
          externalId: "individual-1",
          data: {
            entityName: "individual",
            firstName: "Jane",
            lastName: "Smith",
            externalId: "individual-1",
          },
          lastUpdated: "2024-01-02T12:00:00.000Z",
        },
      };

      const mockEntityStore = {
        getAllEntities: jest.fn().mockResolvedValue([individualEntityPair]),
        getEntity: jest.fn().mockResolvedValue(individualEntityPair),
        getEntityByExternalId: jest.fn().mockResolvedValue(individualEntityPair),
        saveEntity: jest.fn(),
      };

      eventApplierService.getEntityStore = jest.fn().mockReturnValue(mockEntityStore);

      adapter = new OpenSppV2SyncAdapter(eventStore, eventApplierService, config);

      await expect(adapter.pushData()).resolves.toBeUndefined();

      expect(mockV2ClientImplementation.updateIndividual).toHaveBeenCalledWith(
        "urn:datacollect:entity|individual-1",
        expect.objectContaining({
          resourceType: "Individual",
          name: expect.objectContaining({
            family: "Smith",
          }),
        }),
      );
    });

    it("handles empty entity list", async () => {
      const mockEntityStore = {
        getAllEntities: jest.fn().mockResolvedValue([]),
        getEntity: jest.fn().mockResolvedValue(null),
        getEntityByExternalId: jest.fn().mockResolvedValue(null),
        saveEntity: jest.fn(),
      };

      eventApplierService.getEntityStore = jest.fn().mockReturnValue(mockEntityStore);

      adapter = new OpenSppV2SyncAdapter(eventStore, eventApplierService, config);

      await expect(adapter.pushData()).resolves.toBeUndefined();

      expect(mockV2ClientImplementation.createIndividual).not.toHaveBeenCalled();
      expect(mockV2ClientImplementation.updateIndividual).not.toHaveBeenCalled();
    });
  });

  describe("pullData", () => {
    it("pulls individuals from OpenSPP V2", async () => {
      const mockSearchResult: SearchBundle<IndividualResource> = {
        resourceType: "Bundle",
        type: "searchset",
        total: 1,
        entry: [
          {
            resource: {
              resourceType: "Individual",
              identifier: [
                { system: "urn:datacollect:entity", value: "pulled-individual-1" },
              ],
              name: {
                given: "John",
                family: "Doe",
                text: "Doe, John",
              },
              birthDate: "1990-05-15",
              gender: {
                coding: [
                  { system: "urn:iso:std:iso:5218", code: "1", display: "Male" },
                ],
              },
            },
          },
        ],
      };

      mockV2ClientImplementation.searchIndividuals.mockResolvedValueOnce(mockSearchResult);
      // Return empty result for second call to end pagination
      mockV2ClientImplementation.searchIndividuals.mockResolvedValueOnce({
        resourceType: "Bundle",
        type: "searchset",
        entry: [],
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
        getEntity: jest.fn().mockResolvedValue(existingEntityPair),
        getEntityByExternalId: jest.fn().mockResolvedValue(existingEntityPair),
        saveEntity: jest.fn(),
      };

      eventApplierService.getEntityStore = jest.fn().mockReturnValue(mockEntityStore);

      const mockSearchResult: SearchBundle<IndividualResource> = {
        resourceType: "Bundle",
        type: "searchset",
        total: 1,
        entry: [
          {
            resource: {
              resourceType: "Individual",
              identifier: [
                { system: "urn:datacollect:entity", value: "pulled-individual-1" },
              ],
              name: {
                given: "Updated",
                family: "Name",
              },
            },
          },
        ],
      };

      // Reset and set up fresh mocks
      mockV2ClientImplementation.searchIndividuals.mockReset();
      mockV2ClientImplementation.searchIndividuals.mockResolvedValueOnce(mockSearchResult);
      mockV2ClientImplementation.searchIndividuals.mockResolvedValueOnce({
        resourceType: "Bundle",
        type: "searchset",
        entry: [],
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
      // Reset mocks and set up for this specific test
      mockV2ClientImplementation.searchIndividuals.mockReset();
      mockV2ClientImplementation.searchIndividuals.mockResolvedValue({
        resourceType: "Bundle",
        type: "searchset",
        entry: [],
      });

      // Create fresh event applier service mock
      const freshMockEntityStore = {
        getAllEntities: jest.fn().mockResolvedValue([]),
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
  });

  describe("configuration", () => {
    it("uses adapterConfig values", async () => {
      const customConfig: ExternalSyncConfig = {
        type: "openspp-v2-adapter",
        url: "http://custom.openspp.com",
        adapterConfig: {
          clientId: "custom-client",
          clientSecret: "custom-secret",
          identifierNamespace: "urn:custom:namespace",
          batchSize: 100,
          includeStudioExtensions: "false",
        },
      };

      adapter = new OpenSppV2SyncAdapter(eventStore, eventApplierService, customConfig);

      // Verify adapter was created with custom config
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
          { name: "identifierNamespace", value: "urn:legacy:namespace" },
        ],
      };

      adapter = new OpenSppV2SyncAdapter(eventStore, eventApplierService, legacyConfig);

      await adapter.authenticate();
      expect(mockV2ClientImplementation.authenticate).toHaveBeenCalled();
    });
  });
});
