import { NextResponse } from 'next/server';
import { processVideosWithPerfectMatching } from '../../../src/lib/intelligent-processor-v3';
import { performStartupCheck } from '../../../src/lib/startup-check';
import { handleError, logError } from '../../../src/lib/error-handler';
import { cookies } from 'next/headers';
import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import { createProcessingJob, updateProcessingStatus, jobs } from './status/route';
import { randomUUID } from 'crypto';
import { YouTubeAuthManagerV2 } from '../../../src/lib/youtube-auth-v2';

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
    const { thread, videos, forceRefresh = false, modelSettings } = await request.json();
    
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

    // Get session ID and auth config
    const cookieStore = cookies();
    const sessionId = cookieStore.get('youtube_session_id')?.value;
    
    let authConfig;
    if (sessionId) {
      const authStatus = await YouTubeAuthManagerV2.getAuthStatus(sessionId);
      if (authStatus.authenticated && authStatus.browser) {
        authConfig = {
          browser: authStatus.browser,
          profile: authStatus.profile
        };
        console.log(`🔐 Using browser authentication: ${authConfig.browser}`);
      }
    }

    if (!authConfig) {
      console.log('⚠️ No YouTube authentication configured - downloads may fail for restricted content');
    }

    console.log('🎯 Processing request with perfect matching...');
    console.log(`📝 Thread: ${thread.substring(0, 100)}...`);
    console.log(`📹 Videos: ${videos.length}`);
    console.log(`🔄 Force refresh: ${forceRefresh}`);
    console.log(`🤖 Model settings:`, modelSettings);

    const { results, matches, statistics } = await processVideosWithPerfectMatching(
      thread, 
      videos,
      {
        forceRefresh,
        downloadClips: false,
        createZip: false,
        modelSettings,
        authConfig // Pass authentication config
      }
    );

    console.log('✅ Processing complete');
    console.log(`📊 Statistics:`, statistics);

    return NextResponse.json({
      results,
      matches,
      statistics
    });

  } catch (error) {
    console.error('Processing error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process videos' },
      { status: 500 }
    );
  }
}

// Background processing function
async function processInBackground(jobId, thread, videos, modelSettings) {
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
    const results = await processVideosIntelligently(thread, videos, progressCallback, modelSettings);
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
          aiModel: modelSettings?.model === 'claude-opus-4-20250514' ? 'Claude Opus 4' : 
                   modelSettings?.model === 'claude-sonnet-4-20250514' ? 'Claude Sonnet 4' : 
                   'Claude 3.7 Sonnet',
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