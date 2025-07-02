/**
 * @jest-environment jsdom
 */

import "core-js/stable/structured-clone";
import "fake-indexeddb/auto";

import { cloneDeep } from "lodash";
import { v4 as uuidv4 } from "uuid";
import {
  DetailGroupDoc,
  EntityDoc,
  EntityPair,
  EntityStore,
  EntityType,
  EventApplier,
  EventStore,
  FormSubmission,
  GroupDoc,
  IndividualDoc,
  AuthStorageAdapter,
  SyncLevel,
} from "../../interfaces/types";
import { EventApplierService } from "../../services/EventApplierService";
import { IndexedDbEntityStorageAdapter } from "../../storage/IndexedDbEntityStorageAdapter";
import { IndexedDbEventStorageAdapter } from "../../storage/IndexedDbEventStorageAdapter";
import { IndexedDbAuthStorageAdapter } from "../../storage/IndexedDbAuthStorageAdapter";
import { AppError } from "../../utils/AppError";
import { EntityDataManager } from "../EntityDataManager";
import { EntityStoreImpl } from "../EntityStore";
import { EventStoreImpl } from "../EventStore";
import { ExternalSyncManager } from "../ExternalSyncManager";
import { InternalSyncManager } from "../InternalSyncManager";
import { AuthManager } from "../AuthManager";

const addElderlyApplier: EventApplier = {
  apply: async (
    entity: EntityDoc,
    form: FormSubmission,
    getEntity: (id: string) => Promise<EntityPair | null>,
    saveEntity: (
      action: string,
      existingEntity: EntityDoc,
      modifiedEntity: EntityDoc,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      changes: Record<string, any>,
    ) => Promise<void>,
  ): Promise<EntityDoc> => {
    if (entity.type !== "group") {
      throw new Error("Cannot add elderly member to non-group entity");
    }

    const elderName = form?.data?.members?.[0]?.name || "Unnamed Elderly";
    const elderlyGuid = uuidv4();
    const individual: IndividualDoc = {
      id: uuidv4(),
      guid: elderlyGuid,
      type: EntityType.Individual,
      name: elderName,
      version: 1,
      data: { name: elderName, memberType: "Elderly" },
      lastUpdated: new Date().toISOString(),
    };

    const clonedEntity = cloneDeep(entity) as GroupDoc;
    if (clonedEntity.memberIds && form.data && form.data.members) {
      clonedEntity.memberIds.push(elderlyGuid);
      clonedEntity.version += 1;
    } else {
      throw new Error("Invalid entity or form data structure");
    }

    await saveEntity(form.type, individual, individual, individual);
    await saveEntity(form.type, entity, clonedEntity, { memberIds: clonedEntity.memberIds });
    return clonedEntity;
  },
};

const splitHouseholdApplier: EventApplier = {
  apply: async (
    entity: EntityDoc,
    form: FormSubmission,
    getEntity: (id: string) => Promise<EntityPair | null>,
    saveEntity: (
      action: string,
      existingEntity: EntityDoc,
      modifiedEntity: EntityDoc,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      changes: Record<string, any>,
    ) => Promise<void>,
  ): Promise<EntityDoc> => {
    if (entity.type !== "group") {
      throw new Error("Cannot split non-group entity");
    }

    if (!form?.data?.newGroupName || !form?.data?.newGroupGuid || !form?.data?.newGroupMembers) {
      throw new Error("Invalid form data structure");
    }

    const originalGroup = cloneDeep(entity) as GroupDoc;
    const newGroupName = form?.data?.newGroupName || "New Group";
    const newGroupGuid = form?.data?.newGroupGuid;
    const newGroupMembers = form?.data?.newGroupMembers || [];

    const newGroup: GroupDoc = {
      id: uuidv4(),
      guid: newGroupGuid,
      type: EntityType.Group,
      name: newGroupName,
      version: 1,
      data: { name: newGroupName },
      lastUpdated: new Date().toISOString(),
      memberIds: [],
    };

    const updatedOriginalGroup = cloneDeep(originalGroup);
    updatedOriginalGroup.memberIds = originalGroup.memberIds.filter((memberId) => !newGroupMembers.includes(memberId));
    updatedOriginalGroup.version += 1;

    for (const memberId of newGroupMembers) {
      const memberEntity = await getEntity(memberId);
      if (memberEntity) {
        newGroup.memberIds.push(memberId);
        await saveEntity(form.type, memberEntity.modified, memberEntity.modified, {});
      }
    }

    await saveEntity(form.type, originalGroup, updatedOriginalGroup, {
      memberIds: updatedOriginalGroup.memberIds,
    });
    await saveEntity(form.type, newGroup, newGroup, {});

    return updatedOriginalGroup;
  },
};

// Mock fetch globally
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve([]),
  }),
) as jest.Mock;

describe("EntityDataManager", () => {
  let manager: EntityDataManager;
  let eventStore: EventStore;
  let entityStore: EntityStore;
  let authStorage: AuthStorageAdapter;
  let eventApplierService: EventApplierService;
  let internalSyncManager: InternalSyncManager;
  let externalSyncManager: ExternalSyncManager;
  let authManager: AuthManager;

  // let encryptionAdapter: EncryptionAdapter;
  // let exportImportManager: ExportImportManager;
  // let groupService: GroupService;
  const internalUrl = "http://localhost:3000";
  // const internalUrl = "http://hdm-sync.openspp.org:3000";
  const externalUrl = "http://localhost:3001";
  beforeEach(async () => {
    jest.clearAllMocks();
    eventStore = new EventStoreImpl(new IndexedDbEventStorageAdapter());
    await eventStore.initialize();
    entityStore = new EntityStoreImpl(new IndexedDbEntityStorageAdapter());
    await entityStore.initialize();
    authStorage = new IndexedDbAuthStorageAdapter();
    await authStorage.initialize();
    eventApplierService = new EventApplierService(eventStore, entityStore);
    eventApplierService.registerEventApplier("add-elderly", addElderlyApplier);
    eventApplierService.registerEventApplier("split-household", splitHouseholdApplier);
    internalSyncManager = new InternalSyncManager(
      eventStore,
      entityStore,
      eventApplierService,
      internalUrl,
      authStorage,
    );
    externalSyncManager = new ExternalSyncManager(eventStore, eventApplierService, {
      type: "mock-sync-server",
      url: externalUrl,
      extraFields: [],
    });

    authManager = new AuthManager(
      [{ type: "mock-auth-adapter", fields: { url: internalUrl } }],
      internalUrl,
      authStorage,
    );

    manager = new EntityDataManager(
      eventStore,
      entityStore,
      eventApplierService,
      externalSyncManager,
      internalSyncManager,
      authManager,
    );
  });

  afterEach(() => {
    entityStore.clearStore();
    eventStore.clearStore();
  });

  it("should create a new individual", async () => {
    const formData: FormSubmission = {
      guid: "form-id",
      entityGuid: "form-id",
      type: "create-individual",
      data: { name: "John Doe" },
      timestamp: new Date().toISOString(),
      userId: "user-id",
      syncLevel: SyncLevel.LOCAL,
    };

    const expectedIndividual: IndividualDoc = {
      id: expect.any(String),
      guid: expect.any(String),
      type: EntityType.Individual,
      name: "John Doe",
      version: 1,
      data: { name: "John Doe" },
      lastUpdated: expect.any(String),
    };

    const expectedEvents = [
      {
        guid: "form-id",
        entityGuid: "form-id",
        type: "create-individual",
        data: { name: "John Doe" },
        timestamp: expect.any(String),
        userId: "user-id",
        syncLevel: 0,
        id: expect.any(Number),
      },
    ];

    const expectedEntities = [
      {
        guid: expect.any(String),
        initial: {
          id: expect.any(String),
          guid: expect.any(String),
          type: EntityType.Individual,
          name: "John Doe",
          version: 1,
          data: { name: "John Doe" },
          lastUpdated: expect.any(String),
        },
        modified: {
          id: expect.any(String),
          guid: expect.any(String),
          type: EntityType.Individual,
          name: "John Doe",
          version: 1,
          data: { name: "John Doe" },
          lastUpdated: expect.any(String),
        },
      },
    ];

    const result = await manager.submitForm(formData);
    const events = await eventStore.getAllEvents();
    const entities = await entityStore.getAllEntities();

    expect(result).toMatchObject(expectedIndividual);
    expect(events).toMatchObject(expectedEvents);
    expect(entities).toMatchObject(expectedEntities);
  });

  it("should create a new group", async () => {
    const formData: FormSubmission = {
      guid: uuidv4(),
      entityGuid: uuidv4(),
      type: "create-group",
      data: { name: "Group A" },
      timestamp: new Date().toISOString(),
      userId: "user-id",
      syncLevel: SyncLevel.LOCAL,
    };

    const expectedGroup: GroupDoc = {
      id: expect.any(String),
      guid: expect.any(String),
      type: EntityType.Group,
      name: "Group A",
      version: 1,
      data: { name: "Group A" },
      lastUpdated: expect.any(String),
      memberIds: [],
    };

    const expectedEvents = [
      {
        guid: expect.any(String),
        entityGuid: expect.any(String),
        type: "create-group",
        data: { name: "Group A" },
        timestamp: expect.any(String),
        userId: "user-id",
        syncLevel: 0,
        id: expect.any(Number),
      },
    ];

    const expectedEntities = [
      {
        guid: expect.any(String),
        initial: {
          id: expect.any(String),
          guid: expect.any(String),
          type: EntityType.Group,
          name: "Group A",
          version: 1,
          data: { name: "Group A" },
          lastUpdated: expect.any(String),
          memberIds: [],
        },
        modified: {
          id: expect.any(String),
          guid: expect.any(String),
          type: EntityType.Group,
          name: "Group A",
          version: 1,
          data: { name: "Group A" },
          lastUpdated: expect.any(String),
        },
      },
    ];

    const result = await manager.submitForm(formData);
    const events = await eventStore.getAllEvents();
    const entities = await entityStore.getAllEntities();

    expect(result).toMatchObject(expectedGroup);
    expect(events).toMatchObject(expectedEvents);
    expect(entities).toMatchObject(expectedEntities);
  });

  it("should update an existing individual", async () => {
    const individualGuid = uuidv4();

    const initFormData: FormSubmission = {
      guid: uuidv4(),
      entityGuid: individualGuid,
      type: "create-individual",
      data: { name: "Jane Doe", age: 30 },
      timestamp: new Date().toISOString(),
      userId: "user-id",
      syncLevel: SyncLevel.LOCAL,
    };

    const formData: FormSubmission = {
      guid: "individual-id",
      entityGuid: individualGuid,
      type: "update-individual",
      data: { name: "Jane Doe", age: 35 },
      timestamp: new Date().toISOString(),
      userId: "user-id",
      syncLevel: SyncLevel.LOCAL,
    };

    const expectedIndividual: IndividualDoc = {
      id: individualGuid,
      guid: individualGuid,
      type: EntityType.Individual,
      name: "Jane Doe",
      version: 2,
      data: { name: "Jane Doe", age: 35 },
      lastUpdated: expect.any(String),
    };

    const expectedEntities = [
      {
        guid: individualGuid,
        initial: {
          id: individualGuid,
          guid: individualGuid,
          type: EntityType.Individual,
          name: "Jane Doe",
          version: 1,
          data: { name: "Jane Doe", age: 30 },
          lastUpdated: expect.any(String),
        },
        modified: {
          id: individualGuid,
          guid: individualGuid,
          type: EntityType.Individual,
          name: "Jane Doe",
          version: 2,
          data: { name: "Jane Doe", age: 35 },
          lastUpdated: expect.any(String),
        },
      },
    ];

    const expectedEvents = [
      {
        guid: expect.any(String),
        entityGuid: individualGuid,
        type: "create-individual",
        data: { name: "Jane Doe", age: 30 },
        timestamp: expect.any(String),
        userId: "user-id",
        syncLevel: 0,
        id: expect.any(Number),
      },
      {
        guid: expect.any(String),
        entityGuid: individualGuid,
        type: "update-individual",
        data: { name: "Jane Doe", age: 35 },
        timestamp: expect.any(String),
        userId: "user-id",
        syncLevel: 0,
        id: expect.any(Number),
      },
    ];

    await manager.submitForm(initFormData);
    const result = await manager.submitForm(formData);
    const events = await eventStore.getAllEvents();
    const entities = await entityStore.getAllEntities();

    expect(result).toMatchObject(expectedIndividual);
    expect(entities).toMatchObject(expectedEntities);
    expect(events).toMatchObject(expectedEvents);
  });

  it("should add a member to a group", async () => {
    const members = [{ guid: uuidv4(), name: "John Doe" }];

    const initFormData: FormSubmission = {
      guid: "group-id",
      entityGuid: "group-id",
      type: "create-group",
      data: { name: "Group A" },
      timestamp: new Date().toISOString(),
      userId: "user-id",
      syncLevel: SyncLevel.LOCAL,
    };

    const formData: FormSubmission = {
      guid: "group-id2",
      entityGuid: "group-id",
      type: "add-member",
      data: { members },
      timestamp: new Date().toISOString(),
      userId: "user-id",
      syncLevel: SyncLevel.LOCAL,
    };

    const expectedGroup: GroupDoc = {
      id: "group-id",
      guid: "group-id",
      type: EntityType.Group,
      name: "Group A",
      version: 2,
      data: { name: "Group A" },
      lastUpdated: expect.any(String),
      memberIds: [expect.any(String)],
    };

    const expectedEvents = [
      {
        guid: "group-id",
        entityGuid: "group-id",
        type: "create-group",
        data: { name: "Group A" },
        timestamp: expect.any(String),
        userId: "user-id",
        syncLevel: 0,
        id: expect.any(Number),
      },
      {
        guid: "group-id2",
        entityGuid: "group-id",
        type: "add-member",
        data: { members: [{ name: "John Doe" }] },
        timestamp: expect.any(String),
        userId: "user-id",
        syncLevel: 0,
        id: expect.any(Number),
      },
    ];

    const expectedEntities = [
      {
        guid: expect.any(String),
        initial: {
          id: expect.any(String),
          guid: expect.any(String),
          type: EntityType.Individual,
          name: "John Doe",
          version: 1,
          data: { name: "John Doe" },
          lastUpdated: expect.any(String),
        },
        modified: {
          id: expect.any(String),
          guid: expect.any(String),
          type: EntityType.Individual,
          name: "John Doe",
          version: 1,
          data: { name: "John Doe" },
          lastUpdated: expect.any(String),
        },
      },
      {
        guid: expect.any(String),
        initial: {
          id: "group-id",
          guid: expect.any(String),
          type: EntityType.Group,
          name: "Group A",
          version: 2,
          data: {
            name: "Group A",
          },
          lastUpdated: expect.any(String),
          memberIds: [expect.any(String)],
        },
        modified: {
          id: "group-id",
          guid: expect.any(String),
          type: EntityType.Group,
          name: "Group A",
          version: 2,
          data: {
            name: "Group A",
          },
          lastUpdated: expect.any(String),
          memberIds: [expect.any(String)],
        },
      },
    ];

    await manager.submitForm(initFormData);
    const result = await manager.submitForm(formData);
    const events = await eventStore.getAllEvents();
    const entities = await entityStore.getAllEntities();
    expect(result).toMatchObject(expectedGroup);
    expect(events).toMatchObject(expectedEvents);
    expect(entities).toMatchObject(expectedEntities);
  });

  it("should create a new group with initial members", async () => {
    const formData: FormSubmission = {
      guid: uuidv4(),
      type: "create-group",
      entityGuid: uuidv4(),
      data: {
        name: "Test Family",
        headOfGroup: "John Doe",
        address: "123 Test St",
        phoneNumber: "555-1234",
        email: "john@test.com",
        income: 50000,
        members: [
          { guid: uuidv4(), name: "Jane Doe", dateOfBirth: "1985-05-15", relationship: "Spouse" },
          { guid: uuidv4(), name: "Jimmy Doe", dateOfBirth: "2010-03-20", relationship: "Child" },
        ],
      },
      timestamp: new Date().toISOString(),
      userId: "user-1",
      syncLevel: SyncLevel.LOCAL,
    };

    const expectedResult = {
      id: expect.any(String),
      guid: expect.any(String),
      type: EntityType.Group,
      name: "Test Family",
      version: 1,
      data: {
        name: "Test Family",
        headOfGroup: "John Doe",
        address: "123 Test St",
        phoneNumber: "555-1234",
        email: "john@test.com",
        income: 50000,
      },
      lastUpdated: expect.any(String),
      memberIds: [expect.any(String), expect.any(String)],
    };

    const expectedEvents = [
      {
        guid: expect.any(String),
        type: "create-group",
        entityGuid: expect.any(String),
        data: {
          name: "Test Family",
          headOfGroup: "John Doe",
          address: "123 Test St",
          phoneNumber: "555-1234",
          email: "john@test.com",
          income: 50000,
          members: [
            { name: "Jane Doe", dateOfBirth: "1985-05-15", relationship: "Spouse" },
            { name: "Jimmy Doe", dateOfBirth: "2010-03-20", relationship: "Child" },
          ],
        },
        timestamp: expect.any(String),
        userId: "user-1",
        syncLevel: 0,
        id: expect.any(Number),
      },
    ];

    const expectedEntity1 = {
      guid: expect.any(String),
      initial: {
        id: expect.any(String),
        guid: expect.any(String),
        type: EntityType.Individual,
        name: "Jimmy Doe",
        version: 1,
        data: { name: "Jimmy Doe", dateOfBirth: "2010-03-20", relationship: "Child" },
        lastUpdated: expect.any(String),
      },
      modified: {
        id: expect.any(String),
        guid: expect.any(String),
        type: EntityType.Individual,
        name: "Jimmy Doe",
        version: 1,
        data: { name: "Jimmy Doe", dateOfBirth: "2010-03-20", relationship: "Child" },
        lastUpdated: expect.any(String),
      },
    };

    const expectedEntity2 = {
      guid: expect.any(String),
      initial: {
        id: expect.any(String),
        guid: expect.any(String),
        type: EntityType.Individual,
        name: "Jane Doe",
        version: 1,
        data: { name: "Jane Doe", dateOfBirth: "1985-05-15", relationship: "Spouse" },
        lastUpdated: expect.any(String),
      },
      modified: {
        id: expect.any(String),
        guid: expect.any(String),
        type: EntityType.Individual,
        name: "Jane Doe",
        version: 1,
        data: { name: "Jane Doe", dateOfBirth: "1985-05-15", relationship: "Spouse" },
        lastUpdated: expect.any(String),
      },
    };

    const expectedEntity3 = {
      guid: expect.any(String),
      initial: {
        id: expect.any(String),
        guid: expect.any(String),
        type: EntityType.Group,
        name: "Test Family",
        version: 1,
        data: {
          name: "Test Family",
          headOfGroup: "John Doe",
          address: "123 Test St",
          phoneNumber: "555-1234",
          email: "john@test.com",
          income: 50000,
        },
        lastUpdated: expect.any(String),
        memberIds: [expect.any(String), expect.any(String)],
      },
      modified: {
        id: expect.any(String),
        guid: expect.any(String),
        type: EntityType.Group,
        name: "Test Family",
        version: 1,
        data: {
          name: "Test Family",
          headOfGroup: "John Doe",
          address: "123 Test St",
          phoneNumber: "555-1234",
          email: "john@test.com",
          income: 50000,
        },
        lastUpdated: expect.any(String),
        memberIds: [expect.any(String), expect.any(String)],
      },
    };

    const result = (await manager.submitForm(formData)) as GroupDoc;
    const events = await eventStore.getAllEvents();
    const entities = await entityStore.getAllEntities();

    expect(result).toMatchObject(expectedResult);
    expect(events).toMatchObject(expectedEvents);
    expect(entities).toContainEqual(expectedEntity1);
    expect(entities).toContainEqual(expectedEntity2);
    expect(entities).toContainEqual(expectedEntity3);
  });

  it("should throw an error when submitting an unknown form type", async () => {
    const formData: FormSubmission = {
      guid: uuidv4(),
      type: "unknown-type",
      entityGuid: uuidv4(),
      data: {
        name: "Test Family",
        headOfGroup: "John Doe",
        address: "123 Test St",
        phoneNumber: "555-1234",
        email: "john@test.com",
        income: 50000,
        members: [
          { name: "Jane Doe", dateOfBirth: "1985-05-15", relationship: "Spouse" },
          { name: "Jimmy Doe", dateOfBirth: "2010-03-20", relationship: "Child" },
        ],
      },
      timestamp: new Date().toISOString(),
      userId: "user-3",
      syncLevel: SyncLevel.LOCAL,
    };

    await expect(manager.submitForm(formData)).rejects.toThrow(
      new AppError("SUBMIT_FORM_ERROR", "No event applier found for event type: unknown-type", expect.any(Object)),
    );
  });

  it("should add nested groups and individuals using forms", async () => {
    // Create main group
    const mainGroupForm: FormSubmission = {
      guid: uuidv4(),
      type: "create-group",
      entityGuid: uuidv4(),
      data: {
        name: "Main Group",
      },
      timestamp: new Date().toISOString(),
      userId: "user-1",
      syncLevel: SyncLevel.LOCAL,
    };

    const mainGroup = (await manager.submitForm(mainGroupForm)) as GroupDoc;
    expect(mainGroup).toBeDefined();
    expect(mainGroup.type).toBe("group");
    expect(mainGroup.data.name).toBe("Main Group");

    // Create sub-group as a direct subgroup of the main group
    const subGroupForm: FormSubmission = {
      guid: uuidv4(),
      type: "add-member",
      entityGuid: mainGroup.guid,
      data: {
        members: [
          {
            guid: uuidv4(),
            type: EntityType.Group,
            name: "Sub Group",
            headOfGroup: "Jane Doe",
          },
        ],
        name: "Test Family",
      },
      timestamp: new Date().toISOString(),
      userId: "user-1",
      syncLevel: SyncLevel.LOCAL,
    };

    const updatedMainGroup = (await manager.submitForm(subGroupForm)) as GroupDoc;
    expect(updatedMainGroup).toBeDefined();
    expect(updatedMainGroup.type).toBe("group");
    expect(updatedMainGroup.memberIds).toBeDefined();

    const subGroupId = updatedMainGroup.memberIds[0];

    // Reload the main group and verify its members
    const reloadedMainGroupEntity = await manager.getEntity(mainGroup.guid);
    expect(reloadedMainGroupEntity?.modified.type).toBe("group");
    const reloadedMainGroup = reloadedMainGroupEntity?.modified as GroupDoc;

    expect(reloadedMainGroup.guid).toBe(mainGroup.guid);
    expect(reloadedMainGroup.type).toBe("group");
    expect(reloadedMainGroup.data.name).toBe("Main Group");
    expect(reloadedMainGroup.memberIds).toHaveLength(1);
    expect(reloadedMainGroup.memberIds).toHaveLength(1);

    expect(reloadedMainGroup.memberIds).toHaveLength(1);

    // Reload the subgroup and verify it is correct
    const reloadedSubGroupEntity = await manager.getEntity(subGroupId);
    expect(reloadedSubGroupEntity?.modified.type).toBe("group");
    const reloadedSubGroup = reloadedSubGroupEntity?.modified as GroupDoc;
    expect(reloadedSubGroup.guid).toBe(subGroupId);
    expect(reloadedSubGroup.type).toBe("group");
    expect(reloadedSubGroup.data.name).toBe("Sub Group");
    expect(reloadedSubGroup.memberIds).toHaveLength(0);

    // Add individual directly to the subgroup
    const addIndividualForm: FormSubmission = {
      guid: uuidv4(),
      type: "add-member",
      entityGuid: subGroupId,
      data: {
        members: [
          {
            guid: uuidv4(),
            type: EntityType.Individual,
            name: "John Smith",
            dateOfBirth: "1990-01-01",
          },
        ],
      },
      timestamp: new Date().toISOString(),
      userId: "user-1",
      syncLevel: SyncLevel.LOCAL,
    };

    const updatedSubGroup = (await manager.submitForm(addIndividualForm)) as GroupDoc;
    expect(updatedSubGroup).toBeDefined();
    expect(updatedSubGroup.type).toBe("group");
    expect(updatedSubGroup.memberIds).toHaveLength(1);

    // Retrieve updated main group
    const updatedMainGroupEntity = await manager.getEntity(mainGroup.guid);

    expect(updatedMainGroupEntity?.modified.type).toBe("group");
    const modifiedMainGroup = updatedMainGroupEntity?.modified as GroupDoc;
    expect(modifiedMainGroup.memberIds).toHaveLength(1);

    // Retrieve the individual member
    const individualMemberId = updatedSubGroup.memberIds[0];
    const individualMemberEntity = await manager.getEntity(individualMemberId);
    expect(individualMemberEntity?.modified.type).toBe(EntityType.Individual);
    const individualMember = individualMemberEntity?.modified as IndividualDoc;

    // Check the individual member details
    expect(individualMember.guid).toBeDefined();
    expect(individualMember.type).toBe(EntityType.Individual);
    expect(individualMember.name).toBe("John Smith");
    expect(individualMember.data.dateOfBirth).toBe("1990-01-01");

    // Retrieve updated sub-group
    const updatedSubGroupEntity = await manager.getEntity(subGroupId);
    expect(updatedSubGroupEntity?.modified.type).toBe("group");
    const modifiedSubGroup = updatedSubGroupEntity?.modified as GroupDoc;
    expect(modifiedSubGroup.memberIds).toHaveLength(1);

    const updatedIndividualMemberEntity = await manager.getEntity(individualMemberId);
    expect(updatedIndividualMemberEntity?.modified.type).toBe(EntityType.Individual);
    const updatedIndividualMember = updatedIndividualMemberEntity?.modified as IndividualDoc;
    expect(updatedIndividualMember.guid).toBe(individualMemberId);
    expect(updatedIndividualMember.type).toBe(EntityType.Individual);
    expect(updatedIndividualMember.name).toBe("John Smith");
    expect(updatedIndividualMember.data.dateOfBirth).toBe("1990-01-01");
  });

  it("should add a child to an existing household", async () => {
    const existingGroup: GroupDoc = {
      id: "existing-group",
      guid: "existing-group",
      type: EntityType.Group,
      version: 1,
      data: {
        name: "Existing Family",
        headOfGroup: "John Doe",
      },
      memberIds: [],
      lastUpdated: new Date().toISOString(),
    };
    await entityStore.saveEntity(existingGroup, existingGroup);

    const formData: FormSubmission = {
      guid: uuidv4(),
      type: "add-member",
      entityGuid: "existing-group",
      data: {
        members: [{ guid: uuidv4(), name: "Jimmy Doe", dateOfBirth: "2010-05-15", relationship: "Child" }],
      },
      timestamp: new Date().toISOString(),
      userId: "user-1",
      syncLevel: SyncLevel.LOCAL,
    };

    const result = (await manager.submitForm(formData)) as GroupDoc;

    expect(result).toBeDefined();
    expect(result.guid).toBe("existing-group");
    expect(result.memberIds).toHaveLength(1);

    // Reload the group to verify the changes
    const reloadedGroup = await manager.getEntity("existing-group");
    expect(reloadedGroup?.modified.type).toBe("group");
    const modifiedGroup = reloadedGroup?.modified as GroupDoc;

    expect(modifiedGroup.memberIds).toHaveLength(1);

    // Fetch the individual member to verify its details
    const memberEntity = await manager.getEntity(modifiedGroup.memberIds[0]);
    expect(memberEntity?.modified.type).toBe(EntityType.Individual);
    const individualMember = memberEntity?.modified as IndividualDoc;

    expect(individualMember.name).toBe("Jimmy Doe");
    expect(individualMember.data.dateOfBirth).toBe("2010-05-15");
    expect(individualMember.data.relationship).toBe("Child");
  });

  it("should create group, add a member, then edit the member", async () => {
    const formData: FormSubmission = {
      guid: uuidv4(),
      type: "create-group",
      entityGuid: uuidv4(), // Assuming this is also required
      data: { name: "Group Name" },
      timestamp: new Date().toISOString(), // Add a timestamp
      userId: "user-id", // Add a userId
      syncLevel: SyncLevel.LOCAL,
    };

    const group = (await manager.submitForm(formData)) as GroupDoc;
    expect(group).toBeDefined();
    expect(group.guid).toBeDefined();
    expect(group.type).toBe("group");
    expect(group.data.name).toBe("Group Name");

    const addMemberForm: FormSubmission = {
      guid: "def456",
      type: "add-member",
      entityGuid: group.guid,
      data: {
        members: [{ guid: uuidv4(), name: "John Doe", dateOfBirth: "1980-01-01", relationship: "Head" }],
      },
      timestamp: new Date().toISOString(),
      userId: "user-1",
      syncLevel: SyncLevel.LOCAL,
    };

    const updatedGroup = (await manager.submitForm(addMemberForm)) as GroupDoc;

    expect(updatedGroup).toBeDefined();
    expect(updatedGroup.guid).toBe(group.guid);
    expect(updatedGroup.memberIds).toHaveLength(1);

    const memberId = updatedGroup.memberIds[0];
    const memberEntity = await manager.getEntity(memberId);
    expect(memberEntity?.modified.type).toBe(EntityType.Individual);
    const member = memberEntity?.modified as IndividualDoc;

    expect(member?.name).toBe("John Doe");
    expect(member?.data.dateOfBirth).toBe("1980-01-01");
    expect(member?.data.relationship).toBe("Head");

    const editMemberForm: FormSubmission = {
      guid: "ghi789",
      type: "update-individual",
      entityGuid: memberId,
      data: {
        name: "Updated Name",
      },
      timestamp: new Date().toISOString(),
      userId: "user-1",
      syncLevel: SyncLevel.LOCAL,
    };

    const updatedMember = (await manager.submitForm(editMemberForm)) as IndividualDoc;

    expect(updatedMember).toBeDefined();
    expect(updatedMember.guid).toBe(memberId);
    expect(updatedMember.name).toBe("Updated Name");
  });

  it("should add an elderly member to an existing household - addElderlyApplier", async () => {
    const existingGroup: GroupDoc = {
      id: "existing-group",
      guid: "existing-group",
      type: EntityType.Group,
      version: 1,
      data: {
        name: "Existing Family",
        headOfGroup: "John Doe",
      },
      memberIds: [],
      lastUpdated: new Date().toISOString(),
    };
    await entityStore.saveEntity(existingGroup, existingGroup);

    const formData: FormSubmission = {
      guid: uuidv4(),
      type: "add-elderly",
      entityGuid: "existing-group",
      data: {
        members: [{ name: "Grandpa Joe", dateOfBirth: "1940-02-20", relationship: "Parent" }],
      },
      timestamp: new Date().toISOString(),
      userId: "user-1",
      syncLevel: SyncLevel.LOCAL,
    };

    const expectedResult = {
      id: "existing-group",
      guid: "existing-group",
      type: EntityType.Group,
      version: 2,
      data: { name: "Existing Family", headOfGroup: "John Doe" },
      memberIds: [expect.any(String)],
      lastUpdated: expect.any(String),
    };

    const expectedEntities = [
      {
        guid: expect.any(String),
        initial: {
          id: expect.any(String),
          guid: expect.any(String),
          type: EntityType.Individual,
          name: "Grandpa Joe",
          version: 1,
          data: {
            name: "Grandpa Joe",
            memberType: "Elderly",
          },
          lastUpdated: expect.any(String),
        },
        modified: {
          id: expect.any(String),
          guid: expect.any(String),
          type: EntityType.Individual,
          name: "Grandpa Joe",
          version: 1,
          data: {
            name: "Grandpa Joe",
            memberType: "Elderly",
          },
          lastUpdated: expect.any(String),
        },
      },
      {
        guid: expect.any(String),
        initial: {
          id: expect.any(String),
          guid: expect.any(String),
          type: EntityType.Group,
          version: 1,
          data: {
            name: "Existing Family",
            headOfGroup: "John Doe",
          },
          memberIds: [],
          lastUpdated: expect.any(String),
        },
        modified: {
          id: expect.any(String),
          guid: expect.any(String),
          type: EntityType.Group,
          version: 2,
          data: {
            name: "Existing Family",
            headOfGroup: "John Doe",
          },
          memberIds: [expect.any(String)],
          lastUpdated: expect.any(String),
        },
      },
    ];

    const expectedEvents = [
      {
        guid: expect.any(String),
        type: "add-elderly",
        entityGuid: "existing-group",
        data: { members: [{ name: "Grandpa Joe", dateOfBirth: "1940-02-20", relationship: "Parent" }] },
        timestamp: expect.any(String),
        userId: "user-1",
        syncLevel: 0,
        id: expect.any(Number),
      },
    ];

    const result = (await manager.submitForm(formData)) as GroupDoc;
    const events = await eventStore.getAllEvents();
    const entities = await entityStore.getAllEntities();

    expect(result).toEqual(expectedResult);
    expect(events).toEqual(expectedEvents);
    expect(entities).toEqual(expectedEntities);
  });

  it("should split a household into two groups - splitHouseholdApplier", async () => {
    const originalGroupGuid = uuidv4();
    const originalGroupMembers = [
      { guid: uuidv4(), name: "John Doe", dateOfBirth: "1980-01-01", relationship: "Head" },
      { guid: uuidv4(), name: "Jane Doe", dateOfBirth: "1982-02-02", relationship: "Spouse" },
      { guid: uuidv4(), name: "Jimmy Doe", dateOfBirth: "2010-03-03", relationship: "Child" },
      { guid: uuidv4(), name: "Jenny Doe", dateOfBirth: "2012-04-04", relationship: "Child" },
    ];

    const initFormData: FormSubmission = {
      guid: uuidv4(),
      entityGuid: originalGroupGuid,
      type: "create-group",
      data: {
        name: "Original Group",
        members: cloneDeep(originalGroupMembers),
      },
      timestamp: new Date().toISOString(),
      userId: "user-1",
      syncLevel: SyncLevel.LOCAL,
    };

    await manager.submitForm(initFormData);

    const newGroupGuid = uuidv4();
    const splitFormData: FormSubmission = {
      guid: uuidv4(),
      entityGuid: originalGroupGuid,
      type: "split-household",
      data: {
        newGroupName: "New Group",
        newGroupGuid,
        newGroupMembers: [originalGroupMembers[2].guid, originalGroupMembers[3].guid],
      },
      timestamp: new Date().toISOString(),
      userId: "user-1",
      syncLevel: SyncLevel.LOCAL,
    };

    const updatedOriginalGroup = (await manager.submitForm(splitFormData)) as GroupDoc;
    const newGroupEntity = await manager.getEntity(newGroupGuid);
    const newGroup = newGroupEntity?.modified as GroupDoc;
    const entities = await manager.getAllEntities();
    const events = await eventStore.getAllEvents();

    expect(updatedOriginalGroup.memberIds).toHaveLength(2);
    expect(newGroup.memberIds).toHaveLength(2);
    expect(newGroup.data.name).toBe("New Group");
    expect(entities).toHaveLength(6);
    expect(events).toHaveLength(2);
  });

  it("should remove a member from an existing household", async () => {
    const members1: IndividualDoc = {
      id: "member-1",
      guid: "member-1",
      type: EntityType.Individual,
      data: {
        name: "John Doe",
        dateOfBirth: "1980-01-01",
      },
      version: 1,
      lastUpdated: "",
    };
    const members2: IndividualDoc = {
      id: "member-2",
      guid: "member-2",
      type: EntityType.Individual,
      data: {
        name: "Jane Doe",
        dateOfBirth: "1985-05-15",
      },
      version: 1,
      lastUpdated: "",
    };

    const existingGroup: GroupDoc = {
      id: "existing-group",
      guid: "existing-group",
      type: EntityType.Group,
      version: 1,
      data: {
        name: "Existing Family",
        headOfGroup: "John Doe",
      },
      memberIds: ["member-1", "member-2"],
      lastUpdated: new Date().toISOString(),
    };

    await Promise.all([entityStore.saveEntity(members1, members1), entityStore.saveEntity(members2, members2)]);
    await entityStore.saveEntity(existingGroup, existingGroup);

    const formData: FormSubmission = {
      guid: uuidv4(),
      type: "remove-member",
      entityGuid: "existing-group",
      data: {
        memberId: "member-2",
      },
      timestamp: new Date().toISOString(),
      userId: "user-1",
      syncLevel: SyncLevel.LOCAL,
    };

    const result = (await manager.submitForm(formData)) as GroupDoc;

    expect(result).toBeDefined();
    expect(result.guid).toBe("existing-group");
    expect(result.memberIds).toHaveLength(1);
    const memberId = result.memberIds[0];
    const member = await manager.getEntity(memberId);
    expect(member?.modified.type).toBe(EntityType.Individual);
    expect(member?.modified.data.name).toBe("John Doe");
  });

  it("should create 3 groups with 4 members each, then modify the first group", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const createGroup = async (groupName: string, members: any[]): Promise<GroupDoc> => {
      const formData: FormSubmission = {
        guid: uuidv4(),
        type: "create-group",
        entityGuid: uuidv4(),
        data: {
          name: groupName,
          headOfGroup: members[0].name,
          members: members,
        },
        timestamp: new Date().toISOString(),
        userId: "test-user",
        syncLevel: SyncLevel.LOCAL,
      };

      console.log(`Creating group: ${JSON.stringify(formData)}`);
      const result = (await manager.submitForm(formData)) as GroupDoc;
      console.log(`Created group result: ${JSON.stringify(result)}`);
      return result;
    };

    const groups = await Promise.all([
      createGroup("Group 1", [
        { guid: uuidv4(), name: "John Doe", dateOfBirth: "1980-01-01", relationship: "Head" },
        { guid: uuidv4(), name: "Jane Doe", dateOfBirth: "1982-02-02", relationship: "Spouse" },
        { guid: uuidv4(), name: "Jimmy Doe", dateOfBirth: "2010-03-03", relationship: "Child" },
        { guid: uuidv4(), name: "Jenny Doe", dateOfBirth: "2012-04-04", relationship: "Child" },
      ]),
      createGroup("Group 2", [
        { guid: uuidv4(), name: "Bob Smith", dateOfBirth: "1975-05-05", relationship: "Head" },
        { guid: uuidv4(), name: "Alice Smith", dateOfBirth: "1977-06-06", relationship: "Spouse" },
        { guid: uuidv4(), name: "Billy Smith", dateOfBirth: "2008-07-07", relationship: "Child" },
        { guid: uuidv4(), name: "Betty Smith", dateOfBirth: "2010-08-08", relationship: "Child" },
      ]),
      createGroup("Group 3", [
        { guid: uuidv4(), name: "Charlie Brown", dateOfBirth: "1985-09-09", relationship: "Head" },
        { guid: uuidv4(), name: "Lucy Brown", dateOfBirth: "1987-10-10", relationship: "Spouse" },
        { guid: uuidv4(), name: "Linus Brown", dateOfBirth: "2013-11-11", relationship: "Child" },
        { guid: uuidv4(), name: "Sally Brown", dateOfBirth: "2015-12-12", relationship: "Child" },
      ]),
    ]);

    // Verify the creation of groups and members
    for (let i = 0; i < 3; i++) {
      console.log(`Verifying group ${i + 1}: ${JSON.stringify(groups[i])}`);
      expect(groups[i]).toBeDefined();
      expect(groups[i].guid).toBeDefined();
      expect(groups[i].type).toBe("group");
      expect(groups[i].data.name).toBe(`Group ${i + 1}`);
      expect(groups[i].memberIds).toHaveLength(4);

      const tempRetrievedGroup = await manager.getEntity(groups[i].guid);
      expect(tempRetrievedGroup?.modified.type).toBe("group");
      const retrievedGroup = tempRetrievedGroup?.modified as GroupDoc;
      expect(retrievedGroup?.memberIds).toHaveLength(4);
    }

    // Modify the first group: remove 2 members and add a new one
    const removeMember = async (groupId: string, memberId: string): Promise<GroupDoc> => {
      const formData: FormSubmission = {
        guid: uuidv4(),
        type: "remove-member",
        entityGuid: groupId,
        data: { memberId },
        timestamp: new Date().toISOString(),
        userId: "test-user",
        syncLevel: SyncLevel.LOCAL,
      };
      console.log(`Removing member: ${JSON.stringify(formData)}`);
      const result = (await manager.submitForm(formData)) as GroupDoc;
      console.log(`Remove member result: ${JSON.stringify(result)}`);
      return result;
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const addMember = async (groupId: string, member: any): Promise<GroupDoc> => {
      const formData: FormSubmission = {
        guid: uuidv4(),
        type: "add-member",
        entityGuid: groupId,
        data: { members: [member] },
        timestamp: new Date().toISOString(),
        userId: "test-user",
        syncLevel: SyncLevel.LOCAL,
      };
      console.log(`Adding member: ${JSON.stringify(formData)}`);
      const result = (await manager.submitForm(formData)) as GroupDoc;
      console.log(`Add member result: ${JSON.stringify(result)}`);
      return result;
    };

    let updatedGroup = await removeMember(groups[0].guid, groups[0].memberIds[2]);
    updatedGroup = await removeMember(updatedGroup.guid, updatedGroup.memberIds[2]);
    console.log(`Updated group after removing members: ${JSON.stringify(updatedGroup)}`);
    expect(updatedGroup.memberIds).toHaveLength(2);

    const newMember = (await manager.submitForm({
      guid: uuidv4(),
      type: "create-individual",
      entityGuid: uuidv4(),
      data: { name: "Judy Doe", dateOfBirth: "2014-05-05", relationship: "Child" },
      timestamp: new Date().toISOString(),
      userId: "test-user",
      syncLevel: SyncLevel.LOCAL,
    })) as IndividualDoc;

    await addMember(groups[0].guid, newMember);

    // Reload the group from the datastore
    const retrievedGroup = await manager.getEntity(groups[0].guid);
    expect(retrievedGroup?.modified.type).toBe("group");

    // Type assertion to treat modified as GroupDoc
    const finalGroup = retrievedGroup?.modified as DetailGroupDoc;

    console.log(`Final group: ${JSON.stringify(finalGroup)}`);

    expect(finalGroup.memberIds).toHaveLength(3);
    expect(finalGroup.members[0].name).toBe("John Doe");
    expect(finalGroup.members[1].name).toBe("Jane Doe");
    expect(finalGroup.members[2]).toBeDefined();
    if ("missing" in finalGroup.members[2]) {
      expect(finalGroup.members[2].missing).toBe(true);
    } else {
      expect(finalGroup.members[2].name).toBe("Judy Doe");
    }
  });

  it("should create a group with members and retrieve it correctly", async () => {
    const formData: FormSubmission = {
      guid: uuidv4(),
      type: "create-group",
      entityGuid: uuidv4(),
      data: {
        name: "Test Group",
        headOfGroup: "John Doe",
        members: [
          { guid: uuidv4(), name: "John Doe", dateOfBirth: "1980-01-01", relationship: "Head" },
          { guid: uuidv4(), name: "Jane Doe", dateOfBirth: "1982-02-02", relationship: "Spouse" },
        ],
      },
      timestamp: new Date().toISOString(),
      userId: "test-user",
      syncLevel: SyncLevel.LOCAL,
    };

    const createdGroup = (await manager.submitForm(formData)) as GroupDoc;
    console.log("Created group:", JSON.stringify(createdGroup, null, 2));

    expect(createdGroup).toBeDefined();
    expect(createdGroup.guid).toBeDefined();
    expect(createdGroup.type).toBe("group");
    expect(createdGroup.data.name).toBe("Test Group");
    expect(createdGroup.memberIds).toHaveLength(2);

    const retrievedGroupPair = await manager.getEntity(createdGroup.guid);
    const retrievedGroup = retrievedGroupPair?.modified as DetailGroupDoc;
    console.log("Retrieved group:", JSON.stringify(retrievedGroup, null, 2));

    expect(retrievedGroup).toBeDefined();
    expect(retrievedGroup?.guid).toBe(createdGroup.guid);
    expect(retrievedGroup?.type).toBe("group");
    expect(retrievedGroup?.data.name).toBe("Test Group");
    expect(retrievedGroup?.memberIds).toHaveLength(2);
    expect(retrievedGroup?.members).toHaveLength(2);
    expect(retrievedGroup?.members[0].name).toBe("John Doe");
    expect(retrievedGroup?.members[1].name).toBe("Jane Doe");
  });

  it("should search entities based on criteria", async () => {
    const formData1: FormSubmission = {
      guid: uuidv4(),
      entityGuid: uuidv4(),
      type: "create-individual",
      data: { name: "John Doe", age: 30, email: "john.doe@example.com" },
      timestamp: new Date().toISOString(),
      userId: "user-1",
      syncLevel: SyncLevel.LOCAL,
    };

    const formData2: FormSubmission = {
      guid: uuidv4(),
      entityGuid: uuidv4(),
      type: "create-individual",
      data: { name: "Jane Smith", age: 40, email: "jane.smith@test.com" },
      timestamp: new Date().toISOString(),
      userId: "user-1",
      syncLevel: SyncLevel.LOCAL,
    };

    const formData3: FormSubmission = {
      guid: uuidv4(),
      entityGuid: uuidv4(),
      type: "create-group",
      data: { name: "Family Group" },
      timestamp: new Date().toISOString(),
      userId: "user-1",
      syncLevel: SyncLevel.LOCAL,
    };

    await manager.submitForm(formData1);
    await manager.submitForm(formData2);
    await manager.submitForm(formData3);

    const criteria1 = [{ name: "John Doe" }];
    const criteria2 = [{ age: { $gt: 35 } }];
    const criteria3 = [{ type: "group" }];
    const criteria4 = [{ email: { $regex: "@example.com$" } }];

    const searchResults1 = await manager.searchEntities(criteria1);
    const searchResults2 = await manager.searchEntities(criteria2);
    const searchResults3 = await manager.searchEntities(criteria3);
    const searchResults4 = await manager.searchEntities(criteria4);

    expect(searchResults1).toHaveLength(1);
    expect(searchResults1[0].modified.name).toBe("John Doe");

    expect(searchResults2).toHaveLength(1);
    expect(searchResults2[0].modified.data.age).toBe(40);

    expect(searchResults3).toHaveLength(1);
    expect(searchResults3[0].modified.type).toBe("group");

    expect(searchResults4).toHaveLength(1);
    expect(searchResults4[0].modified.data.email).toBe("john.doe@example.com");
  });

  it("should delete an entity", async () => {
    const entityGuid = uuidv4();

    // Create an individual
    const formData: FormSubmission = {
      guid: uuidv4(),
      type: "create-group",
      entityGuid: entityGuid,
      data: {
        name: "Test Family",
        headOfGroup: "John Doe",
        address: "123 Test St",
        phoneNumber: "555-1234",
        email: "john@test.com",
        income: 50000,
        members: [
          { guid: uuidv4(), name: "Jane Doe", dateOfBirth: "1985-05-15", relationship: "Spouse" },
          { guid: uuidv4(), name: "Jimmy Doe", dateOfBirth: "2010-03-20", relationship: "Child" },
        ],
      },
      timestamp: new Date().toISOString(),
      userId: "user-1",
      syncLevel: SyncLevel.LOCAL,
    };

    await manager.submitForm(formData);

    // Verify the individual was created
    const createdEntity = await manager.getEntity(entityGuid);
    expect(createdEntity?.modified.type).toBe(EntityType.Group);
    let entities = await manager.getAllEntities();
    expect(entities).toHaveLength(3);

    // Delete the individual
    const deleteFormData: FormSubmission = {
      guid: uuidv4(),
      entityGuid: entityGuid,
      type: "delete-entity",
      data: { reason: "test" },
      timestamp: new Date().toISOString(),
      userId: "user-id",
      syncLevel: SyncLevel.LOCAL,
    };

    await manager.submitForm(deleteFormData);

    // Verify the individual was deleted
    entities = await manager.getAllEntities();
    expect(entities).toHaveLength(0);
  });

  it("should handle sync errors gracefully", async () => {
    const errorMessage = "Sync server error";
    jest.spyOn(internalSyncManager, "sync").mockRejectedValueOnce(new Error(errorMessage));

    await expect(manager.syncWithSyncServer()).rejects.toThrow(errorMessage);
  });

  it("should flag potential duplicates correctly and resolve them", async () => {
    const entityGuid1 = uuidv4();
    const entityGuid2 = uuidv4();

    const formData: FormSubmission = {
      guid: uuidv4(),
      entityGuid: entityGuid1,
      type: "create-individual",
      data: { name: "John Doe" },
      timestamp: new Date().toISOString(),
      userId: "user-id",
      syncLevel: SyncLevel.LOCAL,
    };

    await manager.submitForm(formData);
    await manager.submitForm({ ...formData, guid: uuidv4(), entityGuid: entityGuid2 });

    const potentialDuplicates = await manager.getPotentialDuplicates();
    expect(potentialDuplicates).toHaveLength(1);
    expect(potentialDuplicates).toEqual([{ duplicateGuid: entityGuid1, entityGuid: entityGuid2 }]);

    await manager.submitForm({
      guid: uuidv4(),
      type: "resolve-duplicate",
      entityGuid: entityGuid2,
      data: { duplicates: [{ entityGuid: entityGuid2, duplicateGuid: entityGuid1 }], shouldDelete: true },
      timestamp: new Date().toISOString(),
      userId: "user-id",
      syncLevel: SyncLevel.LOCAL,
    });

    const potentialDuplicatesAfter = await manager.getPotentialDuplicates();
    expect(potentialDuplicatesAfter).toHaveLength(0);
  });

  it("should get the number of unsynced events", async () => {
    const unsyncedEventsCount = await manager.getUnsyncedEventsCount();
    expect(unsyncedEventsCount).toBe(0);
  });

  // Run only when sync-server is running at localhost:3000
  describe.skip("Sync with sync server", () => {
    it("should sync events with the sync server", async () => {
      const groupAGuid = uuidv4();

      await manager.login({ username: "admin@hdm.example", password: "admin1@" });
      await manager.submitForm({
        guid: uuidv4(),
        entityGuid: groupAGuid,
        type: "create-group",
        data: {
          name: "Group A",
          members: [
            { guid: uuidv4(), name: "Jane Doe", dateOfBirth: "1985-05-15", relationship: "Spouse" },
            { guid: uuidv4(), name: "Jimmy Doe", dateOfBirth: "2010-03-20", relationship: "Child" },
          ],
        },
        timestamp: new Date().toISOString(),
        userId: "user-1",
        syncLevel: SyncLevel.LOCAL,
      });
      expect(await manager.hasUnsyncedEvents()).toBe(true);
      await manager.syncWithSyncServer();
      expect(await manager.hasUnsyncedEvents()).toBe(false);

      // wait 1 sec
      await new Promise((resolve) => setTimeout(resolve, 1000));

      await manager.submitForm({
        guid: uuidv4(),
        entityGuid: groupAGuid,
        type: "add-member",
        data: {
          members: [{ guid: uuidv4(), name: "Test member" }],
        },
        timestamp: new Date().toISOString(),
        userId: "user-1",
        syncLevel: SyncLevel.LOCAL,
      });
      expect(await manager.hasUnsyncedEvents()).toBe(true);
      await manager.syncWithSyncServer();
      expect(await manager.hasUnsyncedEvents()).toBe(false);

      // wait 1 sec
      await new Promise((resolve) => setTimeout(resolve, 1000));

      await manager.submitForm({
        guid: uuidv4(),
        entityGuid: uuidv4(),
        type: "create-individual",
        data: { name: "Harry Potter" },
        timestamp: new Date().toISOString(),
        userId: "user-1",
        syncLevel: SyncLevel.LOCAL,
      });
      expect(await manager.hasUnsyncedEvents()).toBe(true);
      await manager.syncWithSyncServer();
      expect(await manager.hasUnsyncedEvents()).toBe(false);

      const events = await eventStore.getAllEvents();
      const entities = await entityStore.getAllEntities();
      expect(events).toHaveLength(3);
      expect(entities).toHaveLength(5);
    }, 10000);

    it("should not sync if unauthenticated", async () => {
      await manager.logout();
      await expect(manager.syncWithSyncServer()).rejects.toThrow("Unauthorized");
    });
  });
});
