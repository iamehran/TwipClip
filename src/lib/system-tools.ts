import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';

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
async function findYtDlp(): Promise<{command: string, version: string} | null> {
  // Skip yt-dlp check if using RapidAPI
  if (process.env.USE_RAPIDAPI === 'true') {
    return null;
  }
  
  // First, check if specific paths exist
  const directPaths = [
    '/opt/venv/bin/yt-dlp',
    '/usr/local/bin/yt-dlp',
    '/usr/bin/yt-dlp',
    '/app/yt-dlp'
  ];
  
  console.log('Checking for yt-dlp binary files...');
  for (const path of directPaths) {
    if (existsSync(path)) {
      console.log(`Found binary at: ${path}`);
      try {
        const { stdout } = await execAsync(`${path} --version`);
        if (stdout) {
          console.log(`✅ Binary works: ${path} (version: ${stdout.trim()})`);
          return { command: path, version: stdout.trim() };
        }
      } catch (e) {
        console.log(`Binary exists but failed to execute: ${path}`);
      }
    }
  }
  
  // Then try command-based approaches
  const commands = isRailway() ? [
    'python3 -m yt_dlp',         // Python module (most reliable)
    'yt-dlp',                    // PATH
    '/opt/venv/bin/python3 -m yt_dlp', // Direct venv python
  ] : [
    'yt-dlp',                // System command
    '.\\yt-dlp.exe',         // Windows current directory with proper prefix
    '.\\yt-dlp',             // Windows current directory without extension
    'python -m yt_dlp',      // Python module (most reliable on Windows)
    'python3 -m yt_dlp',     // Python3 variant
    'yt-dlp.exe',            // Windows executable
    'C:\\Program Files\\yt-dlp\\yt-dlp.exe',  // Common installation path
    'C:\\Program Files (x86)\\yt-dlp\\yt-dlp.exe',  // 32-bit programs
    'C:\\ProgramData\\yt-dlp\\yt-dlp.exe',    // ProgramData location
    'C:\\tools\\yt-dlp\\yt-dlp.exe',          // Chocolatey default
    `${process.env.USERPROFILE}\\Downloads\\yt-dlp.exe`, // Downloads folder
    `${process.env.USERPROFILE}\\yt-dlp\\yt-dlp.exe`,   // User folder
    `${process.env.LOCALAPPDATA}\\Programs\\yt-dlp\\yt-dlp.exe`, // Local programs
    `${process.env.HOME}/.local/bin/yt-dlp`, // User local bin
    './yt-dlp',              // Local directory
    './yt-dlp.exe'           // Local Windows executable
  ];

  // Check environment variable first
  if (process.env.YTDLP_PATH) {
    commands.unshift(process.env.YTDLP_PATH);
  }

  console.log('Trying command-based approaches...');

  for (const cmd of commands) {
    try {
      const { stdout } = await execAsync(`${cmd} --version`, {
        timeout: 5000,
        windowsHide: true
      });
      
      if (stdout && stdout.includes('20')) { // Check for year in version
        console.log(`✅ Found working yt-dlp: ${cmd}`);
        return { command: cmd, version: stdout.trim() };
      }
    } catch (e) {
      // Continue to next command
    }
  }

  // Last resort: try to find yt-dlp anywhere in the system
  if (isRailway()) {
    try {
      console.log('Searching for yt-dlp in filesystem...');
      const { stdout } = await execAsync('find / -name yt-dlp -type f 2>/dev/null | head -5');
      const paths = stdout.trim().split('\n').filter(p => p);
      for (const path of paths) {
        try {
          const { stdout: version } = await execAsync(`${path} --version`);
          if (version) {
            console.log(`✅ Found yt-dlp at: ${path}`);
            return { command: path, version: version.trim() };
          }
        } catch (e) {
          // Continue
        }
      }
    } catch (e) {
      console.log('Find command failed');
    }
  }

  // Try to install yt-dlp if not found
  if (!isRailway()) {
    // Only try to install on non-Railway environments
    console.log('⚠️ yt-dlp not found, attempting to install...');
    try {
      // Try different pip commands based on platform
      const isWindows = process.platform === 'win32';
      const pipCommands = isWindows ? [
        'python -m pip install yt-dlp',
        'python3 -m pip install yt-dlp',
        'pip install yt-dlp',
        'pip3 install yt-dlp'
      ] : [
        'pip install yt-dlp',
        'pip3 install yt-dlp',
        'python -m pip install yt-dlp',
        'python3 -m pip install yt-dlp'
      ];

      let installed = false;
      for (const pipCmd of pipCommands) {
        try {
          await execAsync(pipCmd, { timeout: 30000 });
          installed = true;
          break;
        } catch (e) {
          // Try next command
        }
      }
      
      if (installed) {
        // Try the standard command after installation
        const { stdout } = await execAsync('yt-dlp --version', { timeout: 5000 });
        if (stdout) {
          console.log('✅ Successfully installed yt-dlp');
          return { command: 'yt-dlp', version: stdout.trim() };
        }
      }
    } catch (e) {
      console.error('Failed to install yt-dlp:', e instanceof Error ? e.message : String(e));
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

  const USE_RAPIDAPI = process.env.USE_RAPIDAPI === 'true';
  
  if (!USE_RAPIDAPI) {
    console.log('\n🔧 Checking system tools...\n');
    if (isRailway()) {
      console.log('📍 Running on Railway\n');
    }
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

  if (!USE_RAPIDAPI) {
    console.log('\n📋 System Tools Status:');
    console.log(`yt-dlp: ${cachedTools.ytdlp.available ? '✅' : '❌'} ${cachedTools.ytdlp.version || 'Not found'}`);
    console.log(`FFmpeg: ${cachedTools.ffmpeg.available ? '✅' : '❌'} ${cachedTools.ffmpeg.version || 'Not found'}`);
    console.log('');

    if (!cachedTools.ytdlp.available) {
      console.error('❌ yt-dlp is required but not found!');
      if (isRailway()) {
        console.error('📝 yt-dlp should be installed via Docker.');
        console.error('📝 Check Dockerfile includes yt-dlp installation.');
        console.error('📝 The startup script should show yt-dlp availability.');
      } else {
        console.error('📝 To install: pip install yt-dlp');
      }
    }
  }

  if (!cachedTools.ffmpeg.available) {
    console.error('❌ FFmpeg is required but not found!');
    if (isRailway()) {
      console.error('📝 FFmpeg should be installed via Docker.');
      console.error('📝 Check Dockerfile includes: apk add ffmpeg');
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
  // In production/Railway, ffmpeg is installed system-wide via apk
  if (isRailway() || process.env.NODE_ENV === 'production') {
    return 'ffmpeg'; // Just use 'ffmpeg' since it's in PATH
  }
  
  // In development, use the local path
  return 'C:\\Users\\Mehran\\Downloads\\ffmpeg-7.1.1-full_build\\bin\\ffmpeg.exe';
} 