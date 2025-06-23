import { YouTubeAuthManagerV2, YouTubeAuthConfig } from './youtube-auth-v2';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * Platform-aware authentication adapter
 * Handles authentication differently based on deployment environment
 */
export class PlatformAuthAdapter {
  /**
   * Check if running on Railway
   */
  static isRailway(): boolean {
    return process.env.RAILWAY_ENVIRONMENT === 'production' || 
           process.env.RAILWAY_DEPLOYMENT_ID !== undefined;
  }

  /**
   * Get authentication configuration based on platform
   */
  static async getAuthConfig(sessionId?: string): Promise<YouTubeAuthConfig | null> {
    // Railway deployment: Use environment-based cookies
    if (this.isRailway()) {
      return this.getRailwayAuthConfig();
    }

    // Local development: Use browser-based authentication
    const status = await YouTubeAuthManagerV2.getAuthStatus(sessionId);
    if (status.authenticated && status.browser) {
      return {
        browser: status.browser,
        profile: status.profile
      };
    }

    return null;
  }

  /**
   * Get Railway-specific authentication configuration
   */
  private static getRailwayAuthConfig(): YouTubeAuthConfig | null {
    // Option 1: Use cookie file from environment variable
    const cookiesBase64 = process.env.YOUTUBE_COOKIES_BASE64;
    if (cookiesBase64) {
      try {
        const cookiePath = this.setupCookieFile(cookiesBase64);
        if (cookiePath) {
          // Return a special config that tells yt-dlp to use the cookie file
          return {
            browser: 'firefox', // Use firefox as it's installed in the container
            profile: cookiePath // Pass cookie file path as profile
          };
        }
      } catch (error) {
        console.error('Failed to setup cookie file:', error);
      }
    }

    // Option 2: Try to use container's Chromium (if logged in somehow)
    if (existsSync('/usr/bin/chromium')) {
      return {
        browser: 'chromium',
        profile: 'Default'
      };
    }

    // Option 3: No authentication available
    console.warn('No authentication available on Railway. Only public videos will work.');
    return null;
  }

  /**
   * Setup cookie file from base64 encoded environment variable
   */
  private static setupCookieFile(cookiesBase64: string): string | null {
    try {
      const tempDir = join(process.cwd(), 'temp', 'cookies');
      mkdirSync(tempDir, { recursive: true });
      
      const cookiePath = join(tempDir, 'youtube-cookies.txt');
      const cookieContent = Buffer.from(cookiesBase64, 'base64').toString('utf-8');
      
      writeFileSync(cookiePath, cookieContent);
      console.log('Cookie file created for Railway deployment');
      
      return cookiePath;
    } catch (error) {
      console.error('Failed to create cookie file:', error);
      return null;
    }
  }

  /**
   * Get yt-dlp arguments based on platform
   */
  static getYtdlpAuthArgs(config: YouTubeAuthConfig | null): string[] {
    if (!config) return [];

    // Railway with cookie file
    if (this.isRailway() && config.profile?.endsWith('.txt')) {
      return ['--cookies', config.profile];
    }

    // Normal browser-based authentication
    return YouTubeAuthManagerV2.getBrowserCookieArgs(config);
  }

  /**
   * Get platform-specific warnings
   */
  static getPlatformWarnings(): string[] {
    const warnings: string[] = [];

    if (this.isRailway()) {
      warnings.push(
        'Running on Railway - browser authentication is limited',
        'Using environment-based authentication if available'
      );

      if (!process.env.YOUTUBE_COOKIES_BASE64) {
        warnings.push(
          'No YOUTUBE_COOKIES_BASE64 set - only public videos will work',
          'See Railway deployment guide for setup instructions'
        );
      }
    }

    return warnings;
  }

  /**
   * Get deployment information
   */
  static getDeploymentInfo(): Record<string, any> {
    return {
      platform: this.isRailway() ? 'railway' : 'local',
      hasEnvCookies: !!process.env.YOUTUBE_COOKIES_BASE64,
      railwayDeploymentId: process.env.RAILWAY_DEPLOYMENT_ID,
      railwayEnvironment: process.env.RAILWAY_ENVIRONMENT,
      nodeEnv: process.env.NODE_ENV
    };
  }
} 