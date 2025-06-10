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
const glob = require('glob');

// License header patterns
const LICENSE_PATTERNS = [
  // ACN header format
  /Licensed to the Association pour la cooperation numerique \(ACN\)/i,
  // Standard Apache header
  /Licensed under the Apache License, Version 2\.0/i,
  // SPDX identifier
  /SPDX-License-Identifier:\s*Apache-2\.0/i
];

// Files to check (TypeScript, JavaScript, etc.)
const FILE_PATTERNS = [
  'packages/**/*.ts',
  'packages/**/*.tsx',
  'packages/**/*.js',
  'packages/**/*.jsx',
  '!packages/**/node_modules/**',
  '!packages/**/dist/**',
  '!packages/**/build/**',
  '!packages/**/*.test.ts',
  '!packages/**/*.spec.ts',
  '!packages/**/*.test.js',
  '!packages/**/*.spec.js',
  '!packages/**/jest.config.js',
  '!packages/**/vite.config.ts',
  '!packages/**/vitest.config.ts',
  '!packages/**/tsconfig.json',
  '!packages/**/eslint.config.ts',
  '!packages/**/eslint.config.mjs',
  '!packages/**/nodemon.json'
];

// Expected license header template (ACN format)
const EXPECTED_HEADER = `/*
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
 */`;

function checkLicenseHeader(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const firstChars = content.substring(0, 1000); // Check first 1000 chars
    
    // Check if any license pattern matches
    const hasLicense = LICENSE_PATTERNS.some(pattern => pattern.test(firstChars));
    
    if (!hasLicense) {
      return { valid: false, file: filePath };
    }
    
    return { valid: true, file: filePath };
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error.message);
    return { valid: false, file: filePath, error: error.message };
  }
}

function findFiles(patterns) {
  const files = new Set();
  
  patterns.forEach(pattern => {
    if (pattern.startsWith('!')) {
      // Remove files matching this pattern
      const filesToRemove = glob.sync(pattern.substring(1), { nodir: true });
      filesToRemove.forEach(file => files.delete(file));
    } else {
      // Add files matching this pattern
      const filesToAdd = glob.sync(pattern, { nodir: true });
      filesToAdd.forEach(file => files.add(file));
    }
  });
  
  return Array.from(files);
}

function getFileExtension(filePath) {
  return path.extname(filePath).toLowerCase();
}

function addLicenseHeader(filePath, content) {
  const ext = getFileExtension(filePath);
  const hasShebang = content.startsWith('#!');
  
  let newContent;
  if (hasShebang) {
    // Preserve shebang line
    const lines = content.split('\n');
    const shebang = lines[0];
    const rest = lines.slice(1).join('\n');
    newContent = shebang + '\n\n' + EXPECTED_HEADER + '\n\n' + rest.trimStart();
  } else {
    newContent = EXPECTED_HEADER + '\n\n' + content;
  }
  
  return newContent;
}

function main() {
  console.log('🔍 Checking license headers in source files...\n');
  
  const files = findFiles(FILE_PATTERNS);
  console.log(`Found ${files.length} files to check\n`);
  
  const results = files.map(checkLicenseHeader);
  const missingLicense = results.filter(r => !r.valid);
  
  if (missingLicense.length === 0) {
    console.log('✅ All files have proper license headers!\n');
    process.exit(0);
  } else {
    console.log(`❌ Found ${missingLicense.length} files without proper license headers:\n`);
    
    missingLicense.forEach(result => {
      console.log(`  - ${result.file}`);
      if (result.error) {
        console.log(`    Error: ${result.error}`);
      }
    });
    
    console.log('\n📝 Expected license header format:');
    console.log('─'.repeat(50));
    console.log(EXPECTED_HEADER);
    console.log('─'.repeat(50));
    
    console.log('\n💡 You can also use SPDX identifier: // SPDX-License-Identifier: Apache-2.0\n');
    console.log('   Note: Files should use the ACN license header format shown above.\n');
    
    // Exit with error code if --fix flag is not provided
    if (process.argv.includes('--fix')) {
      console.log('\n🔧 Fixing missing license headers...\n');
      
      missingLicense.forEach(result => {
        try {
          const content = fs.readFileSync(result.file, 'utf8');
          const newContent = addLicenseHeader(result.file, content);
          fs.writeFileSync(result.file, newContent);
          console.log(`  ✅ Fixed: ${result.file}`);
        } catch (error) {
          console.log(`  ❌ Failed to fix ${result.file}: ${error.message}`);
        }
      });
      
      console.log('\n✨ License headers added to all files!');
      process.exit(0);
    } else {
      console.log('\n💡 Run with --fix flag to automatically add license headers');
      console.log('   Example: node scripts/check-license-headers.js --fix\n');
      process.exit(1);
    }
  }
}

// Check if glob is installed
try {
  require.resolve('glob');
} catch (e) {
  console.error('❌ Error: glob package is not installed.');
  console.error('Please run: npm install --save-dev glob');
  process.exit(1);
}

if (require.main === module) {
  main();
}