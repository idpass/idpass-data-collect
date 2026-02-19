/**
 * @jest-environment jsdom
 */

import axios from "axios";
import { IdAuthAdapter } from "../IdAuthAdapter";
import { AuthConfig, SingleAuthStorage } from "../../../interfaces/types";

jest.mock("axios");
jest.mock("../../../utils/logger", () => ({
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

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe("IdAuthAdapter", () => {
  let adapter: IdAuthAdapter;
  let mockAuthStorage: jest.Mocked<SingleAuthStorage>;
  let authConfig: AuthConfig;

  beforeEach(() => {
    jest.clearAllMocks();

    mockAuthStorage = {
      getToken: jest.fn().mockResolvedValue(""),
      setToken: jest.fn().mockResolvedValue(undefined),
      removeToken: jest.fn().mockResolvedValue(undefined),
    };

    authConfig = {
      type: "id",
      fields: {
        serverUrl: "http://localhost:3000",
      },
    };

    adapter = new IdAuthAdapter(mockAuthStorage, authConfig);
  });

  describe("authenticateWithId", () => {
    it("should authenticate with national ID and date of birth", async () => {
      mockedAxios.post.mockResolvedValue({
        status: 200,
        data: { username: "beneficiary-456", token: "jwt-id-token" },
      });

      const result = await adapter.authenticateWithId("NID-12345", "1990-01-15", "tenant-1");

      expect(result).toEqual({ username: "beneficiary-456", token: "jwt-id-token" });
      expect(mockedAxios.post).toHaveBeenCalledWith(
        "http://localhost:3000/api/auth/id/verify",
        {
          nationalId: "NID-12345",
          dateOfBirth: "1990-01-15",
          tenantId: "tenant-1",
        },
      );
    });

    it("should store the token on successful authentication", async () => {
      mockedAxios.post.mockResolvedValue({
        status: 200,
        data: { username: "beneficiary-456", token: "jwt-id-token" },
      });

      await adapter.authenticateWithId("NID-12345", "1990-01-15", "tenant-1");

      expect(mockAuthStorage.setToken).toHaveBeenCalledWith("jwt-id-token");
    });

    it("should throw when authentication fails", async () => {
      mockedAxios.post.mockRejectedValue({
        response: { status: 401, data: { error: "Identity not found" } },
      });

      await expect(
        adapter.authenticateWithId("INVALID-ID", "2000-01-01", "tenant-1"),
      ).rejects.toThrow("ID verification failed");
    });

    it("should not store token when authentication fails", async () => {
      mockedAxios.post.mockRejectedValue({
        response: { status: 401, data: { error: "Identity not found" } },
      });

      await expect(
        adapter.authenticateWithId("INVALID-ID", "2000-01-01", "tenant-1"),
      ).rejects.toThrow();

      expect(mockAuthStorage.setToken).not.toHaveBeenCalled();
    });
  });

  describe("authenticateWithQr", () => {
    it("should authenticate with QR code data", async () => {
      mockedAxios.post.mockResolvedValue({
        status: 200,
        data: { username: "beneficiary-789", token: "jwt-qr-token" },
      });

      const qrData = JSON.stringify({
        entityGuid: "entity-abc",
        tenantId: "tenant-1",
        signature: "sig-xyz",
      });

      const result = await adapter.authenticateWithQr(qrData);

      expect(result).toEqual({ username: "beneficiary-789", token: "jwt-qr-token" });
      expect(mockedAxios.post).toHaveBeenCalledWith(
        "http://localhost:3000/api/auth/qr/verify",
        { qrData },
      );
    });

    it("should store the token on successful QR authentication", async () => {
      mockedAxios.post.mockResolvedValue({
        status: 200,
        data: { username: "beneficiary-789", token: "jwt-qr-token" },
      });

      await adapter.authenticateWithQr("qr-data");

      expect(mockAuthStorage.setToken).toHaveBeenCalledWith("jwt-qr-token");
    });

    it("should throw when QR authentication fails", async () => {
      mockedAxios.post.mockRejectedValue({
        response: { status: 401, data: { error: "Invalid QR code" } },
      });

      await expect(adapter.authenticateWithQr("invalid-qr")).rejects.toThrow(
        "QR authentication failed",
      );
    });
  });

  describe("isAuthenticated", () => {
    it("should return true when a valid token exists in storage", async () => {
      mockAuthStorage.getToken.mockResolvedValue("valid-token");
      mockedAxios.post.mockResolvedValue({
        status: 200,
        data: { valid: true },
      });

      const result = await adapter.isAuthenticated();

      expect(result).toBe(true);
    });

    it("should return false when no token exists in storage", async () => {
      mockAuthStorage.getToken.mockResolvedValue("");

      const result = await adapter.isAuthenticated();

      expect(result).toBe(false);
    });

    it("should return false when storage is null", async () => {
      const adapterWithoutStorage = new IdAuthAdapter(null, authConfig);

      const result = await adapterWithoutStorage.isAuthenticated();

      expect(result).toBe(false);
    });
  });

  describe("validateToken", () => {
    it("should return true for a valid token", async () => {
      mockedAxios.post.mockResolvedValue({
        status: 200,
        data: { valid: true },
      });

      const result = await adapter.validateToken("valid-jwt-token");

      expect(result).toBe(true);
    });

    it("should return false for an invalid token", async () => {
      mockedAxios.post.mockRejectedValue(new Error("Unauthorized"));

      const result = await adapter.validateToken("invalid-token");

      expect(result).toBe(false);
    });
  });

  describe("logout", () => {
    it("should remove token from storage", async () => {
      await adapter.logout();

      expect(mockAuthStorage.removeToken).toHaveBeenCalled();
    });

    it("should not throw when storage is null", async () => {
      const adapterWithoutStorage = new IdAuthAdapter(null, authConfig);

      await expect(adapterWithoutStorage.logout()).resolves.toBeUndefined();
    });
  });

  describe("initialize", () => {
    it("should resolve without error", async () => {
      await expect(adapter.initialize()).resolves.toBeUndefined();
    });
  });

  describe("login", () => {
    it("should throw indicating ID/QR flow should be used instead", async () => {
      await expect(adapter.login(null)).rejects.toThrow(
        "Use authenticateWithId() or authenticateWithQr() for ID-based authentication",
      );
    });
  });

  describe("handleCallback", () => {
    it("should resolve without error (no-op for ID auth)", async () => {
      await expect(adapter.handleCallback()).resolves.toBeUndefined();
    });
  });
});
