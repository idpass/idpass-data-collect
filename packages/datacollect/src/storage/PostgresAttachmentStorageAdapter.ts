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

import { Pool } from "pg";
import { and, eq } from "drizzle-orm";
import { AttachmentMetadata, AttachmentStore } from "../interfaces/types";
import { createLogger } from "../utils/logger";
import { createDrizzleFromPool, DrizzleDatabase } from "../db/connection";
import { attachments, attachmentData } from "../db/schema";

const log = createLogger("PostgresAttachmentStorageAdapter");

/**
 * PostgreSQL implementation of the AttachmentStore for server-side attachment persistence.
 *
 * Uses two tables:
 * - `attachments`: Stores attachment metadata with indexes for efficient queries.
 * - `attachment_data`: Stores binary file content as PostgreSQL BYTEA.
 *
 * Supports multi-tenant isolation via tenant_id column.
 */
export class PostgresAttachmentStorageAdapter implements AttachmentStore {
  private pool: Pool;
  private db: DrizzleDatabase;
  private tenantId: string;

  constructor(connectionString: string, tenantId?: string) {
    this.pool = new Pool({ connectionString });
    this.db = createDrizzleFromPool(this.pool);
    this.tenantId = tenantId || "default";
  }

  /**
   * Initializes the PostgreSQL tables for attachment storage.
   * Creates tables if they do not already exist. Idempotent and safe to call multiple times.
   */
  async initialize(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS attachments (
          guid TEXT PRIMARY KEY,
          entity_guid TEXT NOT NULL,
          filename TEXT NOT NULL,
          mime_type TEXT NOT NULL,
          size_bytes INTEGER NOT NULL,
          hash TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL,
          sync_status TEXT NOT NULL DEFAULT 'pending',
          tenant_id TEXT NOT NULL DEFAULT 'default'
        )
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_attachments_entity_guid ON attachments(entity_guid)
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_attachments_tenant_id ON attachments(tenant_id)
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_attachments_sync_status ON attachments(sync_status)
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_attachments_tenant_sync_status ON attachments(tenant_id, sync_status)
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS attachment_data (
          guid TEXT PRIMARY KEY,
          data BYTEA NOT NULL
        )
      `);
    } finally {
      client.release();
    }
  }

  /**
   * Saves attachment metadata and binary data.
   */
  async saveAttachment(metadata: AttachmentMetadata, data: ArrayBuffer): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .insert(attachments)
        .values({
          guid: metadata.guid,
          entityGuid: metadata.entityGuid,
          filename: metadata.filename,
          mimeType: metadata.mimeType,
          sizeBytes: metadata.sizeBytes,
          hash: metadata.hash,
          createdAt: new Date(metadata.createdAt),
          syncStatus: metadata.syncStatus,
          tenantId: metadata.tenantId,
        })
        .onConflictDoUpdate({
          target: attachments.guid,
          set: {
            entityGuid: metadata.entityGuid,
            filename: metadata.filename,
            mimeType: metadata.mimeType,
            sizeBytes: metadata.sizeBytes,
            hash: metadata.hash,
            createdAt: new Date(metadata.createdAt),
            syncStatus: metadata.syncStatus,
            tenantId: metadata.tenantId,
          },
        });

      await tx
        .insert(attachmentData)
        .values({
          guid: metadata.guid,
          data: Buffer.from(data),
        })
        .onConflictDoUpdate({
          target: attachmentData.guid,
          set: {
            data: Buffer.from(data),
          },
        });
    });
  }

  /**
   * Gets attachment metadata and binary data by GUID.
   */
  async getAttachment(guid: string): Promise<{ metadata: AttachmentMetadata; data: ArrayBuffer } | null> {
    const metadata = await this.getAttachmentMetadata(guid);
    if (!metadata) return null;

    const dataResult = await this.db
      .select({ data: attachmentData.data })
      .from(attachmentData)
      .where(eq(attachmentData.guid, guid));

    if (dataResult.length === 0) return null;

    const buffer = dataResult[0].data;
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;

    return { metadata, data: arrayBuffer };
  }

  /**
   * Gets only the metadata for an attachment.
   */
  async getAttachmentMetadata(guid: string): Promise<AttachmentMetadata | null> {
    const result = await this.db
      .select()
      .from(attachments)
      .where(eq(attachments.guid, guid));

    if (result.length === 0) return null;

    return this.rowToMetadata(result[0]);
  }

  /**
   * Lists all attachments for a specific entity within the current tenant.
   */
  async listAttachments(entityGuid: string): Promise<AttachmentMetadata[]> {
    const result = await this.db
      .select()
      .from(attachments)
      .where(
        and(
          eq(attachments.entityGuid, entityGuid),
          eq(attachments.tenantId, this.tenantId),
        ),
      );

    return result.map((row) => this.rowToMetadata(row));
  }

  /**
   * Deletes an attachment and its binary data.
   */
  async deleteAttachment(guid: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(attachmentData).where(eq(attachmentData.guid, guid));
      await tx.delete(attachments).where(eq(attachments.guid, guid));
    });
  }

  /**
   * Gets all attachments with 'pending' sync status for a tenant.
   */
  async getPendingAttachments(tenantId: string): Promise<AttachmentMetadata[]> {
    const result = await this.db
      .select()
      .from(attachments)
      .where(
        and(
          eq(attachments.tenantId, tenantId),
          eq(attachments.syncStatus, "pending"),
        ),
      );

    return result.map((row) => this.rowToMetadata(row));
  }

  /**
   * Updates the sync status of an attachment.
   */
  async updateSyncStatus(guid: string, status: AttachmentMetadata["syncStatus"]): Promise<void> {
    const result = await this.db
      .update(attachments)
      .set({ syncStatus: status })
      .where(eq(attachments.guid, guid));

    if (!result) {
      log.warn({ guid }, "Attachment not found when updating sync status");
    }
  }

  /**
   * Closes the PostgreSQL connection pool.
   */
  async closeConnection(): Promise<void> {
    await this.pool.end();
  }

  /**
   * Clears all attachment data for the current tenant.
   */
  async clearStore(): Promise<void> {
    // Get all attachment guids for this tenant
    const tenantAttachments = await this.db
      .select({ guid: attachments.guid })
      .from(attachments)
      .where(eq(attachments.tenantId, this.tenantId));

    if (tenantAttachments.length > 0) {
      for (const { guid } of tenantAttachments) {
        await this.db.delete(attachmentData).where(eq(attachmentData.guid, guid));
      }
    }

    await this.db.delete(attachments).where(eq(attachments.tenantId, this.tenantId));
  }

  /**
   * Converts a database row to an AttachmentMetadata object.
   */
  private rowToMetadata(row: typeof attachments.$inferSelect): AttachmentMetadata {
    return {
      guid: row.guid,
      entityGuid: row.entityGuid,
      filename: row.filename,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      hash: row.hash,
      createdAt: row.createdAt.toISOString(),
      syncStatus: row.syncStatus as AttachmentMetadata["syncStatus"],
      tenantId: row.tenantId,
    };
  }
}
