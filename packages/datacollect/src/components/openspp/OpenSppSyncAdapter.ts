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

import {
  EventStore,
  ExternalSyncAdapter,
  ExternalSyncConfig,
  ExternalSyncCredentials,
  FormSubmission,
  getExternalField,
} from "../../interfaces/types";
import { EventApplierService } from "../../services/EventApplierService";
import OdooClient from "./OdooClient";
import { OdooConfig } from "./odoo-types";

interface GroupedData {
  apg: FormSubmission;
  households: {
    household: FormSubmission;
    individuals: FormSubmission[];
  }[];
  crops: FormSubmission[];
}

interface AdministrativeArea {
  province_id: number | undefined;
  district_id: number | undefined;
  area_id: number | undefined;
}

interface RegisteredIndividual {
  id?: number | null;
  membershipKind?: number | null;
}

class OpenSppSyncAdapter implements ExternalSyncAdapter {
  private url: string;
  private batchSize = 100;
  private odooClient: OdooClient | null = null;
  private lastCredentials: ExternalSyncCredentials | null = null;

  constructor(
    private eventStore: EventStore,
    private eventApplierService: EventApplierService,
    private config: ExternalSyncConfig,
  ) {
    this.url = (this.config?.url as string | undefined) ?? "";
    const configuredBatchSize = getExternalField(this.config, "batchSize");
    if (configuredBatchSize) {
      const parsed = parseInt(configuredBatchSize, 10);
      if (!Number.isNaN(parsed)) {
        this.batchSize = parsed;
      }
    }
  }

  async authenticate(credentials?: ExternalSyncCredentials): Promise<boolean> {
    try {
      await this.ensureClient(credentials);
      return true;
    } catch (error) {
      console.error("OpenSPP authentication error:", error);
      return false;
    }
  }
  // This only pushes new data to the server
  //TO DO: implement batch size and update
  async pushData(credentials?: ExternalSyncCredentials): Promise<void> {
    if (!this.url) {
      throw new Error("URL is required");
    }
    await this.ensureClient(credentials);
    // get last sync timestamp
    let lastPushExternalSyncTimestamp = await this.eventStore.getLastPushExternalSyncTimestamp();

    // get all events since last sync
    // const eventsToPush = await this.eventStore.getEventsSince(lastPushExternalSyncTimestamp);

    const allEvents = await this.eventStore.getAllEvents();
    const filteredEvents = allEvents.filter((event) => {
      const isLatest = event.timestamp > lastPushExternalSyncTimestamp;
      const isCreate = event.type === "create-individual";
      return event.data.entityName === "apg" || (isLatest && isCreate);
    });
    const groupedEvents = this.groupEventByApgId(filteredEvents);
    const updatedEvents: FormSubmission[] = [];

    for (const groupData of Object.values(groupedEvents)) {
      try {
        const apgPayload = groupData.apg.data as Record<string, unknown>;
        const apgId = this.parseInteger(apgPayload.id);
        if (!apgId) {
          console.error("Unable to determine APG identifier for event", groupData.apg);
          continue;
        }

        const administrativeArea: AdministrativeArea = {
          province_id: this.parseInteger(apgPayload.province_id),
          district_id: this.parseInteger(apgPayload.district_id),
          area_id: this.parseInteger(apgPayload.village_id),
        };

        for (const householdGroup of groupData.households) {
          try {
            const householdEvent = householdGroup.household;
            const householdData = householdEvent.data as Record<string, unknown>;
            const householdId = await this.createHouseholdData(apgId, householdEvent, administrativeArea);

            const householdBankDetails = this.getRecordArray(householdData, "bank_details");
            if (householdBankDetails.length > 0 && householdId) {
              for (const bankDetail of householdBankDetails) {
                try {
                  await this.createBankAccount(householdId, bankDetail);
                } catch (error) {
                  console.error("Error creating household bank account:", error);
                }
              }
            }

            const householdDocuments = this.getRecordArray(householdData, "document_ids");
            if (householdDocuments.length > 0 && householdId) {
              for (const document of householdDocuments) {
                try {
                  await this.createRegistrantID(householdId, document);
                } catch (error) {
                  console.error("Error creating household document ID:", error);
                }
              }
            }

            if (householdId) {
              updatedEvents.push(householdEvent);
            }

            const individualIds: RegisteredIndividual[] = [];

            for (const member of householdGroup.individuals) {
              try {
                const memberData = member.data as Record<string, unknown>;
                const individualId = await this.createIndividualData(apgId, member, administrativeArea);

                if (individualId) {
                  updatedEvents.push(member);
                }

                const memberBankDetails = this.getRecordArray(memberData, "bank_details");
                if (memberBankDetails.length > 0 && individualId) {
                  for (const bankDetail of memberBankDetails) {
                    try {
                      await this.createBankAccount(individualId, bankDetail);
                    } catch (error) {
                      console.error("Error creating individual bank account:", error);
                    }
                  }
                }

                const memberDocuments = this.getRecordArray(memberData, "document_ids");
                if (memberDocuments.length > 0 && individualId) {
                  for (const document of memberDocuments) {
                    try {
                      await this.createRegistrantID(individualId, document);
                    } catch (error) {
                      console.error("Error creating individual document ID:", error);
                    }
                  }
                }

                const trainingRecords = this.getRecordArray(memberData, "training_records");
                if (trainingRecords.length > 0 && individualId) {
                  for (const training of trainingRecords) {
                    try {
                      await this.createTrainingRecord(training, individualId);
                    } catch (error) {
                      console.error("Error creating training record:", error);
                    }
                  }
                }

                const membershipKind = this.parseInteger(memberData.relationship);
                individualIds.push({
                  id: individualId ?? null,
                  membershipKind,
                });
              } catch (error) {
                console.error("Error processing individual:", error);
              }
            }

            if (individualIds.length > 0 && householdId) {
              for (const registered of individualIds) {
                if (!registered.id) {
                  continue;
                }

                const membership =
                  typeof registered.membershipKind === "number" ? [[registered.membershipKind]] : undefined;

                try {
                  await this.odooClient?.addMembersToGroup(householdId, [
                    {
                      individual: registered.id,
                      ...(membership ? { kind: membership } : {}),
                    },
                  ]);
                } catch (error) {
                  console.error(`Error linking member ${registered.id} to household:`, error);
                }
              }
            }

            if (householdId) {
              await this.odooClient?.addMembersToGroup(apgId, [
                {
                  individual: householdId,
                },
              ]);
            }
          } catch (error) {
            console.error("Error processing household:", error);
          }
        }

        // Process crops
        for (const crop of groupData.crops) {
          try {
            const cropExternalId = await this.processCrop(crop, apgId);
            if (cropExternalId) {
              updatedEvents.push(crop);
            }
          } catch (error) {
            console.error("Error processing crop:", error);
            continue;
          }
        }
      } catch (error) {
        console.error("Error processing APG group:", error);
        continue;
      }
    }

    const latestEventTimestamp = this.getLatestTimestamp(updatedEvents);
    if (latestEventTimestamp) {
      // Update the sync timestamp after each successful batch
      await this.eventStore.setLastPushExternalSyncTimestamp(latestEventTimestamp);
      lastPushExternalSyncTimestamp = latestEventTimestamp;
    }

    return;
  }

  private getLatestTimestamp(events: FormSubmission[]): string | null {
    if (!Array.isArray(events) || events.length === 0) return null;
    const timestamps = events.map((event: FormSubmission) => event.timestamp).filter((timestamp) => timestamp != null);

    return timestamps.length > 0 ? timestamps.reduce((latest, current) => (current > latest ? current : latest)) : null;
  }

  async pullData(): Promise<void> {
    throw new Error("OpenSPP pull data is a work in progress.");
  }

  /*
  async pullData(credentials?: ExternalSyncCredentials): Promise<void> {
    await this.ensureClient(credentials);
    const lastPullExternalSyncTimestamp = await this.eventStore.getLastPullExternalSyncTimestamp();

    // save entities to entity store
    const pulledData = await axios.get(this.url, {
      params: {
        since: lastPullExternalSyncTimestamp,
      },
    });

    // convert pulled data to FormSubmission
    const events = this.convertPulledDataToEvents(pulledData.data);

    for (const event of events) {
      await this.eventApplierService.submitForm(event);
    }

    // use latest timestamp from events
    const latestEventTimestamp = this.getLatestTimestamp(events);
    if (latestEventTimestamp) {
      await this.eventStore.setLastPullExternalSyncTimestamp(latestEventTimestamp);
    }

    return;
  }
  

  private convertPulledDataToEvents(pulledData: unknown[]): FormSubmission[] {
    if (Array.isArray(pulledData)) {
      return pulledData.map((data) => this.convertPulledDataToEvent(data));
    }
    return [];
  }

  private convertPulledDataToEvent(pulledData: unknown): FormSubmission {
    return {
      type: "external-pull",
      guid: uuidv4(),
      entityGuid: get(pulledData, "id", uuidv4()),
      data: pulledData as Record<string, unknown>,
      timestamp: get(pulledData, "timestamp", new Date().toISOString()),
      userId: "system",
      syncLevel: SyncLevel.REMOTE,
    };
  }
  */

  async sync(credentials?: ExternalSyncCredentials): Promise<void> {
    const authenticated = await this.authenticate(credentials);
    if (!authenticated) {
      throw new Error("Failed to authenticate with OpenSPP");
    }
    await this.pushData(credentials);
    // await this.pullData(credentials);
  }

  private async ensureClient(credentials?: ExternalSyncCredentials): Promise<void> {
    if (credentials) {
      this.lastCredentials = credentials;
    }

    if (this.odooClient) {
      return;
    }

    const auth = this.lastCredentials;
    const database = getExternalField(this.config, "database");
    const registrarGroup = getExternalField(this.config, "registrarGroup");

    if (!this.url || !database || !auth) {
      throw new Error("URL, database and credentials are required");
    }

    const odooConfig: OdooConfig = {
      host: this.url,
      database,
      username: auth.username,
      password: auth.password,
      registrarGroup,
    };

    this.odooClient = new OdooClient(odooConfig);
    await this.odooClient.login();
  }

  async createHouseholdData(
    apgId: number,
    apgMember: FormSubmission,
    administrativeArea: AdministrativeArea,
  ): Promise<number | undefined> {
    const householdPayload = apgMember.data as Record<string, unknown>;
    const gpsCoordinates = this.parseCoordinates(householdPayload.location_gps);

    const householdData = {
      is_registrant: true,
      is_group: true,
      name: this.getString(householdPayload, "name") ?? "",
      kind: 1,
      hh_size: this.parseInteger(householdPayload.household_size) ?? 0,
      hh_status: "active",
      ethnic_group: this.isAffirmative(householdPayload.belongs_to_ethnic_group),
      longitude: gpsCoordinates?.longitude,
      latitude: gpsCoordinates?.latitude,
      ...administrativeArea,
    };

    return this.odooClient?.createHousehold(apgId, householdData);
  }

  async createIndividualData(
    apgId: number,
    member: FormSubmission,
    administrativeArea: AdministrativeArea,
  ): Promise<number | undefined> {
    const memberPayload = member.data as Record<string, unknown>;
    const gpsCoordinates = this.parseCoordinates(memberPayload.location_gps);
    const firstName = this.getString(memberPayload, "first_name") ?? "";
    const lastName = this.getString(memberPayload, "last_name") ?? "";
    const displayName = this.getString(memberPayload, "name") || `${firstName} ${lastName}`.trim();
    const birthdate = this.getString(memberPayload, "date_of_birth");

    const individualData = {
      is_registrant: true,
      given_name: firstName,
      family_name: lastName,
      addl_name: this.getString(memberPayload, "middle_name"),
      name: displayName,
      gender: this.getString(memberPayload, "gender"),
      birthdate: birthdate ? this.formatDate(birthdate) : null,
      ethnic_group: this.isAffirmative(memberPayload.belongs_to_ethnic_group),
      email: this.getString(memberPayload, "email_address") ?? "",
      marital_status_id: this.parseInteger(memberPayload.marital_status),
      profession: this.getString(memberPayload, "profession") ?? "",
      longitude: gpsCoordinates?.longitude,
      latitude: gpsCoordinates?.latitude,
      highest_education_level_id: this.parseInteger(memberPayload.education_level),
      phone: this.getString(memberPayload, "phone_number") ?? "",
      ...administrativeArea,
    };

    return this.odooClient?.createIndividual(apgId, individualData);
  }

  async createTrainingRecord(training: Record<string, unknown>, partnerId: number): Promise<number | undefined> {
    const trainingStart = this.getString(training, "training_start_date");
    const trainingEnd = this.getString(training, "training_end_date");

    return this.odooClient?.create("spp.training", {
      registrant_id: partnerId,
      type_of_training: this.getString(training, "training_type") ?? "",
      training_period: trainingStart ? this.formatDate(trainingStart) : null,
      training_end: trainingEnd ? this.formatDate(trainingEnd) : null,
    });
  }

  async createRegistrantID(partnerId: number, data: Record<string, unknown>): Promise<number | undefined> {
    const issuanceDate = this.getString(data, "id_issuance_date");
    const expiryDate = this.getString(data, "id_expiry_date");

    return this.odooClient?.create("g2p.reg.id", {
      partner_id: partnerId,
      id_type: this.getString(data, "id_type") ?? "",
      value: this.getString(data, "id_number") ?? "",
      issuance_date: issuanceDate ? this.formatDate(issuanceDate) : null,
      expiry_date: expiryDate ? this.formatDate(expiryDate) : null,
      description: this.getString(data, "id_description") ?? "",
    });
  }

  async createBankAccount(partnerId: number, data: Record<string, unknown>): Promise<number | undefined> {
    const bankId = this.parseInteger(data.bank_name);
    if (!bankId) {
      return undefined;
    }

    return this.odooClient?.create("res.partner.bank", {
      partner_id: partnerId,
      bank_id: bankId,
      acc_number: this.getString(data, "account_number") ?? "",
      account_type: this.getString(data, "account_type") ?? "",
      acc_holder_name: this.getString(data, "account_owner_name") ?? "",
    });
  }

  async processCrop(apgCrop: FormSubmission, apgId: number): Promise<number | null | undefined> {
    try {
      const cropPayload = apgCrop.data as Record<string, unknown>;
      const cropActivities = this.getRecordArray(cropPayload, "crop_activities");
      let cropExternalId: number | null | undefined;

      const landRecord = {
        land_farm_id: apgId,
        province_id: this.parseInteger(cropPayload.province_id),
        district_id: this.parseInteger(cropPayload.district_id),
        area_id: this.parseInteger(cropPayload.area_id),
        land_size: this.parseNumber(cropPayload.land_size),
        land_size_unit: this.getString(cropPayload, "land_size_unit"),
        agricultural_land_size: this.parseNumber(cropPayload.agricultural_land_size),
        agricultural_land_size_unit: this.getString(cropPayload, "agricultural_land_size_unit"),
      };
      const newLandRecord = await this.odooClient?.create("spp.land.record", landRecord);

      for (const cropActivity of cropActivities) {
        const activity = cropActivity as Record<string, unknown>;
        const sowingDate = this.getString(activity, "sowing_date");
        const harvestDate = this.getString(activity, "harvest_date");

        const product = {
          prod_farm_id: apgId,
          activity_type: "crop",
          species_id: this.parseInteger(activity.species_id),
          seasonal_timeline_id: this.parseInteger(cropPayload.seasonal_timeline_id),
        };

        const cropActivityData = {
          crop_land_id: newLandRecord,
          activity_type: "crop",
          species_id: this.parseInteger(activity.species_id),
          crop_id: this.parseInteger(activity.crop_id),
          crop_species: this.getString(activity, "species"),
          seeds_origin: this.getString(activity, "seeds_origin"),
          purpose: this.getString(activity, "purpose"),
          season_id: this.parseInteger(activity.season_id),
          sowing_date: sowingDate ? this.formatDate(sowingDate) : null,
          harvest_date: harvestDate ? this.formatDate(harvestDate) : null,
          expected_yield: this.parseNumber(activity.expected_yield),
          expected_yield_unit: this.getString(activity, "expected_yield_unit"),
          actual_yield: this.parseNumber(activity.actual_yield),
          irrigation_type_ids: this.getNumberArray(activity, "irrigation_type_ids"),
          chemical_usage_ids: this.getNumberArray(activity, "chemical_usage_ids"),
          fertilizer_usage_ids: this.getNumberArray(activity, "fertilizer_usage_ids"),
        };

        try {
          await this.odooClient?.create("spp.farm.activity", product);
        } catch (error) {
          console.error(`Error creating spp.farm.activity product : ${JSON.stringify(product)}`, error);
          return null;
        }

        try {
          cropExternalId = await this.odooClient?.create("spp.farm.activity", cropActivityData);
        } catch (error) {
          console.error(`Error creating spp.farm.activity cropActivityData : ${JSON.stringify(cropActivityData)}`, error);
          return null;
        }
      }

      return cropExternalId;
    } catch (error) {
      console.error("Error processing crop for member:", apgCrop.entityGuid, error);
      return null;
    }
  }
  private groupEventByApgId(events: FormSubmission[]): Record<string, GroupedData> {
    const grouped: Record<string, GroupedData> = {};

    for (const event of events) {
      // Check if event.data exists and has required properties
      if (!event.data || typeof event.data !== "object") {
        continue;
      }

      if (event.data.entityName === "apg") {
        grouped[event.entityGuid] = {
          apg: event,
          households: [],
          crops: [],
        };
      } else if (event.data.entityName === "household") {
        const apgGroup = grouped[event.data.parentGuid];
        if (apgGroup) {
          apgGroup.households.push({
            household: event,
            individuals: [],
          });
        }
      } else if (event.data.entityName === "individual") {
        for (const apgGroup of Object.values(grouped)) {
          const household = apgGroup.households.find((h) => h.household.entityGuid === event.data.parentGuid);
          if (household) {
            household.individuals.push(event);
            break;
          }
        }
      } else if (event.data.entityName === "cropActivity") {
        const apgGroup = grouped[event.data.parentGuid];
        if (apgGroup) {
          apgGroup.crops.push(event);
        }
      }
    }

    return grouped;
  }

  private formatDate(date: string): string {
    const newDate = new Date(date);
    return newDate.toISOString().split("T")[0];
  }

  private parseNumber(value: unknown): number | undefined {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string") {
      const parsed = Number(value);
      return Number.isNaN(parsed) ? undefined : parsed;
    }
    return undefined;
  }

  private parseInteger(value: unknown): number | undefined {
    const parsed = this.parseNumber(value);
    return parsed === undefined ? undefined : Math.trunc(parsed);
  }

  private parseCoordinates(value: unknown): { longitude: number | undefined; latitude: number | undefined } | null {
    if (typeof value !== "string") {
      return null;
    }
    try {
      const parsed = JSON.parse(value) as {
        coords?: { longitude?: unknown; latitude?: unknown };
      };
      const longitude = this.parseNumber(parsed?.coords?.longitude);
      const latitude = this.parseNumber(parsed?.coords?.latitude);
      if (longitude === undefined && latitude === undefined) {
        return null;
      }
      return { longitude, latitude };
    } catch {
      return null;
    }
  }

  private getString(data: Record<string, unknown>, key: string): string | undefined {
    const value = data[key];
    return typeof value === "string" ? value : undefined;
  }

  private getRecordArray(data: Record<string, unknown>, key: string): Record<string, unknown>[] {
    const value = data[key];
    return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
  }

  private getNumberArray(data: Record<string, unknown>, key: string): number[] {
    return this.toNumberArray(data[key]);
  }

  private isAffirmative(value: unknown): boolean {
    return typeof value === "string" && value.toLowerCase() === "yes";
  }

  private toNumberArray(value: unknown): number[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return (value as unknown[])
      .map((entry) => this.parseNumber(entry))
      .filter((entry): entry is number => entry !== undefined);
  }

}

export default OpenSppSyncAdapter;
