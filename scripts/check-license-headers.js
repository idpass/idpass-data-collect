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
  'packages/**/*.vue',
  '!**/node_modules/**',
  '!packages/**/dist/**',
  '!packages/**/build/**',
  '!packages/**/*.test.ts',
  '!packages/**/*.spec.ts',
  '!packages/**/*.test.js',
  '!packages/**/*.spec.js',
  '!packages/**/*.test.vue',
  '!packages/**/*.spec.vue',
  '!packages/**/jest.config.js',
  '!packages/**/vite.config.ts',
  '!packages/**/vitest.config.ts',
  '!packages/**/tsconfig.json',
  '!packages/**/eslint.config.ts',
  '!packages/**/eslint.config.mjs',
  '!packages/**/nodemon.json',
  '!packages/**/android/**',
  '!packages/**/ios/**'
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

// Same header for HTML-comment files (.vue). Keeps the ` * ` line prefix so the
// body is byte-identical to the block-comment form — only the delimiters differ.
const EXPECTED_HEADER_HTML = `<!--
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
-->`;

// The closing sentence that only a COMPLETE ACN header contains. A header that
// matches LICENSE_PATTERNS but lacks this is truncated (the bug this guards).
const FULL_HEADER_MARKER = /specific language governing permissions and limitations/i;
const ACN_OPENING_MARKER = /Licensed to the Association pour la cooperation numerique \(ACN\)/i;

function usesHtmlComment(filePath) {
  return path.extname(filePath).toLowerCase() === '.vue';
}

function expectedHeaderFor(filePath) {
  return usesHtmlComment(filePath) ? EXPECTED_HEADER_HTML : EXPECTED_HEADER;
}

// Strip a leading ACN/Apache license comment (block or HTML), if present, so a
// truncated or off-style header can be replaced rather than duplicated.
// Only strips the FIRST leading comment and only when it is a license comment.
function stripLeadingLicenseComment(content) {
  let shebang = '';
  let body = content;
  if (body.startsWith('#!')) {
    const nl = body.indexOf('\n');
    shebang = body.slice(0, nl + 1);
    body = body.slice(nl + 1);
  }
  const leading = body.replace(/^\s+/, '');
  const block = leading.match(/^\/\*[\s\S]*?\*\/\s*/);
  const html = leading.match(/^<!--[\s\S]*?-->\s*/);
  const match = block || html;
  if (match && (ACN_OPENING_MARKER.test(match[0]) || /Licensed under the Apache License/i.test(match[0]))) {
    body = leading.slice(match[0].length);
  }
  return { shebang, body };
}

// Classify a file's header:
//   'missing'   - no license header at all                 (CI failure)
//   'truncated' - ACN header present but not the full text  (CI failure)
//   'restyle'   - full & valid, but not the canonical style (fixed by --fix, not a failure)
//   'valid'     - full canonical header (or a non-ACN SPDX/Apache variant)
function checkLicenseHeader(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const firstChars = content.substring(0, 2000); // full ACN header is ~900 chars; allow for shebang/blank lead

    const hasLicense = LICENSE_PATTERNS.some(pattern => pattern.test(firstChars));
    if (!hasLicense) {
      return { status: 'missing', file: filePath };
    }

    // ACN headers must be complete. (SPDX / short-Apache variants are single
    // markers and are accepted as-is.)
    if (ACN_OPENING_MARKER.test(firstChars) && !FULL_HEADER_MARKER.test(firstChars)) {
      return { status: 'truncated', file: filePath };
    }

    // Full & valid. Only .vue is normalized for style (two historical variants:
    // ` * `-prefixed vs two-space). .ts/.js already share one block-comment form,
    // so we don't touch them here (avoids mass no-op rewrites on whitespace drift).
    if (usesHtmlComment(filePath) && !content.replace(/^\s+/, '').startsWith(EXPECTED_HEADER_HTML)) {
      return { status: 'restyle', file: filePath };
    }

    return { status: 'valid', file: filePath };
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error.message);
    return { status: 'missing', file: filePath, error: error.message };
  }
}

function findFiles(patterns) {
  const files = new Set();
  const includePatterns = patterns.filter(pattern => !pattern.startsWith('!'));
  const ignorePatterns = patterns
    .filter(pattern => pattern.startsWith('!'))
    .map(pattern => pattern.substring(1));

  includePatterns.forEach(pattern => {
    const matches = glob.sync(pattern, { nodir: true, ignore: ignorePatterns });
    matches.forEach(file => files.add(file));
  });

  return Array.from(files);
}

function getFileExtension(filePath) {
  return path.extname(filePath).toLowerCase();
}

function addLicenseHeader(filePath, content) {
  // Remove any existing (truncated / off-style) license comment first so we
  // replace rather than stack a second header on top.
  const { shebang, body } = stripLeadingLicenseComment(content);
  const header = expectedHeaderFor(filePath);
  const prefix = shebang ? shebang + '\n' : '';
  return prefix + header + '\n\n' + body.replace(/^\s+/, '');
}

function main() {
  console.log('🔍 Checking license headers in source files...\n');
  
  const files = findFiles(FILE_PATTERNS);
  console.log(`Found ${files.length} files to check\n`);
  
  const results = files.map(checkLicenseHeader);
  const missing = results.filter(r => r.status === 'missing');
  const truncated = results.filter(r => r.status === 'truncated');
  const restyle = results.filter(r => r.status === 'restyle');

  // missing + truncated are real violations (CI-failing). restyle is a
  // cosmetic normalization only --fix acts on; it never fails CI.
  const violations = [...missing, ...truncated];
  const fixable = [...missing, ...truncated, ...restyle];
  const isFix = process.argv.includes('--fix');

  if (fixable.length === 0) {
    console.log('✅ All files have proper license headers!\n');
    process.exit(0);
  }

  if (violations.length > 0) {
    console.log(`❌ Found ${violations.length} file(s) with missing or incomplete license headers:\n`);
    missing.forEach(r => console.log(`  - [missing]   ${r.file}${r.error ? ` (${r.error})` : ''}`));
    truncated.forEach(r => console.log(`  - [truncated] ${r.file}`));
  }
  if (restyle.length > 0) {
    console.log(`\nℹ️  ${restyle.length} .vue file(s) have a non-canonical header style (cosmetic; --fix normalizes):`);
    restyle.forEach(r => console.log(`  - [restyle]   ${r.file}`));
  }

  if (!isFix) {
    console.log('\n📝 Expected license header format:');
    console.log('─'.repeat(50));
    console.log(EXPECTED_HEADER);
    console.log('─'.repeat(50));
    console.log('\n💡 Run with --fix to add/complete/normalize headers:');
    console.log('   node scripts/check-license-headers.js --fix\n');
    // Exit non-zero only for real violations, so a stray restyle doesn't break CI.
    process.exit(violations.length > 0 ? 1 : 0);
  }

  console.log('\n🔧 Fixing license headers...\n');
  let failed = 0;
  fixable.forEach(result => {
    try {
      const content = fs.readFileSync(result.file, 'utf8');
      fs.writeFileSync(result.file, addLicenseHeader(result.file, content));
      console.log(`  ✅ ${result.status.padEnd(9)} ${result.file}`);
    } catch (error) {
      failed++;
      console.log(`  ❌ Failed to fix ${result.file}: ${error.message}`);
    }
  });
  console.log('\n✨ License headers updated.');
  process.exit(failed > 0 ? 1 : 0);
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
