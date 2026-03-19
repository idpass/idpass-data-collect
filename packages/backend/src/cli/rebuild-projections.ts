#!/usr/bin/env node
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

/**
 * CLI tool to rebuild entity projections from the event log.
 *
 * Usage:
 *   npx ts-node src/cli/rebuild-projections.ts [--tenant <configId>] [--batch-size <n>]
 *
 * Connects to PostgreSQL, loads events, clears entities, replays all events.
 *
 * Environment variables:
 *   POSTGRES  PostgreSQL connection string (required)
 *
 * Flags:
 *   --tenant <id>       Rebuild only the specified tenant config ID. Rebuilds all tenants if omitted.
 *   --batch-size <n>    Number of events to process per progress report (default: 100).
 */

import * as dotenv from "dotenv";
import {
  EntityStoreImpl,
  EventStoreImpl,
  EventApplierService,
  PostgresEntityStorageAdapter,
  PostgresEventStorageAdapter,
  ProjectionRebuildService,
} from "@idpass/data-collect-core";
import { AppConfigStoreImpl } from "../stores/AppConfigStore";

dotenv.config();

function parseArgs(argv: string[]): { tenant?: string; batchSize: number } {
  const args = argv.slice(2);
  let tenant: string | undefined;
  let batchSize = 100;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--tenant" && args[i + 1]) {
      tenant = args[i + 1];
      i++;
    } else if (args[i] === "--batch-size" && args[i + 1]) {
      const parsed = parseInt(args[i + 1], 10);
      if (!isNaN(parsed) && parsed > 0) {
        batchSize = parsed;
      } else {
        console.error(`Invalid --batch-size value: ${args[i + 1]}. Must be a positive integer.`);
        process.exit(1);
      }
      i++;
    }
  }

  return { tenant, batchSize };
}

async function rebuildTenant(postgresUrl: string, tenantId: string, batchSize: number): Promise<boolean> {
  console.log(`\n[${tenantId}] Starting projection rebuild...`);

  const eventAdapter = new PostgresEventStorageAdapter(postgresUrl, tenantId);
  const entityAdapter = new PostgresEntityStorageAdapter(postgresUrl, tenantId);

  const eventStore = new EventStoreImpl(eventAdapter);
  const entityStore = new EntityStoreImpl(entityAdapter);

  await eventStore.initialize();
  await entityStore.initialize();

  const eventApplierService = new EventApplierService(eventStore, entityStore);
  const rebuildService = new ProjectionRebuildService(eventStore, entityStore, eventApplierService);

  let lastProgressLine = "";

  const result = await rebuildService.rebuild({
    batchSize,
    onProgress: (processed, total) => {
      const percent = total > 0 ? Math.round((processed / total) * 100) : 100;
      lastProgressLine = `[${tenantId}] Progress: ${processed}/${total} (${percent}%)`;
      process.stdout.write(`\r${lastProgressLine}`);
    },
  });

  // Move to a new line after the progress output
  if (lastProgressLine) {
    process.stdout.write("\n");
  }

  console.log(`[${tenantId}] Rebuild complete:`);
  console.log(`  Total events : ${result.totalEvents}`);
  console.log(`  Applied      : ${result.appliedEvents}`);
  console.log(`  Failed       : ${result.failedEvents}`);
  console.log(`  Duration     : ${result.durationMs}ms`);

  if (result.errors.length > 0) {
    console.error(`[${tenantId}] Failed events:`);
    for (const { eventGuid, error } of result.errors) {
      console.error(`  - ${eventGuid}: ${error}`);
    }
  }

  await eventStore.closeConnection();
  await entityStore.closeConnection();

  return result.failedEvents === 0;
}

async function main(): Promise<void> {
  const postgresUrl = process.env.POSTGRES;
  if (!postgresUrl) {
    console.error("Error: POSTGRES environment variable is not set.");
    console.error("Example: POSTGRES=postgresql://user:pass@localhost:5432/mydb npx ts-node src/cli/rebuild-projections.ts");
    process.exit(1);
  }

  const { tenant, batchSize } = parseArgs(process.argv);

  let tenantIds: string[];

  if (tenant) {
    tenantIds = [tenant];
  } else {
    console.log("No --tenant specified. Loading all tenants from app_configs...");
    const appConfigStore = new AppConfigStoreImpl(postgresUrl);
    await appConfigStore.initialize();
    const configs = await appConfigStore.getConfigs();
    await appConfigStore.closeConnection();

    if (configs.length === 0) {
      console.log("No tenant configurations found. Nothing to rebuild.");
      process.exit(0);
    }

    tenantIds = configs.map((c) => c.id);
    console.log(`Found ${tenantIds.length} tenant(s): ${tenantIds.join(", ")}`);
  }

  let allSucceeded = true;

  for (const tenantId of tenantIds) {
    const succeeded = await rebuildTenant(postgresUrl, tenantId, batchSize);
    if (!succeeded) {
      allSucceeded = false;
    }
  }

  if (!allSucceeded) {
    console.error("\nOne or more tenants had failed events during rebuild.");
    process.exit(1);
  }

  console.log("\nAll projections rebuilt successfully.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error during rebuild:", err instanceof Error ? err.message : err);
  process.exit(1);
});
