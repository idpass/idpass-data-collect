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
import { createLogger } from "./logger";

const log = createLogger("publicArtifacts");

const PUBLIC_FOLDER = path.join(__dirname, "..", "public", "artifacts");

export interface PublicArtifactPaths {
  jsonPath: string;
  qrPath: string;
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function resolvePublicBaseUrl(req: Request): string {
  // Trusted, explicit configuration — required for any non-local deployment.
  const configured = process.env.PUBLIC_BASE_URL?.trim();
  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  // Railway's public domain (when behind Railway's proxy). Railway always uses
  // HTTPS for public domains.
  const railwayPublicDomain = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
  if (railwayPublicDomain) {
    return `https://${railwayPublicDomain.replace(/\/+$/, "")}`;
  }

  // No trusted base URL is configured. This value is persisted into the public
  // artifact (syncServerUrl + QR target), so it must NOT be derived from
  // client-controllable host headers (Host / X-Forwarded-Host): an attacker who
  // can reach an artifact endpoint could otherwise repoint onboarding at their
  // own sync server. Accept the request host only when it is loopback (local
  // development); for anything else, fail closed and require explicit config.
  const hostname = req.hostname;
  if (!LOOPBACK_HOSTS.has(hostname)) {
    throw new Error(
      "Cannot resolve a trusted public base URL. Set PUBLIC_BASE_URL (or RAILWAY_PUBLIC_DOMAIN) for non-local deployments.",
    );
  }

  const protocol = req.protocol;
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
    log.error({ err: qrError, artifactId: appConfig.artifactId }, "Failed to generate QR code");
    throw new Error(`Failed to generate QR code: ${qrError instanceof Error ? qrError.message : 'Unknown error'}`);
  }

  return { jsonPath, qrPath };
}
