#!/usr/bin/env node

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

const fs = require('fs');
const path = require('path');

// License header patterns
const LICENSE_PATTERNS = [
  // ACN header format
  /Licensed to the Association pour la cooperation numerique \(ACN\)/i,
  // Standard Apache header
  /Licensed under the Apache License, Version 2\.0/i,
  // SPDX identifier
  /SPDX-License-Identifier:\s*Apache-2\.0/i
];

// Files that should be excluded from license check
const EXCLUDE_FILES = [
  '.test.ts',
  '.test.js',
  '.spec.ts',
  '.spec.js',
  'jest.config.js',
  'vite.config.ts',
  'vitest.config.ts',
  'eslint.config.ts',
  'eslint.config.mjs'
];

function shouldCheckFile(filePath) {
  const basename = path.basename(filePath);
  return !EXCLUDE_FILES.some(pattern => basename.endsWith(pattern));
}

function checkLicenseHeader(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const firstChars = content.substring(0, 1000); // Check first 1000 chars
    
    // Check if any license pattern matches
    const hasLicense = LICENSE_PATTERNS.some(pattern => pattern.test(firstChars));
    
    return hasLicense;
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error.message);
    return false;
  }
}

function main() {
  // Get files from command line arguments (provided by lint-staged)
  const files = process.argv.slice(2).filter(file => shouldCheckFile(file));
  
  if (files.length === 0) {
    process.exit(0);
  }
  
  const missingLicense = files.filter(file => !checkLicenseHeader(file));
  
  if (missingLicense.length === 0) {
    process.exit(0);
  } else {
    console.error('\n❌ Missing Apache license headers in the following files:');
    missingLicense.forEach(file => {
      console.error(`  - ${file}`);
    });
    console.error('\n💡 Run "npm run check-licenses:fix" to add license headers automatically\n');
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}