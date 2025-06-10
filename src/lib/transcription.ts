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
    
    // First try with yt-dlp if available
    try {
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
        console.log('✓ Audio extracted successfully with yt-dlp');
        return audioPath;
      }
      
      // Sometimes yt-dlp adds extension, check for that
      const audioPathWithExt = `${audioPath}.mp3`;
      if (existsSync(audioPathWithExt)) {
        console.log('✓ Audio extracted successfully with yt-dlp');
        return audioPathWithExt;
      }
    } catch (ytdlpError) {
      console.log('yt-dlp not available, trying fallback methods...');
      
      // Use our fallback download methods
      const result = await downloadVideoWithFallbacks(videoUrl, audioPath);
      
      if (result.success && existsSync(audioPath)) {
        console.log(`✓ Audio extracted successfully using ${result.method} method`);
        return audioPath;
      }
    }
    
    throw new Error('All audio extraction methods failed');
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

    console.log(`Fetching transcript for video ID: ${videoId}`);

    // Try multiple methods to get transcript
    let transcript = null;
    
    // Method 1: Use the YoutubeTranscript library
    try {
      const YoutubeTranscriptApi = (YoutubeTranscript as any).YoutubeTranscript;
      transcript = await YoutubeTranscriptApi.fetchTranscript(videoId);
    } catch (e) {
      console.log('YoutubeTranscript.fetchTranscript failed, trying alternative...');
    }
    
    // Method 2: Try with different import style
    if (!transcript) {
      try {
        transcript = await YoutubeTranscript.fetchTranscript(videoId);
      } catch (e) {
        console.log('Direct fetchTranscript failed');
      }
    }
    
    // Method 3: Try with URL instead of ID
    if (!transcript) {
      try {
        const YoutubeTranscriptApi = (YoutubeTranscript as any).YoutubeTranscript;
        transcript = await YoutubeTranscriptApi.fetchTranscript(videoUrl);
      } catch (e) {
        console.log('Transcript fetch with URL failed');
      }
    }
    
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

    console.log(`✅ Retrieved ${segments.length} transcript segments`);

    return {
      videoUrl,
      videoId,
      segments,
      totalDuration: segments[segments.length - 1]?.endTime || 0
    };
  } catch (error) {
    console.error('YouTube transcript extraction failed:', error instanceof Error ? error.message : String(error));
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
  
  // For YouTube, try multiple transcript methods
  if (platform === 'youtube') {
    const videoId = extractYouTubeVideoId(videoUrl);
    if (!videoId) {
      console.error('Invalid YouTube URL');
      return null;
    }
    
    // Method 1: Try our web scraper first (most reliable, no dependencies)
    console.log('📝 Trying web scraper method...');
    const scrapedTranscript = await scrapeYouTubeTranscript(videoId);
    if (scrapedTranscript && scrapedTranscript.length > 0) {
      const segments: TranscriptSegment[] = scrapedTranscript.map((item, index) => ({
        index,
        startTime: item.start,
        endTime: item.start + item.duration,
        duration: item.duration,
        text: item.text
      }));
      
      console.log(`✅ Web scraper successful - ${segments.length} segments`);
      return {
        videoUrl,
        videoId,
        segments,
        totalDuration: segments[segments.length - 1]?.endTime || 0
      };
    }
    
    // Method 2: Try YouTube transcript library
    console.log('📝 Trying YouTube transcript library...');
    const ytResult = await extractWithYouTubeTranscript(videoUrl);
    if (ytResult) {
      console.log('✅ YouTube transcript library successful');
      return ytResult;
    }
    
    // Method 3: Try our API-only method (requires YouTube API key)
    if (process.env.YOUTUBE_API_KEY) {
      console.log('📝 Trying YouTube API method...');
      const apiTranscript = await getCaptionsViaAPI(videoId);
      if (apiTranscript && apiTranscript.length > 0) {
        const segments: TranscriptSegment[] = apiTranscript.map((item: any, index: number) => ({
          index,
          startTime: item.start || 0,
          endTime: (item.start || 0) + 5, // Estimate if no end time
          duration: 5,
          text: item.text || ''
        }));
        
        return {
          videoUrl,
          videoId,
          segments,
          totalDuration: segments[segments.length - 1]?.endTime || 0
        };
      }
    }
  }
  
  // WHISPER APPROACH (only if we can get audio)
  try {
    console.log('🎤 Attempting Whisper transcription...');
    
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
    console.log('⚠️ Whisper transcription failed');
  }
  
  console.log('❌ All transcription methods failed');
  return null;
} 