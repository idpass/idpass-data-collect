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

/** Concepts surfaced by this narrow mirror. */
export type PublicSchemaConcept = "Person" | "Group" | "Identifier";

/** A Form.io component — subset used by the generator. */
export interface FormioComponent {
  key: string;
  label: string;
  type: string;
  input?: boolean;
  tooltip?: string;
  validate?: { required?: boolean };
  data?: { values: Array<{ value: string; label: string }> };
  format?: string;
  enableTime?: boolean;
  components?: FormioComponent[];
  [extra: string]: unknown;
}

/** A minimal Form.io display-form schema. */
export interface FormioSchema {
  display: "form";
  components: FormioComponent[];
}

/** Output of generateForm(). */
export interface GeneratedForm {
  id: string;
  name: string;
  title: string;
  entityType: "individual" | "group";
  formio: FormioSchema;
  metadata: {
    publicSchemaVersion: string;
    concept: PublicSchemaConcept;
    generatedAt: string;
  };
}
