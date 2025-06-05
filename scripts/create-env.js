#!/usr/bin/env node

/**
 * TwipClip Environment Setup Script
 * 
 * This script creates a .env.local file with the YouTube API key provided by the user.
 * It can be run as a standalone script or from the setup wizard.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

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

// Only create an interface if we're running this script directly
const isRunningDirectly = require.main === module;
let rl;

if (isRunningDirectly) {
  rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  console.log(`
${colors.cyan}${colors.bold}============================
  TwipClip Environment Setup
============================${colors.reset}
  
This script will create a .env.local file with your YouTube API key.
  `);
}

/**
 * Creates a .env.local file with the provided YouTube API key
 * @param {string} apiKey The YouTube API key to use
 * @param {Function} callback Optional callback to execute after creation
 */
function createEnvFile(apiKey, callback) {
  const envPath = path.join(__dirname, '..', '.env.local');
  const envContent = `# TwipClip Environment Configuration
# Created automatically by the setup script

# YouTube API Key
YOUTUBE_API_KEY=${apiKey}

# You can add other environment variables here if needed
`;

  try {
    fs.writeFileSync(envPath, envContent);
    console.log(`\n${colors.green}✓ Created .env.local file successfully!${colors.reset}`);
    
    if (callback) {
      callback(null);
    }
  } catch (error) {
    console.error(`\n${colors.red}Error creating .env.local file: ${error.message}${colors.reset}`);
    console.log(`\nTry creating it manually with the following content:`);
    console.log(`\n${colors.cyan}${envContent}${colors.reset}`);
    
    if (callback) {
      callback(error);
    }
  }
}

/**
 * Validates the format of a YouTube API key
 * @param {string} apiKey The API key to validate
 * @returns {boolean} Whether the key is valid
 */
function isValidApiKey(apiKey) {
  // Basic validation - YouTube API keys are typically 39 characters
  // and contain alphanumeric characters with some special chars
  return /^[A-Za-z0-9_-]{30,50}$/.test(apiKey) || apiKey === 'your_youtube_api_key_here';
}

/**
 * Main execution function when running the script directly
 */
function main() {
  rl.question(`Enter your YouTube API Key: `, (apiKey) => {
    apiKey = apiKey.trim();
    
    if (!apiKey) {
      apiKey = 'your_youtube_api_key_here';
      console.log(`\n${colors.yellow}No API key provided. Using placeholder value.${colors.reset}`);
      console.log(`${colors.yellow}You'll need to update this with a real API key before using TwipClip.${colors.reset}`);
    } else if (!isValidApiKey(apiKey)) {
      console.log(`\n${colors.yellow}Warning: The API key format doesn't look right.${colors.reset}`);
      console.log(`${colors.yellow}YouTube API keys are typically 39 characters long.${colors.reset}`);
      
      rl.question(`Use this key anyway? (y/n): `, (answer) => {
        if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
          createEnvFile(apiKey, () => rl.close());
        } else {
          console.log(`\n${colors.cyan}Please run this script again with a valid API key.${colors.reset}`);
          rl.close();
        }
      });
      return;
    }
    
    createEnvFile(apiKey, () => rl.close());
  });
}

// If running directly, execute the main function
if (isRunningDirectly) {
  main();
}

// Export for use in other scripts
module.exports = {
  createEnvFile,
  isValidApiKey
}; 