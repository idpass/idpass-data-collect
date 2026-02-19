import { createMerkleTree } from "../merkleTree";

describe("createMerkleTree", () => {
  test("throws error when entity list is empty", () => {
    expect(() => createMerkleTree([])).toThrow("Entity list is empty");
  });

  test("returns single hash for single entity", () => {
    const result = createMerkleTree(["entity1"]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatch(/^[a-f0-9]{64}$/);
  });

  test("returns single root hash for multiple entities", () => {
    const result = createMerkleTree(["entity1", "entity2", "entity3", "entity4"]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatch(/^[a-f0-9]{64}$/);
  });

  test("is deterministic - same input produces same root", () => {
    const entities = ["entity1", "entity2", "entity3"];
    const root1 = createMerkleTree(entities);
    const root2 = createMerkleTree(entities);
    expect(root1[0]).toBe(root2[0]);
  });

  test("different input produces different root", () => {
    const root1 = createMerkleTree(["entity1", "entity2"]);
    const root2 = createMerkleTree(["entity1", "entity3"]);
    expect(root1[0]).not.toBe(root2[0]);
  });

  test("order of entities matters", () => {
    const root1 = createMerkleTree(["entity1", "entity2"]);
    const root2 = createMerkleTree(["entity2", "entity1"]);
    expect(root1[0]).not.toBe(root2[0]);
  });

  test("handles odd number of entities", () => {
    const result = createMerkleTree(["entity1", "entity2", "entity3"]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatch(/^[a-f0-9]{64}$/);
  });

  test("handles even number of entities", () => {
    const result = createMerkleTree(["entity1", "entity2", "entity3", "entity4"]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatch(/^[a-f0-9]{64}$/);
  });

  test("two entities produce different root than one entity", () => {
    const root1 = createMerkleTree(["entity1"]);
    const root2 = createMerkleTree(["entity1", "entity2"]);
    expect(root1[0]).not.toBe(root2[0]);
  });

  test("handles large number of entities", () => {
    const entities = Array.from({ length: 100 }, (_, i) => `entity-${i}`);
    const result = createMerkleTree(entities);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatch(/^[a-f0-9]{64}$/);
  });

  test("uses JSON-serializable entity data correctly", () => {
    const entities = [JSON.stringify({ id: 1, name: "Alice" }), JSON.stringify({ id: 2, name: "Bob" })];
    const result = createMerkleTree(entities);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatch(/^[a-f0-9]{64}$/);
  });
});
