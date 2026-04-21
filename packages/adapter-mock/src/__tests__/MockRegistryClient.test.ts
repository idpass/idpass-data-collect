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

jest.mock("../../../datacollect/src/utils/logger", () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn(),
    fatal: jest.fn(),
    child: jest.fn().mockReturnThis(),
  }),
}));

import axios from "axios";
import {
  AuthError,
  ConflictError,
  MockRegistryClient,
  NonRetryableError,
  NotFoundError,
  PreconditionFailedError,
  RetryableError,
} from "../MockRegistryClient";

jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

/** Minimal fake axios instance that tests can drive. */
function createMockInstance() {
  return {
    get: jest.fn(),
    post: jest.fn(),
    request: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  };
}

/** Build a fake JWT whose payload encodes the given exp (seconds). */
function makeJwt(expSeconds: number): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
    "base64url",
  );
  const payload = Buffer.from(JSON.stringify({ exp: expSeconds })).toString(
    "base64url",
  );
  return `${header}.${payload}.sig`;
}

describe("MockRegistryClient", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedAxios.isAxiosError = (((err: unknown) =>
      !!err && typeof err === "object" && (err as Record<string, unknown>).isAxiosError === true) as unknown) as typeof axios.isAxiosError;
  });

  describe("constructor", () => {
    it("throws without baseUrl", () => {
      expect(
        () =>
          new MockRegistryClient({
            baseUrl: "",
            clientId: "c",
            clientSecret: "s",
          }),
      ).toThrow("baseUrl is required");
    });

    it("throws without clientId", () => {
      expect(
        () =>
          new MockRegistryClient({
            baseUrl: "http://x",
            clientId: "",
            clientSecret: "s",
          }),
      ).toThrow("clientId is required");
    });

    it("normalizes trailing slash on baseUrl", () => {
      const instance = createMockInstance();
      mockedAxios.create.mockReturnValueOnce(instance as unknown as ReturnType<typeof axios.create>);

      new MockRegistryClient({
        baseUrl: "http://x/",
        clientId: "c",
        clientSecret: "s",
      });

      expect(mockedAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({ baseURL: "http://x" }),
      );
    });

    it("uses custom timeout", () => {
      const instance = createMockInstance();
      mockedAxios.create.mockReturnValueOnce(instance as unknown as ReturnType<typeof axios.create>);

      new MockRegistryClient({
        baseUrl: "http://x",
        clientId: "c",
        clientSecret: "s",
        timeout: 5000,
      });

      expect(mockedAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({ timeout: 5000 }),
      );
    });
  });

  describe("getToken", () => {
    it("fetches token on first call", async () => {
      const instance = createMockInstance();
      const exp = Math.floor(Date.now() / 1000) + 3600;
      instance.post.mockResolvedValue({
        data: { access_token: makeJwt(exp), token_type: "Bearer", expires_in: 3600 },
      });
      mockedAxios.create.mockReturnValueOnce(instance as unknown as ReturnType<typeof axios.create>);

      const client = new MockRegistryClient({
        baseUrl: "http://x",
        clientId: "c",
        clientSecret: "s",
      });

      const token = await client.getToken();
      expect(token).toBe(makeJwt(exp));
      // RFC 6749: token endpoint is form-encoded, not JSON.
      const [url, body, options] = instance.post.mock.calls[0];
      expect(url).toBe("/oauth/token");
      expect(body).toBeInstanceOf(URLSearchParams);
      expect((body as URLSearchParams).get("grant_type")).toBe("client_credentials");
      expect((body as URLSearchParams).get("client_id")).toBe("c");
      expect((body as URLSearchParams).get("client_secret")).toBe("s");
      expect(options).toMatchObject({
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
    });

    it("caches token across calls while valid", async () => {
      const instance = createMockInstance();
      const exp = Math.floor(Date.now() / 1000) + 3600;
      instance.post.mockResolvedValue({
        data: { access_token: makeJwt(exp), token_type: "Bearer", expires_in: 3600 },
      });
      mockedAxios.create.mockReturnValueOnce(instance as unknown as ReturnType<typeof axios.create>);

      const client = new MockRegistryClient({
        baseUrl: "http://x",
        clientId: "c",
        clientSecret: "s",
      });

      await client.getToken();
      await client.getToken();
      await client.getToken();
      expect(instance.post).toHaveBeenCalledTimes(1);
    });

    it("re-fetches token after expiry", async () => {
      const instance = createMockInstance();
      // First token expires immediately (exp in the past)
      const expiredExp = Math.floor(Date.now() / 1000) - 10;
      const freshExp = Math.floor(Date.now() / 1000) + 3600;
      instance.post
        .mockResolvedValueOnce({
          data: { access_token: makeJwt(expiredExp), token_type: "Bearer", expires_in: 0 },
        })
        .mockResolvedValueOnce({
          data: { access_token: makeJwt(freshExp), token_type: "Bearer", expires_in: 3600 },
        });
      mockedAxios.create.mockReturnValueOnce(instance as unknown as ReturnType<typeof axios.create>);

      const client = new MockRegistryClient({
        baseUrl: "http://x",
        clientId: "c",
        clientSecret: "s",
      });

      const first = await client.getToken();
      const second = await client.getToken();
      expect(first).toBe(makeJwt(expiredExp));
      expect(second).toBe(makeJwt(freshExp));
      expect(instance.post).toHaveBeenCalledTimes(2);
    });

    it("throws AuthError on 401 from token endpoint", async () => {
      const instance = createMockInstance();
      const axiosErr = Object.assign(new Error("Unauthorized"), {
        isAxiosError: true,
        response: { status: 401, data: { error: { message: "bad client" } } },
      });
      instance.post.mockRejectedValueOnce(axiosErr);
      mockedAxios.create.mockReturnValueOnce(instance as unknown as ReturnType<typeof axios.create>);

      const client = new MockRegistryClient({
        baseUrl: "http://x",
        clientId: "c",
        clientSecret: "s",
      });

      await expect(client.getToken()).rejects.toBeInstanceOf(AuthError);
    });

    it("clearToken forces re-auth on next call", async () => {
      const instance = createMockInstance();
      const exp = Math.floor(Date.now() / 1000) + 3600;
      instance.post.mockResolvedValue({
        data: { access_token: makeJwt(exp), token_type: "Bearer", expires_in: 3600 },
      });
      mockedAxios.create.mockReturnValueOnce(instance as unknown as ReturnType<typeof axios.create>);

      const client = new MockRegistryClient({
        baseUrl: "http://x",
        clientId: "c",
        clientSecret: "s",
      });

      await client.getToken();
      client.clearToken();
      await client.getToken();
      expect(instance.post).toHaveBeenCalledTimes(2);
    });
  });

  describe("error mapping", () => {
    function setupClientWithToken() {
      const instance = createMockInstance();
      const exp = Math.floor(Date.now() / 1000) + 3600;
      instance.post.mockResolvedValue({
        data: { access_token: makeJwt(exp), token_type: "Bearer", expires_in: 3600 },
      });
      mockedAxios.create.mockReturnValueOnce(instance as unknown as ReturnType<typeof axios.create>);
      const client = new MockRegistryClient({
        baseUrl: "http://x",
        clientId: "c",
        clientSecret: "s",
      });
      return { client, instance };
    }

    it("maps 401 to AuthError and clears token", async () => {
      const { client, instance } = setupClientWithToken();
      await client.getToken();
      expect(instance.post).toHaveBeenCalledTimes(1);

      const axiosErr = Object.assign(new Error("Unauthorized"), {
        isAxiosError: true,
        response: { status: 401, data: { error: { message: "token expired" } } },
      });
      instance.get.mockRejectedValueOnce(axiosErr);

      await expect(client.getPerson("uuid-1")).rejects.toBeInstanceOf(AuthError);

      // Next call triggers re-auth because token was cleared
      const exp = Math.floor(Date.now() / 1000) + 3600;
      instance.post.mockResolvedValueOnce({
        data: { access_token: makeJwt(exp), token_type: "Bearer", expires_in: 3600 },
      });
      instance.get.mockResolvedValueOnce({ data: { uuid: "uuid-1" } });
      await client.getPerson("uuid-1");
      expect(instance.post).toHaveBeenCalledTimes(2);
    });

    it("maps 404 to NotFoundError", async () => {
      const { client, instance } = setupClientWithToken();
      const axiosErr = Object.assign(new Error("Not Found"), {
        isAxiosError: true,
        response: { status: 404, data: { detail: "nope" } },
      });
      instance.get.mockRejectedValueOnce(axiosErr);

      await expect(client.getPerson("uuid-1")).rejects.toBeInstanceOf(NotFoundError);
    });

    it("maps 412 to PreconditionFailedError", async () => {
      const { client, instance } = setupClientWithToken();
      const axiosErr = Object.assign(new Error("Precondition"), {
        isAxiosError: true,
        response: { status: 412, data: { detail: "stale" } },
      });
      instance.request.mockRejectedValueOnce(axiosErr);

      await expect(
        client.updatePerson("uuid-1", { given_name: "x" }, "2020-01-01"),
      ).rejects.toBeInstanceOf(PreconditionFailedError);
    });

    it("maps 409 to ConflictError (not Precondition)", async () => {
      const { client, instance } = setupClientWithToken();
      const axiosErr = Object.assign(new Error("Conflict"), {
        isAxiosError: true,
        response: { status: 409, data: { detail: "dup" } },
      });
      instance.request.mockRejectedValueOnce(axiosErr);

      const err = await client.createPerson({}).catch((e) => e);
      expect(err).toBeInstanceOf(ConflictError);
      expect(err).not.toBeInstanceOf(PreconditionFailedError);
    });

    it("maps 5xx to RetryableError", async () => {
      const { client, instance } = setupClientWithToken();
      const axiosErr = Object.assign(new Error("Server error"), {
        isAxiosError: true,
        response: { status: 503, data: {} },
      });
      instance.get.mockRejectedValueOnce(axiosErr);

      await expect(client.listPersons()).rejects.toBeInstanceOf(RetryableError);
    });

    it("maps other 4xx to NonRetryableError", async () => {
      const { client, instance } = setupClientWithToken();
      const axiosErr = Object.assign(new Error("Bad"), {
        isAxiosError: true,
        response: { status: 422, data: { detail: "bad payload" } },
      });
      instance.request.mockRejectedValueOnce(axiosErr);

      await expect(client.createPerson({})).rejects.toBeInstanceOf(NonRetryableError);
    });

    it("maps network failure to RetryableError", async () => {
      const { client, instance } = setupClientWithToken();
      const axiosErr = Object.assign(new Error("ECONNREFUSED"), {
        isAxiosError: true,
        // no response
      });
      instance.get.mockRejectedValueOnce(axiosErr);

      await expect(client.listPersons()).rejects.toBeInstanceOf(RetryableError);
    });
  });

  describe("request shaping", () => {
    function setup() {
      const instance = createMockInstance();
      const exp = Math.floor(Date.now() / 1000) + 3600;
      instance.post.mockResolvedValue({
        data: { access_token: makeJwt(exp), token_type: "Bearer", expires_in: 3600 },
      });
      mockedAxios.create.mockReturnValueOnce(instance as unknown as ReturnType<typeof axios.create>);
      const client = new MockRegistryClient({
        baseUrl: "http://x",
        clientId: "c",
        clientSecret: "s",
      });
      return { client, instance };
    }

    it("listPersons forwards query params", async () => {
      const { client, instance } = setup();
      instance.get.mockResolvedValueOnce({
        data: { items: [], total: 0, limit: 50, offset: 0, next_offset: null },
      });

      await client.listPersons({ updatedSince: "2024-01-01", limit: 50, offset: 10 });

      expect(instance.get).toHaveBeenCalledWith(
        "/v1/persons",
        expect.objectContaining({
          params: { updated_since: "2024-01-01", limit: 50, offset: 10 },
          headers: expect.objectContaining({ Authorization: expect.stringContaining("Bearer ") }),
        }),
      );
    });

    it("updatePerson sends If-Match header", async () => {
      const { client, instance } = setup();
      instance.request.mockResolvedValueOnce({ data: { uuid: "u1" } });

      await client.updatePerson("u1", { given_name: "Ada" }, "2024-01-01T00:00:00Z");

      expect(instance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: "PATCH",
          url: "/v1/persons/u1",
          data: { given_name: "Ada" },
          headers: expect.objectContaining({
            "If-Match": "2024-01-01T00:00:00Z",
            Authorization: expect.stringContaining("Bearer "),
          }),
        }),
      );
    });

    it("addMember POSTs membership body", async () => {
      const { client, instance } = setup();
      instance.request.mockResolvedValueOnce({ data: { uuid: "g1" } });

      await client.addMember("g1", "p1", "head");

      expect(instance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: "POST",
          url: "/v1/groups/g1/members",
          data: { person_uuid: "p1", role: "head" },
        }),
      );
    });

    it("health does not require auth", async () => {
      const { client, instance } = setup();
      instance.get.mockResolvedValueOnce({ data: { status: "ok" } });

      const result = await client.health();

      expect(result.status).toBe("ok");
      expect(instance.post).not.toHaveBeenCalled(); // no token fetch
      // health request must not include Authorization
      expect(instance.get).toHaveBeenCalledWith("/health");
    });
  });
});
