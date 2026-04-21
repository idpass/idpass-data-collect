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
import { AuditLogEntry, EntityStore, EventStore } from "../interfaces/types";
import { DuplicateDetectionService } from "./DuplicateDetectionService";
import { createLogger } from "../utils/logger";

const log = createLogger("VerificationService");

/**
 * Result of a duplicate check against the entity store.
 */
export interface DuplicateCheckResult {
  /** Whether potential duplicates were found */
  hasDuplicates: boolean;
  /** GUIDs of entities identified as potential duplicates */
  duplicateGuids: string[];
}

/**
 * Status of a verification record.
 */
export interface VerificationStatus {
  /** Unique identifier for this verification record */
  id: string;
  /** GUID of the form submission being verified */
  submissionGuid: string;
  /** GUID of the entity associated with the submission */
  entityGuid: string;
  /** Tenant this verification belongs to */
  tenantId: string;
  /** Verification status: "pending", "verified", "rejected", or "flagged" */
  status: "pending" | "verified" | "rejected" | "flagged";
  /** Result of the duplicate check, if performed */
  duplicateCheckResult: DuplicateCheckResult | null;
  /** User who completed the verification */
  verifiedBy: string | null;
  /** ISO timestamp when verification was completed */
  verifiedAt: string | null;
  /** Notes from the verifier */
  notes: string | null;
  /** ISO timestamp when the verification record was created */
  createdAt: string;
}

/**
 * Input for completing a verification.
 */
export interface VerificationResult {
  /** Verification outcome */
  status: "verified" | "rejected" | "flagged";
  /** User who performed the verification */
  verifiedBy: string;
  /** Notes from the verifier */
  notes: string;
}

/**
 * Manages the verification pipeline for self-service submissions.
 *
 * Self-service submissions route through this service to ensure they
 * are reviewed before being accepted into the system. The service
 * tracks verification status, runs duplicate checks, and logs audit
 * entries for compliance.
 *
 * Verification records are stored in-memory for client-side usage
 * (IndexedDB-based) and in PostgreSQL for server-side usage. The
 * in-memory implementation used here supports the client library;
 * the backend uses the database-backed OtpStore and verifications table.
 */
export class VerificationService {
  /** In-memory storage for verification records (client-side usage) */
  private verifications: Map<string, VerificationStatus> = new Map();

  constructor(
    private entityStore: EntityStore,
    private eventStore: EventStore,
    private duplicateDetectionService: DuplicateDetectionService,
  ) {}

  /**
   * Flag a self-service submission for verification.
   * Creates a verification record with "pending" status.
   *
   * @param submissionGuid GUID of the form submission to verify
   * @param entityGuid GUID of the entity the submission targets
   * @param tenantId Tenant the submission belongs to
   */
  async flagForVerification(
    submissionGuid: string,
    entityGuid: string,
    tenantId: string,
  ): Promise<void> {
    const verification: VerificationStatus = {
      id: uuidv4(),
      submissionGuid,
      entityGuid,
      tenantId,
      status: "pending",
      duplicateCheckResult: null,
      verifiedBy: null,
      verifiedAt: null,
      notes: null,
      createdAt: new Date().toISOString(),
    };

    this.verifications.set(submissionGuid, verification);

    log.info(
      { submissionGuid, entityGuid, tenantId },
      "Submission flagged for verification",
    );
  }

  /**
   * Run de-duplication check on the entity associated with a self-service submission.
   *
   * @param entityGuid GUID of the entity to check
   * @returns Result indicating whether duplicates were found
   */
  async checkDuplicates(entityGuid: string): Promise<DuplicateCheckResult> {
    const entity = await this.entityStore.getEntity(entityGuid);
    if (!entity) {
      return { hasDuplicates: false, duplicateGuids: [] };
    }

    // Use the existing duplicate detection service to find matches
    await this.duplicateDetectionService.checkForDuplicates(entityGuid, uuidv4());

    const potentialDuplicates = await this.entityStore.getPotentialDuplicates();
    const relevantDuplicates = potentialDuplicates.filter(
      (d) => d.entityGuid === entityGuid || d.duplicateGuid === entityGuid,
    );

    const duplicateGuids = relevantDuplicates
      .map((d) => (d.entityGuid === entityGuid ? d.duplicateGuid : d.entityGuid))
      .filter((guid) => guid !== entityGuid);

    return {
      hasDuplicates: duplicateGuids.length > 0,
      duplicateGuids,
    };
  }

  /**
   * Get verification status for a submission.
   *
   * @param submissionGuid GUID of the form submission
   * @returns The verification status, or null if no record exists
   */
  async getVerificationStatus(
    submissionGuid: string,
  ): Promise<VerificationStatus | null> {
    return this.verifications.get(submissionGuid) ?? null;
  }

  /**
   * Mark verification as complete with the given result.
   * Updates the verification record and logs an audit entry.
   *
   * @param submissionGuid GUID of the form submission
   * @param result The verification outcome
   * @throws Error if no verification record exists for the submission
   */
  async completeVerification(
    submissionGuid: string,
    result: VerificationResult,
  ): Promise<void> {
    const verification = this.verifications.get(submissionGuid);
    if (!verification) {
      throw new Error("Verification record not found");
    }

    verification.status = result.status;
    verification.verifiedBy = result.verifiedBy;
    verification.verifiedAt = new Date().toISOString();
    verification.notes = result.notes;

    this.verifications.set(submissionGuid, verification);

    // Log audit entry for the verification completion
    const auditEntry: AuditLogEntry = {
      guid: uuidv4(),
      timestamp: new Date().toISOString(),
      userId: result.verifiedBy,
      action: "complete-verification",
      eventGuid: submissionGuid,
      entityGuid: verification.entityGuid,
      changes: {
        status: result.status,
        notes: result.notes,
      },
      signature: "",
    };

    try {
      await this.eventStore.logAuditEntry(auditEntry);
    } catch (error) {
      log.error({ err: error }, "Failed to log verification audit entry");
    }

    log.info(
      { submissionGuid, status: result.status, verifiedBy: result.verifiedBy },
      "Verification completed",
    );
  }

  /**
   * Get all verification records for a specific tenant.
   *
   * @param tenantId The tenant to filter by
   * @returns Array of verification records for the tenant
   */
  async getVerificationsByTenant(
    tenantId: string,
  ): Promise<VerificationStatus[]> {
    const results: VerificationStatus[] = [];
    for (const verification of this.verifications.values()) {
      if (verification.tenantId === tenantId) {
        results.push(verification);
      }
    }
    return results;
  }
}
