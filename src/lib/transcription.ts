import { OpenAI } from 'openai';
import { createReadStream } from 'fs';
import { unlink } from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { existsSync } from 'fs';
import * as YoutubeTranscript from 'youtube-transcript';
import { getYtDlpCommand, getFFmpegPath } from './system-tools';

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
  
  // Check if this is a YouTube URL and if user is authenticated
  const isYouTube = videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be');
  const authFile = path.join(process.cwd(), 'temp', 'youtube_auth.txt');
  const isAuthenticated = isYouTube && existsSync(authFile);
  
  if (isAuthenticated) {
    console.log('✅ YouTube authentication detected - using cookie bypass');
  }
  
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
  let ytdlpCmd: string = '';
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
  const baseOptions = `-x --audio-format mp3 --audio-quality 0 --no-mtime --no-part --paths "${tempDir}"`;
  const headers = `--user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" --referer "https://www.youtube.com/" --add-header "Accept-Language:en-US,en;q=0.9" --add-header "Accept:text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8"`;
  
  // If authenticated, use special options that work better
  let authOptions = '';
  if (isAuthenticated) {
    // Use options that make yt-dlp appear more like a logged-in user
    authOptions = '--extractor-args "youtube:player_client=web" --no-check-certificates';
  }
  
  if (isRailway) {
    // On Railway, use simpler options to avoid file permission issues
    command = `${ytdlpCmd} ${baseOptions} ${authOptions} ${headers} "${videoUrl}" -o "${baseFilename}.%(ext)s"`;
  } else {
    // In development, use the specific FFmpeg location
    const ffmpegPath = getFFmpegPath();
    const ffmpegDir = path.dirname(ffmpegPath);
    command = `${ytdlpCmd} ${baseOptions} --ffmpeg-location "${ffmpegDir}" ${authOptions} ${headers} "${videoUrl}" -o "${baseFilename}.%(ext)s"`;
  }
  
  console.log(`Executing command...`);
  
  let attemptCount = 0;
  const maxAttempts = 2;
  let lastError: any = null;
  
  while (attemptCount < maxAttempts) {
    try {
      attemptCount++;
      
      // Modify command based on attempt
      let attemptCommand = command;
      if (attemptCount === 2 && !isAuthenticated) {
        // Second attempt: Add extractor args to bypass bot detection (only if not authenticated)
        console.log('First attempt failed, trying with extractor args...');
        attemptCommand = command.replace(
          '--user-agent',
          '--extractor-args "youtube:player_client=android" --user-agent'
        );
      }
      
      const { stdout, stderr } = await execAsync(attemptCommand, {
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
      
      // If we get here, command succeeded
      break;
      
    } catch (error: any) {
      lastError = error;
      
      // Check if it's a bot detection error
      if (error.message?.includes('Sign in to confirm') || error.stderr?.includes('Sign in to confirm')) {
        console.log(`Attempt ${attemptCount} failed with bot detection`);
        
        if (attemptCount < maxAttempts) {
          // Wait a bit before retry
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        }
      }
      
      // For other errors, throw immediately
      throw error;
    }
  }
  
  // If all attempts failed, throw the last error
  if (attemptCount >= maxAttempts && lastError) {
    console.error('All attempts failed');
    throw lastError;
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