import { OpenAI } from 'openai';
import { 
  ProcessedTranscript, 
  TranscriptSegment,
  getVideoTranscript,
  detectVideoPlatform
} from './transcription';
import { 
  assessTranscriptQuality,
  enhanceTranscriptWithAI
} from './transcript-quality';
import { matchTweetsToTranscripts } from './semantic-matcher';
import { downloadClips } from './video-downloader';

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
  transcript?: ProcessedTranscript;
  clips: VideoClip[];
}

export async function processVideosIntelligently(thread: string, videos: string[]): Promise<VideoProcessingResult[]> {
  console.log(`\n=== Starting Video Processing ===`);
  console.log(`Thread: ${thread.substring(0, 100)}...`);
  console.log(`Videos: ${videos.length}`);

  const openaiClient = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: 30000, // 30 second timeout
    maxRetries: 3
  });

  // Parse tweets from thread
  const tweets = thread.split('-').map(t => t.trim()).filter(t => t.length > 0);
  console.log(`Parsed ${tweets.length} tweets from thread`);

  const results: VideoProcessingResult[] = [];
  const allTranscripts: ProcessedTranscript[] = [];

  // Process videos in parallel for speed
  const videoPromises = videos.map(async (video) => {
    console.log(`\nProcessing: ${video}`);
    
    try {
      // Detect platform
      const platform = detectVideoPlatform(video);
      console.log(`Platform: ${platform}`);

      // Get transcript
      const transcript = await getVideoTranscript(video, platform);
      
      if (!transcript || transcript.segments.length === 0) {
        console.log('⚠️ No transcript found');
        return {
          videoUrl: video,
          platform,
          success: false,
          error: 'No transcript available',
          clips: []
        };
      }

      console.log(`✓ Transcript: ${transcript.segments.length} segments`);

      // Skip quality enhancement for speed (only enhance if really poor)
      const qualityMetrics = await assessTranscriptQuality(transcript);
      console.log(`Quality score: ${qualityMetrics.overallScore.toFixed(0)}%`);

      let enhancedTranscript = transcript;
      // Only enhance if quality is very poor
      if (qualityMetrics.needsEnhancement && qualityMetrics.overallScore < 0.5) {
        console.log('Enhancing transcript quality...');
        enhancedTranscript = await enhanceTranscriptWithAI(transcript, openaiClient, qualityMetrics);
        console.log('✓ Enhancement complete');
      }

      return {
        videoUrl: video,
        platform,
        success: true,
        transcript: enhancedTranscript,
        clips: []
      };

    } catch (error: any) {
      console.error(`✗ Error: ${error.message}`);
      return {
        videoUrl: video,
        platform: 'unknown',
        success: false,
        error: error.message,
        clips: []
      };
    }
  });

  // Wait for all videos to process in parallel
  const processedVideos = await Promise.all(videoPromises);
  
  // Collect successful transcripts
  for (const result of processedVideos) {
    results.push(result);
    if (result.success && result.transcript) {
      allTranscripts.push(result.transcript);
    }
  }

  // Match tweets to transcripts
  if (allTranscripts.length > 0) {
    console.log('\n=== Starting AI Matching ===');
    const matches = await matchTweetsToTranscripts(tweets, allTranscripts, openaiClient);
    
    // Add matches to results
    for (const match of matches) {
      const result = results.find(r => r.videoUrl === match.videoUrl);
      if (result && result.success) {
        result.clips.push({
          startTime: match.startTime,
          endTime: match.endTime,
          transcript: match.transcript,
          matchedTweet: match.tweet,
          confidence: match.confidence,
          reason: match.reason
        });
      }
    }
  }

  console.log('\n=== Processing Complete ===');
  console.log(`Successful videos: ${results.filter(r => r.success).length}/${results.length}`);
  console.log(`Total clips found: ${results.reduce((sum, r) => sum + r.clips.length, 0)}`);

  return results;
} 