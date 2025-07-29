import { NextResponse } from 'next/server';
import { downloadAllClips, createZipFile } from '../../utils/bulk-download';
import path from 'path';
import os from 'os';

export async function POST(request) {
  try {
    const { matches } = await request.json();
    
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

    // With RapidAPI, no authentication needed
    console.log('🚀 Using RapidAPI for downloads - no authentication needed!');

    // Download all clips with optimized settings
    const results = await downloadAllClips(fixedMatches, {
      maxConcurrent: 2, // Limit concurrent downloads to avoid overwhelming the system
      quality: '720p', // Force 720p for compatibility
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