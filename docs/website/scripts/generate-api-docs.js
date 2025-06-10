#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

// Configuration
const CONFIG = {
  specPath: '../../../packages/backend/openapi.yaml',
  outputDir: 'docs/packages/backend/api-reference-generated',
  baseUrl: '/idpass-data-collect',
  githubUrl: 'https://raw.githubusercontent.com/idpass/idpass-data-collect/main/packages/backend/openapi.yaml'
};

// Utility functions
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function writeFile(filePath, content) {
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`✅ Generated: ${filePath}`);
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function getMethodClass(method) {
  const methodClasses = {
    get: 'api-method get',
    post: 'api-method post',
    put: 'api-method put',
    delete: 'api-method delete',
    patch: 'api-method patch'
  };
  return methodClasses[method.toLowerCase()] || 'api-method';
}

function generateMarkdownContent(frontMatter, content) {
  const frontMatterStr = Object.entries(frontMatter)
    .map(([key, value]) => {
      if (Array.isArray(value)) {
        return `${key}:\n${value.map(item => `  - "${item}"`).join('\n')}`;
      } else if (typeof value === 'string') {
        return `${key}: "${value}"`;
      } else {
        return `${key}: ${value}`;
      }
    })
    .join('\n');
  
  return `---
${frontMatterStr}
---

${content}`;
}

function generateEndpointDoc(path, method, endpoint, spec) {
  const operationId = endpoint.operationId || `${method}-${path.replace(/[^a-zA-Z0-9]/g, '-')}`;
  const id = slugify(endpoint.summary || operationId);
  
  let content = `# ${endpoint.summary || `${method.toUpperCase()} ${path}`}

${endpoint.description || ''}

## Request

**Method:** \`${method.toUpperCase()}\`  
**Path:** \`${path}\`

`;

  // Authentication
  if (endpoint.security && endpoint.security.length > 0) {
    content += `**Authentication:** Required (Bearer JWT)\n\n`;
  } else {
    content += `**Authentication:** Not required\n\n`;
  }

  // Parameters
  if (endpoint.parameters && endpoint.parameters.length > 0) {
    content += `### Parameters

| Name | Type | In | Required | Description |
|------|------|----|---------:|-------------|
`;
    endpoint.parameters.forEach(param => {
      content += `| ${param.name} | ${param.schema?.type || 'string'} | ${param.in} | ${param.required ? 'Yes' : 'No'} | ${param.description || ''} |\n`;
    });
    content += '\n';
  }

  // Request Body
  if (endpoint.requestBody) {
    const jsonContent = endpoint.requestBody.content['application/json'];
    if (jsonContent) {
      content += `### Request Body

**Content Type:** \`application/json\`

`;
      if (jsonContent.schema) {
        content += `**Schema:** See component schemas below\n\n`;
      }
      
      if (jsonContent.example) {
        content += `**Example:**
\`\`\`json
${JSON.stringify(jsonContent.example, null, 2)}
\`\`\`

`;
      }
    }
  }

  // Responses
  if (endpoint.responses) {
    content += `## Responses

`;
    Object.entries(endpoint.responses).forEach(([statusCode, response]) => {
      content += `### ${statusCode} - ${response.description || 'Response'}

`;
      if (response.content && response.content['application/json']) {
        const jsonContent = response.content['application/json'];
        if (jsonContent.example) {
          content += `**Example:**
\`\`\`json
${JSON.stringify(jsonContent.example, null, 2)}
\`\`\`

`;
        }
      }
    });
  }

  // Tags
  const tags = endpoint.tags || [];
  
  // Code examples
  content += `## Examples

### cURL
\`\`\`bash
curl -X ${method.toUpperCase()} \\
  ${endpoint.security ? '-H "Authorization: Bearer YOUR_TOKEN" \\\n  ' : ''}-H "Content-Type: application/json" \\
  http://localhost:3000${path}${endpoint.requestBody ? ' \\\n  -d \'{"example": "data"}\'' : ''}
\`\`\`

### JavaScript
\`\`\`javascript
const response = await fetch('http://localhost:3000${path}', {
  method: '${method.toUpperCase()}',
  headers: {
    'Content-Type': 'application/json',${endpoint.security ? "\n    'Authorization': 'Bearer ' + token," : ''}
  },${endpoint.requestBody ? '\n  body: JSON.stringify({\n    // Request data\n  }),' : ''}
});

const data = await response.json();
console.log(data);
\`\`\`

---

*This documentation is automatically generated from the OpenAPI specification.*
`;

  return {
    id,
    content,
    frontMatter: {
      id,
      title: endpoint.summary || `${method.toUpperCase()} ${path}`,
      description: endpoint.description || '',
      sidebar_position: 1,
      tags: tags.length > 0 ? tags : undefined
    }
  };
}

function generateTagDoc(tagName, tag, endpoints) {
  const id = slugify(tagName);
  
  let content = `# ${tagName}

${tag.description || `${tagName} endpoints`}

## Available Endpoints

`;

  endpoints.forEach(endpoint => {
    // Escape curly braces in path for MDX compatibility
    const escapedPath = endpoint.path.replace(/\{/g, '\\{').replace(/\}/g, '\\}');
    content += `- **[${endpoint.method.toUpperCase()} ${escapedPath}](./${endpoint.id})** - ${endpoint.summary}\n`;
  });

  content += `

---

*This documentation is automatically generated from the OpenAPI specification.*
`;

  return {
    id,
    content,
    frontMatter: {
      id,
      title: tagName,
      description: tag.description || `${tagName} endpoints`,
      sidebar_position: 1
    }
  };
}

function generateSidebar(spec, endpoints, tags) {
  const sidebarItems = [
    {
      type: 'doc',
      id: 'packages/backend/api-reference-generated/idpass-datacollect-backend-api',
    }
  ];

  // Group endpoints by tags
  const endpointsByTag = {};
  endpoints.forEach(endpoint => {
    const tagName = endpoint.tags?.[0] || 'Other';
    if (!endpointsByTag[tagName]) {
      endpointsByTag[tagName] = [];
    }
    endpointsByTag[tagName].push(endpoint);
  });

  // Add tag categories to sidebar
  Object.entries(endpointsByTag).forEach(([tagName, tagEndpoints]) => {
    const tagId = slugify(tagName);
    sidebarItems.push({
      type: 'category',
      label: tagName,
      link: {
        type: 'doc',
        id: `packages/backend/api-reference-generated/${tagId}`
      },
      items: tagEndpoints.map(endpoint => ({
        type: 'doc',
        id: `packages/backend/api-reference-generated/${endpoint.id}`,
        label: endpoint.summary || `${endpoint.method.toUpperCase()} ${endpoint.path}`,
        className: getMethodClass(endpoint.method)
      }))
    });
  });

  // Generate sidebar comment for updating main sidebars.ts
  const sidebarComment = `
// Copy this to sidebars.ts if the API structure changes:
// const backendApiSidebar = ${JSON.stringify(sidebarItems, null, 2)};
`;

  return `import type { SidebarsConfig } from "@docusaurus/plugin-content-docs";

${sidebarComment}
const sidebar: SidebarsConfig = {
  apisidebar: ${JSON.stringify(sidebarItems, null, 2)},
};

export default sidebar.apisidebar;
`;
}

function generateApiOverview(spec) {
  const content = `# ${spec.info.title}

${spec.info.description || ''}

**Version:** ${spec.info.version}

## API Information

- **Base URL:** \`${spec.servers?.[0]?.url || 'http://localhost:3000'}\`
- **Authentication:** Bearer JWT tokens
- **Content Type:** \`application/json\`

## Quick Start

### 1. Authentication

Most endpoints require JWT authentication. Get a token by logging in:

\`\`\`bash
curl -X POST http://localhost:3000/api/users/login \\
  -H "Content-Type: application/json" \\
  -d '{
    "email": "admin@hdm.com",
    "password": "your-password"
  }'
\`\`\`

### 2. Using the Token

Include the token in subsequent requests:

\`\`\`bash
curl -H "Authorization: Bearer YOUR_TOKEN" \\
  http://localhost:3000/api/users/me
\`\`\`

## API Endpoints

This API provides the following endpoint categories:

${Object.entries(spec.tags || {}).map(([tag, info]) => 
  `- **${tag}** - ${info.description || ''}`
).join('\n')}

## Interactive Documentation

For live API testing, start the backend server and visit:
\`http://localhost:3000/api-docs\`

## OpenAPI Specification

- **Download:** [openapi.yaml](${CONFIG.githubUrl})
- **Interactive:** [Swagger UI](http://localhost:3000/api-docs) (when server is running)

---

*This documentation is automatically generated from the OpenAPI specification.*
`;

  return {
    content,
    frontMatter: {
      id: 'idpass-datacollect-backend-api',
      title: spec.info.title,
      description: spec.info.description,
      sidebar_position: 1
    }
  };
}

// Main generation function
function generateApiDocs() {
  console.log('🚀 Generating API documentation from OpenAPI spec...');
  
  // Read OpenAPI spec
  const specPath = path.resolve(__dirname, CONFIG.specPath);
  if (!fs.existsSync(specPath)) {
    console.error(`❌ OpenAPI spec not found at: ${specPath}`);
    process.exit(1);
  }
  
  const specContent = fs.readFileSync(specPath, 'utf8');
  const spec = yaml.load(specContent);
  
  console.log(`📖 Loaded OpenAPI spec: ${spec.info.title} v${spec.info.version}`);
  
  // Ensure output directory exists
  const outputDir = path.resolve(__dirname, '..', CONFIG.outputDir);
  ensureDir(outputDir);
  
  // Generate endpoints documentation
  const endpoints = [];
  const tags = {};
  
  // Collect tags
  if (spec.tags) {
    spec.tags.forEach(tag => {
      tags[tag.name] = tag;
    });
  }
  
  // Process paths
  Object.entries(spec.paths || {}).forEach(([endpointPath, pathItem]) => {
    Object.entries(pathItem).forEach(([method, endpoint]) => {
      if (typeof endpoint === 'object' && endpoint.summary) {
        const endpointDoc = generateEndpointDoc(endpointPath, method, endpoint, spec);
        endpoints.push({
          ...endpointDoc,
          path: endpointPath,
          method,
          summary: endpoint.summary,
          tags: endpoint.tags || []
        });
        
        // Write endpoint file
        const filePath = path.join(outputDir, `${endpointDoc.id}.md`);
        const endpointContent = generateMarkdownContent(endpointDoc.frontMatter, endpointDoc.content);
        writeFile(filePath, endpointContent);
      }
    });
  });
  
  // Generate tag documentation
  const endpointsByTag = {};
  endpoints.forEach(endpoint => {
    const tagName = endpoint.tags[0] || 'Other';
    if (!endpointsByTag[tagName]) {
      endpointsByTag[tagName] = [];
    }
    endpointsByTag[tagName].push(endpoint);
  });
  
  Object.entries(endpointsByTag).forEach(([tagName, tagEndpoints]) => {
    const tag = tags[tagName] || { description: `${tagName} endpoints` };
    const tagDoc = generateTagDoc(tagName, tag, tagEndpoints);
    
    const tagPath = path.join(outputDir, `${tagDoc.id}.md`);
    const tagContent = generateMarkdownContent(tagDoc.frontMatter, tagDoc.content);
    writeFile(tagPath, tagContent);
  });
  
  // Generate API overview
  const overview = generateApiOverview(spec);
  const overviewPath = path.join(outputDir, 'idpass-datacollect-backend-api.md');
  const overviewContent = generateMarkdownContent(overview.frontMatter, overview.content);
  writeFile(overviewPath, overviewContent);
  
  // Generate sidebar
  const sidebarContent = generateSidebar(spec, endpoints, tags);
  const sidebarPath = path.join(outputDir, 'sidebar.ts');
  writeFile(sidebarPath, sidebarContent);
  
  console.log(`✅ Generated ${endpoints.length} endpoint docs, ${Object.keys(endpointsByTag).length} tag docs, and sidebar`);
  console.log(`📁 Output directory: ${outputDir}`);
  console.log('🎉 API documentation generation complete!');
}

// Run the generator
try {
  generateApiDocs();
} catch (error) {
  console.error('❌ Error generating API docs:', error);
  process.exit(1);
}