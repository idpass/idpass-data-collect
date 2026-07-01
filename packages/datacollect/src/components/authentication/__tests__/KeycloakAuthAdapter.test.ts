/**
 * @jest-environment jsdom
 */
import { KeycloakAuthAdapter } from "../KeycloakAuthAdapter";
import OIDCClient from "../OIDCClient";
import axios from "axios";
import { AuthConfig, SingleAuthStorage, OIDCConfig } from "../../../interfaces/types";
import { verifyOidcAccessToken } from "../verifyOidcAccessToken";

// Mock dependencies
jest.mock("../OIDCClient");
jest.mock("axios");
jest.mock("../verifyOidcAccessToken", () => ({ verifyOidcAccessToken: jest.fn() }));
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

const MockedOIDCClient = OIDCClient as jest.MockedClass<typeof OIDCClient>;
const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockVerify = verifyOidcAccessToken as jest.Mock;

describe("KeycloakAuthAdapter", () => {
  let adapter: KeycloakAuthAdapter;
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

    // Basic auth config
    authConfig = {
      type: "keycloak",
      fields: {
        authority: "https://keycloak.example.com/auth/realms/test",
        client_id: "test-client",
        redirect_uri: "http://localhost:3000/callback",
        post_logout_redirect_uri: "http://localhost:3000",
        response_type: "code",
        scope: "openid profile email",
      },
    };

    adapter = new KeycloakAuthAdapter(mockAuthStorage, authConfig);
  });

  describe("constructor", () => {
    it("should create adapter with auth storage", () => {
      expect(adapter).toBeInstanceOf(KeycloakAuthAdapter);
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
          },
        })
      );
    });

    it("should create adapter without auth storage", () => {
      const adapterWithoutStorage = new KeycloakAuthAdapter(null, authConfig);
      expect(adapterWithoutStorage).toBeInstanceOf(KeycloakAuthAdapter);
    });

    it("should transform config with extra query params", () => {
      const configWithExtras: AuthConfig = {
        type: "keycloak",
        fields: {
          ...authConfig.fields,
          customParam: "customValue",
          anotherParam: "anotherValue",
        },
      };

      new KeycloakAuthAdapter(mockAuthStorage, configWithExtras);

      expect(MockedOIDCClient).toHaveBeenCalledWith(
        expect.objectContaining({
          extraQueryParams: {
            post_logout_redirect_uri: "http://localhost:3000",
            customParam: "customValue",
            anotherParam: "anotherValue",
          },
        })
      );
    });

    it("should detect frontend environment", () => {
      // Mock window object
      Object.defineProperty(global, 'window', {
        value: { localStorage: {} },
        writable: true
      });

      const frontendAdapter = new KeycloakAuthAdapter(mockAuthStorage, authConfig);
      expect(frontendAdapter).toBeInstanceOf(KeycloakAuthAdapter);

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
    it("should perform logout", async () => {
      mockOIDCClient.logout.mockResolvedValue(undefined);

      await adapter.logout();

      expect(mockOIDCClient.logout).toHaveBeenCalled();
    });
  });

  describe("validateToken", () => {
    beforeEach(() => {
      // Reset environment detection by clearing window
      if ('window' in global) {
        delete (global as unknown as Record<string, unknown>).window;
      }
      // Also ensure window is truly undefined
      (global as unknown as Record<string, unknown>).window = undefined;
    });

    afterEach(() => {
      // Clean up window mock after each test
      if ('window' in global) {
        delete (global as unknown as Record<string, unknown>).window;
      }
    });

    it("delegates server-side validation to verifyOidcAccessToken with the tenant client binding", async () => {
      (global as unknown as Record<string, unknown>).window = undefined;

      const backendAdapter = new KeycloakAuthAdapter(mockAuthStorage, authConfig);
      mockVerify.mockResolvedValue(true);

      const result = await backendAdapter.validateToken("server-token");

      expect(result).toBe(true);
      expect(mockVerify).toHaveBeenCalledWith("server-token", {
        authority: authConfig.fields.authority,
        clientId: authConfig.fields.client_id,
        audience: authConfig.fields.audience,
      });
      expect(mockedAxios.get).not.toHaveBeenCalled();
      expect(mockOIDCClient.getStoredAuth).not.toHaveBeenCalled();
    });

    it("returns false when verifyOidcAccessToken rejects the token (H33)", async () => {
      (global as unknown as Record<string, unknown>).window = undefined;

      const backendAdapter = new KeycloakAuthAdapter(mockAuthStorage, authConfig);
      mockVerify.mockResolvedValue(false);

      expect(await backendAdapter.validateToken("foreign-token")).toBe(false);
    });

    it("should validate token on client side", async () => {
      // Mock frontend environment - ensure window exists with localStorage
      (global as unknown as Record<string, unknown>).window = { localStorage: {} };

      const frontendAdapter = new KeycloakAuthAdapter(mockAuthStorage, authConfig);
      const token = "test-token";

      mockOIDCClient.getStoredAuth.mockResolvedValue({
        access_token: token,
        expires_in: 3600,
      });

      const result = await frontendAdapter.validateToken(token);

      expect(result).toBe(true);
      expect(mockOIDCClient.getStoredAuth).toHaveBeenCalled();
      expect(mockVerify).not.toHaveBeenCalled();
    });

    it("should return false for mismatched token on client", async () => {
      (global as unknown as Record<string, unknown>).window = { localStorage: {} };

      const frontendAdapter = new KeycloakAuthAdapter(mockAuthStorage, authConfig);

      mockOIDCClient.getStoredAuth.mockResolvedValue({
        access_token: "different-token",
        expires_in: 3600,
      });

      const result = await frontendAdapter.validateToken("test-token");

      expect(result).toBe(false);
    });

    it("should call validateTokenClient when appType is frontend", async () => {
      (global as unknown as Record<string, unknown>).window = { localStorage: {} };

      const frontendAdapter = new KeycloakAuthAdapter(mockAuthStorage, authConfig);
      const token = "test-token";

      mockOIDCClient.getStoredAuth.mockResolvedValue({
        access_token: token,
        expires_in: 3600,
      });

      const result = await frontendAdapter.validateToken(token);

      expect(result).toBe(true);
      expect(mockOIDCClient.getStoredAuth).toHaveBeenCalled();
      expect(mockVerify).not.toHaveBeenCalled();
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
      mockOIDCClient.handleCallback.mockRejectedValue(new Error('No user found after callback'));

      await expect(adapter.handleCallback()).rejects.toThrow('No user found after callback');

      expect(mockOIDCClient.handleCallback).toHaveBeenCalled();
      expect(mockAuthStorage.setToken).not.toHaveBeenCalled();
    });

    it("should handle callback without auth storage", async () => {
      const adapterWithoutStorage = new KeycloakAuthAdapter(null, authConfig);
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

  describe("getStoredAuth", () => {
    it("should return stored auth from OIDC client", async () => {
      const mockAuth = {
        access_token: "stored-token",
        expires_in: 3600,
        profile: { name: "Stored User" },
      };

      mockOIDCClient.getStoredAuth.mockResolvedValue(mockAuth);

      const result = await adapter.getStoredAuth();

      expect(result).toEqual(mockAuth);
      expect(mockOIDCClient.getStoredAuth).toHaveBeenCalled();
    });
  });

  describe("transformConfig", () => {
    it("should preserve standard fields and move custom fields to extraQueryParams", () => {
      const configWithCustomFields: AuthConfig = {
        type: "keycloak",
        fields: {
          authority: "https://keycloak.example.com",
          client_id: "test-client",
          redirect_uri: "http://localhost:3000/callback",
          scope: "openid profile",
          customField1: "value1",
          customField2: "value2",
        },
      };

      new KeycloakAuthAdapter(mockAuthStorage, configWithCustomFields);

      expect(MockedOIDCClient).toHaveBeenCalledWith(
        expect.objectContaining({
          authority: "https://keycloak.example.com",
          client_id: "test-client",
          redirect_uri: "http://localhost:3000/callback",
          scope: "openid profile",
          extraQueryParams: {
            customField1: "value1",
            customField2: "value2",
          },
        })
      );
    });

    it("should handle config without custom fields", () => {
      const standardConfig: AuthConfig = {
        type: "keycloak",
        fields: {
          authority: "https://keycloak.example.com",
          client_id: "test-client",
        },
      };

      new KeycloakAuthAdapter(mockAuthStorage, standardConfig);

      expect(MockedOIDCClient).toHaveBeenCalledWith(
        expect.objectContaining({
          extraQueryParams: {},
        })
      );
    });

    it("should not include standard fields in extraQueryParams", () => {
      MockedOIDCClient.mockClear();
      const standardFields = [
        'clientId', 'client_id', 'domain', 'issuer', 'authority',
        'redirect_uri', 'scope', 'scopes', 'audience', 'responseType',
        'response_type', 'clientSecret', 'client_secret'
      ];

      const configWithStandardFields: AuthConfig = {
        type: "keycloak",
        fields: Object.fromEntries(standardFields.map(field => [field, `${field}-value`]))
      };

      new KeycloakAuthAdapter(mockAuthStorage, configWithStandardFields);

      const call = MockedOIDCClient.mock.calls[0][0] as OIDCConfig;
      expect(call.extraQueryParams).toEqual({});
    });

    it("should move post_logout_redirect_uri to extraQueryParams", () => {
      const configWithPostLogout: AuthConfig = {
        type: "keycloak",
        fields: {
          authority: "https://keycloak.example.com",
          client_id: "test-client",
          post_logout_redirect_uri: "http://localhost:3000",
        },
      };

      new KeycloakAuthAdapter(mockAuthStorage, configWithPostLogout);

      const call = MockedOIDCClient.mock.calls[0][0] as OIDCConfig;
      expect(call.extraQueryParams).toEqual({
        post_logout_redirect_uri: "http://localhost:3000",
      });
      expect(call.post_logout_redirect_uri).toBeUndefined();
    });
  });

  describe("error handling", () => {
    it("should handle axios timeout in token validation", async () => {
      // Ensure backend environment - window is undefined
      (global as unknown as Record<string, unknown>).window = undefined;

      const backendAdapter = new KeycloakAuthAdapter(mockAuthStorage, authConfig);
      const token = "test-token";
      const timeoutError = new Error("timeout of 5000ms exceeded");

      mockedAxios.get.mockRejectedValue(timeoutError);

      const result = await backendAdapter.validateToken(token);

      expect(result).toBe(false);
    });

    it("should handle network errors in token validation", async () => {
      // Ensure backend environment - window is undefined
      (global as unknown as Record<string, unknown>).window = undefined;

      const backendAdapter = new KeycloakAuthAdapter(mockAuthStorage, authConfig);
      const token = "test-token";
      const networkError = new Error("Network Error");

      mockedAxios.get.mockRejectedValue(networkError);

      const result = await backendAdapter.validateToken(token);

      expect(result).toBe(false);
    });
  });
}); 