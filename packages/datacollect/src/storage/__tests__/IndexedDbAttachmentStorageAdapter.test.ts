/**
 * @jest-environment jsdom
 */

import "fake-indexeddb/auto";
import "core-js/stable/structured-clone";
import { TextEncoder, TextDecoder } from "util";

// Polyfill TextEncoder/TextDecoder for jsdom environment
Object.assign(global, { TextEncoder, TextDecoder });

jest.mock("../../utils/logger", () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn(),
    fatal: jest.fn(),
    child: jest.fn().mockReturnThis(),
  }),
}));

import { IndexedDbAttachmentStorageAdapter } from "../IndexedDbAttachmentStorageAdapter";
import { AttachmentMetadata } from "../../interfaces/types";

describe("IndexedDbAttachmentStorageAdapter", () => {
  let adapter: IndexedDbAttachmentStorageAdapter;

  /** Helper to create a test ArrayBuffer with the given content. */
  function createTestData(content: string): ArrayBuffer {
    const encoder = new TextEncoder();
    return encoder.encode(content).buffer;
  }

  /** Helper to create a valid AttachmentMetadata object. */
  function createMetadata(overrides: Partial<AttachmentMetadata> = {}): AttachmentMetadata {
    return {
      guid: "att-1",
      entityGuid: "entity-1",
      filename: "test.txt",
      mimeType: "text/plain",
      sizeBytes: 11,
      hash: "abc123def456",
      createdAt: "2024-01-01T00:00:00.000Z",
      syncStatus: "pending",
      tenantId: "tenant-1",
      ...overrides,
    };
  }

  beforeEach(async () => {
    adapter = new IndexedDbAttachmentStorageAdapter("test-tenant");
    await adapter.initialize();
  });

  afterEach(async () => {
    await adapter.clearStore();
    await adapter.closeConnection();
  });

  describe("saveAttachment() and getAttachment()", () => {
    it("saves and retrieves an attachment with metadata and data", async () => {
      const metadata = createMetadata();
      const data = createTestData("hello world");

      await adapter.saveAttachment(metadata, data);

      const result = await adapter.getAttachment("att-1");
      expect(result).not.toBeNull();
      expect(result!.metadata).toEqual(metadata);

      const originalBytes = new Uint8Array(data);
      const retrievedBytes = new Uint8Array(result!.data);
      expect(retrievedBytes).toEqual(originalBytes);
    });

    it("returns null for a non-existent attachment", async () => {
      const result = await adapter.getAttachment("nonexistent");
      expect(result).toBeNull();
    });

    it("overwrites an existing attachment with the same GUID", async () => {
      const metadata1 = createMetadata({ filename: "original.txt" });
      const metadata2 = createMetadata({ filename: "updated.txt" });
      const data1 = createTestData("original");
      const data2 = createTestData("updated");

      await adapter.saveAttachment(metadata1, data1);
      await adapter.saveAttachment(metadata2, data2);

      const result = await adapter.getAttachment("att-1");
      expect(result!.metadata.filename).toBe("updated.txt");

      const retrievedText = new TextDecoder().decode(result!.data);
      expect(retrievedText).toBe("updated");
    });
  });

  describe("getAttachmentMetadata()", () => {
    it("returns metadata without binary data", async () => {
      const metadata = createMetadata();
      const data = createTestData("metadata only test");

      await adapter.saveAttachment(metadata, data);

      const result = await adapter.getAttachmentMetadata("att-1");
      expect(result).not.toBeNull();
      expect(result).toEqual(metadata);
    });

    it("returns null for a non-existent attachment", async () => {
      const result = await adapter.getAttachmentMetadata("nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("listAttachments()", () => {
    it("lists all attachments for a specific entity", async () => {
      await adapter.saveAttachment(
        createMetadata({ guid: "att-1", entityGuid: "entity-1", filename: "a.txt" }),
        createTestData("a"),
      );
      await adapter.saveAttachment(
        createMetadata({ guid: "att-2", entityGuid: "entity-1", filename: "b.txt" }),
        createTestData("b"),
      );
      await adapter.saveAttachment(
        createMetadata({ guid: "att-3", entityGuid: "entity-2", filename: "c.txt" }),
        createTestData("c"),
      );

      const entity1Attachments = await adapter.listAttachments("entity-1");
      expect(entity1Attachments).toHaveLength(2);
      expect(entity1Attachments.map((a) => a.guid).sort()).toEqual(["att-1", "att-2"]);
    });

    it("returns empty array when entity has no attachments", async () => {
      const result = await adapter.listAttachments("empty-entity");
      expect(result).toEqual([]);
    });

    it("uses the entityGuid index for filtering", async () => {
      // Save multiple attachments for different entities
      for (let i = 0; i < 5; i++) {
        await adapter.saveAttachment(
          createMetadata({ guid: `att-a-${i}`, entityGuid: "entity-a" }),
          createTestData(`data-a-${i}`),
        );
      }
      for (let i = 0; i < 3; i++) {
        await adapter.saveAttachment(
          createMetadata({ guid: `att-b-${i}`, entityGuid: "entity-b" }),
          createTestData(`data-b-${i}`),
        );
      }

      const entityAAttachments = await adapter.listAttachments("entity-a");
      expect(entityAAttachments).toHaveLength(5);

      const entityBAttachments = await adapter.listAttachments("entity-b");
      expect(entityBAttachments).toHaveLength(3);
    });
  });

  describe("deleteAttachment()", () => {
    it("removes both metadata and binary data", async () => {
      await adapter.saveAttachment(
        createMetadata({ guid: "att-1" }),
        createTestData("delete me"),
      );

      await adapter.deleteAttachment("att-1");

      const attachment = await adapter.getAttachment("att-1");
      expect(attachment).toBeNull();

      const metadata = await adapter.getAttachmentMetadata("att-1");
      expect(metadata).toBeNull();
    });

    it("does not affect other attachments", async () => {
      await adapter.saveAttachment(
        createMetadata({ guid: "att-1" }),
        createTestData("keep me"),
      );
      await adapter.saveAttachment(
        createMetadata({ guid: "att-2" }),
        createTestData("delete me"),
      );

      await adapter.deleteAttachment("att-2");

      const remaining = await adapter.getAttachment("att-1");
      expect(remaining).not.toBeNull();
      expect(remaining!.metadata.guid).toBe("att-1");
    });
  });

  describe("getPendingAttachments()", () => {
    it("returns only pending attachments for the specified tenant", async () => {
      await adapter.saveAttachment(
        createMetadata({ guid: "att-1", tenantId: "tenant-1", syncStatus: "pending" }),
        createTestData("pending-1"),
      );
      await adapter.saveAttachment(
        createMetadata({ guid: "att-2", tenantId: "tenant-1", syncStatus: "uploaded" }),
        createTestData("uploaded-1"),
      );
      await adapter.saveAttachment(
        createMetadata({ guid: "att-3", tenantId: "tenant-2", syncStatus: "pending" }),
        createTestData("pending-2"),
      );

      const pending = await adapter.getPendingAttachments("tenant-1");
      expect(pending).toHaveLength(1);
      expect(pending[0].guid).toBe("att-1");
    });

    it("returns empty array when no pending attachments exist", async () => {
      await adapter.saveAttachment(
        createMetadata({ guid: "att-1", syncStatus: "uploaded" }),
        createTestData("done"),
      );

      const pending = await adapter.getPendingAttachments("tenant-1");
      expect(pending).toEqual([]);
    });

    it("uses the compound tenantId_syncStatus index", async () => {
      // Save multiple attachments across tenants and statuses
      await adapter.saveAttachment(
        createMetadata({ guid: "att-1", tenantId: "t1", syncStatus: "pending" }),
        createTestData("1"),
      );
      await adapter.saveAttachment(
        createMetadata({ guid: "att-2", tenantId: "t1", syncStatus: "pending" }),
        createTestData("2"),
      );
      await adapter.saveAttachment(
        createMetadata({ guid: "att-3", tenantId: "t1", syncStatus: "failed" }),
        createTestData("3"),
      );
      await adapter.saveAttachment(
        createMetadata({ guid: "att-4", tenantId: "t2", syncStatus: "pending" }),
        createTestData("4"),
      );

      const t1Pending = await adapter.getPendingAttachments("t1");
      expect(t1Pending).toHaveLength(2);
      expect(t1Pending.map((a) => a.guid).sort()).toEqual(["att-1", "att-2"]);

      const t2Pending = await adapter.getPendingAttachments("t2");
      expect(t2Pending).toHaveLength(1);
      expect(t2Pending[0].guid).toBe("att-4");
    });
  });

  describe("updateSyncStatus()", () => {
    it("updates the sync status of an existing attachment", async () => {
      await adapter.saveAttachment(
        createMetadata({ guid: "att-1", syncStatus: "pending" }),
        createTestData("status test"),
      );

      await adapter.updateSyncStatus("att-1", "uploaded");

      const metadata = await adapter.getAttachmentMetadata("att-1");
      expect(metadata!.syncStatus).toBe("uploaded");
    });

    it("updates from uploaded to failed", async () => {
      await adapter.saveAttachment(
        createMetadata({ guid: "att-1", syncStatus: "uploaded" }),
        createTestData("fail test"),
      );

      await adapter.updateSyncStatus("att-1", "failed");

      const metadata = await adapter.getAttachmentMetadata("att-1");
      expect(metadata!.syncStatus).toBe("failed");
    });

    it("throws when attachment does not exist", async () => {
      await expect(adapter.updateSyncStatus("nonexistent", "uploaded")).rejects.toThrow(
        /not found/,
      );
    });
  });

  describe("clearStore()", () => {
    it("removes all metadata and data", async () => {
      await adapter.saveAttachment(
        createMetadata({ guid: "att-1" }),
        createTestData("data-1"),
      );
      await adapter.saveAttachment(
        createMetadata({ guid: "att-2" }),
        createTestData("data-2"),
      );

      await adapter.clearStore();

      const result1 = await adapter.getAttachment("att-1");
      const result2 = await adapter.getAttachment("att-2");
      expect(result1).toBeNull();
      expect(result2).toBeNull();
    });
  });

  describe("multi-tenant isolation", () => {
    it("creates separate databases for different tenants", async () => {
      const adapter1 = new IndexedDbAttachmentStorageAdapter("tenant-a");
      await adapter1.initialize();

      const adapter2 = new IndexedDbAttachmentStorageAdapter("tenant-b");
      await adapter2.initialize();

      await adapter1.saveAttachment(
        createMetadata({ guid: "att-1", tenantId: "tenant-a" }),
        createTestData("tenant-a data"),
      );

      // Different adapter/database should not have the same data
      const result = await adapter2.getAttachment("att-1");
      expect(result).toBeNull();

      // Original adapter should have the data
      const result1 = await adapter1.getAttachment("att-1");
      expect(result1).not.toBeNull();

      await adapter1.clearStore();
      await adapter1.closeConnection();
      await adapter2.clearStore();
      await adapter2.closeConnection();
    });
  });
});
