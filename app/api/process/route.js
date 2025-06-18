import { NextResponse } from 'next/server';
import { processVideosIntelligently } from '../../../src/lib/intelligent-processor-v3';
import { performStartupCheck } from '../../../src/lib/startup-check';
import { handleError, logError } from '../../../src/lib/error-handler';
import { cookies } from 'next/headers';
import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import { createProcessingJob, updateProcessingStatus } from './status/route';
import { randomUUID } from 'crypto';

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
  try {
    const { thread, videos, async = false } = await request.json();

    if (!thread || !videos || videos.length === 0) {
      return NextResponse.json(
        { error: 'Thread and videos are required' },
        { status: 400 }
      );
    }

    // Add request validation
    if (videos.length > 5) {
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
      return NextResponse.json(
        { 
          error: 'System requirements not met',
          details: 'Please check the server console for missing dependencies (yt-dlp, FFmpeg, or API keys)'
        },
        { status: 503 }
      );
    }

    // If async mode, return job ID immediately
    if (async) {
      const jobId = randomUUID();
      createProcessingJob(jobId);
      
      // Process in background
      processInBackground(jobId, thread, videos);
      
      return NextResponse.json({
        success: true,
        jobId,
        message: 'Processing started. Poll /api/process/status?jobId=' + jobId + ' for updates'
      });
    }

    // Synchronous processing (original behavior)
    const startTime = Date.now();
    const results = await processVideosIntelligently(thread, videos);
    const processingTime = Date.now() - startTime;

    // Format response
    const matches = formatMatches(results);
    const avgConfidence = calculateAvgConfidence(matches);

    return NextResponse.json({
      success: true,
      matches: matches,
      summary: {
        videosProcessed: results.length,
        videosSuccessful: results.filter(r => r.success).length,
        clipsFound: matches.length,
        clipsDownloaded: matches.filter(m => m.downloadSuccess).length,
        avgConfidence: avgConfidence,
        aiModel: 'Claude 3.7 Sonnet',
        processingTimeMs: processingTime
      }
    });

  } catch (error) {
    logError(error, 'process-endpoint');
    const { message, statusCode } = handleError(error);
    
    return NextResponse.json(
      { error: message },
      { status: statusCode }
    );
  }
}

// Background processing function
async function processInBackground(jobId, thread, videos) {
  try {
    updateProcessingStatus(jobId, {
      status: 'processing',
      progress: 10,
      message: 'Starting video processing...'
    });

    const startTime = Date.now();
    
    // Create a custom progress callback
    const progressCallback = (progress, message) => {
      updateProcessingStatus(jobId, {
        progress: Math.min(90, progress),
        message
      });
    };

    // Process videos with progress updates
    const results = await processVideosIntelligently(thread, videos, progressCallback);
    const processingTime = Date.now() - startTime;

    // Format results
    const matches = formatMatches(results);
    const avgConfidence = calculateAvgConfidence(matches);

    // Update status with completed results
    updateProcessingStatus(jobId, {
      status: 'completed',
      progress: 100,
      message: 'Processing complete',
      results: {
        success: true,
        matches: matches,
        summary: {
          videosProcessed: results.length,
          videosSuccessful: results.filter(r => r.success).length,
          clipsFound: matches.length,
          clipsDownloaded: matches.filter(m => m.downloadSuccess).length,
          avgConfidence: avgConfidence,
          aiModel: 'Claude 3.7 Sonnet',
          processingTimeMs: processingTime
        }
      }
    });

  } catch (error) {
    console.error('Background processing error:', error);
    updateProcessingStatus(jobId, {
      status: 'failed',
      progress: 0,
      message: error.message || 'Processing failed',
      error: error.message
    });
  }
}

// Helper functions
function formatMatches(results) {
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
  return matches;
}

function calculateAvgConfidence(matches) {
  return matches.length > 0 
    ? matches.reduce((sum, m) => sum + (m.confidence || 0), 0) / matches.length
    : 0;
} 