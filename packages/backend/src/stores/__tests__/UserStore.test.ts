import "dotenv/config";
import { Role, UserWithPasswordHash } from "../../types";
import { UserStoreImpl } from "../UserStore";

const getConnectionString = () => {
  const url = process.env.POSTGRES_TEST;
  if (!url) return "";
  const parsed = new URL(url.replace(/ /g, "%20"));
  const baseName = parsed.pathname.replace(/^\//, "");
  const dbName = baseName ? `${baseName}_user_store` : "datacollect_user_store";
  parsed.pathname = `/${dbName}`;
  return parsed.toString();
};

const ensureDatabaseExists = async (connectionString: string) => {
  if (!connectionString) return;
  const { Client } = require("pg");
  const parsed = new URL(connectionString);
  const dbName = parsed.pathname.replace(/^\//, "");
  if (!dbName) return;

  const adminUrl = new URL(connectionString);
  adminUrl.pathname = "/postgres";

  const client = new Client({ connectionString: adminUrl.toString() });
  await client.connect();
  const result = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
  if (result.rowCount === 0) {
    const escapedName = dbName.replace(/"/g, '""');
    await client.query(`CREATE DATABASE "${escapedName}"`);
  }
  await client.end();
};

const describeIfPostgres = process.env.POSTGRES_TEST ? describe : describe.skip;

describeIfPostgres("UserStore", () => {
  let adapter: UserStoreImpl;

  beforeAll(async () => {
    await ensureDatabaseExists(getConnectionString());
    adapter = new UserStoreImpl(getConnectionString());
    await adapter.initialize();
  });

  afterEach(async () => {
    await adapter.clearStore();
  });

  afterAll(async () => {
    await adapter.clearStore();
    await adapter.closeConnection();
  });

  test("saveUser and getUser should work correctly", async () => {
    const user = {
      email: "test@example.com",
      passwordHash: "hashedPassword",
      role: Role.USER,
    };

    await adapter.saveUser(user);

    const savedUser = await adapter.getUser(user.email);
    expect(savedUser?.email).toEqual(user.email);
    expect(savedUser?.passwordHash).toEqual(user.passwordHash);
    expect(savedUser?.role).toEqual(user.role);
  });

  test("updateUser should work correctly", async () => {
    const user = {
      email: "test2@example.com",
      passwordHash: "oldPassword",
      role: Role.USER,
    };

    await adapter.saveUser(user);
    const savedUser = await adapter.getUser(user.email);

    const updatedUser: UserWithPasswordHash = {
      id: savedUser?.id || 0,
      email: "test2@example.com",
      passwordHash: "newPassword",
      role: Role.ADMIN,
    };

    await adapter.updateUser(updatedUser);

    const savedUpdatedUser = await adapter.getUser(updatedUser.email);
    expect(savedUpdatedUser).toEqual(updatedUser);
  });

  test("deleteUser should work correctly", async () => {
    const user = {
      email: "test3@example.com",
      passwordHash: "password",
      role: Role.USER,
    };

    await adapter.saveUser(user);

    await adapter.deleteUser(user.email);

    const deletedUser = await adapter.getUser(user.email);
    expect(deletedUser).toBeNull();
  });

  test("hasAtLeastOneAdmin should work correctly", async () => {
    // Initially, there should be no admin users
    let hasAdmin = await adapter.hasAtLeastOneAdmin();
    expect(hasAdmin).toBe(false);

    // Create a regular user
    const regularUser: UserWithPasswordHash = {
      id: 4,
      email: "regular@example.com",
      passwordHash: "regularPassword",
      role: Role.USER,
    };
    await adapter.saveUser(regularUser);

    // There should still be no admin users
    hasAdmin = await adapter.hasAtLeastOneAdmin();
    expect(hasAdmin).toBe(false);

    // Create an admin user
    const adminUser: Omit<UserWithPasswordHash, "id"> = {
      email: "admin@example.com",
      passwordHash: "adminPassword",
      role: Role.ADMIN,
    };
    await adapter.saveUser(adminUser);

    // Now there should be at least one admin user
    hasAdmin = await adapter.hasAtLeastOneAdmin();
    expect(hasAdmin).toBe(true);
  });

  test("getAllUsers should return all users", async () => {
    const user1 = {
      email: "user1@example.com",
      passwordHash: "password1",
      role: Role.USER,
    };
    const user2 = {
      email: "user2@example.com",
      passwordHash: "password2",
      role: Role.ADMIN,
    };

    await adapter.saveUser(user1);
    await adapter.saveUser(user2);

    const allUsers = await adapter.getAllUsers();

    expect(allUsers).toHaveLength(2);
    expect(allUsers).toContainEqual({
      id: expect.any(Number),
      email: user1.email,
      role: user1.role,
    });
    expect(allUsers).toContainEqual({
      id: expect.any(Number),
      email: user2.email,
      role: user2.role,
    });
  });
});
