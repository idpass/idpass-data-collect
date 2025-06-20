/**
 * @jest-environment jsdom
 */

import "fake-indexeddb/auto";
import "core-js/stable/structured-clone";
import { IndexedDbAuthStoragAdatper } from "../IndexedDbAuthStoragAdatper";

describe("IndexedDbAuthStoragAdatper", () => {
  let adapter: IndexedDbAuthStoragAdatper;

  beforeEach(async () => {
    adapter = new IndexedDbAuthStoragAdatper();
    await adapter.initialize(); // Wait for the database to be initialized
  });

  afterEach(async () => {
    await adapter.clearStore();
  });

  test("setToken should store an authentication token in IndexedDB", async () => {
    const testToken =
      "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";

    await adapter.setToken(testToken);

    const retrievedToken = await adapter.getToken();
    expect(retrievedToken).toBe(testToken);
  });

  test("getToken should return empty string when no token is stored", async () => {
    const token = await adapter.getToken();
    expect(token).toBe("");
  });

  test("getToken should return the most recently stored token", async () => {
    const token1 = "first_token";
    const token2 = "second_token";

    await adapter.setToken(token1);
    await adapter.setToken(token2);

    const retrievedToken = await adapter.getToken();
    expect(retrievedToken).toBe(token2);
  });

  test("removeToken should clear all stored tokens", async () => {
    const testToken = "test_token";
    await adapter.setToken(testToken);

    // Verify token is stored
    let retrievedToken = await adapter.getToken();
    expect(retrievedToken).toBe(testToken);

    // Remove token
    await adapter.removeToken();

    // Verify token is removed
    retrievedToken = await adapter.getToken();
    expect(retrievedToken).toBe("");
  });

  test("hasToken should return true when a token exists", async () => {
    const testToken = "test_token";
    await adapter.setToken(testToken);

    const hasToken = await adapter.hasToken();
    expect(hasToken).toBe(true);
  });

  test("hasToken should return false when no token exists", async () => {
    const hasToken = await adapter.hasToken();
    expect(hasToken).toBe(false);
  });

  test("hasToken should return false after token removal", async () => {
    const testToken = "test_token";
    await adapter.setToken(testToken);
    await adapter.removeToken();

    const hasToken = await adapter.hasToken();
    expect(hasToken).toBe(false);
  });

  test("getTokenTimestamp should return timestamp when token exists", async () => {
    const testToken = "test_token";
    await adapter.setToken(testToken);

    const timestamp = await adapter.getTokenTimestamp();
    expect(timestamp).toBeTruthy();
    expect(typeof timestamp).toBe("string");
    expect(new Date(timestamp!).getTime()).toBeGreaterThan(0);
  });

  test("getTokenTimestamp should return null when no token exists", async () => {
    const timestamp = await adapter.getTokenTimestamp();
    expect(timestamp).toBeNull();
  });

  test("setToken should replace existing token", async () => {
    const token1 = "first_token";
    const token2 = "second_token";

    await adapter.setToken(token1);
    await adapter.setToken(token2);

    const retrievedToken = await adapter.getToken();
    expect(retrievedToken).toBe(token2);

    // Verify only one token exists (the latest one)
    const timestamp = await adapter.getTokenTimestamp();
    expect(timestamp).toBeTruthy();
  });

  test("setToken should throw error for invalid token", async () => {
    await expect(adapter.setToken("")).rejects.toThrow("Invalid token provided: token must be a non-empty string");
    await expect(adapter.setToken(null as unknown as string)).rejects.toThrow(
      "Invalid token provided: token must be a non-empty string",
    );
    await expect(adapter.setToken(undefined as unknown as string)).rejects.toThrow(
      "Invalid token provided: token must be a non-empty string",
    );
  });

  test("setToken should throw error when IndexedDB is not initialized", async () => {
    const uninitializedAdapter = new IndexedDbAuthStoragAdatper();

    await expect(uninitializedAdapter.setToken("test_token")).rejects.toThrow(
      "IndexedDB is not initialized for auth storage",
    );
  });

  test("getToken should return empty string when IndexedDB is not initialized", async () => {
    const uninitializedAdapter = new IndexedDbAuthStoragAdatper();

    const token = await uninitializedAdapter.getToken();
    expect(token).toBe("");
  });

  test("removeToken should throw error when IndexedDB is not initialized", async () => {
    const uninitializedAdapter = new IndexedDbAuthStoragAdatper();

    await expect(uninitializedAdapter.removeToken()).rejects.toThrow("IndexedDB is not initialized for auth storage");
  });

  test("clearStore should clear all authentication data", async () => {
    const testToken = "test_token";
    await adapter.setToken(testToken);

    // Verify token is stored
    let retrievedToken = await adapter.getToken();
    expect(retrievedToken).toBe(testToken);

    // Clear store
    await adapter.clearStore();

    // Verify token is removed
    retrievedToken = await adapter.getToken();
    expect(retrievedToken).toBe("");
  });

  test("clearStore should throw error when IndexedDB is not initialized", async () => {
    const uninitializedAdapter = new IndexedDbAuthStoragAdatper();

    await expect(uninitializedAdapter.clearStore()).rejects.toThrow("IndexedDB is not initialized for auth storage");
  });

  test("closeConnection should resolve without error", async () => {
    await expect(adapter.closeConnection()).resolves.toBeUndefined();
  });

  test("should work with tenant-specific database", async () => {
    const tenantAdapter = new IndexedDbAuthStoragAdatper("tenant1");
    await tenantAdapter.initialize();

    const testToken = "tenant_specific_token";
    await tenantAdapter.setToken(testToken);

    const retrievedToken = await tenantAdapter.getToken();
    expect(retrievedToken).toBe(testToken);

    // Verify default adapter doesn't have the token
    const defaultToken = await adapter.getToken();
    expect(defaultToken).toBe("");

    await tenantAdapter.clearStore();
  });

  test("should handle multiple tenant databases independently", async () => {
    const tenant1Adapter = new IndexedDbAuthStoragAdatper("tenant1");
    const tenant2Adapter = new IndexedDbAuthStoragAdatper("tenant2");

    await tenant1Adapter.initialize();
    await tenant2Adapter.initialize();

    const token1 = "tenant1_token";
    const token2 = "tenant2_token";

    await tenant1Adapter.setToken(token1);
    await tenant2Adapter.setToken(token2);

    const retrievedToken1 = await tenant1Adapter.getToken();
    const retrievedToken2 = await tenant2Adapter.getToken();

    expect(retrievedToken1).toBe(token1);
    expect(retrievedToken2).toBe(token2);

    await tenant1Adapter.clearStore();
    await tenant2Adapter.clearStore();
  });

  test("should handle JWT tokens correctly", async () => {
    const jwtToken =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";

    await adapter.setToken(jwtToken);

    const retrievedToken = await adapter.getToken();
    expect(retrievedToken).toBe(jwtToken);
    expect(retrievedToken).toMatch(/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/);
  });

  test("should handle long tokens correctly", async () => {
    const longToken = "a".repeat(1000);

    await adapter.setToken(longToken);

    const retrievedToken = await adapter.getToken();
    expect(retrievedToken).toBe(longToken);
    expect(retrievedToken.length).toBe(1000);
  });

  test("should handle special characters in tokens", async () => {
    const specialToken = "token-with-special-chars!@#$%^&*()_+-=[]{}|;':\",./<>?";

    await adapter.setToken(specialToken);

    const retrievedToken = await adapter.getToken();
    expect(retrievedToken).toBe(specialToken);
  });

  test("should handle token replacement with different lengths", async () => {
    const shortToken = "short";
    const longToken = "very_long_token_with_many_characters";

    await adapter.setToken(shortToken);
    await adapter.setToken(longToken);

    const retrievedToken = await adapter.getToken();
    expect(retrievedToken).toBe(longToken);
  });

  test("should maintain token integrity across operations", async () => {
    const originalToken = "original_token";
    await adapter.setToken(originalToken);

    // Perform various operations
    await adapter.hasToken();
    await adapter.getTokenTimestamp();
    await adapter.getToken();

    // Token should remain unchanged
    const finalToken = await adapter.getToken();
    expect(finalToken).toBe(originalToken);
  });
});
