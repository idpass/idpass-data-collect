/**
 * @jest-environment jsdom
 */

import { AuthManager } from "../AuthManager";
import { Auth0AuthAdapter } from "../authentication/Auth0AuthAdapter";
import { KeycloakAuthAdapter } from "../authentication/KeycloakAuthAdapter";
import { SingleAuthStorageImpl } from "../../services/SingleAuthStorageImpl";
import {
  AuthConfig,
  AuthStorageAdapter,
  PasswordCredentials,
  TokenCredentials,
} from "../../interfaces/types";
import axios from "axios";

// Mock axios
jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock the auth adapters
jest.mock("../authentication/Auth0AuthAdapter");
jest.mock("../authentication/KeycloakAuthAdapter");
jest.mock("../../services/SingleAuthStorageImpl");

const MockedAuth0AuthAdapter = Auth0AuthAdapter as jest.MockedClass<typeof Auth0AuthAdapter>;
const MockedKeycloakAuthAdapter = KeycloakAuthAdapter as jest.MockedClass<typeof KeycloakAuthAdapter>;
const MockedSingleAuthStorageImpl = SingleAuthStorageImpl as jest.MockedClass<typeof SingleAuthStorageImpl>;

describe("AuthManager", () => {
  let authManager: AuthManager;
  let mockAuthStorage: jest.Mocked<AuthStorageAdapter>;
  let mockAuth0Adapter: jest.Mocked<Auth0AuthAdapter>;
  let mockKeycloakAdapter: jest.Mocked<KeycloakAuthAdapter>;
  let mockSingleAuthStorage: jest.Mocked<SingleAuthStorageImpl>;

  const mockAuthConfigs: AuthConfig[] = [
    {
      type: "auth0",
      fields: {
        authority: "https://test.auth0.com",
        client_id: "test-client-id",
        redirect_uri: "http://localhost:3000/callback",
        post_logout_redirect_uri: "http://localhost:3000",
        response_type: "code",
        scope: "openid profile email",
        organization: "test-org",
      },
    },
    {
      type: "keycloak",
      fields: {
        authority: "https://test.keycloak.com/auth/realms/test",
        client_id: "test-keycloak-client",
        redirect_uri: "http://localhost:3000/callback",
        post_logout_redirect_uri: "http://localhost:3000",
        response_type: "code",
        scope: "openid profile email",
      },
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock AuthStorageAdapter
    mockAuthStorage = {
      initialize: jest.fn().mockResolvedValue(undefined),
      getUsername: jest.fn().mockResolvedValue("test-user"),
      getToken: jest.fn().mockResolvedValue({ provider: "default", token: "test-token" }),
      getTokenByProvider: jest.fn().mockResolvedValue("test-token"),
      setUsername: jest.fn().mockResolvedValue(undefined),
      setToken: jest.fn().mockResolvedValue(undefined),
      removeToken: jest.fn().mockResolvedValue(undefined),
      removeAllTokens: jest.fn().mockResolvedValue(undefined),
      closeConnection: jest.fn().mockResolvedValue(undefined),
      clearStore: jest.fn().mockResolvedValue(undefined),
    };

    // Mock SingleAuthStorageImpl
    mockSingleAuthStorage = {
      getToken: jest.fn().mockResolvedValue("test-token"),
      setToken: jest.fn().mockResolvedValue(undefined),
      removeToken: jest.fn().mockResolvedValue(undefined),
    } as Partial<SingleAuthStorageImpl> as jest.Mocked<SingleAuthStorageImpl>;

    MockedSingleAuthStorageImpl.mockImplementation(() => mockSingleAuthStorage);

    // Mock Auth0AuthAdapter
    mockAuth0Adapter = {
      initialize: jest.fn().mockResolvedValue(undefined),
      isAuthenticated: jest.fn().mockResolvedValue(false),
      login: jest.fn().mockResolvedValue({ username: "test-user", token: "test-token" }),
      logout: jest.fn().mockResolvedValue(undefined),
      validateToken: jest.fn().mockResolvedValue(true),
      handleCallback: jest.fn().mockResolvedValue(undefined),
      config: mockAuthConfigs[0],
    } as Partial<Auth0AuthAdapter> as jest.Mocked<Auth0AuthAdapter>;

    MockedAuth0AuthAdapter.mockImplementation(() => mockAuth0Adapter);

    // Mock KeycloakAuthAdapter
    mockKeycloakAdapter = {
      initialize: jest.fn().mockResolvedValue(undefined),
      isAuthenticated: jest.fn().mockResolvedValue(false),
      login: jest.fn().mockResolvedValue({ username: "test-user", token: "test-token" }),
      logout: jest.fn().mockResolvedValue(undefined),
      validateToken: jest.fn().mockResolvedValue(true),
      handleCallback: jest.fn().mockResolvedValue(undefined),
      getStoredAuth: jest.fn().mockResolvedValue(null),
      config: mockAuthConfigs[1],
    } as Partial<KeycloakAuthAdapter> as jest.Mocked<KeycloakAuthAdapter>;

    MockedKeycloakAuthAdapter.mockImplementation(() => mockKeycloakAdapter);

    authManager = new AuthManager(mockAuthConfigs, "http://localhost:8080", mockAuthStorage);
  });

  describe("constructor", () => {
    it("should create AuthManager with provided configs", () => {
      expect(authManager).toBeInstanceOf(AuthManager);
    });

    it("should create AuthManager without auth storage", () => {
      const authManagerWithoutStorage = new AuthManager(mockAuthConfigs, "http://localhost:8080");
      expect(authManagerWithoutStorage).toBeInstanceOf(AuthManager);
    });
  });

  describe("initialize", () => {
    it("should initialize adapters for all provided configs", async () => {
      await authManager.initialize();

      expect(MockedAuth0AuthAdapter).toHaveBeenCalledWith(mockSingleAuthStorage, mockAuthConfigs[0]);
      expect(MockedKeycloakAuthAdapter).toHaveBeenCalledWith(mockSingleAuthStorage, mockAuthConfigs[1]);
      expect(MockedSingleAuthStorageImpl).toHaveBeenCalledTimes(2);
    });

    it("should initialize adapters without auth storage", async () => {
      const authManagerWithoutStorage = new AuthManager(mockAuthConfigs, "http://localhost:8080");
      await authManagerWithoutStorage.initialize();

      expect(MockedAuth0AuthAdapter).toHaveBeenCalledWith(null, mockAuthConfigs[0]);
      expect(MockedKeycloakAuthAdapter).toHaveBeenCalledWith(null, mockAuthConfigs[1]);
    });

    it("should skip unknown adapter types", async () => {
      const configsWithUnknown: AuthConfig[] = [
        ...mockAuthConfigs,
        {
          type: "unknown",
          fields: { test: "value" },
        },
      ];

      const authManagerWithUnknown = new AuthManager(configsWithUnknown, "http://localhost:8080", mockAuthStorage);
      await authManagerWithUnknown.initialize();

      expect(MockedAuth0AuthAdapter).toHaveBeenCalledTimes(1);
      expect(MockedKeycloakAuthAdapter).toHaveBeenCalledTimes(1);
    });
  });

  describe("isAuthenticated", () => {
    beforeEach(async () => {
      await authManager.initialize();
    });

    it("should throw error when auth storage is not set", async () => {
      const authManagerWithoutStorage = new AuthManager(mockAuthConfigs, "http://localhost:8080");
      await authManagerWithoutStorage.initialize();

      await expect(authManagerWithoutStorage.isAuthenticated()).rejects.toThrow("Auth storage is not set");
    });

    it("should return true when any adapter is authenticated", async () => {
      mockAuth0Adapter.isAuthenticated.mockResolvedValue(true);
      mockKeycloakAdapter.isAuthenticated.mockResolvedValue(false);
      mockAuthStorage.getTokenByProvider.mockResolvedValue("");

      const result = await authManager.isAuthenticated();

      expect(result).toBe(true);
      expect(mockAuth0Adapter.isAuthenticated).toHaveBeenCalled();
      expect(mockKeycloakAdapter.isAuthenticated).toHaveBeenCalled();
    });

    it("should return true when default token exists", async () => {
      mockAuth0Adapter.isAuthenticated.mockResolvedValue(false);
      mockKeycloakAdapter.isAuthenticated.mockResolvedValue(false);
      mockAuthStorage.getTokenByProvider.mockResolvedValue("default-token");

      const result = await authManager.isAuthenticated();

      expect(result).toBe(true);
      expect(mockAuthStorage.getTokenByProvider).toHaveBeenCalledWith("default");
    });

    it("should return false when no adapters are authenticated and no default token", async () => {
      mockAuth0Adapter.isAuthenticated.mockResolvedValue(false);
      mockKeycloakAdapter.isAuthenticated.mockResolvedValue(false);
      mockAuthStorage.getTokenByProvider.mockResolvedValue("");

      const result = await authManager.isAuthenticated();

      expect(result).toBe(false);
    });
  });

  describe("login", () => {
    beforeEach(async () => {
      await authManager.initialize();
    });

    it("should throw error when auth storage is not set", async () => {
      const authManagerWithoutStorage = new AuthManager(mockAuthConfigs, "http://localhost:8080");
      await authManagerWithoutStorage.initialize();

      const credentials: PasswordCredentials = { username: "test", password: "password" };
      await expect(authManagerWithoutStorage.login(credentials)).rejects.toThrow("Auth storage is not set");
    });

    it("should login with specific adapter type", async () => {
      const credentials: TokenCredentials = { token: "test-token" };
      await authManager.login(credentials, "auth0");

      expect(mockAuth0Adapter.login).toHaveBeenCalledWith(credentials);
    });

    it("should perform default login with password credentials", async () => {
      const credentials: PasswordCredentials = { username: "test@example.com", password: "password" };
      mockedAxios.post.mockResolvedValue({ data: { token: "server-token" } });

      await authManager.login(credentials);

      expect(mockedAxios.post).toHaveBeenCalledWith("http://localhost:8080/api/users/login", {
        email: "test@example.com",
        password: "password",
      });
      expect(mockAuthStorage.setToken).toHaveBeenCalledWith("default", "server-token");
    });

    it("should handle sync server URL without protocol", async () => {
      const authManagerWithoutProtocol = new AuthManager(mockAuthConfigs, "localhost:8080", mockAuthStorage);
      await authManagerWithoutProtocol.initialize();

      const credentials: PasswordCredentials = { username: "test@example.com", password: "password" };
      mockedAxios.post.mockResolvedValue({ data: { token: "server-token" } });

      await authManagerWithoutProtocol.login(credentials);

      expect(mockedAxios.post).toHaveBeenCalledWith("http://localhost:8080/api/users/login", {
        email: "test@example.com",
        password: "password",
      });
    });

    it("should handle default login failure", async () => {
      const credentials: PasswordCredentials = { username: "test@example.com", password: "wrong-password" };
      mockedAxios.post.mockRejectedValue(new Error("Unauthorized"));

      await expect(authManager.login(credentials)).rejects.toThrow("Unauthorized");
    });

    it("should not perform login when credentials are null", async () => {
      await authManager.login(null);

      expect(mockAuth0Adapter.login).not.toHaveBeenCalled();
      expect(mockKeycloakAdapter.login).not.toHaveBeenCalled();
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it("should not perform login when credentials are token type without adapter type", async () => {
      const credentials: TokenCredentials = { token: "test-token" };
      await authManager.login(credentials);

      expect(mockAuth0Adapter.login).not.toHaveBeenCalled();
      expect(mockKeycloakAdapter.login).not.toHaveBeenCalled();
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });
  });

  describe("logout", () => {
    beforeEach(async () => {
      await authManager.initialize();
    });

    it("should logout from all adapters and clear auth storage", async () => {
      await authManager.logout();

      expect(mockAuth0Adapter.logout).toHaveBeenCalled();
      expect(mockKeycloakAdapter.logout).toHaveBeenCalled();
      expect(mockAuthStorage.removeAllTokens).toHaveBeenCalled();
    });

    it("should logout from adapters even without auth storage", async () => {
      const authManagerWithoutStorage = new AuthManager(mockAuthConfigs, "http://localhost:8080");
      await authManagerWithoutStorage.initialize();

      await authManagerWithoutStorage.logout();

      expect(mockAuth0Adapter.logout).toHaveBeenCalled();
      expect(mockKeycloakAdapter.logout).toHaveBeenCalled();
    });
  });

  describe("validateToken", () => {
    beforeEach(async () => {
      await authManager.initialize();
    });

    it("should validate token using specific adapter", async () => {
      mockAuth0Adapter.validateToken.mockResolvedValue(true);

      const result = await authManager.validateToken("auth0", "test-token");

      expect(result).toBe(true);
      expect(mockAuth0Adapter.validateToken).toHaveBeenCalledWith("test-token");
    });

    it("should return false for unknown adapter type", async () => {
      const result = await authManager.validateToken("unknown", "test-token");

      expect(result).toBe(false);
    });

    it("should return false when adapter validation fails", async () => {
      mockKeycloakAdapter.validateToken.mockResolvedValue(false);

      const result = await authManager.validateToken("keycloak", "invalid-token");

      expect(result).toBe(false);
      expect(mockKeycloakAdapter.validateToken).toHaveBeenCalledWith("invalid-token");
    });
  });

  describe("handleCallback", () => {
    beforeEach(async () => {
      await authManager.initialize();
    });

    it("should handle callback using specific adapter", async () => {
      await authManager.handleCallback("auth0");

      expect(mockAuth0Adapter.handleCallback).toHaveBeenCalled();
    });

    it("should handle callback for keycloak adapter", async () => {
      await authManager.handleCallback("keycloak");

      expect(mockKeycloakAdapter.handleCallback).toHaveBeenCalled();
    });

    it("should not throw error for unknown adapter type", async () => {
      await expect(authManager.handleCallback("unknown")).resolves.toBeUndefined();
    });
  });

  describe("edge cases", () => {
    it("should handle empty configs array", async () => {
      const authManagerEmpty = new AuthManager([], "http://localhost:8080", mockAuthStorage);
      await authManagerEmpty.initialize();

      const result = await authManagerEmpty.isAuthenticated();
      expect(result).toBe(false);
    });

    it("should handle adapter initialization errors gracefully", async () => {
      MockedAuth0AuthAdapter.mockImplementation(() => {
        throw new Error("Adapter initialization failed");
      });

      const authManagerWithError = new AuthManager([mockAuthConfigs[0]], "http://localhost:8080", mockAuthStorage);
      
      // Should not throw during initialization
      await expect(authManagerWithError.initialize()).resolves.toBeUndefined();
    });
  });
}); 