#!/usr/bin/env node

const path = require('path');
const fs = require('fs');

console.log('🔍 Debugging Cookie Paths\n');

// Check environment
const isDocker = process.env.RAILWAY_ENVIRONMENT || process.env.DOCKER_ENV || process.env.NODE_ENV === 'production';
console.log('Environment Detection:');
console.log(`  RAILWAY_ENVIRONMENT: ${process.env.RAILWAY_ENVIRONMENT || 'not set'}`);
console.log(`  DOCKER_ENV: ${process.env.DOCKER_ENV || 'not set'}`);
console.log(`  NODE_ENV: ${process.env.NODE_ENV || 'not set'}`);
console.log(`  Is Docker/Production: ${isDocker}`);

// Check base directories
console.log('\nBase Directories:');
console.log(`  process.cwd(): ${process.cwd()}`);
console.log(`  __dirname: ${__dirname}`);
console.log(`  Expected base dir: ${isDocker ? '/app' : process.cwd()}`);

// Check temp directory
const baseDir = isDocker ? '/app' : process.cwd();
const tempDir = path.join(baseDir, 'temp');
console.log('\nTemp Directory:');
console.log(`  Path: ${tempDir}`);
console.log(`  Exists: ${fs.existsSync(tempDir)}`);

// Check user-cookies directory
const userCookiesDir = path.join(tempDir, 'user-cookies');
console.log('\nUser Cookies Directory:');
console.log(`  Path: ${userCookiesDir}`);
console.log(`  Exists: ${fs.existsSync(userCookiesDir)}`);

// List session directories if they exist
if (fs.existsSync(userCookiesDir)) {
  const sessions = fs.readdirSync(userCookiesDir);
  console.log(`  Sessions found: ${sessions.length}`);
  
  sessions.forEach(session => {
    const cookieFile = path.join(userCookiesDir, session, 'youtube_cookies.txt');
    if (fs.existsSync(cookieFile)) {
      const stats = fs.statSync(cookieFile);
      console.log(`\n  Session ${session.substring(0, 8)}...:`);
      console.log(`    Cookie file: ${cookieFile}`);
      console.log(`    Size: ${stats.size} bytes`);
      console.log(`    Modified: ${stats.mtime}`);
      
      // Check content
      try {
        const content = fs.readFileSync(cookieFile, 'utf-8');
        const lines = content.split('\n');
        const cookieLines = lines.filter(l => l.trim() && !l.startsWith('#'));
        console.log(`    Cookie entries: ${cookieLines.length}`);
        console.log(`    Has YouTube cookies: ${content.includes('.youtube.com')}`);
      } catch (e) {
        console.log(`    Error reading file: ${e.message}`);
      }
    }
  });
}

// Test session ID from argument
const sessionId = process.argv[2];
if (sessionId) {
  console.log(`\n🔐 Testing specific session: ${sessionId}`);
  const userCookiePath = path.join(baseDir, 'temp', 'user-cookies', sessionId, 'youtube_cookies.txt');
  console.log(`  Expected path: ${userCookiePath}`);
  console.log(`  File exists: ${fs.existsSync(userCookiePath)}`);
  
  if (fs.existsSync(userCookiePath)) {
    const stats = fs.statSync(userCookiePath);
    console.log(`  File size: ${stats.size} bytes`);
    console.log(`  Last modified: ${stats.mtime}`);
  }
}

console.log('\n✨ Debug complete!'); 