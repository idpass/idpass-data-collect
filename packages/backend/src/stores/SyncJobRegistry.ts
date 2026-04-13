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

import { ExternalSyncCredentials } from "@idpass/data-collect-core";

export interface ActiveJob {
  jobId: string;
  configId: string;
  abortController: AbortController;
  credentials?: ExternalSyncCredentials;
}

export class SyncJobRegistry {
  private activeJobs: Map<string, ActiveJob> = new Map();

  register(jobId: string, configId: string, credentials?: ExternalSyncCredentials): ActiveJob {
    const job: ActiveJob = {
      jobId,
      configId,
      abortController: new AbortController(),
      credentials,
    };
    this.activeJobs.set(jobId, job);
    return job;
  }

  getByJobId(jobId: string): ActiveJob | undefined {
    return this.activeJobs.get(jobId);
  }

  getByConfigId(configId: string): ActiveJob | undefined {
    for (const job of this.activeJobs.values()) {
      if (job.configId === configId) {
        return job;
      }
    }
    return undefined;
  }

  cancel(jobId: string): boolean {
    const job = this.activeJobs.get(jobId);
    if (!job) return false;
    job.abortController.abort();
    return true;
  }

  remove(jobId: string): void {
    this.activeJobs.delete(jobId);
  }
}
