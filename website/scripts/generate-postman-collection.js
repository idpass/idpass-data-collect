
const fs = require('fs');
const path = require('path');
const openapiToPostman = require('openapi-to-postmanv2');

const openapiUrl = path.join(__dirname, '../../packages/backend/openapi.yaml');
const outputPath = path.join(__dirname, '../static/api/idpass-backend.postman_collection.json');

const spec = fs.readFileSync(openapiUrl, 'utf8');

openapiToPostman.convert({ type: 'string', data: spec }, {}, (err, conversionResult) => {
  if (err) {
    console.error(err);
    return;
  }

  if (!conversionResult.result) {
    console.error('Could not convert OpenAPI to Postman:', conversionResult.reason);
    return;
  }

  const collection = conversionResult.output[0].data;
  // Ensure the output directory exists
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(collection, null, 2));
  console.log('Postman collection generated successfully at:', outputPath);
});
