import { verifyOidcAccessToken } from "../verifyOidcAccessToken";

/**
 * H33: OIDC access tokens on sync routes were accepted on a userinfo 200 alone,
 * with no signature / issuer / audience / client binding. These tests cover the
 * replacement verifier: JWKS signature + issuer via jose, plus client/audience
 * binding, fail-closed when unconfigured. jose and fetch are mocked.
 */

const mockJwtVerify: jest.Mock = jest.fn();
const mockCreateRemoteJWKSet: jest.Mock = jest.fn(() => "JWKS-KEYSET");

jest.mock("jose", () => ({
  createRemoteJWKSet: (...args: unknown[]) => mockCreateRemoteJWKSet(...args),
  jwtVerify: (...args: unknown[]) => mockJwtVerify(...args),
}));

jest.mock("../../../utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

let fetchMock: jest.Mock;

const AUTHORITY = "https://issuer.example";

function mockDiscovery(jwksUri = `${AUTHORITY}/jwks`, issuer = AUTHORITY) {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ issuer, jwks_uri: jwksUri }),
  });
}

describe("verifyOidcAccessToken (H33)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it("accepts a token bound to the configured client via azp", async () => {
    mockDiscovery();
    mockJwtVerify.mockResolvedValueOnce({ payload: { sub: "u1", azp: "my-client" } });

    const ok = await verifyOidcAccessToken("tok", { authority: AUTHORITY, clientId: "my-client" });
    expect(ok).toBe(true);
    expect(mockJwtVerify).toHaveBeenCalledWith("tok", "JWKS-KEYSET", { issuer: AUTHORITY });
  });

  it("accepts a token whose aud contains the configured audience", async () => {
    mockDiscovery();
    mockJwtVerify.mockResolvedValueOnce({ payload: { sub: "u1", aud: ["my-api", "other"] } });

    const ok = await verifyOidcAccessToken("tok", { authority: AUTHORITY, audience: "my-api" });
    expect(ok).toBe(true);
  });

  it("rejects a token issued for a different client (foreign azp/aud)", async () => {
    mockDiscovery();
    mockJwtVerify.mockResolvedValueOnce({ payload: { sub: "u1", azp: "other-client", aud: "other-api" } });

    const ok = await verifyOidcAccessToken("tok", { authority: AUTHORITY, clientId: "my-client" });
    expect(ok).toBe(false);
  });

  it("fails closed when neither clientId nor audience is configured", async () => {
    const ok = await verifyOidcAccessToken("tok", { authority: AUTHORITY });
    expect(ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockJwtVerify).not.toHaveBeenCalled();
  });

  it("rejects when signature/issuer verification fails", async () => {
    mockDiscovery();
    mockJwtVerify.mockRejectedValueOnce(new Error("signature verification failed"));

    const ok = await verifyOidcAccessToken("tok", { authority: AUTHORITY, clientId: "my-client" });
    expect(ok).toBe(false);
  });

  it("rejects when the JWKS URI origin does not match the issuer (anti-spoof)", async () => {
    mockDiscovery("https://evil.example/jwks");

    const ok = await verifyOidcAccessToken("tok", { authority: AUTHORITY, clientId: "my-client" });
    expect(ok).toBe(false);
    expect(mockJwtVerify).not.toHaveBeenCalled();
  });

  it("fails closed when authority is missing", async () => {
    const ok = await verifyOidcAccessToken("tok", { clientId: "my-client" });
    expect(ok).toBe(false);
  });
});
