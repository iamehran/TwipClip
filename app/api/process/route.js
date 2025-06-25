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
  const cookieStore = await cookies();
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
    const body = await request.json();
    const { thread, videos, forceRefresh = false, modelSettings, async = false } = body;
    
    if (!thread || !videos || videos.length === 0) {
      return NextResponse.json(
        { error: 'Thread and videos are required' },
        { status: 400 }
      );
    }

    // Get session ID from cookies
    const cookieStore = await cookies();
    const sessionId = cookieStore.get('twipclip_session')?.value;

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

    console.log('🎯 Processing request...');
    console.log(`📝 Thread: ${thread.substring(0, 100)}...`);
    console.log(`📹 Videos: ${videos.length}`);
    console.log(`🔄 Force refresh: ${forceRefresh}`);
    console.log(`⚡ Async mode: ${async}`);
    console.log(`🤖 Model settings:`, modelSettings);
    console.log(`🔐 Session ID:`, sessionId ? sessionId.substring(0, 8) + '...' : 'none');

    // If async mode is requested but we're going to process synchronously anyway
    // Return the results in a format the client expects
    if (async) {
      // Create a job ID for tracking
      const jobId = randomUUID();
      
      // Create initial job status
      createProcessingJob(jobId);
      updateProcessingStatus(jobId, {
        progress: 5,
        message: 'Initializing search...'
      });
      
      // Start processing in the background (simulated)
      setTimeout(async () => {
        try {
          // Update progress periodically
          const updateProgress = (progress, message) => {
            updateProcessingStatus(jobId, {
              progress,
              message
            });
          };
          
          updateProgress(15, 'Extracting audio from videos...');
          
          // Process with custom progress callback
          const { results, matches, statistics } = await processVideosWithPerfectMatching(
            thread, 
            videos,
            {
              forceRefresh,
              downloadClips: false,
              createZip: false,
              modelSettings,
              sessionId,
              progressCallback: updateProgress
            }
          );

          console.log('✅ Processing complete');
          console.log(`📊 Statistics:`, statistics);

          // Format the response to match what the client expects
          const formattedMatches = matches.map(match => ({
            match: true,
            tweet: match.tweetText,
            videoUrl: match.videoUrl,
            startTime: match.startTime,
            endTime: match.endTime,
            text: match.transcriptText,
            matchReason: match.reasoning,
            confidence: match.confidence,
            downloadPath: match.downloadPath || '',
            downloadSuccess: match.downloadSuccess || false
          }));

          // Update job with results
          updateProcessingStatus(jobId, {
            status: 'completed',
            progress: 100,
            message: 'Processing complete',
            results: {
              success: true,
              matches: formattedMatches,
              summary: {
                videosProcessed: videos.length,
                videosSuccessful: results.filter(r => r.success).length,
                clipsFound: matches.length,
                clipsDownloaded: 0,
                avgConfidence: statistics.averageConfidence,
                aiModel: modelSettings?.model === 'claude-opus-4-20250514' ? 'Claude Opus 4' : 
                         modelSettings?.model === 'claude-sonnet-4-20250514' ? 'Claude Sonnet 4' : 
                         'Claude 3.7 Sonnet',
                processingTimeMs: statistics.processingTimeMs || 0,
                transcriptionQuality: 'High',
                cacheHitRate: '0%'
              }
            }
          });
        } catch (error) {
          console.error('Processing error:', error);
          updateProcessingStatus(jobId, {
            status: 'failed',
            error: error.message || 'Processing failed',
            progress: 0,
            message: 'Processing failed'
          });
        }
      }, 100); // Small delay to ensure job is stored
      
      // Return job ID for polling
      return NextResponse.json({
        jobId,
        status: 'processing'
      });
    }

    // Synchronous processing (original behavior)
    const { results, matches, statistics } = await processVideosWithPerfectMatching(
      thread, 
      videos,
      {
        forceRefresh,
        downloadClips: false,
        createZip: false,
        modelSettings,
        sessionId // Pass session ID
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