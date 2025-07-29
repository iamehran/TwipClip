import { NextResponse } from 'next/server';
import { processVideosWithPerfectMatching } from '../../../src/lib/intelligent-processor-v3';
import { performStartupCheck } from '../../../src/lib/startup-check';
import { handleError, logError } from '../../../src/lib/error-handler';
import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import { randomUUID } from 'crypto';
// YouTube auth removed - using RapidAPI

// Inline job management to avoid context issues in production
// Use global to persist across hot reloads
if (typeof global !== 'undefined' && !global.twipclipJobs) {
  global.twipclipJobs = new Map();
  global.twipclipCleanupTimeouts = new Map();
}

const getJobsMap = () => {
  if (typeof global !== 'undefined' && global.twipclipJobs) {
    return global.twipclipJobs;
  }
  return new Map();
};

const getTimeoutsMap = () => {
  if (typeof global !== 'undefined' && global.twipclipCleanupTimeouts) {
    return global.twipclipCleanupTimeouts;
  }
  return new Map();
};

// Inline implementations to avoid import issues
const createProcessingJob = (jobId) => {
  try {
    const jobs = getJobsMap();
    const jobData = {
      status: 'processing',
      progress: 0,
      message: 'Starting processing...',
      startTime: Date.now(),
      lastUpdate: Date.now(),
      createdAt: Date.now()
    };
    
    jobs.set(jobId, jobData);
    console.log(`✅ Job ${jobId} created inline`);
    return jobData;
  } catch (err) {
    console.error('Error creating job:', err);
    return null;
  }
};

const updateProcessingStatus = (jobId, update) => {
  try {
    const jobs = getJobsMap();
    const cleanupTimeouts = getTimeoutsMap();
    
    const current = jobs.get(jobId) || {
      status: 'processing',
      progress: 0,
      message: 'Initializing...',
      startTime: Date.now()
    };
    
    jobs.set(jobId, {
      ...current,
      ...update,
      lastUpdate: Date.now()
    });
    
    // Handle cleanup for terminal states
    if (update.status === 'completed' || update.status === 'failed') {
      if (cleanupTimeouts.has(jobId)) {
        clearTimeout(cleanupTimeouts.get(jobId));
      }
      
      const timeout = setTimeout(() => {
        jobs.delete(jobId);
        cleanupTimeouts.delete(jobId);
      }, 60 * 60 * 1000);
      
      cleanupTimeouts.set(jobId, timeout);
    }
  } catch (err) {
    console.error('Error updating job status:', err);
  }
};

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

// Auth file no longer needed with RapidAPI

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

    // Session ID no longer needed with RapidAPI

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
    console.log(`🚀 Using RapidAPI - no authentication needed`);

    // If async mode is requested but we're going to process synchronously anyway
    // Return the results in a format the client expects
    if (async) {
      // Create a job ID for tracking
      const jobId = randomUUID();
      console.log('🚀 Creating new job with ID:', jobId);
      
      // Create initial job status
      createProcessingJob(jobId);
      updateProcessingStatus(jobId, {
        progress: 5,
        message: 'Initializing search...'
      });
      
      // Log job creation
      console.log('📋 Job created and stored:', getJobsMap().get(jobId));
      console.log('🗺️ Jobs Map instance ID:', getJobsMap());
      
      // Start processing in the background
      // Use a simple setTimeout to avoid complex async contexts
      setTimeout(() => {
        // Process asynchronously
        (async () => {
          try {
            console.log(`🚀 Starting async processing for job ${jobId}`);
            
            // Simple progress update function
            const updateProgress = (progress, message) => {
              console.log(`📊 Progress: ${progress}% - ${message}`);
              updateProcessingStatus(jobId, { progress, message });
            };
            
            updateProgress(15, 'Extracting audio from videos...');
            
            // Process videos
            const processResult = await processVideosWithPerfectMatching(
              thread, 
              videos,
              {
                forceRefresh,
                downloadClips: false,
                createZip: false,
                modelSettings,
                progressCallback: updateProgress
              }
            );
            
            const { results, matches, statistics } = processResult || { 
              results: [], 
              matches: [], 
              statistics: {} 
            };

            console.log('✅ Processing complete');
            console.log(`📊 Statistics:`, statistics);

            // Format matches
            const formattedMatches = (matches || []).map(match => ({
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

            // Create final status
            const finalStatus = {
              status: 'completed',
              progress: 100,
              message: 'Processing complete',
              results: {
                success: true,
                matches: formattedMatches,
                summary: {
                  videosProcessed: videos.length,
                  videosSuccessful: results.filter(r => r && r.success).length,
                  clipsFound: matches.length,
                  clipsDownloaded: 0,
                  avgConfidence: statistics.averageConfidence || 0,
                  aiModel: modelSettings?.model === 'claude-opus-4-20250514' ? 'Claude Opus 4' : 
                           modelSettings?.model === 'claude-sonnet-4-20250514' ? 'Claude Sonnet 4' : 
                           'Claude 3.7 Sonnet',
                  processingTimeMs: statistics.processingTimeMs || 0,
                  transcriptionQuality: 'High',
                  transcriptWords: statistics.totalTranscriptWords || 0
                }
              }
            };

            updateProcessingStatus(jobId, finalStatus);
            console.log(`✅ Job ${jobId} completed successfully`);

          } catch (error) {
            console.error(`❌ Error in job ${jobId}:`, error);
            updateProcessingStatus(jobId, {
              status: 'failed',
              progress: 0,
              message: 'Processing failed',
              error: error.message || 'Unknown error'
            });
          }
        })();
      }, 100); // Small delay to ensure response is sent first
      
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