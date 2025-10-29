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
} from "../../interfaces/types";
import OdooClient from "./OdooClient";
import { EventApplierService } from "../../services/EventApplierService";
import { HouseholdTransformer } from "./pullTransformers/HouseholdTransformer";
import { IndividualTransformer } from "./pullTransformers/IndividualTransformer";
import type { OdooConfig } from "./odoo-types";
import type { OpenSppAdapterOptions, OpenSppEntityOptions } from "./OpenSppAdapterOptions";
import { parseOpenSppAdapterOptions, resolveParentField } from "./OpenSppAdapterOptions";

interface GroupedData {
  root: FormSubmission;
  households: {
    household: FormSubmission;
    individuals: FormSubmission[];
  }[];
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
  private odooClient: InstanceType<typeof OdooClient> | null = null;
  private _lastCredentials: ExternalSyncCredentials | null = null;
  private options: OpenSppAdapterOptions;

  constructor(
    private eventStore: EventStore,
    private eventApplierService: EventApplierService,
    private config: ExternalSyncConfig,
  ) {
    this.url = (this.config?.url as string | undefined) ?? "";
    this.options = parseOpenSppAdapterOptions(config);
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
    const filteredEvents = this.filterSyncEvents(allEvents, lastPushExternalSyncTimestamp);
    const groupedEvents = this.groupEvents(filteredEvents);
    const updatedEvents: FormSubmission[] = [];

    for (const groupData of Object.values(groupedEvents)) {
      try {
        const rootPayload = groupData.root.data as Record<string, unknown>;
        const rootId = this.resolveExternalId(rootPayload, this.options.root);

        if (!rootId) {
          console.error("Unable to determine root partner identifier for event", groupData.root);
          continue;
        }

        const _administrativeArea = this.resolveAdministrativeArea(rootPayload, this.options.root);

        for (const householdGroup of groupData.households) {
          try {
            const householdEvent = householdGroup.household;
            const householdData = householdEvent.data as Record<string, unknown>;
            const householdArea = this.resolveAdministrativeArea(householdData, this.options.household);
            const householdId = await this.createHouseholdData(rootId, householdEvent, householdArea);

            const householdBankDetails = this.extractCollection(
              householdData,
              this.options.household.collections?.bankDetails,
            );
            if (householdBankDetails.length > 0 && householdId) {
              for (const bankDetail of householdBankDetails) {
                try {
                  await this.createBankAccount(householdId, bankDetail);
                } catch (error) {
                  console.error("Error creating household bank account:", error);
                }
              }
            }

            const householdDocuments = this.extractCollection(
              householdData,
              this.options.household.collections?.documents,
            );
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
                const individualArea = this.resolveAdministrativeArea(memberData, this.options.individual);
                const individualId = await this.createIndividualData(rootId, member, individualArea);

                if (individualId) {
                  updatedEvents.push(member);
                }

                const memberBankDetails = this.extractCollection(
                  memberData,
                  this.options.individual.collections?.bankDetails,
                );
                if (memberBankDetails.length > 0 && individualId) {
                  for (const bankDetail of memberBankDetails) {
                    try {
                      await this.createBankAccount(individualId, bankDetail);
                    } catch (error) {
                      console.error("Error creating individual bank account:", error);
                    }
                  }
                }

                const memberDocuments = this.extractCollection(
                  memberData,
                  this.options.individual.collections?.documents,
                );
                if (memberDocuments.length > 0 && individualId) {
                  for (const document of memberDocuments) {
                    try {
                      await this.createRegistrantID(individualId, document);
                    } catch (error) {
                      console.error("Error creating individual document ID:", error);
                    }
                  }
                }

                const trainingRecords = this.extractCollection(
                  memberData,
                  this.options.individual.collections?.trainings,
                );
                if (trainingRecords.length > 0 && individualId) {
                  for (const training of trainingRecords) {
                    try {
                      await this.createTrainingRecord(training, individualId);
                    } catch (error) {
                      console.error("Error creating training record:", error);
                    }
                  }
                }

                const membershipKind = this.parseInteger(
                  this.getMappedField(memberData, this.options.individual.fieldMap?.membershipKind),
                );
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

                // kind is a Many2many field, so it needs Odoo command format
                // Command (6, 0, [ids]) means "replace all links with these IDs"
                // Common values: 1=Head, 2=Spouse, 3=Child, 4=Other
                // If no kind is specified, omit the field to let OpenSPP use its default
                const kindCommand: [number, number, number[]][] | undefined =
                  typeof registered.membershipKind === "number" && registered.membershipKind > 0
                    ? [[6, 0, [registered.membershipKind]]]
                    : undefined;

                try {
                  await this.odooClient?.addMembersToGroup(householdId, [
                    {
                      individual: registered.id,
                      ...(kindCommand ? { kind: kindCommand } : {}),
                    },
                  ]);
                } catch (error) {
                  console.error(`Error linking member ${registered.id} to household:`, error);
                }
              }
            }

            if (householdId) {
              await this.odooClient?.addMembersToGroup(rootId, [
                {
                  individual: householdId,
                },
              ]);
            }
          } catch (error) {
            console.error("Error processing household:", error);
          }
        }
      } catch (error) {
        console.error("Error processing root partner group:", error);
        continue;
      }
    }

    const latestEventTimestamp = this.getLatestTimestamp(updatedEvents);
    if (latestEventTimestamp) {
      // Update the sync timestamp after each successful batch
      await this.eventStore.setLastPushExternalSyncTimestamp(latestEventTimestamp);
      lastPushExternalSyncTimestamp = latestEventTimestamp;
    }
  }

  private getLatestTimestamp(events: FormSubmission[]): string | null {
    if (!Array.isArray(events) || events.length === 0) return null;
    const timestamps = events.map((event: FormSubmission) => event.timestamp).filter((timestamp) => timestamp != null);

    return timestamps.length > 0 ? timestamps.reduce((latest, current) => (current > latest ? current : latest)) : null;
  }

  async pullData(): Promise<void> {
    if (!this.url) {
      throw new Error("URL is required");
    }

    await this.ensureClient();

    const lastPullExternalSyncTimestamp = await this.eventStore.getLastPullExternalSyncTimestamp();

    // Fetch households and individuals since last pull
    const households = await this.odooClient!.fetchHouseholdsSince(lastPullExternalSyncTimestamp);
    const individuals = await this.odooClient!.fetchIndividualsSince(lastPullExternalSyncTimestamp);

    const events: FormSubmission[] = [];
    const errors: string[] = [];
    let latestTimestamp = lastPullExternalSyncTimestamp;

    // Transform and apply household events
    const householdTransformer = new HouseholdTransformer(this.options.household);
    for (const household of households) {
      try {
        if (!household.id) {
          console.warn("Skipping household without ID:", household);
          continue;
        }

        // Check if entity already exists by externalId
        const existingEntity = await this.eventApplierService.getEntityStore().getEntityByExternalId(String(household.id));
        const existingEntityGuid = existingEntity?.modified.guid;

        const event = householdTransformer.transform(household, undefined, existingEntityGuid);
        events.push(event);

        // Track latest timestamp
        if (household.write_date && household.write_date > latestTimestamp) {
          latestTimestamp = household.write_date;
        }
      } catch (error) {
        const errorMsg = `Error transforming household ${household.id}: ${error instanceof Error ? error.message : String(error)}`;
        console.error(errorMsg);
        errors.push(errorMsg);
      }
    }

    // Transform and apply individual events
    const individualTransformer = new IndividualTransformer(this.options.individual);
    for (const individual of individuals) {
      try {
        if (!individual.id) {
          console.warn("Skipping individual without ID:", individual);
          continue;
        }

        // Check if entity already exists by externalId
        const existingEntity = await this.eventApplierService.getEntityStore().getEntityByExternalId(String(individual.id));
        const existingEntityGuid = existingEntity?.modified.guid;

        const event = individualTransformer.transform(individual, undefined, existingEntityGuid);
        events.push(event);

        // Track latest timestamp
        if (individual.write_date && individual.write_date > latestTimestamp) {
          latestTimestamp = individual.write_date;
        }
      } catch (error) {
        const errorMsg = `Error transforming individual ${individual.id}: ${error instanceof Error ? error.message : String(error)}`;
        console.error(errorMsg);
        errors.push(errorMsg);
      }
    }

    // Apply all events to the system
    for (const event of events) {
      try {
        await this.eventApplierService.submitForm(event);
      } catch (error) {
        const errorMsg = `Error applying event for entity ${event.entityGuid}: ${error instanceof Error ? error.message : String(error)}`;
        console.error(errorMsg);
        errors.push(errorMsg);
      }
    }

    // Log aggregated errors if any
    if (errors.length > 0) {
      console.warn(`OpenSPP pull sync completed with ${errors.length} errors:`, errors);
    }

    // Update pull timestamp after successful processing
    if (latestTimestamp && latestTimestamp > lastPullExternalSyncTimestamp) {
      await this.eventStore.setLastPullExternalSyncTimestamp(latestTimestamp);
    }
  }

  async sync(credentials?: ExternalSyncCredentials): Promise<void> {
    const authenticated = await this.authenticate(credentials);
    if (!authenticated) {
      throw new Error("Failed to authenticate with OpenSPP");
    }
    await this.pushData(credentials);
    await this.pullData();
  }

  private async ensureClient(_credentials?: ExternalSyncCredentials): Promise<void> {
    if (this.odooClient) {
      return;
    }

    const database = this.getRequiredField("database");
    const username = this.getRequiredField("username");
    const password = this.getRequiredField("password");
    const registrarGroup = this.getOptionalField("registrarGroup");

    if (!this.url || !database || !username || !password) {
      throw new Error("URL, database and credentials are required");
    }

    const odooConfig: OdooConfig = {
      host: this.url,
      database,
      username,
      password,
      registrarGroup,
    };

    this.odooClient = new OdooClient(odooConfig);
    await this.odooClient.login();
  }

  async createHouseholdData(
    rootId: number,
    householdSubmission: FormSubmission,
    administrativeArea: AdministrativeArea,
  ): Promise<number | undefined> {
    const householdPayload = householdSubmission.data as Record<string, unknown>;
    const gpsCoordinates = this.parseCoordinates(this.getMappedField(householdPayload, this.options.household.fieldMap?.location));

    const householdData = {
      is_registrant: true,
      is_group: true,
      name: this.getString(householdPayload, this.options.household.fieldMap?.name) ?? "",
      kind: 1,
      hh_size: this.parseInteger(this.getMappedField(householdPayload, this.options.household.fieldMap?.householdSize)) ?? 0,
      hh_status: "active",
      ethnic_group: this.isAffirmative(this.getMappedField(householdPayload, this.options.household.fieldMap?.belongsToEthnicGroup)),
      longitude: gpsCoordinates?.longitude,
      latitude: gpsCoordinates?.latitude,
      ...administrativeArea,
    };

    return this.odooClient?.createHousehold(rootId, householdData);
  }

  async createIndividualData(
    rootId: number,
    member: FormSubmission,
    administrativeArea: AdministrativeArea,
  ): Promise<number | undefined> {
    const memberPayload = member.data as Record<string, unknown>;
    const gpsCoordinates = this.parseCoordinates(this.getMappedField(memberPayload, this.options.individual.fieldMap?.location));
    const firstName = this.getString(memberPayload, this.options.individual.fieldMap?.firstName) ?? "";
    const lastName = this.getString(memberPayload, this.options.individual.fieldMap?.lastName) ?? "";
    const displayName =
      this.getString(memberPayload, this.options.individual.fieldMap?.displayName) || `${firstName} ${lastName}`.trim();
    const birthdate = this.getString(memberPayload, this.options.individual.fieldMap?.dateOfBirth);

    const individualData = {
      is_registrant: true,
      given_name: firstName,
      family_name: lastName,
      addl_name: this.getString(memberPayload, this.options.individual.fieldMap?.middleName),
      name: displayName,
      gender: this.getString(memberPayload, this.options.individual.fieldMap?.gender),
      birthdate: birthdate ? this.formatDate(birthdate) : null,
      ethnic_group: this.isAffirmative(this.getMappedField(memberPayload, this.options.individual.fieldMap?.belongsToEthnicGroup)),
      email: this.getString(memberPayload, this.options.individual.fieldMap?.email) ?? "",
      marital_status_id: this.parseInteger(this.getMappedField(memberPayload, this.options.individual.fieldMap?.maritalStatus)),
      profession: this.getString(memberPayload, this.options.individual.fieldMap?.profession) ?? "",
      longitude: gpsCoordinates?.longitude,
      latitude: gpsCoordinates?.latitude,
      highest_education_level_id: this.parseInteger(this.getMappedField(memberPayload, this.options.individual.fieldMap?.educationLevel)),
      phone: this.getString(memberPayload, this.options.individual.fieldMap?.phone) ?? "",
      ...administrativeArea,
    };

    return this.odooClient?.createIndividual(rootId, individualData);
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

  private filterSyncEvents(events: FormSubmission[], since: string): FormSubmission[] {
    return events.filter((event) => {
      if (!event.data || typeof event.data !== "object") {
        return false;
      }

      const entityName = this.getString(event.data, "entityName");
      const isRoot = entityName === this.options.root.entityName;
      const isHousehold = entityName === this.options.household.entityName;
      const isIndividual = entityName === this.options.individual.entityName;
      const isCreate = event.type.startsWith("create-");
      const isNewer = event.timestamp > since;

      if (isRoot) {
        return true;
      }

      if ((isHousehold || isIndividual) && isCreate && isNewer) {
        return true;
      }

      return false;
    });
  }

  private groupEvents(events: FormSubmission[]): Record<string, GroupedData> {
    const grouped: Record<string, GroupedData> = {};
    const householdIndex = new Map<string, { rootGuid: string; container: { household: FormSubmission; individuals: FormSubmission[] } }>();
    const householdQueue: FormSubmission[] = [];
    const individualQueue: FormSubmission[] = [];

    for (const event of events) {
      if (!event.data || typeof event.data !== "object") {
        continue;
      }

      const entityName = this.getString(event.data, "entityName");

      if (entityName === this.options.root.entityName) {
        grouped[event.entityGuid] = {
          root: event,
          households: [],
        };
        continue;
      }

      if (entityName === this.options.household.entityName) {
        householdQueue.push(event);
        continue;
      }

      if (entityName === this.options.individual.entityName) {
        individualQueue.push(event);
      }
    }

    for (const householdEvent of householdQueue) {
      const parentGuid = this.getString(
        householdEvent.data as Record<string, unknown>,
        resolveParentField(this.options.household),
      );

      if (!parentGuid) {
        continue;
      }

      const group = grouped[parentGuid];
      if (!group) {
        continue;
      }

      const container = {
        household: householdEvent,
        individuals: [],
      };

      group.households.push(container);
      householdIndex.set(householdEvent.entityGuid, { rootGuid: parentGuid, container });
    }

    for (const individualEvent of individualQueue) {
      const parentGuid = this.getString(
        individualEvent.data as Record<string, unknown>,
        resolveParentField(this.options.individual),
      );

      if (!parentGuid) {
        continue;
      }

      const householdEntry = householdIndex.get(parentGuid);
      if (!householdEntry) {
        continue;
      }

      householdEntry.container.individuals.push(individualEvent);
    }

    return grouped;
  }

  private resolveAdministrativeArea(data: Record<string, unknown>, option: OpenSppEntityOptions): AdministrativeArea {
    const province = this.parseInteger(this.getMappedField(data, option.fieldMap?.province));
    const district = this.parseInteger(this.getMappedField(data, option.fieldMap?.district));
    const area = this.parseInteger(this.getMappedField(data, option.fieldMap?.area));

    if (province === undefined && district === undefined && area === undefined) {
      return {
        province_id: undefined,
        district_id: undefined,
        area_id: undefined,
      };
    }

    return {
      province_id: province,
      district_id: district,
      area_id: area,
    };
  }

  private resolveExternalId(data: Record<string, unknown>, option: OpenSppEntityOptions): number | undefined {
    const idField = option.fieldMap?.id ?? "id";
    return this.parseInteger(this.getMappedField(data, idField));
  }

  private extractCollection(payload: Record<string, unknown>, key?: string): Record<string, unknown>[] {
    if (!key) {
      return [];
    }
    return this.getRecordArray(payload, key);
  }

  private getMappedField(data: Record<string, unknown>, key?: string): unknown {
    if (!key) {
      return undefined;
    }
    return data[key];
  }

  private _getStringFromMapping(data: Record<string, unknown>, key?: string): string | undefined {
    if (!key) {
      return undefined;
    }
    return this.getString(data, key);
  }

  private getRequiredField(fieldName: string): string {
    console.log("getRequiredField", fieldName, this.config);
    const value = this.getOptionalField(fieldName);
    if (!value) {
      throw new Error(`Missing required OpenSPP configuration field: ${fieldName}`);
    }
    return value;
  }

  private getOptionalField(fieldName: string): string | undefined {
    return this.config.extraFields?.find((field) => field.name === fieldName)?.value;
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

  private getString(data: Record<string, unknown>, key?: string): string | undefined {
    if (!key) {
      return undefined;
    }
    const value = data[key];
    return typeof value === "string" ? value : undefined;
  }

  private getRecordArray(data: Record<string, unknown>, key: string): Record<string, unknown>[] {
    const value = data[key];
    return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
  }

  private _getNumberArray(data: Record<string, unknown>, key: string): number[] {
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

