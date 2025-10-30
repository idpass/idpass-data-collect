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

import "dotenv/config";
import { run } from "./syncServer";

const {
  SYNC_SERVER_PORT: port = "3000",
  USER_ID: userId = "SYNC_SERVER",
  ADMIN_PASSWORD: adminPassword,
  ADMIN_EMAIL: adminEmail,
  POSTGRES: postgresUrl,
} = process.env;

if (!adminPassword || !adminEmail) {
  throw new Error("Initial admin credentials must be set");
}

if (!postgresUrl) {
  throw new Error("PostgreSQL connection string must be set");
}

run({
  port: parseInt(port),
  adminPassword,
  adminEmail,
  userId,
  postgresUrl,
});
