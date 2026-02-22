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

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { nextTick } from "vue";
import { useServerSearch } from "@/composables/useServerSearch";

// Mock the entities API
const mockSearchEntities = vi.fn();
vi.mock("@/api/entities", () => ({
  searchEntities: (...args: unknown[]) => mockSearchEntities(...args),
}));

describe("useServerSearch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockSearchEntities.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns initial state with empty query and results", () => {
    const { searchQuery, searchResults, searching, searchError } = useServerSearch("tenant-1");
    expect(searchQuery.value).toBe("");
    expect(searchResults.value).toEqual([]);
    expect(searching.value).toBe(false);
    expect(searchError.value).toBeNull();
  });

  it("debounces search calls by 300ms", async () => {
    mockSearchEntities.mockResolvedValue([]);

    const { searchQuery } = useServerSearch("tenant-1");

    searchQuery.value = "Smi";
    await nextTick();

    // Should not have called yet
    expect(mockSearchEntities).not.toHaveBeenCalled();

    // Advance 200ms — still debouncing
    vi.advanceTimersByTime(200);
    await nextTick();
    expect(mockSearchEntities).not.toHaveBeenCalled();

    // Advance remaining 100ms
    vi.advanceTimersByTime(100);
    await nextTick();
    // Wait for the promise to resolve
    await vi.runAllTimersAsync();

    expect(mockSearchEntities).toHaveBeenCalledOnce();
  });

  it("calls searchEntities with regex criteria", async () => {
    mockSearchEntities.mockResolvedValue([{ guid: "abc", name: "Smith", type: "group", lastUpdated: "2024-01-01" }]);

    const { searchQuery, searchResults } = useServerSearch("tenant-1");

    searchQuery.value = "Smith";
    await nextTick();

    await vi.runAllTimersAsync();

    expect(mockSearchEntities).toHaveBeenCalledWith("tenant-1", [{ name: { $regex: "Smith" } }]);
    expect(searchResults.value).toHaveLength(1);
    expect(searchResults.value[0].name).toBe("Smith");
  });

  it("clears results when query is emptied", async () => {
    mockSearchEntities.mockResolvedValue([{ guid: "abc", name: "Smith", type: "group", lastUpdated: "2024-01-01" }]);

    const { searchQuery, searchResults } = useServerSearch("tenant-1");

    // Type something and get results
    searchQuery.value = "Smith";
    await nextTick();
    await vi.runAllTimersAsync();
    expect(searchResults.value).toHaveLength(1);

    // Clear the query
    mockSearchEntities.mockClear();
    searchQuery.value = "";
    await nextTick();
    await vi.runAllTimersAsync();

    // Results should be cleared, no API call
    expect(searchResults.value).toEqual([]);
    expect(mockSearchEntities).not.toHaveBeenCalled();
  });

  it("sets searchError on API failure", async () => {
    mockSearchEntities.mockRejectedValue(new Error("Network failure"));

    const { searchQuery, searchError } = useServerSearch("tenant-1");

    searchQuery.value = "test";
    await nextTick();
    await vi.runAllTimersAsync();

    expect(searchError.value).toBe("Network failure");
  });

  it("sets searching=true during API call", async () => {
    let resolveSearch: (value: unknown[]) => void;
    mockSearchEntities.mockReturnValue(
      new Promise((resolve) => {
        resolveSearch = resolve;
      }),
    );

    const { searchQuery, searching } = useServerSearch("tenant-1");

    searchQuery.value = "test";
    await nextTick();

    // Trigger the debounced call
    vi.advanceTimersByTime(300);
    await nextTick();

    expect(searching.value).toBe(true);

    resolveSearch!([]);
    await vi.runAllTimersAsync();

    expect(searching.value).toBe(false);
  });

  it("resets debounce timer on rapid typing", async () => {
    mockSearchEntities.mockResolvedValue([]);

    const { searchQuery } = useServerSearch("tenant-1");

    searchQuery.value = "S";
    await nextTick();

    // Advance 200ms — still debouncing
    vi.advanceTimersByTime(200);
    await nextTick();

    // Type again — should reset the timer
    searchQuery.value = "Sm";
    await nextTick();

    // Advance 200ms from second keystroke — still debouncing
    vi.advanceTimersByTime(200);
    await nextTick();
    expect(mockSearchEntities).not.toHaveBeenCalled();

    // Advance remaining 100ms — now the second query fires
    vi.advanceTimersByTime(100);
    await vi.runAllTimersAsync();

    expect(mockSearchEntities).toHaveBeenCalledOnce();
    expect(mockSearchEntities).toHaveBeenCalledWith("tenant-1", [{ name: { $regex: "Sm" } }]);
  });

  it("discards stale responses when a newer query has been issued", async () => {
    let resolveFirst: (value: unknown[]) => void;
    let resolveSecond: (value: unknown[]) => void;

    // First call returns a slow promise
    mockSearchEntities.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFirst = resolve;
      }),
    );

    const { searchQuery, searchResults } = useServerSearch("tenant-1");

    // First search
    searchQuery.value = "Jo";
    await nextTick();
    vi.advanceTimersByTime(300);
    await nextTick();

    // Second search (while first is still in-flight)
    mockSearchEntities.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSecond = resolve;
      }),
    );
    searchQuery.value = "John";
    await nextTick();
    vi.advanceTimersByTime(300);
    await nextTick();

    // Resolve second request first (faster response)
    resolveSecond!([{ guid: "2", name: "John", type: "individual", lastUpdated: "2024-01-01" }]);
    await vi.runAllTimersAsync();

    expect(searchResults.value).toHaveLength(1);
    expect(searchResults.value[0].name).toBe("John");

    // Now resolve the stale first request — results should NOT be overwritten
    resolveFirst!([
      { guid: "1", name: "Jo A", type: "individual", lastUpdated: "2024-01-01" },
      { guid: "2", name: "Jo B", type: "individual", lastUpdated: "2024-01-01" },
    ]);
    await vi.runAllTimersAsync();

    // Should still show the "John" result, not the stale "Jo" results
    expect(searchResults.value).toHaveLength(1);
    expect(searchResults.value[0].name).toBe("John");
  });

  it("handles null query from clearable field", async () => {
    mockSearchEntities.mockResolvedValue([{ guid: "abc", name: "Smith", type: "group", lastUpdated: "2024-01-01" }]);

    const { searchQuery, searchResults } = useServerSearch("tenant-1");

    // Get some results first
    searchQuery.value = "Smith";
    await nextTick();
    await vi.runAllTimersAsync();
    expect(searchResults.value).toHaveLength(1);

    // Vuetify clearable sets value to null
    searchQuery.value = null as unknown as string;
    await nextTick();
    await vi.runAllTimersAsync();

    expect(searchResults.value).toEqual([]);
    expect(mockSearchEntities).toHaveBeenCalledOnce();
  });

  it("treats whitespace-only query as empty", async () => {
    mockSearchEntities.mockResolvedValue([]);

    const { searchQuery, searchResults } = useServerSearch("tenant-1");

    searchQuery.value = "   ";
    await nextTick();
    await vi.runAllTimersAsync();

    expect(searchResults.value).toEqual([]);
    expect(mockSearchEntities).not.toHaveBeenCalled();
  });

  it("uses fallback message for non-Error thrown from API", async () => {
    mockSearchEntities.mockRejectedValue("string error");

    const { searchQuery, searchError } = useServerSearch("tenant-1");

    searchQuery.value = "test";
    await nextTick();
    await vi.runAllTimersAsync();

    expect(searchError.value).toBe("Search failed");
  });

  it("clears previous results on error", async () => {
    // First: successful search
    mockSearchEntities.mockResolvedValueOnce([
      { guid: "abc", name: "Smith", type: "group", lastUpdated: "2024-01-01" },
    ]);

    const { searchQuery, searchResults, searchError } = useServerSearch("tenant-1");

    searchQuery.value = "Smith";
    await nextTick();
    await vi.runAllTimersAsync();
    expect(searchResults.value).toHaveLength(1);

    // Second: failing search
    mockSearchEntities.mockRejectedValueOnce(new Error("Server error"));

    searchQuery.value = "fail";
    await nextTick();
    await vi.runAllTimersAsync();

    expect(searchResults.value).toEqual([]);
    expect(searchError.value).toBe("Server error");
  });
});
