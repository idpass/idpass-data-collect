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
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { EventApplier } from "../interfaces/types";
import { EventApplierService } from "../services/EventApplierService";
import { attendanceEventApplier } from "./AttendanceEventApplier";
import { grantEntitlementApplier, redeemEntitlementApplier, voidRedemptionApplier } from "./RedemptionEventApplier";

const eventApplierRegistry: Record<string, EventApplier> = {
  "record-attendance": attendanceEventApplier,
  "grant-entitlement": grantEntitlementApplier,
  "redeem-entitlement": redeemEntitlementApplier,
  "void-redemption": voidRedemptionApplier,
};

/**
 * Registers custom event appliers from the registry into an EventApplierService.
 *
 * Only appliers matching the provided event type strings will be registered.
 * Unknown event types are logged as warnings and skipped.
 *
 * @param customEventTypes - Array of event type strings to register (e.g. ["record-attendance"])
 * @param service - The EventApplierService to register appliers into
 */
export function registerAppEventAppliers(
  customEventTypes: string[],
  service: EventApplierService,
): void {
  for (const eventType of customEventTypes) {
    const applier = eventApplierRegistry[eventType];
    if (applier) {
      service.registerEventApplier(eventType, applier);
    } else {
      console.warn(`No applier registered for event type: ${eventType}`);
    }
  }
}

export { attendanceEventApplier, grantEntitlementApplier, redeemEntitlementApplier, voidRedemptionApplier };
