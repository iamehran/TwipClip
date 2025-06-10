import { OpenAI } from 'openai';
import { createReadStream } from 'fs';
import { unlink } from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { existsSync } from 'fs';
import * as YoutubeTranscript from 'youtube-transcript';
import { getYtDlpCommand, getFFmpegPath } from './system-tools';
import { downloadVideoWithFallbacks } from './video-downloader-fallback';
import { getCaptionsViaAPI } from './youtube-api-only';
import { scrapeYouTubeTranscript } from './youtube-transcript-scraper';

// Fix for File API in Node.js < 20
import { File } from 'node:buffer';
if (!globalThis.File) {
  globalThis.File = File as any;
}

const execAsync = promisify(exec);

export interface TranscriptSegment {
  index: number;
  startTime: number;
  endTime: number;
  duration: number;
  text: string;
  transcript?: string; // For compatibility
}

export interface ProcessedTranscript {
  videoUrl: string;
  videoId: string;
  segments: TranscriptSegment[];
  totalDuration: number;
}

// Platform detection regex patterns
const YOUTUBE_REGEX = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/;
const VIMEO_REGEX = /vimeo\.com\/(\d+)/;
const TWITTER_REGEX = /(?:twitter\.com|x\.com)\/\w+\/status\/(\d+)/;
const TIKTOK_REGEX = /tiktok\.com\/@[\w.-]+\/video\/(\d+)/;
const INSTAGRAM_REGEX = /instagram\.com\/(?:p|reel)\/([A-Za-z0-9_-]+)/;

export function detectVideoPlatform(url: string): string {
  if (YOUTUBE_REGEX.test(url)) return 'youtube';
  if (VIMEO_REGEX.test(url)) return 'vimeo';
  if (TWITTER_REGEX.test(url)) return 'twitter';
  if (TIKTOK_REGEX.test(url)) return 'tiktok';
  if (INSTAGRAM_REGEX.test(url)) return 'instagram';
  if (/\.(mp4|mov|avi|webm|mkv)$/i.test(url)) return 'direct';
  return 'generic';
}

function extractYouTubeVideoId(url: string): string | null {
  const match = url.match(YOUTUBE_REGEX);
  return match ? match[1] : null;
}

async function extractAudioFromVideo(videoUrl: string): Promise<string> {
  // Validate URL first
  if (!videoUrl || typeof videoUrl !== 'string') {
    throw new Error('Invalid video URL provided');
  }
  
  // Clean the URL - remove any trailing semicolons or whitespace
  videoUrl = videoUrl.trim().replace(/;+$/, '');
  
  const tempDir = path.join(process.cwd(), 'temp');
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(7);
  const baseFilename = `audio_${timestamp}_${randomId}`;
  const audioPath = path.join(tempDir, `${baseFilename}.mp3`);
  
  // Ensure temp directory exists with proper permissions
  if (!existsSync(tempDir)) {
    try {
      await execAsync(`mkdir -p "${tempDir}"`);
      // On Railway/Linux, ensure write permissions
      if (process.env.RAILWAY_ENVIRONMENT || process.platform !== 'win32') {
        await execAsync(`chmod 777 "${tempDir}"`);
      }
    } catch (error) {
      console.error('Failed to create temp directory:', error);
      throw new Error('Failed to create temp directory');
    }
  }
  
  console.log('Extracting audio from video...');
  console.log(`Video URL: ${videoUrl}`);
  console.log(`Output path: ${audioPath}`);
  
  // Try to get the working yt-dlp command
  let ytdlpCmd: string;
  try {
    ytdlpCmd = await getYtDlpCommand();
  } catch (error) {
    console.log('getYtDlpCommand failed, trying direct paths...');
    // Fallback to direct paths
    const fallbackPaths = ['/app/yt-dlp', '/usr/local/bin/yt-dlp', 'python3 -m yt_dlp'];
    let found = false;
    for (const path of fallbackPaths) {
      try {
        await execAsync(`${path} --version`);
        ytdlpCmd = path;
        found = true;
        console.log(`Using fallback: ${path}`);
        break;
      } catch (e) {
        // Continue
      }
    }
    if (!found) {
      throw new Error('yt-dlp not found even with fallbacks');
    }
  }
  
  // For Railway/Docker, FFmpeg is in the system PATH, no need to specify location
  const isRailway = process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV === 'production';
  
  // Build the command with proper options
  let command: string;
  if (isRailway) {
    // On Railway, use simpler options to avoid file permission issues
    // Use --paths to specify temp directory
    // Use --no-mtime to avoid utime errors
    // Use --no-part to avoid partial file issues
    command = `${ytdlpCmd} -x --audio-format mp3 --audio-quality 0 --no-mtime --no-part --paths "${tempDir}" "${videoUrl}" -o "${baseFilename}.%(ext)s"`;
  } else {
    // In development, use the specific FFmpeg location
    const ffmpegPath = getFFmpegPath();
    const ffmpegDir = path.dirname(ffmpegPath);
    command = `${ytdlpCmd} -x --audio-format mp3 --audio-quality 0 --ffmpeg-location "${ffmpegDir}" --paths "${tempDir}" "${videoUrl}" -o "${baseFilename}.%(ext)s"`;
  }
  
  console.log(`Executing command...`);
  
  try {
    const { stdout, stderr } = await execAsync(command, {
      timeout: 300000, // 5 minutes
      maxBuffer: 1024 * 1024 * 10,
      cwd: tempDir, // Set working directory to temp
      env: {
        ...process.env,
        // Ensure Python uses UTF-8
        PYTHONIOENCODING: 'utf-8',
        // Disable any interactive prompts
        DEBIAN_FRONTEND: 'noninteractive'
      }
    });
    
    if (stdout) {
      console.log('yt-dlp output:', stdout.substring(0, 200));
    }
    
    if (stderr && !stderr.includes('WARNING')) {
      console.log('yt-dlp stderr:', stderr.substring(0, 200));
    }
  } catch (error: any) {
    console.error('yt-dlp command failed:', error.message);
    if (error.stderr) {
      console.error('stderr:', error.stderr);
    }
    if (error.stdout) {
      console.error('stdout:', error.stdout);
    }
    throw new Error(`Audio extraction failed: ${error.message}`);
  }
  
  // Check if file was created (yt-dlp might use different extension)
  const possibleFiles = [
    audioPath,
    path.join(tempDir, `${baseFilename}.mp3`),
    path.join(tempDir, `${baseFilename}.m4a`),
    path.join(tempDir, `${baseFilename}.opus`),
    path.join(tempDir, `${baseFilename}.webm`)
  ];
  
  for (const file of possibleFiles) {
    if (existsSync(file)) {
      console.log(`✓ Audio file found: ${file}`);
      
      // If it's not the expected mp3, rename it
      if (file !== audioPath && file.endsWith('.mp3')) {
        try {
          await execAsync(`mv "${file}" "${audioPath}"`);
          console.log(`✓ Renamed to: ${audioPath}`);
          return audioPath;
        } catch (e) {
          console.log('Rename failed, using original path');
          return file;
        }
      }
      
      return file;
    }
  }
  
  // List directory contents for debugging
  try {
    const files = await execAsync(`ls -la "${tempDir}"`);
    console.error('Temp directory contents:', files.stdout);
  } catch (e) {
    // Ignore
  }
  
  throw new Error('Audio file not created - no output file found');
}

async function transcribeWithWhisper(videoUrl: string, audioPath: string): Promise<ProcessedTranscript> {
  console.log('🎤 Transcribing with Whisper...');
  
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: 300000, // 5 minutes
    maxRetries: 2
  });

  try {
    const fileStream = createReadStream(audioPath);
    const transcriptionResponse = await openai.audio.transcriptions.create({
      file: fileStream as any,
      model: "whisper-1",
      response_format: "verbose_json",
      temperature: 0.2
    });

    if (!transcriptionResponse.segments || transcriptionResponse.segments.length === 0) {
      throw new Error('No segments in transcription');
    }

    const segments: TranscriptSegment[] = transcriptionResponse.segments.map((seg, index) => ({
      index,
      startTime: seg.start,
      endTime: seg.end,
      duration: seg.end - seg.start,
      text: seg.text.trim()
    }));

    console.log(`✅ Transcription successful - ${segments.length} segments`);

    return {
      videoUrl,
      videoId: extractYouTubeVideoId(videoUrl) || videoUrl,
      segments,
      totalDuration: segments[segments.length - 1]?.endTime || 0
    };
  } catch (error) {
    console.error('Whisper transcription error:', error);
    throw error;
  }
}

/**
 * Single method: Extract audio and transcribe with Whisper
 * No fallbacks - one reliable path
 */
export async function getVideoTranscript(videoUrl: string, platform: string): Promise<ProcessedTranscript | null> {
  console.log(`Getting transcript for ${platform} video...`);
  
  let audioPath: string | null = null;
  
  try {
    // Step 1: Extract audio
    audioPath = await extractAudioFromVideo(videoUrl);
    
    // Step 2: Transcribe with Whisper
    const transcript = await transcribeWithWhisper(videoUrl, audioPath);
    
    return transcript;
    
  } catch (error) {
    console.error('Transcription failed:', error instanceof Error ? error.message : String(error));
    return null;
    
  } finally {
    // Always clean up audio file
    if (audioPath && existsSync(audioPath)) {
      try {
        await unlink(audioPath);
        console.log('✓ Cleaned up temporary audio file');
      } catch (e) {
        console.error('Failed to clean up audio file:', e);
      }
    }
  }
} 