import { NextResponse } from 'next/server';
import { processVideosWithPerfectMatching } from '../../../src/lib/intelligent-processor-v3';
import { downloadAllClips, createDownloadZip } from '../../../app/utils/bulk-download';
import { performStartupCheck } from '../../../src/lib/startup-check';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';

export async function POST(request) {
  try {
    const { thread, videos, matches, quality = '720p' } = await request.json();

    if (!thread || !videos || videos.length === 0) {
      return NextResponse.json(
        { error: 'Thread and videos are required' },
        { status: 400 }
      );
    }
    
    // Validate quality parameter
    if (quality && !['720p', '1080p'].includes(quality)) {
      return NextResponse.json(
        { error: 'Invalid quality. Must be 720p or 1080p' },
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
    console.log(`📹 Quality: ${quality}`);

    let downloadZipPath;

    // If matches are provided, use them directly
    if (matches && matches.length > 0) {
      console.log('📊 Using provided matches:', matches.length);
      
      // Convert matches to the format expected by downloadAllClips
      const formattedMatches = matches.map((match, index) => ({
        tweetId: match.tweetId || `tweet-${index + 1}`,
        tweetText: match.tweet || '',
        videoUrl: match.videoUrl,
        startTime: match.startTime,
        endTime: match.endTime,
        transcriptText: match.text || '',
        confidence: match.confidence || 0,
        matchQuality: match.matchQuality || 'good',
        reasoning: match.reasoning || ''
      }));

      // Download clips directly
      const outputDir = path.join(process.cwd(), 'temp', 'downloads', Date.now().toString());
      await fs.mkdir(outputDir, { recursive: true });

      const downloadResults = await downloadAllClips(formattedMatches, {
        outputDir,
        maxConcurrent: 3,
        quality,
        onProgress: (progress) => {
          console.log(`  Progress: ${progress.completed}/${progress.total} (${progress.percentage.toFixed(0)}%)`);
        }
      });

      // Create ZIP
      const zipPath = path.join(outputDir, `twipclip-${Date.now()}.zip`);
      downloadZipPath = await createDownloadZip(downloadResults, zipPath);

    } else {
      // Fallback: Process videos with perfect matching
      console.log('⚠️ No matches provided, re-processing videos...');
      
      const { results, matches: newMatches, downloadZipPath: zipPath, statistics } = await processVideosWithPerfectMatching(
      thread, 
      videos,
      {
        downloadClips: true,
        createZip: true,
          outputDir: path.join(process.cwd(), 'temp', 'downloads'),
          quality: quality
      }
    );

      downloadZipPath = zipPath;
    }

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
        // Also clean up the parent directory
        const parentDir = path.dirname(downloadZipPath);
        await fs.rmdir(parentDir).catch(() => {}); // Ignore errors if not empty
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