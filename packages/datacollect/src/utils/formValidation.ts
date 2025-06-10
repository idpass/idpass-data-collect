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

import { FormSubmission } from "../interfaces/types";
import { AppError } from "./AppError";

/**
 * Validates form submission data to ensure all required fields are present and valid.
 * 
 * This function performs comprehensive validation of FormSubmission objects before
 * they are processed by the event sourcing system. It ensures data integrity and
 * provides clear error messages for validation failures.
 * 
 * Validation rules:
 * - **guid**: Must be present (unique identifier for the form submission)
 * - **entityGuid**: Must be present (identifies the target entity)
 * - **type**: Must be present (specifies the event type)
 * - **data**: Must be present and non-empty object (contains the event payload)
 * - **timestamp**: Must be present (ISO timestamp when event was created)
 * - **userId**: Must be present (identifies the user who created the event)
 * 
 * @param formData - Form submission object to validate
 * @throws {AppError} When any required field is missing or invalid
 * 
 * @example
 * Valid form submission:
 * ```typescript
 * const validForm: FormSubmission = {
 *   guid: 'form-123',
 *   entityGuid: 'person-456',
 *   type: 'create-individual',
 *   data: { name: 'John Doe', age: 30 },
 *   timestamp: '2024-01-01T12:00:00Z',
 *   userId: 'user-789',
 *   syncLevel: SyncLevel.LOCAL
 * };
 * 
 * try {
 *   validateFormSubmission(validForm);
 *   console.log('Form is valid');
 * } catch (error) {
 *   console.error('Validation failed:', error.message);
 * }
 * ```
 * 
 * @example
 * Handling validation errors:
 * ```typescript
 * const invalidForm = { 
 *   // Missing required fields
 *   data: { name: 'John' }
 * };
 * 
 * try {
 *   validateFormSubmission(invalidForm as FormSubmission);
 * } catch (error) {
 *   if (error instanceof AppError && error.code === 'INVALID_FORM') {
 *     console.log('Form validation error:', error.message);
 *     // Show user-friendly validation message
 *   }
 * }
 * ```
 * 
 * @example
 * Pre-validation before event processing:
 * ```typescript
 * async function submitForm(formData: FormSubmission) {
 *   // Validate first
 *   validateFormSubmission(formData);
 *   
 *   // Then process
 *   await eventApplierService.submitForm(formData);
 * }
 * ```
 */
export function validateFormSubmission(formData: FormSubmission): void {
  if (!formData.guid) {
    throw new AppError("INVALID_FORM", "Form submission is missing a GUID");
  }
  if (!formData.entityGuid) {
    throw new AppError("INVALID_FORM", "Form submission is missing an entity GUID");
  }
  if (!formData.type) {
    throw new AppError("INVALID_FORM", "Form submission is missing a type");
  }
  if (!formData.data || Object.keys(formData.data).length === 0) {
    throw new AppError("INVALID_FORM", "Form submission has no data");
  }
  if (!formData.timestamp) {
    throw new AppError("INVALID_FORM", "Form submission is missing a timestamp");
  }
  if (!formData.userId) {
    throw new AppError("INVALID_FORM", "Form submission is missing a user ID");
  }
  // Add more specific validations based on form type if needed
}
