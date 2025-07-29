import { rapidAPIClient } from '../../src/lib/rapidapi-youtube';
import axios from 'axios';

// Check if RapidAPI is enabled
const USE_RAPIDAPI = process.env.USE_RAPIDAPI === 'true';

export interface VideoMetadata {
  duration: number; // in seconds
  filesize?: number; // in bytes
  format?: string;
  title?: string;
  uploader?: string;
  description?: string;
  thumbnail?: string;
  width?: number;
  height?: number;
  fps?: number;
  vcodec?: string;
  acodec?: string;
  isLive?: boolean;
  isPrivate?: boolean;
  hasSubtitles?: boolean;
}

/**
 * Get video metadata
 */
export async function getVideoMetadata(videoUrl: string, sessionId?: string): Promise<VideoMetadata | null> {
  try {
    if (USE_RAPIDAPI) {
      // Extract video ID from URL
      const videoIdMatch = videoUrl.match(/(?:v=|\/shorts\/|youtu\.be\/)([^&\n?#]+)/);
      if (!videoIdMatch) {
        console.error('Could not extract video ID from URL');
        return null;
      }
      const videoId = videoIdMatch[1];
      
      return await getVideoMetadataFromRapidAPI(videoId);
    }
    
    // Original yt-dlp logic (as fallback)
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const path = require('path');
    const { getYtDlpCommand } = require('../../src/lib/system-tools');
    const execAsync = promisify(exec);
    const ytDlpPath = await getYtDlpCommand();
    
    // Build command to get JSON metadata
    let command: string;
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    
    // Check for cookies
    let cookieFlag = '';
    
    // First check for per-user cookies if sessionId is provided
    if (sessionId) {
      const isDocker = process.env.RAILWAY_ENVIRONMENT || process.env.DOCKER_ENV || process.env.NODE_ENV === 'production';
      const userCookiePath = isDocker 
        ? `/app/temp/user-cookies/${sessionId}/youtube_cookies.txt`
        : path.join(process.cwd(), 'temp', 'user-cookies', sessionId, 'youtube_cookies.txt');
        
      if (require('fs').existsSync(userCookiePath)) {
        cookieFlag = `--cookies "${userCookiePath}"`;
        console.log(`Using user-specific YouTube cookies for session: ${sessionId.substring(0, 8)}...`);
        console.log(`Cookie path: ${userCookiePath}`);
        
        // Debug: Check cookie file content
        try {
          const fs = require('fs');
          const cookieContent = fs.readFileSync(userCookiePath, 'utf-8');
          const lines = cookieContent.split('\n');
          const cookieLines = lines.filter((l: string) => l.trim() && !l.startsWith('#'));
          console.log(`Cookie file has ${cookieLines.length} cookie entries`);
          if (cookieLines.length === 0) {
            console.warn('⚠️ Cookie file exists but contains no valid cookies!');
            cookieFlag = ''; // Reset if no valid cookies
          }
        } catch (e) {
          console.error('Failed to read cookie file:', e);
        }
      } else {
        console.log(`Cookie file not found at: ${userCookiePath}`);
      }
    }
    
    // Fall back to global cookie file if no user-specific one found
    if (!cookieFlag) {
      const isDocker = process.env.RAILWAY_ENVIRONMENT || process.env.DOCKER_ENV;
      const globalCookiePath = isDocker 
        ? '/app/temp/youtube_cookies.txt'
        : path.join(process.cwd(), 'app/api/auth/youtube/cookies/youtube_cookies.txt');
        
      if (require('fs').existsSync(globalCookiePath)) {
        cookieFlag = `--cookies "${globalCookiePath}"`;
        console.log('Using global YouTube cookies from:', globalCookiePath);
      }
    }
    
    if (!cookieFlag) {
      console.log('⚠️ No YouTube cookies found - metadata extraction may fail for restricted content');
    }
    
    // Add anti-bot headers to prevent detection
    const headers = [
      `--user-agent "${userAgent}"`,
      '--add-header "Accept-Language: en-US,en;q=0.9"',
      '--add-header "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"',
      '--no-check-certificate'
    ].join(' ');
    
    command = `${ytDlpPath} ${cookieFlag} ${headers} --dump-json --no-warnings "${videoUrl}"`;
    
    console.log('🔍 Getting video metadata...');
    
    // Log the command for debugging (hide the full cookie path for security)
    const debugCommand = command.replace(/--cookies\s+"[^"]+"/g, '--cookies "***"');
    console.log('Command:', debugCommand);
    
    const { stdout, stderr } = await execAsync(command, {
      timeout: 30000, // 30 seconds
      maxBuffer: 5 * 1024 * 1024 // 5MB buffer for JSON
    });
    
    if (stderr && stderr.includes('ERROR')) {
      console.error('yt-dlp error:', stderr);
      // Log the full error for debugging
      if (stderr.includes('Sign in to confirm')) {
        console.error('Bot detection triggered despite cookies and headers');
        console.error('Session ID:', sessionId || 'none');
        console.error('Cookie flag present:', !!cookieFlag);
      }
      return null;
    }
    
    // Parse the JSON output
    const metadata = JSON.parse(stdout);
    
    // Extract relevant information
    const result: VideoMetadata = {
      duration: metadata.duration || 0,
      filesize: metadata.filesize || metadata.filesize_approx,
      format: metadata.ext,
      title: metadata.title,
      uploader: metadata.uploader,
      description: metadata.description,
      thumbnail: metadata.thumbnail,
      width: metadata.width,
      height: metadata.height,
      fps: metadata.fps,
      vcodec: metadata.vcodec,
      acodec: metadata.acodec,
      isLive: metadata.is_live || false,
      isPrivate: metadata.availability === 'private',
      hasSubtitles: !!(metadata.subtitles && Object.keys(metadata.subtitles).length > 0)
    };
    
    console.log(`📊 Video metadata:`);
    console.log(`  Duration: ${formatDuration(result.duration)}`);
    console.log(`  Size: ${result.filesize ? formatFileSize(result.filesize) : 'Unknown'}`);
    console.log(`  Format: ${result.format || 'Unknown'}`);
    console.log(`  Live: ${result.isLive ? 'Yes' : 'No'}`);
    
    return result;
    
  } catch (error) {
    console.error('Failed to get video metadata:', error);
    return null;
  }
}

async function getVideoMetadataFromRapidAPI(videoId: string): Promise<VideoMetadata | null> {
  console.log('🚀 Using RapidAPI for video metadata...');
  
  try {
    // Import the rate-limited client 
    const { rapidAPIClient } = require('../../src/lib/rapidapi-youtube');
    
    // Use the client's getVideoInfo method which handles rate limiting
    const data = await rapidAPIClient.getVideoInfo(`https://youtube.com/watch?v=${videoId}`);
    
    if (data) {
      const metadata: VideoMetadata = {
        duration: parseInt(data.lengthSeconds) || data.duration || 0,
        title: data.title || '',
        uploader: data.author || data.ownerChannelName || '', 
        description: data.description || '',
        isLive: data.isLiveContent || false,
        thumbnail: data.thumbnail?.url || data.thumbnail || ''
      };
      
      console.log('📊 Video metadata from RapidAPI:');
      console.log(`  Duration: ${formatDuration(metadata.duration)}`);
      console.log(`  Title: ${metadata.title}`);
      console.log(`  Live: ${metadata.isLive ? 'Yes' : 'No'}`);
      
      return metadata;
    }
    
    return null;
  } catch (error: any) {
    console.error('Failed to get video metadata:', error);
    // Don't throw, just return null to allow fallback
    return null;
  }
}

/**
 * Determine the best processing strategy based on video metadata
 */
export function determineProcessingStrategy(metadata: VideoMetadata): {
  strategy: 'direct' | 'compress' | 'chunk' | 'stream';
  reason: string;
  estimatedAudioSize: number;
} {
  // Estimate audio size (roughly 1MB per minute for decent quality)
  const estimatedAudioSize = (metadata.duration / 60) * 1.5 * 1024 * 1024; // 1.5MB per minute
  
  // If video is live, we can't process it
  if (metadata.isLive) {
    throw new Error('Cannot process live videos');
  }
  
  // If video is private, we might have issues
  if (metadata.isPrivate) {
    console.warn('⚠️ Video appears to be private, processing might fail');
  }
  
  // Strategy decision based on estimated audio size
  if (estimatedAudioSize < 20 * 1024 * 1024) { // < 20MB
    return {
      strategy: 'direct',
      reason: 'Small file, can process directly',
      estimatedAudioSize
    };
  } else if (estimatedAudioSize < 50 * 1024 * 1024) { // < 50MB
    return {
      strategy: 'compress',
      reason: 'Medium file, will compress audio first',
      estimatedAudioSize
    };
  } else if (estimatedAudioSize < 200 * 1024 * 1024) { // < 200MB
    return {
      strategy: 'chunk',
      reason: 'Large file, will process in chunks',
      estimatedAudioSize
    };
  } else {
    return {
      strategy: 'stream',
      reason: 'Very large file, will use streaming approach',
      estimatedAudioSize
    };
  }
}

/**
 * Format duration in seconds to human readable format
 */
function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}

/**
 * Format file size in bytes to human readable format
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * Check if we should process this video based on metadata
 */
export function shouldProcessVideo(metadata: VideoMetadata, maxDuration: number = 14400): boolean {
  // Don't process videos longer than maxDuration (default 4 hours)
  if (metadata.duration > maxDuration) {
    console.warn(`⚠️ Video too long (${formatDuration(metadata.duration)}), max allowed: ${formatDuration(maxDuration)}`);
    return false;
  }
  
  // Don't process live videos
  if (metadata.isLive) {
    console.warn('⚠️ Cannot process live videos');
    return false;
  }
  
  return true;
} 