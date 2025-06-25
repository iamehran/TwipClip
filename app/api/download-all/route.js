import { NextResponse } from 'next/server';
import { downloadAllClips, createDownloadZip } from '../../utils/bulk-download';
import { cookies } from 'next/headers';
import { YouTubeAuthManagerV2 } from '../../../src/lib/youtube-auth-v2';
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

    // Get session ID for per-user cookies
    const cookieStore = await cookies();
    const sessionId = cookieStore.get('twipclip_session')?.value;
    
    if (sessionId) {
      console.log(`Using session ID: ${sessionId.substring(0, 8)}...`);
    }

    // Download all clips with progress tracking
    const results = await downloadAllClips(matches, {
      maxConcurrent: 2, // Limit concurrent downloads
      quality: '720p',
      sessionId, // Pass session ID for per-user cookies
      onProgress: (progress) => {
        console.log(`Progress: ${progress.completed}/${progress.total} (${progress.percentage.toFixed(1)}%)`);
      },
      onClipComplete: (result) => {
        if (result.success) {
          console.log(`✓ Downloaded clip for tweet ${result.tweetId}`);
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

    console.log(`Creating zip file with ${successfulDownloads.length} clips...`);
    const zipPath = path.join(os.tmpdir(), `twipclip-${Date.now()}.zip`);
    const finalZipPath = await createDownloadZip(results, zipPath);
    
    // Return download URL
    const downloadUrl = `/api/download?file=${encodeURIComponent(finalZipPath)}`;
    
    return NextResponse.json({
      success: true,
      downloadUrl,
      totalClips: matches.length,
      successfulDownloads: successfulDownloads.length,
      failedDownloads: results.filter(r => !r.success).length,
      results: results.map(r => ({
        tweetId: r.tweetId,
        success: r.success,
        error: r.error,
        fileSize: r.fileSize,
        duration: r.duration
      }))
    });

  } catch (error) {
    console.error('Bulk download error:', error);
    return NextResponse.json({ 
      error: 'Failed to download clips',
      details: error.message 
    }, { status: 500 });
  }
} 