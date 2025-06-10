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
  const tempDir = path.join(process.cwd(), 'temp');
  const timestamp = Date.now();
  const audioPath = path.join(tempDir, `audio_${timestamp}.mp3`);
  
  // Ensure temp directory exists
  if (!existsSync(tempDir)) {
    await execAsync(`mkdir "${tempDir}"`);
  }
  
  console.log('Extracting audio from video...');
  
  // Get the working yt-dlp command
  const ytdlpCmd = await getYtDlpCommand();
  
  // Get FFmpeg path
  const ffmpegPath = getFFmpegPath();
  const ffmpegDir = path.dirname(ffmpegPath);
  
  // Use the detected command with FFmpeg location
  const command = `${ytdlpCmd} -x --audio-format mp3 --audio-quality 0 --ffmpeg-location "${ffmpegDir}" "${videoUrl}" -o "${audioPath}"`;
  
  console.log(`Running: ${command}`);
  
  await execAsync(command, {
    timeout: 300000, // 5 minutes
    maxBuffer: 1024 * 1024 * 10
  });
  
  // Check if file was created
  if (existsSync(audioPath)) {
    console.log('✓ Audio extracted successfully');
    return audioPath;
  }
  
  // Sometimes yt-dlp adds extension, check for that
  const audioPathWithExt = `${audioPath}.mp3`;
  if (existsSync(audioPathWithExt)) {
    console.log('✓ Audio extracted successfully');
    return audioPathWithExt;
  }
  
  throw new Error('Audio file not created');
}

async function transcribeWithWhisper(videoUrl: string, audioPath: string): Promise<ProcessedTranscript> {
  console.log('🎤 Transcribing with Whisper...');
  
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: 300000, // 5 minutes
    maxRetries: 2
  });

  const fileStream = createReadStream(audioPath);
  const transcriptionResponse = await openai.audio.transcriptions.create({
    file: fileStream,
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