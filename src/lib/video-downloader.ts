import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import { existsSync, mkdirSync, unlinkSync, renameSync } from 'fs';
import { getYtDlpCommand, getFFmpegCommand, getFFmpegPath } from './system-tools';
import { YouTubeAuthManagerV2, YouTubeAuthConfig } from './youtube-auth-v2';
import { cookies } from 'next/headers';
import { join } from 'path';

const execAsync = promisify(exec);

// Temporary directory for video files
const TEMP_DIR = process.env.NODE_ENV === 'production' ? '/tmp' : path.join(process.cwd(), 'temp');

// Ensure temp directory exists
async function ensureTempDir() {
  if (!existsSync(TEMP_DIR)) {
    await fs.mkdir(TEMP_DIR, { recursive: true });
  }
}

export interface ClipDownloadResult {
  success: boolean;
  filePath?: string;
  error?: string;
}

/**
 * Enhanced VideoDownloader class with browser-based authentication
 */
export class VideoDownloader {
  private ytdlpPath: string = '';
  private ffmpegPath: string = '';
  private authConfig?: YouTubeAuthConfig;
  private tempDir: string;
  private downloadTimeout: number;
  private maxRetries: number;
  
  constructor(authConfig?: YouTubeAuthConfig) {
    this.tempDir = process.env.NODE_ENV === 'production' ? '/tmp' : join(process.cwd(), 'temp');
    this.downloadTimeout = 600000; // 10 minutes
    this.maxRetries = 3;
    this.authConfig = authConfig;
    this.ensureTempDirectory();
  }
  
  async initialize() {
    this.ytdlpPath = await getYtDlpCommand();
    this.ffmpegPath = await getFFmpegCommand();
  }
  
  /**
   * Set authentication configuration
   */
  setAuthConfig(config: YouTubeAuthConfig) {
    this.authConfig = config;
  }
  
  /**
   * Get yt-dlp base arguments with browser-based authentication
   */
  private async getYtdlpArgs(videoUrl: string, quality: string = '720p'): Promise<string[]> {
    const args: string[] = [];
    
    // Add browser cookie extraction if configured
    if (this.authConfig) {
      const cookieArgs = YouTubeAuthManagerV2.getBrowserCookieArgs(this.authConfig);
      args.push(...cookieArgs);
      console.log(`🍪 Using browser cookies from ${this.authConfig.browser}${this.authConfig.profile ? `:${this.authConfig.profile}` : ''}`);
    } else {
      console.log('⚠️ No browser authentication configured, downloads may fail for restricted content');
    }
    
    // Format selection based on quality
    const formatString = quality === '1080p' 
      ? 'bestvideo[height<=1080]+bestaudio/best[height<=1080]'
      : 'bestvideo[height<=720]+bestaudio/best[height<=720]';
    
    args.push(
      '-f', formatString,
      '--no-warnings',
      '--no-playlist',
      '--merge-output-format', 'mp4',
      '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
    
    // Add retry options for reliability
    args.push(
      '--retries', '10',
      '--fragment-retries', '10',
      '--retry-sleep', '3'
    );
    
    // Check for user-specific YouTube cookies
    const cookieStore = cookies();
    const sessionId = cookieStore.get('youtube_session_id')?.value;
    
    if (sessionId) {
      const cookiePath = join(
        process.env.NODE_ENV === 'production' ? '/tmp' : process.cwd(), 
        'temp', 
        'cookies', 
        sessionId, 
        'youtube.txt'
      );
      
      if (existsSync(cookiePath)) {
        args.push('--cookies', cookiePath);
        console.log(`Using user YouTube cookies from session: ${sessionId}`);
      }
    }
    
    return args;
  }
  
  /**
   * Run a command with proper error handling
   */
  private async runCommand(command: string, args: string[]): Promise<void> {
    const fullCommand = `${command} ${args.join(' ')}`;
    const { stdout, stderr } = await execAsync(fullCommand);
    
    if (stderr) {
      // Check for specific errors
      if (stderr.includes('Sign in to confirm')) {
        throw new Error('YouTube requires authentication. Please ensure you are logged into YouTube in your selected browser.');
      }
      if (stderr.includes('ERROR') && !stderr.includes('WARNING')) {
        throw new Error(stderr);
      }
      // Log warnings but don't fail
      if (stderr.includes('WARNING')) {
        console.warn('yt-dlp warning:', stderr);
      }
    }
    
    if (stdout) {
      console.log('yt-dlp output:', stdout.substring(0, 200));
    }
  }
  
  /**
   * Download a video clip with automatic fallback
   */
  async downloadClip(
    videoUrl: string,
    startTime: number,
    endTime: number,
    outputPath: string,
    options: { quality?: string } = {}
  ): Promise<void> {
    const tempVideoPath = outputPath.replace('.mp4', '_temp.mp4');
    
    try {
      // Get base arguments with authentication
      const baseArgs = await this.getYtdlpArgs(videoUrl, options.quality);
      
      // Download with yt-dlp
      console.log(`📥 Downloading video: ${videoUrl}`);
      await this.runCommand(this.ytdlpPath, [
        ...baseArgs,
        '-o', tempVideoPath,
        videoUrl
      ]);

      // Extract clip with FFmpeg
      console.log(`✂️ Extracting clip: ${startTime}s to ${endTime}s`);
      const duration = endTime - startTime;
      
      await this.runCommand(this.ffmpegPath, [
        '-i', tempVideoPath,
        '-ss', startTime.toString(),
        '-t', duration.toString(),
        '-c:v', 'libx264',
        '-crf', '18',
        '-preset', 'medium',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-movflags', '+faststart',
        '-y',
        outputPath
      ]);

      // Clean up temp file
      await fs.unlink(tempVideoPath);
      
      console.log(`✅ Clip saved to: ${outputPath}`);
    } catch (error: any) {
      // Clean up on error
      try {
        await fs.unlink(tempVideoPath);
      } catch {}
      
      // Handle authentication errors
      if (error.message?.includes('Sign in to confirm')) {
        // Try fallback browsers
        if (this.authConfig) {
          const fallbackBrowsers = await YouTubeAuthManagerV2.getFallbackBrowsers(this.authConfig.browser);
          if (fallbackBrowsers.length > 0) {
            console.log(`🔄 Trying fallback browser: ${fallbackBrowsers[0]}`);
            this.authConfig.browser = fallbackBrowsers[0];
            // Retry with fallback browser
            return this.downloadClip(videoUrl, startTime, endTime, outputPath, options);
          }
        }
      }
      
      throw error;
    }
  }

  /**
   * Download full video with browser-based authentication
   */
  async downloadFullVideo(
    videoUrl: string,
    outputPath: string,
    options: { quality?: string } = {}
  ): Promise<void> {
    try {
      // Get base arguments with authentication
      const baseArgs = await this.getYtdlpArgs(videoUrl, options.quality);
      
      console.log(`📥 Downloading full video: ${videoUrl}`);
      await this.runCommand(this.ytdlpPath, [
        ...baseArgs,
        '-o', outputPath,
        videoUrl
      ]);
      
      console.log(`✅ Video saved to: ${outputPath}`);
    } catch (error: any) {
      console.error('Download failed:', error.message);
      
      // Provide helpful error messages
      if (error.message?.includes('Sign in to confirm')) {
        const solutions = YouTubeAuthManagerV2.getErrorSolution(error.message);
        console.error('Solutions:', solutions.join('\n'));
      }
      
      throw error;
    }
  }

  private async buildYtDlpCommand(url: string, outputPath: string): Promise<string> {
    const args = [
      'yt-dlp',
      '--no-warnings',
      '--quiet',
      '--no-progress',
      '--extract-flat',
      '--no-check-certificate',
      '--user-agent', '"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"',
      '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
      '--merge-output-format', 'mp4',
      '--no-playlist',
      '--add-metadata',
      '--embed-thumbnail',
      '--write-thumbnail',
      '--convert-thumbnails', 'jpg'
    ];

    // Check for helper-based authentication first
    const cookieStore = cookies();
    const sessionId = cookieStore.get('youtube_session_id')?.value;
    
    if (sessionId) {
      const cookiePath = join(
        process.env.NODE_ENV === 'production' ? '/tmp' : process.cwd(), 
        'temp', 
        'cookies', 
        sessionId, 
        'youtube.txt'
      );
      if (existsSync(cookiePath)) {
        console.log('[VideoDownloader] Using helper-based cookie authentication');
        args.push('--cookies', `"${cookiePath}"`);
      }
    } else if (this.authConfig?.selectedBrowser) {
      // Fall back to browser-based auth if available
      console.log(`[VideoDownloader] Using browser cookies from: ${this.authConfig.selectedBrowser}`);
      args.push('--cookies-from-browser', this.authConfig.selectedBrowser);
      
      if (this.authConfig.browserProfile) {
        args.push('--cookies-from-browser-profile', this.authConfig.browserProfile);
      }
    }

    args.push('-o', `"${outputPath}"`);
    args.push(`"${url}"`);

    return args.join(' ');
  }
}

// Keep the existing standalone functions for backward compatibility

/**
 * Downloads a full video using yt-dlp
 */
async function downloadFullVideo(videoUrl: string, outputPath: string): Promise<string> {
  await ensureTempDir();
  
  console.log('Downloading video:', videoUrl);
  
  // Get the working yt-dlp command
  const ytdlpCmd = await getYtDlpCommand();
  
  // Build command based on environment
  const isRailway = process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV === 'production';
  let command: string;
  
  if (isRailway) {
    // On Railway, FFmpeg is in PATH
    command = `${ytdlpCmd} -f "bestvideo[height<=1080]+bestaudio/best[height<=1080]" "${videoUrl}" -o "${outputPath}.%(ext)s"`;
  } else {
    // In development, specify FFmpeg location
  const ffmpegPath = getFFmpegPath();
  const ffmpegDir = path.dirname(ffmpegPath);
    command = `${ytdlpCmd} -f "bestvideo[height<=1080]+bestaudio/best[height<=1080]" --ffmpeg-location "${ffmpegDir}" "${videoUrl}" -o "${outputPath}.%(ext)s"`;
  }
  
  console.log(`Running: ${command}`);
  
    const { stderr } = await execAsync(command);
    if (stderr && !stderr.includes('WARNING')) {
      console.error('yt-dlp stderr:', stderr);
    }
    
    // Find the downloaded file
    const extensions = ['.mp4', '.mkv', '.webm', '.mov', '.flv'];
    for (const ext of extensions) {
      const filePath = `${outputPath}${ext}`;
      if (existsSync(filePath)) {
        console.log('Downloaded to:', filePath);
        return filePath;
      }
    }
    
    throw new Error('Downloaded file not found');
}

/**
 * Cuts a segment from a video file using ffmpeg
 */
async function cutVideoSegment(
  inputPath: string,
  startTime: number,
  endTime: number,
  outputPath: string
): Promise<void> {
  const duration = endTime - startTime;
  
  // Get the working FFmpeg command
  const ffmpegCmd = await getFFmpegCommand();
  
  // FFmpeg command optimized for quality and size
  const command = `${ffmpegCmd} -i "${inputPath}" -ss ${startTime} -t ${duration} ` +
    `-vf "scale='min(1280,iw)':'min(720,ih)':force_original_aspect_ratio=decrease" ` +
    `-c:v libx264 -crf 23 -preset fast -c:a aac -b:a 128k ` +
    `-movflags +faststart -y "${outputPath}"`;
  
  console.log(`Cutting segment: ${startTime}s - ${endTime}s`);
  
    await execAsync(command);
  
    if (!existsSync(outputPath)) {
      throw new Error('Output file not created');
  }
}

/**
 * Downloads and cuts video clips based on match results
 */
export async function downloadClips(matches: Array<{
  match: boolean;
  videoUrl: string;
  startTime: number;
  endTime: number;
  tweet?: string;
}>): Promise<ClipDownloadResult[]> {
  await ensureTempDir();
  
  const results: ClipDownloadResult[] = [];
  
  // Group matches by video URL for efficiency
  const matchesByVideo = new Map<string, typeof matches>();
  
  for (const match of matches) {
    if (!match.match || !match.videoUrl) continue;
    
    const existing = matchesByVideo.get(match.videoUrl) || [];
    existing.push(match);
    matchesByVideo.set(match.videoUrl, existing);
  }
  
  // Process each video
  for (const [videoUrl, videoMatches] of matchesByVideo) {
    const timestamp = Date.now();
    const tempVideoPath = path.join(TEMP_DIR, `full_${timestamp}`);
    
    try {
      // Download full video once
      const fullVideoPath = await downloadFullVideo(videoUrl, tempVideoPath);
      
      // Cut clips for each match
      for (let i = 0; i < videoMatches.length; i++) {
        const clipPath = path.join(TEMP_DIR, `clip_tweet${i + 1}_${timestamp}.mp4`);
        
        try {
          await cutVideoSegment(
            fullVideoPath,
            videoMatches[i].startTime,
            videoMatches[i].endTime,
            clipPath
          );
          
          results.push({
            success: true,
            filePath: clipPath
          });
          
          console.log(`✓ Created clip: ${clipPath}`);
        } catch (error) {
          results.push({
            success: false,
            error: `Failed to cut clip: ${error instanceof Error ? error.message : String(error)}`
          });
        }
      }
      
      // Clean up full video
      await fs.unlink(fullVideoPath);
      console.log('Cleaned up temporary video file');
      
    } catch (error) {
      console.error(`Failed to process video ${videoUrl}:`, error);
      
      // Add failure results for all matches of this video
      for (const match of videoMatches) {
        results.push({
          success: false,
          error: `Failed to download video: ${error instanceof Error ? error.message : String(error)}`
        });
      }
    }
  }
  
  return results;
}

/**
 * Cleans up old temporary files
 */
export async function cleanupTempFiles(olderThanMinutes: number = 30): Promise<void> {
  try {
    await ensureTempDir();
    const files = await fs.readdir(TEMP_DIR);
    const now = Date.now();
    const maxAge = olderThanMinutes * 60 * 1000;
    
    for (const file of files) {
      const filePath = path.join(TEMP_DIR, file);
      const stats = await fs.stat(filePath);
      
      if (now - stats.mtimeMs > maxAge) {
        await fs.unlink(filePath);
        console.log('Cleaned up old file:', file);
      }
    }
  } catch (error) {
    console.error('Cleanup error:', error);
  }
}

/**
 * Extract audio from YouTube video URL using yt-dlp
 */
export async function extractAudio(videoUrl: string, videoId: string): Promise<string> {
  const DOWNLOADS_DIR = path.join(process.cwd(), 'public', 'downloads');
  if (!existsSync(DOWNLOADS_DIR)) {
    mkdirSync(DOWNLOADS_DIR, { recursive: true });
  }

  const audioPath = path.join(DOWNLOADS_DIR, `${videoId}.m4a`);
  const tempPath = path.join(DOWNLOADS_DIR, `${videoId}_temp.m4a`);

  // Clean up any existing files
  [audioPath, tempPath].forEach(file => {
    if (existsSync(file)) {
      unlinkSync(file);
    }
  });

  console.log('Using yt-dlp for audio extraction...');
  
  const ytdlpCmd = await getYtDlpCommand();
  const command = `${ytdlpCmd} -f "bestaudio[ext=m4a]/bestaudio/best" -o "${tempPath}" "${videoUrl}"`;
  
  await execAsync(command, { maxBuffer: 10 * 1024 * 1024 });
  
  if (existsSync(tempPath)) {
    renameSync(tempPath, audioPath);
    return audioPath;
  }
  
  throw new Error('Audio extraction failed');
} 