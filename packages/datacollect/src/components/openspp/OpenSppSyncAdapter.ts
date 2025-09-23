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

import { get } from "lodash";
import { v4 as uuidv4 } from "uuid";
import {
  EventStore,
  ExternalSyncAdapter,
  ExternalSyncConfig,
  ExternalSyncCredentials,
  FormSubmission,
  SyncLevel,
} from "../../interfaces/types";
import { EventApplierService } from "../../services/EventApplierService";
import axios from "axios";
import OdooClient from "./OdooClient";
import { OdooConfig } from "./odoo-types";
import { exportModels } from "./models";
interface Event {
  guid: string;
  entityGuid: string;
  type: string;
  data: any;
  timestamp: string;
  userId: string;
  syncLevel: number;
}

interface GroupedData {
  apg: Event;
  households: {
    household: Event;
    individuals: Event[];
  }[];
  crops: Event[];
}

class OpenSppSyncAdapter implements ExternalSyncAdapter {
  private url: string;
  private batchSize: number;
  private odooClient: OdooClient | null = null;
  private exportModels: Record<string, any> = exportModels;
  
  constructor(
    private eventStore: EventStore,
    private eventApplierService: EventApplierService,
    private config: ExternalSyncConfig,
  ) {
    this.url = (this.config?.url as string | undefined) ?? "";
    this.batchSize = (this.config?.batchSize as number | undefined) ?? 100;
  }
  // This only pushes new data to the server
  //TO DO: implement batch size and update
  async pushData(): Promise<void> {
    if (!this.url) {
      throw new Error("URL is required");
    }
    // get last sync timestamp
    let lastPushExternalSyncTimestamp = await this.eventStore.getLastPushExternalSyncTimestamp();

    const dropdowns = {} as Record<string, any>;
    for (const key in this.exportModels) {
      try {
        const value = this.exportModels[key];
        if (value && this.odooClient) {
          const data = await this.odooClient.searchRead(value.model, [], value.fields);
          dropdowns[key] = data;
        }
      } catch (error) {
        console.error(`Error fetching dropdown ${key}:`, error);
        continue;
      }
    }
    // get all events since last sync
    // const eventsToPush = await this.eventStore.getEventsSince(lastPushExternalSyncTimestamp);

    const allEvents = await this.eventStore.getAllEvents();
    const filteredEvents = allEvents.filter((event) => {
      const isLatest = event.timestamp > lastPushExternalSyncTimestamp;
      const isCreate = event.type === "create-individual";
      return event.data.entityName === "apg" || (isLatest && isCreate);
    });
    const groupedEvents = this.groupEventByApgId(filteredEvents);
    let updatedEvents: FormSubmission[] = [];

    for (const [apgGuid, groupData] of Object.entries(groupedEvents)) {
      try {
        const apgId = parseInt(groupData.apg.data.id);
        const administrativeArea = {
          province_id: parseInt(groupData.apg.data.province_id) || null,
          district_id: parseInt(groupData.apg.data.district_id) || null,
          area_id: parseInt(groupData.apg.data.village_id) || null,
        };

        // Process households
        if (groupData.households.length > 0) {
          for (const householdGroup of groupData.households) {
            try {
              const apgMember = householdGroup.household;
              const householdId = await this.createHouseholdData(apgId, apgMember, administrativeArea);

              if (apgMember.data.bank_details?.length > 0 && householdId) {
                for (const bankDetail of apgMember.data.bank_details) {
                  try {
                    await this.createBankAccount(householdId, bankDetail);
                  } catch (error) {
                    console.error("Error creating household bank account:", error);
                    continue;
                  }
                }
              }

              // Create document IDs if array exists
              if (apgMember.data.document_ids?.length > 0 && householdId) {
                for (const document of apgMember.data.document_ids) {
                  try {
                    await this.createRegistrantID(householdId, document);
                  } catch (error) {
                    console.error("Error creating household document ID:", error);
                    continue;
                  }
                }
              }
              if (householdId) {
                updatedEvents.push(apgMember);
              }
              // Process individuals under household
              const individualIds = [];
              for (const member of householdGroup.individuals) {
                try {
                  const individualId = await this.createIndividualData(apgId, member, administrativeArea);
                  const registeredIndividual = {
                    id: individualId,
                    registrant_kind: dropdowns.registrant_kind?.find(
                      (item: Record<string, any>) => item.name?.toLowerCase() === "apg",
                    ),
                    membership_kind: member.data.relationship,
                  };
                  if (individualId) {
                    updatedEvents.push(member);
                  }

                  // Create bank accounts if bank details array exists
                  if (member.data.bank_details?.length > 0 && individualId) {
                    for (const bankDetail of member.data.bank_details) {
                      try {
                        await this.createBankAccount(individualId, bankDetail);
                      } catch (error) {
                        console.error("Error creating individual bank account:", error);
                        continue;
                      }
                    }
                  }

                  // Create document IDs if array exists
                  if (member.data.document_ids?.length > 0 && individualId) {
                    for (const document of member.data.document_ids) {
                      try {
                        await this.createRegistrantID(individualId, document);
                      } catch (error) {
                        console.error("Error creating individual document ID:", error);
                        continue;
                      }
                    }
                  }

                  // Add training records if exists
                  if (member.data.training_records?.length > 0 && individualId) {
                    for (const training of member.data.training_records) {
                      try {
                        await this.createTrainingRecord(training, individualId);
                      } catch (error) {
                        console.error("Error creating training record:", error);
                        continue;
                      }
                    }
                  }
                  individualIds.push(registeredIndividual);
                } catch (error) {
                  console.error("Error processing individual:", error);
                  continue;
                }
              }

              // Link individuals to household
              if (individualIds.length > 0) {
                for (const ind of individualIds) {
                  try {
                    if (householdId && ind.id) {
                      await this.odooClient?.addMembersToGroup(householdId, [
                        {
                          individual: ind.id,
                          kind: [ind.membership_kind],
                        },
                      ]);
                    }
                  } catch (error) {
                    console.error(`Error linking member ${ind.id} to household:`, error);
                  }
                }
              }

              // Link household to APG
              if (householdId && apgId) {
                await this.odooClient?.addMembersToGroup(apgId, [
                  {
                    individual: householdId,
                  },
                ]);
              }
            } catch (error) {
              console.error("Error processing household:", error);
              continue;
            }
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

  async sync(credentials?: ExternalSyncCredentials): Promise<void> {
    const { url, database, registrarGroup } = this.config;

    if (!url || !database || !credentials) {
      throw new Error("URL, database and credentials are required");
    }
    const odooConfig: OdooConfig = {
      host: url as string,
      database: database as string,
      username: credentials?.username as string,
      password: credentials?.password as string,
      registrarGroup: registrarGroup as string
    };

    this.odooClient = new OdooClient(odooConfig);
    try {
      await this.odooClient.login();
    } catch (error) {
      throw new Error("Failed to login to Odoo");
    }

    await this.pushData();
    // await this.pullData();
  }
  async createHouseholdData(apgId: number, apgMember: any, administrativeArea: any): Promise<number | undefined> {
    const registration_date = apgMember.registration_date || "";
    const gps = apgMember.data.location_gps ? JSON.parse(apgMember.data.location_gps) : null;
    const coords = gps
      ? {
          longitude: gps.coords.longitude,
          latitude: gps.coords.latitude,
        }
      : null;
    const householdData = {
      is_registrant: true,
      is_group: true,
      name: apgMember.data.name,
      kind: 1,
      // registration_date: registration_date,
      hh_size: apgMember.data.household_size || 0,
      hh_status: "active",
      ethnic_group: apgMember.data.belongs_to_ethnic_group === "yes" ? true : false,
      longitude: coords ? coords.longitude : null,
      latitude: coords ? coords.latitude : null,
      ...administrativeArea,
    };
    return await this.odooClient?.createHousehold(apgId, householdData);
  }
  async createIndividualData(apgId: number, member: any, administrativeArea: any) {
    const ind_reg_date = member.data.registration_date || "";

    const gps = member.data.location_gps ? JSON.parse(member.data.location_gps) : null;
    const coords = gps
      ? {
          longitude: gps.coords.longitude,
          latitude: gps.coords.latitude,
        }
      : null;
    const memberData = {
      is_registrant: true,
      given_name: member.data.first_name,
      family_name: member.data.last_name,
      addl_name: member.data.middle_name,
      name: member.data.name || `${member.data.first_name} ${member.data.last_name}`,
      // registration_date: ind_reg_date,
      gender: member.data.gender || null,
      birthdate: member.data.date_of_birth ? this.formatDate(member.data.date_of_birth) : null,
      ethnic_group: member.data.belongs_to_ethnic_group === "yes" ? true : false,
      email: member.data.email_address || "",
      marital_status_id: member.data.marital_status || null,
      profession: member.data.profession || "",
      longitude: coords ? coords.longitude : null,
      latitude: coords ? coords.latitude : null,
      highest_education_level_id: member.data.education_level || null,
      phone: member.data.phone_number || "",
      ...administrativeArea,
    };

    return await this.odooClient?.createIndividual(apgId, memberData);
  }
  async createTrainingRecord(training: any, partnerId: number) {
    return await this.odooClient?.create("spp.training", {
      registrant_id: partnerId,
      type_of_training: training.training_type,
      training_period: training.training_start_date ? this.formatDate(training.training_start_date) : null,
      training_end: training.training_end_date ? this.formatDate(training.training_end_date) : null,
    });
  }
  async createRegistrantID(partnerId: number, data: any) {
    try {
      return await this.odooClient?.create("g2p.reg.id", {
        partner_id: partnerId,
        id_type: data.id_type,
        value: data.id_number,
        issuance_date: data.id_issuance_date ? this.formatDate(data.id_issuance_date) : null,
        expiry_date: data.id_expiry_date ? this.formatDate(data.id_expiry_date) : null,
        description: data.id_description || "",
      });
    } catch (error) {
      throw new Error("Failed to create registrant ID");
    }
  }

  async createBankAccount(partnerId: number, data: any): Promise<number | undefined> {
    try {
      if (data.bank_name) {
        return this.odooClient?.create("res.partner.bank", {
          partner_id: partnerId,
          bank_id: data.bank_name,
          acc_number: data.account_number || "",
          account_type: data.account_type || "",
          acc_holder_name: data.account_owner_name || "",
        });
      }
    } catch (error) {
      throw new Error("Failed to create bank account");
    }
  }
  async processCrop(apgCrop: any, apgId: number) {
    try {
      const cropActivities = apgCrop.data.crop_activities;
      let cropExternalId;
      const landRecord = {
        land_farm_id: apgId,
        province_id: apgCrop.data.province_id,
        district_id: apgCrop.data.district_id,
        area_id: apgCrop.data.area_id,
        land_size: apgCrop.data.land_size,
        land_size_unit: apgCrop.data.land_size_unit,
        agricultural_land_size: apgCrop.data.agricultural_land_size,
        agricultural_land_size_unit: apgCrop.data.agricultural_land_size_unit,
      };
      const newLandRecord = await this.odooClient?.create("spp.land.record", landRecord);

      for (const cropActivity of cropActivities) {
        const product = {
          prod_farm_id: apgId,
          activity_type: "crop",
          species_id: cropActivity.species_id || null,
          seasonal_timeline_id: apgCrop.data.seasonal_timeline_id,
        };
        const cropActivityData = {
          crop_land_id: newLandRecord,
          activity_type: "crop",
          species_id: cropActivity.species_id || null,
          crop_id: cropActivity.crop_id || null,
          crop_species: cropActivity.species || null,
          seeds_origin: cropActivity.seeds_origin || null,
          purpose: cropActivity.purpose || null,
          season_id: cropActivity.season_id || null,
          sowing_date: cropActivity.sowing_date ? this.formatDate(cropActivity.sowing_date) : null,
          harvest_date: cropActivity.harvest_date ? this.formatDate(cropActivity.harvest_date) : null,
          expected_yield: cropActivity.expected_yield || null,
          expected_yield_unit: cropActivity.expected_yield_unit || null,
          actual_yield: cropActivity.actual_yield || null,
          irrigation_type_ids: cropActivity.irrigation_type_ids || [],
          chemical_usage_ids: cropActivity.chemical_usage_ids || [],
          fertilizer_usage_ids: cropActivity.fertilizer_usage_ids || [],
        };
        try {
          await this.odooClient?.create("spp.farm.activity", product);
        } catch (error) {
          console.error(`Error creating spp.farm.activity product : ${JSON.stringify(product)}`);
          return null;
        }
        try {
          cropExternalId = await this.odooClient?.create("spp.farm.activity", cropActivityData);
        } catch (error) {
          console.error(`Error creating spp.farm.activity cropActivityData : ${JSON.stringify(cropActivityData)}`);
          return null;
        }
      }
    } catch (error) {
      // Log error but don't throw it
      console.error("Error processing crop for member:", apgCrop.prod_farm_id, error);
      // alert(`Error processing crop ${JSON.stringify(error)}`)
      // Continue execution
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
}

export default OpenSppSyncAdapter;
