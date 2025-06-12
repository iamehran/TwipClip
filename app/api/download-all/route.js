import { NextResponse } from 'next/server';
import { processVideosWithPerfectMatching } from '../../../src/lib/intelligent-processor-v3';
import { performStartupCheck } from '../../../src/lib/startup-check';
import path from 'path';
import fs from 'fs/promises';

export async function POST(request) {
  try {
    const { thread, videos } = await request.json();

    if (!thread || !videos || videos.length === 0) {
      return NextResponse.json(
        { error: 'Thread and videos are required' },
        { status: 400 }
      );
    }

    // Ensure tools are available
    const ready = await performStartupCheck();
    if (!ready) {
      return NextResponse.json(
        { 
          error: 'System requirements not met',
          details: 'Please check the server console for missing dependencies'
        },
        { status: 503 }
      );
    }

    console.log('🎯 Processing bulk download request...');

    // Process videos with perfect matching and download
    const { results, matches, downloadZipPath, statistics } = await processVideosWithPerfectMatching(
      thread, 
      videos,
      {
        downloadClips: true,
        createZip: true,
        outputDir: path.join(process.cwd(), 'temp', 'downloads')
      }
    );

    if (!downloadZipPath) {
      return NextResponse.json(
        { error: 'Failed to create download package' },
        { status: 500 }
      );
    }

    // Read the ZIP file
    const zipBuffer = await fs.readFile(downloadZipPath);
    
    // Clean up the ZIP file after sending
    setTimeout(async () => {
      try {
        await fs.unlink(downloadZipPath);
      } catch (error) {
        console.error('Failed to clean up ZIP:', error);
      }
    }, 60000); // Clean up after 1 minute

    // Return the ZIP file
    return new NextResponse(zipBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="twipclip-${Date.now()}.zip"`,
        'Content-Length': zipBuffer.length.toString(),
      },
    });

  } catch (error) {
    console.error('Bulk download error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process bulk download' },
      { status: 500 }
    );
  }
} 