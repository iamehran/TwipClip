import { NextResponse } from 'next/server';
import { processVideosWithPerfectMatching } from '../../../src/lib/intelligent-processor-v3';
import { performStartupCheck } from '../../../src/lib/startup-check';
import { handleError, logError } from '../../../src/lib/error-handler';
import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import { randomUUID } from 'crypto';
// YouTube auth removed - using RapidAPI

// Import job management functions from a shared lib file instead of API route
import { createProcessingJob, updateProcessingStatus, jobs } from '../../../src/lib/job-manager';

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
      
      // Start processing in the background
      // Create a bound function to maintain context
      const startBackgroundProcessing = async () => {
        try {
          // Small delay to ensure response is sent first
          await new Promise(resolve => {
            const timer = setTimeout(() => resolve(), 10);
            // Ensure timer is cleared if needed
            if (timer && typeof timer === 'number') {
              // Timer started successfully
            }
          });
          
          // Create a bound update function to ensure it's always available
          const boundUpdateStatus = (jobId, update) => {
            try {
              // Check if function exists before calling
              if (typeof updateProcessingStatus === 'function') {
                updateProcessingStatus(jobId, update);
              } else {
                console.error('updateProcessingStatus is not available');
              }
            } catch (err) {
              console.error('Error in boundUpdateStatus:', err);
            }
          };
          
          // Update progress periodically with bound function
          const updateProgress = (progress, message) => {
            boundUpdateStatus(jobId, {
              progress,
              message
            });
          };
          
          updateProgress(15, 'Extracting audio from videos...');
          
          // Process with custom progress callback
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
          
          // Destructure results after await to ensure they're available
          const { results, matches, statistics } = processResult || { results: [], matches: [], statistics: {} };

          console.log('✅ Processing complete');
          console.log(`📊 Statistics:`, statistics);

          // Format the response to match what the client expects
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

          // Update job with results using bound function
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

          boundUpdateStatus(jobId, finalStatus);
          
          // Log job completion
          console.log(`✅ Job ${jobId} completed and stored with ${formattedMatches.length} matches`);
          console.log('📋 Job final status stored:', finalStatus.status);

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(`Error processing job ${jobId}:`, error);
          
          // Try to update job status with error using a direct check
          try {
            if (typeof updateProcessingStatus === 'function') {
              updateProcessingStatus(jobId, {
                status: 'failed',
                progress: 0,
                message: 'Processing failed',
                error: errorMessage
              });
            }
          } catch (updateErr) {
            console.error('Failed to update error status:', updateErr);
          }
        }
      };
      
      // Execute the background processing with promise catch
      Promise.resolve()
        .then(() => startBackgroundProcessing())
        .catch(err => {
          console.error('Background processing failed:', err);
        });
      
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