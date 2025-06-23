import { exec } from 'child_process';
import { promisify } from 'util';
import { platform } from 'os';
import { existsSync } from 'fs';
import path from 'path';

const execAsync = promisify(exec);

export interface BrowserInfo {
  name: string;
  displayName: string;
  available: boolean;
  profiles?: string[];
  isRunning?: boolean;
}

export class BrowserDetector {
  private static cache: Map<string, BrowserInfo> = new Map();
  private static lastDetection: number = 0;
  private static CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  /**
   * Get list of supported browsers for yt-dlp
   */
  static getSupportedBrowsers(): string[] {
    return ['chrome', 'chromium', 'firefox', 'edge', 'brave', 'opera', 'vivaldi', 'safari'];
  }

  /**
   * Detect all available browsers on the system
   */
  static async detectBrowsers(forceRefresh = false): Promise<BrowserInfo[]> {
    // Use cache if available and not expired
    if (!forceRefresh && 
        this.cache.size > 0 && 
        Date.now() - this.lastDetection < this.CACHE_DURATION) {
      return Array.from(this.cache.values());
    }

    const browsers: BrowserInfo[] = [];
    const supportedBrowsers = this.getSupportedBrowsers();

    for (const browser of supportedBrowsers) {
      const info = await this.checkBrowser(browser);
      if (info.available) {
        browsers.push(info);
        this.cache.set(browser, info);
      }
    }

    this.lastDetection = Date.now();
    return browsers;
  }

  /**
   * Check if a specific browser is available
   */
  private static async checkBrowser(browserName: string): Promise<BrowserInfo> {
    const info: BrowserInfo = {
      name: browserName,
      displayName: this.getDisplayName(browserName),
      available: false
    };

    try {
      switch (platform()) {
        case 'win32':
          info.available = await this.checkWindowsBrowser(browserName);
          info.isRunning = await this.isBrowserRunningWindows(browserName);
          break;
        case 'darwin':
          info.available = await this.checkMacBrowser(browserName);
          info.isRunning = await this.isBrowserRunningMac(browserName);
          break;
        case 'linux':
          info.available = await this.checkLinuxBrowser(browserName);
          info.isRunning = await this.isBrowserRunningLinux(browserName);
          break;
      }

      // Get browser profiles if available
      if (info.available) {
        info.profiles = await this.getBrowserProfiles(browserName);
      }
    } catch (error) {
      console.warn(`Failed to check ${browserName}:`, error);
    }

    return info;
  }

  /**
   * Check browser availability on Windows
   */
  private static async checkWindowsBrowser(browserName: string): Promise<boolean> {
    const paths = this.getWindowsBrowserPaths(browserName);
    
    for (const browserPath of paths) {
      if (existsSync(browserPath)) {
        return true;
      }
    }

    // Also check registry
    try {
      const { stdout } = await execAsync(
        `reg query "HKLM\\SOFTWARE\\Clients\\StartMenuInternet" /s /f "${browserName}" 2>nul`,
        { shell: 'cmd' }
      );
      return stdout.toLowerCase().includes(browserName.toLowerCase());
    } catch {
      return false;
    }
  }

  /**
   * Check browser availability on macOS
   */
  private static async checkMacBrowser(browserName: string): Promise<boolean> {
    const appNames = this.getMacAppNames(browserName);
    
    for (const appName of appNames) {
      const appPath = `/Applications/${appName}.app`;
      if (existsSync(appPath)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check browser availability on Linux
   */
  private static async checkLinuxBrowser(browserName: string): Promise<boolean> {
    try {
      const { stdout } = await execAsync(`which ${browserName} 2>/dev/null`);
      return stdout.trim().length > 0;
    } catch {
      // Try alternative names
      const altNames = this.getLinuxBrowserCommands(browserName);
      for (const cmd of altNames) {
        try {
          const { stdout } = await execAsync(`which ${cmd} 2>/dev/null`);
          if (stdout.trim().length > 0) return true;
        } catch {}
      }
      return false;
    }
  }

  /**
   * Check if browser is currently running on Windows
   */
  private static async isBrowserRunningWindows(browserName: string): Promise<boolean> {
    const processNames = this.getWindowsProcessNames(browserName);
    
    for (const processName of processNames) {
      try {
        const { stdout } = await execAsync(
          `tasklist /FI "IMAGENAME eq ${processName}" 2>nul | find /I "${processName}"`,
          { shell: 'cmd' }
        );
        if (stdout.trim().length > 0) return true;
      } catch {}
    }
    
    return false;
  }

  /**
   * Check if browser is currently running on macOS
   */
  private static async isBrowserRunningMac(browserName: string): Promise<boolean> {
    const appNames = this.getMacAppNames(browserName);
    
    for (const appName of appNames) {
      try {
        const { stdout } = await execAsync(`pgrep -f "${appName}"`);
        if (stdout.trim().length > 0) return true;
      } catch {}
    }
    
    return false;
  }

  /**
   * Check if browser is currently running on Linux
   */
  private static async isBrowserRunningLinux(browserName: string): Promise<boolean> {
    const processNames = this.getLinuxProcessNames(browserName);
    
    for (const processName of processNames) {
      try {
        const { stdout } = await execAsync(`pgrep -f "${processName}"`);
        if (stdout.trim().length > 0) return true;
      } catch {}
    }
    
    return false;
  }

  /**
   * Get browser profiles
   */
  private static async getBrowserProfiles(browserName: string): Promise<string[]> {
    const profiles: string[] = ['Default'];
    
    try {
      const profilePath = this.getProfilePath(browserName);
      if (!profilePath) return profiles;

      // Read profile directories
      if (browserName === 'firefox') {
        // Firefox uses profiles.ini
        const profilesIniPath = path.join(profilePath, 'profiles.ini');
        if (existsSync(profilesIniPath)) {
          // Parse profiles.ini to get profile names
          // This is simplified - full implementation would parse INI properly
          profiles.push('default-release');
        }
      } else {
        // Chromium-based browsers
        const localStatePath = path.join(profilePath, 'Local State');
        if (existsSync(localStatePath)) {
          // Read Local State file to get profile info
          // This would parse JSON to get actual profile names
          profiles.push('Profile 1', 'Profile 2');
        }
      }
    } catch (error) {
      console.warn(`Failed to get profiles for ${browserName}:`, error);
    }

    return profiles;
  }

  /**
   * Get profile directory path for browser
   */
  private static getProfilePath(browserName: string): string | null {
    const home = process.env.HOME || process.env.USERPROFILE || '';
    
    switch (platform()) {
      case 'win32':
        const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
        const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
        
        switch (browserName) {
          case 'chrome':
            return path.join(localAppData, 'Google', 'Chrome', 'User Data');
          case 'edge':
            return path.join(localAppData, 'Microsoft', 'Edge', 'User Data');
          case 'firefox':
            return path.join(appData, 'Mozilla', 'Firefox');
          case 'brave':
            return path.join(localAppData, 'BraveSoftware', 'Brave-Browser', 'User Data');
          default:
            return null;
        }
        
      case 'darwin':
        const library = path.join(home, 'Library');
        
        switch (browserName) {
          case 'chrome':
            return path.join(library, 'Application Support', 'Google', 'Chrome');
          case 'edge':
            return path.join(library, 'Application Support', 'Microsoft Edge');
          case 'firefox':
            return path.join(library, 'Application Support', 'Firefox');
          case 'safari':
            return path.join(library, 'Safari');
          case 'brave':
            return path.join(library, 'Application Support', 'BraveSoftware', 'Brave-Browser');
          default:
            return null;
        }
        
      case 'linux':
        switch (browserName) {
          case 'chrome':
            return path.join(home, '.config', 'google-chrome');
          case 'chromium':
            return path.join(home, '.config', 'chromium');
          case 'firefox':
            return path.join(home, '.mozilla', 'firefox');
          case 'brave':
            return path.join(home, '.config', 'BraveSoftware', 'Brave-Browser');
          default:
            return null;
        }
        
      default:
        return null;
    }
  }

  /**
   * Helper methods for browser-specific paths and names
   */
  private static getWindowsBrowserPaths(browserName: string): string[] {
    const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files';
    const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    
    switch (browserName) {
      case 'chrome':
        return [
          path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
          path.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe')
        ];
      case 'firefox':
        return [
          path.join(programFiles, 'Mozilla Firefox', 'firefox.exe'),
          path.join(programFilesX86, 'Mozilla Firefox', 'firefox.exe')
        ];
      case 'edge':
        return [
          path.join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
          path.join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe')
        ];
      case 'brave':
        return [
          path.join(programFiles, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
          path.join(programFilesX86, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe')
        ];
      default:
        return [];
    }
  }

  private static getMacAppNames(browserName: string): string[] {
    switch (browserName) {
      case 'chrome': return ['Google Chrome'];
      case 'firefox': return ['Firefox'];
      case 'safari': return ['Safari'];
      case 'edge': return ['Microsoft Edge'];
      case 'brave': return ['Brave Browser'];
      case 'opera': return ['Opera'];
      default: return [browserName];
    }
  }

  private static getLinuxBrowserCommands(browserName: string): string[] {
    switch (browserName) {
      case 'chrome': return ['google-chrome', 'google-chrome-stable'];
      case 'firefox': return ['firefox', 'firefox-esr'];
      case 'brave': return ['brave-browser', 'brave'];
      default: return [browserName];
    }
  }

  private static getWindowsProcessNames(browserName: string): string[] {
    switch (browserName) {
      case 'chrome': return ['chrome.exe'];
      case 'firefox': return ['firefox.exe'];
      case 'edge': return ['msedge.exe'];
      case 'brave': return ['brave.exe'];
      default: return [`${browserName}.exe`];
    }
  }

  private static getLinuxProcessNames(browserName: string): string[] {
    switch (browserName) {
      case 'chrome': return ['chrome', 'google-chrome'];
      case 'firefox': return ['firefox', 'firefox-esr'];
      case 'brave': return ['brave', 'brave-browser'];
      default: return [browserName];
    }
  }

  private static getDisplayName(browserName: string): string {
    const names: Record<string, string> = {
      chrome: 'Google Chrome',
      chromium: 'Chromium',
      firefox: 'Mozilla Firefox',
      edge: 'Microsoft Edge',
      brave: 'Brave',
      opera: 'Opera',
      vivaldi: 'Vivaldi',
      safari: 'Safari'
    };
    return names[browserName] || browserName;
  }

  /**
   * Get the best available browser for cookie extraction
   */
  static async getBestBrowser(): Promise<string | null> {
    const browsers = await this.detectBrowsers();
    
    // Priority order for browsers
    const priority = ['chrome', 'firefox', 'edge', 'brave', 'chromium', 'safari', 'opera', 'vivaldi'];
    
    // First, try browsers that are not running (better for cookie extraction on Windows)
    for (const browserName of priority) {
      const browser = browsers.find(b => b.name === browserName && !b.isRunning);
      if (browser) return browser.name;
    }
    
    // If all are running, return the first available
    for (const browserName of priority) {
      const browser = browsers.find(b => b.name === browserName);
      if (browser) return browser.name;
    }
    
    return null;
  }
} 