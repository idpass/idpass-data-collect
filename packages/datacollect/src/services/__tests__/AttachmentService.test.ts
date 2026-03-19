/**
 * @jest-environment jsdom
 */

import "core-js/stable/structured-clone";
import "fake-indexeddb/auto";
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

import { AttachmentService } from "../AttachmentService";
import { AttachmentMetadata, AttachmentStore } from "../../interfaces/types";

/**
 * In-memory mock implementation of AttachmentStore for unit testing.
 */
class InMemoryAttachmentStore implements AttachmentStore {
  private metadata = new Map<string, AttachmentMetadata>();
  private data = new Map<string, ArrayBuffer>();

  async saveAttachment(metadata: AttachmentMetadata, data: ArrayBuffer): Promise<void> {
    this.metadata.set(metadata.guid, { ...metadata });
    this.data.set(metadata.guid, data);
  }

  async getAttachment(guid: string): Promise<{ metadata: AttachmentMetadata; data: ArrayBuffer } | null> {
    const meta = this.metadata.get(guid);
    const binaryData = this.data.get(guid);
    if (!meta || !binaryData) return null;
    return { metadata: { ...meta }, data: binaryData };
  }

  async getAttachmentMetadata(guid: string): Promise<AttachmentMetadata | null> {
    const meta = this.metadata.get(guid);
    return meta ? { ...meta } : null;
  }

  async listAttachments(entityGuid: string): Promise<AttachmentMetadata[]> {
    const results: AttachmentMetadata[] = [];
    for (const meta of this.metadata.values()) {
      if (meta.entityGuid === entityGuid) {
        results.push({ ...meta });
      }
    }
    return results;
  }

  async deleteAttachment(guid: string): Promise<void> {
    this.metadata.delete(guid);
    this.data.delete(guid);
  }

  async getPendingAttachments(tenantId: string): Promise<AttachmentMetadata[]> {
    const results: AttachmentMetadata[] = [];
    for (const meta of this.metadata.values()) {
      if (meta.tenantId === tenantId && meta.syncStatus === "pending") {
        results.push({ ...meta });
      }
    }
    return results;
  }

  async updateSyncStatus(guid: string, status: AttachmentMetadata["syncStatus"]): Promise<void> {
    const meta = this.metadata.get(guid);
    if (meta) {
      meta.syncStatus = status;
    }
  }
}

describe("AttachmentService", () => {
  let store: InMemoryAttachmentStore;
  let service: AttachmentService;

  /** Helper to create a test ArrayBuffer with the given content. */
  function createTestData(content: string): ArrayBuffer {
    const encoder = new TextEncoder();
    return encoder.encode(content).buffer;
  }

  beforeEach(() => {
    store = new InMemoryAttachmentStore();
    service = new AttachmentService(store);
  });

  describe("saveAttachment()", () => {
    it("saves an attachment with computed SHA-256 hash", async () => {
      const data = createTestData("hello world");

      const metadata = await service.saveAttachment(
        {
          guid: "att-1",
          entityGuid: "entity-1",
          filename: "test.txt",
          mimeType: "text/plain",
          tenantId: "tenant-1",
        },
        data,
      );

      expect(metadata.guid).toBe("att-1");
      expect(metadata.entityGuid).toBe("entity-1");
      expect(metadata.filename).toBe("test.txt");
      expect(metadata.mimeType).toBe("text/plain");
      expect(metadata.sizeBytes).toBe(data.byteLength);
      expect(metadata.hash).toMatch(/^[0-9a-f]{64}$/);
      expect(metadata.syncStatus).toBe("pending");
      expect(metadata.tenantId).toBe("tenant-1");
      expect(metadata.createdAt).toBeTruthy();
    });

    it("computes a consistent hash for the same content", async () => {
      const data1 = createTestData("identical content");
      const data2 = createTestData("identical content");

      const meta1 = await service.saveAttachment(
        { guid: "att-1", entityGuid: "entity-1", filename: "a.txt", mimeType: "text/plain", tenantId: "t1" },
        data1,
      );

      const meta2 = await service.saveAttachment(
        { guid: "att-2", entityGuid: "entity-1", filename: "b.txt", mimeType: "text/plain", tenantId: "t1" },
        data2,
      );

      expect(meta1.hash).toBe(meta2.hash);
    });

    it("computes different hashes for different content", async () => {
      const data1 = createTestData("content A");
      const data2 = createTestData("content B");

      const meta1 = await service.saveAttachment(
        { guid: "att-1", entityGuid: "entity-1", filename: "a.txt", mimeType: "text/plain", tenantId: "t1" },
        data1,
      );

      const meta2 = await service.saveAttachment(
        { guid: "att-2", entityGuid: "entity-1", filename: "b.txt", mimeType: "text/plain", tenantId: "t1" },
        data2,
      );

      expect(meta1.hash).not.toBe(meta2.hash);
    });
  });

  describe("getAttachment()", () => {
    it("returns metadata and data for a saved attachment", async () => {
      const data = createTestData("test file content");

      await service.saveAttachment(
        { guid: "att-1", entityGuid: "entity-1", filename: "test.txt", mimeType: "text/plain", tenantId: "t1" },
        data,
      );

      const result = await service.getAttachment("att-1");
      expect(result).not.toBeNull();
      expect(result!.metadata.guid).toBe("att-1");
      expect(result!.metadata.filename).toBe("test.txt");

      // Verify binary data matches
      const originalBytes = new Uint8Array(data);
      const retrievedBytes = new Uint8Array(result!.data);
      expect(retrievedBytes).toEqual(originalBytes);
    });

    it("returns null for a non-existent attachment", async () => {
      const result = await service.getAttachment("nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("getAttachmentMetadata()", () => {
    it("returns only metadata without binary data", async () => {
      const data = createTestData("metadata only test");

      await service.saveAttachment(
        { guid: "att-1", entityGuid: "entity-1", filename: "meta.txt", mimeType: "text/plain", tenantId: "t1" },
        data,
      );

      const metadata = await service.getAttachmentMetadata("att-1");
      expect(metadata).not.toBeNull();
      expect(metadata!.guid).toBe("att-1");
      expect(metadata!.filename).toBe("meta.txt");
    });

    it("returns null for a non-existent attachment", async () => {
      const metadata = await service.getAttachmentMetadata("nonexistent");
      expect(metadata).toBeNull();
    });
  });

  describe("listAttachments()", () => {
    it("returns all attachments for a specific entity", async () => {
      await service.saveAttachment(
        { guid: "att-1", entityGuid: "entity-1", filename: "a.txt", mimeType: "text/plain", tenantId: "t1" },
        createTestData("a"),
      );
      await service.saveAttachment(
        { guid: "att-2", entityGuid: "entity-1", filename: "b.txt", mimeType: "text/plain", tenantId: "t1" },
        createTestData("b"),
      );
      await service.saveAttachment(
        { guid: "att-3", entityGuid: "entity-2", filename: "c.txt", mimeType: "text/plain", tenantId: "t1" },
        createTestData("c"),
      );

      const entity1Attachments = await service.listAttachments("entity-1");
      expect(entity1Attachments).toHaveLength(2);
      expect(entity1Attachments.map((a) => a.guid).sort()).toEqual(["att-1", "att-2"]);
    });

    it("returns empty array when entity has no attachments", async () => {
      const result = await service.listAttachments("no-attachments-entity");
      expect(result).toEqual([]);
    });
  });

  describe("deleteAttachment()", () => {
    it("removes attachment metadata and data", async () => {
      await service.saveAttachment(
        { guid: "att-1", entityGuid: "entity-1", filename: "delete.txt", mimeType: "text/plain", tenantId: "t1" },
        createTestData("to be deleted"),
      );

      await service.deleteAttachment("att-1");

      const result = await service.getAttachment("att-1");
      expect(result).toBeNull();

      const metadata = await service.getAttachmentMetadata("att-1");
      expect(metadata).toBeNull();
    });
  });

  describe("getPendingAttachments()", () => {
    it("returns only pending attachments for a specific tenant", async () => {
      await service.saveAttachment(
        { guid: "att-1", entityGuid: "entity-1", filename: "a.txt", mimeType: "text/plain", tenantId: "tenant-1" },
        createTestData("a"),
      );
      await service.saveAttachment(
        { guid: "att-2", entityGuid: "entity-2", filename: "b.txt", mimeType: "text/plain", tenantId: "tenant-1" },
        createTestData("b"),
      );
      await service.saveAttachment(
        { guid: "att-3", entityGuid: "entity-3", filename: "c.txt", mimeType: "text/plain", tenantId: "tenant-2" },
        createTestData("c"),
      );

      // Mark one as uploaded
      await service.updateSyncStatus("att-2", "uploaded");

      const pending = await service.getPendingAttachments("tenant-1");
      expect(pending).toHaveLength(1);
      expect(pending[0].guid).toBe("att-1");
    });

    it("returns empty array when no pending attachments exist", async () => {
      const pending = await service.getPendingAttachments("nonexistent-tenant");
      expect(pending).toEqual([]);
    });
  });

  describe("updateSyncStatus()", () => {
    it("updates the sync status of an attachment", async () => {
      await service.saveAttachment(
        { guid: "att-1", entityGuid: "entity-1", filename: "sync.txt", mimeType: "text/plain", tenantId: "t1" },
        createTestData("sync test"),
      );

      // Initially pending
      let metadata = await service.getAttachmentMetadata("att-1");
      expect(metadata!.syncStatus).toBe("pending");

      // Update to uploaded
      await service.updateSyncStatus("att-1", "uploaded");
      metadata = await service.getAttachmentMetadata("att-1");
      expect(metadata!.syncStatus).toBe("uploaded");

      // Update to failed
      await service.updateSyncStatus("att-1", "failed");
      metadata = await service.getAttachmentMetadata("att-1");
      expect(metadata!.syncStatus).toBe("failed");
    });
  });

  describe("validateFileSize()", () => {
    it("accepts files within the size limit", () => {
      expect(() => service.validateFileSize(1024)).not.toThrow();
      expect(() => service.validateFileSize(50 * 1024 * 1024)).not.toThrow();
    });

    it("rejects files exceeding the size limit", () => {
      expect(() => service.validateFileSize(50 * 1024 * 1024 + 1)).toThrow(
        /exceeds maximum allowed size/,
      );
    });

    it("rejects zero-byte files", () => {
      expect(() => service.validateFileSize(0)).toThrow(
        /must be greater than 0 bytes/,
      );
    });

    it("rejects negative file sizes", () => {
      expect(() => service.validateFileSize(-1)).toThrow(
        /must be greater than 0 bytes/,
      );
    });

    it("respects custom max file size", () => {
      const customService = new AttachmentService(store, { maxFileSizeBytes: 1024 });
      expect(() => customService.validateFileSize(1024)).not.toThrow();
      expect(() => customService.validateFileSize(1025)).toThrow(/exceeds maximum allowed size/);
    });
  });

  describe("validateMimeType()", () => {
    it("accepts allowed MIME types", () => {
      expect(() => service.validateMimeType("image/jpeg")).not.toThrow();
      expect(() => service.validateMimeType("application/pdf")).not.toThrow();
      expect(() => service.validateMimeType("text/plain")).not.toThrow();
      expect(() => service.validateMimeType("text/csv")).not.toThrow();
    });

    it("rejects disallowed MIME types", () => {
      expect(() => service.validateMimeType("application/x-executable")).toThrow(
        /is not allowed/,
      );
      expect(() => service.validateMimeType("application/octet-stream")).toThrow(
        /is not allowed/,
      );
    });

    it("respects custom allowed MIME types", () => {
      const customService = new AttachmentService(store, {
        allowedMimeTypes: ["image/png"],
      });
      expect(() => customService.validateMimeType("image/png")).not.toThrow();
      expect(() => customService.validateMimeType("image/jpeg")).toThrow(/is not allowed/);
    });
  });

  describe("saveAttachment() validation", () => {
    it("rejects files that are too large", async () => {
      const customService = new AttachmentService(store, { maxFileSizeBytes: 10 });
      const data = createTestData("this is more than 10 bytes");

      await expect(
        customService.saveAttachment(
          { guid: "att-1", entityGuid: "entity-1", filename: "big.txt", mimeType: "text/plain", tenantId: "t1" },
          data,
        ),
      ).rejects.toThrow(/exceeds maximum allowed size/);
    });

    it("rejects files with disallowed MIME types", async () => {
      const data = createTestData("executable content");

      await expect(
        service.saveAttachment(
          { guid: "att-1", entityGuid: "entity-1", filename: "bad.exe", mimeType: "application/x-executable", tenantId: "t1" },
          data,
        ),
      ).rejects.toThrow(/is not allowed/);
    });
  });
});
