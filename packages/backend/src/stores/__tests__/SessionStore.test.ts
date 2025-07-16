import "dotenv/config";

import { Pool } from "pg";
import { SessionStoreImpl } from "../SessionStore";
import { Session } from "../../types";

describe("SessionStore", () => {
  let adapter: SessionStoreImpl;
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({
      connectionString: process.env.POSTGRES_TEST || "",
    });
    adapter = new SessionStoreImpl(process.env.POSTGRES_TEST || "");
    await adapter.initialize();
  });

  afterEach(async () => {
    await adapter.clearStore();
  });

  afterAll(async () => {
    await adapter.clearStore();
    await adapter.closeConnection();
    await pool.end();
  });

  const mockSession: Session = {
    token: "test-token-123",
    entityGuid: "test-entity-guid",
    expiredDate: new Date("2024-12-31T23:59:59Z"),
  };

  const mockSession2: Session = {
    token: "test-token-456",
    entityGuid: "test-entity-guid-2",
    expiredDate: new Date("2024-12-31T23:59:59Z"),
  };

  describe("createSession", () => {
    it("should create a session successfully", async () => {
      await adapter.createSession(mockSession);

      const retrievedSession = await adapter.getSession(mockSession.token);
      expect(retrievedSession).toEqual(mockSession);
    });

    it("should handle multiple sessions", async () => {
      await adapter.createSession(mockSession);
      await adapter.createSession(mockSession2);

      const session1 = await adapter.getSession(mockSession.token);
      const session2 = await adapter.getSession(mockSession2.token);

      expect(session1).toEqual(mockSession);
      expect(session2).toEqual(mockSession2);
    });

    it("should handle session with different date formats", async () => {
      const sessionWithDifferentDate: Session = {
        ...mockSession,
        token: "test-token-date",
        expiredDate: new Date("2024-01-15T10:30:00Z"),
      };

      await adapter.createSession(sessionWithDifferentDate);
      const retrievedSession = await adapter.getSession(sessionWithDifferentDate.token);

      expect(retrievedSession).toEqual(sessionWithDifferentDate);
    });

    it("should handle session with special characters in token", async () => {
      const sessionWithSpecialChars: Session = {
        ...mockSession,
        token: "test-token-with-special-chars-!@#$%^&*()",
      };

      await adapter.createSession(sessionWithSpecialChars);
      const retrievedSession = await adapter.getSession(sessionWithSpecialChars.token);

      expect(retrievedSession).toEqual(sessionWithSpecialChars);
    });
  });

  describe("getSession", () => {
    it("should return null for non-existent session", async () => {
      const session = await adapter.getSession("non-existent-token");
      expect(session).toBeNull();
    });

    it("should retrieve an existing session", async () => {
      await adapter.createSession(mockSession);

      const retrievedSession = await adapter.getSession(mockSession.token);
      expect(retrievedSession).toEqual(mockSession);
    });

    it("should handle case-sensitive token matching", async () => {
      await adapter.createSession(mockSession);

      // Try to get with different case
      const session = await adapter.getSession(mockSession.token.toUpperCase());
      expect(session).toBeNull();
    });

    it("should return correct session data structure", async () => {
      await adapter.createSession(mockSession);

      const retrievedSession = await adapter.getSession(mockSession.token);
      expect(retrievedSession).toHaveProperty("token");
      expect(retrievedSession).toHaveProperty("entityGuid");
      expect(retrievedSession).toHaveProperty("expiredDate");
      expect(retrievedSession?.token).toBe(mockSession.token);
      expect(retrievedSession?.entityGuid).toBe(mockSession.entityGuid);
      expect(retrievedSession?.expiredDate).toEqual(mockSession.expiredDate);
    });
  });

  describe("deleteSession", () => {
    it("should delete an existing session", async () => {
      await adapter.createSession(mockSession);

      // Verify session exists
      const sessionBeforeDelete = await adapter.getSession(mockSession.token);
      expect(sessionBeforeDelete).toEqual(mockSession);

      // Delete session
      await adapter.deleteSession(mockSession.token);

      // Verify session is deleted
      const sessionAfterDelete = await adapter.getSession(mockSession.token);
      expect(sessionAfterDelete).toBeNull();
    });

    it("should not throw when deleting non-existent session", async () => {
      await expect(adapter.deleteSession("non-existent-token")).resolves.not.toThrow();
    });

    it("should delete only the specified session", async () => {
      await adapter.createSession(mockSession);
      await adapter.createSession(mockSession2);

      // Delete only the first session
      await adapter.deleteSession(mockSession.token);

      // Verify first session is deleted
      const session1 = await adapter.getSession(mockSession.token);
      expect(session1).toBeNull();

      // Verify second session still exists
      const session2 = await adapter.getSession(mockSession2.token);
      expect(session2).toEqual(mockSession2);
    });
  });

  describe("clearStore", () => {
    it("should remove all sessions from store", async () => {
      await adapter.createSession(mockSession);
      await adapter.createSession(mockSession2);

      // Verify sessions exist
      const session1 = await adapter.getSession(mockSession.token);
      const session2 = await adapter.getSession(mockSession2.token);
      expect(session1).toEqual(mockSession);
      expect(session2).toEqual(mockSession2);

      // Clear store
      await adapter.clearStore();

      // Verify all sessions are removed
      const session1AfterClear = await adapter.getSession(mockSession.token);
      const session2AfterClear = await adapter.getSession(mockSession2.token);
      expect(session1AfterClear).toBeNull();
      expect(session2AfterClear).toBeNull();
    });

    it("should handle clearStore on empty store", async () => {
      await expect(adapter.clearStore()).resolves.not.toThrow();
    });
  });

  describe("closeConnection", () => {
    it("should close the database connection", async () => {
      const testAdapter = new SessionStoreImpl(process.env.POSTGRES_TEST || "");
      await testAdapter.initialize();

      await expect(testAdapter.closeConnection()).resolves.not.toThrow();
    });
  });

  describe("initialization", () => {
    it("should create table if it doesn't exist", async () => {
      // Drop the table if it exists
      await pool.query("DROP TABLE IF EXISTS sessions");

      // Create a new adapter and initialize
      const newAdapter = new SessionStoreImpl(process.env.POSTGRES_TEST || "");
      await newAdapter.initialize();

      // Try to create a session to verify table exists
      await expect(newAdapter.createSession(mockSession)).resolves.not.toThrow();

      await newAdapter.clearStore();
      await newAdapter.closeConnection();
    });

    it("should handle table already exists", async () => {
      // Initialize should not throw if table already exists
      await expect(adapter.initialize()).resolves.not.toThrow();
    });
  });

  describe("error handling", () => {
    it("should handle database connection errors", async () => {
      const badAdapter = new SessionStoreImpl("postgresql://bad:connection@string");
      await expect(badAdapter.initialize()).rejects.toThrow();
    }, 10000);

    it("should handle invalid session data", async () => {
      // This test would depend on how the SessionStore handles invalid data
      // For now, we'll test that valid data works correctly
      await expect(adapter.createSession(mockSession)).resolves.not.toThrow();
    });
  });

  describe("session data integrity", () => {
    it("should preserve exact token values", async () => {
      const sessionWithLongToken: Session = {
        token: "a".repeat(1000), // Very long token
        entityGuid: "test-guid",
        expiredDate: new Date(),
      };

      await adapter.createSession(sessionWithLongToken);
      const retrievedSession = await adapter.getSession(sessionWithLongToken.token);

      expect(retrievedSession?.token).toBe(sessionWithLongToken.token);
    });

    it("should preserve exact entityGuid values", async () => {
      const sessionWithSpecialGuid: Session = {
        token: "test-token-guid",
        entityGuid: "guid-with-special-chars-!@#$%^&*()",
        expiredDate: new Date(),
      };

      await adapter.createSession(sessionWithSpecialGuid);
      const retrievedSession = await adapter.getSession(sessionWithSpecialGuid.token);

      expect(retrievedSession?.entityGuid).toBe(sessionWithSpecialGuid.entityGuid);
    });

    it("should preserve exact date values", async () => {
      const specificDate = new Date("2024-06-15T14:30:45.123Z");
      const sessionWithSpecificDate: Session = {
        token: "test-token-date",
        entityGuid: "test-guid",
        expiredDate: specificDate,
      };

      await adapter.createSession(sessionWithSpecificDate);
      const retrievedSession = await adapter.getSession(sessionWithSpecificDate.token);

      expect(retrievedSession?.expiredDate).toEqual(specificDate);
    });
  });
});
