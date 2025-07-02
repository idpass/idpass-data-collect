/**
 * @jest-environment jsdom
 */

import "fake-indexeddb/auto";
import "core-js/stable/structured-clone";
import { IndexedDbAuthStorageAdapter } from "../IndexedDbAuthStorageAdapter";

describe("IndexedDbAuthStorageAdapter", () => {
  let adapter: IndexedDbAuthStorageAdapter;

  beforeEach(async () => {
    adapter = new IndexedDbAuthStorageAdapter();
    await adapter.initialize(); // Wait for the database to be initialized
  });

  afterEach(async () => {
    await adapter.clearStore();
  });

  test("setToken should store an authentication token in IndexedDB", async () => {
    const testToken =
      "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";

    await adapter.setToken("default", testToken);

    const retrievedToken = await adapter.getToken();
    expect(retrievedToken).toEqual({
      provider: "default",
      token: testToken,
    });
  });

  test("getToken should return null when no token is stored", async () => {
    const token = await adapter.getToken();
    expect(token).toBeNull();
  });

  test("getToken should return the most recently stored token", async () => {
    const token1 = "first_token";
    const token2 = "second_token";

    await adapter.setToken("default", token1);
    await adapter.setToken("default", token2);

    const retrievedToken = await adapter.getToken();
    expect(retrievedToken).toEqual({
      provider: "default",
      token: token2,
    });
  });

  test("removeToken should clear all stored tokens", async () => {
    const testToken = "test_token";
    await adapter.setToken("default", testToken);

    // Verify token is stored
    let retrievedToken = await adapter.getToken();
    expect(retrievedToken).toEqual({
      provider: "default",
      token: testToken,
    });

    // Remove token
    await adapter.removeToken("default");

    // Verify token is removed
    retrievedToken = await adapter.getToken();
    expect(retrievedToken).toBeNull();
  });

  test("setToken should replace existing token", async () => {
    const token1 = "first_token";
    const token2 = "second_token";

    await adapter.setToken("default", token1);
    await adapter.setToken("default", token2);

    const retrievedToken = await adapter.getToken();
    expect(retrievedToken).toEqual({
      provider: "default",
      token: token2,
    });
  });

  test("setToken should throw error for invalid token", async () => {
    await expect(adapter.setToken("default", "")).rejects.toThrow(
      "Invalid token provided: token must be a non-empty string",
    );
    await expect(adapter.setToken("default", null as unknown as string)).rejects.toThrow(
      "Invalid token provided: token must be a non-empty string",
    );
    await expect(adapter.setToken("default", undefined as unknown as string)).rejects.toThrow(
      "Invalid token provided: token must be a non-empty string",
    );
  });

  test("setToken should throw error when IndexedDB is not initialized", async () => {
    const uninitializedAdapter = new IndexedDbAuthStorageAdapter();

    await expect(uninitializedAdapter.setToken("default", "test_token")).rejects.toThrow(
      "IndexedDB is not initialized for auth storage",
    );
  });

  test("getToken should return null when IndexedDB is not initialized", async () => {
    const uninitializedAdapter = new IndexedDbAuthStorageAdapter();

    const token = await uninitializedAdapter.getToken();
    expect(token).toBeNull();
  });

  test("removeToken should throw error when IndexedDB is not initialized", async () => {
    const uninitializedAdapter = new IndexedDbAuthStorageAdapter();

    await expect(uninitializedAdapter.removeToken("default")).rejects.toThrow(
      "IndexedDB is not initialized for auth storage",
    );
  });

  test("clearStore should clear all authentication data", async () => {
    const testToken = "test_token";
    await adapter.setToken("default", testToken);

    // Verify token is stored
    let retrievedToken = await adapter.getToken();
    expect(retrievedToken).toEqual({
      provider: "default",
      token: testToken,
    });

    // Clear store
    await adapter.clearStore();

    // Verify token is removed
    retrievedToken = await adapter.getToken();
    expect(retrievedToken).toBeNull();
  });

  test("clearStore should throw error when IndexedDB is not initialized", async () => {
    const uninitializedAdapter = new IndexedDbAuthStorageAdapter();

    await expect(uninitializedAdapter.clearStore()).rejects.toThrow("IndexedDB is not initialized for auth storage");
  });

  test("closeConnection should resolve without error", async () => {
    await expect(adapter.closeConnection()).resolves.toBeUndefined();
  });

  test("should work with tenant-specific database", async () => {
    const tenantAdapter = new IndexedDbAuthStorageAdapter("tenant1");
    await tenantAdapter.initialize();

    const testToken = "tenant_specific_token";
    await tenantAdapter.setToken("default", testToken);

    const retrievedToken = await tenantAdapter.getToken();
    expect(retrievedToken).toEqual({
      provider: "default",
      token: testToken,
    });

    // Verify default adapter doesn't have the token
    const defaultToken = await adapter.getToken();
    expect(defaultToken).toBeNull();

    await tenantAdapter.clearStore();
  });

  test("should handle multiple tenant databases independently", async () => {
    const tenant1Adapter = new IndexedDbAuthStorageAdapter("tenant1");
    const tenant2Adapter = new IndexedDbAuthStorageAdapter("tenant2");

    await tenant1Adapter.initialize();
    await tenant2Adapter.initialize();

    const token1 = "tenant1_token";
    const token2 = "tenant2_token";

    await tenant1Adapter.setToken("default", token1);
    await tenant2Adapter.setToken("default", token2);

    const retrievedToken1 = await tenant1Adapter.getToken();
    const retrievedToken2 = await tenant2Adapter.getToken();

    expect(retrievedToken1).toEqual({
      provider: "default",
      token: token1,
    });
    expect(retrievedToken2).toEqual({
      provider: "default",
      token: token2,
    });

    await tenant1Adapter.clearStore();
    await tenant2Adapter.clearStore();
  });

  test("should handle JWT tokens correctly", async () => {
    const jwtToken =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";

    await adapter.setToken("default", jwtToken);

    const retrievedToken = await adapter.getToken();
    expect(retrievedToken).toEqual({
      provider: "default",
      token: jwtToken,
    });
    expect(retrievedToken?.token).toMatch(/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/);
  });

  test("should handle long tokens correctly", async () => {
    const longToken = "a".repeat(1000);

    await adapter.setToken("default", longToken);

    const retrievedToken = await adapter.getToken();
    expect(retrievedToken).toEqual({
      provider: "default",
      token: longToken,
    });
    expect(retrievedToken?.token.length).toBe(1000);
  });

  test("should handle special characters in tokens", async () => {
    const specialToken = "token-with-special-chars!@#$%^&*()_+-=[]{}|;':\",./<>?";

    await adapter.setToken("default", specialToken);

    const retrievedToken = await adapter.getToken();
    expect(retrievedToken).toEqual({
      provider: "default",
      token: specialToken,
    });
  });

  test("should handle token replacement with different lengths", async () => {
    const shortToken = "short";
    const longToken = "very_long_token_with_many_characters";

    await adapter.setToken("default", shortToken);
    await adapter.setToken("default", longToken);

    const retrievedToken = await adapter.getToken();
    expect(retrievedToken).toEqual({
      provider: "default",
      token: longToken,
    });
  });

  test("should maintain token integrity across operations", async () => {
    const originalToken = "original_token";
    await adapter.setToken("default", originalToken);

    // Perform various operations
    await adapter.getTokenByProvider("default");
    await adapter.getToken();

    // Token should remain unchanged
    const finalToken = await adapter.getToken();
    expect(finalToken).toEqual({
      provider: "default",
      token: originalToken,
    });
  });

  test("getUsername should return the username for the default provider", async () => {
    await adapter.setUsername("test_username1");

    const retrievedUsername = await adapter.getUsername();
    expect(retrievedUsername).toBe("test_username1");
  });

  test("getUsername should return empty string when no username is stored", async () => {
    const username = await adapter.getUsername();
    expect(username).toBe("");
  });

  test("setUsername should replace existing username", async () => {
    const username1 = "test_username";
    const username2 = "test_username2";

    await adapter.setUsername(username1);
    await adapter.setUsername(username2);

    const retrievedUsername = await adapter.getUsername();
    expect(retrievedUsername).toBe(username2);
  });

  test("should handle multiple providers correctly", async () => {
    const token1 = "provider1_token";
    const token2 = "provider2_token";

    await adapter.setToken("provider1", token1);
    await adapter.setToken("provider2", token2);

    // getToken should return the first token found (provider1)
    const retrievedToken = await adapter.getToken();
    expect(retrievedToken).toEqual({
      provider: "provider1",
      token: token1,
    });

    // getTokenByProvider should return specific tokens
    const provider1Token = await adapter.getTokenByProvider("provider1");
    const provider2Token = await adapter.getTokenByProvider("provider2");
    expect(provider1Token).toBe(token1);
    expect(provider2Token).toBe(token2);
  });

  test("removeAllTokens should clear all stored tokens", async () => {
    const token1 = "provider1_token";
    const token2 = "provider2_token";

    await adapter.setToken("provider1", token1);
    await adapter.setToken("provider2", token2);

    // Verify tokens are stored
    let retrievedToken = await adapter.getToken();
    expect(retrievedToken).not.toBeNull();

    // Remove all tokens
    await adapter.removeAllTokens();

    // Verify all tokens are removed
    retrievedToken = await adapter.getToken();
    expect(retrievedToken).toBeNull();

    const provider1Token = await adapter.getTokenByProvider("provider1");
    const provider2Token = await adapter.getTokenByProvider("provider2");
    expect(provider1Token).toBe("");
    expect(provider2Token).toBe("");
  });
});
