/**
 * Tests for AppInstanceStore.loadEntityData — verifying that entity types
 * are correctly inferred from form config and members are linked to parents.
 */

import { SyncLevel } from "@idpass/data-collect-core";
import { AppInstanceStoreImpl } from "../stores/AppInstanceStore";
import { AppConfig, AppConfigStore } from "../types";

// Capture all submitForm calls to verify event types and data
const submitFormCalls: Array<{ type: string; entityGuid: string; data: Record<string, unknown> }> =
  [];

// Mock uuid to produce deterministic GUIDs
let uuidCounter = 0;
jest.mock("uuid", () => ({
  v4: () => `mock-uuid-${++uuidCounter}`,
}));

// Mock the data-collect-core module so we don't need PostgreSQL
jest.mock("@idpass/data-collect-core", () => {
  const actual = jest.requireActual("@idpass/data-collect-core");
  return {
    ...actual,
    EntityDataManager: jest.fn(),
    EntityStoreImpl: jest.fn().mockImplementation(() => ({ initialize: jest.fn() })),
    EventStoreImpl: jest.fn().mockImplementation(() => ({ initialize: jest.fn() })),
    EventApplierService: jest.fn().mockImplementation(() => ({})),
    ExternalSyncManager: jest.fn().mockImplementation(() => ({ initialize: jest.fn() })),
    PostgresEntityStorageAdapter: jest.fn(),
    PostgresEventStorageAdapter: jest.fn(),
    AuthManager: jest.fn(),
  };
});

/** Build a minimal AppConfigStore mock that returns the given config */
function buildConfigStore(config: AppConfig): AppConfigStore {
  return {
    initialize: jest.fn(),
    getConfigs: jest.fn().mockResolvedValue([config]),
    getConfig: jest.fn().mockResolvedValue(config),
    getConfigByArtifactId: jest.fn(),
    saveConfig: jest.fn(),
    deleteConfig: jest.fn(),
    clearStore: jest.fn(),
    closeConnection: jest.fn(),
  };
}

/** Build an AppInstanceStoreImpl and inject a mock EDM that captures submitForm calls */
async function buildStore(config: AppConfig) {
  const configStore = buildConfigStore(config);
  const store = new AppInstanceStoreImpl(configStore, "postgresql://fake");

  // Create a fake app instance with a mock EDM
  const mockEdm = {
    submitForm: jest.fn().mockImplementation((form: Record<string, unknown>) => {
      submitFormCalls.push({
        type: form.type as string,
        entityGuid: form.entityGuid as string,
        data: form.data as Record<string, unknown>,
      });
      return Promise.resolve();
    }),
    closeConnection: jest.fn(),
    clearStore: jest.fn(),
  };

  // Inject the mock instance directly via createAppInstance override
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (store as any).instances[config.id] = { configId: config.id, edm: mockEdm };

  return { store, mockEdm };
}

describe("AppInstanceStore.loadEntityData", () => {
  beforeEach(() => {
    submitFormCalls.length = 0;
    uuidCounter = 0;
  });

  test("creates households as groups (not individuals)", async () => {
    const config: AppConfig = {
      id: "test",
      name: "Test",
      entityForms: [
        { id: "household", name: "household", title: "Household", formio: {} },
        {
          id: "individual",
          name: "individual",
          title: "Individual",
          dependsOn: "household",
          formio: {},
        },
      ],
      entityData: [
        {
          name: "household",
          data: [{ id: "hh-001", name: "Test Family" }],
        },
      ],
    };

    const { store } = await buildStore(config);
    await store.loadEntityData("test");

    expect(submitFormCalls).toHaveLength(1);
    expect(submitFormCalls[0].type).toBe("create-group");
    expect(submitFormCalls[0].entityGuid).toBe("hh-001");
    expect(submitFormCalls[0].data.entityName).toBe("household");
  });

  test("creates individuals with create-individual event type", async () => {
    const config: AppConfig = {
      id: "test",
      name: "Test",
      entityForms: [
        { id: "household", name: "household", title: "Household", formio: {} },
        {
          id: "individual",
          name: "individual",
          title: "Individual",
          dependsOn: "household",
          formio: {},
        },
      ],
      entityData: [
        {
          name: "individual",
          data: [{ id: "ind-001", name: "Alice", parentId: "hh-001" }],
        },
      ],
    };

    const { store } = await buildStore(config);
    await store.loadEntityData("test");

    const createCalls = submitFormCalls.filter((c) => c.type === "create-individual");
    expect(createCalls).toHaveLength(1);
    expect(createCalls[0].entityGuid).toBe("ind-001");
  });

  test("links individuals to parent groups via add-member event", async () => {
    const config: AppConfig = {
      id: "test",
      name: "Test",
      entityForms: [
        { id: "household", name: "household", title: "Household", formio: {} },
        {
          id: "individual",
          name: "individual",
          title: "Individual",
          dependsOn: "household",
          formio: {},
        },
        {
          id: "training",
          name: "training",
          title: "Training",
          dependsOn: "individual",
          formio: {},
        },
      ],
      entityData: [
        {
          name: "household",
          data: [{ id: "hh-001", name: "Test Family" }],
        },
        {
          name: "individual",
          data: [{ id: "ind-001", name: "Alice", parentId: "hh-001" }],
        },
      ],
    };

    const { store } = await buildStore(config);
    await store.loadEntityData("test");

    const addMemberCalls = submitFormCalls.filter((c) => c.type === "add-member");
    expect(addMemberCalls).toHaveLength(1);
    expect(addMemberCalls[0].entityGuid).toBe("hh-001");
    expect(addMemberCalls[0].data.members).toEqual([
      { guid: "ind-001", name: "Alice", type: "individual" },
    ]);
  });

  test("standalone individuals (no parentId) do not generate add-member events", async () => {
    const config: AppConfig = {
      id: "test",
      name: "Test",
      entityForms: [
        { id: "household", name: "household", title: "Household", formio: {} },
        {
          id: "individual",
          name: "individual",
          title: "Individual",
          dependsOn: "household",
          formio: {},
        },
      ],
      entityData: [
        {
          name: "individual",
          data: [{ id: "ind-standalone", name: "Standalone Person" }],
        },
      ],
    };

    const { store } = await buildStore(config);
    await store.loadEntityData("test");

    const addMemberCalls = submitFormCalls.filter((c) => c.type === "add-member");
    expect(addMemberCalls).toHaveLength(0);

    const createCalls = submitFormCalls.filter((c) => c.type === "create-individual");
    expect(createCalls).toHaveLength(1);
    expect(createCalls[0].entityGuid).toBe("ind-standalone");
  });

  test("multiple group types work (household + cooperative)", async () => {
    const config: AppConfig = {
      id: "test",
      name: "Test",
      entityForms: [
        { id: "household", name: "household", title: "Household", formio: {} },
        { id: "cooperative", name: "cooperative", title: "Cooperative", formio: {} },
        {
          id: "individual",
          name: "individual",
          title: "Individual",
          dependsOn: "household",
          formio: {},
        },
      ],
      entityData: [
        {
          name: "household",
          data: [{ id: "hh-001", name: "Test Family" }],
        },
        {
          name: "cooperative",
          data: [{ id: "coop-001", name: "Farmers Coop" }],
        },
      ],
    };

    const { store } = await buildStore(config);
    await store.loadEntityData("test");

    const groupCalls = submitFormCalls.filter((c) => c.type === "create-group");
    expect(groupCalls).toHaveLength(2);
    expect(groupCalls[0].data.entityName).toBe("household");
    expect(groupCalls[1].data.entityName).toBe("cooperative");
  });

  test("custom dependent forms are created as individuals with correct entityName", async () => {
    const config: AppConfig = {
      id: "test",
      name: "Test",
      entityForms: [
        { id: "household", name: "household", title: "Household", formio: {} },
        {
          id: "home_visit",
          name: "home_visit",
          title: "Home Visit",
          dependsOn: "household",
          formio: {},
        },
        {
          id: "individual",
          name: "individual",
          title: "Individual",
          dependsOn: "household",
          formio: {},
        },
        {
          id: "training",
          name: "training",
          title: "Training",
          dependsOn: "individual",
          formio: {},
        },
      ],
      entityData: [
        {
          name: "home_visit",
          data: [
            {
              id: "hv-001",
              name: "Visit 2025-06-10",
              parentId: "hh-001",
              purpose: "assessment",
            },
          ],
        },
        {
          name: "training",
          data: [
            {
              id: "tr-001",
              name: "Ag Skills Training",
              parentId: "ind-001",
              status: "completed",
            },
          ],
        },
      ],
    };

    const { store } = await buildStore(config);
    await store.loadEntityData("test");

    const createCalls = submitFormCalls.filter((c) => c.type === "create-individual");
    expect(createCalls).toHaveLength(2);

    const homeVisit = createCalls.find((c) => c.data.entityName === "home_visit");
    expect(homeVisit).toBeDefined();
    expect(homeVisit!.entityGuid).toBe("hv-001");
    expect(homeVisit!.data.purpose).toBe("assessment");

    const training = createCalls.find((c) => c.data.entityName === "training");
    expect(training).toBeDefined();
    expect(training!.entityGuid).toBe("tr-001");
    expect(training!.data.status).toBe("completed");

    // Record forms (home_visit, training) should NOT produce add-member events.
    // Only forms that are themselves dependsOn targets (entity-creating forms) get add-member.
    const addMemberCalls = submitFormCalls.filter((c) => c.type === "add-member");
    expect(addMemberCalls).toHaveLength(0);
  });

  test("processes groups before individuals (two-pass ordering)", async () => {
    const config: AppConfig = {
      id: "test",
      name: "Test",
      entityForms: [
        { id: "household", name: "household", title: "Household", formio: {} },
        {
          id: "individual",
          name: "individual",
          title: "Individual",
          dependsOn: "household",
          formio: {},
        },
        {
          id: "training",
          name: "training",
          title: "Training",
          dependsOn: "individual",
          formio: {},
        },
      ],
      entityData: [
        {
          name: "individual",
          data: [{ id: "ind-001", name: "Alice", parentId: "hh-001" }],
        },
        {
          name: "household",
          data: [{ id: "hh-001", name: "Test Family" }],
        },
      ],
    };

    const { store } = await buildStore(config);
    await store.loadEntityData("test");

    // Group should be created first regardless of entityData order
    expect(submitFormCalls[0].type).toBe("create-group");
    expect(submitFormCalls[1].type).toBe("create-individual");
    expect(submitFormCalls[2].type).toBe("add-member");
  });

  test("does nothing when entityData is absent", async () => {
    const config: AppConfig = {
      id: "test",
      name: "Test",
      entityForms: [{ id: "household", name: "household", title: "Household", formio: {} }],
    };

    const { store } = await buildStore(config);
    await store.loadEntityData("test");

    expect(submitFormCalls).toHaveLength(0);
  });

  test("uses SyncLevel.REMOTE for all submissions", async () => {
    const config: AppConfig = {
      id: "test",
      name: "Test",
      entityForms: [
        { id: "household", name: "household", title: "Household", formio: {} },
        {
          id: "individual",
          name: "individual",
          title: "Individual",
          dependsOn: "household",
          formio: {},
        },
      ],
      entityData: [
        { name: "household", data: [{ id: "hh-001", name: "Test" }] },
        { name: "individual", data: [{ id: "ind-001", name: "Alice", parentId: "hh-001" }] },
      ],
    };

    const { store, mockEdm } = await buildStore(config);
    await store.loadEntityData("test");

    for (const call of mockEdm.submitForm.mock.calls) {
      expect(call[0].syncLevel).toBe(SyncLevel.REMOTE);
    }
  });

  test("record forms (home_visit, assistance) are NOT added as members of groups", async () => {
    const config: AppConfig = {
      id: "test",
      name: "Test",
      entityForms: [
        { id: "household", name: "household", title: "Household", formio: {} },
        {
          id: "individual",
          name: "individual",
          title: "Individual",
          dependsOn: "household",
          formio: {},
        },
        {
          id: "home_visit",
          name: "home_visit",
          title: "Home Visit",
          dependsOn: "household",
          formio: {},
        },
        {
          id: "assistance",
          name: "assistance",
          title: "Assistance",
          dependsOn: "household",
          formio: {},
        },
        {
          id: "training",
          name: "training",
          title: "Training",
          dependsOn: "individual",
          formio: {},
        },
      ],
      entityData: [
        { name: "household", data: [{ id: "hh-001", name: "Test Family" }] },
        { name: "individual", data: [{ id: "ind-001", name: "Alice", parentId: "hh-001" }] },
        {
          name: "home_visit",
          data: [{ id: "hv-001", name: "Visit 1", parentId: "hh-001", purpose: "assessment" }],
        },
        {
          name: "assistance",
          data: [{ id: "ast-001", name: "Cash Transfer", parentId: "hh-001", amount: 500 }],
        },
      ],
    };

    const { store } = await buildStore(config);
    await store.loadEntityData("test");

    const addMemberCalls = submitFormCalls.filter((c) => c.type === "add-member");

    // Only "individual" should get add-member (it is a dependsOn target of other forms)
    // home_visit and assistance are NOT dependsOn targets, so they are record forms
    expect(addMemberCalls).toHaveLength(1);
    expect(addMemberCalls[0].entityGuid).toBe("hh-001");
    expect(addMemberCalls[0].data.members).toEqual([
      { guid: "ind-001", name: "Alice", type: "individual" },
    ]);

    // But all dependent entities should still be created as individuals
    const createCalls = submitFormCalls.filter((c) => c.type === "create-individual");
    expect(createCalls).toHaveLength(3);
  });

  test("individual entities ARE added as members when they are dependsOn targets", async () => {
    const config: AppConfig = {
      id: "test",
      name: "Test",
      entityForms: [
        { id: "household", name: "household", title: "Household", formio: {} },
        {
          id: "individual",
          name: "individual",
          title: "Individual",
          dependsOn: "household",
          formio: {},
        },
        {
          id: "training",
          name: "training",
          title: "Training",
          dependsOn: "individual",
          formio: {},
        },
      ],
      entityData: [
        { name: "household", data: [{ id: "hh-001", name: "Test Family" }] },
        { name: "individual", data: [{ id: "ind-001", name: "Alice", parentId: "hh-001" }] },
      ],
    };

    const { store } = await buildStore(config);
    await store.loadEntityData("test");

    const addMemberCalls = submitFormCalls.filter((c) => c.type === "add-member");
    // "individual" is a dependsOn target (used by "training"), so it gets add-member
    expect(addMemberCalls).toHaveLength(1);
    expect(addMemberCalls[0].entityGuid).toBe("hh-001");
  });
});
