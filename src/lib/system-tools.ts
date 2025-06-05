import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface SystemTools {
  ytdlp: {
    available: boolean;
    command: string;
    version?: string;
  };
  ffmpeg: {
    available: boolean;
    command: string;
    version?: string;
  };
}

let cachedTools: SystemTools | null = null;

/**
 * Detect if running on Railway
 */
function isRailway(): boolean {
  return process.env.RAILWAY_ENVIRONMENT === 'production' || 
         process.env.RAILWAY_PROJECT_ID !== undefined ||
         process.env.RAILWAY_DEPLOYMENT_ID !== undefined;
}

/**
 * Try multiple commands to find working yt-dlp
 */
async function findYtDlp(): Promise<{ command: string; version: string } | null> {
  const commands = isRailway() ? [
    'yt-dlp',                // Should work after pip install
    '/usr/local/bin/yt-dlp', // Common pip install location
    `${process.env.HOME}/.local/bin/yt-dlp`, // User local bin (pip --user)
    '/opt/venv/bin/yt-dlp',  // Virtual env location
    '/usr/bin/yt-dlp',       // System location
    'python3 -m yt_dlp',     // Python module fallback
  ] : [
    'yt-dlp',                // System command
    'python -m yt_dlp',      // Python module (most reliable on Windows)
    'python3 -m yt_dlp',     // Python3 variant
    'yt-dlp.exe',            // Windows executable
    `${process.env.HOME}/.local/bin/yt-dlp`, // User local bin
    './yt-dlp',              // Local directory
    './yt-dlp.exe'           // Local Windows executable
  ];

  // Check environment variable first
  if (process.env.YTDLP_PATH) {
    commands.unshift(process.env.YTDLP_PATH);
  }

  console.log('Searching for yt-dlp in:', commands.slice(0, 5).join(', '), '...');

  for (const cmd of commands) {
    try {
      const { stdout } = await execAsync(`${cmd} --version`, {
        timeout: 5000,
        windowsHide: true
      });
      
      if (stdout && stdout.includes('yt-dlp')) {
        console.log(`✅ Found working yt-dlp: ${cmd}`);
        return { command: cmd, version: stdout.trim() };
      }
    } catch (e) {
      // Continue to next command
    }
  }

  // Try to install yt-dlp if not found
  if (!isRailway()) {
    // Only try to install on non-Railway environments
    console.log('⚠️ yt-dlp not found, attempting to install...');
    try {
      await execAsync('pip install yt-dlp', { timeout: 30000 });
      
      // Try the standard command after installation
      const { stdout } = await execAsync('yt-dlp --version', { timeout: 5000 });
      if (stdout) {
        console.log('✅ Successfully installed yt-dlp');
        return { command: 'yt-dlp', version: stdout.trim() };
      }
    } catch (e) {
      console.error('Failed to install yt-dlp:', e.message);
    }
  }

  return null;
}

/**
 * Try multiple commands to find working FFmpeg
 */
async function findFFmpeg(): Promise<{ command: string; version: string } | null> {
  const commands = isRailway() ? [
    'ffmpeg',                // Railway should have this after nixpacks
    '/usr/bin/ffmpeg',       // Common Linux location
    '/usr/local/bin/ffmpeg', // Alternative Linux location
    '/opt/venv/bin/ffmpeg'   // Railway virtual env
  ] : [
    'ffmpeg',                // System PATH
    'ffmpeg.exe',            // Windows
    'C:\\ffmpeg\\bin\\ffmpeg.exe',  // Common Windows location
    'C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe',
    'C:\\Users\\Mehran\\Downloads\\ffmpeg-7.1.1-full_build\\bin\\ffmpeg.exe', // Your installation
    './ffmpeg',              // Local directory
    './ffmpeg.exe'           // Local Windows
  ];

  // Check environment variable first
  if (process.env.FFMPEG_PATH) {
    commands.unshift(process.env.FFMPEG_PATH);
  }

  for (const cmd of commands) {
    try {
      // Don't quote on Linux/Railway
      const execCmd = isRailway() ? `${cmd} -version` : `"${cmd}" -version`;
      const { stdout } = await execAsync(execCmd, {
        timeout: 5000,
        windowsHide: true
      });
      
      if (stdout && stdout.includes('ffmpeg version')) {
        console.log(`✅ Found working FFmpeg: ${cmd}`);
        const versionMatch = stdout.match(/ffmpeg version ([\d.]+)/);
        // Return quoted command for Windows, unquoted for Linux
        return { 
          command: isRailway() ? cmd : `"${cmd}"`, 
          version: versionMatch ? versionMatch[1] : 'unknown' 
        };
      }
    } catch (e) {
      // Continue to next command
    }
  }

  return null;
}

/**
 * Check and cache system tools availability
 */
export async function checkSystemTools(): Promise<SystemTools> {
  if (cachedTools) {
    return cachedTools;
  }

  console.log('\n🔧 Checking system tools...\n');
  if (isRailway()) {
    console.log('📍 Running on Railway\n');
  }

  const ytdlpResult = await findYtDlp();
  const ffmpegResult = await findFFmpeg();

  cachedTools = {
    ytdlp: {
      available: !!ytdlpResult,
      command: ytdlpResult?.command || 'yt-dlp',
      version: ytdlpResult?.version
    },
    ffmpeg: {
      available: !!ffmpegResult,
      command: ffmpegResult?.command || 'ffmpeg',
      version: ffmpegResult?.version
    }
  };

  console.log('\n📋 System Tools Status:');
  console.log(`yt-dlp: ${cachedTools.ytdlp.available ? '✅' : '❌'} ${cachedTools.ytdlp.version || 'Not found'}`);
  console.log(`FFmpeg: ${cachedTools.ffmpeg.available ? '✅' : '❌'} ${cachedTools.ffmpeg.version || 'Not found'}`);
  console.log('');

  if (!cachedTools.ytdlp.available) {
    console.error('❌ yt-dlp is required but not found!');
    if (isRailway()) {
      console.error('📝 yt-dlp should be installed via nixpacks.');
      console.error('📝 Check nixpacks.toml includes: python311Packages.yt-dlp');
      console.error('📝 You may need to redeploy for changes to take effect.');
    } else {
      console.error('📝 To install: pip install yt-dlp');
    }
  }

  if (!cachedTools.ffmpeg.available) {
    console.error('❌ FFmpeg is required but not found!');
    if (isRailway()) {
      console.error('📝 FFmpeg should be installed via nixpacks.');
      console.error('📝 Check nixpacks.toml includes: ffmpeg');
    } else {
      console.error('📝 Download from: https://ffmpeg.org/download.html');
    }
  }

  return cachedTools;
}

/**
 * Get the working yt-dlp command
 */
export async function getYtDlpCommand(): Promise<string> {
  const tools = await checkSystemTools();
  if (!tools.ytdlp.available) {
    throw new Error('yt-dlp is not available. Please install it with: pip install yt-dlp');
  }
  return tools.ytdlp.command;
}

/**
 * Get the working FFmpeg command
 */
export async function getFFmpegCommand(): Promise<string> {
  const tools = await checkSystemTools();
  if (!tools.ffmpeg.available) {
    throw new Error('FFmpeg is not available. Please download from: https://ffmpeg.org/download.html');
  }
  return tools.ffmpeg.command;
}

/**
 * Reset the cache (useful after installing tools)
 */
export function resetToolsCache(): void {
  cachedTools = null;
}

/**
 * Get FFmpeg path from environment or use local path
 */
export function getFFmpegPath(): string {
  // In production, use system ffmpeg or env variable
  if (isRailway() || process.env.NODE_ENV === 'production') {
    return process.env.FFMPEG_PATH || 'ffmpeg';
  }
  
  // In development, use the local path
  return 'C:\\Users\\Mehran\\Downloads\\ffmpeg-7.1.1-full_build\\bin\\ffmpeg.exe';
} 