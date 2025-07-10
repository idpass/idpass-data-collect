import "dotenv/config";
import { Pool } from "pg";
import { SelfServiceUserStoreImpl } from "../SelfServiceUserStore";

describe("SelfServiceUserStore", () => {
  let store: SelfServiceUserStoreImpl;
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({
      connectionString: process.env.POSTGRES_TEST || "",
    });
    store = new SelfServiceUserStoreImpl(process.env.POSTGRES_TEST || "");
    await store.initialize();
  });

  afterEach(async () => {
    await store.clearStore();
  });

  afterAll(async () => {
    await store.clearStore();
    await store.closeConnection();
    await pool.end();
  });

  test("saveUser and getUser should work correctly", async () => {
    const configId = "test-config";
    const guid = "test-guid-1";
    const email = "test@example.com";
    const phone = "+1234567890";

    await store.saveUser(configId, guid, email, phone);

    const savedUser = await store.getUser(configId, guid);
    expect(savedUser).not.toBeNull();
    expect(savedUser?.guid).toEqual(guid);
    expect(savedUser?.email).toEqual(email);
    expect(savedUser?.phone).toEqual(phone);
    expect(savedUser?.configId).toEqual(configId);
    expect(savedUser?.registeredAuthProviders).toEqual([]);
  });

  test("saveUser should handle user without phone", async () => {
    const configId = "test-config";
    const guid = "test-guid-2";
    const email = "test2@example.com";

    await store.saveUser(configId, guid, email);

    const savedUser = await store.getUser(configId, guid);
    expect(savedUser).not.toBeNull();
    expect(savedUser?.guid).toEqual(guid);
    expect(savedUser?.email).toEqual(email);
    expect(savedUser?.phone).toBeNull();
  });

  test("saveUser should update existing user on conflict", async () => {
    const configId = "test-config";
    const guid = "test-guid-3";
    const email1 = "test3@example.com";
    const phone1 = "+1234567890";
    const email2 = "updated@example.com";
    const phone2 = "+0987654321";

    // Save user initially
    await store.saveUser(configId, guid, email1, phone1);
    const initialUser = await store.getUser(configId, guid);
    expect(initialUser?.email).toEqual(email1);
    expect(initialUser?.phone).toEqual(phone1);

    // Update the same user
    await store.saveUser(configId, guid, email2, phone2);
    const updatedUser = await store.getUser(configId, guid);
    expect(updatedUser?.email).toEqual(email2);
    expect(updatedUser?.phone).toEqual(phone2);
    expect(updatedUser?.id).toEqual(initialUser?.id); // Same ID, different data
  });

  test("getUser should return null for non-existent user", async () => {
    const configId = "test-config";
    const guid = "non-existent-guid";

    const user = await store.getUser(configId, guid);
    expect(user).toBeNull();
  });

  test("addRegisteredAuthProviders should add new providers", async () => {
    const configId = "test-config";
    const guid = "test-guid-4";
    const email = "test4@example.com";

    await store.saveUser(configId, guid, email);

    const providers = ["auth0", "keycloak"];
    await store.addRegisteredAuthProviders(configId, guid, providers);

    const user = await store.getUser(configId, guid);
    expect(user?.registeredAuthProviders).toContain("auth0");
    expect(user?.registeredAuthProviders).toContain("keycloak");
    expect(user?.registeredAuthProviders).toHaveLength(2);
  });

  test("addRegisteredAuthProviders should not add duplicate providers", async () => {
    const configId = "test-config";
    const guid = "test-guid-5";
    const email = "test5@example.com";

    await store.saveUser(configId, guid, email);

    const providers = ["auth0", "keycloak"];
    await store.addRegisteredAuthProviders(configId, guid, providers);

    // Add the same providers again
    await store.addRegisteredAuthProviders(configId, guid, providers);

    const user = await store.getUser(configId, guid);
    expect(user?.registeredAuthProviders).toContain("auth0");
    expect(user?.registeredAuthProviders).toContain("keycloak");
    expect(user?.registeredAuthProviders).toHaveLength(2); // No duplicates
  });

  test("addRegisteredAuthProviders should add to existing providers", async () => {
    const configId = "test-config";
    const guid = "test-guid-6";
    const email = "test6@example.com";

    await store.saveUser(configId, guid, email);

    // Add initial providers
    await store.addRegisteredAuthProviders(configId, guid, ["auth0"]);

    // Add more providers
    await store.addRegisteredAuthProviders(configId, guid, ["keycloak", "openid"]);

    const user = await store.getUser(configId, guid);
    expect(user?.registeredAuthProviders).toContain("auth0");
    expect(user?.registeredAuthProviders).toContain("keycloak");
    expect(user?.registeredAuthProviders).toContain("openid");
    expect(user?.registeredAuthProviders).toHaveLength(3);
  });

  test("removeRegisteredAuthProviders should remove providers", async () => {
    const configId = "test-config";
    const guid = "test-guid-7";
    const email = "test7@example.com";

    await store.saveUser(configId, guid, email);

    // Add providers
    await store.addRegisteredAuthProviders(configId, guid, ["auth0", "keycloak", "openid"]);

    // Remove some providers
    await store.removeRegisteredAuthProviders(configId, guid, ["keycloak"]);

    const user = await store.getUser(configId, guid);
    expect(user?.registeredAuthProviders).toContain("auth0");
    expect(user?.registeredAuthProviders).toContain("openid");
    expect(user?.registeredAuthProviders).not.toContain("keycloak");
    expect(user?.registeredAuthProviders).toHaveLength(2);
  });

  test("removeRegisteredAuthProviders should handle non-existent providers", async () => {
    const configId = "test-config";
    const guid = "test-guid-8";
    const email = "test8@example.com";

    await store.saveUser(configId, guid, email);

    // Add providers
    await store.addRegisteredAuthProviders(configId, guid, ["auth0", "keycloak"]);

    // Try to remove non-existent provider
    await store.removeRegisteredAuthProviders(configId, guid, ["non-existent"]);

    const user = await store.getUser(configId, guid);
    expect(user?.registeredAuthProviders).toContain("auth0");
    expect(user?.registeredAuthProviders).toContain("keycloak");
    expect(user?.registeredAuthProviders).toHaveLength(2);
  });

  test("deleteUser should work correctly", async () => {
    const configId = "test-config";
    const guid = "test-guid-9";
    const email = "test9@example.com";

    await store.saveUser(configId, guid, email);

    // Verify user exists
    const existingUser = await store.getUser(configId, guid);
    expect(existingUser).not.toBeNull();

    await store.deleteUser(configId, guid);

    // Verify user is deleted
    const deletedUser = await store.getUser(configId, guid);
    expect(deletedUser).toBeNull();
  });

  test("clearStore should remove all users", async () => {
    const configId1 = "test-config-1";
    const configId2 = "test-config-2";
    const guid1 = "test-guid-10";
    const guid2 = "test-guid-11";
    const email1 = "test10@example.com";
    const email2 = "test11@example.com";

    await store.saveUser(configId1, guid1, email1);
    await store.saveUser(configId2, guid2, email2);

    // Verify users exist
    const user1 = await store.getUser(configId1, guid1);
    const user2 = await store.getUser(configId2, guid2);
    expect(user1).not.toBeNull();
    expect(user2).not.toBeNull();

    await store.clearStore();

    // Verify all users are removed
    const deletedUser1 = await store.getUser(configId1, guid1);
    const deletedUser2 = await store.getUser(configId2, guid2);
    expect(deletedUser1).toBeNull();
    expect(deletedUser2).toBeNull();
  });

  test("should handle multiple users with same configId but different guids", async () => {
    const configId = "test-config";
    const guid1 = "test-guid-12";
    const guid2 = "test-guid-13";
    const email1 = "test12@example.com";
    const email2 = "test13@example.com";

    await store.saveUser(configId, guid1, email1);
    await store.saveUser(configId, guid2, email2);

    const user1 = await store.getUser(configId, guid1);
    const user2 = await store.getUser(configId, guid2);

    expect(user1).not.toBeNull();
    expect(user2).not.toBeNull();
    expect(user1?.guid).toEqual(guid1);
    expect(user2?.guid).toEqual(guid2);
    expect(user1?.email).toEqual(email1);
    expect(user2?.email).toEqual(email2);
  });

  test("should handle multiple users with same guid but different configIds", async () => {
    const configId1 = "test-config-1";
    const configId2 = "test-config-2";
    const guid = "test-guid-14";
    const email1 = "test14@example.com";
    const email2 = "test15@example.com";

    await store.saveUser(configId1, guid, email1);
    await store.saveUser(configId2, guid, email2);

    const user1 = await store.getUser(configId1, guid);
    const user2 = await store.getUser(configId2, guid);

    expect(user1).not.toBeNull();
    expect(user2).not.toBeNull();
    expect(user1?.configId).toEqual(configId1);
    expect(user2?.configId).toEqual(configId2);
    expect(user1?.email).toEqual(email1);
    expect(user2?.email).toEqual(email2);
  });
});
