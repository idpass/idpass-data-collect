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

import { v4 as uuidv4 } from "uuid";
import {
  EntityDoc,
  EntityStore,
  EventStore,
  FormSubmission,
  SyncLevel,
} from "../interfaces/types";
import { EventApplierService } from "./EventApplierService";
import { createLogger } from "../utils/logger";

const log = createLogger("SelfServiceManager");

/**
 * Configuration for self-service mode within a tenant.
 */
export interface SelfServiceConfig {
  /** Whether self-service mode is enabled for this tenant */
  enabled: boolean;
  /** Authentication methods available to beneficiaries */
  authMethods: ("otp" | "id" | "qr" | "oidc")[];
  /** Form types that beneficiaries can submit through self-service */
  allowedForms: string[];
  /** Languages supported for the self-service interface */
  languages: string[];
  /** Whether all self-service submissions require review before being applied */
  requireReview: boolean;
  /** OIDC configuration for eSignet authentication */
  oidcConfig?: {
    /** eSignet issuer URL */
    authority: string;
    /** Registered OIDC client ID */
    clientId: string;
    /** Web app callback URL */
    redirectUri: string;
    /** OIDC scopes to request */
    scope: string;
    /** eSignet level of assurance */
    acrValues?: string;
    /** How to map OIDC claims to entity fields */
    entityMapping: {
      primaryClaim: string;
      fallbackClaim?: string;
      entityField: string;
      fallbackField?: string;
    };
  };
}

/**
 * Describes a form available for self-service submission.
 */
export interface FormConfig {
  /** The event type this form generates (e.g., "update-individual") */
  type: string;
  /** Human-readable label for the form */
  label: string;
}

/**
 * Manages self-service interactions where beneficiaries can view and update
 * their own records. Provides a restricted API surface compared to the
 * full EntityDataManager, ensuring beneficiaries can only access their own data.
 *
 * All submissions through this manager generate standard events that flow
 * through the same event sourcing pipeline as field worker submissions.
 */
export class SelfServiceManager {
  constructor(
    private entityStore: EntityStore,
    private eventStore: EventStore,
    private eventApplierService: EventApplierService,
  ) {}

  /**
   * Get the authenticated beneficiary's own entity.
   *
   * @param entityGuid The GUID of the entity (from the self-service JWT claims)
   * @returns The entity document, or null if not found
   */
  async getOwnEntity(entityGuid: string): Promise<EntityDoc | null> {
    const entityPair = await this.entityStore.getEntity(entityGuid);
    if (!entityPair) {
      return null;
    }
    return entityPair.modified;
  }

  /**
   * Submit a self-service form that updates the beneficiary's own record.
   * Creates an "update-individual" event targeting the entity.
   *
   * @param entityGuid The GUID of the entity to update
   * @param formData The data fields to update
   * @param userId The self-service user identifier (from JWT)
   */
  async submitSelfServiceForm(
    entityGuid: string,
    formData: Record<string, unknown>,
    userId: string,
  ): Promise<void> {
    const entityPair = await this.entityStore.getEntity(entityGuid);
    if (!entityPair) {
      throw new Error("Entity not found");
    }

    const submission: FormSubmission = {
      guid: uuidv4(),
      entityGuid,
      type: "update-individual",
      data: formData,
      timestamp: new Date().toISOString(),
      userId,
      syncLevel: SyncLevel.LOCAL,
    };

    log.info(
      { entityGuid, userId, formGuid: submission.guid },
      "Self-service form submitted",
    );

    await this.eventApplierService.submitForm(submission);
  }

  /**
   * Get forms available for self-service based on tenant configuration.
   *
   * @param config The self-service configuration for the tenant
   * @returns Array of form configurations available to beneficiaries
   */
  getAvailableForms(config: SelfServiceConfig): FormConfig[] {
    if (!config.enabled) {
      return [];
    }

    return config.allowedForms.map((formType) => ({
      type: formType,
      label: this.formatFormLabel(formType),
    }));
  }

  /**
   * Get submission history for an entity. Returns all events targeting
   * the specified entity, providing a complete change history.
   *
   * @param entityGuid The GUID of the entity
   * @returns Array of form submissions for this entity
   */
  async getSubmissionHistory(entityGuid: string): Promise<FormSubmission[]> {
    const allEvents = await this.eventStore.getAllEvents();
    return allEvents.filter((event) => event.entityGuid === entityGuid);
  }

  /**
   * Converts a form type string like "update-individual" into a
   * human-readable label like "Update Individual".
   */
  private formatFormLabel(formType: string): string {
    return formType
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }
}
