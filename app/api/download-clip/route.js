import { NextResponse } from 'next/server';
import { downloadClips } from '../../../src/lib/video-downloader';
import fs from 'fs';
import path from 'path';

export async function POST(request) {
  try {
    const { videoUrl, startTime, endTime, tweet } = await request.json();

    if (!videoUrl || startTime === undefined || endTime === undefined) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    // Create a match object for the downloader
    const match = {
      match: true,
      videoUrl,
      startTime,
      endTime,
      tweet: tweet || 'Manual download'
    };

    // Download just this one clip
    const results = await downloadClips([match]);
    
    if (results.length > 0 && results[0].success && results[0].filePath) {
      const filePath = results[0].filePath;
      
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
      return NextResponse.json(
        { 
          error: 'Failed to download clip',
          details: results[0]?.error 
        },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('Download error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
} 