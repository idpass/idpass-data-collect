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

import {
  DEFAULT_CR_TYPE_MAP,
  resolveCRTypeCode,
  type EventTypeKey,
} from "../v2/OpenSppV2AdapterOptions";

describe("DEFAULT_CR_TYPE_MAP", () => {
  it("covers every EventTypeKey", () => {
    const expectedKeys: EventTypeKey[] = [
      "create-individual",
      "update-individual",
      "create-group",
      "update-group",
      "add-member",
      "remove-member",
      "delete-entity",
    ];
    for (const key of expectedKeys) {
      expect(DEFAULT_CR_TYPE_MAP[key]).toBeTruthy();
    }
  });

  it("uses the documented codes for known event types", () => {
    expect(DEFAULT_CR_TYPE_MAP["create-individual"]).toBe("add_individual");
    expect(DEFAULT_CR_TYPE_MAP["update-individual"]).toBe("edit_individual");
    expect(DEFAULT_CR_TYPE_MAP["create-group"]).toBe("add_group");
    expect(DEFAULT_CR_TYPE_MAP["update-group"]).toBe("edit_group");
    expect(DEFAULT_CR_TYPE_MAP["add-member"]).toBe("add_member");
    expect(DEFAULT_CR_TYPE_MAP["remove-member"]).toBe("remove_member");
    expect(DEFAULT_CR_TYPE_MAP["delete-entity"]).toBe("archive_individual");
  });
});

describe("resolveCRTypeCode", () => {
  describe("non-delete event types", () => {
    it.each<[EventTypeKey, string]>([
      ["create-individual", "add_individual"],
      ["update-individual", "edit_individual"],
      ["create-group", "add_group"],
      ["update-group", "edit_group"],
      ["add-member", "add_member"],
      ["remove-member", "remove_member"],
    ])("resolves %s to %s with default map", (eventType, expected) => {
      expect(resolveCRTypeCode(eventType, "individual")).toBe(expected);
      expect(resolveCRTypeCode(eventType, "group")).toBe(expected);
      expect(resolveCRTypeCode(eventType, "record")).toBe(expected);
    });
  });

  describe("delete-entity branching", () => {
    it("returns archive_individual for individual entityKind", () => {
      expect(resolveCRTypeCode("delete-entity", "individual")).toBe(
        "archive_individual",
      );
    });

    it("returns archive_group for group entityKind", () => {
      expect(resolveCRTypeCode("delete-entity", "group")).toBe("archive_group");
    });

    it("returns archive_individual for record entityKind", () => {
      expect(resolveCRTypeCode("delete-entity", "record")).toBe(
        "archive_individual",
      );
    });
  });

  describe("override map", () => {
    it("override wins over defaults for non-delete events", () => {
      const override: Partial<Record<EventTypeKey, string>> = {
        "update-individual": "custom_edit_individual",
        "add-member": "custom_add_member",
      };
      expect(resolveCRTypeCode("update-individual", "individual", override)).toBe(
        "custom_edit_individual",
      );
      expect(resolveCRTypeCode("add-member", "group", override)).toBe(
        "custom_add_member",
      );
    });

    it("override leaves unmentioned keys at defaults", () => {
      const override: Partial<Record<EventTypeKey, string>> = {
        "update-individual": "custom_edit",
      };
      expect(resolveCRTypeCode("create-individual", "individual", override)).toBe(
        "add_individual",
      );
      expect(resolveCRTypeCode("update-group", "group", override)).toBe(
        "edit_group",
      );
    });

    it("delete-entity override applies to individual branch", () => {
      const override: Partial<Record<EventTypeKey, string>> = {
        "delete-entity": "custom_archive_individual",
      };
      expect(resolveCRTypeCode("delete-entity", "individual", override)).toBe(
        "custom_archive_individual",
      );
      expect(resolveCRTypeCode("delete-entity", "record", override)).toBe(
        "custom_archive_individual",
      );
    });

    it("delete-entity override applies to group branch", () => {
      const override: Partial<Record<EventTypeKey, string>> = {
        "delete-entity": "custom_archive_group",
      };
      expect(resolveCRTypeCode("delete-entity", "group", override)).toBe(
        "custom_archive_group",
      );
    });

    it("delete-entity falls back to archive_group for groups when override absent", () => {
      const override: Partial<Record<EventTypeKey, string>> = {
        "create-individual": "x",
      };
      expect(resolveCRTypeCode("delete-entity", "group", override)).toBe(
        "archive_group",
      );
    });

    it("undefined override behaves identically to empty override", () => {
      for (const key of Object.keys(DEFAULT_CR_TYPE_MAP) as EventTypeKey[]) {
        for (const kind of ["individual", "group", "record"] as const) {
          expect(resolveCRTypeCode(key, kind, undefined)).toBe(
            resolveCRTypeCode(key, kind, {}),
          );
        }
      }
    });
  });
});
