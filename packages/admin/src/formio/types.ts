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

// Narrow interface for the subset of the Form.io builder runtime API the
// admin app consumes. Defined locally rather than augmenting the published
// `@formio/js` types — that package re-exports `Formio` as a class and types
// `Formio.builder()` as `Promise<any>`, which collides with any augmentation
// we attempt. We cast at the call site (see FormioBuilder.vue).

export type FormioBuilderEvent =
  | 'change'
  | 'saveComponent'
  | 'updateComponent'
  | 'deleteComponent'
  | 'removeComponent'

export interface FormioBuilderInstance {
  schema: { components: unknown[]; [key: string]: unknown }
  setForm(schema: object): Promise<void>
  on(event: FormioBuilderEvent, handler: () => void): void
  destroy(): Promise<void> | void
}

// Narrow interface for the read-only renderer produced by `Formio.createForm`.
// Same rationale as FormioBuilderInstance: `@formio/js` types this as
// `Promise<any>`, so we cast at the call site (see FormioRenderer.vue).
export interface FormioFormInstance {
  destroy(): Promise<void> | void
}
