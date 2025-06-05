/**
 * TwipClip Dependency Checker
 * 
 * This script checks for required external dependencies and provides installation instructions
 * if they are missing.
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

console.log(`
${colors.cyan}${colors.bold}================================
   TwipClip Dependency Checker
================================${colors.reset}
`);

// List of dependencies to check
const dependencies = [
  {
    name: 'YouTube API Key',
    check: () => {
      return new Promise((resolve) => {
        const envPath = path.join(__dirname, '..', '.env.local');
        if (!fs.existsSync(envPath)) {
          resolve({
            name: 'YouTube API Key',
            installed: false,
            version: null,
            instructions: 'Create a .env.local file with YOUTUBE_API_KEY=your_key_here'
          });
          return;
        }
        
        const envContent = fs.readFileSync(envPath, 'utf8');
        const apiKeyMatch = envContent.match(/YOUTUBE_API_KEY=([^\r\n]+)/);
        
        if (!apiKeyMatch || apiKeyMatch[1] === 'your_youtube_api_key_here') {
          resolve({
            name: 'YouTube API Key',
            installed: false,
            version: null,
            instructions: 'Set your YouTube API key in .env.local'
          });
        } else {
          resolve({
            name: 'YouTube API Key',
            installed: true,
            version: 'configured',
            instructions: null
          });
        }
      });
    }
  },
  {
    name: 'yt-dlp',
    check: () => {
      return new Promise((resolve) => {
        exec('yt-dlp --version', (error, stdout, stderr) => {
          if (error) {
            resolve({
              name: 'yt-dlp',
              installed: false,
              version: null,
              instructions: 'Install yt-dlp: https://github.com/yt-dlp/yt-dlp#installation'
            });
          } else {
            resolve({
              name: 'yt-dlp',
              installed: true,
              version: stdout.trim(),
              instructions: null
            });
          }
        });
      });
    }
  },
  {
    name: 'Node.js',
    check: () => {
      return new Promise((resolve) => {
        exec('node --version', (error, stdout, stderr) => {
          if (error) {
            resolve({
              name: 'Node.js',
              installed: false,
              version: null,
              instructions: 'Install Node.js: https://nodejs.org/'
            });
          } else {
            const version = stdout.trim();
            const versionNumber = parseFloat(version.replace('v', ''));
            
            if (versionNumber < 18) {
              resolve({
                name: 'Node.js',
                installed: true,
                version: version,
                instructions: 'Upgrade to Node.js 18 or higher: https://nodejs.org/'
              });
            } else {
              resolve({
                name: 'Node.js',
                installed: true,
                version: version,
                instructions: null
              });
            }
          }
        });
      });
    }
  }
];

// Check all dependencies
Promise.all(dependencies.map(dep => dep.check()))
  .then(results => {
    console.log(`${colors.cyan}Checking required dependencies:${colors.reset}\n`);
    
    let allInstalled = true;
    const missingDeps = [];
    
    results.forEach(result => {
      if (result.installed) {
        console.log(`${colors.green}✓ ${result.name}${colors.reset} ${result.version ? `(${result.version})` : ''}`);
        
        if (result.instructions) {
          console.log(`  ${colors.yellow}⚠ ${result.instructions}${colors.reset}`);
          allInstalled = false;
          missingDeps.push(result);
        }
      } else {
        console.log(`${colors.red}✗ ${result.name}${colors.reset}`);
        console.log(`  ${colors.yellow}${result.instructions}${colors.reset}`);
        allInstalled = false;
        missingDeps.push(result);
      }
    });
    
    console.log('\n');
    
    if (allInstalled) {
      console.log(`${colors.green}${colors.bold}All dependencies installed! TwipClip is ready to use.${colors.reset}`);
      console.log(`Run ${colors.cyan}npm run dev${colors.reset} to start the development server.`);
    } else {
      console.log(`${colors.yellow}${colors.bold}Some dependencies are missing or need configuration:${colors.reset}\n`);
      
      missingDeps.forEach(dep => {
        console.log(`${colors.yellow}• ${dep.name}: ${dep.instructions}${colors.reset}`);
      });
      
      console.log(`\nRun ${colors.cyan}npm run setup${colors.reset} for an interactive setup process.`);
    }
    
    console.log('\n');
  })
  .catch(error => {
    console.error(`${colors.red}Error checking dependencies:${colors.reset}`, error);
  }); 