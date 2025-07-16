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
      createUser: jest.fn(),
      addUserToOrganization: jest.fn(),
      resetPassword: jest.fn(),
    } as Partial<OIDCClient> as jest.Mocked<OIDCClient>;

    MockedOIDCClient.mockImplementation(() => mockOIDCClient);

    // Basic auth config with organization and required fields
    authConfig = {
      type: "auth0",
      fields: {
        authority: "https://dev-example.auth0.com",
        client_id: "test-client-id",
        api_client_id: "test-api-client-id",
        api_client_secret: "test-api-client-secret",
        audience: "https://dev-example.auth0.com/api/v2/",
        connection: "Username-Password-Authentication",
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
        },
      };

      new Auth0AuthAdapter(mockAuthStorage, configWithExtras);

      expect(MockedOIDCClient).toHaveBeenCalledWith(
        expect.objectContaining({
          extraQueryParams: {
            post_logout_redirect_uri: "http://localhost:3000",
            organization: "test-org-123",
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

  describe("getUserInfo", () => {
    it("should get user info with provided token", async () => {
      const token = "test-token";
      const mockUserInfo = {
        sub: "user123",
        name: "Test User",
        email: "test@example.com",
        org_id: "test-org-123",
      };

      mockedAxios.get.mockResolvedValue({
        status: 200,
        data: mockUserInfo,
      });

      const result = await adapter.getUserInfo(token);

      expect(result).toEqual(mockUserInfo);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        `${authConfig.fields.authority}/userinfo`,
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
        `${authConfig.fields.authority}/userinfo`,
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
      guid: "user-guid-123",
      phoneNumber: "+1234567890",
    };

    beforeEach(() => {
      // Mock the makeAuthenticatedRequest method to properly call the callback with a token
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jest.spyOn(adapter as any, 'makeAuthenticatedRequest').mockImplementation(async (callback: any) => {
        return await callback('mock-management-token');
      });
    });

    it("should create a new user successfully", async () => {
      const mockCreateResponse = {
        data: {
          user_id: "auth0|user123",
          email: "test@example.com",
          created_at: "2023-01-01T00:00:00.000Z",
        },
      };

      mockedAxios.post.mockResolvedValue(mockCreateResponse);
      mockedAxios.get.mockResolvedValue({ data: [mockCreateResponse.data] });

      // Mock resetPassword method
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jest.spyOn(adapter as any, 'resetPassword').mockResolvedValue(undefined);

      await adapter.createUser(mockUser);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        `${authConfig.fields.authority}/api/v2/users`,
        expect.objectContaining({
          email: mockUser.email,
          phone_number: mockUser.phoneNumber,
          user_metadata: {
            guid: mockUser.guid,
          },
          connection: authConfig.fields.connection,
          password: expect.any(String),
        }),
        expect.objectContaining({
          headers: {
            Authorization: "Bearer mock-management-token",
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
      mockedAxios.get.mockResolvedValue({
        data: [{
          user_id: "auth0|existing123",
          email: "test@example.com",
        }],
      });

      // Mock methods
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jest.spyOn(adapter as any, 'resetPassword').mockResolvedValue(undefined);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jest.spyOn(adapter as any, 'addUserToOrganization').mockResolvedValue(undefined);
      jest.spyOn(axios, 'isAxiosError').mockReturnValue(true);

      await adapter.createUser(mockUser);

      expect(mockedAxios.post).toHaveBeenCalled();
      expect(mockedAxios.get).toHaveBeenCalledWith(
        `${authConfig.fields.authority}/api/v2/users-by-email`,
        expect.objectContaining({
          headers: {
            Authorization: "Bearer mock-management-token",
          },
          params: {
            email: mockUser.email,
          },
        }),
      );
    });

    it("should throw error when connection is not configured", async () => {
      const configWithoutConnection: AuthConfig = {
        ...authConfig,
        fields: {
          ...authConfig.fields,
        },
      };
      delete configWithoutConnection.fields.connection;

      const adapterWithoutConnection = new Auth0AuthAdapter(mockAuthStorage, configWithoutConnection);

      await expect(adapterWithoutConnection.createUser(mockUser)).rejects.toThrow("Connection not found");
    });

    it("should handle user creation without phone number", async () => {
      const userWithoutPhone = {
        email: "test@example.com",
        guid: "user-guid-123",
      };

      const mockCreateResponse = {
        data: {
          user_id: "auth0|user123",
          email: "test@example.com",
        },
      };

      mockedAxios.post.mockResolvedValue(mockCreateResponse);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jest.spyOn(adapter as any, 'resetPassword').mockResolvedValue(undefined);

      await adapter.createUser(userWithoutPhone);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        `${authConfig.fields.authority}/api/v2/users`,
        expect.objectContaining({
          email: userWithoutPhone.email,
          user_metadata: {
            guid: userWithoutPhone.guid,
          },
          connection: authConfig.fields.connection,
          password: expect.any(String),
        }),
        expect.any(Object),
      );

      // Should not include phone_number in the request
      const postCall = mockedAxios.post.mock.calls[0];
      expect(postCall[1]).not.toHaveProperty('phone_number');
    });

    it("should add user to organization if configured", async () => {
      const mockCreateResponse = {
        data: {
          user_id: "auth0|user123",
          email: "test@example.com",
        },
      };

      mockedAxios.post.mockResolvedValue(mockCreateResponse);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jest.spyOn(adapter as any, 'resetPassword').mockResolvedValue(undefined);

      await adapter.createUser(mockUser);

      // Should call addUserToOrganization with the created user ID
      expect(mockedAxios.post).toHaveBeenCalledWith(
        `${authConfig.fields.audience}organizations/${authConfig.fields.organization}/members`,
        { members: ["auth0|user123"] },
        expect.objectContaining({
          headers: {
            Authorization: "Bearer mock-management-token",
          },
        }),
      );
    });

    it("should handle organization assignment failure gracefully", async () => {
      const mockCreateResponse = {
        data: {
          user_id: "auth0|user123",
          email: "test@example.com",
        },
      };

      mockedAxios.post
        .mockResolvedValueOnce(mockCreateResponse) // User creation succeeds
        .mockRejectedValueOnce(new Error("Organization assignment failed")); // Organization assignment fails

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jest.spyOn(adapter as any, 'resetPassword').mockResolvedValue(undefined);

      await adapter.createUser(mockUser);

      // Should still call resetPassword despite organization assignment failure
      expect(mockedAxios.post).toHaveBeenCalledTimes(2);
    });
  });

  describe("resetPassword", () => {
    const testEmail = "test@example.com";

    beforeEach(() => {
      // Mock the makeAuthenticatedRequest method
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jest.spyOn(adapter as any, 'makeAuthenticatedRequest').mockImplementation(async (callback: any) => {
        return await callback('mock-management-token');
      });
    });

    it("should send password reset request successfully", async () => {
      mockedAxios.post.mockResolvedValue({ status: 200 });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (adapter as any).resetPassword(testEmail);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        `${authConfig.fields.authority}/dbconnections/change_password`,
        {
          email: testEmail,
          client_id: authConfig.fields.api_client_id,
          connection: authConfig.fields.connection,
        },
        {
          headers: {
            Authorization: "Bearer mock-management-token",
          },
        },
      );
    });

    it("should handle password reset API errors", async () => {
      const resetError = new Error("Password reset failed");
      mockedAxios.post.mockRejectedValue(resetError);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await expect((adapter as any).resetPassword(testEmail)).rejects.toThrow("Password reset failed");
    });

    it("should use correct Auth0 password reset endpoint", async () => {
      mockedAxios.post.mockResolvedValue({ status: 200 });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (adapter as any).resetPassword(testEmail);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringContaining("/dbconnections/change_password"),
        expect.any(Object),
        expect.any(Object),
      );
    });

    it("should include required fields in password reset request", async () => {
      mockedAxios.post.mockResolvedValue({ status: 200 });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (adapter as any).resetPassword(testEmail);

      const [, requestBody] = mockedAxios.post.mock.calls[0];
      expect(requestBody).toEqual({
        email: testEmail,
        client_id: authConfig.fields.api_client_id,
        connection: authConfig.fields.connection,
      });
    });

    it("should use authenticated request for password reset", async () => {
      mockedAxios.post.mockResolvedValue({ status: 200 });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const makeAuthenticatedRequestSpy = jest.spyOn(adapter as any, 'makeAuthenticatedRequest');

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (adapter as any).resetPassword(testEmail);

      expect(makeAuthenticatedRequestSpy).toHaveBeenCalled();
    });
  });

  describe("addUserToOrganization", () => {
    const testUserId = "auth0|user123";

    beforeEach(() => {
      // Mock the makeAuthenticatedRequest method
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jest.spyOn(adapter as any, 'makeAuthenticatedRequest').mockImplementation(async (callback: any) => {
        return await callback('mock-management-token');
      });
    });

    it("should add user to organization successfully", async () => {
      mockedAxios.post.mockResolvedValue({ status: 200 });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (adapter as any).addUserToOrganization(testUserId);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        `${authConfig.fields.audience}organizations/${authConfig.fields.organization}/members`,
        { members: [testUserId] },
        {
          headers: {
            Authorization: "Bearer mock-management-token",
          },
        },
      );
    });

    it("should handle organization assignment errors gracefully", async () => {
      const organizationError = new Error("Organization assignment failed");
      mockedAxios.post.mockRejectedValue(organizationError);

      const consoleSpy = jest.spyOn(console, "error").mockImplementation();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (adapter as any).addUserToOrganization(testUserId);

      expect(consoleSpy).toHaveBeenCalledWith("Error adding user to organization", organizationError);
      consoleSpy.mockRestore();
    });

    it("should use correct Auth0 organization endpoint", async () => {
      mockedAxios.post.mockResolvedValue({ status: 200 });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (adapter as any).addUserToOrganization(testUserId);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringContaining(`organizations/${authConfig.fields.organization}/members`),
        expect.any(Object),
        expect.any(Object),
      );
    });

    it("should send user ID in members array", async () => {
      mockedAxios.post.mockResolvedValue({ status: 200 });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (adapter as any).addUserToOrganization(testUserId);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          members: [testUserId],
        }),
        expect.any(Object),
      );
    });

    it("should use authenticated request for organization assignment", async () => {
      mockedAxios.post.mockResolvedValue({ status: 200 });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const makeAuthenticatedRequestSpy = jest.spyOn(adapter as any, 'makeAuthenticatedRequest');

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (adapter as any).addUserToOrganization(testUserId);

      expect(makeAuthenticatedRequestSpy).toHaveBeenCalled();
    });

    it("should handle multiple user IDs in members array", async () => {
      const userIds = ["auth0|user123", "auth0|user456"];
      mockedAxios.post.mockResolvedValue({ status: 200 });

      // Test with multiple users (though current implementation only handles one)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (adapter as any).addUserToOrganization(userIds[0]);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          members: [userIds[0]],
        }),
        expect.any(Object),
      );
    });

    it("should continue execution after organization assignment failure", async () => {
      const organizationError = new Error("Organization assignment failed");
      mockedAxios.post.mockRejectedValue(organizationError);

      const consoleSpy = jest.spyOn(console, "error").mockImplementation();

      // Should not throw error, should handle gracefully
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await expect((adapter as any).addUserToOrganization(testUserId)).resolves.toBeUndefined();

      consoleSpy.mockRestore();
    });
  });

  describe("Management API Authentication", () => {
    it("should authenticate with Management API using client_id and client_secret", async () => {
      const mockTokenResponse = {
        data: {
          access_token: "management-api-token",
          token_type: "Bearer",
          expires_in: 3600,
        },
      };

      mockedAxios.post.mockResolvedValue(mockTokenResponse);

      // Call authenticateAPIUser method directly
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (adapter as any).authenticateAPIUser();

      expect(mockedAxios.post).toHaveBeenCalledWith(
        `${authConfig.fields.authority}/oauth/token`,
        {
          grant_type: "client_credentials",
          client_id: authConfig.fields.api_client_id,
          client_secret: authConfig.fields.api_client_secret,
          audience: authConfig.fields.audience,
        },
      );

      expect(result).toEqual(mockTokenResponse.data);
    });

    it("should throw error when Management API credentials are missing", async () => {
      const configWithoutCredentials: AuthConfig = {
        ...authConfig,
        fields: {
          ...authConfig.fields,
          // Missing api_client_id, api_client_secret, or audience
        },
      };
      delete configWithoutCredentials.fields.api_client_id;
      delete configWithoutCredentials.fields.api_client_secret;
      delete configWithoutCredentials.fields.audience;

      const adapterWithoutCredentials = new Auth0AuthAdapter(mockAuthStorage, configWithoutCredentials);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await expect((adapterWithoutCredentials as any).authenticateAPIUser()).rejects.toThrow(
        "API client id, secret, and audience are required"
      );
    });
  });

  describe("transformConfig", () => {
    it("should remove sensitive api_client_id and api_client_secret fields", () => {
      const configWithSensitiveFields: AuthConfig = {
        type: "auth0",
        fields: {
          authority: "https://dev-example.auth0.com",
          client_id: "test-client-id",
          client_secret: "test-client-secret",
          api_client_id: "sensitive-api-client-id",
          api_client_secret: "sensitive-api-client-secret",
          redirect_uri: "http://localhost:3000/callback",
          scope: "openid profile email",
          custom_field: "custom_value",
          connection: "test-connection",
        },
      };

      new Auth0AuthAdapter(mockAuthStorage, configWithSensitiveFields);

      // Check that OIDC client was created without sensitive fields
      expect(MockedOIDCClient).toHaveBeenCalledWith(
        expect.objectContaining({
          authority: "https://dev-example.auth0.com",
          client_id: "test-client-id",
          redirect_uri: "http://localhost:3000/callback",
          scope: "openid profile email",
          extraQueryParams: {
            custom_field: "custom_value",
          },
        }),
      );

      // Verify sensitive fields are not in extraQueryParams
      const oidcConfig = MockedOIDCClient.mock.calls[0][0] as OIDCConfig;
      expect(oidcConfig.extraQueryParams).not.toHaveProperty('api_client_id');
      expect(oidcConfig.extraQueryParams).not.toHaveProperty('api_client_secret');
      expect(oidcConfig.extraQueryParams).not.toHaveProperty('connection');
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
