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
import fs from "fs/promises";
import path from "path";
import qrcode from "qrcode";
import { cloneDeep, set } from "lodash";
import { AppConfig } from "../types";

const PUBLIC_FOLDER = path.join(__dirname, "..", "public", "artifacts");

export interface PublicArtifactPaths {
  jsonPath: string;
  qrPath: string;
}

export function resolvePublicBaseUrl(req: Request): string {
  const configured = process.env.PUBLIC_BASE_URL?.trim();
  if (configured) {
    return configured.replace(/\/+$/, "");
  }
  const protocol = req.protocol;
  const hostname = req.hostname;
  const port = req.socket.localPort;
  const isDefaultPort = (protocol === "http" && port === 80) || (protocol === "https" && port === 443);
  return `${protocol}://${hostname}${isDefaultPort ? "" : `:${port}`}`;
}

function assertValidArtifactId(artifactId: string) {
  if (!/^[a-zA-Z0-9_-]+$/.test(artifactId)) {
    throw new Error("Invalid artifact identifier");
  }
}

export function getPublicArtifactPaths(artifactId: string): PublicArtifactPaths {
  assertValidArtifactId(artifactId);
  return {
    jsonPath: path.join(PUBLIC_FOLDER, `${artifactId}.json`),
    qrPath: path.join(PUBLIC_FOLDER, `${artifactId}.png`),
  };
}

/**
 * Generates JSON and PNG public artifacts for a given app config.
 */
export async function generatePublicArtifacts(baseUrl: string, appConfig: AppConfig): Promise<PublicArtifactPaths> {
  if (!appConfig.artifactId) {
    throw new Error("Config artifactId is required to generate public artifacts");
  }

  await fs.mkdir(PUBLIC_FOLDER, { recursive: true });
  const { jsonPath, qrPath } = getPublicArtifactPaths(appConfig.artifactId);

  const publicConfig = cloneDeep(appConfig);
  set(publicConfig, "syncServerUrl", baseUrl);
  const publicJson = JSON.stringify(publicConfig, null, 2);

  await fs.writeFile(jsonPath, publicJson);
  const sanitizedBaseUrl = baseUrl.replace(/\/+$/, "");
  const publicJsonUrl = `${sanitizedBaseUrl}/artifacts/${appConfig.artifactId}.json`;
  
  try {
    await qrcode.toFile(qrPath, publicJsonUrl, {
      errorCorrectionLevel: 'M',
      type: 'png',
      margin: 1,
    });
  } catch (qrError) {
    console.error(`Failed to generate QR code for ${appConfig.artifactId}:`, qrError);
    throw new Error(`Failed to generate QR code: ${qrError instanceof Error ? qrError.message : 'Unknown error'}`);
  }

  return { jsonPath, qrPath };
}
