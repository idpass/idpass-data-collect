/**
 * @jest-environment jsdom
 */

import { Auth0AuthAdapter } from "../Auth0AuthAdapter";
import OIDCClient from "../OIDCClient";
import axios from "axios";
import { AuthConfig, SingleAuthStorage, OIDCConfig } from "../../../interfaces/types";

// Mock dependencies
jest.mock("../OIDCClient");
jest.mock("axios");

const MockedOIDCClient = OIDCClient as jest.MockedClass<typeof OIDCClient>;
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe("Auth0AuthAdapter", () => {
  let adapter: Auth0AuthAdapter;
  let mockAuthStorage: jest.Mocked<SingleAuthStorage>;
  let mockOIDCClient: jest.Mocked<OIDCClient>;
  let authConfig: AuthConfig;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock SingleAuthStorage
    mockAuthStorage = {
      getToken: jest.fn().mockResolvedValue("test-token"),
      setToken: jest.fn().mockResolvedValue(undefined),
      removeToken: jest.fn().mockResolvedValue(undefined),
    };

    // Mock OIDCClient
    mockOIDCClient = {
      getStoredAuth: jest.fn(),
      login: jest.fn(),
      logout: jest.fn(),
      handleCallback: jest.fn(),
    } as Partial<OIDCClient> as jest.Mocked<OIDCClient>;

    MockedOIDCClient.mockImplementation(() => mockOIDCClient);

    // Basic auth config with organization
    authConfig = {
      type: "auth0",
      fields: {
        authority: "https://dev-example.auth0.com",
        client_id: "test-client-id",
        redirect_uri: "http://localhost:3000/callback",
        post_logout_redirect_uri: "http://localhost:3000",
        response_type: "code",
        scope: "openid profile email",
        organization: "test-org-123",
      },
    };

    adapter = new Auth0AuthAdapter(mockAuthStorage, authConfig);
  });

  describe("constructor", () => {
    it("should create adapter with auth storage", () => {
      expect(adapter).toBeInstanceOf(Auth0AuthAdapter);
      expect(MockedOIDCClient).toHaveBeenCalledWith(
        expect.objectContaining({
          authority: authConfig.fields.authority,
          client_id: authConfig.fields.client_id,
          redirect_uri: authConfig.fields.redirect_uri,
          post_logout_redirect_uri: undefined,
          response_type: authConfig.fields.response_type,
          scope: authConfig.fields.scope,
          extraQueryParams: {
            post_logout_redirect_uri: "http://localhost:3000",
            organization: "test-org-123",
          },
        }),
      );
    });

    it("should create adapter without auth storage", () => {
      const adapterWithoutStorage = new Auth0AuthAdapter(null, authConfig);
      expect(adapterWithoutStorage).toBeInstanceOf(Auth0AuthAdapter);
    });

    it("should transform config with extra query params", () => {
      const configWithExtras: AuthConfig = {
        type: "auth0",
        fields: {
          ...authConfig.fields,
          customParam: "customValue",
          anotherParam: "anotherValue",
        },
      };

      new Auth0AuthAdapter(mockAuthStorage, configWithExtras);

      expect(MockedOIDCClient).toHaveBeenCalledWith(
        expect.objectContaining({
          extraQueryParams: {
            post_logout_redirect_uri: "http://localhost:3000",
            organization: "test-org-123",
            customParam: "customValue",
            anotherParam: "anotherValue",
          },
        }),
      );
    });

    it("should detect frontend environment", () => {
      // Mock window object
      Object.defineProperty(global, "window", {
        value: { localStorage: {} },
        writable: true,
      });

      const frontendAdapter = new Auth0AuthAdapter(mockAuthStorage, authConfig);
      expect(frontendAdapter).toBeInstanceOf(Auth0AuthAdapter);

      // Clean up
      delete (global as unknown as Record<string, unknown>).window;
    });
    it("should detect backend environment", () => {
      // Mock window object
      Object.defineProperty(global, "window", {
        value: undefined,
        writable: true,
      });

      const frontendAdapter = new Auth0AuthAdapter(mockAuthStorage, authConfig);
      expect(frontendAdapter).toBeInstanceOf(Auth0AuthAdapter);

      // Clean up
      delete (global as unknown as Record<string, unknown>).window;
    });
  });

  describe("initialize", () => {
    it("should initialize and restore session", async () => {
      mockOIDCClient.getStoredAuth.mockResolvedValue({
        access_token: "stored-token",
        expires_in: 3600,
        profile: { name: "Test User" },
      });

      await adapter.initialize();

      expect(mockOIDCClient.getStoredAuth).toHaveBeenCalled();
    });
  });

  describe("isAuthenticated", () => {
    it("should return true when valid auth exists", async () => {
      mockOIDCClient.getStoredAuth.mockResolvedValue({
        access_token: "valid-token",
        expires_in: 3600,
      });

      const result = await adapter.isAuthenticated();

      expect(result).toBe(true);
      expect(mockOIDCClient.getStoredAuth).toHaveBeenCalled();
    });

    it("should return false when no auth exists", async () => {
      mockOIDCClient.getStoredAuth.mockResolvedValue(null);

      const result = await adapter.isAuthenticated();

      expect(result).toBe(false);
    });

    it("should return false when auth has empty token", async () => {
      mockOIDCClient.getStoredAuth.mockResolvedValue({
        access_token: "",
        expires_in: 3600,
      });

      const result = await adapter.isAuthenticated();

      expect(result).toBe(false);
    });

    it("should return false when auth has whitespace-only token", async () => {
      mockOIDCClient.getStoredAuth.mockResolvedValue({
        access_token: "   ",
        expires_in: 3600,
      });

      const result = await adapter.isAuthenticated();

      expect(result).toBe(false);
    });
  });

  describe("login", () => {
    it("should perform login and return user info", async () => {
      const mockAuth = {
        access_token: "new-token",
        expires_in: 3600,
        profile: { name: "Test User" },
      };

      mockOIDCClient.login.mockResolvedValue(undefined);
      mockOIDCClient.getStoredAuth.mockResolvedValue(mockAuth);

      const result = await adapter.login();

      expect(mockOIDCClient.login).toHaveBeenCalled();
      expect(mockOIDCClient.getStoredAuth).toHaveBeenCalled();
      expect(result).toEqual({
        username: "Test User",
        token: "new-token",
      });
    });

    it("should handle login with no profile", async () => {
      const mockAuth = {
        access_token: "new-token",
        expires_in: 3600,
      };

      mockOIDCClient.login.mockResolvedValue(undefined);
      mockOIDCClient.getStoredAuth.mockResolvedValue(mockAuth);

      const result = await adapter.login();

      expect(result).toEqual({
        username: "",
        token: "new-token",
      });
    });

    it("should handle login failure", async () => {
      mockOIDCClient.login.mockResolvedValue(undefined);
      mockOIDCClient.getStoredAuth.mockResolvedValue(null);

      const result = await adapter.login();

      expect(result).toEqual({
        username: "",
        token: "",
      });
    });
  });

  describe("logout", () => {
    it("should perform logout and remove token from storage", async () => {
      mockOIDCClient.logout.mockResolvedValue(undefined);

      await adapter.logout();

      expect(mockOIDCClient.logout).toHaveBeenCalled();
      expect(mockAuthStorage.removeToken).toHaveBeenCalled();
    });

    it("should handle logout without auth storage", async () => {
      const adapterWithoutStorage = new Auth0AuthAdapter(null, authConfig);
      mockOIDCClient.logout.mockResolvedValue(undefined);

      await adapterWithoutStorage.logout();

      expect(mockOIDCClient.logout).toHaveBeenCalled();
      // Should not throw error when no auth storage
    });
  });

  describe("validateToken", () => {
    beforeEach(() => {
      // Reset environment detection by clearing window
      if ("window" in global) {
        delete (global as unknown as Record<string, unknown>).window;
      }
      // Also ensure window is truly undefined
      (global as unknown as Record<string, unknown>).window = undefined;
    });

    afterEach(() => {
      // Clean up window mock after each test
      if ("window" in global) {
        delete (global as unknown as Record<string, unknown>).window;
      }
    });

    it("should validate token on client side", async () => {
      // Mock frontend environment - ensure window exists with localStorage
      (global as unknown as Record<string, unknown>).window = { localStorage: {} };

      const frontendAdapter = new Auth0AuthAdapter(mockAuthStorage, authConfig);
      const token = "test-token";

      mockOIDCClient.getStoredAuth.mockResolvedValue({
        access_token: token,
        expires_in: 3600,
      });

      const result = await frontendAdapter.validateToken(token);

      expect(result).toBe(true);
      expect(mockOIDCClient.getStoredAuth).toHaveBeenCalled();
      // Verify axios was NOT called (not server-side validation)
      expect(mockedAxios.get).not.toHaveBeenCalled();
    });

    it("should return false for invalid token on server", async () => {
      // Ensure backend environment - window is undefined
      (global as unknown as Record<string, unknown>).window = undefined;

      const backendAdapter = new Auth0AuthAdapter(mockAuthStorage, authConfig);
      const token = "invalid-token";

      mockedAxios.get.mockRejectedValue(new Error("Unauthorized"));

      const result = await backendAdapter.validateToken(token);

      expect(result).toBe(false);
    });

    it("should return false when userinfo response has no sub", async () => {
      // Ensure backend environment - window is undefined
      (global as unknown as Record<string, unknown>).window = undefined;

      const backendAdapter = new Auth0AuthAdapter(mockAuthStorage, authConfig);
      const token = "test-token";
      const mockResponse = {
        status: 200,
        data: {
          name: "Test User",
          org_id: "test-org-123",
        }, // Missing 'sub' field
      };

      mockedAxios.get.mockResolvedValue(mockResponse);

      const result = await backendAdapter.validateToken(token);

      expect(result).toBe(false);
    });

    it("should return false when userinfo response status is not 200", async () => {
      // Ensure backend environment - window is undefined
      (global as unknown as Record<string, unknown>).window = undefined;

      const backendAdapter = new Auth0AuthAdapter(mockAuthStorage, authConfig);
      const token = "test-token";
      const mockResponse = {
        status: 401,
        data: { error: "Unauthorized" },
      };

      mockedAxios.get.mockResolvedValue(mockResponse);

      const result = await backendAdapter.validateToken(token);

      expect(result).toBe(false);
    });

    it("should return false when organization does not match", async () => {
      // Ensure backend environment - window is undefined
      (global as unknown as Record<string, unknown>).window = undefined;

      const backendAdapter = new Auth0AuthAdapter(mockAuthStorage, authConfig);
      const token = "test-token";
      const mockResponse = {
        status: 200,
        data: {
          sub: "user123",
          name: "Test User",
          org_id: "different-org-456", // Different organization
        },
      };

      mockedAxios.get.mockResolvedValue(mockResponse);

      const result = await backendAdapter.validateToken(token);

      expect(result).toBe(false);
    });

    it("should return false when organization is missing from response", async () => {
      // Ensure backend environment - window is undefined
      (global as unknown as Record<string, unknown>).window = undefined;

      const backendAdapter = new Auth0AuthAdapter(mockAuthStorage, authConfig);
      const token = "test-token";
      const mockResponse = {
        status: 200,
        data: {
          sub: "user123",
          name: "Test User",
          // Missing org_id
        },
      };

      mockedAxios.get.mockResolvedValue(mockResponse);

      const result = await backendAdapter.validateToken(token);

      expect(result).toBe(false);
    });

    it("should return false for mismatched token on client", async () => {
      // Mock frontend environment - ensure window exists with localStorage
      (global as unknown as Record<string, unknown>).window = { localStorage: {} };

      const frontendAdapter = new Auth0AuthAdapter(mockAuthStorage, authConfig);
      const token = "test-token";

      mockOIDCClient.getStoredAuth.mockResolvedValue({
        access_token: "different-token",
        expires_in: 3600,
      });

      const result = await frontendAdapter.validateToken(token);

      expect(result).toBe(false);
    });

    it("should call validateTokenServer when appType is backend", async () => {
      // Ensure backend environment - window is undefined
      (global as unknown as Record<string, unknown>).window = undefined;

      const backendAdapter = new Auth0AuthAdapter(mockAuthStorage, authConfig);
      const token = "test-token";

      // Mock successful server response
      const mockResponse = {
        status: 200,
        data: {
          sub: "user123",
          name: "Test User",
          org_id: "test-org-123",
        },
      };
      mockedAxios.get.mockResolvedValue(mockResponse);

      // Spy on the private method by checking what gets called
      const result = await backendAdapter.validateToken(token);

      expect(result).toBe(true);
      // Verify server-side validation was used (axios called)
      expect(mockedAxios.get).toHaveBeenCalledWith(`${authConfig.fields.authority}/userinfo`, expect.any(Object));
      // Verify client-side validation was NOT used
      expect(mockOIDCClient.getStoredAuth).not.toHaveBeenCalled();
    });

    it("should call validateTokenClient when appType is frontend", async () => {
      // Mock frontend environment - ensure window exists with localStorage
      (global as unknown as Record<string, unknown>).window = { localStorage: {} };

      const frontendAdapter = new Auth0AuthAdapter(mockAuthStorage, authConfig);
      const token = "test-token";

      // Mock client-side auth
      mockOIDCClient.getStoredAuth.mockResolvedValue({
        access_token: token,
        expires_in: 3600,
      });

      const result = await frontendAdapter.validateToken(token);

      expect(result).toBe(true);
      // Verify client-side validation was used
      expect(mockOIDCClient.getStoredAuth).toHaveBeenCalled();
      // Verify server-side validation was NOT used
      expect(mockedAxios.get).not.toHaveBeenCalled();
    });
  });

  describe("handleCallback", () => {
    it("should handle callback and store token", async () => {
      const mockUser = {
        access_token: "callback-token",
        expires_in: 3600,
        profile: { name: "Callback User" },
      };

      mockOIDCClient.handleCallback.mockResolvedValue(mockUser);

      await adapter.handleCallback();

      expect(mockOIDCClient.handleCallback).toHaveBeenCalled();
      expect(mockAuthStorage.setToken).toHaveBeenCalledWith("callback-token");
    });

    it("should handle callback without storing token when no user returned", async () => {
      mockOIDCClient.handleCallback.mockRejectedValue(new Error("No user found after callback"));

      await expect(adapter.handleCallback()).rejects.toThrow("No user found after callback");

      expect(mockOIDCClient.handleCallback).toHaveBeenCalled();
      expect(mockAuthStorage.setToken).not.toHaveBeenCalled();
    });

    it("should handle callback without auth storage", async () => {
      const adapterWithoutStorage = new Auth0AuthAdapter(null, authConfig);
      const mockUser = {
        access_token: "callback-token",
        expires_in: 3600,
      };

      mockOIDCClient.handleCallback.mockResolvedValue(mockUser);

      await adapterWithoutStorage.handleCallback();

      expect(mockOIDCClient.handleCallback).toHaveBeenCalled();
      // Should not throw error when no auth storage
    });
  });

  describe("transformConfig", () => {
    it("should preserve standard fields and move custom fields to extraQueryParams", () => {
      const configWithCustomFields: AuthConfig = {
        type: "auth0",
        fields: {
          authority: "https://dev-example.auth0.com",
          client_id: "test-client",
          redirect_uri: "http://localhost:3000/callback",
          scope: "openid profile",
          organization: "test-org",
          customField1: "value1",
          customField2: "value2",
        },
      };

      new Auth0AuthAdapter(mockAuthStorage, configWithCustomFields);

      expect(MockedOIDCClient).toHaveBeenCalledWith(
        expect.objectContaining({
          authority: "https://dev-example.auth0.com",
          client_id: "test-client",
          redirect_uri: "http://localhost:3000/callback",
          scope: "openid profile",
          extraQueryParams: {
            organization: "test-org",
            customField1: "value1",
            customField2: "value2",
          },
        }),
      );
    });

    it("should handle config without custom fields", () => {
      const standardConfig: AuthConfig = {
        type: "auth0",
        fields: {
          authority: "https://dev-example.auth0.com",
          client_id: "test-client",
        },
      };

      new Auth0AuthAdapter(mockAuthStorage, standardConfig);

      expect(MockedOIDCClient).toHaveBeenCalledWith(
        expect.objectContaining({
          extraQueryParams: {},
        }),
      );
    });

    it("should not include standard fields in extraQueryParams", () => {
      // Clear previous mock calls
      MockedOIDCClient.mockClear();

      const standardFields = [
        "clientId",
        "client_id",
        "domain",
        "issuer",
        "authority",
        "redirect_uri",
        "scope",
        "scopes",
        "audience",
        "responseType",
        "response_type",
        "clientSecret",
        "client_secret",
      ];

      const configWithStandardFields: AuthConfig = {
        type: "auth0",
        fields: Object.fromEntries(standardFields.map((field) => [field, `${field}-value`])),
      };

      new Auth0AuthAdapter(mockAuthStorage, configWithStandardFields);

      const call = MockedOIDCClient.mock.calls[0][0] as OIDCConfig;
      expect(call.extraQueryParams).toEqual({});
    });
  });

  describe("error handling", () => {
    it("should handle axios timeout in token validation", async () => {
      (global as unknown as Record<string, unknown>).window = undefined;

      const backendAdapter = new Auth0AuthAdapter(mockAuthStorage, authConfig);

      const token = "test-token";
      const timeoutError = new Error("timeout of 5000ms exceeded");

      mockedAxios.get.mockRejectedValue(timeoutError);
      const consoleSpy = jest.spyOn(console, "error").mockImplementation();

      const result = await backendAdapter.validateToken(token);

      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith("Error checking token activity:", timeoutError);

      consoleSpy.mockRestore();
    });

    it("should handle network errors in token validation", async () => {
      const token = "test-token";
      const networkError = new Error("Network Error");

      mockedAxios.get.mockRejectedValue(networkError);
      const consoleSpy = jest.spyOn(console, "error").mockImplementation();

      const result = await adapter.validateToken(token);

      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith("Error checking token activity:", networkError);

      consoleSpy.mockRestore();
    });

    it("should log token validation success", async () => {
      (global as unknown as Record<string, unknown>).window = undefined;

      const backendAdapter = new Auth0AuthAdapter(mockAuthStorage, authConfig);
      const token = "test-token";
      const mockResponse = {
        status: 200,
        data: {
          sub: "user123",
          name: "Test User",
          org_id: "test-org-123",
        },
      };

      mockedAxios.get.mockResolvedValue(mockResponse);
      const result = await backendAdapter.validateToken(token);

      expect(result).toBe(true);
    });
  });

  describe("appType detection", () => {
    it("should use backend validation when window is undefined", async () => {
      // Ensure backend environment - window is undefined
      (global as unknown as Record<string, unknown>).window = undefined;

      const backendAdapter = new Auth0AuthAdapter(mockAuthStorage, authConfig);
      const token = "test-token";

      // Mock successful server response
      const mockResponse = {
        status: 200,
        data: {
          sub: "user123",
          name: "Test User",
          org_id: "test-org-123",
        },
      };
      mockedAxios.get.mockResolvedValue(mockResponse);

      const result = await backendAdapter.validateToken(token);

      expect(result).toBe(true);
      // Verify server-side validation was used (proves appType is 'backend')
      expect(mockedAxios.get).toHaveBeenCalled();
      expect(mockOIDCClient.getStoredAuth).not.toHaveBeenCalled();
    });

    it("should use frontend validation when window exists with localStorage", async () => {
      // Mock frontend environment - ensure window exists with localStorage
      (global as unknown as Record<string, unknown>).window = { localStorage: {} };

      const frontendAdapter = new Auth0AuthAdapter(mockAuthStorage, authConfig);
      const token = "test-token";

      // Mock client-side auth
      mockOIDCClient.getStoredAuth.mockResolvedValue({
        access_token: token,
        expires_in: 3600,
      });

      const result = await frontendAdapter.validateToken(token);

      expect(result).toBe(true);
      // Verify client-side validation was used (proves appType is 'frontend')
      expect(mockOIDCClient.getStoredAuth).toHaveBeenCalled();
      expect(mockedAxios.get).not.toHaveBeenCalled();

      // Clean up
      delete (global as unknown as Record<string, unknown>).window;
    });

    it("should use backend validation when window exists but no localStorage", async () => {
      // Mock window without localStorage - this should result in backend mode
      (global as unknown as Record<string, unknown>).window = {};

      const backendAdapter = new Auth0AuthAdapter(mockAuthStorage, authConfig);
      const token = "test-token";

      // Mock successful server response
      const mockResponse = {
        status: 200,
        data: {
          sub: "user123",
          name: "Test User",
          org_id: "test-org-123",
        },
      };
      mockedAxios.get.mockResolvedValue(mockResponse);

      const result = await backendAdapter.validateToken(token);

      expect(result).toBe(true);
      // Verify server-side validation was used (proves appType is 'backend')
      expect(mockedAxios.get).toHaveBeenCalled();
      expect(mockOIDCClient.getStoredAuth).not.toHaveBeenCalled();

      // Clean up
      delete (global as unknown as Record<string, unknown>).window;
    });
  });
});
