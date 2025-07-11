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

import { cloneDeep } from "lodash";
import { AppInstance, AppInstanceStore, SelfServiceUser, SelfServiceUserStore } from "../types";

// Check if users is not registered in the database and register them using conresponding auth provider
export async function registerSelfServiceUsers(
  selfServiceUserStore: SelfServiceUserStore,
  appInstanceStore: AppInstanceStore,
) {
  const users = await selfServiceUserStore.getIncompleteRegistrationUsers();

  if (users.length === 0) {
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
    const updatedUsers: SelfServiceUser[] = [];
    const appInstance = cachedInstances[configId];
    if (!appInstance) {
      console.error(`App instance not found for configId: ${configId}`);
      continue;
    }
    const availableAuthProviders = await appInstance.edm.getAvailableAuthProviders();
    for (const user of users) {
      const clonedUser = cloneDeep(user);
      clonedUser.completeRegistration = true;
      const registeredAuthProviders = new Set(user.registeredAuthProviders);
      for (const authProvider of availableAuthProviders) {
        if (registeredAuthProviders.has(authProvider)) {
          continue;
        }
        try {
          await appInstance.edm.createUser(authProvider, {
            email: user.email,
            phoneNumber: user.phone,
          });
          registeredAuthProviders.add(authProvider);
        } catch (error) {
          clonedUser.completeRegistration = false;
          console.error(`Error creating user for auth provider: ${authProvider}`, error);
        }
      }
      clonedUser.registeredAuthProviders = Array.from(registeredAuthProviders);
      updatedUsers.push(clonedUser);
    }
    await selfServiceUserStore.batchUpdateUsers(updatedUsers);
  }
}
