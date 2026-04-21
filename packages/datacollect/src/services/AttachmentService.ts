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

import { AttachmentMetadata, AttachmentStore } from "../interfaces/types";
import { createLogger } from "../utils/logger";

const log = createLogger("AttachmentService");

/** Default maximum file size: 50 MB */
const DEFAULT_MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

/** Default allowed MIME types */
const DEFAULT_ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
];

export interface AttachmentServiceOptions {
  /** Maximum file size in bytes (default: 50 MB) */
  maxFileSizeBytes?: number;
  /** Allowed MIME types (default: common document and image types) */
  allowedMimeTypes?: string[];
}

/**
 * Service for managing file attachments associated with entities.
 *
 * Wraps an AttachmentStore with business logic including:
 * - SHA-256 hash computation for content integrity verification
 * - File size validation against configurable limits
 * - MIME type validation against configurable allow-lists
 * - Sync status tracking for offline-first upload workflows
 */
export class AttachmentService {
  private store: AttachmentStore;
  private maxFileSizeBytes: number;
  private allowedMimeTypes: string[];

  constructor(store: AttachmentStore, options?: AttachmentServiceOptions) {
    this.store = store;
    this.maxFileSizeBytes = options?.maxFileSizeBytes ?? DEFAULT_MAX_FILE_SIZE_BYTES;
    this.allowedMimeTypes = options?.allowedMimeTypes ?? DEFAULT_ALLOWED_MIME_TYPES;
  }

  /**
   * Compute a SHA-256 hash of the given data.
   *
   * Uses the Web Crypto API (SubtleCrypto) when available (browser and Node 22+),
   * falling back to Node.js crypto module for server environments.
   */
  async computeHash(data: ArrayBuffer): Promise<string> {
    // Try SubtleCrypto first (available in browsers and Node 22+)
    if (typeof globalThis.crypto !== "undefined" && globalThis.crypto.subtle) {
      const hashBuffer = await globalThis.crypto.subtle.digest("SHA-256", data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    }

    // Fallback to Node.js crypto module
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodeCrypto = require("crypto");
    const hash = nodeCrypto.createHash("sha256");
    hash.update(Buffer.from(data));
    return hash.digest("hex");
  }

  /**
   * Validate file size against the configured maximum.
   * @throws {Error} If the file exceeds the maximum allowed size.
   */
  validateFileSize(sizeBytes: number): void {
    if (sizeBytes > this.maxFileSizeBytes) {
      throw new Error(
        `File size ${sizeBytes} bytes exceeds maximum allowed size of ${this.maxFileSizeBytes} bytes`,
      );
    }
    if (sizeBytes <= 0) {
      throw new Error("File size must be greater than 0 bytes");
    }
  }

  /**
   * Validate MIME type against the configured allow-list.
   * @throws {Error} If the MIME type is not in the allowed list.
   */
  validateMimeType(mimeType: string): void {
    if (!this.allowedMimeTypes.includes(mimeType)) {
      throw new Error(
        `MIME type "${mimeType}" is not allowed. Allowed types: ${this.allowedMimeTypes.join(", ")}`,
      );
    }
  }

  /**
   * Save an attachment with automatic hash computation and validation.
   *
   * @param params Attachment parameters (guid, entityGuid, filename, mimeType, tenantId)
   * @param data Binary content of the attachment
   * @returns The saved AttachmentMetadata with computed hash
   * @throws {Error} If file size or MIME type validation fails
   */
  async saveAttachment(
    params: {
      guid: string;
      entityGuid: string;
      filename: string;
      mimeType: string;
      tenantId: string;
    },
    data: ArrayBuffer,
  ): Promise<AttachmentMetadata> {
    const sizeBytes = data.byteLength;

    this.validateFileSize(sizeBytes);
    this.validateMimeType(params.mimeType);

    const hash = await this.computeHash(data);

    const metadata: AttachmentMetadata = {
      guid: params.guid,
      entityGuid: params.entityGuid,
      filename: params.filename,
      mimeType: params.mimeType,
      sizeBytes,
      hash,
      createdAt: new Date().toISOString(),
      syncStatus: "pending",
      tenantId: params.tenantId,
    };

    await this.store.saveAttachment(metadata, data);
    log.info({ guid: metadata.guid, entityGuid: metadata.entityGuid, sizeBytes }, "Attachment saved");

    return metadata;
  }

  /**
   * Get an attachment's metadata and binary data by GUID.
   */
  async getAttachment(guid: string): Promise<{ metadata: AttachmentMetadata; data: ArrayBuffer } | null> {
    return this.store.getAttachment(guid);
  }

  /**
   * Get only the metadata for an attachment (without loading binary data).
   */
  async getAttachmentMetadata(guid: string): Promise<AttachmentMetadata | null> {
    return this.store.getAttachmentMetadata(guid);
  }

  /**
   * List all attachments for a specific entity.
   */
  async listAttachments(entityGuid: string): Promise<AttachmentMetadata[]> {
    return this.store.listAttachments(entityGuid);
  }

  /**
   * Delete an attachment and its binary data.
   */
  async deleteAttachment(guid: string): Promise<void> {
    await this.store.deleteAttachment(guid);
    log.info({ guid }, "Attachment deleted");
  }

  /**
   * Get all attachments with 'pending' sync status for a tenant.
   */
  async getPendingAttachments(tenantId: string): Promise<AttachmentMetadata[]> {
    return this.store.getPendingAttachments(tenantId);
  }

  /**
   * Update the sync status of an attachment.
   */
  async updateSyncStatus(guid: string, status: AttachmentMetadata["syncStatus"]): Promise<void> {
    await this.store.updateSyncStatus(guid, status);
    log.info({ guid, status }, "Attachment sync status updated");
  }
}
