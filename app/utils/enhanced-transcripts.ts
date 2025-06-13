import axios from 'axios';
import { YoutubeTranscript } from 'youtube-transcript';
import { exec } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { promisify } from 'util';
import OpenAI from 'openai';
import { enhanceTranscriptQuality } from './transcript-quality';
import { GOOGLE_CLOUD_API_KEY } from '../config';
import { transcribeLargeAudio } from './audio-chunking';
import { getFFmpegPath, getYtDlpPath, checkSystemTools } from './system-tools';
import { getYtDlpCommand as getWorkingYtDlpCommand, getFFmpegCommand as getWorkingFFmpegCommand } from '../../src/lib/system-tools';

const execAsync = promisify(exec);

// Initialize OpenAI client for Whisper
const openai = process.env.OPENAI_API_KEY 
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) 
  : null;

// Google Cloud Video Intelligence client (if available)
const googleApiKey = GOOGLE_CLOUD_API_KEY;

interface TranscriptSegment {
  text: string;
  offset: number; // in seconds
  duration: number; // in seconds
}

interface TranscriptResult {
  segments: TranscriptSegment[];
  source: 'whisper-api' | 'whisper-local' | 'youtube-api' | 'youtube-transcript' | 'vimeo-captions' | 'auto-generated' | 'direct-file' | 'ai-enhanced' | 'google-video-intelligence';
  quality: 'high' | 'medium' | 'low';
  language: string;
  confidence?: number;
  platform: 'youtube' | 'vimeo' | 'twitter' | 'tiktok' | 'instagram' | 'direct' | 'generic';
}

interface VideoInfo {
  id: string;
  platform: string;
  url: string;
  title?: string;
  duration?: number;
  isLive?: boolean;
  isPrivate?: boolean;
}

// Cache for transcripts with TTL
const transcriptCache = new Map<string, { data: TranscriptResult; timestamp: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// Processing queue for parallel processing
const processingQueue = new Map<string, Promise<TranscriptResult | null>>();

// Global flag for FFmpeg availability
let ffmpegAvailable: boolean | null = null;

// Store the FFmpeg command that works
let workingFFmpegCommand: string | null = null;

// Store the yt-dlp command that works
let workingYtDlpCommand: string | null = null;

// Add video info cache for re-download attempts
const videoInfoCache = new Map<string, VideoInfo>();

/**
 * Check if FFmpeg is available
 */
async function checkFFmpegAvailability(): Promise<boolean> {
  if (ffmpegAvailable !== null) return ffmpegAvailable;
  
  try {
    const tools = await checkSystemTools();
    ffmpegAvailable = tools.ffmpeg;
    if (tools.ffmpegPath) {
      workingFFmpegCommand = tools.ffmpegPath;
    }
    console.log(ffmpegAvailable ? '✓ FFmpeg is available' : '⚠️ FFmpeg not found');
    return ffmpegAvailable;
  } catch (error) {
    ffmpegAvailable = false;
    return false;
  }
}

async function getFFmpegCommand(): Promise<string> {
  if (workingFFmpegCommand) return workingFFmpegCommand;
  
  try {
    // Use the working command from src/lib/system-tools which properly detects Railway
    const ffmpegPath = await getWorkingFFmpegCommand();
    workingFFmpegCommand = ffmpegPath;
    return ffmpegPath;
  } catch (error) {
    console.error('FFmpeg not available:', error);
    // On Railway/Docker, use simple command
    if (process.env.RAILWAY_ENVIRONMENT || process.env.DOCKER_ENV) {
      workingFFmpegCommand = 'ffmpeg';
      return 'ffmpeg';
    }
    return 'ffmpeg'; // Fallback
  }
}

async function getYtDlpCommand(): Promise<string> {
  if (workingYtDlpCommand) return workingYtDlpCommand;
  
  try {
    // Use the working command from src/lib/system-tools which properly detects Railway
    const ytDlpPath = await getWorkingYtDlpCommand();
    workingYtDlpCommand = ytDlpPath;
    return ytDlpPath;
  } catch (error) {
    console.error('yt-dlp not available:', error);
    // On Railway/Docker, use simple command
    if (process.env.RAILWAY_ENVIRONMENT || process.env.DOCKER_ENV) {
      workingYtDlpCommand = 'yt-dlp';
      return 'yt-dlp';
    }
    return 'yt-dlp'; // Fallback
  }
}

/**
 * PHASE 2A: Enhanced Multi-Platform Video Detection
 */
export function detectVideoPlatform(url: string): VideoInfo | null {
  const cleanUrl = url.trim();
  
  // YouTube Detection (multiple formats)
  const youtubePatterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|m\.youtube\.com\/watch\?v=)([^&\n?#]+)/i,
    /youtube\.com\/shorts\/([^&\n?#]+)/i
  ];
  
  for (const pattern of youtubePatterns) {
    const match = cleanUrl.match(pattern);
    if (match) {
      return {
        id: match[1],
        platform: 'youtube',
        url: cleanUrl
      };
    }
  }
  
  // Vimeo Detection
  const vimeoPatterns = [
    /vimeo\.com\/(\d+)/i,
    /player\.vimeo\.com\/video\/(\d+)/i
  ];
  
  for (const pattern of vimeoPatterns) {
    const match = cleanUrl.match(pattern);
    if (match) {
      return {
        id: match[1],
        platform: 'vimeo',
        url: cleanUrl
      };
    }
  }
  
  // Twitter/X Detection
  const twitterPatterns = [
    /(?:twitter\.com|x\.com)\/\w+\/status\/(\d+)/i
  ];
  
  for (const pattern of twitterPatterns) {
    const match = cleanUrl.match(pattern);
    if (match) {
      return {
        id: match[1],
        platform: 'twitter',
        url: cleanUrl
      };
    }
  }
  
  // TikTok Detection
  const tiktokPatterns = [
    /tiktok\.com\/@[\w.-]+\/video\/(\d+)/i,
    /vm\.tiktok\.com\/([A-Za-z0-9]+)/i
  ];
  
  for (const pattern of tiktokPatterns) {
    const match = cleanUrl.match(pattern);
    if (match) {
      return {
        id: match[1],
        platform: 'tiktok',
        url: cleanUrl
      };
    }
  }
  
  // Instagram Detection
  const instagramPatterns = [
    /instagram\.com\/p\/([A-Za-z0-9_-]+)/i,
    /instagram\.com\/reel\/([A-Za-z0-9_-]+)/i
  ];
  
  for (const pattern of instagramPatterns) {
    const match = cleanUrl.match(pattern);
    if (match) {
      return {
        id: match[1],
        platform: 'instagram',
        url: cleanUrl
      };
    }
  }
  
  // Direct video file detection
  const videoExtensions = /\.(mp4|mov|avi|wmv|flv|webm|m4v|mkv)(?:\?.*)?$/i;
  if (videoExtensions.test(cleanUrl)) {
    const filename = cleanUrl.split('/').pop()?.split('?')[0] || 'video';
    return {
      id: filename,
      platform: 'direct',
      url: cleanUrl
    };
  }
  
  // Generic URL (might contain video)
  if (cleanUrl.startsWith('http')) {
    const urlHash = Buffer.from(cleanUrl).toString('base64').substring(0, 12);
    return {
      id: urlHash,
      platform: 'generic',
      url: cleanUrl
    };
  }
  
  return null;
}

/**
 * PHASE 2A: Enhanced transcript retrieval with multi-platform support
 */
export async function getEnhancedTranscript(videoUrl: string): Promise<TranscriptResult | null> {
  // Detect platform first
  const videoInfo = detectVideoPlatform(videoUrl);
  if (!videoInfo) {
    console.error(`Unsupported video URL format: ${videoUrl}`);
    return null;
  }
  
  const cacheKey = `${videoInfo.platform}-${videoInfo.id}`;
  
  // Check cache first
  const cached = getCachedTranscript(cacheKey);
  if (cached) {
    console.log(`Using cached transcript for ${videoInfo.platform}:${videoInfo.id}`);
    return cached;
  }
  
  // Check if already processing (prevent duplicates)
  if (processingQueue.has(cacheKey)) {
    console.log(`Waiting for existing processing of ${cacheKey}`);
    return await processingQueue.get(cacheKey)!;
  }
  
  // Start processing
  const processingPromise = processVideoTranscript(videoInfo);
  processingQueue.set(cacheKey, processingPromise);
  
  try {
    const result = await processingPromise;
    
    if (result) {
      setCachedTranscript(cacheKey, result);
    }
    
    return result;
  } finally {
    processingQueue.delete(cacheKey);
  }
}

/**
 * PHASE 2A: Main transcript processing function with quality enhancement
 */
async function processVideoTranscript(videoInfo: VideoInfo): Promise<TranscriptResult | null> {
  console.log(`Processing ${videoInfo.platform} video: ${videoInfo.id}`);
  
  // Store video info for potential re-download
  videoInfoCache.set(videoInfo.id, videoInfo);
  
  // Get transcript strategies based on platform
  const strategies = getPlatformStrategies(videoInfo);
  
  // Check if Google Cloud API key is configured (since it's our primary method)
  if (!googleApiKey && strategies[0]?.method === 'google-video-intelligence') {
    console.error('❌ CRITICAL: Google Cloud API key is not configured!');
    console.error('📝 To fix this:');
    console.error('1. Create a file named .env.local in your project root');
    console.error('2. Add: GOOGLE_CLOUD_API_KEY=your_api_key_here');
    console.error('3. Get your API key from: https://console.cloud.google.com/apis/credentials');
    console.error('4. Enable Video Intelligence API in Google Cloud Console');
    console.error('5. Restart your development server');
    
    // Try fallback strategies if available
    const fallbackStrategies = strategies.filter(s => s.method !== 'google-video-intelligence');
    if (fallbackStrategies.length === 0) {
      throw new Error('No Google Cloud API key configured. Please set GOOGLE_CLOUD_API_KEY in .env.local file.');
    }
    console.log('⚠️ Attempting fallback strategies...');
    strategies.splice(0, 1); // Remove Google Video Intelligence from strategies
  }
  
  let lastError: Error | null = null;
  
  // Try each strategy in order
  for (const [index, strategy] of strategies.entries()) {
    try {
      console.log(`Trying ${videoInfo.platform} strategy ${index + 1}/${strategies.length}: ${strategy.method}`);
      
      const result = await executeTranscriptStrategy(strategy, videoInfo);
      
      if (result && result.segments.length > 0) {
        console.log(`✓ Strategy succeeded: ${strategy.method}, ${result.segments.length} segments`);
        
        // PHASE 2B: Apply AI-powered quality enhancement
        if (result.quality !== 'high' || result.source === 'youtube-transcript') {
          console.log('🤖 Applying AI-powered transcript enhancement...');
          const enhanced = await enhanceTranscriptQuality(result);
          return enhanced;
        }
        
        return result;
        }
        
      } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');
      console.warn(`Strategy ${strategy.method} failed:`, lastError.message);
      
      // If YouTube transcript fails due to disabled captions, skip other YouTube methods
      if (videoInfo.platform === 'youtube' && lastError.message.includes('Transcript is disabled')) {
        console.log('YouTube transcripts are disabled for this video, trying audio extraction...');
        // Skip to audio extraction strategies
        const audioStrategies = strategies.filter(s => s.method.includes('whisper'));
        if (audioStrategies.length > 0) {
          const audioStrategy = audioStrategies[0];
          try {
            const result = await executeTranscriptStrategy(audioStrategy, videoInfo);
            if (result && result.segments.length > 0) {
              console.log(`✓ Audio extraction succeeded: ${result.segments.length} segments`);
              return result;
            }
          } catch (audioError) {
            console.error('Audio extraction also failed:', audioError);
          }
        }
        break;
      }
    }
  }
  
  throw lastError || new Error('All transcript strategies failed');
}

/**
 * PHASE 2A: Get platform-specific transcript strategies in priority order
 */
function getPlatformStrategies(videoInfo: VideoInfo): Array<{ method: string; priority: number }> {
  const strategies = [];
  
  switch (videoInfo.platform) {
    case 'youtube':
      strategies.push(
        // PRIORITY 1: Audio extraction with Whisper - most reliable method
        { method: 'whisper-optimized', priority: 1 },
        // PRIORITY 2: YouTube transcript library - fallback if Whisper fails
        { method: 'youtube-transcript-lib', priority: 2 },
        // PRIORITY 3: YouTube API captions if available
        { method: 'youtube-api-captions', priority: 3 }
      );
      break;
      
    case 'vimeo':
      strategies.push(
        { method: 'vimeo-captions', priority: 1 },
        { method: 'whisper-optimized', priority: 2 }
      );
      break;
      
    case 'twitter':
    case 'tiktok':
    case 'instagram':
      strategies.push(
        { method: 'whisper-optimized', priority: 1 }
      );
      break;
      
    case 'direct':
      // For direct MP4 files, use Google Video Intelligence
      strategies.push(
        { method: 'google-video-intelligence', priority: 1 },
        { method: 'whisper-optimized', priority: 2 }
      );
      break;
      
    case 'generic':
      strategies.push(
        { method: 'google-video-intelligence', priority: 1 },
        { method: 'whisper-optimized', priority: 2 }
      );
      break;
      
    default:
      strategies.push(
        { method: 'whisper-optimized', priority: 1 }
      );
  }
  
  return strategies.sort((a, b) => a.priority - b.priority);
}

/**
 * PHASE 2A: Enhanced Whisper processing with multiple fallbacks
 */
async function getOptimizedWhisperTranscript(videoInfo: VideoInfo): Promise<TranscriptResult | null> {
  if (!openai) {
    throw new Error('OpenAI API key not available for Whisper transcription');
  }

  let tempDir: string | null = null;
  let audioPath: string | null = null;

  try {
    // Create temporary directory
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'twipclip-whisper-'));
    audioPath = path.join(tempDir, `${videoInfo.id}.m4a`);
    
    console.log(`Extracting audio for ${videoInfo.platform}:${videoInfo.id}...`);
    
    // Platform-specific audio extraction
    const extractionSuccess = await extractAudioMultiStrategy(videoInfo, audioPath);
    
    if (!extractionSuccess) {
      throw new Error('All audio extraction strategies failed');
    }
    
    // Check file size
    const stats = await fs.stat(audioPath);
    const sizeMB = stats.size / (1024 * 1024);
    console.log(`Audio file size: ${sizeMB.toFixed(1)}MB`);
    
    // Use chunking for large files
    if (sizeMB > 24) {
      console.log('🚀 Using advanced chunking strategy for large audio file...');
      
      const segments = await transcribeLargeAudio(audioPath, tempDir, openai);
      
      if (segments && segments.length > 0) {
        return {
          segments,
          source: 'whisper-api',
          quality: 'high',
          language: 'en',
          confidence: 0.95,
          platform: videoInfo.platform as any
        };
      }
    }
    
    // For smaller files, use the original approach
    console.log('Uploading to Whisper API...');
    
    const audioFile = await fs.readFile(audioPath);
    const audioBlob = new File([audioFile], `${videoInfo.id}.m4a`, { type: 'audio/m4a' });
    
    const transcription = await openai.audio.transcriptions.create({
        file: audioBlob,
        model: 'whisper-1',
      language: 'en', // Auto-detect or specify
        response_format: 'verbose_json',
        timestamp_granularities: ['segment']
    });
    
    if (!transcription.segments || transcription.segments.length === 0) {
      throw new Error('Whisper returned empty transcription');
    }
    
    // Convert Whisper segments to our format
    const segments: TranscriptSegment[] = transcription.segments.map((segment: any) => ({
          text: segment.text.trim(),
          offset: segment.start,
          duration: segment.end - segment.start
    }));
    
    return {
      segments,
      source: 'whisper-api',
      quality: 'high',
      language: transcription.language || 'en',
      confidence: 0.95, // Whisper is generally high confidence
      platform: videoInfo.platform as any
    };
    
  } catch (error) {
    console.error('Whisper transcription failed:', error);
    throw error;
  } finally {
    // Cleanup
    if (tempDir) {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch (cleanupError) {
        console.warn('Failed to cleanup temp directory:', cleanupError);
      }
    }
  }
}

/**
 * PHASE 2A: Multi-strategy audio extraction
 */
async function extractAudioMultiStrategy(videoInfo: VideoInfo, outputPath: string): Promise<boolean> {
  // Initialize commands if not already done
  if (!workingYtDlpCommand || !workingFFmpegCommand) {
    await getYtDlpCommand();
    await getFFmpegCommand();
  }
  
  const strategies = getAudioExtractionStrategies(videoInfo, outputPath);
  
  // Get the directory where the file should be created
  const outputDir = path.dirname(outputPath);
  
  for (const [index, strategy] of strategies.entries()) {
    try {
      console.log(`Trying audio extraction strategy ${index + 1}/${strategies.length}`);
      console.log(`Command: ${strategy.command.substring(0, 100)}...`);
      
      const { stdout, stderr } = await execAsync(strategy.command, {
        timeout: strategy.timeout || 30000,
        maxBuffer: 1024 * 1024 * 50, // 50MB buffer
        cwd: outputDir // Run in the temp directory
      });
      
      // Log any stderr output for debugging
      if (stderr) {
        console.log(`Command stderr: ${stderr.substring(0, 200)}`);
      }
      
      // Check for any output files (m4a, mp3, mp4, etc.)
      const files = await fs.readdir(outputDir);
      const audioFiles = files.filter(f => 
        f.startsWith(path.basename(outputPath, path.extname(outputPath))) &&
        (f.endsWith('.m4a') || f.endsWith('.mp3') || f.endsWith('.mp4') || f.endsWith('.webm'))
      );
      
      if (audioFiles.length > 0) {
        // Use the first audio file found
        const actualFile = path.join(outputDir, audioFiles[0]);
        const stats = await fs.stat(actualFile);
        
        if (stats.size > 1000) { // At least 1KB
          // If it's not the expected file, rename it
          if (actualFile !== outputPath) {
            await fs.rename(actualFile, outputPath);
          }
          console.log(`✓ Audio extraction successful: ${audioFiles[0]} (${(stats.size / 1024 / 1024).toFixed(1)}MB)`);
          return true;
        }
      }
      
      // If no file found, check the exact output path
      try {
        const stats = await fs.stat(outputPath);
        if (stats.size > 1000) { // At least 1KB
          console.log(`✓ Audio extraction successful: ${(stats.size / 1024 / 1024).toFixed(1)}MB`);
          return true;
        }
      } catch {}
      
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.warn(`Audio extraction strategy ${index + 1} failed:`, errorMsg.split('\n')[0]);
      
      // Log more details for debugging
      if (errorMsg.includes('yt-dlp')) {
        console.warn('  → yt-dlp error detected. Check if yt-dlp is installed and accessible.');
      }
      if (errorMsg.includes('ffmpeg')) {
        console.warn('  → ffmpeg error detected. Check if ffmpeg is installed and accessible.');
      }
      if (errorMsg.includes('ERROR') || errorMsg.includes('unavailable') || errorMsg.includes('private')) {
        console.warn('  → Video might be private, deleted, or region-restricted.');
      }
      
      // Clean up any failed attempts
      try {
        const files = await fs.readdir(outputDir);
        for (const file of files) {
          if (file.startsWith(path.basename(outputPath, path.extname(outputPath)))) {
            await fs.unlink(path.join(outputDir, file));
          }
        }
      } catch {}
    }
  }
  
  return false;
}

/**
 * PHASE 2A: Platform-specific audio extraction strategies
 */
function getAudioExtractionStrategies(videoInfo: VideoInfo, fullOutputPath: string): Array<{ command: string; timeout?: number }> {
  const strategies: Array<{ command: string; timeout?: number }> = [];
  const videoUrl = videoInfo.url;
  const tempDir = path.dirname(fullOutputPath);
  const outputFilename = path.basename(fullOutputPath, path.extname(fullOutputPath));
  
  // Use just the filename for yt-dlp, since we'll set cwd to the temp directory
  const outputPattern = `${outputFilename}.%(ext)s`;
  
  // Get FFmpeg path (will be set during initialization)
  // On Railway/Docker, use the commands directly without full paths
  const isDocker = process.env.RAILWAY_ENVIRONMENT || process.env.DOCKER_ENV;
  const ffmpegPath = isDocker ? 'ffmpeg' : (workingFFmpegCommand || 'ffmpeg');
  const ytDlpPath = isDocker ? 'yt-dlp' : (workingYtDlpCommand || 'yt-dlp');
  
  switch (videoInfo.platform) {
    case 'youtube':
      // On Docker/Railway, don't quote the command paths
      if (isDocker) {
        strategies.push(
          // Strategy 1: Simple audio extraction
          {
            command: `${ytDlpPath} -x --audio-format m4a --no-playlist --no-warnings -o "${outputPattern}" "${videoUrl}"`,
            timeout: 120000 // 2 minutes
          },
          // Strategy 2: Direct audio download
          {
            command: `${ytDlpPath} -f bestaudio --no-playlist --no-warnings -o "${outputPattern}" "${videoUrl}"`,
            timeout: 120000
          },
          // Strategy 3: Worst audio for smaller size
          {
            command: `${ytDlpPath} -f worstaudio --no-playlist --no-warnings -o "${outputPattern}" "${videoUrl}"`,
            timeout: 120000
          }
        );
      } else {
        strategies.push(
          // Strategy 1: Download best audio (let yt-dlp choose format)
          {
            command: `"${ytDlpPath}" --ffmpeg-location "${ffmpegPath}" -x --audio-format m4a --no-playlist --no-warnings -o "${outputPattern}" "${videoUrl}"`,
            timeout: 120000 // 2 minutes
          },
          // Strategy 2: Direct audio download without conversion
          {
            command: `"${ytDlpPath}" -f "bestaudio" --no-playlist --no-warnings -o "${outputPattern}" "${videoUrl}"`,
            timeout: 120000
          },
          // Strategy 3: Download with worstaudio format for smaller size
          {
            command: `"${ytDlpPath}" -f "worstaudio" --extract-audio --audio-format m4a --no-playlist --no-warnings -o "${outputPattern}" "${videoUrl}"`,
            timeout: 120000
          },
          // Strategy 4: Fallback - download small video
          {
            command: `"${ytDlpPath}" -f "worst[height>=144]" --no-playlist --no-warnings -o "${outputFilename}.mp4" "${videoUrl}"`,
            timeout: 180000 // 3 minutes
          }
        );
      }
      break;
      
    case 'vimeo':
      strategies.push(
        {
          command: `"${ytDlpPath}" -f "bestaudio/best" --no-playlist --quiet -o "${outputPattern}" "${videoUrl}"`,
          timeout: 45000
        }
      );
      break;
      
    case 'twitter':
      strategies.push(
        {
          command: `"${ytDlpPath}" -f "bestaudio/best" --no-playlist --quiet -o "${outputPattern}" "${videoUrl}"`,
          timeout: 45000
        }
      );
      break;
      
    case 'direct':
    case 'generic':
      strategies.push(
        // Direct download with PowerShell (Windows-compatible)
        {
          command: `powershell -Command "Invoke-WebRequest -Uri '${videoUrl}' -OutFile '${outputFilename}.mp4'"`,
          timeout: 60000
        },
        // Try yt-dlp for generic URLs (might work for some video platforms)
        {
          command: `"${ytDlpPath}" -f "bestaudio/best" --no-playlist --quiet -o "${outputPattern}" "${videoUrl}"`,
          timeout: 60000
        }
      );
      break;
      
    default:
      strategies.push(
        {
          command: `"${ytDlpPath}" -f "bestaudio/best" --no-playlist --quiet -o "${outputPattern}" "${videoUrl}"`,
          timeout: 60000
        }
      );
  }
  
  return strategies;
}

/**
 * PHASE 2A: Get detailed video information
 */
async function getDetailedVideoInfo(videoInfo: VideoInfo): Promise<VideoInfo | null> {
  try {
    if (videoInfo.platform === 'youtube') {
      // Use YouTube API if available
      if (process.env.YOUTUBE_API_KEY) {
        const response = await axios.get(
          `https://youtube.googleapis.com/youtube/v3/videos?part=contentDetails,snippet,status&id=${videoInfo.id}&key=${process.env.YOUTUBE_API_KEY}`,
          { timeout: 5000 }
        );
        
        const videoData = response.data?.items?.[0];
        if (videoData) {
          const duration = parseDuration(videoData.contentDetails?.duration || 'PT0S');
    
    return {
            ...videoInfo,
            title: videoData.snippet?.title,
            duration,
            isLive: videoData.snippet?.liveBroadcastContent === 'live',
            isPrivate: videoData.status?.privacyStatus === 'private'
          };
        }
      }
    }
    
    // Fallback: return basic info for other platforms
    return {
      ...videoInfo,
      title: `${videoInfo.platform} video`,
      duration: 300, // Assume 5 minutes average
      isLive: false,
      isPrivate: false
    };
    
  } catch (error) {
    console.warn('Failed to get detailed video info:', error);
    return videoInfo; // Return basic info on failure
  }
}

/**
 * PHASE 2A: Execute transcript strategy based on method
 */
async function executeTranscriptStrategy(strategy: { method: string; priority: number }, videoInfo: VideoInfo): Promise<TranscriptResult | null> {
  switch (strategy.method) {
    case 'whisper-optimized':
    case 'direct-whisper':
      return await getOptimizedWhisperTranscript(videoInfo);
      
    case 'youtube-transcript-lib':
      return await getYouTubeTranscriptLibrary(videoInfo.id);
      
    case 'youtube-api-captions':
      return await getYouTubeAPITranscript(videoInfo.id);
      
    case 'google-video-intelligence':
      return await getGoogleVideoIntelligenceTranscript(videoInfo);
      
    case 'google-video-intelligence-downloaded':
      return await getGoogleVideoIntelligenceWithDownload(videoInfo);
      
    case 'vimeo-captions':
      return await getVimeoTranscript(videoInfo.id);
      
    case 'whisper-fallback':
      return await getWhisperFallback(videoInfo);
      
    default:
      throw new Error(`Unknown transcript strategy: ${strategy.method}`);
  }
}

/**
 * PHASE 2A: Optimize audio file for Whisper processing
 */
async function optimizeAudioForWhisper(audioPath: string, tempDir: string): Promise<void> {
  try {
    const stats = await fs.stat(audioPath);
    const fileSizeMB = stats.size / (1024 * 1024);
    
    console.log(`Audio file size: ${fileSizeMB.toFixed(1)}MB`);
    
    // Check if FFmpeg is available
    const hasFFmpeg = await checkFFmpegAvailability();
    const ffmpegCmd = await getFFmpegCommand();
    
    // If file is small enough, just convert format if needed
    if (fileSizeMB <= 24) {
      const fileExt = path.extname(audioPath).toLowerCase();
      if (!['.m4a', '.mp3', '.wav'].includes(fileExt) && hasFFmpeg) {
        console.log('Converting audio to m4a format...');
        
        const convertedPath = audioPath.replace(path.extname(audioPath), '.m4a');
        
        try {
          await execAsync(`"${ffmpegCmd}" -i "${audioPath}" -c:a aac -b:a 128k "${convertedPath}" -y`, {
            timeout: 30000
          });
          
          await fs.unlink(audioPath);
          await fs.rename(convertedPath, audioPath);
          
          console.log('✓ Audio converted to m4a format');
        } catch (ffmpegError) {
          console.warn('Audio conversion failed, using original format');
        }
      }
      return;
    }
    
    // If file is too large (>24MB), we need to handle it differently
    console.log('Audio file too large for Whisper API, attempting to optimize...');
    
    if (!hasFFmpeg) {
      // Without FFmpeg, we can't trim or compress the audio
      // Try using yt-dlp to re-download with lower quality
      console.log('FFmpeg not available, trying alternative methods...');
      
      // If we have the video URL, try re-downloading with lower quality
      const videoInfo = videoInfoCache.get(path.basename(audioPath, path.extname(audioPath)));
      if (videoInfo) {
        try {
          const lowQualityPath = path.join(tempDir, `low_quality_${path.basename(audioPath)}`);
          const ytDlpCmd = await getYtDlpCommand();
          // Use very aggressive compression settings
          const downloadCmd = `"${ytDlpCmd}" -f "worstaudio[abr<64]/worstaudio/worst" --extract-audio --audio-format m4a --audio-quality 9 --postprocessor-args "-ac 1 -ar 16000" -o "${lowQualityPath}" "${videoInfo.url}"`;
          
          console.log('Attempting to re-download with very low quality for size reduction...');
          await execAsync(downloadCmd, { timeout: 60000, cwd: tempDir });
          
          const lowQualityStats = await fs.stat(lowQualityPath).catch(() => null);
          if (lowQualityStats && lowQualityStats.size < 25 * 1024 * 1024) {
            await fs.unlink(audioPath);
            await fs.rename(lowQualityPath, audioPath);
            console.log(`✓ Re-downloaded audio with lower quality: ${(lowQualityStats.size / 1024 / 1024).toFixed(1)}MB`);
            return;
        }
      } catch (error) {
          console.warn('Low quality re-download failed:', error);
        }
      }
      
      throw new Error(`Audio file too large (${fileSizeMB.toFixed(1)}MB) and FFmpeg not available for compression. Please install FFmpeg or use shorter videos.`);
    }
    
    // If FFmpeg is available, use aggressive compression strategies
    console.log('Using FFmpeg for audio compression...');
    
    // Strategy 1: Aggressive compression with mono, low sample rate, and limited duration
    const compressedPath = path.join(tempDir, `compressed_${path.basename(audioPath)}`);
    
    try {
      // First 10 minutes, mono, 16kHz, 32kbps - should be under 4MB
      await execAsync(`"${ffmpegCmd}" -i "${audioPath}" -t 600 -ac 1 -ar 16000 -b:a 32k "${compressedPath}" -y`, {
        timeout: 30000
      });
      
      const compressedStats = await fs.stat(compressedPath);
      if (compressedStats.size < 25 * 1024 * 1024) {
        await fs.unlink(audioPath);
        await fs.rename(compressedPath, audioPath);
        console.log(`✓ Audio compressed to ${(compressedStats.size / 1024 / 1024).toFixed(1)}MB (10 min, mono, 16kHz)`);
        return;
      } else {
        await fs.unlink(compressedPath);
      }
    } catch (compressionError) {
      console.warn('Initial compression failed:', compressionError);
    }
    
    // Strategy 2: Even more aggressive - 5 minutes only
    try {
      const shortPath = path.join(tempDir, `short_${path.basename(audioPath)}`);
      await execAsync(`"${ffmpegCmd}" -i "${audioPath}" -t 300 -ac 1 -ar 16000 -b:a 24k "${shortPath}" -y`, {
        timeout: 30000
      });
      
      const shortStats = await fs.stat(shortPath);
      if (shortStats.size < 25 * 1024 * 1024) {
        await fs.unlink(audioPath);
        await fs.rename(shortPath, audioPath);
        console.log(`✓ Audio trimmed to 5 minutes, ${(shortStats.size / 1024 / 1024).toFixed(1)}MB`);
        return;
      } else {
        await fs.unlink(shortPath);
      }
  } catch (error) {
      console.warn('Short trimming failed');
    }
    
    // Strategy 3: Extract middle portion (2-7 minutes) which often has the best content
    try {
      const middlePath = path.join(tempDir, `middle_${path.basename(audioPath)}`);
      await execAsync(`"${ffmpegCmd}" -ss 120 -i "${audioPath}" -t 300 -ac 1 -ar 16000 -b:a 32k "${middlePath}" -y`, {
        timeout: 30000
      });
      
      const middleStats = await fs.stat(middlePath);
      if (middleStats.size < 25 * 1024 * 1024) {
        await fs.unlink(audioPath);
        await fs.rename(middlePath, audioPath);
        console.log(`✓ Extracted middle 5 minutes (2-7 min), ${(middleStats.size / 1024 / 1024).toFixed(1)}MB`);
        return;
      } else {
        await fs.unlink(middlePath);
      }
    } catch (error) {
      console.warn('Middle extraction failed');
    }
    
    // If all strategies fail, throw error with helpful message
    throw new Error(`Audio file too large (${fileSizeMB.toFixed(1)}MB) for Whisper API. Maximum supported size is 25MB. Consider using a shorter video or YouTube transcript API instead.`);
    
  } catch (error) {
    console.error('Audio optimization failed:', error);
    throw error;
  }
}

/**
 * PHASE 2A: Fallback transcript methods
 */
async function getYouTubeTranscriptLibrary(videoId: string): Promise<TranscriptResult | null> {
  try {
    console.log('Fetching YouTube transcript using youtube-transcript library...');
    
    // First, check if video exists and get metadata
    if (process.env.YOUTUBE_API_KEY) {
      try {
        const videoInfo = await getVideoInfo(videoId);
        if (!videoInfo) {
          throw new Error('Video not found or inaccessible');
        }
        console.log(`Video found: "${videoInfo.snippet?.title || 'Unknown title'}" (${videoInfo.contentDetails?.duration || 'Unknown duration'})`);
      } catch (e) {
        console.warn('Could not fetch video metadata, continuing anyway...');
      }
    }
    
    // Try to fetch transcript with multiple language options
    let transcriptItems: any[] = [];
    const languagesToTry = ['en', 'en-US', 'en-GB'];
    
    for (const lang of languagesToTry) {
      try {
        console.log(`Trying language: ${lang}`);
        transcriptItems = await Promise.race([
          YoutubeTranscript.fetchTranscript(videoId, {
            lang: lang,
            // @ts-ignore - Types are incomplete
            cookies: undefined
          }),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('YouTube transcript fetch timeout')), 15000)
          )
        ]) as any[];
        
        if (transcriptItems && transcriptItems.length > 0) {
          console.log(`✓ Found transcript in ${lang}: ${transcriptItems.length} items`);
          break;
        }
      } catch (langError) {
        console.log(`No transcript found for language ${lang}`);
      }
    }
    
    // If still no transcript, try without language specification (gets auto-generated)
    if (!transcriptItems || transcriptItems.length === 0) {
      console.log('Trying to fetch auto-generated transcript...');
      try {
        transcriptItems = await Promise.race([
          YoutubeTranscript.fetchTranscript(videoId),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('YouTube transcript fetch timeout')), 15000)
          )
        ]) as any[];
        
        if (transcriptItems && transcriptItems.length > 0) {
          console.log(`✓ Found auto-generated transcript: ${transcriptItems.length} items`);
        }
      } catch (e) {
        console.log('Failed to fetch auto-generated transcript');
        
        // Last attempt: try with different options
        try {
          console.log('Final attempt: trying all available transcripts...');
          transcriptItems = await Promise.race([
            YoutubeTranscript.fetchTranscript(videoId, {
              // @ts-ignore
              lang: undefined
            }),
            new Promise<never>((_, reject) => 
              setTimeout(() => reject(new Error('YouTube transcript fetch timeout')), 15000)
            )
          ]) as any[];
        } catch (finalError) {
          console.log('All transcript fetch attempts failed');
        }
      }
    }
    
    if (!transcriptItems || transcriptItems.length === 0) {
      throw new Error('No transcript available in any language');
    }
    
    console.log(`✓ YouTube transcript fetched: ${transcriptItems.length} items`);
    
    const segments: TranscriptSegment[] = transcriptItems.map(item => ({
      text: item.text.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim(),
      offset: item.offset / 1000, // Convert ms to seconds
      duration: item.duration / 1000 // Convert ms to seconds
    }));
    
    // Merge very short segments (less than 2 seconds) with adjacent ones
    const mergedSegments: TranscriptSegment[] = [];
    let currentSegment: TranscriptSegment | null = null;
    
    for (const segment of segments) {
      if (!currentSegment) {
        currentSegment = { ...segment };
      } else if (segment.duration < 2 && currentSegment.duration < 10) {
        // Merge with current segment
        currentSegment.text += ' ' + segment.text;
        currentSegment.duration = (segment.offset + segment.duration) - currentSegment.offset;
      } else {
        mergedSegments.push(currentSegment);
        currentSegment = { ...segment };
      }
    }
    
    if (currentSegment) {
      mergedSegments.push(currentSegment);
    }
    
    // If we end up with just 1 segment, break it into smaller chunks
    if (mergedSegments.length === 1 && segments.length > 10) {
      console.log(`⚠️ Segment merging too aggressive, breaking into chunks...`);
      const singleSegment = mergedSegments[0];
      const words = singleSegment.text.split(' ');
      const wordsPerSegment = Math.ceil(words.length / Math.ceil(segments.length / 10));
      
      const chunkedSegments: TranscriptSegment[] = [];
      for (let i = 0; i < words.length; i += wordsPerSegment) {
        const chunk = words.slice(i, i + wordsPerSegment).join(' ');
        const segmentIndex = Math.floor(i / wordsPerSegment);
        const timePerChunk = singleSegment.duration / Math.ceil(words.length / wordsPerSegment);
        
        chunkedSegments.push({
          text: chunk,
          offset: singleSegment.offset + (segmentIndex * timePerChunk),
          duration: timePerChunk
        });
      }
      
      console.log(`✓ Split into ${chunkedSegments.length} segments`);
    return {
        segments: chunkedSegments,
        source: 'youtube-transcript',
        quality: 'medium',
        language: 'en',
        confidence: 0.8,
        platform: 'youtube'
      };
    }
    
    console.log(`✓ Segments merged: ${segments.length} → ${mergedSegments.length} segments`);
    
    return {
      segments: mergedSegments,
      source: 'youtube-transcript',
      quality: 'medium',
      language: 'en',
      confidence: 0.8,
      platform: 'youtube'
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Check for specific error types
    if (errorMessage.includes('Transcript is disabled') || 
        errorMessage.includes('Transcripts are disabled') ||
        errorMessage.includes('Subtitles are disabled')) {
      throw new Error(`YouTube transcripts/captions are disabled for this video`);
    }
    
    if (errorMessage.includes('Could not find') || 
        errorMessage.includes('Video unavailable')) {
      throw new Error(`YouTube video not found or unavailable`);
    }
    
    if (errorMessage.includes('No transcript available')) {
      throw new Error(`No transcript/captions available for this YouTube video`);
    }
    
    throw new Error(`YouTube transcript library failed: ${errorMessage}`);
  }
}

async function getYouTubeAPITranscript(videoId: string): Promise<TranscriptResult | null> {
  // Placeholder for YouTube API captions - implement when needed
  console.warn('YouTube API captions not yet implemented, falling back');
  return null;
}

async function getVimeoTranscript(videoId: string): Promise<TranscriptResult | null> {
  // Placeholder for Vimeo captions - implement when needed
  console.warn('Vimeo captions not yet implemented, falling back');
  return null;
}

async function getWhisperFallback(videoInfo: VideoInfo): Promise<TranscriptResult | null> {
  // Placeholder for local Whisper fallback - implement when needed
  console.warn('Local Whisper fallback not yet implemented, falling back');
  return null;
}

/**
 * PHASE 2A: Utility functions
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Parse ISO 8601 duration format (PT1H2M3S)
 */
function parseDuration(duration: string): number {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  
  const hours = parseInt(match[1] || '0');
  const minutes = parseInt(match[2] || '0');
  const seconds = parseInt(match[3] || '0');
  
  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Check if video is suitable for transcript processing
 */
function isVideoSuitable(videoInfo: any): boolean {
  if (!videoInfo.duration) return true; // If no duration info, assume suitable
  
  // Skip videos that are too short (< 10 seconds) or too long (> 2 hours)
  if (videoInfo.duration < 10 || videoInfo.duration > 7200) return false;
  
  // Skip live streams
  if (videoInfo.isLive) return false;
  
  return true;
}

/**
 * Cache management functions
 */
function getCachedTranscript(videoId: string): TranscriptResult | null {
  const cached = transcriptCache.get(videoId);
  if (!cached) return null;
  
  // Check if cache is still valid
  if (Date.now() - cached.timestamp > CACHE_TTL) {
    transcriptCache.delete(videoId);
    return null;
  }
  
  return cached.data;
}

function setCachedTranscript(videoId: string, transcript: TranscriptResult): void {
  transcriptCache.set(videoId, {
    data: transcript,
    timestamp: Date.now()
  });
  
  // Simple cache cleanup - remove old entries if cache gets too large
  if (transcriptCache.size > 500) {
    const entries = Array.from(transcriptCache.entries());
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    
    // Remove oldest 25% of entries
    const toRemove = entries.slice(0, Math.floor(entries.length * 0.25));
    toRemove.forEach(([key]) => transcriptCache.delete(key));
  }
}

/**
 * Enhanced punctuation for transcripts that lack proper punctuation
 */
function enhancePunctuation(segments: TranscriptSegment[]): TranscriptSegment[] {
  return segments.map(segment => {
    let text = segment.text;
    
    // Basic punctuation rules
    // Capitalize first letter
    text = text.charAt(0).toUpperCase() + text.slice(1);
    
    // Add period at end if missing
    if (text.length > 0 && !text.match(/[.!?]$/)) {
      text += '.';
    }
    
    // Capitalize after sentence endings
    text = text.replace(/([.!?]\s+)([a-z])/g, (match, p1, p2) => p1 + p2.toUpperCase());
    
    // Common abbreviations and contractions
    text = text.replace(/\bi\b/g, 'I');
    text = text.replace(/\bi'm\b/gi, "I'm");
    text = text.replace(/\bi'll\b/gi, "I'll");
    text = text.replace(/\bi've\b/gi, "I've");
    text = text.replace(/\bcan't\b/gi, "can't");
    text = text.replace(/\bwon't\b/gi, "won't");
    text = text.replace(/\bdon't\b/gi, "don't");
    
    return {
      ...segment,
      text
    };
  });
}

/**
 * Get video information to determine if it's suitable for processing
 */
async function getVideoInfo(videoId: string) {
  try {
    const response = await axios.get(
      `https://youtube.googleapis.com/youtube/v3/videos?part=contentDetails,snippet&id=${videoId}&key=${process.env.YOUTUBE_API_KEY}`,
      { timeout: 5000 }
    );
    
    return response.data?.items?.[0] || null;
  } catch (error) {
    console.warn('Failed to get video info:', error);
    return null;
  }
}

/**
 * PHASE 2A: Parallel batch processing for multiple videos
 */
export async function batchGetTranscripts(videoUrls: string[], maxConcurrent: number = 3): Promise<Map<string, TranscriptResult | null>> {
  const results = new Map<string, TranscriptResult | null>();
  
  // Process videos in batches to avoid overwhelming APIs
  const batches = [];
  for (let i = 0; i < videoUrls.length; i += maxConcurrent) {
    batches.push(videoUrls.slice(i, i + maxConcurrent));
  }
  
  let processedCount = 0;
  const totalVideos = videoUrls.length;
  
  for (const [batchIndex, batch] of batches.entries()) {
    console.log(`Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} videos)`);
    
    const batchPromises = batch.map(async (videoUrl) => {
      try {
        const result = await getEnhancedTranscript(videoUrl);
        processedCount++;
        
        console.log(`✓ Processed ${processedCount}/${totalVideos}: ${videoUrl}`);
        return { url: videoUrl, result };
      } catch (error) {
        console.error(`✗ Failed to process ${videoUrl}:`, error);
        processedCount++;
        return { url: videoUrl, result: null };
      }
    });
    
    const batchResults = await Promise.all(batchPromises);
    
    // Store results
    batchResults.forEach(({ url, result }) => {
      results.set(url, result);
    });
    
    // Add delay between batches to be respectful to APIs
    if (batchIndex < batches.length - 1) {
      await sleep(2000 + Math.random() * 1000);
    }
  }
  
  return results;
}

/**
 * Get cache statistics
 */
export function getTranscriptCacheStats(): { size: number; memoryUsageMB: number } {
  const size = transcriptCache.size;
  const memoryUsageMB = Math.round(size * 10 / 1024 * 100) / 100; // Rough estimate
  
  return { size, memoryUsageMB };
}

/**
 * Clear transcript cache
 */
export function clearTranscriptCache(): void {
  transcriptCache.clear();
  processingQueue.clear();
  videoInfoCache.clear();
  console.log('✅ Transcript cache cleared!');
}

/**
 * PHASE 2A: Google Video Intelligence API transcription
 * Handles videos up to 10GB!
 */
async function getGoogleVideoIntelligenceTranscript(videoInfo: VideoInfo): Promise<TranscriptResult | null> {
  if (!googleApiKey) {
    console.error('❌ Google Cloud API key is not configured!');
    console.error('Please set GOOGLE_CLOUD_API_KEY in your environment variables');
    throw new Error('Google Cloud API key not available');
  }
  
  console.log(`🎬 Using Google Video Intelligence API for ${videoInfo.platform}:${videoInfo.id}...`);
  console.log(`📺 Video URL: ${videoInfo.url}`);
  console.log(`🔑 API Key available: ${googleApiKey.substring(0, 10)}...`);
  
  try {
    // Prepare video URI based on platform
    let videoUri = videoInfo.url;
    
    // Special handling for different platforms
    switch (videoInfo.platform) {
      case 'youtube':
        // YouTube URLs need special handling for Google Video Intelligence
        // Try different URL formats that might work with Google Video Intelligence
        
        // First, try the standard watch URL
        videoUri = `https://www.youtube.com/watch?v=${videoInfo.id}`;
        
        console.log(`📹 Processing YouTube video: ${videoUri}`);
        console.log(`⚠️ Trying different YouTube URL formats for Google Video Intelligence...`);
        
        // We'll try the request, and if it fails, we'll try other formats
        // in the error handling
        break;
        
      case 'vimeo':
        // Vimeo may need the direct video file URL
        // Public Vimeo videos should work with the standard URL
        break;
        
      case 'twitter':
      case 'tiktok':
      case 'instagram':
        // These platforms might have restrictions
        console.warn(`⚠️ ${videoInfo.platform} videos may have access restrictions for Google Video Intelligence`);
        break;
        
      case 'direct':
        // Direct video URLs should work if publicly accessible
        break;
    }
    
    console.log(`🔗 Processing video URI: ${videoUri}`);

    // Call Google Video Intelligence API
    const response = await axios.post(
      `https://videointelligence.googleapis.com/v1/videos:annotate?key=${googleApiKey}`,
      {
        inputUri: videoUri,
        features: ['SPEECH_TRANSCRIPTION'],
        videoContext: {
          speechTranscriptionConfig: {
            languageCode: 'en-US',
            enableAutomaticPunctuation: true,
            enableWordTimeOffsets: true,
            enableWordConfidence: true,
            maxAlternatives: 1,
            filterProfanity: false,
            speechContexts: [{
              phrases: [] // Can add context phrases here for better accuracy
            }],
            // Additional settings for better quality
            model: 'latest_long', // Use the latest model for long videos
            useEnhanced: true, // Use enhanced model if available
            // Handle multiple speakers
            enableSpeakerDiarization: true,
            diarizationSpeakerCount: 2, // Assume 2 speakers for interviews/conversations
          }
        }
      },
      {
        timeout: 30000, // 30 second timeout for API call
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
    
    // This returns an operation name for async processing
    const operationName = response.data.name;
    console.log(`⏳ Google Video Intelligence operation started: ${operationName}`);
    
    // Poll for operation completion
    let operationComplete = false;
    let operationResult: any = null;
    let pollAttempts = 0;
    const maxPollAttempts = 120; // 10 minutes max wait for long videos
    
    while (!operationComplete && pollAttempts < maxPollAttempts) {
      pollAttempts++;
      
      // Wait 5 seconds between polls
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      const statusResponse = await axios.get(
        `https://videointelligence.googleapis.com/v1/operations/${operationName}?key=${googleApiKey}`,
        { timeout: 10000 }
      );
      
      if (statusResponse.data.done) {
        operationComplete = true;
        operationResult = statusResponse.data;
        
        if (operationResult.error) {
          throw new Error(`Google Video Intelligence error: ${operationResult.error.message}`);
        }
      } else {
        const progress = statusResponse.data.metadata?.annotationProgress?.[0]?.progressPercent || 0;
        console.log(`⏳ Transcription progress: ${progress}% (${pollAttempts * 5}s elapsed)`);
      }
    }
    
    if (!operationComplete) {
      throw new Error('Google Video Intelligence operation timed out');
    }
    
    console.log(`✅ Transcription operation completed in ${pollAttempts * 5} seconds`);
    
    // Extract transcript segments
    const segments: TranscriptSegment[] = [];
    const annotationResults = operationResult.response?.annotationResults?.[0];
    
    if (!annotationResults?.speechTranscriptions?.length) {
      throw new Error('No speech transcriptions found in video');
    }
    
    // Process each speech transcription
    for (const transcription of annotationResults.speechTranscriptions) {
      if (transcription.alternatives?.[0]?.transcript) {
        const alternative = transcription.alternatives[0];
        
        // If we have word-level timestamps
        if (alternative.words?.length > 0) {
          // Group words into segments of ~10-15 seconds for better context
          let currentSegment: any = null;
          const maxSegmentDuration = 15; // seconds
          
          for (const word of alternative.words) {
            const startTime = parseFloat(word.startTime?.replace('s', '') || '0');
            const endTime = parseFloat(word.endTime?.replace('s', '') || '0');
            
            // Start new segment if:
            // 1. No current segment
            // 2. Current segment is too long
            // 3. There's a significant pause (> 2 seconds)
            const shouldStartNewSegment = !currentSegment || 
              (startTime - currentSegment.startTime > maxSegmentDuration) ||
              (startTime - currentSegment.endTime > 2);
            
            if (shouldStartNewSegment) {
              if (currentSegment) {
                segments.push({
                  text: currentSegment.text.trim(),
                  offset: currentSegment.startTime,
                  duration: currentSegment.endTime - currentSegment.startTime
                });
              }
              
              currentSegment = {
                text: word.word || '',
                startTime: startTime,
                endTime: endTime,
                speakerTag: word.speakerTag || 0
              };
            } else {
              // Add word to current segment
              currentSegment.text += ' ' + (word.word || '');
              currentSegment.endTime = endTime;
            }
          }
          
          // Add last segment
          if (currentSegment) {
            segments.push({
              text: currentSegment.text.trim(),
              offset: currentSegment.startTime,
              duration: currentSegment.endTime - currentSegment.startTime
            });
          }
        } else {
          // Fallback: use the whole transcript as one segment
          segments.push({
            text: alternative.transcript,
            offset: 0,
            duration: 300 // Default 5 minutes
          });
        }
      }
    }
    
    console.log(`✅ Google Video Intelligence transcription complete: ${segments.length} segments`);
    
    // Log some stats
    const totalDuration = segments.reduce((sum, seg) => sum + seg.duration, 0);
    const avgSegmentLength = segments.length > 0 ? totalDuration / segments.length : 0;
    console.log(`📊 Stats: Total duration: ${totalDuration.toFixed(1)}s, Avg segment: ${avgSegmentLength.toFixed(1)}s`);
    
    return {
      segments,
      source: 'google-video-intelligence',
      quality: 'high',
      language: 'en',
      confidence: 0.9,
      platform: videoInfo.platform as any
    };
    
  } catch (error) {
    console.error('❌ Google Video Intelligence transcription failed:', error);
    
    // If it's a YouTube video and we got an error, try alternative URL formats
    if (videoInfo.platform === 'youtube' && error instanceof Error) {
      if (error.message.includes('INVALID_ARGUMENT') || error.message.includes('403')) {
        console.log('🔄 Trying alternative YouTube URL formats...');
        
        // Try YouTube embed URL
        try {
          const embedUri = `https://www.youtube.com/embed/${videoInfo.id}`;
          console.log(`🔗 Trying embed URL: ${embedUri}`);
          
          const embedResponse = await axios.post(
            `https://videointelligence.googleapis.com/v1/videos:annotate?key=${googleApiKey}`,
            {
              inputUri: embedUri,
              features: ['SPEECH_TRANSCRIPTION'],
              videoContext: {
                speechTranscriptionConfig: {
                  languageCode: 'en-US',
                  enableAutomaticPunctuation: true,
                  enableWordTimeOffsets: true,
                  maxAlternatives: 1
                }
              }
            },
            { timeout: 30000 }
          );
          
          // If we got here, it worked! Process the response...
          console.log('✅ Embed URL worked! Processing...');
          // ... continue with the same processing logic as above
          
        } catch (embedError) {
          console.log('❌ Embed URL also failed');
        }
      }
    }
    
    throw error;
  }
}

/**
 * Download YouTube video and process with Google Video Intelligence
 * This downloads the video and creates a temporary public URL
 */
async function getGoogleVideoIntelligenceWithDownload(videoInfo: VideoInfo): Promise<TranscriptResult | null> {
  if (videoInfo.platform !== 'youtube') {
    return null; // This method is only for YouTube
  }
  
  console.log(`📥 Attempting to download YouTube video for Google Video Intelligence...`);
  
  let tempDir: string | null = null;
  let videoPath: string | null = null;
  
  try {
    // Create temporary directory
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'twipclip-video-'));
    videoPath = path.join(tempDir, `${videoInfo.id}.mp4`);
    
    console.log(`📹 Downloading video to: ${videoPath}`);
    
    // Download the video using yt-dlp
    const downloadCmd = `python -m yt_dlp -f "best[ext=mp4]/best" --no-playlist --quiet -o "${videoPath}" "${videoInfo.url}"`;
    
    await execAsync(downloadCmd, {
      timeout: 300000, // 5 minutes for video download
      maxBuffer: 1024 * 1024 * 100 // 100MB buffer
    });
    
    // Check if video was downloaded
    const stats = await fs.stat(videoPath);
    console.log(`✅ Video downloaded: ${(stats.size / 1024 / 1024).toFixed(1)}MB`);
    
    // Here's where we'd need to upload to a cloud service
    // Since we can't create public URLs from local files,
    // we have several options:
    
    console.log(`⚠️ Google Video Intelligence requires a public URL.`);
    console.log(`💡 Options:`);
    console.log(`1. Upload to Google Cloud Storage (requires setup)`);
    console.log(`2. Upload to a temporary file sharing service`);
    console.log(`3. Use Whisper instead (recommended)`);
    
    // For now, fall back to Whisper since it's simpler
    console.log(`🎵 Using Whisper transcription on the downloaded video...`);
    
    // Convert video path to a format Whisper can use
    const audioPath = videoPath.replace('.mp4', '.m4a');
    
    // Extract audio from video
    const ffmpegCmd = await getFFmpegCommand();
    await execAsync(`"${ffmpegCmd}" -i "${videoPath}" -vn -acodec copy "${audioPath}" -y`, {
      timeout: 30000
    });
    
    // Use Whisper on the extracted audio
    if (!openai) {
      throw new Error('OpenAI API key not configured');
    }
    
    console.log('Uploading audio to Whisper API...');
    
    const audioFile = await fs.readFile(audioPath);
    const audioBlob = new File([audioFile], `${videoInfo.id}.m4a`, { type: 'audio/m4a' });
    
    const transcription = await openai.audio.transcriptions.create({
      file: audioBlob,
      model: 'whisper-1',
      language: 'en',
      response_format: 'verbose_json',
      timestamp_granularities: ['segment']
    });
    
    if (!transcription.segments || transcription.segments.length === 0) {
      throw new Error('Whisper returned empty transcription');
    }
    
    // Convert Whisper segments to our format
    const segments: TranscriptSegment[] = transcription.segments.map((segment: any) => ({
      text: segment.text.trim(),
      offset: segment.start,
      duration: segment.end - segment.start
    }));
    
    console.log(`✅ Transcription complete: ${segments.length} segments from downloaded video`);
    
    return {
      segments,
      source: 'whisper-api',
      quality: 'high',
      language: transcription.language || 'en',
      confidence: 0.95,
      platform: videoInfo.platform as any
    };
    
  } catch (error) {
    console.error('Download and transcribe failed:', error);
    throw error;
  } finally {
    // Cleanup
    if (tempDir) {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch (cleanupError) {
        console.warn('Failed to cleanup temp directory:', cleanupError);
      }
    }
  }
} 