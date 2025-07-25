import { NextResponse } from 'next/server';
import { downloadAllClips, createZipFile } from '../../utils/bulk-download';
import { cookies } from 'next/headers';
import { YouTubeAuthManagerV2 } from '../../../src/lib/youtube-auth-v2';
import path from 'path';
import os from 'os';
import { existsSync } from 'fs';

export async function POST(request) {
  try {
    const { matches, authConfig } = await request.json();
    
    if (!matches || !Array.isArray(matches) || matches.length === 0) {
      return NextResponse.json({ 
        error: 'No matches provided' 
      }, { status: 400 });
    }

    console.log(`Starting bulk download for ${matches.length} clips`);
    
    // Fix match structure - ensure each match has a tweetId
    const fixedMatches = matches.map((match, index) => {
      if (!match.tweetId && match.tweet) {
        // Extract tweet ID from tweet text or use index
        const tweetMatch = match.tweet.match(/tweet[- ]?(\d+)/i);
        const tweetId = tweetMatch ? tweetMatch[1] : `${index + 1}`;
        return { ...match, tweetId };
      }
      return match;
    });

    // Get session ID for per-user cookies
    const cookieStore = await cookies();
    const sessionId = cookieStore.get('twipclip_session')?.value;
    
    // Check if user has uploaded cookies
    let hasCookies = false;
    if (sessionId) {
      const isDocker = process.env.RAILWAY_ENVIRONMENT || process.env.DOCKER_ENV || process.env.NODE_ENV === 'production';
      const baseDir = isDocker ? '/app' : process.cwd();
      const userCookiePath = path.join(baseDir, 'temp', 'user-cookies', sessionId, 'youtube_cookies.txt');
      hasCookies = existsSync(userCookiePath);
      console.log(`Session ID: ${sessionId.substring(0, 8)}...`);
      console.log(`Cookie path: ${userCookiePath}`);
      console.log(`Cookie file exists: ${hasCookies}`);
      
      if (hasCookies) {
        console.log('✅ Using uploaded YouTube cookies for authentication');
      }
    }

    // Log authentication configuration
    if (!hasCookies && authConfig) {
      console.log(`Browser auth config provided: ${authConfig.browser}${authConfig.profile ? `:${authConfig.profile}` : ''}`);
    } else if (!hasCookies && !authConfig) {
      console.log('⚠️ No authentication configured - downloads may fail');
    }

    // Download all clips with optimized settings
    const results = await downloadAllClips(fixedMatches, {
      maxConcurrent: 2, // Limit concurrent downloads to avoid overwhelming the system
      quality: '720p', // Force 720p for compatibility
      sessionId, // Always pass session ID for cookie-based auth
      authConfig: hasCookies ? undefined : authConfig, // Only use browser auth if no cookies
      onProgress: (progress) => {
        console.log(`Progress: ${progress.completed}/${progress.total} (${progress.percentage.toFixed(1)}%)`);
      },
      onClipComplete: (result) => {
        if (result.success) {
          const sizeMB = result.fileSize ? (result.fileSize / 1024 / 1024).toFixed(1) : 'unknown';
          console.log(`✓ Downloaded clip for tweet ${result.tweetId} (${sizeMB}MB, ${result.duration}s)`);
          
          // Warn about limits
          if (result.fileSize && result.fileSize > 512 * 1024 * 1024) {
            console.warn(`⚠️ Tweet ${result.tweetId} exceeds 512MB limit`);
          }
          if (result.duration && result.duration > 600) { // 10 minutes
            console.warn(`⚠️ Tweet ${result.tweetId} exceeds 10-minute limit`);
          }
        } else {
          console.log(`✗ Failed to download clip for tweet ${result.tweetId}: ${result.error}`);
        }
      }
    });

    // Create zip file
    const successfulDownloads = results.filter(r => r.success);
    
    if (successfulDownloads.length === 0) {
      return NextResponse.json({ 
        error: 'No clips were successfully downloaded',
        details: results.map(r => ({ tweetId: r.tweetId, error: r.error }))
      }, { status: 500 });
    }

    // Filter out videos that exceed Typefully limits
    const typeFullyCompatible = successfulDownloads.filter(r => {
      const sizeOk = !r.fileSize || r.fileSize <= 512 * 1024 * 1024; // 512MB
      const durationOk = !r.duration || r.duration <= 600; // 10 minutes
      return sizeOk && durationOk;
    });

    if (typeFullyCompatible.length < successfulDownloads.length) {
      console.warn(`⚠️ ${successfulDownloads.length - typeFullyCompatible.length} clips exceed Typefully limits and were excluded`);
    }

    console.log(`Creating zip file with ${typeFullyCompatible.length} Typefully-compatible clips...`);
    const zipPath = path.join(os.tmpdir(), `twipclip-${Date.now()}.zip`);
    const finalZipPath = await createZipFile(typeFullyCompatible, zipPath);
    
    // Generate download URL
    const downloadUrl = `/api/download?file=${encodeURIComponent(finalZipPath)}`;
    
    // Calculate total size
    const totalSize = typeFullyCompatible.reduce((sum, r) => sum + (r.fileSize || 0), 0);
    const totalSizeMB = (totalSize / 1024 / 1024).toFixed(1);
    
    return NextResponse.json({
      success: true,
      downloadUrl,
      totalClips: matches.length,
      successfulDownloads: successfulDownloads.length,
      typeFullyCompatible: typeFullyCompatible.length,
      failedDownloads: results.filter(r => !r.success).length,
      excludedDueToLimits: successfulDownloads.length - typeFullyCompatible.length,
      totalSizeMB,
      results: results.map(r => ({
        tweetId: r.tweetId,
        success: r.success,
        error: r.error,
        fileSize: r.fileSize,
        fileSizeMB: r.fileSize ? (r.fileSize / 1024 / 1024).toFixed(1) : null,
        duration: r.duration,
        exceedsTypefullyLimits: r.fileSize && r.fileSize > 512 * 1024 * 1024 || r.duration && r.duration > 600,
        excludeReason: r.fileSize && r.fileSize > 512 * 1024 * 1024 ? 'File too large (>512MB)' : 
                       r.duration && r.duration > 600 ? 'Duration too long (>10min)' : null
      }))
    });

  } catch (error) {
    console.error('Bulk download error:', error);
    return NextResponse.json({ 
      error: 'Failed to download clips',
      details: error.message,
      troubleshooting: {
        'Authentication': 'Ensure you are logged into YouTube in your browser',
        'Video Quality': 'Videos are optimized for 720p to balance quality and file size',
        'File Limits': 'Videos larger than 512MB or longer than 10 minutes are excluded for Typefully compatibility',
        'Network': 'Check your internet connection and try again'
      }
    }, { status: 500 });
  }
} 