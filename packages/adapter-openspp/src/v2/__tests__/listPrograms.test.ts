import { OpenSppV2Client } from "../OpenSppV2Client";
import nock from "nock";

const BASE = "http://openspp.test";

function authMock() {
  return nock(BASE)
    .post("/api/v2/spp/oauth/token")
    .reply(200, { access_token: "tok", token_type: "Bearer", expires_in: 3600 });
}

describe("OpenSppV2Client.listPrograms", () => {
  beforeEach(() => nock.cleanAll());

  it("returns mapped programs from /Program", async () => {
    authMock();
    nock(BASE)
      .get("/api/v2/spp/Program")
      .query({ _count: 100, status: "active" })
      .reply(200, {
        data: [
          { id: 3, name: "Widow Disability Support", code: "widow-disability", state: "active", targetType: "individual" },
          { id: 7, name: "Elderly Cash Transfer", code: "ect-2024", state: "active", targetType: "individual" },
        ],
        meta: { total: 2, count: 2, offset: 0 },
        links: { self: "" },
      });
    const client = new OpenSppV2Client({ baseUrl: BASE, clientId: "c", clientSecret: "s" });
    const result = await client.listPrograms({ status: "active" });
    expect(result.programs).toHaveLength(2);
    expect(result.programs[0]).toEqual({
      id: 3, name: "Widow Disability Support", code: "widow-disability", state: "active", targetType: "individual",
    });
    expect(result.hasMore).toBe(false);
    expect(result.nextLastId).toBeUndefined();
  });

  it("flags hasMore + nextLastId when result fills the page", async () => {
    authMock();
    const data = Array.from({ length: 100 }, (_, i) => ({
      id: i + 1, name: `Program ${i + 1}`, state: "active", targetType: "individual",
    }));
    nock(BASE)
      .get("/api/v2/spp/Program")
      .query({ _count: 100 })
      .reply(200, { data, meta: { total: 250, count: 100, offset: 0 }, links: {} });
    const client = new OpenSppV2Client({ baseUrl: BASE, clientId: "c", clientSecret: "s" });
    const result = await client.listPrograms();
    expect(result.hasMore).toBe(true);
    expect(result.nextLastId).toBe(100);
  });

  it("passes name filter through as ilike query param", async () => {
    authMock();
    nock(BASE)
      .get("/api/v2/spp/Program")
      .query({ _count: 100, name: "widow" })
      .reply(200, { data: [], meta: { total: 0, count: 0, offset: 0 }, links: {} });
    const client = new OpenSppV2Client({ baseUrl: BASE, clientId: "c", clientSecret: "s" });
    await client.listPrograms({ name: "widow" });
  });
});
