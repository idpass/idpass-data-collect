# Documentation Best Practices

This document outlines the best practices for documenting packages in the ID PASS Data Collect ecosystem. These guidelines are based on experience documenting the core components and are designed to ensure high-quality, maintainable, and developer-friendly documentation.

## Philosophy: Quality Over Quantity

Our documentation approach prioritizes **quality over quantity**. We focus on:

- **Practical value** - Documentation should help developers understand and use the code effectively
- **Accuracy** - All examples should be working, realistic code patterns
- **Context** - Explain not just what the code does, but why and how it fits into the larger system
- **Maintainability** - Documentation should be easy to keep up-to-date as code evolves

## JSDoc Standards

### Class-Level Documentation

Every public class should have comprehensive class-level documentation including:

```typescript
/**
 * Brief description of the class purpose and role.
 * 
 * Detailed explanation of what the class does, its key features,
 * and how it fits into the broader system architecture.
 * 
 * Key features:
 * - **Feature 1**: Description of what it does
 * - **Feature 2**: Description with emphasis on important aspects
 * - **Feature 3**: Another key capability
 * 
 * Architecture notes:
 * - Explain design patterns used (e.g., Strategy, Observer)
 * - Describe relationships with other components
 * - Note important architectural decisions
 * 
 * @example
 * Basic usage:
 * ```typescript
 * // Show realistic, working example
 * const instance = new ClassName(dependencies);
 * const result = await instance.primaryMethod(params);
 * ```
 * 
 * @example
 * Advanced usage:
 * ```typescript
 * // Show more complex scenarios
 * const advanced = new ClassName(config);
 * // Multiple step example
 * ```
 */
export class ClassName {
```

**Requirements:**
- Start with a clear, one-sentence description
- Include 3-5 key features as bullet points
- Provide architectural context
- Include 2-3 practical examples
- Use realistic parameters and variable names

### Method Documentation

#### Public Methods

All public methods must be documented with:

```typescript
/**
 * Clear description of what the method does and its purpose.
 * 
 * Detailed explanation of the method's behavior, including:
 * - What operations it performs
 * - Any side effects or state changes
 * - How it interacts with other components
 * - Important implementation details users should know
 * 
 * @param paramName - Description of parameter purpose and expected format
 * @param optionalParam - Optional parameter description with default behavior
 * @returns Description of return value and its structure
 * @throws {ErrorType} When this error occurs and why
 * 
 * @example
 * ```typescript
 * // Show typical usage with realistic data
 * const result = await instance.methodName('realistic-param');
 * console.log('Result:', result);
 * ```
 * 
 * @example
 * Error handling:
 * ```typescript
 * try {
 *   await instance.methodName(invalidParam);
 * } catch (error) {
 *   if (error instanceof SpecificError) {
 *     // Handle specific error case
 *   }
 * }
 * ```
 */
async methodName(paramName: string, optionalParam?: number): Promise<ResultType> {
```

#### Private Methods

Private methods should be documented when they:
- Implement complex algorithms
- Handle critical business logic
- Are used by multiple public methods
- Have non-obvious behavior

```typescript
/**
 * Brief description of the private method's purpose.
 * 
 * Explanation of why this method exists and how it supports
 * the public API. Include algorithm details if complex.
 * 
 * @param param - Parameter description
 * @returns What the method returns
 * 
 * @private
 * 
 * TODO: Note any planned improvements or known limitations
 */
private internalMethod(param: string): ReturnType {
```

### Interface Documentation

Every interface should be documented with context and examples:

```typescript
/**
 * Interface description explaining its role in the system.
 * 
 * Detailed explanation of when and how this interface is used,
 * what it represents in the domain model, and any important
 * constraints or relationships.
 * 
 * @example
 * ```typescript
 * const example: InterfaceName = {
 *   property1: 'realistic-value',
 *   property2: 42,
 *   optional?: 'when-provided'
 * };
 * ```
 */
export interface InterfaceName {
  /** Clear description of what this property represents */
  property1: string;
  /** Description including valid ranges, formats, or constraints */
  property2: number;
  /** Optional property with description of when it's used */
  optional?: string;
}
```

### Type Documentation

Document complex types and enums:

```typescript
/**
 * Enum description explaining the different states/values.
 * 
 * @example
 * ```typescript
 * const currentState = StatusEnum.ACTIVE;
 * if (currentState === StatusEnum.PENDING) {
 *   // Handle pending state
 * }
 * ```
 */
export enum StatusEnum {
  /** Description of what this state means */
  PENDING = 'pending',
  /** When this state is used */
  ACTIVE = 'active',
  /** Conditions that lead to this state */
  COMPLETE = 'complete'
}
```

## Documentation Content Standards

### Examples

**All examples must be:**
- **Working code** - Test examples to ensure they compile and run
- **Realistic** - Use meaningful variable names and realistic data
- **Complete** - Include necessary imports, error handling, and setup
- **Progressive** - Start simple, then show advanced usage

**Example Quality Standards:**

```typescript
// ❌ Poor example
/**
 * @example
 * ```typescript
 * const x = new Thing();
 * x.doSomething();
 * ```
 */

// ✅ Good example
/**
 * @example
 * ```typescript
 * const userManager = new UserManager(database, logger);
 * 
 * const newUser = await userManager.createUser({
 *   email: 'john.doe@example.com',
 *   name: 'John Doe',
 *   role: UserRole.ADMIN
 * });
 * 
 * console.log(`Created user: ${newUser.id}`);
 * ```
 */
```

### Error Documentation

Document all public errors and when they occur:

```typescript
/**
 * @throws {ValidationError} When input data fails validation rules
 * @throws {NotFoundError} When the requested entity doesn't exist
 * @throws {PermissionError} When user lacks required permissions
 */
async updateUser(id: string, data: UserData): Promise<User> {
```

### TODO Comments

Use TODO comments for:
- Known limitations that should be addressed
- Performance optimizations planned
- Features that could be added
- Security considerations to implement

```typescript
/**
 * @private
 * 
 * TODO: Implement caching to improve performance for repeated calls
 * TODO: Add input validation for edge cases
 * TODO: Consider implementing retry logic for network failures
 */
```

## Architecture Documentation

### Component Relationships

Explain how components interact:

```typescript
/**
 * Architecture:
 * - Uses the Strategy pattern for pluggable event processors
 * - Integrates with EntityStore for persistence
 * - Delegates to EventStore for audit trails
 * - Supports Observer pattern for sync notifications
 */
```

### Design Patterns

Document design patterns used:

```typescript
/**
 * This class implements the Command pattern where FormSubmissions
 * represent commands that modify entity state. Each command is:
 * - Validated before execution
 * - Stored for audit purposes  
 * - Applied through event sourcing
 * - Reversible through event replay
 */
```

## Package-Specific Guidelines

### DataCollect Package

For the DataCollect package specifically:

1. **Event Sourcing Context** - Always explain how methods relate to events and entities
2. **Offline Capabilities** - Document offline behavior and sync implications
3. **CQRS Pattern** - Explain command vs query separation
4. **Storage Adapters** - Document which storage systems are supported

### Backend Package

For the Backend package:

1. **API Endpoints** - Document HTTP methods, parameters, and responses
2. **Authentication** - Explain JWT requirements and user roles
3. **Multi-tenant** - Document how tenant isolation works
4. **Database Schema** - Reference table structures and relationships

### Admin Package

For the Admin package:

1. **Vue Components** - Document props, events, and slots
2. **State Management** - Explain Pinia store interactions
3. **API Integration** - Show how components connect to backend
4. **User Workflows** - Document complete user interaction patterns

## Documentation Review Checklist

Before merging documentation changes, verify:

- [ ] **Accuracy** - All examples compile and run correctly
- [ ] **Completeness** - All public APIs are documented
- [ ] **Consistency** - Follows established patterns and style
- [ ] **Context** - Explains architectural relationships
- [ ] **Examples** - Include realistic, working code samples
- [ ] **Parameters** - All parameters and return values documented
- [ ] **Errors** - Exception conditions are explained
- [ ] **TODOs** - Known limitations are noted for future work

## Tools and Automation

### TypeDoc Generation

Configure TypeDoc to generate API documentation from JSDoc comments:

```json
{
  "typedoc": {
    "entryPoints": ["src/index.ts"],
    "out": "docs/api",
    "excludePrivate": false,
    "includeVersion": true,
    "sort": ["source-order"]
  }
}
```

### Documentation Testing

Test documentation examples:

```bash
# Extract and test code examples from JSDoc
npm run docs:test

# Generate API documentation
npm run docs:build

# Serve documentation locally
npm run docs:serve
```

### Linting

Use ESLint rules for documentation quality:

```json
{
  "rules": {
    "valid-jsdoc": "error",
    "require-jsdoc": ["error", {
      "require": {
        "FunctionDeclaration": true,
        "MethodDefinition": true,
        "ClassDeclaration": true
      }
    }]
  }
}
```

## Maintenance Guidelines

### Keeping Documentation Current

1. **Code Reviews** - Require documentation updates with code changes
2. **Regular Audits** - Quarterly review of documentation accuracy
3. **Example Testing** - Automated testing of documentation examples
4. **User Feedback** - Collect and address documentation issues from users

### Version Management

1. **Breaking Changes** - Update examples when APIs change
2. **Deprecation** - Document deprecated methods with migration paths
3. **New Features** - Add documentation before feature release
4. **Version Notes** - Tag documentation with version information

## Conclusion

High-quality documentation is essential for the success of the ID PASS Data Collect project and its goal of becoming a Digital Public Good. By following these best practices, we ensure that:

- Developers can quickly understand and use our packages
- The codebase remains maintainable as it grows
- New contributors can effectively join the project
- The project meets the documentation standards expected of open source digital public goods

Remember: **Quality over quantity**. It's better to have thoroughly documented core components than superficial documentation across all files.