import { Anthropic } from '@anthropic-ai/sdk';
import { getEnhancedTranscript } from '../../app/utils/enhanced-transcripts';
import { 
  findPerfectMatchesIndividual, 
  findPerfectMatchesOptimized,
  PerfectMatch, 
  getMatchStatistics 
} from '../../app/utils/perfect-matching-optimized';
import { findContextAwareMatches, ContextualMatch } from '../../app/utils/context-aware-matching';
import { findContextAwareMatchesFast } from '../../app/utils/context-aware-matching-fast';
import { downloadAllClips, createZipFile, cleanupDownloads } from '../../app/utils/bulk-download';
import path from 'path';
import os from 'os';
import { YouTubeAuthConfig } from './youtube-auth-v2';

// Configuration: Use context-aware processing for better quality
const USE_CONTEXT_AWARE_MATCHING = process.env.USE_CONTEXT_AWARE !== 'false'; // Default true
const USE_FAST_MATCHING = process.env.USE_FAST_MATCHING !== 'false'; // Default true
const USE_INDIVIDUAL_PROCESSING = false; // Fallback option

// Performance tuning
const MAX_CONCURRENT_TRANSCRIPTS = parseInt(process.env.MAX_CONCURRENT_TRANSCRIPTS || '3');
const ENABLE_TRANSCRIPT_CACHE = process.env.ENABLE_TRANSCRIPT_CACHE !== 'false';

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
  forceRefresh?: boolean;
  downloadClips?: boolean;
  createZip?: boolean;
  outputDir?: string;
  quality?: string;
  sessionId?: string;
  progressCallback?: (progress: number, message: string) => void;
  modelSettings?: ModelSettings;
  authConfig?: YouTubeAuthConfig;
}

export interface ModelSettings {
  model: 'claude-opus-4-20250514' | 'claude-sonnet-4-20250514';
  thinkingEnabled: boolean;
  tokenUsage: 'low' | 'medium' | 'high';
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
  const {
    forceRefresh = false,
    downloadClips = false,
    createZip = false,
    outputDir = path.join(process.cwd(), 'temp', 'downloads'),
    quality = '720p',
    modelSettings,
    authConfig
  } = options;

  console.log('🚀 Starting intelligent video processing v3...');
  console.log(`📝 Thread: ${thread.substring(0, 100)}...`);
  console.log(`🎥 Videos: ${videos.length}`);
  console.log(`🔧 Options:`, { forceRefresh, downloadClips, createZip, quality });
  if (authConfig) {
    console.log(`🔐 Authentication: ${authConfig.browser}${authConfig.profile ? `:${authConfig.profile}` : ''}`);
  }

  const { progressCallback } = options;
  
  console.log(`🤖 Model: ${modelSettings?.model || 'claude-4-sonnet'}`);
  console.log(`🧠 Thinking: ${modelSettings?.thinkingEnabled ? 'Enabled' : 'Disabled'}`);
  console.log(`📊 Token Usage: ${modelSettings?.tokenUsage || 'medium'}`);

  progressCallback?.(5, 'Parsing thread content...');

  // Parse tweets from thread
  const tweetsText = thread.split('---').map(t => t.trim()).filter(t => t.length > 0);
  const tweets = tweetsText.map((text, index) => ({
    id: `tweet-${index + 1}`,
    text
  }));
  
  console.log(`📊 Parsed ${tweets.length} tweets from thread`);
  
  if (tweets.length === 0) {
    throw new Error('No tweets found in the thread. Please ensure tweets are separated by "---"');
  }

  const results: VideoProcessingResult[] = [];
  const videoTranscripts: any[] = [];

  // Step 1: Get transcripts for all videos in parallel
  console.log('\n📹 Getting video transcripts...');
  progressCallback?.(10, 'Extracting video transcripts...');
  
  // Process videos in batches to avoid overwhelming the system
  const processInBatches = async <T>(items: T[], batchSize: number, processor: (item: T, index: number) => Promise<any>) => {
    const results = [];
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map((item, idx) => processor(item, i + idx))
      );
      results.push(...batchResults);
    }
    return results;
  };
  
  const transcriptResults = await processInBatches(videos, MAX_CONCURRENT_TRANSCRIPTS, async (videoUrl, index) => {
    try {
      console.log(`  Processing: ${videoUrl}`);
      const progress = 10 + (index * 30 / videos.length);
      progressCallback?.(progress, `Processing video ${index + 1}/${videos.length}...`);
      
      const transcript = await getEnhancedTranscript(videoUrl, options.sessionId);
      
      if (!transcript || transcript.segments.length === 0) {
        console.log(`  ⚠️ No transcript found for ${videoUrl}`);
        return null;
      }
      
      console.log(`  ✅ Got ${transcript.segments.length} segments from ${videoUrl}`);
      
      // Update progress after each video is transcribed
      const completedProgress = 10 + ((index + 1) * 30 / videos.length);
      progressCallback?.(completedProgress, `Transcribed video ${index + 1}/${videos.length}`);
      
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
  progressCallback?.(50, 'Analyzing transcripts with AI...');
  
  // Step 2: Find perfect matches - ONE per tweet
  console.log('\n🎯 Finding perfect matches...');
  progressCallback?.(60, 'Finding perfect matches for each tweet...');
  
  let matches: PerfectMatch[] = [];
  
  // Use context-aware matching if enabled
  if (USE_CONTEXT_AWARE_MATCHING) {
    const contextMatches = USE_FAST_MATCHING 
      ? await findContextAwareMatchesFast(tweets, videoTranscripts, modelSettings)
      : await findContextAwareMatches(tweets, videoTranscripts, modelSettings);
    
    // Convert ContextualMatch to PerfectMatch format for compatibility
    matches = contextMatches.map(cm => ({
      tweetId: cm.tweetId,
      tweetText: cm.tweetText,
      videoUrl: cm.videoUrl,
      startTime: cm.startTime,
      endTime: cm.endTime,
      transcriptText: cm.transcriptText,
      confidence: cm.confidence,
      matchQuality: cm.matchQuality,
      reasoning: cm.reasoning
    } as PerfectMatch));
  } else {
    // Fallback to previous matching methods
    const findPerfectMatches = USE_INDIVIDUAL_PROCESSING 
      ? findPerfectMatchesIndividual 
      : findPerfectMatchesOptimized;
    
    matches = await findPerfectMatches(tweets, videoTranscripts, modelSettings);
  }
  
  progressCallback?.(80, 'Formatting results...');
  
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
  
  if (downloadClips && matches.length > 0) {
    console.log(`\n📥 Downloading ${matches.length} clips...`);
    
    const downloadResults = await downloadAllClips(matches, {
      outputDir,
      maxConcurrent: 3,
      quality,
      authConfig,
      onProgress: (progress) => {
        console.log(`  Progress: ${progress.completed}/${progress.total} (${progress.percentage.toFixed(0)}%)`);
      }
    });

    const successfulDownloads = downloadResults.filter(r => r.success);
    console.log(`✅ Downloaded ${successfulDownloads.length}/${matches.length} clips`);

    // Update matches with download status
    matches.forEach((match, index) => {
      const downloadResult = downloadResults[index];
      if (downloadResult) {
        match.downloadSuccess = downloadResult.success;
        match.downloadError = downloadResult.error;
        match.downloadPath = downloadResult.downloadPath;
      }
    });

    // Create ZIP if requested
    if (createZip && successfulDownloads.length > 0) {
      console.log('\n📦 Creating ZIP archive...');
      const zipPath = path.join(outputDir, `twipclip-${Date.now()}.zip`);
                downloadZipPath = await createZipFile(downloadResults, zipPath);
      console.log(`✅ ZIP created: ${downloadZipPath}`);
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
  
  progressCallback?.(100, 'Processing complete!');
  
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
  videos: string[],
  progressCallback?: (progress: number, message: string) => void,
  modelSettings?: ModelSettings
): Promise<VideoProcessingResult[]> {
  const { results } = await processVideosWithPerfectMatching(thread, videos, {
    downloadClips: false,
    progressCallback,
    modelSettings
  });
  
  return results;
} 