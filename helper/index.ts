#!/usr/bin/env node

import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFileSync, readFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { homedir, platform, tmpdir } from 'os';
import { join } from 'path';
import clipboardy from 'clipboardy';
import chalk from 'chalk';
import ora from 'ora';
import prompts from 'prompts';
import crypto from 'crypto';

const execAsync = promisify(exec);

// Configuration
const APP_NAME = 'TwipClip Auth Helper';
const VERSION = '1.0.0';
const SUPPORTED_BROWSERS = ['chrome', 'firefox', 'edge', 'brave', 'safari'];

// Encryption key (in production, this should be more secure)
const ENCRYPTION_KEY = 'TwipClip2024AuthKey-DoNotShare!!';

class TwipClipAuthHelper {
  private tempDir: string;

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
      // Step 1: Check for yt-dlp
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

      // Step 2: Detect available browsers
      const browsers = await this.detectBrowsers();
      if (browsers.length === 0) {
        console.log(chalk.red('❌ No supported browsers found.'));
        console.log(chalk.yellow('Supported browsers: Chrome, Firefox, Edge, Brave, Safari\n'));
        await this.waitForExit();
        return;
      }

      // Step 3: Let user select browser
      const selectedBrowser = await this.selectBrowser(browsers);
      if (!selectedBrowser) {
        console.log(chalk.yellow('\nOperation cancelled.\n'));
        return;
      }

      // Step 4: Extract cookies
      console.log();
      const spinner = ora('Extracting YouTube cookies...').start();
      
      try {
        const cookieData = await this.extractCookies(selectedBrowser);
        spinner.succeed('Cookies extracted successfully!');

        // Step 5: Encrypt and format
        const authToken = this.createAuthToken(cookieData, selectedBrowser);

        // Step 6: Copy to clipboard
        await clipboardy.write(authToken);
        
        console.log(chalk.green.bold('\n✅ Success! YouTube authentication token copied to clipboard.\n'));
        console.log(chalk.white('Next steps:'));
        console.log(chalk.white('1. Go back to TwipClip in your browser'));
        console.log(chalk.white('2. Click on "YouTube Authentication"'));
        console.log(chalk.white('3. Paste the token (Ctrl+V / Cmd+V)'));
        console.log(chalk.white('4. Click "Activate"\n'));
        
        console.log(chalk.gray('This token will work for 30-60 days.'));
        console.log(chalk.gray('Run this helper again when it expires.\n'));

      } catch (error: any) {
        spinner.fail('Failed to extract cookies');
        console.log(chalk.red(`\nError: ${error.message}\n`));
        
        if (error.message.includes('not logged in')) {
          console.log(chalk.yellow('Please make sure you are logged into YouTube in your browser.\n'));
        } else if (error.message.includes('browser is running')) {
          console.log(chalk.yellow('Please close your browser and try again.\n'));
        }
      }

    } catch (error: any) {
      console.log(chalk.red(`\nUnexpected error: ${error.message}\n`));
    }

    await this.waitForExit();
  }

  private async checkYtdlp(): Promise<boolean> {
    try {
      await execAsync('yt-dlp --version');
      return true;
    } catch {
      return false;
    }
  }

  private async detectBrowsers(): Promise<string[]> {
    const detectedBrowsers: string[] = [];
    
    for (const browser of SUPPORTED_BROWSERS) {
      const isAvailable = await this.isBrowserAvailable(browser);
      if (isAvailable) {
        detectedBrowsers.push(browser);
      }
    }

    return detectedBrowsers;
  }

  private async isBrowserAvailable(browser: string): Promise<boolean> {
    try {
      // Quick check using yt-dlp's browser detection
      const { stdout } = await execAsync(
        `yt-dlp --cookies-from-browser ${browser} --skip-download --print-json https://www.youtube.com 2>&1`,
        { timeout: 5000 }
      );
      
      // If we get JSON output, browser is available
      return stdout.includes('"id"') || stdout.includes('"title"');
    } catch (error: any) {
      // Check if it's just "not logged in" error (browser exists but no cookies)
      if (error.stderr && error.stderr.includes('No cookies found')) {
        return true; // Browser exists, just no cookies
      }
      return false;
    }
  }

  private async selectBrowser(browsers: string[]): Promise<string | null> {
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

  private getBrowserDisplayName(browser: string): string {
    const names: Record<string, string> = {
      chrome: 'Google Chrome',
      firefox: 'Mozilla Firefox',
      edge: 'Microsoft Edge',
      brave: 'Brave Browser',
      safari: 'Safari'
    };
    return names[browser] || browser;
  }

  private async extractCookies(browser: string): Promise<string> {
    const cookiePath = join(this.tempDir, 'youtube_cookies.txt');
    
    try {
      // Extract cookies using yt-dlp
      const command = `yt-dlp --cookies-from-browser ${browser} --cookies "${cookiePath}" --skip-download https://www.youtube.com`;
      
      await execAsync(command, {
        timeout: 30000,
        maxBuffer: 10 * 1024 * 1024
      });

      // Read the cookie file
      if (!existsSync(cookiePath)) {
        throw new Error('Cookie file was not created');
      }

      const cookieContent = readFileSync(cookiePath, 'utf-8');
      
      // Clean up
      unlinkSync(cookiePath);

      // Verify we have actual YouTube cookies
      if (!cookieContent.includes('youtube.com')) {
        throw new Error('No YouTube cookies found. Please log into YouTube in your browser.');
      }

      return cookieContent;
    } catch (error: any) {
      // Clean up on error
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

  private createAuthToken(cookieData: string, browser: string): string {
    // Create metadata
    const metadata = {
      version: 1,
      browser,
      timestamp: Date.now(),
      platform: platform()
    };

    // Encrypt cookie data using modern crypto API
    const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(cookieData, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    // Create final token
    const token = {
      metadata,
      data: encrypted,
      iv: iv.toString('base64') // Include IV for decryption
    };

    // Encode as base64
    const tokenString = Buffer.from(JSON.stringify(token)).toString('base64');
    
    // Add prefix for easy identification
    return `TWIPCLIP_AUTH_V1:${tokenString}`;
  }

  private async waitForExit() {
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

// Run the helper
if (require.main === module) {
  const helper = new TwipClipAuthHelper();
  helper.run().catch(console.error);
} 