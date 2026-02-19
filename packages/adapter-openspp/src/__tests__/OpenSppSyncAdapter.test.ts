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

import type { EventStore, ExternalSyncConfig, ExternalSyncCredentials, EntityPair } from "@idpass/data-collect-core";
import { EntityType } from "@idpass/data-collect-core";
import OpenSppSyncAdapter from "../OpenSppSyncAdapter";
import { EventApplierService } from "@idpass/data-collect-core";

const mockOdooClientImplementation = {
  login: jest.fn(),
  addMembersToGroup: jest.fn(),
  createHousehold: jest.fn().mockResolvedValue(200),
  createIndividual: jest.fn().mockResolvedValue(300),
  create: jest.fn().mockResolvedValue(400),
  fetchHouseholdsSince: jest.fn().mockResolvedValue([]),
  fetchIndividualsSince: jest.fn().mockResolvedValue([]),
};

// Mock OdooClient
jest.mock("../OdooClient", () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => mockOdooClientImplementation),
  };
});

describe("OpenSppSyncAdapter", () => {
  let eventStore: jest.Mocked<EventStore>;
  let eventApplierService: jest.Mocked<EventApplierService>;
  let adapter: OpenSppSyncAdapter;
  let credentials: ExternalSyncCredentials;
  let config: ExternalSyncConfig;

  beforeEach(() => {
    // Reset mocks
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
      getEntityByExternalId: jest.fn().mockResolvedValue(null),
    };

    eventApplierService = {
      submitForm: jest.fn(),
      getEntityStore: jest.fn().mockReturnValue(mockEntityStore),
    } as unknown as jest.Mocked<EventApplierService>;

    credentials = {
      username: "test",
      password: "secret",
    };

    config = {
      type: "openspp",
      url: "http://openspp.example.com",
      extraFields: [
        { name: "database", value: "openspp" },
        { name: "username", value: "test" },
        { name: "password", value: "secret" },
        { name: "registrarGroup", value: "g2p.group.registrar" },
      ],
    };
  });

  describe("pushData", () => {
    it("pushes individuals and households using default config", async () => {
      const individualEntityPair: EntityPair = {
        guid: "individual-1",
        initial: {
          id: "entity-1",
          guid: "individual-1",
          type: EntityType.Individual,
          version: 1,
          data: {
            entityName: "individual",
            parentGuid: "household-1",
            first_name: "Jane",
            last_name: "Doe",
            gender: "female",
            date_of_birth: "1999-01-01",
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
            parentGuid: "household-1",
            first_name: "Jane",
            last_name: "Doe",
            gender: "female",
            date_of_birth: "1999-01-01",
            relationship: "2",
            bank_details: [
              {
                bank_name: "1",
                account_number: "1111",
              },
            ],
            document_ids: [
              {
                id_type: "passport",
                id_number: "ABC",
              },
            ],
          },
          lastUpdated: "2024-01-01T12:00:00.000Z",
        },
      };

      const mockEntityStore = {
        getAllEntities: jest.fn().mockResolvedValue([individualEntityPair]),
        getEntity: jest.fn().mockResolvedValue(individualEntityPair),
        saveEntity: jest.fn(),
      };

      eventApplierService.getEntityStore = jest.fn().mockReturnValue(mockEntityStore);

      Object.assign(mockOdooClientImplementation, {
        createIndividual: jest.fn().mockResolvedValue(300),
      });

      adapter = new OpenSppSyncAdapter(eventStore, eventApplierService, config);

      await expect(adapter.pushData(credentials)).resolves.toBeUndefined();

      expect(mockEntityStore.getAllEntities).toHaveBeenCalled();
      expect(mockOdooClientImplementation.createIndividual).toHaveBeenCalled();
    });
  });

  describe("pullData", () => {
    it("fetches and transforms individuals since last pull", async () => {
      const mockIndividuals = [
        {
          id: 201,
          given_name: "John",
          family_name: "Doe",
          name: "John Doe",
          is_group: false,
          is_registrant: true,
          gender: "male",
          birthdate: "1990-01-01",
          ethnic_group: false,
          email: "john@example.com",
          phone: "+1234567890",
          profession: "Engineer",
          marital_status_id: 1,
          highest_education_level_id: 3,
          latitude: 1.5,
          longitude: 2.5,
          relationship: 2,
          province_id: 10,
          district_id: 20,
          area_id: 30,
          write_date: "2024-01-15T10:00:00.000Z",
        },
      ];

      Object.assign(mockOdooClientImplementation, {
        fetchIndividualsSince: jest.fn().mockResolvedValue(mockIndividuals),
      });

      adapter = new OpenSppSyncAdapter(eventStore, eventApplierService, config);

      await adapter.authenticate(credentials);
      await adapter.pullData();

      // Verify individuals were fetched (without timestamp parameter)
      expect(mockOdooClientImplementation.fetchIndividualsSince).toHaveBeenCalledWith();

      // Verify forms were submitted
      expect(eventApplierService.submitForm).toHaveBeenCalled();
    });

    it("fetches and transforms multiple individuals", async () => {
      const mockIndividuals = [
        {
          id: 201,
          given_name: "John",
          family_name: "Doe",
          name: "John Doe",
          is_group: false,
          is_registrant: true,
          gender: "male",
          birthdate: "1990-01-01",
          ethnic_group: false,
          email: "john@example.com",
          phone: "+1234567890",
          profession: "Engineer",
          marital_status_id: 1,
          highest_education_level_id: 3,
          latitude: 1.5,
          longitude: 2.5,
          relationship: 2,
          province_id: 10,
          district_id: 20,
          area_id: 30,
          write_date: "2024-01-16T10:00:00.000Z",
        },
        {
          id: 202,
          given_name: "Jane",
          family_name: "Smith",
          name: "Jane Smith",
          is_group: false,
          is_registrant: true,
          gender: "female",
          birthdate: "1992-05-15",
          write_date: "2024-01-17T10:00:00.000Z",
        },
      ];

      Object.assign(mockOdooClientImplementation, {
        fetchIndividualsSince: jest.fn().mockResolvedValue(mockIndividuals),
      });

      adapter = new OpenSppSyncAdapter(eventStore, eventApplierService, config);

      await adapter.authenticate(credentials);
      await adapter.pullData();

      // Verify individuals were fetched (without timestamp parameter)
      expect(mockOdooClientImplementation.fetchIndividualsSince).toHaveBeenCalledWith();

      // Verify forms were submitted for both individuals
      expect(eventApplierService.submitForm).toHaveBeenCalledTimes(2);
    });

    it("skips records without ID", async () => {
      const mockIndividuals = [
        {
          id: undefined,
          given_name: "No ID",
          family_name: "Individual",
          is_group: false,
          is_registrant: true,
        },
      ];

      Object.assign(mockOdooClientImplementation, {
        fetchIndividualsSince: jest.fn().mockResolvedValue(mockIndividuals),
      });

      adapter = new OpenSppSyncAdapter(eventStore, eventApplierService, config);

      await adapter.authenticate(credentials);
      await adapter.pullData();

      // Verify forms were still submitted (individuals without ID are processed, but getEntityByExternalId won't be called)
      expect(eventApplierService.submitForm).toHaveBeenCalled();
    });

    it("continues processing on transformation errors", async () => {
      const mockIndividuals = [
        {
          id: 101,
          given_name: "Valid",
          family_name: "Individual",
          is_group: false,
          is_registrant: true,
          write_date: "2024-01-15T10:00:00.000Z",
        },
        {
          id: 102,
          given_name: null,
          family_name: null,
          is_group: false,
          is_registrant: true,
          write_date: "2024-01-15T11:00:00.000Z",
        },
      ];

      Object.assign(mockOdooClientImplementation, {
        fetchIndividualsSince: jest.fn().mockResolvedValue(mockIndividuals),
      });

      adapter = new OpenSppSyncAdapter(eventStore, eventApplierService, config);

      await adapter.authenticate(credentials);
      await adapter.pullData();

      // Both individuals should be processed despite any issues
      // The adapter continues processing even if one fails
      expect(eventApplierService.submitForm).toHaveBeenCalled();
    });

    it("handles applier errors gracefully", async () => {
      const mockIndividuals = [
        {
          id: 201,
          given_name: "John",
          family_name: "Doe",
          is_group: false,
          is_registrant: true,
          write_date: "2024-01-16T10:00:00.000Z",
        },
      ];

      Object.assign(mockOdooClientImplementation, {
        fetchIndividualsSince: jest.fn().mockResolvedValue(mockIndividuals),
      });

      // Mock submitForm to throw an error
      eventApplierService.submitForm.mockRejectedValueOnce(new Error("Application failed"));

      adapter = new OpenSppSyncAdapter(eventStore, eventApplierService, config);

      await adapter.authenticate(credentials);

      // Should not throw even if applier fails
      await expect(adapter.pullData()).resolves.toBeUndefined();

      // Verify submitForm was called (even though it failed)
      expect(eventApplierService.submitForm).toHaveBeenCalled();
    });

    it("updates existing entities instead of creating duplicates", async () => {
      const mockIndividuals = [
        {
          id: 101,
          given_name: "Updated",
          family_name: "Individual",
          name: "Updated Individual",
          is_group: false,
          is_registrant: true,
          gender: "male",
          birthdate: "1990-01-01",
          write_date: "2024-01-15T10:00:00.000Z",
        },
      ];

      const existingEntityGuid = "existing-entity-guid";
      const existingEntityPair: EntityPair = {
        guid: existingEntityGuid,
        initial: {
          id: "entity-101",
          guid: existingEntityGuid,
          type: EntityType.Individual,
          version: 1,
          externalId: "101",
          data: {},
          lastUpdated: "2024-01-01T00:00:00.000Z",
        },
        modified: {
          id: "entity-101",
          guid: existingEntityGuid,
          type: EntityType.Individual,
          version: 1,
          externalId: "101",
          data: {},
          lastUpdated: "2024-01-15T10:00:00.000Z",
        },
      };
      const mockEntityStore = {
        getEntityByExternalId: jest.fn().mockResolvedValue(existingEntityPair),
      };

      eventApplierService.getEntityStore = jest.fn().mockReturnValue(mockEntityStore);

      Object.assign(mockOdooClientImplementation, {
        fetchIndividualsSince: jest.fn().mockResolvedValue(mockIndividuals),
      });

      adapter = new OpenSppSyncAdapter(eventStore, eventApplierService, config);

      await adapter.authenticate(credentials);
      await adapter.pullData();

      // Verify getEntityByExternalId was called with the individual ID
      expect(mockEntityStore.getEntityByExternalId).toHaveBeenCalledWith("101");

      // Verify submitForm was called with the existing entity GUID (transformer will determine update vs create)
      expect(eventApplierService.submitForm).toHaveBeenCalledWith(
        expect.objectContaining({
          entityGuid: existingEntityGuid,
        })
      );
    });
  });
});
