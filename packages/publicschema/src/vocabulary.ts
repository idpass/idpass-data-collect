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

import genderType from "../vendor/vocabularies/gender-type.json";
import identifierType from "../vendor/vocabularies/identifier-type.json";
import country from "../vendor/vocabularies/country.json";
import language from "../vendor/vocabularies/language.json";
import relationshipType from "../vendor/vocabularies/relationship-type.json";
import groupType from "../vendor/vocabularies/group-type.json";

export interface VocabularyEntry {
  value: string;
  label: string;
}

const VOCABULARIES: Record<string, VocabularyEntry[]> = {
  "gender-type": genderType as VocabularyEntry[],
  "identifier-type": identifierType as VocabularyEntry[],
  country: country as VocabularyEntry[],
  language: language as VocabularyEntry[],
  "relationship-type": relationshipType as VocabularyEntry[],
  "group-type": groupType as VocabularyEntry[],
};

/**
 * Load a SKOS vocabulary as a flat array of Form.io select options.
 * Only the six vocabularies referenced by Person/Group/Identifier are
 * supported — others throw `Unknown vocabulary`.
 */
export function getVocabulary(name: string): VocabularyEntry[] {
  const entries = VOCABULARIES[name];
  if (!entries) {
    throw new Error(`Unknown vocabulary: ${name}`);
  }
  return entries;
}
