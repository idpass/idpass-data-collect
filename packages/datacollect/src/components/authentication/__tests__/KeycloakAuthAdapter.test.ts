/**
 * @jest-environment jsdom
 */
import { KeycloakAuthAdapter } from "../KeycloakAuthAdapter";
import OIDCClient from "../OIDCClient";
import axios from "axios";
import { AuthConfig, SingleAuthStorage, OIDCConfig } from "../../../interfaces/types";

// Mock dependencies
jest.mock("../OIDCClient");
jest.mock("axios");

const MockedOIDCClient = OIDCClient as jest.MockedClass<typeof OIDCClient>;
const mockedAxios = axios as jest.Mocked<typeof axios>;

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
      createUser: jest.fn(),
      addUserToOrganization: jest.fn(),
      resetPassword: jest.fn(),
    } as Partial<OIDCClient> as jest.Mocked<OIDCClient>;

    MockedOIDCClient.mockImplementation(() => mockOIDCClient);

    // Basic auth config with required fields for Management API
    authConfig = {
      type: "keycloak",
      fields: {
        authority: "https://keycloak.example.com/auth/realms/test",
        client_id: "test-client",
        api_client_id: "test-api-client-id",
        api_client_secret: "test-api-client-secret",
        redirect_uri: "http://localhost:3000/callback",
        post_logout_redirect_uri: "http://localhost:3000",
        response_type: "code",
        scope: "openid profile email",
        host: "https://keycloak.example.com",
        realm: "test",
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
            host: "https://keycloak.example.com",
            realm: "test",
          },
        }),
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
            host: "https://keycloak.example.com",
            realm: "test",
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

      const frontendAdapter = new KeycloakAuthAdapter(mockAuthStorage, authConfig);
      expect(frontendAdapter).toBeInstanceOf(KeycloakAuthAdapter);

      // Clean up
      delete (global as unknown as Record<string, unknown>).window;
    });
    
    it("should detect backend environment", () => {
      // Mock window object
      Object.defineProperty(global, "window", {
        value: undefined,
        writable: true,
      });

      const backendAdapter = new KeycloakAuthAdapter(mockAuthStorage, authConfig);
      expect(backendAdapter).toBeInstanceOf(KeycloakAuthAdapter);

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

    it("should handle logout without auth storage", async () => {
      const adapterWithoutStorage = new KeycloakAuthAdapter(null, authConfig);
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

    it("should validate token on server side using userinfo", async () => {
      // Ensure backend environment - window is undefined
      (global as unknown as Record<string, unknown>).window = undefined;

      const backendAdapter = new KeycloakAuthAdapter(mockAuthStorage, authConfig);
      const token = "test-token";
      const mockResponse = {
        status: 200,
        data: { sub: "user123", name: "Test User" },
      };

      mockedAxios.get.mockResolvedValue(mockResponse);

      const result = await backendAdapter.validateToken(token);

      expect(result).toBe(true);
      expect(mockedAxios.get).toHaveBeenCalledWith(`${authConfig.fields.authority}/protocol/openid-connect/userinfo`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        timeout: 5000,
      });
    });

    it("should explicitly use backend validation when no window object exists", async () => {
      // Ensure backend environment - window is undefined
      (global as unknown as Record<string, unknown>).window = undefined;

      const backendAdapter = new KeycloakAuthAdapter(mockAuthStorage, authConfig);
      const token = "backend-test-token";
      const mockResponse = {
        status: 200,
        data: {
          sub: "backend-user",
          name: "Backend User",
        },
      };

      mockedAxios.get.mockResolvedValue(mockResponse);

      const result = await backendAdapter.validateToken(token);

      expect(result).toBe(true);
      // Verify axios was called (server-side validation)
      expect(mockedAxios.get).toHaveBeenCalledWith(
        `${authConfig.fields.authority}/protocol/openid-connect/userinfo`,
        expect.objectContaining({
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          timeout: 5000,
        }),
      );
      // Verify OIDC client was NOT called (not client-side validation)
      expect(mockOIDCClient.getStoredAuth).not.toHaveBeenCalled();
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
      // Verify axios was NOT called (not server-side validation)
      expect(mockedAxios.get).not.toHaveBeenCalled();
    });

    it("should return false for invalid token on server", async () => {
      // Ensure backend environment - window is undefined
      (global as unknown as Record<string, unknown>).window = undefined;

      const backendAdapter = new KeycloakAuthAdapter(mockAuthStorage, authConfig);
      const token = "invalid-token";

      mockedAxios.get.mockRejectedValue(new Error("Unauthorized"));

      const result = await backendAdapter.validateToken(token);

      expect(result).toBe(false);
    });

    it("should return false when userinfo response has no sub", async () => {
      // Ensure backend environment - window is undefined
      (global as unknown as Record<string, unknown>).window = undefined;

      const backendAdapter = new KeycloakAuthAdapter(mockAuthStorage, authConfig);
      const token = "test-token";
      const mockResponse = {
        status: 200,
        data: { name: "Test User" }, // Missing 'sub' field
      };

      mockedAxios.get.mockResolvedValue(mockResponse);

      const result = await backendAdapter.validateToken(token);

      expect(result).toBe(false);
    });

    it("should return false when userinfo response status is not 200", async () => {
      // Ensure backend environment - window is undefined
      (global as unknown as Record<string, unknown>).window = undefined;

      const backendAdapter = new KeycloakAuthAdapter(mockAuthStorage, authConfig);
      const token = "test-token";
      const mockResponse = {
        status: 401,
        data: { error: "Unauthorized" },
      };

      mockedAxios.get.mockResolvedValue(mockResponse);

      const result = await backendAdapter.validateToken(token);

      expect(result).toBe(false);
    });

    it("should return false for mismatched token on client", async () => {
      // Mock frontend environment - ensure window exists with localStorage
      (global as unknown as Record<string, unknown>).window = { localStorage: {} };

      const frontendAdapter = new KeycloakAuthAdapter(mockAuthStorage, authConfig);
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

      const backendAdapter = new KeycloakAuthAdapter(mockAuthStorage, authConfig);
      const token = "test-token";

      // Mock successful server response
      const mockResponse = {
        status: 200,
        data: {
          sub: "user123",
          name: "Test User",
        },
      };
      mockedAxios.get.mockResolvedValue(mockResponse);

      const result = await backendAdapter.validateToken(token);

      expect(result).toBe(true);
      // Verify server-side validation was used (axios called)
      expect(mockedAxios.get).toHaveBeenCalledWith(
        `${authConfig.fields.authority}/protocol/openid-connect/userinfo`,
        expect.any(Object),
      );
      // Verify client-side validation was NOT used
      expect(mockOIDCClient.getStoredAuth).not.toHaveBeenCalled();
    });

    it("should call validateTokenClient when appType is frontend", async () => {
      // Mock frontend environment - ensure window exists with localStorage
      (global as unknown as Record<string, unknown>).window = { localStorage: {} };

      const frontendAdapter = new KeycloakAuthAdapter(mockAuthStorage, authConfig);
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

  describe("getUserInfo", () => {
    it("should get user info with provided token", async () => {
      const token = "test-token";
      const mockUserInfo = {
        sub: "user123",
        name: "Test User",
        email: "test@example.com",
        preferred_username: "testuser",
      };

      mockedAxios.get.mockResolvedValue({
        status: 200,
        data: mockUserInfo,
      });

      const result = await adapter.getUserInfo(token);

      expect(result).toEqual(mockUserInfo);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        `${authConfig.fields.authority}/protocol/openid-connect/userinfo`,
        expect.objectContaining({
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          timeout: 5000,
        }),
      );
    });

    it("should get user info with stored token when no token provided", async () => {
      const storedToken = "stored-token";
      const mockUserInfo = {
        sub: "user123",
        name: "Test User",
        email: "test@example.com",
      };

      mockOIDCClient.getStoredAuth.mockResolvedValue({
        access_token: storedToken,
        expires_in: 3600,
      });

      mockedAxios.get.mockResolvedValue({
        status: 200,
        data: mockUserInfo,
      });

      const result = await adapter.getUserInfo();

      expect(result).toEqual(mockUserInfo);
      expect(mockOIDCClient.getStoredAuth).toHaveBeenCalled();
      expect(mockedAxios.get).toHaveBeenCalledWith(
        `${authConfig.fields.authority}/protocol/openid-connect/userinfo`,
        expect.objectContaining({
          headers: {
            Authorization: `Bearer ${storedToken}`,
            "Content-Type": "application/json",
          },
        }),
      );
    });

    it("should return null when no token is available", async () => {
      mockOIDCClient.getStoredAuth.mockResolvedValue(null);

      const result = await adapter.getUserInfo();

      expect(result).toBeNull();
      expect(mockOIDCClient.getStoredAuth).toHaveBeenCalled();
      expect(mockedAxios.get).not.toHaveBeenCalled();
    });

    it("should return null when API call fails", async () => {
      const token = "test-token";
      mockedAxios.get.mockRejectedValue(new Error("API Error"));

      const result = await adapter.getUserInfo(token);

      expect(result).toBeNull();
    });

    it("should handle timeout errors gracefully", async () => {
      const token = "test-token";
      mockedAxios.get.mockRejectedValue(new Error("timeout of 5000ms exceeded"));

      const consoleSpy = jest.spyOn(console, "error").mockImplementation();

      const result = await adapter.getUserInfo(token);

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith("Error getting user info:", expect.any(Error));

      consoleSpy.mockRestore();
    });
  });

  describe("createUser", () => {
    const mockUser = {
      email: "test@example.com",
      phoneNumber: "+1234567890",
    };

    beforeEach(() => {
      // Mock the makeAuthenticatedRequest method to properly call the callback with a token
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jest.spyOn(adapter as any, 'makeAuthenticatedRequest').mockImplementation(async (callback: any) => {
        return await callback('mock-admin-token');
      });
    });

    it("should create a new user successfully", async () => {
      const mockCreateResponse = {
        status: 201,
        data: {
          id: "keycloak-user-123",
          username: "test@example.com",
          email: "test@example.com",
          enabled: true,
        },
      };

      mockedAxios.post.mockResolvedValue(mockCreateResponse);

      // Mock resetPassword method
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jest.spyOn(adapter as any, 'resetPassword').mockResolvedValue(undefined);

      await adapter.createUser(mockUser);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        `${authConfig.fields.host}/admin/realms/${authConfig.fields.realm}/users`,
        expect.objectContaining({
          username: mockUser.email,
          email: mockUser.email,
          enabled: true,
          emailVerified: false,
          attributes: {
            phone_number: [mockUser.phoneNumber],
          },
          credentials: [{
            type: "password",
            value: expect.any(String),
            temporary: true,
          }],
        }),
        expect.objectContaining({
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer mock-admin-token",
          },
        }),
      );
    });

    it("should handle existing user (409 conflict)", async () => {
      const conflictError = {
        response: { status: 409 },
        isAxiosError: true,
      };

      mockedAxios.post.mockRejectedValue(conflictError);

      // Mock resetPassword method
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jest.spyOn(adapter as any, 'resetPassword').mockResolvedValue(undefined);
      jest.spyOn(axios, 'isAxiosError').mockReturnValue(true);

      await adapter.createUser(mockUser);

      expect(mockedAxios.post).toHaveBeenCalled();
      // Should continue and call resetPassword for existing user
    });

    it("should handle user creation without phone number", async () => {
      const userWithoutPhone = {
        email: "test@example.com",
        
      };

      const mockCreateResponse = {
        status: 201,
        data: {
          id: "keycloak-user-123",
          username: "test@example.com",
          email: "test@example.com",
        },
      };

      mockedAxios.post.mockResolvedValue(mockCreateResponse);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jest.spyOn(adapter as any, 'resetPassword').mockResolvedValue(undefined);

      await adapter.createUser(userWithoutPhone);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        `${authConfig.fields.host}/admin/realms/${authConfig.fields.realm}/users`,
        expect.objectContaining({
          username: userWithoutPhone.email,
          email: userWithoutPhone.email,
          enabled: true,
          emailVerified: false,
          credentials: [{
            type: "password",
            value: expect.any(String),
            temporary: true,
          }],
        }),
        expect.any(Object),
      );

      // Should not include phone_number in attributes
      const postCall = mockedAxios.post.mock.calls[0];
      expect(postCall[1]).not.toHaveProperty('attributes.phone_number');
    });

    it("should handle errors during user creation gracefully", async () => {
      const createError = new Error("Creation failed");
      mockedAxios.post.mockRejectedValue(createError);

      const consoleSpy = jest.spyOn(console, "log").mockImplementation();

      await adapter.createUser(mockUser);

      expect(consoleSpy).toHaveBeenCalledWith("Error creating user test@example.com", createError);

      consoleSpy.mockRestore();
    });

    it("should send password reset after successful user creation", async () => {
      const mockCreateResponse = {
        status: 201,
        data: {
          id: "keycloak-user-123",
          username: "test@example.com",
          email: "test@example.com",
        },
      };

      mockedAxios.post.mockResolvedValue(mockCreateResponse);

      // Mock resetPassword method
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const resetPasswordSpy = jest.spyOn(adapter as any, 'resetPassword').mockResolvedValue(undefined);

      await adapter.createUser(mockUser);

      expect(resetPasswordSpy).toHaveBeenCalledWith(mockUser.email);
    });
  });

  describe("resetPassword", () => {
    const testEmail = "test@example.com";
    const mockUser = {
      id: "keycloak-user-123",
      username: "test@example.com",
      email: "test@example.com",
    };

    beforeEach(() => {
      // Mock the makeAuthenticatedRequest method
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jest.spyOn(adapter as any, 'makeAuthenticatedRequest').mockImplementation(async (callback: any) => {
        return await callback('mock-admin-token');
      });

      // Mock getUserByEmail method
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jest.spyOn(adapter as any, 'getUserByEmail').mockResolvedValue(mockUser);
    });

    it("should send password reset request successfully", async () => {
      mockedAxios.put.mockResolvedValue({ status: 200 });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (adapter as any).resetPassword(testEmail);

      expect(mockedAxios.put).toHaveBeenCalledWith(
        `${authConfig.fields.host}/admin/realms/${authConfig.fields.realm}/users/${mockUser.id}/execute-actions-email?client_id=${authConfig.fields.client_id}`,
        ["UPDATE_PASSWORD"],
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer mock-admin-token",
          },
        },
      );
    });

    it("should handle password reset API errors", async () => {
      const resetError = new Error("Password reset failed");
      mockedAxios.put.mockRejectedValue(resetError);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await expect((adapter as any).resetPassword(testEmail)).rejects.toThrow("Password reset failed");
    });

    it("should use correct Keycloak password reset endpoint", async () => {
      mockedAxios.put.mockResolvedValue({ status: 200 });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (adapter as any).resetPassword(testEmail);

      expect(mockedAxios.put).toHaveBeenCalledWith(
        expect.stringContaining("/execute-actions-email"),
        expect.any(Object),
        expect.any(Object),
      );
    });

    it("should include required fields in password reset request", async () => {
      mockedAxios.put.mockResolvedValue({ status: 200 });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (adapter as any).resetPassword(testEmail);

      expect(mockedAxios.put).toHaveBeenCalledWith(
        expect.stringContaining(`client_id=${authConfig.fields.client_id}`),
        ["UPDATE_PASSWORD"],
        expect.any(Object),
      );
    });

    it("should use authenticated request for password reset", async () => {
      mockedAxios.put.mockResolvedValue({ status: 200 });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const makeAuthenticatedRequestSpy = jest.spyOn(adapter as any, 'makeAuthenticatedRequest');

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (adapter as any).resetPassword(testEmail);

      expect(makeAuthenticatedRequestSpy).toHaveBeenCalled();
    });

    it("should get user by email before resetting password", async () => {
      mockedAxios.put.mockResolvedValue({ status: 200 });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const getUserByEmailSpy = jest.spyOn(adapter as any, 'getUserByEmail');

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (adapter as any).resetPassword(testEmail);

      expect(getUserByEmailSpy).toHaveBeenCalledWith(testEmail);
    });

    it("should handle getUserByEmail errors", async () => {
      const getUserError = new Error("User not found");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jest.spyOn(adapter as any, 'getUserByEmail').mockRejectedValue(getUserError);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await expect((adapter as any).resetPassword(testEmail)).rejects.toThrow("User not found");
    });
  });

  describe("getUserByEmail", () => {
    const testEmail = "test@example.com";
    const mockUser = {
      id: "keycloak-user-123",
      username: "test@example.com",
      email: "test@example.com",
    };

    beforeEach(() => {
      // Mock the makeAuthenticatedRequest method
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jest.spyOn(adapter as any, 'makeAuthenticatedRequest').mockImplementation(async (callback: any) => {
        return await callback('mock-admin-token');
      });
    });

    it("should get user by email successfully", async () => {
      mockedAxios.get.mockResolvedValue({ data: [mockUser] });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (adapter as any).getUserByEmail(testEmail);

      expect(result).toEqual(mockUser);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        `${authConfig.fields.host}/admin/realms/${authConfig.fields.realm}/users?email=${testEmail}&exact=true`,
        {
          headers: {
            Authorization: "Bearer mock-admin-token",
          },
        },
      );
    });

    it("should handle API errors when getting user by email", async () => {
      const apiError = new Error("API Error");
      mockedAxios.get.mockRejectedValue(apiError);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await expect((adapter as any).getUserByEmail(testEmail)).rejects.toThrow("API Error");
    });

    it("should use authenticated request for getting user by email", async () => {
      mockedAxios.get.mockResolvedValue({ data: [mockUser] });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const makeAuthenticatedRequestSpy = jest.spyOn(adapter as any, 'makeAuthenticatedRequest');

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (adapter as any).getUserByEmail(testEmail);

      expect(makeAuthenticatedRequestSpy).toHaveBeenCalled();
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

  describe("Management API Authentication", () => {
    it("should authenticate with Management API using client_id and client_secret", async () => {
      const mockTokenResponse = {
        data: {
          access_token: "admin-api-token",
          token_type: "Bearer",
          expires_in: 3600,
        },
      };

      mockedAxios.post.mockResolvedValue(mockTokenResponse);

      // Call authenticateAPIUser method directly
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (adapter as any).authenticateAPIUser();

      expect(mockedAxios.post).toHaveBeenCalledWith(
        `${authConfig.fields.host}/realms/${authConfig.fields.realm}/protocol/openid-connect/token`,
        expect.any(URLSearchParams),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        },
      );

      // Verify the URLSearchParams contains the correct data
      const postCall = mockedAxios.post.mock.calls[0];
      const formData = postCall[1] as URLSearchParams;
      expect(formData.get('grant_type')).toBe('client_credentials');
      expect(formData.get('client_id')).toBe(authConfig.fields.api_client_id);
      expect(formData.get('client_secret')).toBe(authConfig.fields.api_client_secret);

      expect(result).toEqual(mockTokenResponse.data);
    });

    it("should throw error when Management API credentials are missing", async () => {
      const configWithoutCredentials: AuthConfig = {
        ...authConfig,
        fields: {
          ...authConfig.fields,
        },
      };
      delete configWithoutCredentials.fields.api_client_id;
      delete configWithoutCredentials.fields.api_client_secret;

      const adapterWithoutCredentials = new KeycloakAuthAdapter(mockAuthStorage, configWithoutCredentials);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await expect((adapterWithoutCredentials as any).authenticateAPIUser()).rejects.toThrow(
        "API client id, and secret are required"
      );
    });

    it("should handle authentication API errors", async () => {
      const authError = new Error("Authentication failed");
      mockedAxios.post.mockRejectedValue(authError);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await expect((adapter as any).authenticateAPIUser()).rejects.toThrow("Authentication failed");
    });
  });

  describe("transformConfig", () => {
    it("should remove sensitive api_client_id and api_client_secret fields", () => {
      const configWithSensitiveFields: AuthConfig = {
        type: "keycloak",
        fields: {
          authority: "https://keycloak.example.com/auth/realms/test",
          client_id: "test-client",
          client_secret: "test-client-secret",
          api_client_id: "sensitive-api-client-id",
          api_client_secret: "sensitive-api-client-secret",
          redirect_uri: "http://localhost:3000/callback",
          scope: "openid profile email",
          custom_field: "custom_value",
          host: "https://keycloak.example.com",
          realm: "test",
        },
      };

      new KeycloakAuthAdapter(mockAuthStorage, configWithSensitiveFields);

      // Check that OIDC client was created without sensitive fields
      expect(MockedOIDCClient).toHaveBeenCalledWith(
        expect.objectContaining({
          authority: "https://keycloak.example.com/auth/realms/test",
          client_id: "test-client",
          redirect_uri: "http://localhost:3000/callback",
          scope: "openid profile email",
          extraQueryParams: {
            custom_field: "custom_value",
            host: "https://keycloak.example.com",
            realm: "test",
          },
        }),
      );

      // Verify sensitive fields are not in extraQueryParams
      const oidcConfig = MockedOIDCClient.mock.calls[0][0] as OIDCConfig;
      expect(oidcConfig.extraQueryParams).not.toHaveProperty('api_client_id');
      expect(oidcConfig.extraQueryParams).not.toHaveProperty('api_client_secret');
    });

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
        }),
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
        }),
      );
    });

    it("should not include standard fields in extraQueryParams", () => {
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
        type: "keycloak",
        fields: Object.fromEntries(standardFields.map((field) => [field, `${field}-value`])),
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
          host: "https://keycloak.example.com",
          realm: "test",
        },
      };

      new KeycloakAuthAdapter(mockAuthStorage, configWithPostLogout);

      const call = MockedOIDCClient.mock.calls[0][0] as OIDCConfig;
      expect(call.extraQueryParams).toEqual({
        post_logout_redirect_uri: "http://localhost:3000",
        host: "https://keycloak.example.com",
        realm: "test",
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
      const consoleSpy = jest.spyOn(console, "error").mockImplementation();

      const result = await backendAdapter.validateToken(token);

      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith("Error checking Keycloak token activity:", timeoutError);

      consoleSpy.mockRestore();
    });

    it("should handle network errors in token validation", async () => {
      // Ensure backend environment - window is undefined
      (global as unknown as Record<string, unknown>).window = undefined;

      const backendAdapter = new KeycloakAuthAdapter(mockAuthStorage, authConfig);
      const token = "test-token";
      const networkError = new Error("Network Error");

      mockedAxios.get.mockRejectedValue(networkError);
      const consoleSpy = jest.spyOn(console, "error").mockImplementation();

      const result = await backendAdapter.validateToken(token);

      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith("Error checking Keycloak token activity:", networkError);

      consoleSpy.mockRestore();
    });

    it("should log token validation success", async () => {
      (global as unknown as Record<string, unknown>).window = undefined;

      const backendAdapter = new KeycloakAuthAdapter(mockAuthStorage, authConfig);
      const token = "test-token";
      const mockResponse = {
        status: 200,
        data: {
          sub: "user123",
          name: "Test User",
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

      const backendAdapter = new KeycloakAuthAdapter(mockAuthStorage, authConfig);
      const token = "test-token";

      // Mock successful server response
      const mockResponse = {
        status: 200,
        data: {
          sub: "user123",
          name: "Test User",
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

      const frontendAdapter = new KeycloakAuthAdapter(mockAuthStorage, authConfig);
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

      const backendAdapter = new KeycloakAuthAdapter(mockAuthStorage, authConfig);
      const token = "test-token";

      // Mock successful server response
      const mockResponse = {
        status: 200,
        data: {
          sub: "user123",
          name: "Test User",
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
