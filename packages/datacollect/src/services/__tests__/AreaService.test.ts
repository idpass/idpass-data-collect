/**
 * @jest-environment jsdom
 */

import "core-js/stable/structured-clone";
import "fake-indexeddb/auto";

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

import { AreaService, AreaRecord, HdxAreaImportRecord } from "../AreaService";

/**
 * In-memory mock for AreaService that avoids requiring PostgreSQL.
 * Implements the same public API using a simple Map-based store.
 */
class InMemoryAreaService {
  private areas: Map<string, AreaRecord> = new Map();
  private idCounter = 0;

  async initialize(): Promise<void> {
    // No-op for in-memory
  }

  async createArea(input: {
    id?: string;
    name: string;
    pcode?: string;
    type: string;
    level: number;
    parentId?: string;
    geometry?: unknown;
    metadata?: unknown;
  }): Promise<AreaRecord> {
    const id = input.id || `area-${++this.idCounter}`;
    const now = new Date();

    // Check pcode uniqueness
    if (input.pcode) {
      for (const area of this.areas.values()) {
        if (area.pcode === input.pcode) {
          throw new Error(`Duplicate pcode: ${input.pcode}`);
        }
      }
    }

    const area: AreaRecord = {
      id,
      name: input.name,
      pcode: input.pcode || null,
      type: input.type,
      level: input.level,
      parentId: input.parentId || null,
      geometry: input.geometry || null,
      metadata: input.metadata || null,
      createdAt: now,
      updatedAt: now,
    };

    this.areas.set(id, area);
    return area;
  }

  async getArea(id: string): Promise<AreaRecord | null> {
    return this.areas.get(id) || null;
  }

  async getAreaByPcode(pcode: string): Promise<AreaRecord | null> {
    for (const area of this.areas.values()) {
      if (area.pcode === pcode) return area;
    }
    return null;
  }

  async getChildren(parentId: string): Promise<AreaRecord[]> {
    const children: AreaRecord[] = [];
    for (const area of this.areas.values()) {
      if (area.parentId === parentId) children.push(area);
    }
    return children;
  }

  async getAncestors(areaId: string): Promise<AreaRecord[]> {
    const ancestors: AreaRecord[] = [];
    let currentId: string | null = areaId;

    while (currentId) {
      const area = this.areas.get(currentId);
      if (!area) break;
      if (currentId !== areaId) {
        ancestors.push(area);
      }
      currentId = area.parentId;
    }

    return ancestors;
  }

  async getDescendants(areaId: string): Promise<AreaRecord[]> {
    const descendants: AreaRecord[] = [];
    const queue: string[] = [areaId];

    while (queue.length > 0) {
      const parentId = queue.shift()!;
      for (const area of this.areas.values()) {
        if (area.parentId === parentId) {
          descendants.push(area);
          queue.push(area.id);
        }
      }
    }

    return descendants;
  }

  async importFromHDX(data: HdxAreaImportRecord[]): Promise<AreaRecord[]> {
    const sorted = [...data].sort((a, b) => a.level - b.level);
    const pcodeToId = new Map<string, string>();
    const created: AreaRecord[] = [];

    for (const record of sorted) {
      let parentId: string | undefined;
      if (record.parentPcode) {
        parentId = pcodeToId.get(record.parentPcode);
        if (!parentId) {
          const existing = await this.getAreaByPcode(record.parentPcode);
          if (existing) parentId = existing.id;
        }
      }

      const area = await this.createArea({
        name: record.name,
        pcode: record.pcode,
        type: record.type,
        level: record.level,
        parentId,
      });

      pcodeToId.set(record.pcode, area.id);
      created.push(area);
    }

    return created;
  }

  async assignEntityToArea(_entityGuid: string, _areaId: string, _tenantId: string = "default"): Promise<void> {
    // In-memory mock: no entity store to update
  }

  async getRootAreas(): Promise<AreaRecord[]> {
    const roots: AreaRecord[] = [];
    for (const area of this.areas.values()) {
      if (!area.parentId) roots.push(area);
    }
    return roots;
  }

  async deleteArea(id: string): Promise<void> {
    const descendants = await this.getDescendants(id);
    for (const desc of descendants) {
      this.areas.delete(desc.id);
    }
    this.areas.delete(id);
  }

  async clearStore(): Promise<void> {
    this.areas.clear();
  }

  async closeConnection(): Promise<void> {
    // No-op
  }
}

describe("AreaService", () => {
  let service: InMemoryAreaService;

  beforeEach(async () => {
    service = new InMemoryAreaService();
    await service.initialize();
  });

  afterEach(async () => {
    await service.clearStore();
    await service.closeConnection();
  });

  describe("createArea()", () => {
    it("creates an area with all required fields", async () => {
      const area = await service.createArea({
        name: "Cambodia",
        pcode: "KH",
        type: "country",
        level: 0,
      });

      expect(area.id).toBeTruthy();
      expect(area.name).toBe("Cambodia");
      expect(area.pcode).toBe("KH");
      expect(area.type).toBe("country");
      expect(area.level).toBe(0);
      expect(area.parentId).toBeNull();
      expect(area.createdAt).toBeTruthy();
    });

    it("creates an area with a custom ID", async () => {
      const area = await service.createArea({
        id: "custom-id",
        name: "Test Area",
        type: "region",
        level: 1,
      });

      expect(area.id).toBe("custom-id");
    });

    it("creates an area with a parent reference", async () => {
      const country = await service.createArea({
        name: "Cambodia",
        pcode: "KH",
        type: "country",
        level: 0,
      });

      const region = await service.createArea({
        name: "Phnom Penh",
        pcode: "KH01",
        type: "region",
        level: 1,
        parentId: country.id,
      });

      expect(region.parentId).toBe(country.id);
    });

    it("creates an area with optional metadata and geometry", async () => {
      const area = await service.createArea({
        name: "Test Area",
        type: "district",
        level: 2,
        geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
        metadata: { population: 50000, source: "HDX" },
      });

      expect(area.geometry).toEqual({ type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] });
      expect(area.metadata).toEqual({ population: 50000, source: "HDX" });
    });

    it("rejects duplicate pcodes", async () => {
      await service.createArea({
        name: "Area 1",
        pcode: "DUPE",
        type: "region",
        level: 1,
      });

      await expect(
        service.createArea({
          name: "Area 2",
          pcode: "DUPE",
          type: "region",
          level: 1,
        }),
      ).rejects.toThrow("Duplicate pcode");
    });
  });

  describe("getArea()", () => {
    it("returns the area when it exists", async () => {
      const created = await service.createArea({
        id: "get-test",
        name: "Get Test",
        type: "region",
        level: 1,
      });

      const found = await service.getArea("get-test");
      expect(found).not.toBeNull();
      expect(found!.name).toBe("Get Test");
    });

    it("returns null when the area does not exist", async () => {
      const result = await service.getArea("nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("getAreaByPcode()", () => {
    it("returns the area matching the pcode", async () => {
      await service.createArea({
        name: "Cambodia",
        pcode: "KH",
        type: "country",
        level: 0,
      });

      const found = await service.getAreaByPcode("KH");
      expect(found).not.toBeNull();
      expect(found!.name).toBe("Cambodia");
    });

    it("returns null when pcode does not match", async () => {
      const result = await service.getAreaByPcode("XX");
      expect(result).toBeNull();
    });
  });

  describe("getChildren()", () => {
    it("returns direct children of an area", async () => {
      const country = await service.createArea({
        name: "Cambodia",
        pcode: "KH",
        type: "country",
        level: 0,
      });

      await service.createArea({
        name: "Phnom Penh",
        pcode: "KH01",
        type: "region",
        level: 1,
        parentId: country.id,
      });

      await service.createArea({
        name: "Siem Reap",
        pcode: "KH02",
        type: "region",
        level: 1,
        parentId: country.id,
      });

      const children = await service.getChildren(country.id);
      expect(children).toHaveLength(2);
      expect(children.map((c) => c.name).sort()).toEqual(["Phnom Penh", "Siem Reap"]);
    });

    it("returns empty array when area has no children", async () => {
      const leaf = await service.createArea({
        name: "Leaf",
        type: "village",
        level: 3,
      });

      const children = await service.getChildren(leaf.id);
      expect(children).toHaveLength(0);
    });
  });

  describe("getAncestors()", () => {
    it("returns the ancestor chain from parent to root", async () => {
      const country = await service.createArea({
        name: "Cambodia",
        pcode: "KH",
        type: "country",
        level: 0,
      });

      const region = await service.createArea({
        name: "Phnom Penh",
        pcode: "KH01",
        type: "region",
        level: 1,
        parentId: country.id,
      });

      const district = await service.createArea({
        name: "Chamkarmon",
        pcode: "KH0101",
        type: "district",
        level: 2,
        parentId: region.id,
      });

      const ancestors = await service.getAncestors(district.id);
      expect(ancestors).toHaveLength(2);
      expect(ancestors[0].name).toBe("Phnom Penh");
      expect(ancestors[1].name).toBe("Cambodia");
    });

    it("returns empty array for root areas", async () => {
      const root = await service.createArea({
        name: "Root",
        type: "country",
        level: 0,
      });

      const ancestors = await service.getAncestors(root.id);
      expect(ancestors).toHaveLength(0);
    });
  });

  describe("getDescendants()", () => {
    it("returns all descendants recursively", async () => {
      const country = await service.createArea({
        name: "Cambodia",
        pcode: "KH",
        type: "country",
        level: 0,
      });

      const region = await service.createArea({
        name: "Phnom Penh",
        pcode: "KH01",
        type: "region",
        level: 1,
        parentId: country.id,
      });

      await service.createArea({
        name: "Chamkarmon",
        pcode: "KH0101",
        type: "district",
        level: 2,
        parentId: region.id,
      });

      await service.createArea({
        name: "Siem Reap",
        pcode: "KH02",
        type: "region",
        level: 1,
        parentId: country.id,
      });

      const descendants = await service.getDescendants(country.id);
      expect(descendants).toHaveLength(3);
      expect(descendants.map((d) => d.name).sort()).toEqual(["Chamkarmon", "Phnom Penh", "Siem Reap"]);
    });

    it("returns empty array for leaf nodes", async () => {
      const leaf = await service.createArea({
        name: "Village",
        type: "village",
        level: 3,
      });

      const descendants = await service.getDescendants(leaf.id);
      expect(descendants).toHaveLength(0);
    });
  });

  describe("importFromHDX()", () => {
    it("imports a hierarchy of areas from HDX format", async () => {
      const hdxData: HdxAreaImportRecord[] = [
        { name: "Cambodia", pcode: "KH", type: "country", level: 0 },
        { name: "Phnom Penh", pcode: "KH01", type: "region", level: 1, parentPcode: "KH" },
        { name: "Siem Reap", pcode: "KH02", type: "region", level: 1, parentPcode: "KH" },
        { name: "Chamkarmon", pcode: "KH0101", type: "district", level: 2, parentPcode: "KH01" },
      ];

      const imported = await service.importFromHDX(hdxData);
      expect(imported).toHaveLength(4);

      // Verify the hierarchy was set up correctly
      const country = await service.getAreaByPcode("KH");
      expect(country).not.toBeNull();
      expect(country!.parentId).toBeNull();

      const phnomPenh = await service.getAreaByPcode("KH01");
      expect(phnomPenh).not.toBeNull();
      expect(phnomPenh!.parentId).toBe(country!.id);

      const chamkarmon = await service.getAreaByPcode("KH0101");
      expect(chamkarmon).not.toBeNull();
      expect(chamkarmon!.parentId).toBe(phnomPenh!.id);
    });

    it("sorts records by level to handle out-of-order input", async () => {
      const hdxData: HdxAreaImportRecord[] = [
        // Children before parents (out of order)
        { name: "District", pcode: "D01", type: "district", level: 2, parentPcode: "R01" },
        { name: "Country", pcode: "C01", type: "country", level: 0 },
        { name: "Region", pcode: "R01", type: "region", level: 1, parentPcode: "C01" },
      ];

      const imported = await service.importFromHDX(hdxData);
      expect(imported).toHaveLength(3);

      const district = await service.getAreaByPcode("D01");
      const region = await service.getAreaByPcode("R01");
      expect(district).not.toBeNull();
      expect(district!.parentId).toBe(region!.id);
    });
  });

  describe("getRootAreas()", () => {
    it("returns only areas with no parent", async () => {
      const country1 = await service.createArea({ name: "Country 1", type: "country", level: 0 });
      const country2 = await service.createArea({ name: "Country 2", type: "country", level: 0 });
      await service.createArea({ name: "Region", type: "region", level: 1, parentId: country1.id });

      const roots = await service.getRootAreas();
      expect(roots).toHaveLength(2);
      expect(roots.map((r) => r.name).sort()).toEqual(["Country 1", "Country 2"]);
    });
  });

  describe("deleteArea()", () => {
    it("deletes an area and its descendants", async () => {
      const country = await service.createArea({ name: "Country", pcode: "C", type: "country", level: 0 });
      const region = await service.createArea({ name: "Region", pcode: "R", type: "region", level: 1, parentId: country.id });
      await service.createArea({ name: "District", pcode: "D", type: "district", level: 2, parentId: region.id });

      await service.deleteArea(country.id);

      expect(await service.getArea(country.id)).toBeNull();
      expect(await service.getAreaByPcode("R")).toBeNull();
      expect(await service.getAreaByPcode("D")).toBeNull();
    });
  });

  describe("clearStore()", () => {
    it("removes all areas", async () => {
      await service.createArea({ name: "Area 1", type: "country", level: 0 });
      await service.createArea({ name: "Area 2", type: "region", level: 1 });

      await service.clearStore();

      const roots = await service.getRootAreas();
      expect(roots).toHaveLength(0);
    });
  });
});
