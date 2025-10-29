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

import type { EventStore, ExternalSyncConfig, ExternalSyncCredentials, FormSubmission } from "../interfaces/types";
import OpenSppSyncAdapter from "../components/openspp/OpenSppSyncAdapter";
import { EventApplierService } from "../services/EventApplierService";

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
jest.mock("../components/openspp/OdooClient", () => {
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

  function createFormSubmission(partial: Partial<FormSubmission>): FormSubmission {
    return {
      guid: partial.guid ?? "guid",
      entityGuid: partial.entityGuid ?? "entity-guid",
      type: partial.type ?? "create-individual",
      data: partial.data ?? {},
      timestamp: partial.timestamp ?? "2024-01-01T12:00:00.000Z",
      userId: partial.userId ?? "user",
      syncLevel: partial.syncLevel ?? 0,
    };
  }

  describe("pushData", () => {
    it("pushes individuals and households using default config", async () => {
      const rootEvent = createFormSubmission({
        entityGuid: "root-1",
        type: "create-group",
        data: {
          entityName: "apg",
          id: "100",
          province_id: "1",
          district_id: "5",
          village_id: "7",
        },
      });

      const householdEvent = createFormSubmission({
        entityGuid: "household-1",
        type: "create-group",
        data: {
          entityName: "household",
          parentGuid: "root-1",
          name: "Household",
          household_size: "4",
          belongs_to_ethnic_group: "Yes",
          location_gps: JSON.stringify({ coords: { longitude: 10, latitude: 20 } }),
        },
      });

      const individualEvent = createFormSubmission({
        entityGuid: "individual-1",
        type: "create-individual",
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
      });

      eventStore.getAllEvents.mockResolvedValue([rootEvent, householdEvent, individualEvent]);

      adapter = new OpenSppSyncAdapter(eventStore, eventApplierService, config);

      await expect(adapter.pushData(credentials)).resolves.toBeUndefined();

      expect(eventStore.setLastPushExternalSyncTimestamp).toHaveBeenCalledWith("2024-01-01T12:00:00.000Z");
    });
  });

  describe("pullData", () => {
    it("fetches and transforms households since last pull", async () => {
      const mockHouseholds = [
        {
          id: 101,
          name: "Test Household",
          is_group: true,
          kind: 1,
          hh_size: 4,
          ethnic_group: true,
          latitude: 1.5,
          longitude: 2.5,
          province_id: 10,
          district_id: 20,
          area_id: 30,
          write_date: "2024-01-15T10:00:00.000Z",
        },
      ];

      Object.assign(mockOdooClientImplementation, {
        fetchHouseholdsSince: jest.fn().mockResolvedValue(mockHouseholds),
        fetchIndividualsSince: jest.fn().mockResolvedValue([]),
      });

      adapter = new OpenSppSyncAdapter(eventStore, eventApplierService, config);

      await adapter.authenticate(credentials);
      await adapter.pullData();

      // Verify households were fetched
      expect(mockOdooClientImplementation.fetchHouseholdsSince).toHaveBeenCalledWith("1970-01-01T00:00:00.000Z");

      // Verify forms were submitted
      expect(eventApplierService.submitForm).toHaveBeenCalled();

      // Verify latest timestamp was updated
      expect(eventStore.setLastPullExternalSyncTimestamp).toHaveBeenCalledWith("2024-01-15T10:00:00.000Z");
    });

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
          write_date: "2024-01-16T10:00:00.000Z",
        },
      ];

      Object.assign(mockOdooClientImplementation, {
        fetchHouseholdsSince: jest.fn().mockResolvedValue([]),
        fetchIndividualsSince: jest.fn().mockResolvedValue(mockIndividuals),
      });

      adapter = new OpenSppSyncAdapter(eventStore, eventApplierService, config);

      await adapter.authenticate(credentials);
      await adapter.pullData();

      // Verify individuals were fetched
      expect(mockOdooClientImplementation.fetchIndividualsSince).toHaveBeenCalledWith("1970-01-01T00:00:00.000Z");

      // Verify forms were submitted
      expect(eventApplierService.submitForm).toHaveBeenCalled();

      // Verify latest timestamp was updated
      expect(eventStore.setLastPullExternalSyncTimestamp).toHaveBeenCalledWith("2024-01-16T10:00:00.000Z");
    });

    it("skips records without ID", async () => {
      const mockHouseholds = [
        {
          id: undefined,
          name: "No ID Household",
        },
      ];

      Object.assign(mockOdooClientImplementation, {
        fetchHouseholdsSince: jest.fn().mockResolvedValue(mockHouseholds),
        fetchIndividualsSince: jest.fn().mockResolvedValue([]),
      });

      adapter = new OpenSppSyncAdapter(eventStore, eventApplierService, config);

      await adapter.authenticate(credentials);
      await adapter.pullData();

      // Verify no forms were submitted
      expect(eventApplierService.submitForm).not.toHaveBeenCalled();
    });

    it("continues processing on transformation errors", async () => {
      const mockHouseholds = [
        {
          id: 101,
          name: "Valid Household",
          is_group: true,
          kind: 1,
          write_date: "2024-01-15T10:00:00.000Z",
        },
        {
          id: 102,
          name: null,
          is_group: true,
          kind: 1,
          write_date: "2024-01-15T11:00:00.000Z",
        },
      ];

      Object.assign(mockOdooClientImplementation, {
        fetchHouseholdsSince: jest.fn().mockResolvedValue(mockHouseholds),
        fetchIndividualsSince: jest.fn().mockResolvedValue([]),
      });

      adapter = new OpenSppSyncAdapter(eventStore, eventApplierService, config);

      await adapter.authenticate(credentials);
      await adapter.pullData();

      // Both households should be processed despite any issues
      expect(eventStore.setLastPullExternalSyncTimestamp).toHaveBeenCalledWith("2024-01-15T11:00:00.000Z");
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
        fetchHouseholdsSince: jest.fn().mockResolvedValue([]),
        fetchIndividualsSince: jest.fn().mockResolvedValue(mockIndividuals),
      });

      // Mock submitForm to throw an error
      eventApplierService.submitForm.mockRejectedValueOnce(new Error("Application failed"));

      adapter = new OpenSppSyncAdapter(eventStore, eventApplierService, config);

      await adapter.authenticate(credentials);

      // Should not throw even if applier fails
      await expect(adapter.pullData()).resolves.toBeUndefined();

      // Timestamp should still be updated
      expect(eventStore.setLastPullExternalSyncTimestamp).toHaveBeenCalledWith("2024-01-16T10:00:00.000Z");
    });

    it("updates existing entities instead of creating duplicates", async () => {
      const mockHouseholds = [
        {
          id: 101,
          name: "Updated Household",
          is_group: true,
          kind: 1,
          hh_size: 5,
          write_date: "2024-01-15T10:00:00.000Z",
        },
      ];

      const existingEntityGuid = "existing-entity-guid";
      const mockEntityStore = {
        getEntityByExternalId: jest.fn().mockResolvedValue({
          guid: existingEntityGuid,
          initial: { guid: existingEntityGuid, externalId: "101" },
          modified: { guid: existingEntityGuid, externalId: "101" },
        }),
      };

      eventApplierService.getEntityStore = jest.fn().mockReturnValue(mockEntityStore);

      Object.assign(mockOdooClientImplementation, {
        fetchHouseholdsSince: jest.fn().mockResolvedValue(mockHouseholds),
        fetchIndividualsSince: jest.fn().mockResolvedValue([]),
      });

      adapter = new OpenSppSyncAdapter(eventStore, eventApplierService, config);

      await adapter.authenticate(credentials);
      await adapter.pullData();

      // Verify getEntityByExternalId was called with the household ID
      expect(mockEntityStore.getEntityByExternalId).toHaveBeenCalledWith("101");

      // Verify submitForm was called with update-group type and existing entity GUID
      expect(eventApplierService.submitForm).toHaveBeenCalledWith(
        expect.objectContaining({
          entityGuid: existingEntityGuid,
          type: "update-group",
          data: expect.objectContaining({
            externalId: 101,
          }),
        })
      );
    });
  });
});
