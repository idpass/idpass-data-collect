import { registerSelfServiceUsers } from "../registerUsers";

describe("registerSelfServiceUsers", () => {
  let mockSelfServiceUserStore: any;
  let mockAppInstanceStore: any;
  let mockEdm: any;
  let mockUsers: any[];
  let mockAppInstance: any;

  beforeEach(() => {
    mockUsers = [
      {
        id: 1,
        guid: "guid-1",
        email: "user1@example.com",
        phone: "1234567890",
        configId: "config-1",
        completeRegistration: false,
        registeredAuthProviders: [],
      },
      {
        id: 2,
        guid: "guid-2",
        email: "user2@example.com",
        phone: "0987654321",
        configId: "config-1",
        completeRegistration: false,
        registeredAuthProviders: [],
      },
    ];

    mockEdm = {
      getAvailableAuthProviders: jest.fn().mockResolvedValue(["mock-provider-1", "mock-provider-2"]),
      createUser: jest.fn().mockResolvedValue(undefined),
    };

    mockAppInstance = {
      configId: "config-1",
      edm: mockEdm,
    };

    mockSelfServiceUserStore = {
      getIncompleteRegistrationUsers: jest.fn().mockResolvedValue(mockUsers),
      batchUpdateUsers: jest.fn().mockResolvedValue(undefined),
    };

    mockAppInstanceStore = {
      getAppInstance: jest.fn().mockResolvedValue(mockAppInstance),
    };

    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("registers users for all available auth providers and updates users", async () => {
    console.log("Registering users for all available auth providers and updating users");
    await registerSelfServiceUsers(mockSelfServiceUserStore, mockAppInstanceStore);

    // Each user should be registered for both providers
    expect(mockEdm.createUser).toHaveBeenCalledTimes(4);
    expect(mockEdm.createUser).toHaveBeenCalledWith("mock-provider-1", {
      email: "user1@example.com",
      phoneNumber: "1234567890",
    });
    expect(mockEdm.createUser).toHaveBeenCalledWith("mock-provider-2", {
      email: "user1@example.com",
      phoneNumber: "1234567890",
    });
    expect(mockSelfServiceUserStore.batchUpdateUsers).toHaveBeenCalledWith(mockUsers);

    // Users should have completeRegistration true and both providers registered
    for (const user of mockUsers) {
      expect(user.completeRegistration).toBe(true);
      expect(user.registeredAuthProviders).toEqual(expect.arrayContaining(["mock-provider-1", "mock-provider-2"]));
    }
  });

  it("handles no incomplete registration users", async () => {
    mockSelfServiceUserStore.getIncompleteRegistrationUsers.mockResolvedValue([]);
    await registerSelfServiceUsers(mockSelfServiceUserStore, mockAppInstanceStore);
    expect(mockAppInstanceStore.getAppInstance).not.toHaveBeenCalled();
    expect(mockSelfServiceUserStore.batchUpdateUsers).not.toHaveBeenCalled();
  });

  it("handles missing app instance gracefully", async () => {
    mockAppInstanceStore.getAppInstance.mockResolvedValue(null);
    await registerSelfServiceUsers(mockSelfServiceUserStore, mockAppInstanceStore);
    // Should log error and not throw
    expect(console.error).toHaveBeenCalledWith("App instance not found for configId: config-1");
    expect(mockSelfServiceUserStore.batchUpdateUsers).toHaveBeenCalledWith(mockUsers);
  });

  it("handles error in createUser and sets completeRegistration to false", async () => {
    // Mock createUser to throw error for specific provider and user combination
    mockEdm.createUser.mockImplementation((authProvider: string, userData: { email: string; phoneNumber?: string }) => {
      // Throw error for the first provider and first user
      if (authProvider === "mock-provider-1" && userData.email === "user1@example.com") {
        throw new Error("Create user failed");
      }
      return Promise.resolve();
    });

    await registerSelfServiceUsers(mockSelfServiceUserStore, mockAppInstanceStore);

    // The first user should have completeRegistration false due to the error
    expect(mockUsers[0].completeRegistration).toBe(false);
    // The second user should still have completeRegistration true
    expect(mockUsers[1].completeRegistration).toBe(true);

    // Check that the first user only has the second provider registered (since first failed)
    expect(mockUsers[0].registeredAuthProviders).toEqual(["mock-provider-2"]);
    // Check that the second user has both providers registered
    expect(mockUsers[1].registeredAuthProviders).toEqual(["mock-provider-1", "mock-provider-2"]);

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("Error creating user for auth provider"),
      expect.any(Error),
    );
    expect(mockSelfServiceUserStore.batchUpdateUsers).toHaveBeenCalledWith(mockUsers);
  });
});
