/**
 * @jest-environment jsdom
 */

import axios from "axios";
import { OtpAuthAdapter } from "../OtpAuthAdapter";
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

describe("OtpAuthAdapter", () => {
  let adapter: OtpAuthAdapter;
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
      type: "otp",
      fields: {
        serverUrl: "http://localhost:3000",
      },
    };

    adapter = new OtpAuthAdapter(mockAuthStorage, authConfig);
  });

  describe("requestOtp", () => {
    it("should send OTP request and return success with expiry", async () => {
      mockedAxios.post.mockResolvedValue({
        status: 200,
        data: { success: true, expiresIn: 300 },
      });

      const result = await adapter.requestOtp("+1234567890");

      expect(result).toEqual({ success: true, expiresIn: 300 });
      expect(mockedAxios.post).toHaveBeenCalledWith(
        "http://localhost:3000/api/auth/otp/request",
        { identifier: "+1234567890" },
      );
    });

    it("should return failure when server rejects the request", async () => {
      mockedAxios.post.mockResolvedValue({
        status: 400,
        data: { success: false, expiresIn: 0 },
      });

      const result = await adapter.requestOtp("invalid");

      expect(result).toEqual({ success: false, expiresIn: 0 });
    });

    it("should return failure when a network error occurs", async () => {
      mockedAxios.post.mockRejectedValue(new Error("Network Error"));

      const result = await adapter.requestOtp("+1234567890");

      expect(result).toEqual({ success: false, expiresIn: 0 });
    });
  });

  describe("verifyOtp", () => {
    it("should verify OTP and return username and token on success", async () => {
      mockedAxios.post.mockResolvedValue({
        status: 200,
        data: { username: "beneficiary-123", token: "jwt-token-abc" },
      });

      const result = await adapter.verifyOtp("+1234567890", "123456");

      expect(result).toEqual({ username: "beneficiary-123", token: "jwt-token-abc" });
      expect(mockedAxios.post).toHaveBeenCalledWith(
        "http://localhost:3000/api/auth/otp/verify",
        { identifier: "+1234567890", otp: "123456" },
      );
    });

    it("should store the token in auth storage on successful verification", async () => {
      mockedAxios.post.mockResolvedValue({
        status: 200,
        data: { username: "beneficiary-123", token: "jwt-token-abc" },
      });

      await adapter.verifyOtp("+1234567890", "123456");

      expect(mockAuthStorage.setToken).toHaveBeenCalledWith("jwt-token-abc");
    });

    it("should throw when verification fails", async () => {
      mockedAxios.post.mockRejectedValue({
        response: { status: 401, data: { error: "Invalid OTP" } },
      });

      await expect(adapter.verifyOtp("+1234567890", "000000")).rejects.toThrow(
        "OTP verification failed",
      );
    });

    it("should not store token when verification fails", async () => {
      mockedAxios.post.mockRejectedValue({
        response: { status: 401, data: { error: "Invalid OTP" } },
      });

      await expect(adapter.verifyOtp("+1234567890", "000000")).rejects.toThrow();

      expect(mockAuthStorage.setToken).not.toHaveBeenCalled();
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
      const adapterWithoutStorage = new OtpAuthAdapter(null, authConfig);

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
      expect(mockedAxios.post).toHaveBeenCalledWith(
        "http://localhost:3000/api/users/check-token",
        {},
        { headers: { Authorization: "Bearer valid-jwt-token" } },
      );
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
      const adapterWithoutStorage = new OtpAuthAdapter(null, authConfig);

      await expect(adapterWithoutStorage.logout()).resolves.toBeUndefined();
    });
  });

  describe("initialize", () => {
    it("should resolve without error", async () => {
      await expect(adapter.initialize()).resolves.toBeUndefined();
    });
  });

  describe("login", () => {
    it("should throw indicating OTP flow should be used instead", async () => {
      await expect(adapter.login(null)).rejects.toThrow(
        "Use requestOtp() and verifyOtp() for OTP authentication",
      );
    });
  });

  describe("handleCallback", () => {
    it("should resolve without error (no-op for OTP)", async () => {
      await expect(adapter.handleCallback()).resolves.toBeUndefined();
    });
  });
});
