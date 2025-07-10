/*
 * Licensed to the Association pour la cooperation numerique (ACN) under one
 * or more contributor license agreements. See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership. The ACN licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License. You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */

// Check if users is not registered in the database and register them using conresponding auth provider
import { AppInstance, AppInstanceStore, SelfServiceUser, SelfServiceUserStore } from "../types";

export async function registerSelfServiceUsers(
  selfServiceUserStore: SelfServiceUserStore,
  appInstanceStore: AppInstanceStore,
) {
  console.log("Registering self service users");
  const users = await selfServiceUserStore.getIncompleteRegistrationUsers();

  if (users.length === 0) {
    console.log("No incomplete registration users to register");
    return;
  }

  const cachedInstances: Record<string, AppInstance> = {};
  const usersByConfigId: Record<string, SelfServiceUser[]> = {};
  for (const user of users) {
    // Get app instance
    let appInstance: AppInstance | null = cachedInstances[user.configId];
    if (!appInstance) {
      try {
        appInstance = await appInstanceStore.getAppInstance(user.configId);
        if (appInstance) {
          cachedInstances[user.configId] = appInstance;
        } else {
          console.error(`App instance not found for configId: ${user.configId}`);
        }
      } catch (error) {
        console.error(`Error getting app instance for configId: ${user.configId}`, error);
      }
    }
    // group users by configId
    usersByConfigId[user.configId] = [...(usersByConfigId[user.configId] || []), user];
  }

  // batch register users by configId
  for (const configId in usersByConfigId) {
    const users = usersByConfigId[configId];
    const appInstance = cachedInstances[configId];
    if (!appInstance) {
      console.error(`App instance not found for configId: ${configId}`);
      continue;
    }
    const availableAuthProviders = await appInstance.edm.getAvailableAuthProviders();
    for (const authProvider of availableAuthProviders) {
      for (const user of users) {
        console.log(`Registering user ${user.email} for auth provider: ${authProvider}`);
        user.completeRegistration = true;
        const registeredAuthProviders = new Set(user.registeredAuthProviders);
        try {
          await appInstance.edm.createUser(authProvider, {
            email: user.email,
            phoneNumber: user.phone,
          });
          registeredAuthProviders.add(authProvider);
        } catch (error) {
          user.completeRegistration = false;
          console.error(`Error creating user for auth provider: ${authProvider}`, error);
        }
        user.registeredAuthProviders = Array.from(registeredAuthProviders);
      }
    }
  }

  await selfServiceUserStore.batchUpdateUsers(users);
}
