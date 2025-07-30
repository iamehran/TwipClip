import { promises as fs } from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import axios from 'axios';
import OpenAI from 'openai';
import { transcribeLargeAudio } from './audio-chunking';
import { getVideoMetadata, determineProcessingStrategy, shouldProcessVideo } from './video-metadata';
import { getFFmpegPath, getYtDlpPath, checkSystemTools } from './system-tools';
import { getYtDlpCommand as getWorkingYtDlpCommand, getFFmpegCommand as getWorkingFFmpegCommand } from '../../src/lib/system-tools';
import { rapidAPIClient } from '../../src/lib/rapidapi-youtube';
import { getRapidAPIClientV2 } from '../../src/lib/rapidapi-youtube-v2';

// Add RapidAPI integration
const USE_RAPIDAPI = process.env.USE_RAPIDAPI === 'true';

// Fix for File API in Node.js environment
if (typeof globalThis.File === 'undefined') {
  const { File } = require('buffer');
  globalThis.File = File;
}

const execAsync = promisify(exec);

// Initialize OpenAI client for Whisper
const openai = process.env.OPENAI_API_KEY 
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) 
  : null;

// Google Cloud Video Intelligence client (if available)

export interface TranscriptSegment {
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
    console.log(`Using yt-dlp command: ${ytDlpPath}`);
    return ytDlpPath;
  } catch (error) {
    console.error('yt-dlp detection failed, trying fallbacks:', error);
    // On Railway/Docker, try known paths
    if (process.env.RAILWAY_ENVIRONMENT || process.env.DOCKER_ENV) {
      // Try common installation paths
      const possiblePaths = ['/usr/local/bin/yt-dlp', '/usr/bin/yt-dlp', 'yt-dlp'];
      for (const path of possiblePaths) {
        try {
          await execAsync(`${path} --version`, { timeout: 5000 });
          workingYtDlpCommand = path;
          console.log(`Found working yt-dlp at: ${path}`);
          return path;
        } catch (e) {
          // Try next path
        }
      }
    }
    workingYtDlpCommand = 'yt-dlp';
    return 'yt-dlp'; // Final fallback
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
export async function getEnhancedTranscript(videoUrl: string, sessionId?: string): Promise<TranscriptResult | null> {
  try {
    if (!videoUrl || typeof videoUrl !== 'string') {
      console.error('Invalid video URL provided');
      return null;
    }
    
    console.log('\n🎬 Getting enhanced transcript for:', videoUrl);
    if (sessionId) {
      console.log('🔐 Using session:', sessionId.substring(0, 8) + '...');
    }
    
    // Detect video platform
    const videoInfo = detectVideoPlatform(videoUrl);
    if (!videoInfo) {
      console.error('Could not detect video platform from URL');
      return null;
    }
    
    console.log(`📺 Platform: ${videoInfo.platform}, ID: ${videoInfo.id}`);
    
    // Check cache first
    const cached = getCachedTranscript(videoInfo.id);
    if (cached) {
      console.log('✅ Using cached transcript');
      return cached;
    }
    
    // Process video transcript with session ID
    const transcript = await processVideoTranscript(videoInfo, sessionId);
    
    if (transcript) {
      setCachedTranscript(videoInfo.id, transcript);
    }
    
    return transcript;
  } catch (error) {
    console.error('Transcription failed:', error);
    return null;
  }
}

/**
 * PHASE 2A: Main transcript processing function with quality enhancement
 */
async function processVideoTranscript(videoInfo: VideoInfo, sessionId?: string): Promise<TranscriptResult | null> {
  console.log(`Processing ${videoInfo.platform} video: ${videoInfo.id}`);
  
  // Store video info for potential re-download
  videoInfoCache.set(videoInfo.id, videoInfo);
  
  // Get video metadata to determine processing strategy
  const metadata = await getVideoMetadata(videoInfo.url, sessionId);
  if (metadata) {
    if (!shouldProcessVideo(metadata)) {
      throw new Error('Video cannot be processed (too long or live)');
    }
    
    const strategy = determineProcessingStrategy(metadata);
    console.log(`📋 Processing strategy: ${strategy.strategy} - ${strategy.reason}`);
    console.log(`📊 Estimated audio size: ${(strategy.estimatedAudioSize / (1024 * 1024)).toFixed(1)}MB`);
  }
  
  try {
    // We only use Whisper-optimized method now
    console.log(`Using audio extraction + Whisper transcription...`);
    
    if (!openai) {
      throw new Error('OpenAI API key not available for Whisper transcription');
    }
    
    const tempDir = path.join(process.cwd(), 'temp');
    await fs.mkdir(tempDir, { recursive: true });
    
    const audioPath = path.join(tempDir, `${videoInfo.id}_audio.m4a`);
    let actualAudioPath = audioPath;
    
    try {
      // Check if we should use RapidAPI
      if (USE_RAPIDAPI) {
        console.log(`🚀 Using RapidAPI for audio extraction...`);
        
        // Download audio using RapidAPI V2 (simplified)
        const rapidV2 = getRapidAPIClientV2();
        const { url: downloadUrl } = await rapidV2.downloadAudio(videoInfo.url);
        
        // Download the file
        console.log('📥 Downloading audio file...');
        const response = await axios.get(downloadUrl, {
          responseType: 'stream',
          timeout: 120000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        
        const writer = require('fs').createWriteStream(audioPath);
        response.data.pipe(writer);
        
        await new Promise((resolve, reject) => {
          writer.on('finish', resolve);
          writer.on('error', reject);
        });
        
        // RapidAPI might download in different formats, check actual file
        if (!require('fs').existsSync(audioPath)) {
          // Check for other audio formats
          const baseName = path.basename(audioPath, path.extname(audioPath));
          const possibleExtensions = ['.mp3', '.opus', '.webm', '.m4a'];
          
          for (const ext of possibleExtensions) {
            const possiblePath = path.join(tempDir, baseName + ext);
            if (require('fs').existsSync(possiblePath)) {
              console.log(`Found audio file at: ${possiblePath}`);
              actualAudioPath = possiblePath;
              break;
            }
          }
        }
      } else {
        // Original yt-dlp logic (kept for fallback, but won't be used with USE_RAPIDAPI=true)
      console.log(`Extracting audio for ${videoInfo.platform}:${videoInfo.id}...`);
      
      const ytDlpCmd = await getYtDlpCommand();
      const isDocker = process.env.RAILWAY_ENVIRONMENT || process.env.DOCKER_ENV;
      
      // Get video metadata first to determine best strategy
      const metadata = await getVideoMetadata(videoInfo.url, sessionId);
      
      // For very large files, we'll download the full audio and then chunk it locally
      // This is more efficient than downloading chunks separately
      let extractCommand: string;
      if (isDocker) {
        // Enhanced command for Docker/Railway with cookies and user-agent
        const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
        
        // Check for cookie options
        let cookieFlag = '';
        
        // Check if cookie file exists for this session
        if (sessionId) {
          const userCookieFile = isDocker 
            ? `/app/temp/user-cookies/${sessionId}/youtube_cookies.txt`
            : path.join(process.cwd(), 'temp', 'user-cookies', sessionId, 'youtube_cookies.txt');
            
          console.log(`🔍 Checking for cookie file at: ${userCookieFile}`);
          
          // Use synchronous check like video-metadata.ts does
          const fsSync = require('fs');
          if (fsSync.existsSync(userCookieFile)) {
            cookieFlag = `--cookies "${userCookieFile}"`;
            console.log('✅ Using YouTube cookies for session:', sessionId.substring(0, 8) + '...');
            
            // Debug: Check first few lines of cookie file
            try {
              const cookieContent = await fs.readFile(userCookieFile, 'utf-8');
              const lines = cookieContent.split('\n').slice(0, 3);
              console.log('Cookie file preview:', lines.join(' | '));
              console.log('Total cookie lines:', cookieContent.split('\n').filter(l => l.trim() && !l.startsWith('#')).length);
            } catch (e) {
              console.log('Could not read cookie file for preview');
            }
          } else {
            console.log('No YouTube cookies found for session:', sessionId?.substring(0, 8) + '...');
          }
        } else {
          console.log('No session ID provided - authentication may be required');
        }
        
        // Use the format selection strategy based on metadata
        const videoSizeMB = metadata?.filesize ? metadata.filesize / (1024 * 1024) : 0;
        let formatSelection = '';
        
        if (videoSizeMB > 1000) { // Over 1GB
          formatSelection = '-f "bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio"';
        } else {
          formatSelection = '-f "worstaudio/bestaudio"';
        }
        
        extractCommand = `${ytDlpCmd} ${cookieFlag} --user-agent "${userAgent}" ${formatSelection} --extract-audio --audio-format m4a --audio-quality 5 --no-playlist --no-check-certificate --extractor-retries 3 --fragment-retries 3 -o ${audioPath} ${videoInfo.url}`.trim();
      } else {
        // Windows/local command - also check for cookies
        let cookieFlag = '';
        if (sessionId) {
          const userCookieFile = path.join(process.cwd(), 'temp', 'user-cookies', sessionId, 'youtube_cookies.txt');
          console.log(`🔍 Checking for cookie file at: ${userCookieFile}`);
          if (require('fs').existsSync(userCookieFile)) {
            cookieFlag = `--cookies "${userCookieFile}"`;
            console.log('✅ Using YouTube cookies for session (Windows):', sessionId.substring(0, 8) + '...');
          } else {
            console.log('❌ No YouTube cookies found for session (Windows):', sessionId?.substring(0, 8) + '...');
          }
        }
        const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
        extractCommand = `"${ytDlpCmd}" ${cookieFlag} --user-agent "${userAgent}" -f "worstaudio/bestaudio" --extract-audio --audio-format m4a --audio-quality 5 -o "${audioPath}" "${videoInfo.url}"`.trim();
      }
      
      console.log(`Running: ${extractCommand}`);
      
      try {
        await execAsync(extractCommand, {
          timeout: 600000, // 10 minutes (increased from 5)
          maxBuffer: 50 * 1024 * 1024 // 50MB buffer
        });
      } catch (error) {
        console.error('Audio extraction failed:', error);
        
        // Try without audio extraction flag
        const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
        
        // Same cookie logic as above
        let cookieFlag = '';
        
        // Check if cookie file exists for this session
        if (sessionId) {
          const userCookieFile = isDocker 
            ? `/app/temp/user-cookies/${sessionId}/youtube_cookies.txt`
            : path.join(process.cwd(), 'temp', 'user-cookies', sessionId, 'youtube_cookies.txt');
            
          if (require('fs').existsSync(userCookieFile)) {
            cookieFlag = `--cookies ${userCookieFile}`;
          }
        }
        
        // Fallback: Try format 140 directly without extraction
        const fallbackCommand = isDocker 
          ? `${ytDlpCmd} ${cookieFlag} --user-agent "${userAgent}" -f "140" --no-check-certificate --socket-timeout 30 --retries 10 -o ${audioPath} ${videoInfo.url}`.trim()
          : `"${ytDlpCmd}" ${cookieFlag} --user-agent "${userAgent}" -f "140/bestaudio" -o "${audioPath}" "${videoInfo.url}"`.trim();
        
        console.log('Trying fallback command:', fallbackCommand);
        await execAsync(fallbackCommand, {
          timeout: 600000, // 10 minutes (increased from 5)
          maxBuffer: 50 * 1024 * 1024 // 50MB buffer
        });
        }
      }
      
      // Check if audio file was created
      // yt-dlp might download in a different format than requested
      try {
        await fs.stat(audioPath);
      } catch {
        // Check for other common audio formats
        const baseName = path.basename(audioPath, path.extname(audioPath));
        const possibleExtensions = ['.webm', '.opus', '.m4a', '.mp3', '.mp4'];
        
        for (const ext of possibleExtensions) {
          const possiblePath = path.join(tempDir, baseName + ext);
          try {
            const stats = await fs.stat(possiblePath);
            if (stats.size > 1000) {
              console.log(`Found audio file at: ${possiblePath}`);
              actualAudioPath = possiblePath;
              break;
            }
          } catch {
            // Continue checking other extensions
          }
        }
      }
      
      const audioStats = await fs.stat(actualAudioPath);
      if (audioStats.size < 1000) {
        throw new Error('Audio file too small, likely corrupted');
      }
      
      console.log(`Audio extracted: ${(audioStats.size / 1024 / 1024).toFixed(1)}MB at ${actualAudioPath}`);
      
      // Get transcript using optimized method
      const segments = await getOptimizedWhisperTranscript(actualAudioPath, tempDir, openai);
      
      // Clean up - moved after transcription is complete
      // NOTE: getOptimizedWhisperTranscript might use the file for chunking
      // so we can't delete it until after it's done
      await fs.unlink(actualAudioPath).catch(() => {});
      
      return {
        segments: enhancePunctuation(segments),
        source: 'whisper-api',
        quality: 'high',
        language: 'en',
        confidence: 0.95,
        platform: videoInfo.platform as any
      };
      
    } catch (error) {
      console.error('Whisper transcription failed:', error);
      
      // Clean up on error
      try {
        if (actualAudioPath) {
          await fs.unlink(actualAudioPath);
        }
      } catch {}
      
      throw error;
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Transcription failed: ${errorMsg}`);
    throw error;
  }
}

/**
 * PHASE 2A: Get platform-specific transcript strategies in priority order
 */
function getPlatformStrategies(videoInfo: VideoInfo): Array<{ method: string; priority: number }> {
  // Always use audio extraction + Whisper for all platforms
  // This is the most reliable method that works consistently
  return [
    { method: 'whisper-optimized', priority: 1 }
  ];
}

/**
 * Get optimized Whisper transcript with chunking for large files
 */
async function getOptimizedWhisperTranscript(
  audioPath: string, 
  tempDir: string,
  openai: OpenAI
): Promise<TranscriptSegment[]> {
  try {
    // Check file size
    const stats = await fs.stat(audioPath);
    const sizeMB = stats.size / (1024 * 1024);
    
    console.log(`🎵 Audio file size: ${sizeMB.toFixed(1)}MB`);
    
    // If file is larger than 24MB, use chunking
    if (sizeMB > 24) {
      console.log('📦 File exceeds 24MB limit, using chunking approach...');
      
      const segments = await transcribeLargeAudio(audioPath, tempDir, openai);
      
      if (segments && segments.length > 0) {
        console.log(`✅ Successfully transcribed ${segments.length} segments using chunking`);
        return segments;
      } else {
        throw new Error('Chunking failed to produce segments');
      }
    }
    
    // File is small enough, transcribe directly
    console.log('✅ File within size limit, transcribing directly...');
    
    // Use our helper for proper file handling
    const { createFileForUpload } = await import('./file-upload-helper');
    const audioFile = await createFileForUpload(audioPath, 'audio/m4a');
    
    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
      language: 'en',
      response_format: 'verbose_json',
      timestamp_granularities: ['segment']
    });
    
    if (!transcription.segments || !Array.isArray(transcription.segments)) {
      throw new Error('No segments in transcription response');
    }
    
    const segments = transcription.segments
      .filter((seg: any) => seg.text && seg.text.trim().length > 0)
      .map((seg: any) => ({
        text: seg.text.trim(),
        offset: seg.start || 0,
        duration: (seg.end || seg.start || 0) - (seg.start || 0)
      }))
      .filter(seg => seg.duration > 0);
    
    if (segments.length === 0) {
      throw new Error('No valid segments found in transcription');
    }
    
    console.log(`✅ Direct transcription complete: ${segments.length} segments`);
    return segments;
    
  } catch (error) {
    console.error('❌ Optimized transcription failed:', error);
    throw error;
  }
}

/**
 * PHASE 2A: Multi-strategy audio extraction
 */
async function extractAudioMultiStrategy(videoInfo: VideoInfo, outputPath: string, sessionId?: string): Promise<boolean> {
  // Initialize commands if not already done
  if (!workingYtDlpCommand || !workingFFmpegCommand) {
    await getYtDlpCommand();
    await getFFmpegCommand();
  }
  
  const strategies = await getAudioExtractionStrategies(videoInfo, outputPath, sessionId);
  
  // Get the directory where the file should be created
  const outputDir = path.dirname(outputPath);
  
  for (const [index, strategy] of strategies.entries()) {
    try {
      console.log(`Trying audio extraction strategy ${index + 1}/${strategies.length}`);
      console.log(`Command: ${strategy.command.substring(0, 100)}...`);
      
      // Log the full command for debugging
      console.log(`Executing: ${strategy.command}`);
      
      const isDocker = process.env.RAILWAY_ENVIRONMENT || process.env.DOCKER_ENV;
      const execOptions: any = {
        timeout: strategy.timeout || 30000,
        maxBuffer: 1024 * 1024 * 50, // 50MB buffer
        cwd: outputDir, // Run in the temp directory
      };
      
      // Only set shell for non-Docker environments
      if (!isDocker) {
        execOptions.shell = true;
      }
      
      const { stdout, stderr } = await execAsync(strategy.command, execOptions);
      
      // Log any output for debugging
      if (stdout) {
        console.log(`Command stdout: ${stdout.toString().substring(0, 200)}`);
      }
      if (stderr) {
        console.log(`Command stderr: ${stderr.toString().substring(0, 200)}`);
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
  
  // With RapidAPI, we don't need Invidious fallback
  
  return false;
}

/**
 * PHASE 2A: Platform-specific audio extraction strategies
 */
async function getAudioExtractionStrategies(videoInfo: VideoInfo, fullOutputPath: string, sessionId?: string): Promise<Array<{ command: string; timeout?: number }>> {
  const strategies: Array<{ command: string; timeout?: number }> = [];
  const videoUrl = videoInfo.url;
  const tempDir = path.dirname(fullOutputPath);
  const outputFilename = path.basename(fullOutputPath, path.extname(fullOutputPath));
  
  // Use just the filename for yt-dlp, since we'll set cwd to the temp directory
  const outputPattern = `${outputFilename}.%(ext)s`;
  
  // Get FFmpeg path (will be set during initialization)
  // On Railway/Docker, use the full paths if available
  const isDocker = process.env.RAILWAY_ENVIRONMENT || process.env.DOCKER_ENV;
  const ffmpegPath = workingFFmpegCommand || 'ffmpeg';
  const ytDlpPath = workingYtDlpCommand || '/usr/local/bin/yt-dlp';
  
  console.log(`Platform: ${isDocker ? 'Docker/Railway' : 'Local'}`);
  console.log(`yt-dlp path: ${ytDlpPath}`);
  console.log(`FFmpeg path: ${ffmpegPath}`);
  
  // Check for YouTube authentication
  const cookieFile = path.join(process.cwd(), 'temp', 'youtube_auth.txt');
  const hasYouTubeAuth = videoInfo.platform === 'youtube' && require('fs').existsSync(cookieFile);
  
  switch (videoInfo.platform) {
    case 'youtube':
      // On Docker/Railway, use simpler commands without complex quoting
      if (isDocker) {
        // User agent for all requests
        const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
        
        // Cookie handling
        let cookieFlag = '';
        
        // Check if cookie file exists for this session
        if (sessionId) {
          const userCookieFile = isDocker 
            ? `/app/temp/user-cookies/${sessionId}/youtube_cookies.txt`
            : path.join(process.cwd(), 'temp', 'user-cookies', sessionId, 'youtube_cookies.txt');
            
          if (require('fs').existsSync(userCookieFile)) {
            cookieFlag = `--cookies ${userCookieFile} --no-cookies-from-browser`;
            console.log('Using YouTube cookies for session:', sessionId.substring(0, 8) + '...');
          } else {
            console.log('No YouTube cookies found for session:', sessionId?.substring(0, 8) + '...');
          }
        } else {
          console.log('No session ID provided - authentication may be required');
        }
        
        // Strategy 1: Best audio format (bestaudio)
        strategies.push({
          command: `${ytDlpPath} ${cookieFlag} --user-agent "${userAgent}" -f bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio --extract-audio --audio-format m4a --audio-quality 5 --no-playlist --no-check-certificate --no-part --no-mtime -o ${outputPattern} ${videoUrl}`,
          timeout: 300000 // 5 minutes
        });
        
        // Strategy 2: Specific format codes with fallback
        strategies.push({
          command: `${ytDlpPath} ${cookieFlag} --user-agent "${userAgent}" -f "140/139/251/250/249" --no-playlist --no-check-certificate --no-part --no-mtime -o ${outputPattern} ${videoUrl}`,
          timeout: 300000
        });
        
        // Strategy 3: Worst audio (smaller file, faster)
        strategies.push({
          command: `${ytDlpPath} ${cookieFlag} --user-agent "${userAgent}" -f worstaudio --extract-audio --audio-format m4a --audio-quality 9 --no-playlist --no-check-certificate --no-part --no-mtime -o ${outputPattern} ${videoUrl}`,
          timeout: 300000
        });
        
        // Strategy 4: Any audio format without conversion
        strategies.push({
          command: `${ytDlpPath} ${cookieFlag} --user-agent "${userAgent}" -f bestaudio/worstaudio --no-playlist --no-check-certificate --no-part --no-mtime -o ${outputPattern} ${videoUrl}`,
          timeout: 300000
        });
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
    // With RapidAPI, video info will be fetched during processing
    
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
async function executeTranscriptStrategy(strategy: { method: string; priority: number }, videoInfo: VideoInfo, sessionId?: string): Promise<TranscriptResult | null> {
  // Only use Whisper-optimized method
  if (strategy.method === 'whisper-optimized' || strategy.method === 'direct-whisper') {
    if (!openai) {
      throw new Error('OpenAI API key not available for Whisper transcription');
    }
    
    const tempDir = path.join(process.cwd(), 'temp');
    await fs.mkdir(tempDir, { recursive: true });
    
    const audioPath = path.join(tempDir, `${videoInfo.id}_audio.m4a`);
    let actualAudioPath = audioPath;
    
    try {
      // Extract audio using simple yt-dlp command
      console.log(`Extracting audio for ${videoInfo.platform}:${videoInfo.id}...`);
      
      const ytDlpCmd = await getYtDlpCommand();
      const isDocker = process.env.RAILWAY_ENVIRONMENT || process.env.DOCKER_ENV;
      
      // Get video metadata first to determine best strategy
      const metadata = await getVideoMetadata(videoInfo.url, sessionId);
      
      // For very large files, we'll download the full audio and then chunk it locally
      // This is more efficient than downloading chunks separately
      let extractCommand: string;
      if (isDocker) {
        // Enhanced command for Docker/Railway with cookies and user-agent
        const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
        
        // Check for cookie options
        let cookieFlag = '';
        
        // Check if cookie file exists for this session
        if (sessionId) {
          const userCookieFile = isDocker 
            ? `/app/temp/user-cookies/${sessionId}/youtube_cookies.txt`
            : path.join(process.cwd(), 'temp', 'user-cookies', sessionId, 'youtube_cookies.txt');
            
          if (require('fs').existsSync(userCookieFile)) {
            cookieFlag = `--cookies ${userCookieFile} --no-cookies-from-browser`;
            console.log('Using YouTube cookies for session:', sessionId.substring(0, 8) + '...');
            
            // Debug: Check first few lines of cookie file
            try {
              const cookieContent = await fs.readFile(userCookieFile, 'utf-8');
              const lines = cookieContent.split('\n').slice(0, 3);
              console.log('Cookie file preview:', lines.join(' | '));
              console.log('Total cookie lines:', cookieContent.split('\n').filter(l => l.trim() && !l.startsWith('#')).length);
            } catch (e) {
              console.log('Could not read cookie file for preview');
            }
          } else {
            console.log('No YouTube cookies found for session:', sessionId?.substring(0, 8) + '...');
          }
        } else {
          console.log('No session ID provided - authentication may be required');
        }
        
        // Use the format selection strategy based on metadata
        const videoSizeMB = metadata?.filesize ? metadata.filesize / (1024 * 1024) : 0;
        let formatSelection = '';
        
        if (videoSizeMB > 1000) { // Over 1GB
          formatSelection = '-f "bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio"';
        } else {
          formatSelection = '-f "worstaudio/bestaudio"';
        }
        
        extractCommand = `${ytDlpCmd} ${cookieFlag} --user-agent "${userAgent}" ${formatSelection} --extract-audio --audio-format m4a --audio-quality 5 --no-playlist --no-check-certificate --extractor-retries 3 --fragment-retries 3 -o ${audioPath} ${videoInfo.url}`.trim();
      } else {
        // Windows/local command - also check for cookies
        let cookieFlag = '';
        if (sessionId) {
          const userCookieFile = path.join(process.cwd(), 'temp', 'user-cookies', sessionId, 'youtube_cookies.txt');
          console.log(`🔍 Checking for cookie file at: ${userCookieFile}`);
          if (require('fs').existsSync(userCookieFile)) {
            cookieFlag = `--cookies "${userCookieFile}"`;
            console.log('✅ Using YouTube cookies for session (Windows):', sessionId.substring(0, 8) + '...');
          } else {
            console.log('❌ No YouTube cookies found for session (Windows):', sessionId?.substring(0, 8) + '...');
          }
        }
        const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
        extractCommand = `"${ytDlpCmd}" ${cookieFlag} --user-agent "${userAgent}" -f "worstaudio/bestaudio" --extract-audio --audio-format m4a --audio-quality 5 -o "${audioPath}" "${videoInfo.url}"`.trim();
      }
      
      console.log(`Running: ${extractCommand}`);
      
      try {
        await execAsync(extractCommand, {
          timeout: 600000, // 10 minutes (increased from 5)
          maxBuffer: 50 * 1024 * 1024 // 50MB buffer
        });
      } catch (error) {
        console.error('Audio extraction failed:', error);
        
        // Try without audio extraction flag
        const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
        
        // Same cookie logic as above
        let cookieFlag = '';
        
        // Check if cookie file exists for this session
        if (sessionId) {
          const userCookieFile = isDocker 
            ? `/app/temp/user-cookies/${sessionId}/youtube_cookies.txt`
            : path.join(process.cwd(), 'temp', 'user-cookies', sessionId, 'youtube_cookies.txt');
            
          if (require('fs').existsSync(userCookieFile)) {
            cookieFlag = `--cookies ${userCookieFile}`;
          }
        }
        
        // Fallback: Try format 140 directly without extraction
        const fallbackCommand = isDocker 
          ? `${ytDlpCmd} ${cookieFlag} --user-agent "${userAgent}" -f "140" --no-check-certificate --socket-timeout 30 --retries 10 -o ${audioPath} ${videoInfo.url}`.trim()
          : `"${ytDlpCmd}" ${cookieFlag} --user-agent "${userAgent}" -f "140/bestaudio" -o "${audioPath}" "${videoInfo.url}"`.trim();
        
        console.log('Trying fallback command:', fallbackCommand);
        await execAsync(fallbackCommand, {
          timeout: 600000, // 10 minutes (increased from 5)
          maxBuffer: 50 * 1024 * 1024 // 50MB buffer
        });
      }
      
      // Check if audio file was created
      // yt-dlp might download in a different format than requested
      try {
        await fs.stat(audioPath);
      } catch {
        // Check for other common audio formats
        const baseName = path.basename(audioPath, path.extname(audioPath));
        const possibleExtensions = ['.webm', '.opus', '.m4a', '.mp3', '.mp4'];
        
        for (const ext of possibleExtensions) {
          const possiblePath = path.join(tempDir, baseName + ext);
          try {
            const stats = await fs.stat(possiblePath);
            if (stats.size > 1000) {
              console.log(`Found audio file at: ${possiblePath}`);
              actualAudioPath = possiblePath;
              break;
            }
          } catch {
            // Continue checking other extensions
          }
        }
      }
      
      const audioStats = await fs.stat(actualAudioPath);
      if (audioStats.size < 1000) {
        throw new Error('Audio file too small, likely corrupted');
      }
      
      console.log(`Audio extracted: ${(audioStats.size / 1024 / 1024).toFixed(1)}MB at ${actualAudioPath}`);
      
      // Get transcript using optimized method
      const segments = await getOptimizedWhisperTranscript(actualAudioPath, tempDir, openai);
      
      // Clean up - moved after transcription is complete
      // NOTE: getOptimizedWhisperTranscript might use the file for chunking
      // so we can't delete it until after it's done
      await fs.unlink(actualAudioPath).catch(() => {});
      
      return {
        segments: enhancePunctuation(segments),
        source: 'whisper-api',
        quality: 'high',
        language: 'en',
        confidence: 0.95,
        platform: videoInfo.platform as any
      };
      
    } catch (error) {
      console.error('Whisper transcription failed:', error);
      
      // Clean up on error
      try {
        if (actualAudioPath) {
          await fs.unlink(actualAudioPath);
        }
      } catch {}
      
      throw error;
    }
  }
  
  throw new Error(`Unsupported transcript strategy: ${strategy.method}`);
}

/**
 * PHASE 2A: Optimize audio file for Whisper processing
 * Returns true if file needs chunking, false if it's ready for direct processing
 */
async function optimizeAudioForWhisper(audioPath: string, tempDir: string): Promise<boolean> {
  try {
    const stats = await fs.stat(audioPath);
    const fileSizeMB = stats.size / (1024 * 1024);
    
    console.log(`Audio file size: ${fileSizeMB.toFixed(1)}MB`);
    
    // If file is larger than 24MB, return true to indicate chunking is needed
    if (fileSizeMB > 24) {
      console.log('Audio file too large for single Whisper API call. Chunking required.');
      return true; // Needs chunking
    }
    
    // Check if FFmpeg is available for format conversion
    const hasFFmpeg = await checkFFmpegAvailability();
    const ffmpegCmd = await getFFmpegCommand();
    
    // If file is small enough, just convert format if needed
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
    
    return false; // No chunking needed
    
  } catch (error) {
    console.error('Audio optimization check failed:', error);
    throw error;
  }
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
  // This function is disabled with RapidAPI
    return null;
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

// Process videos with rate limiting for RapidAPI
export async function processVideosWithRateLimit(
  videoUrls: string[],
  processFunc: (url: string) => Promise<any>
): Promise<any[]> {
  const USE_RAPIDAPI = process.env.USE_RAPIDAPI === 'true';
  
  if (USE_RAPIDAPI) {
    // Process sequentially with delays for RapidAPI
    const results = [];
    for (let i = 0; i < videoUrls.length; i++) {
      try {
        const result = await processFunc(videoUrls[i]);
        results.push(result);
        
        // Add delay between videos (except for the last one)
        if (i < videoUrls.length - 1) {
          const delay = 4000; // 4 seconds between videos
          console.log(`⏱️ Waiting ${delay/1000}s before next video...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      } catch (error) {
        console.error(`Failed to process video ${videoUrls[i]}:`, error);
        results.push(null);
      }
    }
    return results;
  } else {
    // Original concurrent processing for non-RapidAPI
    return Promise.all(videoUrls.map(processFunc));
  }
}
