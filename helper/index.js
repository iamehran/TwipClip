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
                } else if (error.message.includes('browser is running')) {
                    console.log(chalk.yellow('Please close your browser and try again.\n'));
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
        
        for (const browser of SUPPORTED_BROWSERS) {
            const isAvailable = await this.isBrowserAvailable(browser);
            if (isAvailable) {
                detectedBrowsers.push(browser);
            }
        }
        
        return detectedBrowsers;
    }

    async isBrowserAvailable(browser) {
        try {
            const { stdout } = await execAsync(
                `yt-dlp --cookies-from-browser ${browser} --skip-download --print-json https://www.youtube.com 2>&1`,
                { timeout: 5000 }
            );
            return stdout.includes('"id"') || stdout.includes('"title"');
        } catch (error) {
            if (error.stderr && error.stderr.includes('No cookies found')) {
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
            const command = `yt-dlp --cookies-from-browser ${browser} --cookies "${cookiePath}" --skip-download https://www.youtube.com`;
            
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

            if (error.message?.includes('Sign in to confirm')) {
                throw new Error('not logged in');
            } else if (error.message?.includes('database is locked')) {
                throw new Error('browser is running (please close it)');
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