#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🧹 TwipClip Repository Cleanup\n');

const filesToDelete = [];
const foldersToClean = [];
const filesToKeep = [];

// Files to definitely DELETE
const deletePatterns = [
  // Test files in root
  'test-youtube-cookies.js',
  
  // Old/duplicate Docker files (keeping main Dockerfile and railway one)
  'Dockerfile.alternative',
  'Dockerfile.multistage',
  
  // Temporary build info
  'tsconfig.tsbuildinfo',
  
  // Test scripts that are one-offs
  'scripts/test-session-persistence.js',
  'scripts/test-youtube-auth.js',
  'scripts/test-bulk-download.js',
  'scripts/test-browser-auth.js',
  'scripts/test-ytdlp.js',
  
  // Old setup scripts
  'scripts/setup-firefox-profile.sh',
  'scripts/copy-cookies.js',
  
  // Temporary media files in temp folder
  'temp/*.mp4',
  'temp/*.webm',
  'temp/*.m4a',
  'temp/audio_*.webm',
  'temp/full_*.webm',
  'temp/full_*.mp4',
  'temp/*_audio.mp4',
  'temp/clip_*.mp4'
];

// Files to KEEP (essential for operation)
const keepPatterns = [
  // Core configs
  'package.json',
  'package-lock.json',
  'next.config.js',
  'tsconfig.json',
  '.gitignore',
  '.npmrc',
  'postcss.config.mjs',
  'eslint.config.mjs',
  
  // Docker/deployment
  'Dockerfile',
  'Dockerfile.railway',
  'railway.json',
  'requirements.txt',
  'runtime.txt',
  '.dockerignore',
  
  // Documentation
  'README.md',
  'USER_GUIDE.md',
  'QUICK_START.md',
  'OPTIMIZATION_REPORT.md',
  'ARCHITECTURE.md',
  'CHANGELOG.md',
  'CONTRIBUTING.md',
  
  // Essential scripts
  'scripts/check-dependencies.js',
  'scripts/create-env.js',
  'scripts/start-production.js',
  'scripts/comprehensive-test.js',
  'scripts/debug-cookies.js',
  'scripts/debug-cookie-paths.js',
  'scripts/test-error-handling.js',
  
  // Example files
  'env.example',
  'railway-env-example.txt',
  
  // User cookie storage (IMPORTANT!)
  'temp/user-cookies/**',
  'temp/youtube_cookies.txt' // Keep if exists
];

// Function to check if file should be kept
function shouldKeep(filePath) {
  const relativePath = path.relative(process.cwd(), filePath).replace(/\\/g, '/');
  return keepPatterns.some(pattern => {
    if (pattern.includes('**')) {
      return relativePath.startsWith(pattern.replace('/**', ''));
    }
    return relativePath === pattern || relativePath.endsWith('/' + pattern);
  });
}

// Function to check if file should be deleted
function shouldDelete(filePath) {
  const relativePath = path.relative(process.cwd(), filePath).replace(/\\/g, '/');
  return deletePatterns.some(pattern => {
    if (pattern.includes('*')) {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      return regex.test(relativePath);
    }
    return relativePath === pattern;
  });
}

// Scan for files to delete
function scanDirectory(dir) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      // Skip node_modules, .git, .next
      if (['node_modules', '.git', '.next', '.railway', '.nixpacks'].includes(file)) {
        return;
      }
      scanDirectory(filePath);
    } else {
      if (shouldDelete(filePath) && !shouldKeep(filePath)) {
        filesToDelete.push(filePath);
      }
    }
  });
}

// Start scanning
console.log('Scanning for files to clean...\n');
scanDirectory(process.cwd());

// Clean temp folder specifically
const tempDir = path.join(process.cwd(), 'temp');
if (fs.existsSync(tempDir)) {
  const tempFiles = fs.readdirSync(tempDir);
  tempFiles.forEach(file => {
    const filePath = path.join(tempDir, file);
    const stat = fs.statSync(filePath);
    
    // Keep user-cookies directory
    if (stat.isDirectory() && file === 'user-cookies') {
      console.log('✅ Keeping user-cookies directory');
      return;
    }
    
    // Keep main youtube_cookies.txt
    if (file === 'youtube_cookies.txt') {
      console.log('✅ Keeping youtube_cookies.txt');
      return;
    }
    
    // Delete old media files
    if (file.match(/\.(mp4|webm|m4a|wav|mp3)$/)) {
      filesToDelete.push(filePath);
    }
  });
}

// Display what will be deleted
if (filesToDelete.length === 0) {
  console.log('✅ No files to delete. Repository is clean!');
  process.exit(0);
}

console.log(`Found ${filesToDelete.length} files to delete:\n`);
filesToDelete.forEach(file => {
  const size = fs.statSync(file).size;
  const sizeMB = (size / 1024 / 1024).toFixed(2);
  console.log(`  - ${path.relative(process.cwd(), file)} (${sizeMB} MB)`);
});

const totalSize = filesToDelete.reduce((sum, file) => sum + fs.statSync(file).size, 0);
const totalSizeMB = (totalSize / 1024 / 1024).toFixed(2);
console.log(`\nTotal space to be freed: ${totalSizeMB} MB`);

// Confirm deletion
const readline = require('readline');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('\nDo you want to delete these files? (yes/no): ', (answer) => {
  if (answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y') {
    console.log('\nDeleting files...');
    
    let deleted = 0;
    let failed = 0;
    
    filesToDelete.forEach(file => {
      try {
        fs.unlinkSync(file);
        deleted++;
      } catch (error) {
        console.error(`❌ Failed to delete ${file}: ${error.message}`);
        failed++;
      }
    });
    
    console.log(`\n✅ Cleanup complete!`);
    console.log(`   Deleted: ${deleted} files`);
    if (failed > 0) {
      console.log(`   Failed: ${failed} files`);
    }
    console.log(`   Space freed: ${totalSizeMB} MB`);
  } else {
    console.log('\n❌ Cleanup cancelled.');
  }
  
  rl.close();
}); 