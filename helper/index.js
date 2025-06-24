#!/usr/bin/env node
"use strict";

const { exec } = require('child_process');
const { promisify } = require('util');
const { writeFileSync, readFileSync, existsSync, mkdirSync, unlinkSync } = require('fs');
const { platform, tmpdir } = require('os');
const { join } = require('path');
const chalk = require('chalk');
const ora = require('ora');
const prompts = require('prompts');
const crypto = require('crypto');

const execAsync = promisify(exec);

const APP_NAME = 'TwipClip Auth Helper';
const VERSION = '1.0.0';
const SUPPORTED_BROWSERS = ['chrome', 'firefox', 'edge', 'brave', 'safari'];
const ENCRYPTION_KEY = 'TwipClip2024AuthKey-DoNotShare!!';

class TwipClipAuthHelper {
    constructor() {
        this.tempDir = join(tmpdir(), 'twipclip-auth');
        if (!existsSync(this.tempDir)) {
            mkdirSync(this.tempDir, { recursive: true });
        }
    }

    async run() {
        console.clear();
        console.log(chalk.cyan.bold(`\n${APP_NAME} v${VERSION}\n`));
        console.log(chalk.gray('This helper extracts YouTube cookies from your browser'));
        console.log(chalk.gray('to enable video downloads in TwipClip.\n'));

        try {
            const ytdlpAvailable = await this.checkYtdlp();
            if (!ytdlpAvailable) {
                console.log(chalk.red('❌ yt-dlp is required but not found.'));
                console.log(chalk.yellow('\nPlease install yt-dlp:'));
                console.log(chalk.white('  Windows: pip install yt-dlp'));
                console.log(chalk.white('  macOS:   brew install yt-dlp'));
                console.log(chalk.white('  Or visit: https://github.com/yt-dlp/yt-dlp\n'));
                await this.waitForExit();
                return;
            }

            const browsers = await this.detectBrowsers();
            if (browsers.length === 0) {
                console.log(chalk.red('❌ No supported browsers found.'));
                console.log(chalk.yellow('Supported browsers: Chrome, Firefox, Edge, Brave, Safari\n'));
                await this.waitForExit();
                return;
            }

            // Show Chrome warning if on Windows
            if (platform() === 'win32' && browsers.includes('chrome')) {
                console.log(chalk.yellow('⚠️  Chrome Note:'));
                console.log(chalk.white('   Recent Chrome versions (v127+) have enhanced security that may'));
                console.log(chalk.white('   prevent cookie extraction on some Windows systems.\n'));
                console.log(chalk.cyan('   Recommended: Use Firefox or Edge for best compatibility.\n'));
            }

            const selectedBrowser = await this.selectBrowser(browsers);
            if (!selectedBrowser) {
                console.log(chalk.yellow('\nOperation cancelled.\n'));
                return;
            }

            console.log();
            const spinner = ora('Extracting YouTube cookies...').start();

            try {
                const cookieData = await this.extractCookies(selectedBrowser);
                spinner.succeed('Cookies extracted successfully!');

                const authToken = this.createAuthToken(cookieData, selectedBrowser);
                
                // Dynamic import for clipboardy
                try {
                    const clipboardy = await import('clipboardy');
                    await clipboardy.default.write(authToken);
                    console.log(chalk.green.bold('\n✅ Success! YouTube authentication token copied to clipboard.\n'));
                } catch (clipError) {
                    console.log(chalk.green.bold('\n✅ Success! Copy this token:\n'));
                    console.log(chalk.white.bgBlack(authToken));
                    console.log();
                }

                console.log(chalk.white('Next steps:'));
                console.log(chalk.white('1. Go back to TwipClip in your browser'));
                console.log(chalk.white('2. Click on "YouTube Authentication"'));
                console.log(chalk.white('3. Paste the token (Ctrl+V / Cmd+V)'));
                console.log(chalk.white('4. Click "Activate"\n'));

                console.log(chalk.gray('This token will work for 30-60 days.'));
                console.log(chalk.gray('Run this helper again when it expires.\n'));

            } catch (error) {
                spinner.fail('Failed to extract cookies');
                console.log(chalk.red(`\nError: ${error.message}\n`));

                if (error.message.includes('not logged in')) {
                    console.log(chalk.yellow('Please make sure you are logged into YouTube in your browser.\n'));
                } else if (error.message.includes('browser is running') || error.message.includes('browser needs to be closed')) {
                    console.log(chalk.yellow('The browser must be completely closed to access cookies.'));
                    console.log(chalk.yellow('This is a security feature of Chrome/Edge.\n'));
                    console.log(chalk.cyan('Steps to fix:'));
                    console.log(chalk.white('1. Close ALL browser windows'));
                    console.log(chalk.white('2. Open Task Manager (Ctrl+Shift+Esc)'));
                    console.log(chalk.white('3. Look for chrome.exe or msedge.exe processes'));
                    console.log(chalk.white('4. End all those processes'));
                    console.log(chalk.white('5. Try again\n'));
                } else if (error.message.includes('permission denied')) {
                    console.log(chalk.yellow('Permission denied - Chrome/Edge database is locked.'));
                    console.log(chalk.yellow('The browser MUST be completely closed.\n'));
                    console.log(chalk.cyan('Alternative: Use Firefox which doesn\'t have this issue.\n'));
                } else if (error.message.includes('DPAPI decrypt failed')) {
                    console.log(chalk.yellow('Chrome/Edge cookie decryption failed.'));
                    console.log(chalk.yellow('This is due to enhanced security in recent versions.\n'));
                    console.log(chalk.cyan('Solutions:'));
                    console.log(chalk.white('1. Use Firefox instead (recommended)'));
                    console.log(chalk.white('2. Completely close Chrome/Edge and try again'));
                    console.log(chalk.white('3. Try running as Administrator'));
                    console.log(chalk.white('4. Use an older browser version\n'));
                }
            }

        } catch (error) {
            console.log(chalk.red(`\nUnexpected error: ${error.message}\n`));
        }

        await this.waitForExit();
    }

    async checkYtdlp() {
        try {
            await execAsync('yt-dlp --version');
            return true;
        } catch {
            return false;
        }
    }

    async detectBrowsers() {
        const detectedBrowsers = [];
        
        console.log(chalk.gray('Detecting installed browsers...\n'));
        
        for (const browser of SUPPORTED_BROWSERS) {
            try {
                const isAvailable = await this.isBrowserAvailable(browser);
                if (isAvailable) {
                    detectedBrowsers.push(browser);
                    console.log(chalk.green(`✓ Found ${this.getBrowserDisplayName(browser)}`));
                }
            } catch (error) {
                // Skip this browser silently
            }
        }
        
        console.log(); // Empty line for spacing
        return detectedBrowsers;
    }

    async isBrowserAvailable(browser) {
        try {
            // Skip Safari on non-macOS systems
            if (browser === 'safari' && platform() !== 'darwin') {
                return false;
            }
            
            // Special handling for Firefox - it's more reliable
            if (browser === 'firefox') {
                // First, try a simple executable check
                try {
                    if (platform() === 'win32') {
                        await execAsync('where firefox', { timeout: 2000 });
                        return true;
                    } else {
                        await execAsync('which firefox', { timeout: 2000 });
                        return true;
                    }
                } catch {
                    // Continue to yt-dlp check
                }
            }
            
            // For Windows Chrome, we need to handle the locked database issue differently
            if (platform() === 'win32' && browser === 'chrome') {
                // Try a simpler check first
                try {
                    await execAsync('where chrome', { timeout: 2000 });
                    return true; // Chrome is installed
                } catch {
                    // Try another method
                }
            }
            
            const { stdout, stderr } = await execAsync(
                `yt-dlp --cookies-from-browser ${browser} --skip-download --print-json https://www.youtube.com 2>&1`,
                { timeout: 5000 }
            );
            
            const output = stdout + (stderr || '');
            
            // If we get JSON output, browser is available
            if (output.includes('"id"') || output.includes('"title"')) {
                return true;
            }
            
            // Check for known error patterns that indicate browser is installed
            if (output.includes('Could not copy Chrome cookie database') || 
                output.includes('Could not copy Edge cookie database') ||
                output.includes('Could not copy Brave cookie database')) {
                return true; // Browser is installed, just locked
            }
            
            // Firefox-specific checks
            if (browser === 'firefox') {
                if (output.includes('could not find Firefox profiles directory') ||
                    output.includes('No cookies found') ||
                    output.includes('Failed to extract cookies')) {
                    return true; // Firefox is installed, just some issue with cookies/profiles
                }
            }
            
            if (output.includes('browser is not installed') || 
                output.includes('could not find') ||
                output.includes('No such file or directory')) {
                return false;
            }
            
            // If we get here and it's a known browser on Windows, assume it's available
            if (platform() === 'win32' && ['chrome', 'edge', 'firefox'].includes(browser)) {
                return true;
            }
            
            return false;
        } catch (error) {
            const errorStr = (error.stdout || '') + (error.stderr || '') + (error.message || '');
            
            // Check if browser is installed but has issues
            if (errorStr.includes('Could not copy') && errorStr.includes('cookie database')) {
                return true;
            }
            
            if (errorStr.includes('No cookies found') || 
                errorStr.includes('Failed to extract cookies')) {
                return true; // Browser exists, just no cookies
            }
            
            // Firefox-specific error handling
            if (browser === 'firefox' && 
                (errorStr.includes('profiles directory') || 
                 errorStr.includes('Firefox') ||
                 errorStr.includes('firefox'))) {
                return true; // Assume Firefox is installed if mentioned in error
            }
            
            // For Windows, be more lenient
            if (platform() === 'win32' && ['chrome', 'edge', 'firefox'].includes(browser)) {
                // These browsers are almost always installed on Windows
                return true;
            }
            
            return false;
        }
    }

    async selectBrowser(browsers) {
        if (browsers.length === 1) {
            console.log(chalk.cyan(`Found browser: ${browsers[0]}`));
            return browsers[0];
        }

        const response = await prompts({
            type: 'select',
            name: 'browser',
            message: 'Select your browser:',
            choices: browsers.map(b => ({
                title: this.getBrowserDisplayName(b),
                value: b
            }))
        });

        return response.browser || null;
    }

    getBrowserDisplayName(browser) {
        const names = {
            chrome: 'Google Chrome',
            firefox: 'Mozilla Firefox',
            edge: 'Microsoft Edge',
            brave: 'Brave Browser',
            safari: 'Safari'
        };
        return names[browser] || browser;
    }

    async extractCookies(browser) {
        const cookiePath = join(this.tempDir, 'youtube_cookies.txt');
        
        try {
            // Special message for Chrome/Edge on Windows
            if (platform() === 'win32' && ['chrome', 'edge'].includes(browser)) {
                console.log(chalk.yellow('\n⚠️  Important: Chrome/Edge must be COMPLETELY closed!'));
                console.log(chalk.white('   1. Close all browser windows'));
                console.log(chalk.white('   2. Check Task Manager for any chrome.exe/msedge.exe processes'));
                console.log(chalk.white('   3. End those processes if found'));
                console.log(chalk.white('   4. Wait 5 seconds before continuing\n'));
                
                // Add a pause to let user read the message
                const response = await prompts({
                    type: 'confirm',
                    name: 'ready',
                    message: 'Have you closed all Chrome/Edge windows and processes?',
                    initial: true
                });
                
                if (!response.ready) {
                    throw new Error('browser needs to be closed');
                }
            }
            
            const command = `yt-dlp --cookies-from-browser ${browser} --cookies "${cookiePath}" --skip-download https://www.youtube.com`;
            
            console.log(chalk.gray('Attempting to extract cookies...'));
            
            await execAsync(command, {
                timeout: 30000,
                maxBuffer: 10 * 1024 * 1024
            });

            if (!existsSync(cookiePath)) {
                throw new Error('Cookie file was not created');
            }

            const cookieContent = readFileSync(cookiePath, 'utf-8');
            
            // Clean up
            unlinkSync(cookiePath);

            if (!cookieContent.includes('youtube.com')) {
                throw new Error('No YouTube cookies found. Please log into YouTube in your browser.');
            }

            return cookieContent;

        } catch (error) {
            if (existsSync(cookiePath)) {
                unlinkSync(cookiePath);
            }

            // Check for specific error patterns
            const errorMessage = error.message || '';
            const errorOutput = error.stdout || error.stderr || '';
            
            if (errorMessage.includes('Sign in to confirm') || errorOutput.includes('Sign in to confirm')) {
                throw new Error('not logged in');
            } else if (errorMessage.includes('database is locked') || errorOutput.includes('database is locked')) {
                throw new Error('browser is running (please close it)');
            } else if (errorMessage.includes('Failed to decrypt with DPAPI') || errorOutput.includes('Failed to decrypt with DPAPI')) {
                throw new Error('DPAPI decrypt failed');
            } else if (errorMessage.includes('Permission denied') || errorOutput.includes('Permission denied')) {
                throw new Error('permission denied - browser must be closed');
            } else if (errorOutput.includes('Python version 3.8') || errorOutput.includes('Deprecated Feature')) {
                console.log(chalk.yellow('\n⚠️  Python 3.8 deprecation warning detected.'));
                console.log(chalk.yellow('   yt-dlp may have issues with Python 3.8.'));
                console.log(chalk.yellow('   Consider updating Python to 3.9 or later.\n'));
                // Don't throw error, just warn
            }
            
            throw error;
        }
    }

    createAuthToken(cookieData, browser) {
        const metadata = {
            version: 1,
            browser,
            timestamp: Date.now(),
            platform: platform()
        };

        // Create encryption key
        const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
        const iv = crypto.randomBytes(16);
        
        // Encrypt cookie data
        const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
        let encrypted = cipher.update(cookieData, 'utf8', 'base64');
        encrypted += cipher.final('base64');

        // Create token
        const token = {
            metadata,
            data: encrypted,
            iv: iv.toString('base64')
        };

        const tokenString = Buffer.from(JSON.stringify(token)).toString('base64');
        return `TWIPCLIP_AUTH_V1:${tokenString}`;
    }

    async waitForExit() {
        if (platform() === 'win32') {
            console.log(chalk.gray('\nPress any key to exit...'));
            process.stdin.setRawMode(true);
            process.stdin.resume();
            process.stdin.on('data', process.exit.bind(process, 0));
        } else {
            console.log(chalk.gray('\nPress Ctrl+C to exit'));
        }
    }
}

// Run the helper if this file is executed directly
if (require.main === module) {
    const helper = new TwipClipAuthHelper();
    helper.run().catch(console.error);
}

module.exports = TwipClipAuthHelper; 