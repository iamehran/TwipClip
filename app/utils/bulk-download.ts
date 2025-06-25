import { PerfectMatch } from './perfect-matching';
import { exec } from 'child_process';
import { promisify } from 'util';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { getYtDlpCommand, getFFmpegCommand } from '../../src/lib/system-tools';
import AdmZip from 'adm-zip';
import { YouTubeAuthManagerV2, YouTubeAuthConfig } from '../../src/lib/youtube-auth-v2';

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
  authConfig?: YouTubeAuthConfig; // Browser authentication config
  sessionId?: string; // User session ID for per-user cookies
  onProgress?: (progress: BulkDownloadProgress) => void;
  onClipComplete?: (result: DownloadResult) => void;
}

/**
 * Download a single video clip with browser-based authentication
 */
async function downloadClip(
  match: PerfectMatch,
  outputDir: string,
  quality: string = '720p',
  authConfig?: YouTubeAuthConfig,
  sessionId?: string,
  onProgress?: (status: string) => void
): Promise<DownloadResult> {
  const ytDlpPath = await getYtDlpCommand();
  const ffmpegPath = await getFFmpegCommand();
  
  // Create safe filename
  const safeFilename = `tweet_${match.tweetId}_${Date.now()}.mp4`;
  const outputPath = path.join(outputDir, safeFilename);
  
  try {
    onProgress?.(`Downloading clip for tweet ${match.tweetId}...`);
    
    // Step 1: Download the full video first (download-sections is unreliable)
    const tempVideoPath = path.join(outputDir, `temp_${safeFilename}`);
    
    // Calculate duration for the clip
    const duration = match.endTime - match.startTime;
    const startTimeStr = formatTime(match.startTime);
    const endTimeStr = formatTime(match.endTime);
    
    // Build download command with authentication
    let downloadCmd = `"${ytDlpPath}"`;
    
    // Check for per-user cookies first
    let hasAuth = false;
    if (sessionId) {
      const userCookiePath = path.join(process.cwd(), 'temp', 'user-cookies', sessionId, 'youtube_cookies.txt');
      if (require('fs').existsSync(userCookiePath)) {
        downloadCmd += ` --cookies "${userCookiePath}"`;
        onProgress?.(`Using user-specific YouTube cookies...`);
        hasAuth = true;
      }
    }
    
    // Fall back to browser cookie extraction if no user cookies
    if (!hasAuth && authConfig) {
      const cookieArgs = YouTubeAuthManagerV2.getBrowserCookieArgs(authConfig);
      downloadCmd += ` ${cookieArgs.join(' ')}`;
      onProgress?.(`Using browser authentication (${authConfig.browser})...`);
      hasAuth = true;
    }
    
    if (!hasAuth) {
      onProgress?.(`⚠️ No authentication configured - downloads may fail for restricted content`);
    }
    
    // Download the video with proper quality settings
    const heightLimit = quality === '1080p' ? '1080' : '720';
    // Improved format selection for better quality
    downloadCmd += ` "${match.videoUrl}" -o "${tempVideoPath}" -f "bestvideo[height<=${heightLimit}]+bestaudio/best" --merge-output-format mp4 --no-warnings --quiet`;
    
    // Add retry options for reliability
    downloadCmd += ` --retries 10 --fragment-retries 10 --retry-sleep 3`;
    
    onProgress?.(`Downloading video (${quality})...`);
    
    let downloadAttempts = 0;
    const maxAttempts = 3;
    let lastError: any = null;
    
    while (downloadAttempts < maxAttempts) {
      try {
        downloadAttempts++;
        await execAsync(downloadCmd, { 
          timeout: 300000, // 5 minute timeout
          maxBuffer: 10 * 1024 * 1024 
        });
        break; // Success, exit loop
      } catch (error: any) {
        lastError = error;
        
        // Check if it's an authentication error
        if (error.stderr?.includes('Sign in to confirm')) {
          onProgress?.(`❌ Authentication required. Please log into YouTube in ${authConfig?.browser || 'your browser'}`);
          
          // Try fallback browser if available
          if (authConfig && downloadAttempts < maxAttempts) {
            const fallbackBrowsers = await YouTubeAuthManagerV2.getFallbackBrowsers(authConfig.browser);
            if (fallbackBrowsers.length > 0) {
              authConfig.browser = fallbackBrowsers[0];
              onProgress?.(`🔄 Trying fallback browser: ${authConfig.browser}`);
              // Rebuild command with new browser
              downloadCmd = `"${ytDlpPath}"`;
              const cookieArgs = YouTubeAuthManagerV2.getBrowserCookieArgs(authConfig);
              downloadCmd += ` ${cookieArgs.join(' ')}`;
              downloadCmd += ` "${match.videoUrl}" -o "${tempVideoPath}" -f "bestvideo[height<=${heightLimit}]+bestaudio/best" --merge-output-format mp4 --no-warnings --quiet`;
              downloadCmd += ` --retries 10 --fragment-retries 10 --retry-sleep 3`;
              continue; // Retry with new browser
            }
          }
        }
        
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
    
    // Step 2: Extract the specific clip using FFmpeg with accurate seeking
    onProgress?.(`Extracting clip (${startTimeStr} - ${endTimeStr})...`);
    
    // Use accurate seeking with re-encoding for precise cuts
    // First try with fast preset for speed, but better quality (lower CRF = better quality)
    let extractCmd = `"${ffmpegPath}" -accurate_seek -i "${tempVideoPath}" -ss ${match.startTime} -t ${duration} -c:v libx264 -preset fast -crf 18 -pix_fmt yuv420p -c:a aac -b:a 192k -movflags +faststart -avoid_negative_ts make_zero "${outputPath}" -y`;
    
    try {
      await execAsync(extractCmd, {
        timeout: 180000, // 3 minute timeout
        maxBuffer: 10 * 1024 * 1024
      });
    } catch (extractError) {
      // If that fails, try with input seeking for better compatibility
      onProgress?.(`Retrying with alternative extraction method...`);
      extractCmd = `"${ffmpegPath}" -ss ${match.startTime} -accurate_seek -i "${tempVideoPath}" -t ${duration} -c:v libx264 -preset fast -crf 18 -pix_fmt yuv420p -c:a aac -b:a 192k -movflags +faststart "${outputPath}" -y`;
      
      await execAsync(extractCmd, {
        timeout: 180000, // 3 minute timeout
        maxBuffer: 10 * 1024 * 1024
      });
    }
    
    // Step 3: Verify the extracted clip duration
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
    
    // Step 5: Verify the output file exists and has size
    const stats = await fs.stat(outputPath);
    if (stats.size < 1000) {
      throw new Error('Output file is too small, likely corrupted');
    }
    
    onProgress?.(`✅ Successfully extracted ${duration}s clip`);
    
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
    
    // Provide helpful error messages
    if (errorMessage.includes('Sign in to confirm')) {
      const solutions = YouTubeAuthManagerV2.getErrorSolution(errorMessage);
      console.error('Solutions:', solutions.join('\n'));
    }
    
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
    outputDir = path.join(os.tmpdir(), 'twipclip-downloads', Date.now().toString()),
    maxConcurrent = 3,
    quality = '720p',
    authConfig,
    sessionId,
    onProgress,
    onClipComplete
  } = options;
  
  // Create output directory
  await fs.mkdir(outputDir, { recursive: true });
  console.log(`📁 Download directory: ${outputDir}`);
  
  // Log authentication status
  if (authConfig) {
    console.log(`🔐 Using browser authentication: ${authConfig.browser}${authConfig.profile ? `:${authConfig.profile}` : ''}`);
  } else {
    console.log('⚠️ No browser authentication configured - downloads may fail for restricted content');
  }
  
  const results: DownloadResult[] = [];
  const progress: BulkDownloadProgress = {
    total: matches.length,
    completed: 0,
    failed: 0,
    currentFile: '',
    percentage: 0
  };
  
  // Process in batches to avoid overwhelming the system
  for (let i = 0; i < matches.length; i += maxConcurrent) {
    const batch = matches.slice(i, i + maxConcurrent);
    
    const batchPromises = batch.map(async (match) => {
      progress.currentFile = `Tweet ${match.tweetId}`;
      onProgress?.(progress);
      
      const result = await downloadClip(match, outputDir, quality, authConfig, sessionId, (status) => {
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
    
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
  }
  
  // Create a summary file
  const summaryPath = path.join(outputDir, 'download-summary.json');
  await fs.writeFile(summaryPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    totalMatches: matches.length,
    successfulDownloads: results.filter(r => r.success).length,
    failedDownloads: results.filter(r => !r.success).length,
    totalSize: results.reduce((sum, r) => sum + (r.fileSize || 0), 0),
    authenticationUsed: authConfig ? `${authConfig.browser}${authConfig.profile ? `:${authConfig.profile}` : ''}` : 'none',
    results: results.map(r => ({
      tweetId: r.tweetId,
      filename: path.basename(r.downloadPath),
      success: r.success,
      error: r.error,
      fileSize: r.fileSize,
      duration: r.duration,
      videoUrl: r.videoUrl,
      clipRange: `${formatTime(r.startTime)} - ${formatTime(r.endTime)}`
    }))
  }, null, 2));
  
  console.log(`\n📊 Download Summary:`);
  console.log(`  Total clips: ${matches.length}`);
  console.log(`  Successful: ${results.filter(r => r.success).length}`);
  console.log(`  Failed: ${results.filter(r => !r.success).length}`);
  console.log(`  Output directory: ${outputDir}`);
  console.log(`  Summary file: ${summaryPath}`);
  
  return results;
}

/**
 * Create a ZIP file of all downloaded clips
 */
export async function createDownloadZip(
  downloadResults: DownloadResult[],
  outputPath: string
): Promise<string> {
  const zip = new AdmZip();
  
  // Add each successful download to the ZIP
  for (const result of downloadResults) {
    if (result.success && result.downloadPath) {
      try {
        const fileBuffer = await fs.readFile(result.downloadPath);
        const filename = `tweet_${result.tweetId}_clip.mp4`;
        zip.addFile(filename, fileBuffer);
      } catch (error) {
        console.warn(`Failed to add ${result.downloadPath} to ZIP:`, error);
      }
    }
  }
  
  // Add the summary JSON
  const summary = {
    created: new Date().toISOString(),
    clips: downloadResults.map(r => ({
      tweetId: r.tweetId,
      success: r.success,
      error: r.error,
      duration: r.duration,
      videoUrl: r.videoUrl,
      timeRange: `${formatTime(r.startTime)} - ${formatTime(r.endTime)}`
    }))
  };
  
  zip.addFile('summary.json', Buffer.from(JSON.stringify(summary, null, 2)));
  
  // Write the ZIP file
  zip.writeZip(outputPath);
  
  return outputPath;
}

/**
 * Clean up downloaded files after creating ZIP
 */
export async function cleanupDownloads(downloadResults: DownloadResult[]): Promise<void> {
  for (const result of downloadResults) {
    if (result.downloadPath) {
      try {
        await fs.unlink(result.downloadPath);
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  }
} 