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

import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import {
  AppError as CoreAppError,
  FormSubmission,
  SyncLevel,
  generateServerReceiptNumber,
} from "@idpass/data-collect-core";
import { AuthenticatedRequest, authenticateJWT } from "../middlewares/authentication";
import { asyncHandler } from "../middlewares/errorHandlers";
import { AppInstanceStore } from "../types";

// In-memory daily sequence counter for server receipt numbers.
// This is sufficient for single-process deployments. For production
// multi-instance setups, this should be replaced with a PostgreSQL
// sequence to avoid duplicate receipt numbers across processes.
let receiptSequence = 0;
let receiptSequenceDate = "";

function nextReceiptSequence(): { date: Date; sequence: number } {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  if (today !== receiptSequenceDate) {
    receiptSequenceDate = today;
    receiptSequence = 0;
  }

  receiptSequence += 1;
  return { date: now, sequence: receiptSequence };
}

export function createRedemptionRouter(appInstanceStore: AppInstanceStore): Router {
  const router = Router();

  // POST /redeem
  // Body: { configId, entityGuid, entitlementId, redemptionType, quantity?, amount?, items?, notes?, idempotencyKey? }
  //
  // Idempotency: if idempotencyKey is provided it is used as the form GUID.
  // When the event applier encounters a duplicate form GUID it returns the
  // original entity without re-applying, giving us at-least-once safety.
  router.post(
    "/redeem",
    authenticateJWT,
    asyncHandler(async (req, res) => {
      const {
        configId = "default",
        entityGuid,
        entitlementId,
        redemptionType,
        quantity,
        amount,
        items,
        notes,
        idempotencyKey,
      } = req.body;

      const appInstance = await appInstanceStore.getAppInstance(configId as string);
      if (!appInstance) {
        return res.status(400).json({ error: "App instance not found", code: "APP_INSTANCE_NOT_FOUND" });
      }

      const { date, sequence } = nextReceiptSequence();
      const receiptNumber = generateServerReceiptNumber(date, sequence);
      const formGuid = idempotencyKey || uuidv4();

      const formSubmission: FormSubmission = {
        guid: formGuid,
        entityGuid,
        type: "redeem-entitlement",
        data: {
          entitlementId,
          redemptionType,
          quantity,
          amount,
          items,
          notes,
          receiptNumber,
        },
        timestamp: new Date().toISOString(),
        userId: (req as AuthenticatedRequest).user?.id ?? "server",
        syncLevel: SyncLevel.REMOTE,
      };

      try {
        await appInstance.edm.submitForm(formSubmission);
        return res.json({ success: true, receiptNumber, formGuid });
      } catch (error) {
        if (error instanceof CoreAppError) {
          return res.status(400).json({ error: error.message, code: error.code });
        }
        console.error("Redemption error:", error);
        return res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
      }
    }),
  );

  // GET /entitlements/:entityGuid?configId=xxx
  // Returns the entity's entitlements array from entity.data
  router.get(
    "/entitlements/:entityGuid",
    authenticateJWT,
    asyncHandler(async (req, res) => {
      const { configId = "default" } = req.query;
      const { entityGuid } = req.params;

      const appInstance = await appInstanceStore.getAppInstance(configId as string);
      if (!appInstance) {
        return res.status(400).json({ error: "App instance not found", code: "APP_INSTANCE_NOT_FOUND" });
      }

      try {
        const entityPair = await appInstance.edm.getEntity(entityGuid);
        const entitlements = entityPair.modified.data?.entitlements ?? [];
        return res.json({ entityGuid, entitlements });
      } catch (error) {
        if (error instanceof CoreAppError) {
          return res.status(400).json({ error: error.message, code: error.code });
        }
        console.error("Entitlements lookup error:", error);
        return res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
      }
    }),
  );

  return router;
}
