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

import fs from "fs";
import path from "path";

const VOCAB_DIR = path.resolve(__dirname, "..", "vendor", "vocabularies");

const KNOWN = new Set([
  "gender-type",
  "identifier-type",
  "country",
  "language",
  "relationship-type",
  "group-type",
]);

export interface VocabularyEntry {
  value: string;
  label: string;
}

/**
 * Load a SKOS vocabulary as a flat array of Form.io select options.
 * Only the six vocabularies referenced by Person/Group/Identifier are
 * supported — others throw `Unknown vocabulary`.
 */
export function getVocabulary(name: string): VocabularyEntry[] {
  if (!KNOWN.has(name)) {
    throw new Error(`Unknown vocabulary: ${name}`);
  }
  const file = path.join(VOCAB_DIR, `${name}.json`);
  const raw = fs.readFileSync(file, "utf8");
  return JSON.parse(raw) as VocabularyEntry[];
}
