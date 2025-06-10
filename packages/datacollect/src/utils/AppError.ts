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

/**
 * Custom error class for DataCollect application-specific errors.
 *
 * Extends the standard JavaScript Error class with additional properties
 * for error categorization and contextual information. This enables
 * structured error handling throughout the application.
 *
 * Key features:
 * - **Error Codes**: Standardized error codes for programmatic handling
 * - **Contextual Details**: Additional error context for debugging
 * - **Consistent Structure**: Uniform error format across the application
 * - **Stack Traces**: Inherits standard JavaScript error stack traces
 *
 * @example
 * Basic usage:
 * ```typescript
 * throw new AppError('ENTITY_NOT_FOUND', 'Entity with ID 123 not found');
 * ```
 *
 * @example
 * With detailed context:
 * ```typescript
 * throw new AppError(
 *   'VALIDATION_ERROR',
 *   'Form submission validation failed',
 *   {
 *     field: 'email',
 *     value: 'invalid-email',
 *     expectedFormat: 'user@domain.com'
 *   }
 * );
 * ```
 *
 * @example
 * Error handling:
 * ```typescript
 * try {
 *   await entityStore.getEntity('nonexistent-id');
 * } catch (error) {
 *   if (error instanceof AppError) {
 *     switch (error.code) {
 *       case 'ENTITY_NOT_FOUND':
 *         console.log('Entity does not exist');
 *         break;
 *       case 'VALIDATION_ERROR':
 *         console.log('Invalid input:', error.details);
 *         break;
 *       default:
 *         console.error('Application error:', error.message);
 *     }
 *   } else {
 *     console.error('Unexpected error:', error);
 *   }
 * }
 * ```
 */
export class AppError extends Error {
  /**
   * Creates a new AppError instance.
   *
   * @param code - Standardized error code for programmatic handling
   * @param message - Human-readable error description
   * @param details - Optional additional context about the error
   *
   * @example
   * ```typescript
   * // Simple error
   * const error = new AppError('SYNC_FAILED', 'Network connection failed');
   *
   * // Error with context
   * const validationError = new AppError(
   *   'INVALID_FORM_DATA',
   *   'Required fields are missing',
   *   { missingFields: ['name', 'email'] }
   * );
   * ```
   */
  constructor(
    /** Standardized error code for programmatic error handling */
    public code: string,
    /** Human-readable error message */
    message: string,
    /** Optional additional context and debugging information */
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
  }
}
