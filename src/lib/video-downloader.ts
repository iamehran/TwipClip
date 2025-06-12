import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import { existsSync, mkdirSync, unlinkSync, renameSync } from 'fs';
import { getYtDlpCommand, getFFmpegCommand, getFFmpegPath } from './system-tools';

const execAsync = promisify(exec);

// Temporary directory for video files
const TEMP_DIR = path.join(process.cwd(), 'temp');

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