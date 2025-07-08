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
    
    // Add user-agent to prevent bot detection
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    downloadCmd += ` --user-agent "${userAgent}"`;
    
    // Add additional headers to prevent bot detection
    downloadCmd += ` --add-header "Accept-Language: en-US,en;q=0.9"`;
    downloadCmd += ` --add-header "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"`;
    
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
              downloadCmd += ` --user-agent "${userAgent}"`;
              downloadCmd += ` --add-header "Accept-Language: en-US,en;q=0.9"`;
              downloadCmd += ` --add-header "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"`;
              const cookieArgs = YouTubeAuthManagerV2.getBrowserCookieArgs(authConfig);
              downloadCmd += ` ${cookieArgs.join(' ')}`;
              downloadCmd += ` "${match.videoUrl}" -o "${tempVideoPath}"`;
              downloadCmd += ` -f "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720]"`;
              downloadCmd += ` --merge-output-format mp4`;
              downloadCmd += ` --no-warnings --quiet`;
              downloadCmd += ` --retries 10 --fragment-retries 10 --retry-sleep 3`;
              downloadCmd += ` --no-check-certificate`;
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
    
    // Step 2: Extract the specific clip using FFmpeg with Typefully-optimized settings
    onProgress?.(`Extracting and optimizing clip (${startTimeStr} - ${endTimeStr})...`);
    
    // Optimized FFmpeg settings for Typefully
    // - CRF 23 for good quality/size balance (lower = better quality, higher = smaller size)
    // - H264 codec for maximum compatibility
    // - AAC audio at 128k for good quality without excessive size
    // - Fast start for web playback
    let extractCmd = `"${ffmpegPath}" -accurate_seek -i "${tempVideoPath}" -ss ${match.startTime} -t ${duration}`;
    extractCmd += ` -c:v libx264 -preset medium -crf 23`;
    extractCmd += ` -vf "scale='min(1280,iw)':'min(720,ih)':force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2"`;
    extractCmd += ` -pix_fmt yuv420p`;
    extractCmd += ` -c:a aac -b:a 128k -ar 44100`;
    extractCmd += ` -movflags +faststart`;
    extractCmd += ` -avoid_negative_ts make_zero`;
    extractCmd += ` "${outputPath}" -y`;
    
    try {
      await execAsync(extractCmd, {
        timeout: 180000, // 3 minute timeout
        maxBuffer: 10 * 1024 * 1024
      });
    } catch (extractError) {
      // If that fails, try with input seeking for better compatibility
      onProgress?.(`Retrying with alternative extraction method...`);
      extractCmd = `"${ffmpegPath}" -ss ${match.startTime} -accurate_seek -i "${tempVideoPath}" -t ${duration}`;
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
  const zip = new AdmZip();
  
  // Add successfully downloaded files to the ZIP
  for (const result of downloadResults) {
    if (result.success && result.downloadPath) {
      try {
        const stats = await fs.stat(result.downloadPath);
        if (stats.isFile()) {
          const filename = path.basename(result.downloadPath);
          const fileContent = await fs.readFile(result.downloadPath);
          zip.addFile(filename, fileContent, `Tweet ${result.tweetId} - ${formatTime(result.startTime)} to ${formatTime(result.endTime)}`);
          console.log(`  Added to ZIP: ${filename}`);
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
  
  // Write the ZIP file
  await new Promise<void>((resolve, reject) => {
    zip.writeZip(outputPath, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
  
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