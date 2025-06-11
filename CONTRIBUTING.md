# Contributing to ID PASS Data Collect

Thank you for your interest in contributing to ID PASS Data Collect! This document provides guidelines and instructions for contributing to the project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [How to Contribute](#how-to-contribute)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Documentation](#documentation)

## Code of Conduct

This project adheres to the Contributor Covenant [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behavior to [INSERT EMAIL].

## Getting Started

1. Fork the repository on GitHub
2. Clone your fork locally
3. Create a new branch for your contribution
4. Make your changes
5. Push to your fork and submit a pull request

## Development Setup

### Prerequisites

- Node.js 20.x
- PostgreSQL 15+ (for backend development)
- npm or yarn

### Initial Setup

1. Clone the repository:

```bash
git clone https://github.com/idpass/idpass-data-collect.git
cd idpass-data-collect
```

2. Install dependencies for all modules:

```bash
# Install root dependencies
npm install

# Build datacollect library first (required by backend)
cd packages/datacollect
npm install
npm run build
cd ../..

# Install backend dependencies
cd packages/backend
npm install
cd ../..

# Install admin dependencies
cd packages/admin
npm install
cd ../..

# Install mobile dependencies (optional)
cd packages/mobile
npm install
cd ../..
```

3. Set up environment variables:

```bash
# Copy example environment file
cp .env.example .env
# Edit .env with your local configuration
```

4. Set up the database:

```bash
# Create PostgreSQL database
createdb datacollect_dev
createdb datacollect_test
```

5. Run the development servers:

```bash
# Terminal 1 - Backend
cd packages/backend
npm run dev

# Terminal 2 - Admin
cd packages/admin
npm run dev

# Terminal 3 - Mobile (optional)
cd packages/mobile
npm run dev
```

## How to Contribute

### Reporting Bugs

- Use the GitHub Issues page to report bugs
- Check if the issue already exists before creating a new one
- Include detailed steps to reproduce the issue
- Provide system information (OS, Node.js version, etc.)

### Suggesting Features

- Open a GitHub Issue with the "enhancement" label
- Clearly describe the feature and its use case
- Be open to discussion and feedback

### Code Contributions

1. **Find an Issue**: Look for issues labeled "good first issue" or "help wanted"
2. **Discuss**: Comment on the issue to discuss your approach
3. **Implement**: Follow the coding standards and include tests
4. **Document**: Update documentation as needed
5. **Test**: Ensure all tests pass locally
6. **Submit**: Create a pull request

## Pull Request Process

1. **Branch Naming**: Use descriptive branch names:

   - `feature/add-user-export`
   - `fix/sync-timeout-issue`
   - `docs/update-api-reference`

2. **Commit Messages**: Follow conventional commits:

   ```
   feat: add user export functionality
   fix: resolve sync timeout issue
   docs: update API reference for v2
   ```

3. **PR Description**: Include:

   - What changes were made
   - Why these changes were made
   - Any breaking changes
   - Related issue numbers

4. **Code Review**:

   - Address reviewer feedback promptly
   - Keep discussions professional and constructive

5. **Merging**: PRs will be merged after:
   - All CI checks pass
   - Code review approval
   - No merge conflicts

## Coding Standards

### TypeScript

- Use TypeScript for all new code
- Enable strict mode
- Avoid `any` types unless absolutely necessary
- Use interfaces over type aliases when possible

### Code Style

- Run `npm run format` before committing
- Follow ESLint rules (run `npm run lint`)
- Use meaningful variable and function names
- Keep functions small and focused

### File Organization

```typescript
// Good
import { external } from "external-package";
import { internal } from "@/internal-module";
import { local } from "./local-file";

// Bad
import { local } from "./local-file";
import { external } from "external-package";
import { internal } from "@/internal-module";
```

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run tests for specific module
cd packages/datacollect && npm test
cd packages/backend && npm test
cd packages/admin && npm run test:unit

# Run specific test file
npm test -- EntityDataManager.test.ts

# Run tests in watch mode
npm test -- --watch
```

### Writing Tests

- Write tests for all new functionality
- Aim for high code coverage
- Use descriptive test names
- Follow AAA pattern (Arrange, Act, Assert)

Example:

```typescript
describe("EntityDataManager", () => {
  describe("submitForm", () => {
    it("should create a new group entity when valid form is submitted", async () => {
      // Arrange
      const manager = new EntityDataManager(/* ... */);
      const formData = createMockGroupForm();

      // Act
      const result = await manager.submitForm(formData);

      // Assert
      expect(result.type).toBe("group");
      expect(result.data.name).toBe(formData.data.name);
    });
  });
});
```

## Documentation

### Code Documentation

- Add JSDoc comments to all public APIs
- Include examples in documentation
- Document complex algorithms

### README Updates

- Update README.md when adding new features
- Keep examples up to date
- Add new dependencies to setup instructions

### API Documentation

- Document all REST endpoints
- Include request/response examples
- Note any breaking changes

## Questions?

If you have questions about contributing, please:

1. Check existing documentation
2. Search closed issues
3. Ask in an open issue
4. Contact the maintainers

Thank you for contributing to ID PASS Data Collect!
