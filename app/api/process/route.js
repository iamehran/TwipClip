import { NextResponse } from 'next/server';
import { processVideosIntelligently } from '../../../src/lib/intelligent-processor-v3';
import { performStartupCheck } from '../../../src/lib/startup-check';
import { handleError, logError } from '../../../src/lib/error-handler';
import { cookies } from 'next/headers';
import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';

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

async function ensureAuthFile() {
  const cookieStore = cookies();
  const isAuthenticated = cookieStore.get('youtube_authenticated')?.value === 'true';
  
  if (isAuthenticated) {
    const cookieDir = path.join(process.cwd(), 'temp');
    const cookieFile = path.join(cookieDir, 'youtube_auth.txt');
    
    try {
      if (!existsSync(cookieDir)) {
        await fs.mkdir(cookieDir, { recursive: true });
      }
      await fs.writeFile(cookieFile, 'authenticated', 'utf-8');
      console.log('✅ YouTube auth file created');
    } catch (error) {
      console.error('Failed to create auth file:', error);
    }
  }
}

export async function POST(request) {
  // Set a longer timeout for this endpoint
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 600000); // 10 minute timeout (increased from 5)

  try {
    const { thread, videos } = await request.json();

    if (!thread || !videos || videos.length === 0) {
      clearTimeout(timeoutId);
      return NextResponse.json(
        { error: 'Thread and videos are required' },
        { status: 400 }
      );
    }

    // Add request validation
    if (videos.length > 5) {
      clearTimeout(timeoutId);
      return NextResponse.json(
        { error: 'Maximum 5 videos allowed per request' },
        { status: 400 }
      );
    }

    console.log('Processing request:', { thread: thread.substring(0, 50), videoCount: videos.length });

    // Ensure auth file exists if user is authenticated
    await ensureAuthFile();
    
    // Ensure tools are available
    const ready = await ensureToolsAvailable();
    if (!ready) {
      clearTimeout(timeoutId);
      return NextResponse.json(
        { 
          error: 'System requirements not met',
          details: 'Please check the server console for missing dependencies (yt-dlp, FFmpeg, or API keys)'
        },
        { status: 503 }
      );
    }

    // Process videos with our intelligent system
    const startTime = Date.now();
    const results = await processVideosIntelligently(thread, videos);
    const processingTime = Date.now() - startTime;

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

    // Calculate average confidence
    const avgConfidence = matches.length > 0 
      ? matches.reduce((sum, m) => sum + (m.confidence || 0), 0) / matches.length
      : 0;

    clearTimeout(timeoutId);

    return NextResponse.json({
      success: true,
      matches: matches,
      summary: {
        videosProcessed: results.length,
        videosSuccessful: results.filter(r => r.success).length,
        clipsFound: matches.length,
        clipsDownloaded: matches.filter(m => m.downloadSuccess).length,
        avgConfidence: avgConfidence,
        aiModel: 'Claude Opus 4',
        processingTimeMs: processingTime
      }
    });

  } catch (error) {
    clearTimeout(timeoutId);
    
    // Check if it's a timeout error
    if (error.name === 'AbortError') {
      return NextResponse.json(
        { error: 'Request timeout - processing took too long. Try with fewer videos or shorter content.' },
        { status: 504 }
      );
    }
    
    logError(error, 'process-endpoint');
    const { message, statusCode } = handleError(error);
    
    return NextResponse.json(
      { error: message },
      { status: statusCode }
    );
  }
} 