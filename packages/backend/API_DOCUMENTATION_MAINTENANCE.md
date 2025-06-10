# API Documentation Maintenance Strategy

This document outlines strategies to keep the OpenAPI documentation (`openapi.yaml`) synchronized with the actual backend implementation.

## Current Challenge

API documentation tends to become stale as code evolves. We need automated processes to detect and prevent documentation drift.

## Recommended Maintenance Strategies

### 1. Runtime Request/Response Validation (HIGH PRIORITY)

**Implementation**: Add middleware that validates all requests and responses against the OpenAPI spec.

```bash
npm install express-openapi-validator swagger-ui-express
```

**Benefits**:
- Catches documentation mismatches in real-time
- Provides automatic API validation
- Serves interactive documentation
- Works in development and testing

**Implementation Steps**:
1. Add validation middleware to Express app
2. Configure to serve Swagger UI at `/api-docs`
3. Validate all incoming requests and outgoing responses
4. Fail fast when docs don't match implementation

### 2. CI/CD Pipeline Integration (MEDIUM PRIORITY)

**Implementation**: Add GitHub Actions workflow steps to validate API consistency.

**Benefits**:
- Prevents merging code that breaks API contracts
- Automated validation on every PR
- No additional developer overhead

**Implementation Steps**:
1. Add OpenAPI validation to existing GitHub Actions
2. Run schema validation tests
3. Compare API changes between branches
4. Generate API change reports for PRs

### 3. Testing Integration (MEDIUM PRIORITY)

**Implementation**: Integrate OpenAPI validation into existing Jest tests.

```bash
npm install jest-openapi swagger-parser
```

**Benefits**:
- Leverages existing test infrastructure
- Validates API contracts during test runs
- Easy to add to existing workflow

**Implementation Steps**:
1. Add OpenAPI schema validation to test setup
2. Validate API responses in existing tests
3. Add dedicated API contract tests

### 4. Developer Workflow Integration (LOW PRIORITY)

**Implementation**: Tools and practices to make documentation updates part of the development process.

**Benefits**:
- Makes documentation updates part of the development flow
- Reduces likelihood of forgotten updates
- Clear developer guidelines

**Implementation Steps**:
1. Add git hooks to check for API changes
2. Create documentation update checklists
3. Add OpenAPI validation to development server

## Implementation Plan

### Phase 1: Quick Wins (1-2 hours)

1. **Add Swagger UI serving**:
   ```typescript
   import swaggerUi from 'swagger-ui-express';
   import YAML from 'yamljs';
   
   const swaggerDocument = YAML.load('./openapi.yaml');
   app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
   ```

2. **Add CI validation**:
   ```yaml
   # Add to .github/workflows/backend.yml
   - name: Validate OpenAPI Spec
     run: |
       npx swagger-codegen-cli validate -i packages/backend/openapi.yaml
   ```

3. **Add to package.json scripts**:
   ```json
   {
     "scripts": {
       "validate-api": "swagger-codegen-cli validate -i openapi.yaml",
       "serve-docs": "swagger-ui-serve openapi.yaml"
     }
   }
   ```

### Phase 2: Runtime Validation (4-6 hours)

1. **Install dependencies**:
   ```bash
   npm install express-openapi-validator
   ```

2. **Add validation middleware**:
   ```typescript
   import * as OpenApiValidator from 'express-openapi-validator';
   
   app.use(OpenApiValidator.middleware({
     apiSpec: './openapi.yaml',
     validateRequests: true,
     validateResponses: true,
     ignorePaths: /.*\/health/
   }));
   ```

3. **Add error handling**:
   ```typescript
   app.use((err, req, res, next) => {
     if (err.status === 400 && err.errors) {
       // OpenAPI validation error
       res.status(400).json({
         error: 'API Validation Error',
         details: err.errors
       });
     }
     next(err);
   });
   ```

### Phase 3: Testing Integration (2-3 hours)

1. **Add testing dependencies**:
   ```bash
   npm install --save-dev jest-openapi swagger-parser
   ```

2. **Create API contract tests**:
   ```typescript
   import { validateApiSpec } from 'jest-openapi';
   
   describe('API Contract Tests', () => {
     beforeAll(async () => {
       await validateApiSpec('./openapi.yaml');
     });
     
     it('validates login response', async () => {
       const response = await request(app)
         .post('/users/login')
         .send({ email: 'test@example.com', password: 'password' });
       
       expect(response).toSatisfyApiSpec();
     });
   });
   ```

### Phase 4: Advanced Automation (Optional)

1. **Code-first generation** with `tsoa` or `routing-controllers-openapi`
2. **Automated change detection** with API diff tools
3. **Documentation generation** from TypeScript interfaces

## Maintenance Checklist

When adding/modifying API endpoints, developers should:

- [ ] Update the OpenAPI spec (`openapi.yaml`)
- [ ] Run `npm run validate-api` to check syntax
- [ ] Test the endpoint in Swagger UI (`/api-docs`)
- [ ] Add/update corresponding tests
- [ ] Verify CI validation passes

## Monitoring & Alerts

### Development
- Swagger UI available at `http://localhost:3000/api-docs`
- Validation errors logged to console
- Tests fail if API contracts are broken

### Production
- Monitor 400 errors from OpenAPI validation
- Set up alerts for validation failures
- Regular API health checks

## Benefits of This Approach

1. **Immediate Feedback**: Developers know immediately when docs are out of sync
2. **Automated Enforcement**: CI prevents merging inconsistent documentation
3. **Living Documentation**: Swagger UI always reflects current implementation
4. **Quality Assurance**: Request/response validation catches API bugs early
5. **Developer Experience**: Interactive documentation for testing and exploration

## Migration Strategy

1. **Week 1**: Implement Phase 1 (Swagger UI + CI validation)
2. **Week 2**: Implement Phase 2 (Runtime validation)
3. **Week 3**: Implement Phase 3 (Testing integration)
4. **Ongoing**: Monitor and refine based on team feedback

## Alternative Approaches Considered

### Code-First Generation
- **Pros**: Always synchronized, generates from TypeScript
- **Cons**: Requires significant refactoring, less control over documentation
- **Decision**: Not recommended for existing codebase

### Documentation-First Development
- **Pros**: API design driven by documentation
- **Cons**: Requires workflow changes, harder to adopt incrementally
- **Decision**: Good for new features, harder for existing code

### Manual Processes Only
- **Pros**: Simple, no tooling overhead
- **Cons**: Error-prone, not scalable, often ignored
- **Decision**: Not sufficient for maintaining quality documentation

## Success Metrics

- API documentation accuracy (validated by automated tests)
- Developer adoption (usage of Swagger UI)
- Reduced API-related bugs in production
- Time to onboard new developers (with interactive docs)
- Documentation maintenance effort (should decrease over time)

---

*This strategy balances automation with practicality, ensuring documentation stays current without major workflow disruption.*