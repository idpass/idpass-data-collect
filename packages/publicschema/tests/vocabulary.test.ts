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

import { getVocabulary } from "../src/vocabulary";

describe("getVocabulary", () => {
  it("loads gender-type with upstream text codes", () => {
    const gender = getVocabulary("gender-type");
    const values = gender.map((e) => e.value);
    expect(values).toEqual(expect.arrayContaining(["male", "female"]));
    for (const entry of gender) {
      expect(entry.value).toBeTruthy();
      expect(entry.label).toBeTruthy();
    }
  });

  it("loads country vocabulary with >100 entries", () => {
    const country = getVocabulary("country");
    expect(country.length).toBeGreaterThan(100);
    for (const entry of country) {
      expect(entry.value).toBeTruthy();
      expect(entry.label).toBeTruthy();
    }
  });

  it("loads group-type with household/family/farm/other", () => {
    const vals = getVocabulary("group-type").map((e) => e.value).sort();
    expect(vals).toEqual(["family", "farm", "household", "other"]);
  });

  it("throws on unknown vocabulary name", () => {
    expect(() => getVocabulary("does-not-exist")).toThrow(/Unknown vocabulary/);
  });
});
