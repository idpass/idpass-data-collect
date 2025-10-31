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
import type { OdooConfig, OpenSPPCreateIndividualPayload, OpenSPPCreateHouseholdPayload } from "./odoo-types";
import type { OpenSppAdapterOptions } from "./OpenSppAdapterOptions";
import { parseOpenSppAdapterOptions, resolveParentField } from "./OpenSppAdapterOptions";

interface GroupedData {
  households: {
    household: FormSubmission;
    individuals: FormSubmission[];
  }[];
  standaloneIndividuals: FormSubmission[];
}

interface RegisteredIndividual {
  id?: number | null;
  membershipKind?: number | null;
}

class OpenSppSyncAdapter implements ExternalSyncAdapter {
  private url: string;
  private odooClient: InstanceType<typeof OdooClient> | null = null;
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

  async pushData(credentials?: ExternalSyncCredentials): Promise<void> {
    if (!this.url) {
      throw new Error("URL is required");
    }
    await this.ensureClient(credentials);
    const lastPushExternalSyncTimestamp = await this.eventStore.getLastPushExternalSyncTimestamp();

    const allEvents = await this.eventStore.getAllEvents();
    const filteredEvents = this.filterSyncEvents(allEvents, lastPushExternalSyncTimestamp);
    const groupedEvents = this.groupEvents(filteredEvents);
    const updatedEvents: FormSubmission[] = [];

    console.log('GROUP_DATA' , JSON.stringify(groupedEvents, null, 2));

    // Process households
    for (const householdGroup of groupedEvents.households) {
      try {
        const householdEvent = householdGroup.household;
        const isCreate = householdEvent.type.startsWith("create-");
        const isUpdate = householdEvent.type.startsWith("update-");
        
        let householdId: number | undefined;
        if (isCreate) {
          householdId = await this.createHouseholdData(householdEvent);
        } else if (isUpdate) {
          householdId = await this.updateHouseholdData(householdEvent);
        }

        if (householdId) {
          updatedEvents.push(householdEvent);
        }

        const individualIds: RegisteredIndividual[] = [];
        const createIndividualIds = new Set<number>();

        for (const member of householdGroup.individuals) {
          try {
            const memberData = member.data as Record<string, unknown>;
            const isMemberCreate = member.type.startsWith("create-");
            const isMemberUpdate = member.type.startsWith("update-");
            
            let individualId: number | undefined;
            if (isMemberCreate) {
              individualId = await this.createIndividualData(member);
              if (individualId) {
                createIndividualIds.add(individualId);
              }
            } else if (isMemberUpdate) {
              individualId = await this.updateIndividualData(member);
              // Handle membership update if parentGuid changed
              await this.handleMembershipUpdate(member.entityGuid, member);
            }

            if (individualId) {
              updatedEvents.push(member);
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

        // Link members to household (only for creates)
        if (individualIds.length > 0 && householdId) {
          for (const registered of individualIds) {
            if (!registered.id || !createIndividualIds.has(registered.id)) {
              continue;
            }

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
      } catch (error) {
        console.error("Error processing household:", error);
      }
    }

    // Process standalone individuals
    for (const standaloneIndividual of groupedEvents.standaloneIndividuals) {
      try {
        const isCreate = standaloneIndividual.type.startsWith("create-");
        const isUpdate = standaloneIndividual.type.startsWith("update-");
        
        let individualId: number | undefined;
        if (isCreate) {
          individualId = await this.createIndividualData(standaloneIndividual);
        } else if (isUpdate) {
          individualId = await this.updateIndividualData(standaloneIndividual);
          // Handle membership update if parentGuid changed
          await this.handleMembershipUpdate(standaloneIndividual.entityGuid, standaloneIndividual);
        }

        if (individualId) {
          updatedEvents.push(standaloneIndividual);
        }
      } catch (error) {
        console.error("Error processing standalone individual:", error);
      }
    }

    const latestEventTimestamp = this.getLatestTimestamp(updatedEvents);
    if (latestEventTimestamp) {
      await this.eventStore.setLastPushExternalSyncTimestamp(latestEventTimestamp);
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
    const households = await this.odooClient!.fetchHouseholdsSince(lastPullExternalSyncTimestamp);
    const individuals = await this.odooClient!.fetchIndividualsSince(lastPullExternalSyncTimestamp);

    const events: FormSubmission[] = [];
    const errors: string[] = [];
    let latestTimestamp = lastPullExternalSyncTimestamp;

    const householdTransformer = new HouseholdTransformer(this.options.household);
    for (const household of households) {
      try {
        if (!household.id) {
          console.warn("Skipping household without ID:", household);
          continue;
        }

        const existingEntity = await this.eventApplierService.getEntityStore().getEntityByExternalId(String(household.id));
        const existingEntityGuid = existingEntity?.modified.guid;
        const event = householdTransformer.transform(household, undefined, existingEntityGuid);
        events.push(event);

        if (household.write_date && household.write_date > latestTimestamp) {
          latestTimestamp = household.write_date;
        }
      } catch (error) {
        const errorMsg = `Error transforming household ${household.id}: ${error instanceof Error ? error.message : String(error)}`;
        console.error(errorMsg);
        errors.push(errorMsg);
      }
    }

    const individualTransformer = new IndividualTransformer(this.options.individual);
    for (const individual of individuals) {
      try {
        if (!individual.id) {
          console.warn("Skipping individual without ID:", individual);
          continue;
        }

        const existingEntity = await this.eventApplierService.getEntityStore().getEntityByExternalId(String(individual.id));
        const existingEntityGuid = existingEntity?.modified.guid;
        const event = individualTransformer.transform(individual, undefined, existingEntityGuid);
        events.push(event);

        if (individual.write_date && individual.write_date > latestTimestamp) {
          latestTimestamp = individual.write_date;
        }
      } catch (error) {
        const errorMsg = `Error transforming individual ${individual.id}: ${error instanceof Error ? error.message : String(error)}`;
        console.error(errorMsg);
        errors.push(errorMsg);
      }
    }

    for (const event of events) {
      try {
        await this.eventApplierService.submitForm(event);
      } catch (error) {
        const errorMsg = `Error applying event for entity ${event.entityGuid}: ${error instanceof Error ? error.message : String(error)}`;
        console.error(errorMsg);
        errors.push(errorMsg);
      }
    }

    if (errors.length > 0) {
      console.warn(`OpenSPP pull sync completed with ${errors.length} errors:`, errors);
    }

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
    householdSubmission: FormSubmission,
  ): Promise<number | undefined> {
    const householdPayload = householdSubmission.data as Record<string, unknown>;

    const householdData: OpenSPPCreateHouseholdPayload = {
      is_registrant: true,
      is_group: true,
      name: this.getString(householdPayload, this.options.household.fieldMap?.name) ?? "",
      kind: 1,
      hh_size: this.parseInteger(this.getMappedField(householdPayload, this.options.household.fieldMap?.householdSize)) ?? 0,
      hh_status: "active",
    };

    return this.odooClient?.createHousehold(householdData);
  }

  async createIndividualData(
    member: FormSubmission,
  ): Promise<number | undefined> {
    const memberPayload = member.data as Record<string, unknown>;
    
    const firstName = this.getString(memberPayload, this.options.individual.fieldMap?.firstName) ?? "";
    const lastName = this.getString(memberPayload, this.options.individual.fieldMap?.lastName) ?? "";
    const middleName = this.getString(memberPayload, this.options.individual.fieldMap?.middleName);
    const fullName = this.getString(memberPayload, this.options.individual.fieldMap?.displayName);
    
    let displayName = fullName;
    if (!displayName) {
      if (lastName && firstName) {
        displayName = `${lastName.toUpperCase()}, ${firstName.toUpperCase()}`;
      } else {
        displayName = `${firstName} ${lastName}`.trim();
      }
    }

    let birthdate: string | undefined = undefined;
    const dateOfBirthField = this.getMappedField(memberPayload, this.options.individual.fieldMap?.dateOfBirth);
    if (dateOfBirthField) {
      if (typeof dateOfBirthField === "string") {
        const parsedDate = this.parseDateString(dateOfBirthField);
        birthdate = parsedDate || undefined;
      } else if (typeof dateOfBirthField === "object" && dateOfBirthField !== null) {
        const dateObj = dateOfBirthField as Record<string, unknown>;
        const year = this.parseInteger(dateObj.year);
        const month = this.parseInteger(dateObj.month);
        const day = this.parseInteger(dateObj.day);
        if (year && month && day) {
          birthdate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        }
      }
    }

    let gender: string | undefined = undefined;
    const genderField = this.getMappedField(memberPayload, this.options.individual.fieldMap?.gender);
    if (genderField) {
      const genderStr = String(genderField).toLowerCase();
      if (genderStr === "male") {
        gender = "male";
      } else if (genderStr === "female") {
        gender = "female";
      } else if (genderStr === "notmention" || genderStr === "not_mention") {
        gender = undefined;
      } else {
        gender = String(genderField);
      }
    }

    const individualData: OpenSPPCreateIndividualPayload = {
      is_registrant: true,
      is_group: false,
      name: displayName || undefined,
      family_name: lastName || undefined,
      given_name: firstName || undefined,
      addl_name: middleName || undefined,
      birthdate: birthdate,
      gender: gender,
      email: this.getString(memberPayload, this.options.individual.fieldMap?.email) || undefined,
      phone: this.getString(memberPayload, this.options.individual.fieldMap?.phone) || undefined,
    };

    return this.odooClient?.createIndividual(individualData);
  }

  private async resolveExternalIdFromEntity(entityGuid: string): Promise<number | undefined> {
    try {
      const entityPair = await this.eventApplierService.getEntityStore().getEntity(entityGuid);
      if (!entityPair) {
        return undefined;
      }
      const externalId = entityPair.modified.data.externalId;
      if (typeof externalId === "number") {
        return externalId;
      }
      if (typeof externalId === "string") {
        return this.parseInteger(externalId);
      }
      return undefined;
    } catch (error) {
      console.error(`Error resolving external ID for entity ${entityGuid}:`, error);
      return undefined;
    }
  }

  async updateHouseholdData(
    householdSubmission: FormSubmission,
  ): Promise<number | undefined> {
    const householdPayload = householdSubmission.data as Record<string, unknown>;
    const externalId = await this.resolveExternalIdFromEntity(householdSubmission.entityGuid);

    if (!externalId) {
      console.warn("Cannot update household: external ID not found", householdSubmission.entityGuid);
      return undefined;
    }

    const householdData: Partial<OpenSPPCreateHouseholdPayload> = {
      name: this.getString(householdPayload, this.options.household.fieldMap?.name) ?? "",
      hh_size: this.parseInteger(this.getMappedField(householdPayload, this.options.household.fieldMap?.householdSize)) ?? 0,
      hh_status: "active",
    };

    // Remove undefined values
    const updateData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(householdData)) {
      if (value !== undefined) {
        updateData[key] = value;
      }
    }

    if (Object.keys(updateData).length === 0) {
      return externalId;
    }

    await this.odooClient?.write("res.partner", [externalId], updateData);
    return externalId;
  }

  async updateIndividualData(
    member: FormSubmission,
  ): Promise<number | undefined> {
    const memberPayload = member.data as Record<string, unknown>;
    const externalId = await this.resolveExternalIdFromEntity(member.entityGuid);

    if (!externalId) {
      console.warn("Cannot update individual: external ID not found", member.entityGuid);
      return undefined;
    }

    const firstName = this.getString(memberPayload, this.options.individual.fieldMap?.firstName);
    const lastName = this.getString(memberPayload, this.options.individual.fieldMap?.lastName);
    const middleName = this.getString(memberPayload, this.options.individual.fieldMap?.middleName);
    const fullName = this.getString(memberPayload, this.options.individual.fieldMap?.displayName);
    
    let displayName = fullName;
    if (!displayName && lastName && firstName) {
      displayName = `${lastName.toUpperCase()}, ${firstName.toUpperCase()}`;
    } else if (!displayName) {
      displayName = `${firstName || ""} ${lastName || ""}`.trim();
    }

    let birthdate: string | undefined = undefined;
    const dateOfBirthField = this.getMappedField(memberPayload, this.options.individual.fieldMap?.dateOfBirth);
    if (dateOfBirthField) {
      if (typeof dateOfBirthField === "string") {
        const parsedDate = this.parseDateString(dateOfBirthField);
        birthdate = parsedDate || undefined;
      } else if (typeof dateOfBirthField === "object" && dateOfBirthField !== null) {
        const dateObj = dateOfBirthField as Record<string, unknown>;
        const year = this.parseInteger(dateObj.year);
        const month = this.parseInteger(dateObj.month);
        const day = this.parseInteger(dateObj.day);
        if (year && month && day) {
          birthdate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        }
      }
    }

    let gender: string | undefined = undefined;
    const genderField = this.getMappedField(memberPayload, this.options.individual.fieldMap?.gender);
    if (genderField) {
      const genderStr = String(genderField).toLowerCase();
      if (genderStr === "male") {
        gender = "male";
      } else if (genderStr === "female") {
        gender = "female";
      } else if (genderStr === "notmention" || genderStr === "not_mention") {
        gender = undefined;
      } else {
        gender = String(genderField);
      }
    }

    const updateData: Partial<OpenSPPCreateIndividualPayload> = {};
    if (displayName !== undefined) updateData.name = displayName || undefined;
    if (lastName !== undefined) updateData.family_name = lastName || undefined;
    if (firstName !== undefined) updateData.given_name = firstName || undefined;
    if (middleName !== undefined) updateData.addl_name = middleName || undefined;
    if (birthdate !== undefined) updateData.birthdate = birthdate;
    if (gender !== undefined) updateData.gender = gender;
    
    const email = this.getString(memberPayload, this.options.individual.fieldMap?.email);
    if (email !== undefined) updateData.email = email || undefined;
    
    const phone = this.getString(memberPayload, this.options.individual.fieldMap?.phone);
    if (phone !== undefined) updateData.phone = phone || undefined;

    // Remove undefined values
    const cleanUpdateData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updateData)) {
      if (value !== undefined) {
        cleanUpdateData[key] = value;
      }
    }

    if (Object.keys(cleanUpdateData).length === 0) {
      return externalId;
    }

    await this.odooClient?.write("res.partner", [externalId], cleanUpdateData);
    return externalId;
  }

  private async handleMembershipUpdate(
    individualGuid: string,
    individualEvent: FormSubmission,
  ): Promise<void> {
    try {
      const entityPair = await this.eventApplierService.getEntityStore().getEntity(individualGuid);
      if (!entityPair) {
        return;
      }

      const currentParentGuid = this.getString(
        individualEvent.data as Record<string, unknown>,
        resolveParentField(this.options.individual),
      );
      const previousParentGuid = this.getString(
        entityPair.modified.data as Record<string, unknown>,
        resolveParentField(this.options.individual),
      );

      const externalId = await this.resolveExternalIdFromEntity(individualGuid);
      if (!externalId) {
        return;
      }

      // If parentGuid changed, update membership
      if (currentParentGuid !== previousParentGuid) {
        const newParentExternalId = await this.resolveExternalIdFromEntity(currentParentGuid || "");
        if (newParentExternalId) {
          const memberData = individualEvent.data as Record<string, unknown>;
          const membershipKind = this.parseInteger(
            this.getMappedField(memberData, this.options.individual.fieldMap?.membershipKind),
          );

          const kindCommand: [number, number, number[]][] | undefined =
            typeof membershipKind === "number" && membershipKind > 0
              ? [[6, 0, [membershipKind]]]
              : undefined;

          // Add to new group
          await this.odooClient?.addMembersToGroup(newParentExternalId, [
            {
              individual: externalId,
              ...(kindCommand ? { kind: kindCommand } : {}),
            },
          ]);
        }
        // Note: OpenSPP typically handles removal from old group automatically when adding to new group
        // If explicit removal is needed, it would require fetching current memberships and removing them
      }
    } catch (error) {
      console.error(`Error handling membership update for individual ${individualGuid}:`, error);
    }
  }

  private parseDateString(dateString: string): string | null {
    if (!dateString || dateString === "00/00/0000" || dateString.trim() === "") {
      return null;
    }

    try {
      const isoFormat = /^(\d{4})-(\d{2})-(\d{2})$/;
      if (isoFormat.test(dateString)) {
        return dateString;
      }

      const slashFormat = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
      const match = dateString.match(slashFormat);
      if (match) {
        const month = String(match[1]).padStart(2, "0");
        const day = String(match[2]).padStart(2, "0");
        const year = match[3];
        return `${year}-${month}-${day}`;
      }

      const parsed = new Date(dateString);
      if (!isNaN(parsed.getTime())) {
        return parsed.toISOString().split("T")[0];
      }
    } catch {
      return null;
    }

    return null;
  }

  private filterSyncEvents(events: FormSubmission[], since: string): FormSubmission[] {
    return events.filter((event) => {
      if (!event.data || typeof event.data !== "object") {
        return false;
      }

      const entityName = this.getString(event.data, "entityName");
      const isHousehold = entityName === this.options.household.entityName;
      const isIndividual = entityName === this.options.individual.entityName;
      const isCreate = event.type.startsWith("create-");
      const isUpdate = event.type.startsWith("update-");
      const isNewer = event.timestamp > since;

      if ((isHousehold || isIndividual) && (isCreate || isUpdate) && isNewer) {
        return true;
      }

      return false;
    });
  }

  private groupEvents(events: FormSubmission[]): GroupedData {
    const grouped: GroupedData = {
      households: [],
      standaloneIndividuals: [],
    };
    const householdIndex = new Map<string, { household: FormSubmission; individuals: FormSubmission[] }>();
    const householdQueue: FormSubmission[] = [];
    const individualQueue: FormSubmission[] = [];

    for (const event of events) {
      if (!event.data || typeof event.data !== "object") {
        continue;
      }

      const entityName = this.getString(event.data, "entityName");

      if (entityName === this.options.household.entityName) {
        householdQueue.push(event);
        continue;
      }

      if (entityName === this.options.individual.entityName) {
        individualQueue.push(event);
      }
    }

    for (const householdEvent of householdQueue) {
      const container = {
        household: householdEvent,
        individuals: [],
      };

      grouped.households.push(container);
      householdIndex.set(householdEvent.entityGuid, container);
    }

    for (const individualEvent of individualQueue) {
      const parentGuid = this.getString(
        individualEvent.data as Record<string, unknown>,
        resolveParentField(this.options.individual),
      );

      if (!parentGuid) {
        grouped.standaloneIndividuals.push(individualEvent);
        continue;
      }

      const householdEntry = householdIndex.get(parentGuid);
      if (householdEntry) {
        householdEntry.individuals.push(individualEvent);
      } else {
        grouped.standaloneIndividuals.push(individualEvent);
      }
    }

    return grouped;
  }

  private getMappedField(data: Record<string, unknown>, key?: string): unknown {
    if (!key) {
      return undefined;
    }
    return data[key];
  }

  private getRequiredField(fieldName: string): string {
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

  private getString(data: Record<string, unknown>, key?: string): string | undefined {
    if (!key) {
      return undefined;
    }
    const value = data[key];
    return typeof value === "string" ? value : undefined;
  }

}

export default OpenSppSyncAdapter;

