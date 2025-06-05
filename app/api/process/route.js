import { NextResponse } from 'next/server';
import { processVideosIntelligently } from '../../../src/lib/intelligent-processor-v2';
import { performStartupCheck } from '../../../src/lib/startup-check';

// Run startup check once when module loads
let startupCheckDone = false;
let toolsAvailable = false;

async function ensureToolsAvailable() {
  if (!startupCheckDone) {
    toolsAvailable = await performStartupCheck();
    startupCheckDone = true;
  }
  return toolsAvailable;
}

export async function POST(request) {
  try {
    // Ensure tools are available
    const ready = await ensureToolsAvailable();
    if (!ready) {
      return NextResponse.json(
        { 
          error: 'System requirements not met',
          details: 'Please check the server console for missing dependencies (yt-dlp, FFmpeg, or API keys)'
        },
        { status: 503 }
      );
    }

    const { thread, videos } = await request.json();

    // Validate input
    if (!thread || !videos || !Array.isArray(videos) || videos.length === 0) {
      return NextResponse.json(
        { error: 'Invalid input: thread and videos array required' },
        { status: 400 }
      );
    }

    // Process videos with our intelligent system
    const results = await processVideosIntelligently(thread, videos);

    // Format response similar to media-matcher
    const matches = [];
    for (const result of results) {
      if (result.success) {
        for (const clip of result.clips) {
          matches.push({
            match: true,
            tweet: clip.matchedTweet,
            videoUrl: result.videoUrl,
            startTime: clip.startTime,
            endTime: clip.endTime,
            text: clip.transcript,
            matchReason: clip.reason,
            confidence: clip.confidence,
            downloadPath: clip.downloadPath,
            downloadSuccess: clip.downloadSuccess
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      matches: matches,
      summary: {
        videosProcessed: results.length,
        videosSuccessful: results.filter(r => r.success).length,
        clipsFound: matches.length,
        clipsDownloaded: matches.filter(m => m.downloadSuccess).length
      }
    });

  } catch (error) {
    console.error('Processing error:', error);
    return NextResponse.json(
      { error: error.message, stack: error.stack },
      { status: 500 }
    );
  }
} 