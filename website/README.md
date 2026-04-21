# Documentation Website

This website is built using [Docusaurus](https://docusaurus.io/), a modern static website generator.

## Installation

This package is part of the ID PASS DataCollect monorepo. Install dependencies from the workspace root:

```bash
# From workspace root
pnpm install
```

## Local Development

Start the development server:

```bash
# From workspace root
pnpm dev:docs

# Or from this directory
pnpm dev
```

This command starts a local development server on port 3001. Most changes are reflected live without having to restart the server.

## Build

Build the documentation site:

```bash
# From workspace root
pnpm build:docs

# Or from this directory
pnpm build
```

This command generates static content into the `build` directory and can be served using any static content hosting service.

The build process automatically:
1. Generates API documentation from OpenAPI spec
2. Generates TypeDoc documentation from TypeScript source
3. Builds the Docusaurus site

## Deployment

### Using SSH

```bash
USE_SSH=true pnpm deploy
```

### Not using SSH

```bash
GIT_USER=<Your GitHub username> pnpm deploy
```

If you are using GitHub pages for hosting, this command is a convenient way to build the website and push to the `gh-pages` branch.

## Scripts

- `pnpm generate-api-docs` - Generate API documentation from OpenAPI spec
- `pnpm generate-postman-collection` - Generate Postman collection from OpenAPI spec
- `pnpm update-typedoc` - Update TypeDoc documentation
- `pnpm clear-api-docs` - Clear generated API documentation

## Documentation Structure

- `docs/` - Markdown documentation files
- `content/docs/` - Additional documentation content
- `static/api/` - Generated API documentation and Postman collections
- `scripts/` - Documentation generation scripts
