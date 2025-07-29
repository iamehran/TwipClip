import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';

const execAsync = promisify(exec);

// Platform-specific paths
const WINDOWS_PATHS = {
  ffmpeg: [
    'C:\\ProgramData\\chocolatey\\bin\\ffmpeg.exe',
    'C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe',
    'C:\\ffmpeg\\bin\\ffmpeg.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-7.1.1-full_build\\bin\\ffmpeg.exe')
  ],
  ytDlp: [
    'C:\\ProgramData\\chocolatey\\bin\\yt-dlp.exe',
    'C:\\Program Files\\yt-dlp\\yt-dlp.exe',
    'C:\\yt-dlp\\yt-dlp.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Microsoft\\WinGet\\Packages\\yt-dlp.yt-dlp_Microsoft.Winget.Source_8wekyb3d8bbwe\\yt-dlp.exe')
  ]
};

const LINUX_PATHS = {
  ffmpeg: [
    '/usr/bin/ffmpeg',
    '/usr/local/bin/ffmpeg',
    '/opt/homebrew/bin/ffmpeg', // macOS with Homebrew
    '/snap/bin/ffmpeg'
  ],
  ytDlp: [
    '/usr/bin/yt-dlp',
    '/usr/local/bin/yt-dlp',
    '/opt/homebrew/bin/yt-dlp', // macOS with Homebrew
    '/snap/bin/yt-dlp'
  ]
};

// Check if running in production (Vercel, Railway, etc.)
const isProduction = process.env.NODE_ENV === 'production';
const isVercel = process.env.VERCEL === '1';
const isRailway = process.env.RAILWAY_ENVIRONMENT === 'production';
const isWindows = process.platform === 'win32';

// Tool availability cache
let toolsCache: {
  ffmpeg?: string;
  ytDlp?: string;
  checked?: boolean;
} = {};

async function findExecutable(name: string, paths: string[]): Promise<string | null> {
  // First try system PATH
  try {
    const command = isWindows ? `where ${name}` : `which ${name}`;
    const { stdout } = await execAsync(command);
    const firstPath = stdout.trim().split('\n')[0];
    if (firstPath) return firstPath;
  } catch (e) {
    // Not in PATH, continue checking specific locations
  }

  // Check specific paths
  for (const execPath of paths) {
    try {
      await fs.access(execPath);
      return execPath;
    } catch (e) {
      // Path doesn't exist, continue
    }
  }

  return null;
}

export async function getFFmpegPath(): Promise<string> {
  if (toolsCache.ffmpeg) return toolsCache.ffmpeg;

  if (isProduction && (isVercel || !isRailway)) {
    // In serverless production, we can't use FFmpeg
    throw new Error('FFmpeg not available in serverless environment. Use cloud transcoding service or deploy to a container-based platform.');
  }

  const paths = isWindows ? WINDOWS_PATHS.ffmpeg : LINUX_PATHS.ffmpeg;
  const ffmpegPath = await findExecutable('ffmpeg', paths);
  
  if (!ffmpegPath) {
    throw new Error('FFmpeg not found. Please install FFmpeg and ensure it\'s in your PATH.');
  }

  toolsCache.ffmpeg = ffmpegPath;
  return ffmpegPath;
}

export async function getYtDlpPath(): Promise<string> {
  if (toolsCache.ytDlp) return toolsCache.ytDlp;

  if (isProduction && (isVercel || !isRailway)) {
    // In serverless production, we can't use yt-dlp
    throw new Error('yt-dlp not available in serverless environment. Use ytdl-core library or deploy to a container-based platform.');
  }

  const paths = isWindows ? WINDOWS_PATHS.ytDlp : LINUX_PATHS.ytDlp;
  const ytDlpPath = await findExecutable('yt-dlp', paths);
  
  if (!ytDlpPath) {
    throw new Error('yt-dlp not found. Please install yt-dlp and ensure it\'s in your PATH.');
  }

  toolsCache.ytDlp = ytDlpPath;
  return ytDlpPath;
}

export async function checkSystemTools(): Promise<{
  ffmpeg: boolean;
  ytDlp: boolean;
  ffmpegPath?: string;
  ytDlpPath?: string;
  environment: string;
}> {
  if (toolsCache.checked) {
    return {
      ffmpeg: !!toolsCache.ffmpeg,
      ytDlp: !!toolsCache.ytDlp,
      ffmpegPath: toolsCache.ffmpeg,
      ytDlpPath: toolsCache.ytDlp,
      environment: getEnvironmentInfo()
    };
  }

  const result = {
    ffmpeg: false,
    ytDlp: false,
    ffmpegPath: undefined as string | undefined,
    ytDlpPath: undefined as string | undefined,
    environment: getEnvironmentInfo()
  };

  try {
    result.ffmpegPath = await getFFmpegPath();
    result.ffmpeg = true;
  } catch (e) {
    // FFmpeg not available
  }

  try {
    result.ytDlpPath = await getYtDlpPath();
    result.ytDlp = true;
  } catch (e) {
    // yt-dlp not available
  }

  toolsCache.checked = true;
  return result;
}

function getEnvironmentInfo(): string {
  if (isVercel) return 'vercel-serverless';
  if (isRailway) return 'railway-container';
  if (isProduction) return 'production-unknown';
  return 'development';
}

// Production alternatives
export function getProductionAlternatives() {
  return {
    transcoding: [
      'Use cloud transcoding services like AWS MediaConvert',
      'Use Cloudinary video API',
      'Use Mux video API',
      'Deploy to Railway/Render for full FFmpeg support'
    ],
    youtube: [
      'Use ytdl-core npm package (limited features)',
      'Use youtube-dl-exec npm package',
      'Use YouTube Data API for metadata only',
      'Deploy to Railway/Render for full yt-dlp support'
    ],
    deployment: {
      serverless: ['Vercel', 'Netlify', 'AWS Lambda'],
      container: ['Railway', 'Render', 'Fly.io', 'DigitalOcean App Platform'],
      vps: ['AWS EC2', 'DigitalOcean Droplet', 'Linode', 'Vultr']
    }
  };
}

// Feature availability based on environment
export function getFeatureAvailability() {
  const env = getEnvironmentInfo();
  
  return {
    videoDownload: !isVercel && !env.includes('serverless'),
    audioExtraction: !isVercel && !env.includes('serverless'),
    whisperTranscription: !!process.env.OPENAI_API_KEY,
    youtubeTranscripts: true,
    googleVideoIntelligence: !!process.env.GOOGLE_CLOUD_API_KEY,
    environment: env
  };
} 