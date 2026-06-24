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

import fs from "fs/promises";
import { generatePublicArtifacts, getPublicArtifactPaths } from "../publicArtifacts";
import { AppConfig } from "../types";

const ARTIFACT_ID = "test-entitydata-strip";

function configWithBeneficiaryData(): AppConfig {
  return {
    id: "tenant-a",
    name: "Demo Registry",
    artifactId: ARTIFACT_ID,
    selfService: { enabled: true, authMethods: ["id", "otp"] },
    entityForms: [{ name: "individual" }],
    entityData: [
      {
        name: "individual",
        data: [
          {
            id: "p-001",
            name: "Somsak Phanthavong",
            date_of_birth: "1985-03-15",
            national_id: "LA-1985-03150001",
            phone: "+856-20-1234567",
          },
        ],
      },
    ],
  } as unknown as AppConfig;
}

describe("generatePublicArtifacts — entityData stripping", () => {
  const { jsonPath, qrPath } = getPublicArtifactPaths(ARTIFACT_ID);

  afterEach(async () => {
    await fs.unlink(jsonPath).catch(() => {});
    await fs.unlink(qrPath).catch(() => {});
  });

  it("omits seeded beneficiary entityData (names, national IDs, DOB, phone) from the public artifact", async () => {
    await generatePublicArtifacts("http://localhost:3000", configWithBeneficiaryData());

    const written = await fs.readFile(jsonPath, "utf8");
    const parsed = JSON.parse(written);

    expect(parsed.entityData).toEqual([]);
    expect(written).not.toContain("Somsak Phanthavong");
    expect(written).not.toContain("LA-1985-03150001");
    expect(written).not.toContain("1985-03-15");
    expect(written).not.toContain("+856-20-1234567");
  });

  it("preserves non-sensitive onboarding fields and sets syncServerUrl", async () => {
    await generatePublicArtifacts("http://localhost:3000", configWithBeneficiaryData());

    const parsed = JSON.parse(await fs.readFile(jsonPath, "utf8"));
    expect(parsed.name).toBe("Demo Registry");
    expect(parsed.entityForms).toEqual([{ name: "individual" }]);
    expect(parsed.selfService).toEqual({ enabled: true, authMethods: ["id", "otp"] });
    expect(parsed.syncServerUrl).toBe("http://localhost:3000");
  });

  it("does not mutate the caller's config (server keeps its seed data)", async () => {
    const config = configWithBeneficiaryData();
    await generatePublicArtifacts("http://localhost:3000", config);
    expect(config.entityData?.[0].data[0].national_id).toBe("LA-1985-03150001");
  });
});
