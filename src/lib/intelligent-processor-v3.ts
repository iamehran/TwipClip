import { Anthropic } from '@anthropic-ai/sdk';
import { getEnhancedTranscript } from '../../app/utils/enhanced-transcripts';
import { findPerfectMatches, PerfectMatch, getMatchStatistics } from '../../app/utils/perfect-matching';
import { downloadAllClips, createDownloadZip, cleanupDownloads } from '../../app/utils/bulk-download';
import path from 'path';
import os from 'os';

export interface VideoClip {
  startTime: number;
  endTime: number;
  transcript: string;
  matchedTweet?: string;
  confidence?: number;
  reason?: string;
  downloadPath?: string;
  downloadSuccess?: boolean;
  downloadError?: string;
}

export interface VideoProcessingResult {
  videoUrl: string;
  platform: string;
  success: boolean;
  error?: string;
  clips: VideoClip[];
}

export interface ProcessingOptions {
  downloadClips?: boolean;
  createZip?: boolean;
  outputDir?: string;
}

/**
 * Process videos with perfect matching - ONE clip per tweet
 */
export async function processVideosWithPerfectMatching(
  thread: string, 
  videos: string[],
  options: ProcessingOptions = {}
): Promise<{
  results: VideoProcessingResult[];
  matches: PerfectMatch[];
  downloadZipPath?: string;
  statistics: any;
}> {
  console.log(`\n🚀 Starting Perfect Video Processing`);
  console.log(`📝 Thread: ${thread.substring(0, 100)}...`);
  console.log(`🎥 Videos: ${videos.length}`);

  // Parse tweets from thread
  const tweetsText = thread.split('---').map(t => t.trim()).filter(t => t.length > 0);
  const tweets = tweetsText.map((text, index) => ({
    id: `tweet-${index + 1}`,
    text
  }));
  
  console.log(`📊 Parsed ${tweets.length} tweets from thread`);

  const results: VideoProcessingResult[] = [];
  const videoTranscripts: any[] = [];

  // Step 1: Get transcripts for all videos in parallel
  console.log('\n📹 Getting video transcripts...');
  
  const transcriptPromises = videos.map(async (videoUrl) => {
    try {
      console.log(`  Processing: ${videoUrl}`);
      
      const transcript = await getEnhancedTranscript(videoUrl);
      
      if (!transcript || transcript.segments.length === 0) {
        console.log(`  ⚠️ No transcript found for ${videoUrl}`);
        return null;
      }
      
      console.log(`  ✅ Got ${transcript.segments.length} segments from ${videoUrl}`);
      
      return {
        videoUrl,
        segments: transcript.segments,
        duration: transcript.segments.reduce((sum, seg) => 
          Math.max(sum, seg.offset + seg.duration), 0
        )
      };
      
    } catch (error) {
      console.error(`  ❌ Error processing ${videoUrl}:`, error);
      return null;
    }
  });
  
  const transcriptResults = await Promise.all(transcriptPromises);
  
  // Filter out failed transcripts
  for (const transcript of transcriptResults) {
    if (transcript) {
      videoTranscripts.push(transcript);
    }
  }
  
  if (videoTranscripts.length === 0) {
    throw new Error('No video transcripts could be obtained');
  }
  
  console.log(`\n✅ Successfully transcribed ${videoTranscripts.length}/${videos.length} videos`);
  
  // Step 2: Find perfect matches - ONE per tweet
  console.log('\n🎯 Finding perfect matches...');
  
  const matches = await findPerfectMatches(tweets, videoTranscripts);
  
  // Step 3: Convert matches to results format
  for (const videoUrl of videos) {
    const videoMatches = matches.filter(m => m.videoUrl === videoUrl);
    
    results.push({
      videoUrl,
      platform: 'youtube', // You can detect this properly if needed
      success: true,
      clips: videoMatches.map(match => ({
        startTime: match.startTime,
        endTime: match.endTime,
        transcript: match.transcriptText,
        matchedTweet: match.tweetText,
        confidence: match.confidence,
        reason: match.reasoning
      }))
    });
  }
  
  // Step 4: Download clips if requested
  let downloadZipPath: string | undefined;
  
  if (options.downloadClips) {
    console.log('\n📥 Downloading all clips...');
    
    const downloadResults = await downloadAllClips(matches, {
      outputDir: options.outputDir,
      maxConcurrent: 3,
      onProgress: (progress) => {
        console.log(`  Progress: ${progress.completed}/${progress.total} (${progress.percentage.toFixed(0)}%)`);
      }
    });
    
    // Update matches with download paths
    for (let i = 0; i < matches.length; i++) {
      const downloadResult = downloadResults[i];
      if (downloadResult) {
        matches[i].downloadPath = downloadResult.downloadPath;
        matches[i].downloadSuccess = downloadResult.success;
      }
    }
    
    // Create ZIP if requested
    if (options.createZip) {
      const zipPath = path.join(
        options.outputDir || os.tmpdir(),
        `twipclip-${Date.now()}.zip`
      );
      
      console.log('\n📦 Creating ZIP file...');
      downloadZipPath = await createDownloadZip(downloadResults, zipPath);
      console.log(`✅ ZIP created: ${downloadZipPath}`);
      
      // Clean up individual files after creating ZIP
      await cleanupDownloads(downloadResults);
    }
  }
  
  // Get statistics
  const statistics = getMatchStatistics(matches);
  
  console.log('\n📊 Processing Complete:');
  console.log(`  Total tweets: ${tweets.length}`);
  console.log(`  Total matches: ${matches.length}`);
  console.log(`  Match quality:`);
  console.log(`    - Perfect: ${statistics.byQuality.perfect}`);
  console.log(`    - Excellent: ${statistics.byQuality.excellent}`);
  console.log(`    - Good: ${statistics.byQuality.good}`);
  console.log(`    - Acceptable: ${statistics.byQuality.acceptable}`);
  console.log(`  Average confidence: ${(statistics.averageConfidence * 100).toFixed(0)}%`);
  
  return {
    results,
    matches,
    downloadZipPath,
    statistics
  };
}

/**
 * Simplified version for API endpoint
 */
export async function processVideosIntelligently(
  thread: string, 
  videos: string[]
): Promise<VideoProcessingResult[]> {
  const { results } = await processVideosWithPerfectMatching(thread, videos, {
    downloadClips: false
  });
  
  return results;
} 