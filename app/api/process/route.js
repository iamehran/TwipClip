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
// YouTube auth removed - using RapidAPI

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
      console.log('📋 Job created and stored:', jobs.get(jobId));
      console.log('🗺️ Jobs Map instance ID:', jobs);
      
      // Start processing in the background (simulated)
      setTimeout(async () => {
        try {
          // Update progress periodically
          const updateProgress = (progress, message) => {
            if (typeof updateProcessingStatus === 'function') {
              updateProcessingStatus(jobId, {
                progress,
                message
              });
            } else {
              console.error('updateProcessingStatus is not a function:', typeof updateProcessingStatus);
            }
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
          const finalStatus = {
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
          };
          
          updateProcessingStatus(jobId, finalStatus);
          console.log(`✅ Job ${jobId} completed and stored with ${formattedMatches.length} matches`);
          console.log('📋 Job final status stored:', jobs.get(jobId)?.status);
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