#!/usr/bin/env node

/**
 * Script to generate TypeDoc documentation and copy it to the correct location
 * This script:
 * 1. Runs TypeDoc for the datacollect package
 * 2. Copies the markdown output to the docs website
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
  datacollectPath: path.resolve(__dirname, '../../../packages/datacollect'),
  typedocOutputPath: path.resolve(__dirname, '../../../docs/api/datacollect'),
  targetPath: path.resolve(__dirname, '../docs/packages/datacollect/api'),
  oldRepoUrl: 'https://github.com/idpass/idpass-data-collect',
  newRepoUrl: 'https://github.com/idpass/idpass-data-collect',
  oldProjectName: 'ID PASS DataCollect',
  newProjectName: 'ID PASS DataCollect'
};

// Utility functions
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function copyDirectory(src, dest) {
  ensureDir(dest);
  const files = fs.readdirSync(src);
  
  for (const file of files) {
    const srcPath = path.join(src, file);
    const destPath = path.join(dest, file);
    
    if (fs.statSync(srcPath).isDirectory()) {
      copyDirectory(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function updateFileContent(filePath) {
  if (fs.existsSync(filePath) && filePath.endsWith('.md')) {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Update repository URLs
    content = content.replace(new RegExp(CONFIG.oldRepoUrl, 'g'), CONFIG.newRepoUrl);
    
    // Update project name (be careful not to break links)
    content = content.replace(/\[ID PASS DataCollect\]/g, `[${CONFIG.newProjectName}]`);
    content = content.replace(/^# ID PASS DataCollect/gm, `# ${CONFIG.newProjectName}`);
    
    fs.writeFileSync(filePath, content, 'utf8');
  }
}

function updateAllFiles(dir) {
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const filePath = path.join(dir, file);
    
    if (fs.statSync(filePath).isDirectory()) {
      updateAllFiles(filePath);
    } else if (filePath.endsWith('.md')) {
      updateFileContent(filePath);
    }
  }
}

console.log('🔨 Building TypeDoc documentation...');

// Change to datacollect directory
process.chdir(CONFIG.datacollectPath);

// Build the datacollect package first (required for TypeDoc)
console.log('  📦 Building datacollect package...');
execSync('npm run build', { stdio: 'inherit' });

// Generate TypeDoc with the markdown plugin
console.log('  📝 Generating TypeDoc with markdown plugin...');
execSync('npx typedoc --plugin typedoc-plugin-markdown --theme markdown', { stdio: 'inherit' });

// Check if TypeDoc output exists
if (!fs.existsSync(CONFIG.typedocOutputPath)) {
  console.error('❌ TypeDoc output not found at:', CONFIG.typedocOutputPath);
  process.exit(1);
}

// Clean target directory
if (fs.existsSync(CONFIG.targetPath)) {
  console.log('  🧹 Cleaning existing API docs...');
  fs.rmSync(CONFIG.targetPath, { recursive: true, force: true });
}

// Copy TypeDoc output to target location
console.log('  📂 Copying TypeDoc output to docs website...');
copyDirectory(CONFIG.typedocOutputPath, CONFIG.targetPath);

// Update repository URLs and project name in all copied files
// NOTE: Uncomment the following lines if you want to update URLs and project names in the copied files
// console.log('  🔄 Updating repository URLs and project name...');
// updateAllFiles(CONFIG.targetPath);

console.log('✅ TypeDoc documentation generated and updated successfully!');