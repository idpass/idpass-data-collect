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
 * Generate a receipt number for an offline (client-side) redemption.
 *
 * Format: `RCP-{YYYYMMDD}-{8-CHAR-DEVICE-ID}-{4-DIGIT-SEQUENCE}`
 *
 * The device ID is truncated to 8 characters and uppercased to keep receipt
 * numbers compact while remaining device-specific. The daily sequence number
 * is zero-padded to 4 digits and should be reset each day.
 *
 * @example
 * generateOfflineReceiptNumber("device-abc-123", 1)
 * // => "RCP-20240615-DEVICEABC-0001"
 */
export function generateOfflineReceiptNumber(deviceId: string, sequence: number): string {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const shortId = deviceId.slice(0, 8).toUpperCase();
  return `RCP-${today}-${shortId}-${String(sequence).padStart(4, "0")}`;
}

/**
 * Generate a receipt number for a server-side redemption.
 *
 * Format: `RCP-{YYYYMMDD}-S-{6-DIGIT-SEQUENCE}`
 *
 * The "S" source identifier distinguishes server-generated receipts from
 * offline device receipts. The server sequence is padded to 6 digits to
 * accommodate higher transaction volumes.
 *
 * @example
 * generateServerReceiptNumber(new Date("2024-06-15"), 42)
 * // => "RCP-20240615-S-000042"
 */
export function generateServerReceiptNumber(date: Date, sequence: number): string {
  const today = date.toISOString().slice(0, 10).replace(/-/g, "");
  return `RCP-${today}-S-${String(sequence).padStart(6, "0")}`;
}
