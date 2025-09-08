import "dotenv/config";

import { v4 as uuidv4 } from "uuid";
import { registerSelfServiceUsers } from "../registerUsers";
import { SelfServiceUserStore, AppInstanceStore, AppInstance, SelfServiceUser } from "../../types";
import { EntityDataManager } from "idpass-data-collect";

describe("registerSelfServiceUsers", () => {
  let mockGetAvailableAuthProviders: jest.MockedFunction<() => Promise<string[]>>;
  let mockCreateUser: jest.MockedFunction<(provider: string, userData: unknown) => Promise<void>>;
  let mockEntityDataManager: EntityDataManager;

  // Mock stores
  let mockSelfServiceUserStore: jest.Mocked<SelfServiceUserStore>;
  let mockAppInstanceStore: jest.Mocked<AppInstanceStore>;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create fresh mock functions for each test
    mockGetAvailableAuthProviders = jest.fn();
    mockCreateUser = jest.fn();

    mockEntityDataManager = {
      getAvailableAuthProviders: mockGetAvailableAuthProviders,
      createUser: mockCreateUser,
    } as unknown as EntityDataManager;

    // Create fresh mock stores for each test
    mockSelfServiceUserStore = {
      initialize: jest.fn(),
      createUser: jest.fn(),
      saveUsers: jest.fn(),
      updateUser: jest.fn(),
      batchUpdateUsers: jest.fn(),
      getUser: jest.fn(),
      getIncompleteRegistrationUsers: jest.fn(),
      addRegisteredAuthProviders: jest.fn(),
      removeRegisteredAuthProviders: jest.fn(),
      deleteUser: jest.fn(),
      clearStore: jest.fn(),
      closeConnection: jest.fn(),
    } as jest.Mocked<SelfServiceUserStore>;

    mockAppInstanceStore = {
      initialize: jest.fn(),
      createAppInstance: jest.fn(),
      updateAppInstance: jest.fn(),
      loadEntityData: jest.fn(),
      getAppInstance: jest.fn(),
      clearAppInstance: jest.fn(),
      clearStore: jest.fn(),
      closeConnection: jest.fn(),
    } as jest.Mocked<AppInstanceStore>;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("when no incomplete registration users exist", () => {
    it("should return early without processing", async () => {
      mockSelfServiceUserStore.getIncompleteRegistrationUsers.mockResolvedValue([]);

      await registerSelfServiceUsers(mockSelfServiceUserStore, mockAppInstanceStore);

      expect(mockSelfServiceUserStore.getIncompleteRegistrationUsers).toHaveBeenCalledTimes(1);
      expect(mockAppInstanceStore.getAppInstance).not.toHaveBeenCalled();
      expect(mockGetAvailableAuthProviders).not.toHaveBeenCalled();
      expect(mockSelfServiceUserStore.batchUpdateUsers).not.toHaveBeenCalled();
    });
  });

  describe("when incomplete registration users exist", () => {
    const mockUsers: SelfServiceUser[] = [
      {
        id: 1,
        guid: uuidv4(),
        email: "user1@example.com",
        phone: "+1234567890",
        configId: "test-config",
        completeRegistration: false,
        registeredAuthProviders: [],
      },
      {
        id: 2,
        guid: uuidv4(),
        email: "user2@example.com",
        phone: "+0987654321",
        configId: "test-config",
        completeRegistration: false,
        registeredAuthProviders: ["auth0"],
      },
    ];

    beforeEach(() => {
      mockSelfServiceUserStore.getIncompleteRegistrationUsers.mockResolvedValue(mockUsers);
      mockAppInstanceStore.getAppInstance.mockResolvedValue({
        configId: "test-config",
        edm: mockEntityDataManager,
      });
      mockGetAvailableAuthProviders.mockResolvedValue(["auth0", "keycloak"]);
    });

    it("should register users for all available auth providers with caching", async () => {
      mockCreateUser.mockResolvedValue(undefined);

      await registerSelfServiceUsers(mockSelfServiceUserStore, mockAppInstanceStore);

      // Should only call getAppInstance once due to caching
      expect(mockAppInstanceStore.getAppInstance).toHaveBeenCalledTimes(1);
      expect(mockAppInstanceStore.getAppInstance).toHaveBeenCalledWith("test-config");
      expect(mockGetAvailableAuthProviders).toHaveBeenCalledTimes(1);
      expect(mockCreateUser).toHaveBeenCalledTimes(3); // 2 users × 2 providers - 1 (auth0 already registered for user2)

      // Verify createUser calls for each user and provider
      expect(mockCreateUser).toHaveBeenCalledWith("auth0", {
        email: "user1@example.com",
        phoneNumber: "+1234567890",
      });
      expect(mockCreateUser).toHaveBeenCalledWith("keycloak", {
        email: "user1@example.com",
        phoneNumber: "+1234567890",
      });
      expect(mockCreateUser).toHaveBeenCalledWith("keycloak", {
        email: "user2@example.com",
        phoneNumber: "+0987654321",
      });
      // Note: auth0 is not called for user2 because it's already registered

      // Verify batch update is called once with all users
      expect(mockSelfServiceUserStore.batchUpdateUsers).toHaveBeenCalledTimes(1);
      expect(mockSelfServiceUserStore.batchUpdateUsers).toHaveBeenCalledWith([
        {
          ...mockUsers[0],
          completeRegistration: true,
          registeredAuthProviders: ["auth0", "keycloak"],
        },
        {
          ...mockUsers[1],
          completeRegistration: true,
          registeredAuthProviders: ["auth0", "keycloak"],
        },
      ]);
    });

    it("should handle users with different configIds and cache app instances", async () => {
      const usersWithDifferentConfigs: SelfServiceUser[] = [
        {
          id: 1,
          guid: uuidv4(),
          email: "user1@example.com",
          phone: "+1234567890",
          configId: "config-1",
          completeRegistration: false,
          registeredAuthProviders: [],
        },
        {
          id: 2,
          guid: uuidv4(),
          email: "user2@example.com",
          phone: "+0987654321",
          configId: "config-2",
          completeRegistration: false,
          registeredAuthProviders: [],
        },
        {
          id: 3,
          guid: uuidv4(),
          email: "user3@example.com",
          phone: "+1122334455",
          configId: "config-1", // Same config as user1
          completeRegistration: false,
          registeredAuthProviders: [],
        },
      ];

      const mockAppInstance1: AppInstance = {
        configId: "config-1",
        edm: mockEntityDataManager,
      };
      const mockAppInstance2: AppInstance = {
        configId: "config-2",
        edm: mockEntityDataManager,
      };

      mockSelfServiceUserStore.getIncompleteRegistrationUsers.mockResolvedValue(usersWithDifferentConfigs);
      mockAppInstanceStore.getAppInstance
        .mockResolvedValueOnce(mockAppInstance1)
        .mockResolvedValueOnce(mockAppInstance2);

      await registerSelfServiceUsers(mockSelfServiceUserStore, mockAppInstanceStore);

      // Should only call getAppInstance twice (once per unique configId)
      expect(mockAppInstanceStore.getAppInstance).toHaveBeenCalledTimes(2);
      expect(mockAppInstanceStore.getAppInstance).toHaveBeenCalledWith("config-1");
      expect(mockAppInstanceStore.getAppInstance).toHaveBeenCalledWith("config-2");

      // Should call batchUpdateUsers once with all users
      expect(mockSelfServiceUserStore.batchUpdateUsers).toHaveBeenCalledTimes(1);

      // All users should be updated in a single batch call
      expect(mockSelfServiceUserStore.batchUpdateUsers).toHaveBeenCalledWith([
        {
          ...usersWithDifferentConfigs[0], // user1 (config-1)
          completeRegistration: true,
          registeredAuthProviders: ["auth0", "keycloak"],
        },
        {
          ...usersWithDifferentConfigs[2], // user3 (config-1) - processed second in config-1 group
          completeRegistration: true,
          registeredAuthProviders: ["auth0", "keycloak"],
        },
        {
          ...usersWithDifferentConfigs[1], // user2 (config-2) - processed in config-2 group
          completeRegistration: true,
          registeredAuthProviders: ["auth0", "keycloak"],
        },
      ]);
    });

    it("should handle errors during user creation and mark registration as incomplete", async () => {
      mockCreateUser
        .mockRejectedValueOnce(new Error("Auth provider error")) // auth0 for user1
        .mockResolvedValueOnce(undefined) // keycloak for user1
        .mockRejectedValueOnce(new Error("Auth provider error")); // keycloak for user2

      await registerSelfServiceUsers(mockSelfServiceUserStore, mockAppInstanceStore);

      // Verify that createUser was called for all attempts
      expect(mockCreateUser).toHaveBeenCalledTimes(3);

      // Verify batch update with mixed results
      expect(mockSelfServiceUserStore.batchUpdateUsers).toHaveBeenCalledTimes(1);
      expect(mockSelfServiceUserStore.batchUpdateUsers).toHaveBeenCalledWith([
        {
          ...mockUsers[0],
          completeRegistration: false, // Should be false due to error
          registeredAuthProviders: ["keycloak"], // Should only have successful registrations
        },
        {
          ...mockUsers[1],
          completeRegistration: false, // Should be false due to error
          registeredAuthProviders: ["auth0"], // Should preserve existing providers
        },
      ]);
    });

    it("should handle missing app instance gracefully and continue processing other configIds", async () => {
      const usersWithMissingConfig: SelfServiceUser[] = [
        {
          id: 1,
          guid: uuidv4(),
          email: "user1@example.com",
          phone: "+1234567890",
          configId: "missing-config",
          completeRegistration: false,
          registeredAuthProviders: [],
        },
        {
          id: 2,
          guid: uuidv4(),
          email: "user2@example.com",
          phone: "+0987654321",
          configId: "valid-config",
          completeRegistration: false,
          registeredAuthProviders: [],
        },
      ];

      mockSelfServiceUserStore.getIncompleteRegistrationUsers.mockResolvedValue(usersWithMissingConfig);
      mockAppInstanceStore.getAppInstance
        .mockResolvedValueOnce(null) // missing-config returns null
        .mockResolvedValueOnce({
          // valid-config returns valid instance
          configId: "valid-config",
          edm: mockEntityDataManager,
        });

      await registerSelfServiceUsers(mockSelfServiceUserStore, mockAppInstanceStore);

      expect(mockGetAvailableAuthProviders).toHaveBeenCalledTimes(1); // Only called for valid-config
      expect(mockCreateUser).toHaveBeenCalledTimes(2); // Only called for user2 (valid-config)
      expect(mockSelfServiceUserStore.batchUpdateUsers).toHaveBeenCalledTimes(1);
      expect(mockSelfServiceUserStore.batchUpdateUsers).toHaveBeenCalledWith([
        {
          ...usersWithMissingConfig[1],
          completeRegistration: true,
          registeredAuthProviders: ["auth0", "keycloak"],
        },
      ]);
    });

    it("should handle errors when getting app instance and continue processing other configIds", async () => {
      const usersWithErrorConfig: SelfServiceUser[] = [
        {
          id: 1,
          guid: uuidv4(),
          email: "user1@example.com",
          phone: "+1234567890",
          configId: "error-config",
          completeRegistration: false,
          registeredAuthProviders: [],
        },
        {
          id: 2,
          guid: uuidv4(),
          email: "user2@example.com",
          phone: "+0987654321",
          configId: "valid-config",
          completeRegistration: false,
          registeredAuthProviders: [],
        },
      ];

      mockSelfServiceUserStore.getIncompleteRegistrationUsers.mockResolvedValue(usersWithErrorConfig);
      mockAppInstanceStore.getAppInstance
        .mockRejectedValueOnce(new Error("Database error")) // error-config throws error
        .mockResolvedValueOnce({
          // valid-config returns valid instance
          configId: "valid-config",
          edm: mockEntityDataManager,
        });

      await registerSelfServiceUsers(mockSelfServiceUserStore, mockAppInstanceStore);

      expect(mockGetAvailableAuthProviders).toHaveBeenCalledTimes(1); // Only called for valid-config
      expect(mockCreateUser).toHaveBeenCalledTimes(2); // Only called for user2 (valid-config)
      expect(mockSelfServiceUserStore.batchUpdateUsers).toHaveBeenCalledTimes(1);
      expect(mockSelfServiceUserStore.batchUpdateUsers).toHaveBeenCalledWith([
        {
          ...usersWithErrorConfig[1],
          completeRegistration: true,
          registeredAuthProviders: ["auth0", "keycloak"],
        },
      ]);
    });

    it("should handle users without phone numbers", async () => {
      const usersWithoutPhone: SelfServiceUser[] = [
        {
          id: 1,
          guid: uuidv4(),
          email: "user1@example.com",
          configId: "test-config",
          completeRegistration: false,
          registeredAuthProviders: [],
        },
      ];

      mockSelfServiceUserStore.getIncompleteRegistrationUsers.mockResolvedValue(usersWithoutPhone);
      mockCreateUser.mockResolvedValue(undefined);

      await registerSelfServiceUsers(mockSelfServiceUserStore, mockAppInstanceStore);

      expect(mockCreateUser).toHaveBeenCalledWith("auth0", {
        email: "user1@example.com",
        phoneNumber: undefined,
      });
      expect(mockCreateUser).toHaveBeenCalledWith("keycloak", {
        email: "user1@example.com",
        phoneNumber: undefined,
      });
    });

    it("should preserve existing registered auth providers and avoid duplicates", async () => {
      const usersWithExistingProviders: SelfServiceUser[] = [
        {
          id: 1,
          guid: uuidv4(),
          email: "user1@example.com",
          phone: "+1234567890",
          configId: "test-config",
          completeRegistration: false,
          registeredAuthProviders: ["existing-provider", "auth0"], // auth0 already exists
        },
      ];

      mockSelfServiceUserStore.getIncompleteRegistrationUsers.mockResolvedValue(usersWithExistingProviders);
      mockCreateUser.mockResolvedValue(undefined);

      await registerSelfServiceUsers(mockSelfServiceUserStore, mockAppInstanceStore);

      // Should only call createUser for keycloak (auth0 already exists)
      expect(mockCreateUser).toHaveBeenCalledTimes(1);
      expect(mockCreateUser).toHaveBeenCalledWith("keycloak", {
        email: "user1@example.com",
        phoneNumber: "+1234567890",
      });

      expect(mockSelfServiceUserStore.batchUpdateUsers).toHaveBeenCalledTimes(1);
      expect(mockSelfServiceUserStore.batchUpdateUsers).toHaveBeenCalledWith([
        {
          ...usersWithExistingProviders[0],
          completeRegistration: true,
          registeredAuthProviders: ["existing-provider", "auth0", "keycloak"],
        },
      ]);
    });

    it("should skip already registered auth providers", async () => {
      const usersWithAllProvidersRegistered: SelfServiceUser[] = [
        {
          id: 1,
          guid: uuidv4(),
          email: "user1@example.com",
          phone: "+1234567890",
          configId: "test-config",
          completeRegistration: false,
          registeredAuthProviders: ["auth0", "keycloak"], // All providers already registered
        },
      ];

      mockSelfServiceUserStore.getIncompleteRegistrationUsers.mockResolvedValue(usersWithAllProvidersRegistered);

      await registerSelfServiceUsers(mockSelfServiceUserStore, mockAppInstanceStore);

      // Should not call createUser since all providers are already registered
      expect(mockCreateUser).not.toHaveBeenCalled();

      expect(mockSelfServiceUserStore.batchUpdateUsers).toHaveBeenCalledTimes(1);
      expect(mockSelfServiceUserStore.batchUpdateUsers).toHaveBeenCalledWith([
        {
          ...usersWithAllProvidersRegistered[0],
          completeRegistration: true,
          registeredAuthProviders: ["auth0", "keycloak"], // Unchanged
        },
      ]);
    });

    it("should handle mixed success and failure scenarios across different configIds", async () => {
      const usersWithMixedConfigs: SelfServiceUser[] = [
        {
          id: 1,
          guid: uuidv4(),
          email: "user1@example.com",
          phone: "+1234567890",
          configId: "config-1",
          completeRegistration: false,
          registeredAuthProviders: [],
        },
        {
          id: 2,
          guid: uuidv4(),
          email: "user2@example.com",
          phone: "+0987654321",
          configId: "config-2",
          completeRegistration: false,
          registeredAuthProviders: [],
        },
        {
          id: 3,
          guid: uuidv4(),
          email: "user3@example.com",
          phone: "+1122334455",
          configId: "config-1", // Same config as user1
          completeRegistration: false,
          registeredAuthProviders: [],
        },
      ];

      const mockAppInstance1: AppInstance = {
        configId: "config-1",
        edm: mockEntityDataManager,
      };
      const mockAppInstance2: AppInstance = {
        configId: "config-2",
        edm: mockEntityDataManager,
      };

      mockSelfServiceUserStore.getIncompleteRegistrationUsers.mockResolvedValue(usersWithMixedConfigs);
      mockAppInstanceStore.getAppInstance
        .mockResolvedValueOnce(mockAppInstance1)
        .mockResolvedValueOnce(mockAppInstance2);

      // Mock createUser to fail for user1 but succeed for others
      mockCreateUser
        .mockRejectedValueOnce(new Error("Auth provider error")) // auth0 for user1
        .mockResolvedValueOnce(undefined) // keycloak for user1
        .mockResolvedValueOnce(undefined) // auth0 for user3
        .mockResolvedValueOnce(undefined) // keycloak for user3
        .mockResolvedValueOnce(undefined) // auth0 for user2
        .mockResolvedValueOnce(undefined); // keycloak for user2

      await registerSelfServiceUsers(mockSelfServiceUserStore, mockAppInstanceStore);

      // Should call batchUpdateUsers once with all users
      expect(mockSelfServiceUserStore.batchUpdateUsers).toHaveBeenCalledTimes(1);

      // All users should be updated in a single batch call
      expect(mockSelfServiceUserStore.batchUpdateUsers).toHaveBeenCalledWith([
        {
          ...usersWithMixedConfigs[0],
          completeRegistration: false, // Failed due to auth0 error
          registeredAuthProviders: ["keycloak"], // Only keycloak succeeded
        },
        {
          ...usersWithMixedConfigs[2], // User 3 (config-1) - processed second in config-1 group
          completeRegistration: true, // Both providers succeeded
          registeredAuthProviders: ["auth0", "keycloak"],
        },
        {
          ...usersWithMixedConfigs[1], // User 2 (config-2) - processed in config-2 group
          completeRegistration: true, // Both providers succeeded
          registeredAuthProviders: ["auth0", "keycloak"],
        },
      ]);
    });
  });
});
