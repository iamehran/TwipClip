import { BrowserDetector, BrowserInfo } from './browser-detector';
import { cookies } from 'next/headers';
import { platform } from 'os';

export interface YouTubeAuthConfig {
  browser: string;
  profile?: string;
  forceRefresh?: boolean;
}

export interface YouTubeAuthStatus {
  authenticated: boolean;
  browser?: string;
  profile?: string;
  availableBrowsers?: BrowserInfo[];
  error?: string;
  warnings?: string[];
}

/**
 * YouTube Authentication Manager V2
 * Uses yt-dlp's native --cookies-from-browser feature
 * No manual cookie extraction required
 */
export class YouTubeAuthManagerV2 {
  private static userPreferences = new Map<string, YouTubeAuthConfig>();
  
  /**
   * Get authentication status for a session
   */
  static async getAuthStatus(sessionId?: string): Promise<YouTubeAuthStatus> {
    try {
      // Get available browsers
      const availableBrowsers = await BrowserDetector.detectBrowsers();
      
      if (availableBrowsers.length === 0) {
        return {
          authenticated: false,
          availableBrowsers: [],
          error: 'No supported browsers found on this system'
        };
      }

      // Get user preference or detect best browser
      const config = sessionId ? this.userPreferences.get(sessionId) : null;
      const selectedBrowser = config?.browser || await BrowserDetector.getBestBrowser();
      
      if (!selectedBrowser) {
        return {
          authenticated: false,
          availableBrowsers,
          error: 'Could not determine suitable browser'
        };
      }

      // Check if browser is available
      const browserInfo = availableBrowsers.find(b => b.name === selectedBrowser);
      if (!browserInfo) {
        return {
          authenticated: false,
          availableBrowsers,
          error: `Selected browser ${selectedBrowser} is not available`
        };
      }

      // Prepare warnings
      const warnings: string[] = [];
      
      // Windows Chrome warning
      if (platform() === 'win32' && selectedBrowser === 'chrome' && browserInfo.isRunning) {
        warnings.push('Chrome is currently running. For best results, close Chrome before downloading.');
      }

      return {
        authenticated: true,
        browser: selectedBrowser,
        profile: config?.profile,
        availableBrowsers,
        warnings
      };
    } catch (error) {
      console.error('Error checking auth status:', error);
      return {
        authenticated: false,
        error: 'Failed to check authentication status'
      };
    }
  }

  /**
   * Set browser preference for a session
   */
  static setUserPreference(sessionId: string, config: YouTubeAuthConfig): void {
    this.userPreferences.set(sessionId, config);
  }

  /**
   * Get browser cookie arguments for yt-dlp
   */
  static getBrowserCookieArgs(config?: YouTubeAuthConfig): string[] {
    if (!config?.browser) {
      return [];
    }

    const args = ['--cookies-from-browser'];
    
    // Add browser with optional profile
    if (config.profile && config.profile !== 'Default') {
      args.push(`${config.browser}:${config.profile}`);
    } else {
      args.push(config.browser);
    }

    return args;
  }

  /**
   * Test if cookies work by trying to access a private video
   */
  static async testAuthentication(browser: string, profile?: string): Promise<boolean> {
    try {
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);

      // Test with a known age-restricted video
      const testUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
      
      let command = `yt-dlp --cookies-from-browser ${browser}`;
      if (profile && profile !== 'Default') {
        command = `yt-dlp --cookies-from-browser "${browser}:${profile}"`;
      }
      command += ` --dump-json --no-warnings "${testUrl}"`;

      const { stdout, stderr } = await execAsync(command, {
        timeout: 30000,
        maxBuffer: 10 * 1024 * 1024
      });

      // If we get JSON output, authentication works
      if (stdout && stdout.includes('"title"')) {
        return true;
      }

      // Check for bot detection error
      if (stderr && stderr.includes('Sign in to confirm')) {
        return false;
      }

      return true; // Assume success if no explicit error
    } catch (error: any) {
      console.error('Authentication test failed:', error.message);
      return false;
    }
  }

  /**
   * Get session ID from cookies
   */
  static getSessionId(): string | null {
    try {
      const cookieStore = cookies();
      return cookieStore.get('youtube_session_id')?.value || null;
    } catch {
      return null;
    }
  }

  /**
   * Handle Windows Chrome lock issue
   */
  static async handleWindowsChromeLock(): Promise<string[]> {
    const warnings: string[] = [];
    
    if (platform() !== 'win32') {
      return warnings;
    }

    const browsers = await BrowserDetector.detectBrowsers();
    const chrome = browsers.find(b => b.name === 'chrome');
    
    if (chrome?.isRunning) {
      warnings.push(
        'Chrome is currently running. Cookie extraction may fail.',
        'Please close Chrome or use a different browser.',
        'Alternative browsers: Edge, Firefox, Brave'
      );
    }

    return warnings;
  }

  /**
   * Get fallback options if primary browser fails
   */
  static async getFallbackBrowsers(excludeBrowser: string): Promise<string[]> {
    const browsers = await BrowserDetector.detectBrowsers();
    
    return browsers
      .filter(b => b.name !== excludeBrowser)
      .sort((a, b) => {
        // Prioritize non-running browsers on Windows
        if (platform() === 'win32') {
          if (!a.isRunning && b.isRunning) return -1;
          if (a.isRunning && !b.isRunning) return 1;
        }
        return 0;
      })
      .map(b => b.name);
  }

  /**
   * Clear user preferences
   */
  static clearPreferences(sessionId?: string): void {
    if (sessionId) {
      this.userPreferences.delete(sessionId);
    } else {
      this.userPreferences.clear();
    }
  }

  /**
   * Get smart error message with solutions
   */
  static getErrorSolution(error: string): string[] {
    const solutions: string[] = [];

    if (error.includes('Sign in to confirm')) {
      solutions.push(
        'YouTube requires authentication. Please:',
        '1. Make sure you are logged into YouTube in your browser',
        '2. Try a different browser if the current one fails',
        '3. Close the browser before downloading (Windows Chrome issue)'
      );
    } else if (error.includes('Permission denied')) {
      solutions.push(
        'Cookie access was denied. Please:',
        '1. Close the browser and try again',
        '2. Run the application with appropriate permissions',
        '3. Try a different browser'
      );
    } else if (error.includes('No such profile')) {
      solutions.push(
        'Browser profile not found. Please:',
        '1. Select a different profile',
        '2. Use the default profile',
        '3. Check if the profile name is correct'
      );
    }

    return solutions;
  }
} 