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
 * Shared logger-mock factory for backend tests.
 *
 * Jest hoists `jest.mock()` calls to the top of each file, so the actual
 * `jest.mock("../utils/logger", ...)` invocation must remain in the test
 * file itself. This module exports the *factory function* so every test
 * file uses the same implementation:
 *
 * ```ts
 * import { silentLoggerMock } from "./helpers/mockLogger";
 * jest.mock("../utils/logger", silentLoggerMock);
 * ```
 */

/**
 * Factory function suitable for the second argument of `jest.mock()`.
 * Creates a silent pino logger so tests do not emit console output.
 */
export const silentLoggerMock = () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pino = require("pino");
  const silentLogger = pino({ level: "silent" });
  return {
    createLogger: () => silentLogger.child({ component: "test" }),
    logger: silentLogger,
  };
};
