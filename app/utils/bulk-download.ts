import { PerfectMatch } from './perfect-matching';
import { exec } from 'child_process';
import { promisify } from 'util';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { getYtDlpCommand, getFFmpegCommand } from '../../src/lib/system-tools';
import AdmZip from 'adm-zip';
import { rapidAPIClient } from '../../src/lib/rapidapi-youtube';
import { getRapidAPIClientV2 } from '../../src/lib/rapidapi-youtube-v2';
import { globalQueue, youtubeRateLimiter } from './request-queue';

// Check if RapidAPI is enabled
const USE_RAPIDAPI = process.env.USE_RAPIDAPI === 'true';

const execAsync = promisify(exec);

export interface DownloadResult {
  tweetId: string;
  videoUrl: string;
  startTime: number;
  endTime: number;
  downloadPath: string;
  success: boolean;
  error?: string;
  fileSize?: number;
  duration?: number;
}

export interface BulkDownloadProgress {
  total: number;
  completed: number;
  failed: number;
  currentFile: string;
  percentage: number;
}

export interface BulkDownloadOptions {
  outputDir?: string;
  maxConcurrent?: number;
  quality?: string;
  sessionId?: string; // User session ID (kept for compatibility)
  onProgress?: (progress: BulkDownloadProgress) => void;
  onClipComplete?: (result: DownloadResult) => void;
}

/**
 * Download a single video clip with browser-based authentication
 */
export async function downloadClip(
  match: PerfectMatch,
  outputDir: string,
  quality: string = '720p',
  sessionId?: string,
  onProgress?: (status: string) => void
): Promise<DownloadResult> {
  console.log('🎬 downloadClip called with:', {
    videoUrl: match.videoUrl,
    startTime: match.startTime,
    endTime: match.endTime,
    outputDir
  });
  
  const ffmpegPath = await getFFmpegCommand();
  
  // Create safe filename
  const safeFilename = `tweet_${match.tweetId}_${Date.now()}.mp4`;
  const outputPath = path.join(outputDir, safeFilename);
  
  try {
    onProgress?.(`Downloading clip for tweet ${match.tweetId}...`);
    
    // Step 1: Download the full video first
    const tempVideoPath = path.join(outputDir, `temp_${safeFilename}`);
    
    // Calculate duration for the clip
    const duration = match.endTime - match.startTime;
    const startTimeStr = formatTime(match.startTime);
    const endTimeStr = formatTime(match.endTime);
    
    if (USE_RAPIDAPI) {
      onProgress?.(`🚀 Using RapidAPI for video download...`);
      console.log('Using RapidAPI to download video:', match.videoUrl);
      
      try {
        // Download video using RapidAPI
        // Use V2 client for more reliable downloads
        const v2Client = getRapidAPIClientV2();
        console.log(`🎯 Calling RapidAPI downloadVideo with quality: ${quality}`);
        await v2Client.downloadVideo(match.videoUrl, tempVideoPath, quality);
        
        // Verify the file was created
        const stats = await fs.stat(tempVideoPath);
        console.log(`✅ Video downloaded: ${tempVideoPath} (${(stats.size / 1024 / 1024).toFixed(1)}MB)`);
        
        // Check actual video resolution using FFmpeg
        try {
          const probeCmd = `"${ffmpegPath}" -i "${tempVideoPath}" -hide_banner -f null - 2>&1`;
          const { stdout: probeOutput } = await execAsync(probeCmd).catch(err => ({ stdout: err.stdout || err.message }));
          const resolutionMatch = probeOutput.match(/Stream.*Video.*\s(\d+)x(\d+)/);
          if (resolutionMatch) {
            const actualResolution = `${resolutionMatch[1]}x${resolutionMatch[2]}`;
            const actualHeight = parseInt(resolutionMatch[2]);
            console.log(`📊 Downloaded video resolution: ${actualResolution}`);
            
            // Verify we got the expected quality
            if (quality === '720p' && actualHeight >= 720) {
              console.log(`✅ Successfully downloaded in ${actualHeight}p quality`);
            } else if (quality === '720p' && actualHeight < 720) {
              console.warn(`⚠️ Requested 720p but got ${actualHeight}p - this video might not have 720p available`);
            }
          }
        } catch (probeError) {
          console.warn('Could not probe video resolution:', probeError);
        }
        
        onProgress?.(`✅ Video downloaded successfully via RapidAPI`);
      } catch (rapidError: any) {
        console.error('RapidAPI download failed:', rapidError);
        throw new Error(`RapidAPI download failed: ${rapidError.message || rapidError}`);
      }
    } else {
      // Original yt-dlp logic (kept as fallback)
      const ytDlpPath = await getYtDlpCommand();
      
      // Build download command
    let downloadCmd = `"${ytDlpPath}"`;
    
    // Add user-agent to prevent bot detection
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    downloadCmd += ` --user-agent "${userAgent}"`;
    
    // Add additional headers to prevent bot detection
    downloadCmd += ` --add-header "Accept-Language: en-US,en;q=0.9"`;
    downloadCmd += ` --add-header "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"`;
    
    // Optimized format selection for social media
    // Force 720p for consistent quality and reasonable file sizes
    downloadCmd += ` "${match.videoUrl}" -o "${tempVideoPath}"`;
    downloadCmd += ` -f "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720]"`;
    downloadCmd += ` --merge-output-format mp4`;
    downloadCmd += ` --no-warnings --quiet`;
    
    // Add retry options for reliability
    downloadCmd += ` --retries 10 --fragment-retries 10 --retry-sleep 3`;
    
    // Add no-check-certificate to handle SSL issues
    downloadCmd += ` --no-check-certificate`;
    
    onProgress?.(`Downloading video (720p optimized)...`);
    
    let downloadAttempts = 0;
    const maxAttempts = 3;
    let lastError: any = null;
    
    while (downloadAttempts < maxAttempts) {
      try {
        downloadAttempts++;
        // Wait for rate limit slot
        await youtubeRateLimiter.waitForSlot();
        
        // Queue the download job
        await globalQueue.addDownloadJob(async () => {
          return await execAsync(downloadCmd, { 
            timeout: 300000, // 5 minute timeout
            maxBuffer: 10 * 1024 * 1024 
          });
        });
        break; // Success, exit loop
      } catch (error: any) {
        lastError = error;
        
        if (downloadAttempts >= maxAttempts) {
          throw error;
        }
        
        onProgress?.(`⚠️ Download attempt ${downloadAttempts} failed, retrying...`);
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds before retry
      }
    }
    
    if (lastError && downloadAttempts >= maxAttempts) {
      throw lastError;
      }
    }
    
    // Step 2: Get video info including resolution and duration
    let videoDuration = 0;
    let videoResolution = '';
    try {
      const probeCmd = `"${ffmpegPath}" -i "${tempVideoPath}" 2>&1`;
      const probeOutput = await execAsync(probeCmd, { maxBuffer: 10 * 1024 * 1024 }).catch(e => e);
      
      // Extract duration
      const durationMatch = probeOutput.stdout?.match(/Duration: (\d{2}):(\d{2}):(\d{2}\.\d{2})/);
      if (durationMatch) {
        const hours = parseInt(durationMatch[1]);
        const minutes = parseInt(durationMatch[2]);
        const seconds = parseFloat(durationMatch[3]);
        videoDuration = hours * 3600 + minutes * 60 + seconds;
      }
      
      // Extract resolution
      const resolutionMatch = probeOutput.stdout?.match(/Stream.*Video.*\s(\d+)x(\d+)/);
      if (resolutionMatch) {
        videoResolution = `${resolutionMatch[1]}x${resolutionMatch[2]}`;
        console.log(`📊 Downloaded video resolution: ${videoResolution} (requested: 720p)`);
      }
      
      console.log(`Video duration: ${videoDuration}s, requested clip: ${match.startTime}s - ${match.endTime}s`);
    } catch (e) {
      console.warn('Could not determine video info, proceeding anyway');
    }
    
    // Validate and adjust times if necessary
    const validStartTime = Math.max(0, Math.min(match.startTime, videoDuration - 1));
    const validEndTime = Math.min(match.endTime, videoDuration);
    const validDuration = validEndTime - validStartTime;
    
    if (validStartTime !== match.startTime || validEndTime !== match.endTime) {
      console.warn(`Adjusted clip times: ${match.startTime}-${match.endTime} → ${validStartTime}-${validEndTime}`);
    }
    
    // Step 3: Extract the specific clip using FFmpeg with Typefully-optimized settings
    onProgress?.(`Extracting and optimizing clip (${formatTime(validStartTime)} - ${formatTime(validEndTime)})...`);
    console.log(`📹 Extracting clip: ${validStartTime}s - ${validEndTime}s (duration: ${validDuration}s)`);
    
    // Optimized FFmpeg settings for Typefully
    // - CRF 23 for good quality/size balance (lower = better quality, higher = smaller size)
    // - H264 codec for maximum compatibility
    // - AAC audio at 128k for good quality without excessive size
    // - Fast start for web playback
    let extractCmd = `"${ffmpegPath}" -accurate_seek -i "${tempVideoPath}" -ss ${validStartTime} -t ${validDuration}`;
    extractCmd += ` -c:v libx264 -preset medium -crf 23`;
    extractCmd += ` -vf "scale='min(1280,iw)':'min(720,ih)':force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2"`;
    extractCmd += ` -pix_fmt yuv420p`;
    extractCmd += ` -c:a aac -b:a 128k -ar 44100`;
    extractCmd += ` -movflags +faststart`;
    extractCmd += ` -avoid_negative_ts make_zero`;
    extractCmd += ` "${outputPath}" -y`;
    
    console.log('FFmpeg extract command:', extractCmd);
    
    try {
      await execAsync(extractCmd, {
        timeout: 180000, // 3 minute timeout
        maxBuffer: 10 * 1024 * 1024
      });
    } catch (extractError) {
      // If that fails, try with input seeking for better compatibility
      onProgress?.(`Retrying with alternative extraction method...`);
      extractCmd = `"${ffmpegPath}" -ss ${validStartTime} -accurate_seek -i "${tempVideoPath}" -t ${validDuration}`;
      extractCmd += ` -c:v libx264 -preset medium -crf 23`;
      extractCmd += ` -vf "scale='min(1280,iw)':'min(720,ih)':force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2"`;
      extractCmd += ` -pix_fmt yuv420p`;
      extractCmd += ` -c:a aac -b:a 128k -ar 44100`;
      extractCmd += ` -movflags +faststart`;
      extractCmd += ` "${outputPath}" -y`;
      
      await execAsync(extractCmd, {
        timeout: 180000, // 3 minute timeout
        maxBuffer: 10 * 1024 * 1024
      });
    }
    
    // Step 3: Verify the extracted clip
    try {
      const durationCmd = `"${ffmpegPath}" -i "${outputPath}" 2>&1`;
      const durationOutput = await execAsync(durationCmd, {
        timeout: 10000,
        maxBuffer: 10 * 1024 * 1024
      });
      
      // Extract duration from output
      const durationMatch = durationOutput.stdout.match(/Duration: (\d{2}):(\d{2}):(\d{2}\.\d{2})/);
      if (durationMatch) {
        const hours = parseInt(durationMatch[1]);
        const minutes = parseInt(durationMatch[2]);
        const seconds = parseFloat(durationMatch[3]);
        const actualDuration = hours * 3600 + minutes * 60 + seconds;
        
        // Check if duration is way off (more than 10% difference)
        const expectedDuration = match.endTime - match.startTime;
        const durationDiff = Math.abs(actualDuration - expectedDuration);
        if (durationDiff > expectedDuration * 0.1 && durationDiff > 2) {
          console.warn(`⚠️ Duration mismatch: expected ${expectedDuration}s, got ${actualDuration}s`);
        }
      }
    } catch (verifyError) {
      // Continue anyway
    }
    
    // Step 4: Clean up temp file
    try {
      await fs.unlink(tempVideoPath);
    } catch (cleanupError) {
      console.warn(`Failed to clean up temp file: ${tempVideoPath}`);
    }
    
    // Step 5: Verify the output file exists and check size
    const stats = await fs.stat(outputPath);
    if (stats.size < 1000) {
      throw new Error('Output file is too small, likely corrupted');
    }
    
    // Warn if file is too large for Typefully
    if (stats.size > 512 * 1024 * 1024) { // 512MB
      console.warn(`⚠️ File size (${(stats.size / 1024 / 1024).toFixed(1)}MB) exceeds Typefully's 512MB limit`);
    }
    
    const fileSizeMB = (stats.size / 1024 / 1024).toFixed(1);
    onProgress?.(`✅ Successfully extracted ${duration}s clip (${fileSizeMB}MB)`);
    
    // Clean up the temporary video file
    try {
      // Check if file exists before trying to delete
      await fs.access(tempVideoPath);
      await fs.unlink(tempVideoPath);
      console.log(`🗑️ Cleaned up temp video file: ${tempVideoPath}`);
    } catch (cleanupError: any) {
      // Only log if it's not a "file not found" error
      if (cleanupError.code !== 'ENOENT') {
        console.warn('Failed to clean up temp file:', cleanupError.message);
      }
    }
    
    return {
      tweetId: match.tweetId,
      videoUrl: match.videoUrl,
      startTime: match.startTime,
      endTime: match.endTime,
      downloadPath: outputPath,
      success: true,
      fileSize: stats.size,
      duration: duration
    };
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    onProgress?.(`❌ Failed to download clip: ${errorMessage}`);
    
    // With RapidAPI, we don't get "Sign in to confirm" errors
    
    // Clean up any partial files
    try {
      await fs.unlink(outputPath).catch(() => {});
    } catch {}
    
    return {
      tweetId: match.tweetId,
      videoUrl: match.videoUrl,
      startTime: match.startTime,
      endTime: match.endTime,
      downloadPath: outputPath,
      success: false,
      error: errorMessage
    };
  }
}

/**
 * Format time in seconds to HH:MM:SS format
 */
function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Download all matched clips in parallel with progress tracking
 */
export async function downloadAllClips(
  matches: PerfectMatch[],
  options: BulkDownloadOptions = {}
): Promise<DownloadResult[]> {
  const {
    outputDir = path.join(os.tmpdir(), 'twipclip-downloads', `${Date.now()}-${Math.random().toString(36).substring(7)}`),
    maxConcurrent = 3,
    quality = '720p',
    sessionId,
    onProgress,
    onClipComplete
  } = options;
  
  // Create output directory
  await fs.mkdir(outputDir, { recursive: true });
  console.log(`📁 Download directory: ${outputDir}`);
  
  // Log RapidAPI status
  if (USE_RAPIDAPI) {
    console.log('🚀 Using RapidAPI for downloads - no authentication needed!');
  } else {
    console.log('⚠️ Using yt-dlp - may encounter bot detection issues');
  }
  
  const results: DownloadResult[] = [];
  const progress: BulkDownloadProgress = {
    total: matches.length,
    completed: 0,
    failed: 0,
    currentFile: '',
    percentage: 0
  };
  
  // Process all downloads through the global queue
  // The queue will handle concurrency limits across all users
  const downloadPromises = matches.map(async (match) => {
    progress.currentFile = `Tweet ${match.tweetId}`;
    onProgress?.(progress);
    
    const result = await downloadClip(match, outputDir, quality, sessionId, (status) => {
      console.log(`  ${status}`);
    });
    
    if (result.success) {
      progress.completed++;
    } else {
      progress.failed++;
    }
    
    progress.percentage = ((progress.completed + progress.failed) / progress.total) * 100;
    onProgress?.(progress);
    onClipComplete?.(result);
    
    return result;
  });
  
  // Wait for all downloads to complete
  const downloadResults = await Promise.all(downloadPromises);
  results.push(...downloadResults);
  
  // Create a summary file
  const summaryPath = path.join(outputDir, 'download-summary.json');
  await fs.writeFile(summaryPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    totalMatches: matches.length,
    successfulDownloads: results.filter(r => r.success).length,
    failedDownloads: results.filter(r => !r.success).length,
    totalSize: results.reduce((sum, r) => sum + (r.fileSize || 0), 0),
    authenticationUsed: USE_RAPIDAPI ? 'RapidAPI' : 'yt-dlp',
    results: results.map(r => ({
      tweetId: r.tweetId,
      success: r.success,
      fileSize: r.fileSize,
      duration: r.duration,
      error: r.error
    }))
  }, null, 2));
  
  return results;
}

/**
 * Create a ZIP file containing all downloaded clips
 */
export async function createZipFile(
  downloadResults: DownloadResult[],
  outputPath: string
): Promise<string> {
  console.log(`\n📦 Creating ZIP with ${downloadResults.length} results...`);
  console.log(`  Successful downloads: ${downloadResults.filter(r => r.success).length}`);
  
  // Create a new ZIP with default compression (DEFLATE)
  const zip = new AdmZip();
  
  // Add successfully downloaded files to the ZIP
  for (const result of downloadResults) {
    if (result.success && result.downloadPath) {
      try {
        const stats = await fs.stat(result.downloadPath);
        if (stats.isFile()) {
          // Create a clean filename for the ZIP using the tweet ID
          // Extract the number from tweetId (e.g., "tweet-1" -> "1")
          const tweetNumber = result.tweetId.replace(/[^0-9]/g, '') || result.tweetId;
          const zipFilename = `Tweet ${tweetNumber}.mp4`;
          const fileContent = await fs.readFile(result.downloadPath);
          
          // Verify file content is valid
          if (!fileContent || fileContent.length === 0) {
            console.warn(`  Skipping empty file: ${result.downloadPath}`);
            continue;
          }
          
          const comment = `${formatTime(result.startTime)} to ${formatTime(result.endTime)}`;
          
          // Add file without comment parameter to avoid potential issues
          zip.addFile(zipFilename, fileContent);
          console.log(`  Added to ZIP: ${zipFilename} (size: ${(fileContent.length / 1024 / 1024).toFixed(1)}MB)`);
        }
      } catch (error) {
        console.warn(`  Failed to add file to ZIP: ${result.downloadPath}`, error);
      }
    }
  }
  
  // Add summary file
  const summary = {
    timestamp: new Date().toISOString(),
    totalClips: downloadResults.length,
    successfulDownloads: downloadResults.filter(r => r.success).length,
    failedDownloads: downloadResults.filter(r => !r.success).length,
    clips: downloadResults.map(r => ({
      tweetId: r.tweetId,
      videoUrl: r.videoUrl,
      startTime: r.startTime,
      endTime: r.endTime,
      duration: r.endTime - r.startTime,
      success: r.success,
      fileSize: r.fileSize,
      error: r.error
    }))
  };
  
  zip.addFile('summary.json', Buffer.from(JSON.stringify(summary, null, 2)));
  
  // Write the ZIP file synchronously for better compatibility
  try {
    zip.writeZip(outputPath);
  } catch (error) {
    console.error('ZIP write error:', error);
    throw error;
  }
  
  const stats = await fs.stat(outputPath);
  console.log(`📦 Created ZIP file: ${outputPath} (${(stats.size / 1024 / 1024).toFixed(1)}MB)`);
  
  return outputPath;
}

/**
 * Clean up temporary download files
 */
export async function cleanupDownloads(outputDir: string): Promise<void> {
  try {
    await fs.rm(outputDir, { recursive: true, force: true });
    console.log(`🗑️ Cleaned up temporary files: ${outputDir}`);
  } catch (error) {
    console.warn('Failed to cleanup download directory:', error);
  }
}