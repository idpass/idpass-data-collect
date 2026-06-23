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

import type { Request } from "express";
import { resolvePublicBaseUrl } from "../publicArtifacts";

// Builds a minimal Express-like request. `hostname` is what Express resolves
// after applying the `trust proxy` setting — i.e. with `trust proxy` enabled it
// already reflects X-Forwarded-Host, which is exactly the poisoning vector.
function makeReq(opts: {
  hostname?: string;
  protocol?: string;
  localPort?: number;
  headers?: Record<string, string>;
}): Request {
  const headers = opts.headers ?? {};
  return {
    hostname: opts.hostname ?? "127.0.0.1",
    protocol: opts.protocol ?? "http",
    socket: { localPort: opts.localPort ?? 3000 },
    get: (name: string) => headers[name.toLowerCase()],
  } as unknown as Request;
}

describe("resolvePublicBaseUrl", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.PUBLIC_BASE_URL;
    delete process.env.RAILWAY_PUBLIC_DOMAIN;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it("uses PUBLIC_BASE_URL when set, stripping trailing slashes", () => {
    process.env.PUBLIC_BASE_URL = "https://dc.example.org/";
    const url = resolvePublicBaseUrl(makeReq({ hostname: "evil.example" }));
    expect(url).toBe("https://dc.example.org");
  });

  it("ignores an attacker X-Forwarded-Host header when PUBLIC_BASE_URL is set", () => {
    process.env.PUBLIC_BASE_URL = "https://dc.example.org";
    const url = resolvePublicBaseUrl(
      makeReq({ hostname: "127.0.0.1", headers: { "x-forwarded-host": "attacker.example" } }),
    );
    expect(url).toBe("https://dc.example.org");
  });

  it("uses RAILWAY_PUBLIC_DOMAIN over HTTPS when set", () => {
    process.env.RAILWAY_PUBLIC_DOMAIN = "myapp.up.railway.app";
    const url = resolvePublicBaseUrl(makeReq({ hostname: "evil.example" }));
    expect(url).toBe("https://myapp.up.railway.app");
  });

  it("falls back to the request host for loopback dev requests", () => {
    const url = resolvePublicBaseUrl(makeReq({ hostname: "127.0.0.1", localPort: 4567 }));
    expect(url).toBe("http://127.0.0.1:4567");
  });

  it("does NOT trust X-Forwarded-Host for the dev fallback (H29)", () => {
    // hostname stays loopback; the forwarded header must be ignored entirely.
    const url = resolvePublicBaseUrl(
      makeReq({ hostname: "127.0.0.1", localPort: 4567, headers: { "x-forwarded-host": "attacker.example" } }),
    );
    expect(url).toBe("http://127.0.0.1:4567");
    expect(url).not.toContain("attacker.example");
  });

  it("fails closed for a non-loopback request host with no configured base URL (H31)", () => {
    // With `trust proxy`, a forged Host/X-Forwarded-Host surfaces as req.hostname.
    expect(() => resolvePublicBaseUrl(makeReq({ hostname: "attacker.example" }))).toThrow(
      /trusted public base URL/i,
    );
  });

  it("omits the port for default ports on loopback", () => {
    expect(resolvePublicBaseUrl(makeReq({ hostname: "localhost", protocol: "http", localPort: 80 }))).toBe(
      "http://localhost",
    );
    expect(resolvePublicBaseUrl(makeReq({ hostname: "localhost", protocol: "https", localPort: 443 }))).toBe(
      "https://localhost",
    );
  });
});
