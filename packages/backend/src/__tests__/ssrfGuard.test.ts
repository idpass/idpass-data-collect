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

import dns from "dns/promises";
import { isBlockedExternalUrl } from "../routes/opensppFieldRoutes";

jest.mock("dns/promises", () => ({ __esModule: true, default: { lookup: jest.fn() } }));
const mockLookup = dns.lookup as unknown as jest.Mock;

describe("isBlockedExternalUrl — SSRF guard", () => {
  afterEach(() => jest.clearAllMocks());

  // IP literals are checked without DNS, so these are hermetic.
  describe.each([
    ["cloud metadata", "http://169.254.169.254/latest/meta-data/"],
    ["gcp metadata host", "http://metadata.google.internal/"],
    ["localhost name", "http://localhost:8080/"],
    ["loopback .1", "http://127.0.0.1/"],
    ["loopback (whole /8)", "http://127.0.0.5/"],
    ["loopback via decimal", "http://2130706433/"],
    ["loopback via hex", "http://0x7f000001/"],
    ["loopback via short form", "http://127.1/"],
    ["rfc1918 10/8", "http://10.1.2.3/"],
    ["rfc1918 172.16/12", "http://172.20.0.1/"],
    ["rfc1918 192.168/16", "http://192.168.1.1/"],
    ["link-local 169.254/16", "http://169.254.1.1/"],
    ["cgnat 100.64/10", "http://100.100.0.1/"],
    ["this-network 0/8", "http://0.0.0.0/"],
    ["ipv6 loopback", "http://[::1]/"],
    ["ipv6 ULA fc00::/7", "http://[fd12:3456::1]/"],
    ["ipv6 link-local fe80::/10", "http://[fe80::1]/"],
    ["ipv4-mapped ipv6", "http://[::ffff:127.0.0.1]/"],
    ["non-http scheme", "ftp://example.com/"],
    ["file scheme", "file:///etc/passwd"],
    ["garbage", "not a url"],
  ])("blocks %s", (_label, url) => {
    it("returns true", async () => {
      await expect(isBlockedExternalUrl(url)).resolves.toBe(true);
    });
  });

  describe("public IP literals are allowed", () => {
    it.each([["http://8.8.8.8/"], ["http://1.1.1.1/"], ["https://93.184.216.34/"]])(
      "allows %s",
      async (url) => {
        await expect(isBlockedExternalUrl(url)).resolves.toBe(false);
      },
    );
  });

  describe("hostname resolution (DNS-rebinding mitigation)", () => {
    it("allows a hostname that resolves to a public address", async () => {
      mockLookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
      await expect(isBlockedExternalUrl("https://openspp.example.org/")).resolves.toBe(false);
      expect(mockLookup).toHaveBeenCalledWith("openspp.example.org", { all: true });
    });

    it("blocks a hostname that resolves to a private address", async () => {
      mockLookup.mockResolvedValue([{ address: "10.0.0.5", family: 4 }]);
      await expect(isBlockedExternalUrl("https://rebind.attacker.test/")).resolves.toBe(true);
    });

    it("blocks when ANY resolved address is internal (mixed A records)", async () => {
      mockLookup.mockResolvedValue([
        { address: "93.184.216.34", family: 4 },
        { address: "127.0.0.1", family: 4 },
      ]);
      await expect(isBlockedExternalUrl("https://mixed.attacker.test/")).resolves.toBe(true);
    });

    it("blocks an unresolvable hostname", async () => {
      mockLookup.mockRejectedValue(new Error("ENOTFOUND"));
      await expect(isBlockedExternalUrl("https://does-not-resolve.invalid/")).resolves.toBe(true);
    });
  });
});
