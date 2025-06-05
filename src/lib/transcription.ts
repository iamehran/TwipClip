import { OpenAI } from 'openai';
import { createReadStream } from 'fs';
import { unlink } from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { existsSync } from 'fs';
import * as YoutubeTranscript from 'youtube-transcript';
import { getYtDlpCommand, getFFmpegPath } from './system-tools';

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

async function extractAudioFromVideo(videoUrl: string): Promise<string | null> {
  const tempDir = path.join(process.cwd(), 'temp');
  const timestamp = Date.now();
  const audioPath = path.join(tempDir, `audio_${timestamp}.mp3`);
  
  // Ensure temp directory exists
  if (!existsSync(tempDir)) {
    await execAsync(`mkdir "${tempDir}"`);
  }
  
  try {
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
  } catch (error) {
    console.error('Audio extraction failed:', error);
    return null;
  }
}

async function extractWithYouTubeTranscript(videoUrl: string): Promise<ProcessedTranscript | null> {
  try {
    const videoId = extractYouTubeVideoId(videoUrl);
    if (!videoId) {
      throw new Error('Invalid YouTube URL');
    }

    // Use the correct method name from youtube-transcript
    const YoutubeTranscriptApi = (YoutubeTranscript as any).YoutubeTranscript;
    const transcript = await YoutubeTranscriptApi.fetchTranscript(videoId);
    
    if (!transcript || transcript.length === 0) {
      throw new Error('No transcript found');
    }

    const segments: TranscriptSegment[] = transcript.map((item: {
      offset: number;
      duration: number;
      text: string;
    }, index: number) => ({
      index,
      startTime: item.offset / 1000,
      endTime: (item.offset + item.duration) / 1000,
      duration: item.duration / 1000,
      text: item.text
    }));

    return {
      videoUrl,
      videoId,
      segments,
      totalDuration: segments[segments.length - 1]?.endTime || 0
    };
  } catch (error) {
    return null;
  }
}

async function extractWithWhisper(videoUrl: string, audioPath: string): Promise<ProcessedTranscript | null> {
  try {
    console.log('🎤 Using Whisper for transcription...');
    
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

    return {
      videoUrl,
      videoId: videoUrl,
      segments,
      totalDuration: segments[segments.length - 1]?.endTime || 0
    };
  } catch (error: any) {
    console.error('Whisper transcription failed:', error.message);
    return null;
  }
}

export async function getVideoTranscript(videoUrl: string, platform: string): Promise<ProcessedTranscript | null> {
  console.log(`Getting transcript for ${platform} video...`);
  
  // For YouTube, try transcript API first if yt-dlp is not available
  if (platform === 'youtube') {
    // Check if yt-dlp is available
    try {
      const ytdlpCmd = await getYtDlpCommand();
      console.log('yt-dlp available, using Whisper-first approach');
    } catch (e) {
      // yt-dlp not available, use YouTube transcript first
      console.log('yt-dlp not available, trying YouTube transcript API first');
      const ytResult = await extractWithYouTubeTranscript(videoUrl);
      if (ytResult) {
        console.log('✅ YouTube transcript successful');
        return ytResult;
      }
    }
  }
  
  // WHISPER-FIRST APPROACH (if yt-dlp is available)
  try {
    console.log('🎤 Attempting Whisper transcription (primary method)...');
    
    // Extract audio for Whisper
    const audioPath = await extractAudioFromVideo(videoUrl);
    if (audioPath) {
      const whisperResult = await extractWithWhisper(videoUrl, audioPath);
      
      // Clean up audio file
      try {
        await unlink(audioPath);
      } catch (e) {
        // Ignore cleanup errors
      }
      
      if (whisperResult && whisperResult.segments.length > 0) {
        console.log('✅ Whisper transcription successful');
        return whisperResult;
      }
    }
  } catch (error) {
    console.log('⚠️ Whisper transcription failed, trying fallback methods...');
  }
  
  // FALLBACK METHODS
  switch (platform) {
    case 'youtube':
      // Try YouTube transcript API as fallback
      console.log('📝 Trying YouTube transcript library (fallback)...');
      const ytResult = await extractWithYouTubeTranscript(videoUrl);
      if (ytResult) {
        console.log('✅ YouTube transcript successful');
        return ytResult;
      }
      break;
      
    case 'vimeo':
    case 'twitter':
    case 'tiktok':
    case 'instagram':
    case 'direct':
    case 'generic':
      // For non-YouTube platforms, we already tried Whisper
      console.log('❌ No fallback methods available for this platform');
      break;
  }
  
  console.log('❌ All transcription methods failed');
  return null;
} 