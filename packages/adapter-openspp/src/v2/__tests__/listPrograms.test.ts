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

import type { AxiosInstance } from "axios";
import MockAdapter from "axios-mock-adapter";
import { OpenSppV2Client } from "../OpenSppV2Client";

const BASE = "http://openspp.test";

const TOKEN_RESPONSE = {
  access_token: "tok",
  token_type: "Bearer",
  expires_in: 3600,
};

function buildClient(): { client: OpenSppV2Client; mock: MockAdapter } {
  const client = new OpenSppV2Client({
    baseUrl: BASE,
    clientId: "c",
    clientSecret: "s",
  });
  const httpClient = (
    client as unknown as { httpClient: AxiosInstance }
  ).httpClient;
  const mock = new MockAdapter(httpClient);
  mock.onPost("/api/v2/spp/oauth/token").reply(200, TOKEN_RESPONSE);
  return { client, mock };
}

describe("OpenSppV2Client.listPrograms", () => {
  let client: OpenSppV2Client;
  let mockAxios: MockAdapter;

  afterEach(() => {
    mockAxios.restore();
  });

  it("returns mapped programs from /Program with real V2 shape", async () => {
    ({ client, mock: mockAxios } = buildClient());
    mockAxios.onGet("/api/v2/spp/Program").reply(200, {
      data: [
        {
          type: "Program",
          identifier: [{ system: "urn:openspp:program", value: "widow-disability" }],
          active: true,
          name: "Widow Disability Support",
          programType: {
            coding: [
              { system: "urn:openspp:vocab:program-type", code: "cash-transfer" },
            ],
          },
          targetType: "individual",
        },
        {
          type: "Program",
          identifier: [{ system: "urn:openspp:program", value: "ect-2024" }],
          active: false,
          name: "Elderly Cash Transfer (closed)",
          targetType: "individual",
        },
      ],
      meta: { total: 2, count: 2, offset: 0 },
      links: { self: "" },
    });

    const result = await client.listPrograms({ status: "active" });

    expect(result.programs).toHaveLength(2);
    expect(result.programs[0]).toEqual({
      id: undefined,
      identifier: "urn:openspp:program|widow-disability",
      name: "Widow Disability Support",
      code: "cash-transfer",
      state: "active",
      targetType: "individual",
    });
    // active:false maps to state:ended
    expect(result.programs[1].state).toBe("ended");
    expect(result.hasMore).toBe(false);
    expect(result.nextLastId).toBeUndefined();
  });

  it("parses numeric identifier value into id when present", async () => {
    ({ client, mock: mockAxios } = buildClient());
    mockAxios.onGet("/api/v2/spp/Program").reply(200, {
      data: [
        {
          type: "Program",
          identifier: [{ system: "urn:openspp:program:pk", value: "42" }],
          active: true,
          name: "Tagged Program",
          targetType: "individual",
        },
      ],
      meta: { total: 1, count: 1, offset: 0 },
      links: {},
    });

    const result = await client.listPrograms();

    expect(result.programs[0].id).toBe(42);
    expect(result.programs[0].identifier).toBe("urn:openspp:program:pk|42");
  });

  it("hasMore stays false when last item lacks numeric identifier (cursor unavailable)", async () => {
    ({ client, mock: mockAxios } = buildClient());
    const data = Array.from({ length: 100 }, (_, i) => ({
      type: "Program",
      identifier: [{ system: "urn:openspp:program", value: `program-${i + 1}` }],
      active: true,
      name: `Program ${i + 1}`,
      targetType: "individual",
    }));
    mockAxios.onGet("/api/v2/spp/Program").reply(200, {
      data,
      meta: { total: 250, count: 100, offset: 0 },
      links: {},
    });

    const result = await client.listPrograms();

    // Page is exactly `count` but no numeric cursor → adapter stops paging.
    expect(result.hasMore).toBe(false);
    expect(result.nextLastId).toBeUndefined();
  });

  it("hasMore + nextLastId set when last item has a numeric identifier", async () => {
    ({ client, mock: mockAxios } = buildClient());
    const data = Array.from({ length: 100 }, (_, i) => ({
      type: "Program",
      identifier: [{ system: "urn:openspp:program:pk", value: String(i + 1) }],
      active: true,
      name: `Program ${i + 1}`,
      targetType: "individual",
    }));
    mockAxios.onGet("/api/v2/spp/Program").reply(200, {
      data,
      meta: { total: 250, count: 100, offset: 0 },
      links: {},
    });

    const result = await client.listPrograms();

    expect(result.hasMore).toBe(true);
    expect(result.nextLastId).toBe(100);
  });

  it("passes name filter through as ilike query param", async () => {
    ({ client, mock: mockAxios } = buildClient());
    let seenParams: Record<string, unknown> | undefined;
    mockAxios.onGet("/api/v2/spp/Program").reply((config) => {
      seenParams = config.params as Record<string, unknown>;
      return [
        200,
        { data: [], meta: { total: 0, count: 0, offset: 0 }, links: {} },
      ];
    });

    await client.listPrograms({ name: "widow" });

    expect(seenParams).toBeDefined();
    expect(seenParams!.name).toBe("widow");
    expect(seenParams!._count).toBe(100);
  });
});
