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

import type { Config, EntityForm } from './dynamicFormIoUtils'

/**
 * Determine whether GPS location should be captured for a given form.
 *
 * Per-form `captureLocation` overrides the tenant-level
 * `captureSubmissionLocation`. When neither is set, defaults to false.
 */
export function shouldCaptureLocation(tenantConfig: Config, entityForm: EntityForm): boolean {
  if (entityForm.captureLocation !== undefined) {
    return entityForm.captureLocation
  }
  return tenantConfig.captureSubmissionLocation ?? false
}
