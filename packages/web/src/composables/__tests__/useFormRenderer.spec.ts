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

import { describe, it, expect, vi, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useFormRenderer, type FormSubmission } from "@/composables/useFormRenderer";

// Mock the API client
const mockPost = vi.fn();
vi.mock("@/api/client", () => ({
  getClient: () => ({
    post: mockPost,
  }),
}));

// Mock uuid to return sequential predictable values
let uuidCounter = 0;
vi.mock("uuid", () => ({
  v4: vi.fn(() => `mock-uuid-${++uuidCounter}`),
}));

// Mock the auth store with mutable payload for testing fallback chain
let mockAgentPayload: { id?: string; email?: string; role?: string; tenantIds?: string[] } | null = {
  id: "agent-1",
  email: "agent@test.com",
  role: "USER",
  tenantIds: ["tenant-1"],
};
vi.mock("@/stores/auth", () => ({
  useAuthStore: () => ({
    get agentPayload() {
      return mockAgentPayload;
    },
  }),
}));

describe("useFormRenderer", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockPost.mockReset();
    uuidCounter = 0;
    mockAgentPayload = {
      id: "agent-1",
      email: "agent@test.com",
      role: "USER",
      tenantIds: ["tenant-1"],
    };
  });

  it("returns initial state with submitting=false and no error", () => {
    const { submitting, submitError } = useFormRenderer();
    expect(submitting.value).toBe(false);
    expect(submitError.value).toBeNull();
  });

  it("constructs a valid FormSubmission with correct fields", async () => {
    mockPost.mockResolvedValueOnce({ data: { review: {} } });

    const { submitForm } = useFormRenderer();

    const result = await submitForm({
      tenantId: "tenant-1",
      entityGuid: "entity-abc",
      formType: "update-individual",
      formData: { name: "John", age: 30 },
    });

    expect(result.success).toBe(true);
    expect(result.submissionGuid).toBe("mock-uuid-1");

    // Verify the POST call
    expect(mockPost).toHaveBeenCalledOnce();
    const [url, body] = mockPost.mock.calls[0];
    expect(url).toBe("/api/reviews/submit");
    expect(body.tenantId).toBe("tenant-1");

    // Verify submission structure
    const submission: FormSubmission = body.formData;
    expect(submission.guid).toBe("mock-uuid-1");
    expect(submission.entityGuid).toBe("entity-abc");
    expect(submission.type).toBe("update-individual");
    expect(submission.data).toEqual({ name: "John", age: 30 });
    expect(submission.userId).toBe("agent@test.com");
    expect(submission.syncLevel).toBe(1);
  });

  it("generates a new entityGuid when none is provided", async () => {
    mockPost.mockResolvedValueOnce({ data: { review: {} } });

    const { submitForm } = useFormRenderer();

    const result = await submitForm({
      tenantId: "tenant-1",
      entityGuid: null,
      formType: "create-individual",
      formData: { name: "Jane" },
    });

    const submission: FormSubmission = mockPost.mock.calls[0][1].formData;
    // entityGuid gets the first UUID, submission.guid gets the second
    expect(submission.entityGuid).toBe("mock-uuid-1");
    expect(submission.guid).toBe("mock-uuid-2");
    expect(result.entityGuid).toBe("mock-uuid-1");
  });

  it("injects entityName into submission data when provided", async () => {
    mockPost.mockResolvedValueOnce({ data: { review: {} } });

    const { submitForm } = useFormRenderer();

    await submitForm({
      tenantId: "tenant-1",
      entityGuid: null,
      formType: "create-group",
      formData: { name: "Test Group" },
      entityName: "household",
    });

    const submission: FormSubmission = mockPost.mock.calls[0][1].formData;
    expect(submission.data).toEqual({ name: "Test Group", entityName: "household" });
  });

  it("does not inject entityName when not provided", async () => {
    mockPost.mockResolvedValueOnce({ data: { review: {} } });

    const { submitForm } = useFormRenderer();

    await submitForm({
      tenantId: "tenant-1",
      entityGuid: "entity-1",
      formType: "update-individual",
      formData: { name: "John" },
    });

    const submission: FormSubmission = mockPost.mock.calls[0][1].formData;
    expect(submission.data).toEqual({ name: "John" });
    expect(submission.data).not.toHaveProperty("entityName");
  });

  it("returns entityGuid on successful submission", async () => {
    mockPost.mockResolvedValueOnce({ data: { review: {} } });

    const { submitForm } = useFormRenderer();

    const result = await submitForm({
      tenantId: "tenant-1",
      entityGuid: "existing-guid",
      formType: "update-individual",
      formData: { name: "John" },
    });

    expect(result.entityGuid).toBe("existing-guid");
  });

  it("includes an ISO timestamp", async () => {
    mockPost.mockResolvedValueOnce({ data: { review: {} } });

    const { submitForm } = useFormRenderer();

    await submitForm({
      tenantId: "tenant-1",
      entityGuid: "entity-1",
      formType: "update-individual",
      formData: {},
    });

    const submission: FormSubmission = mockPost.mock.calls[0][1].formData;
    // Verify it's a valid ISO 8601 timestamp
    const parsed = new Date(submission.timestamp);
    expect(parsed.toISOString()).toBe(submission.timestamp);
  });

  it("sets submitting=true during request and false after", async () => {
    let resolvePost: (value: unknown) => void;
    mockPost.mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePost = resolve;
      }),
    );

    const { submitting, submitForm } = useFormRenderer();

    const promise = submitForm({
      tenantId: "tenant-1",
      entityGuid: "entity-1",
      formType: "update-individual",
      formData: {},
    });

    expect(submitting.value).toBe(true);

    resolvePost!({ data: { review: {} } });
    await promise;

    expect(submitting.value).toBe(false);
  });

  it("sets submitError on failure and returns success=false", async () => {
    mockPost.mockRejectedValueOnce(new Error("Network error"));

    const { submitForm, submitError } = useFormRenderer();

    const result = await submitForm({
      tenantId: "tenant-1",
      entityGuid: "entity-1",
      formType: "update-individual",
      formData: {},
    });

    expect(result.success).toBe(false);
    expect(result.submissionGuid).toBeUndefined();
    expect(submitError.value).toBe("Network error");
  });

  it("clears previous error on new submission", async () => {
    mockPost.mockRejectedValueOnce(new Error("First error"));

    const { submitForm, submitError } = useFormRenderer();

    await submitForm({
      tenantId: "tenant-1",
      entityGuid: "entity-1",
      formType: "update-individual",
      formData: {},
    });

    expect(submitError.value).toBe("First error");

    mockPost.mockResolvedValueOnce({ data: { review: {} } });

    await submitForm({
      tenantId: "tenant-1",
      entityGuid: "entity-1",
      formType: "update-individual",
      formData: {},
    });

    expect(submitError.value).toBeNull();
  });

  it("falls back to agentPayload.id when email is missing", async () => {
    mockAgentPayload = { id: "agent-1", role: "USER", tenantIds: ["tenant-1"] };
    mockPost.mockResolvedValueOnce({ data: { review: {} } });

    const { submitForm } = useFormRenderer();

    await submitForm({
      tenantId: "tenant-1",
      entityGuid: "entity-1",
      formType: "update-individual",
      formData: {},
    });

    const submission: FormSubmission = mockPost.mock.calls[0][1].formData;
    expect(submission.userId).toBe("agent-1");
  });

  it("falls back to 'unknown' when agentPayload is null", async () => {
    mockAgentPayload = null;
    mockPost.mockResolvedValueOnce({ data: { review: {} } });

    const { submitForm } = useFormRenderer();

    await submitForm({
      tenantId: "tenant-1",
      entityGuid: "entity-1",
      formType: "update-individual",
      formData: {},
    });

    const submission: FormSubmission = mockPost.mock.calls[0][1].formData;
    expect(submission.userId).toBe("unknown");
  });

  it("generates new entityGuid for empty string entityGuid", async () => {
    mockPost.mockResolvedValueOnce({ data: { review: {} } });

    const { submitForm } = useFormRenderer();

    const result = await submitForm({
      tenantId: "tenant-1",
      entityGuid: "",
      formType: "create-individual",
      formData: { name: "Jane" },
    });

    const submission: FormSubmission = mockPost.mock.calls[0][1].formData;
    // Empty string is falsy, so a new UUID should be generated
    expect(submission.entityGuid).toBe("mock-uuid-1");
    expect(result.entityGuid).toBe("mock-uuid-1");
  });

  it("uses fallback message for non-Error rejection", async () => {
    mockPost.mockRejectedValueOnce({ response: { status: 500 } });

    const { submitForm, submitError } = useFormRenderer();

    const result = await submitForm({
      tenantId: "tenant-1",
      entityGuid: "entity-1",
      formType: "update-individual",
      formData: {},
    });

    expect(result.success).toBe(false);
    expect(submitError.value).toBe("Submission failed");
  });
});
