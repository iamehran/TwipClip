import { NextResponse } from 'next/server';
import { downloadClip } from '../../utils/bulk-download';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Test endpoint to verify download functionality
export async function GET() {
  return NextResponse.json({ 
    status: 'Download endpoint is running',
    timestamp: new Date().toISOString()
  });
}

export async function POST(request) {
  console.log('📥 Download-clip endpoint called');
  
  try {
    const { videoUrl, startTime, endTime, tweet } = await request.json();
    console.log('Download request:', { videoUrl, startTime, endTime });

    if (!videoUrl || startTime === undefined || endTime === undefined) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    // Create a match object for the downloader
    const match = {
      videoUrl,
      startTime,
      endTime,
      tweet: tweet || 'Manual download',
      tweetId: 'manual',
      confidence: 1.0
    };

    // Create temp directory for download
    const outputDir = path.join(os.tmpdir(), 'twipclip-single', Date.now().toString());
    await fs.promises.mkdir(outputDir, { recursive: true });

    // Download just this one clip
    console.log('Calling downloadClip with match:', match);
    const result = await downloadClip(match, outputDir);
    console.log('Download result:', { 
      success: result.success, 
      downloadPath: result.downloadPath,
      error: result.error 
    });
    
    if (result.success && result.downloadPath) {
      const filePath = result.downloadPath;
      
      // Read the file
      const fileBuffer = await fs.promises.readFile(filePath);
      
      // Clean up the temp file after reading
      setTimeout(() => {
        fs.promises.unlink(filePath).catch(console.error);
      }, 1000);
      
      // Extract video ID for filename
      const videoId = videoUrl.match(/(?:v=|youtu\.be\/)([^&\n?#]+)/)?.[1] || 'clip';
      const filename = `${videoId}_${Math.floor(startTime)}-${Math.floor(endTime)}s.mp4`;
      
      // Return the file as a download
      return new NextResponse(fileBuffer, {
        headers: {
          'Content-Type': 'video/mp4',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Content-Length': fileBuffer.length.toString(),
        },
      });
    } else {
      console.error('Download failed:', { 
        success: result?.success,
        error: result?.error,
        downloadPath: result?.downloadPath 
      });
      return NextResponse.json(
        { 
          error: 'Failed to download clip',
          details: result?.error 
        },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('Download endpoint error:', error);
    console.error('Error stack:', error.stack);
    return NextResponse.json(
      { error: error.message || 'Unknown error occurred' },
      { status: 500 }
    );
  }
} 