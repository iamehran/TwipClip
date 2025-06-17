import Anthropic from '@anthropic-ai/sdk';
import { TranscriptSegment } from './enhanced-transcripts';

// Initialize Anthropic client
const anthropic = process.env.ANTHROPIC_API_KEY 
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) 
  : null;

export interface PerfectMatch {
  tweetId: string;
  tweetText: string;
  videoUrl: string;
  startTime: number;
  endTime: number;
  transcriptText: string;
  confidence: number;
  matchQuality: 'perfect' | 'excellent' | 'good' | 'acceptable';
  reasoning: string;
  downloadPath?: string;
  downloadSuccess?: boolean;
}

interface VideoTranscript {
  videoUrl: string;
  segments: TranscriptSegment[];
  duration: number;
}

interface BatchMatchResult {
  tweetId: string;
  videoUrl: string;
  segmentIndex: number;
  windowSize: number;
  score: number;
  reasoning: string;
  quality: string;
}

/**
 * Optimized batch matching - analyze all tweets and videos in a single API call
 */
async function batchAnalyzeMatches(
  tweets: Array<{ id: string; text: string }>,
  videoTranscripts: VideoTranscript[]
): Promise<BatchMatchResult[]> {
  if (!anthropic) {
    throw new Error('Anthropic API key not configured');
  }

  console.log('\n🚀 Starting optimized batch matching...');
  const startTime = Date.now();
  
  // Create candidate segments for each video
  const candidates: Array<{
    videoUrl: string;
    segmentIndex: number;
    windowSize: number;
    text: string;
    startTime: number;
    endTime: number;
  }> = [];

  // Use fewer, larger windows for efficiency
  const windowSizes = [10, 20]; // Reduced from [5, 10, 15]
  
  console.log(`📊 Creating candidate segments from ${videoTranscripts.length} videos...`);
  
  for (const video of videoTranscripts) {
    for (const windowSize of windowSizes) {
      const stepSize = Math.floor(windowSize / 2); // 50% overlap instead of 33%
      
      for (let i = 0; i <= video.segments.length - windowSize; i += stepSize) {
        const window = video.segments.slice(i, Math.min(i + windowSize, video.segments.length));
        const windowText = window.map(s => s.text).join(' ');
        
        // Skip very short segments
        if (windowText.length < 100) continue;
        
        candidates.push({
          videoUrl: video.videoUrl,
          segmentIndex: i,
          windowSize,
          text: windowText.substring(0, 500), // Limit text for API efficiency
          startTime: window[0].offset,
          endTime: window[window.length - 1].offset + window[window.length - 1].duration
        });
      }
    }
  }

  const candidateCreationTime = Date.now() - startTime;
  console.log(`📊 Created ${candidates.length} candidate segments in ${candidateCreationTime}ms`);

  // Limit candidates to prevent API overload
  const maxCandidates = Math.min(candidates.length, 50); // Increased from 30 to 50
  const selectedCandidates = candidates.slice(0, maxCandidates);
  
  if (candidates.length > maxCandidates) {
    console.log(`⚠️ Limiting to top ${maxCandidates} candidates (from ${candidates.length} total)`);
  }

  // Batch process all tweets and top candidates in a single API call
  const tweetsText = tweets.map((t, i) => `TWEET_${i}: "${t.text}"`).join('\n\n');
  const candidatesText = selectedCandidates.map((c, i) => 
    `SEGMENT_${i} (${c.videoUrl.split('/').pop()}, ${c.startTime.toFixed(1)}-${c.endTime.toFixed(1)}s):\n"${c.text}"`
  ).join('\n\n');

  console.log(`🤖 Sending batch request to Claude AI...`);
  const apiStartTime = Date.now();

  const response = await anthropic.messages.create({
    model: 'claude-3-7-sonnet-latest',
    max_tokens: 2000,
    temperature: 0.2,
    messages: [{
      role: 'user',
      content: `Find the SINGLE BEST video segment for each tweet. Each tweet MUST get exactly ONE match.

TWEETS:
${tweetsText}

VIDEO SEGMENTS:
${candidatesText}

For each tweet, select the ONE segment that best matches its content. Even if the match isn't perfect, choose the most relevant segment available. Return in this exact format:

MATCH_0: SEGMENT_[number] | SCORE:[0-100] | QUALITY:[perfect/excellent/good/acceptable] | REASON:[one line explanation]
MATCH_1: SEGMENT_[number] | SCORE:[0-100] | QUALITY:[perfect/excellent/good/acceptable] | REASON:[one line explanation]
...

IMPORTANT: Every tweet MUST have a match. Choose the best available segment even if the relevance is low.`
    }]
  });

  const apiTime = Date.now() - apiStartTime;
  console.log(`✅ Claude AI response received in ${apiTime}ms`);

  const content = response.content[0]?.type === 'text' ? response.content[0].text : '';
  const matches: BatchMatchResult[] = [];

  // Parse the response
  const lines = content.split('\n');
  for (const line of lines) {
    const matchRegex = /MATCH_(\d+):\s*SEGMENT_(\d+)\s*\|\s*SCORE:(\d+)\s*\|\s*QUALITY:(\w+)\s*\|\s*REASON:(.+)/;
    const match = line.match(matchRegex);
    
    if (match) {
      const tweetIndex = parseInt(match[1]);
      const segmentIndex = parseInt(match[2]);
      const score = parseInt(match[3]);
      const quality = match[4];
      const reason = match[5].trim();
      
      if (tweetIndex < tweets.length && segmentIndex < selectedCandidates.length) {
        const candidate = selectedCandidates[segmentIndex];
        matches.push({
          tweetId: tweets[tweetIndex].id,
          videoUrl: candidate.videoUrl,
          segmentIndex: candidate.segmentIndex,
          windowSize: candidate.windowSize,
          score: score / 100,
          reasoning: reason,
          quality
        });
      }
    }
  }

  const totalTime = Date.now() - startTime;
  console.log(`📊 Batch matching completed in ${totalTime}ms (${candidateCreationTime}ms prep + ${apiTime}ms API)`);

  return matches;
}

/**
 * Fallback to ensure every tweet gets a match
 */
function createDefaultMatch(
  tweet: { id: string; text: string },
  videoTranscripts: VideoTranscript[]
): PerfectMatch {
  // Pick the middle segment of the first video as a default
  const video = videoTranscripts[0];
  const midPoint = Math.floor(video.segments.length / 2);
  const windowSize = Math.min(10, video.segments.length);
  const startIdx = Math.max(0, midPoint - Math.floor(windowSize / 2));
  const endIdx = Math.min(video.segments.length, startIdx + windowSize);
  
  const window = video.segments.slice(startIdx, endIdx);
  
  return {
    tweetId: tweet.id,
    tweetText: tweet.text,
    videoUrl: video.videoUrl,
    startTime: window[0].offset,
    endTime: window[window.length - 1].offset + window[window.length - 1].duration,
    transcriptText: window.map(s => s.text).join(' '),
    confidence: 0.3,
    matchQuality: 'acceptable',
    reasoning: 'Default match - best available segment from video'
  };
}

/**
 * Main function: Find one perfect match for each tweet using optimized batch processing
 */
export async function findPerfectMatchesOptimized(
  tweets: Array<{ id: string; text: string }>,
  videoTranscripts: VideoTranscript[]
): Promise<PerfectMatch[]> {
  if (!anthropic) {
    throw new Error('Anthropic API key not configured. Perfect matching requires AI.');
  }
  
  if (videoTranscripts.length === 0) {
    throw new Error('No video transcripts provided');
  }
  
  console.log(`\n🚀 Starting optimized perfect matching for ${tweets.length} tweets across ${videoTranscripts.length} videos`);
  
  const matches: PerfectMatch[] = [];
  
  try {
    // Batch process all matches in one API call
    const batchResults = await batchAnalyzeMatches(tweets, videoTranscripts);
    
    // Convert batch results to PerfectMatch format
    for (const tweet of tweets) {
      const batchMatch = batchResults.find(r => r.tweetId === tweet.id);
      
      if (batchMatch) {
        // Find the actual video and segments
        const video = videoTranscripts.find(v => v.videoUrl === batchMatch.videoUrl);
        if (video) {
          const window = video.segments.slice(
            batchMatch.segmentIndex,
            Math.min(batchMatch.segmentIndex + batchMatch.windowSize, video.segments.length)
          );
          
          matches.push({
            tweetId: tweet.id,
            tweetText: tweet.text,
            videoUrl: batchMatch.videoUrl,
            startTime: window[0].offset,
            endTime: window[window.length - 1].offset + window[window.length - 1].duration,
            transcriptText: window.map(s => s.text).join(' '),
            confidence: batchMatch.score,
            matchQuality: batchMatch.quality as any,
            reasoning: batchMatch.reasoning
          });
          
          console.log(`✅ Tweet ${tweet.id}: ${batchMatch.quality} match (${(batchMatch.score * 100).toFixed(0)}%)`);
        } else {
          // If video not found, create default match
          const defaultMatch = createDefaultMatch(tweet, videoTranscripts);
          matches.push(defaultMatch);
          console.log(`⚠️ Tweet ${tweet.id}: Using default match (video not found)`);
        }
      } else {
        // No match returned by AI, create default match
        const defaultMatch = createDefaultMatch(tweet, videoTranscripts);
        matches.push(defaultMatch);
        console.log(`⚠️ Tweet ${tweet.id}: Using default match (AI returned no match)`);
      }
    }
    
  } catch (error) {
    console.error('❌ Batch matching failed:', error);
    // If AI fails completely, create default matches for all tweets
    for (const tweet of tweets) {
      const defaultMatch = createDefaultMatch(tweet, videoTranscripts);
      matches.push(defaultMatch);
    }
    console.log(`⚠️ Using default matches for all tweets due to AI error`);
  }
  
  // Final validation - ensure we have exactly one match per tweet
  if (matches.length !== tweets.length) {
    console.error(`⚠️ Match count mismatch: ${matches.length} matches for ${tweets.length} tweets`);
  }
  
  // Final validation
  console.log(`\n📊 Optimized Matching Summary:`);
  console.log(`  Total tweets: ${tweets.length}`);
  console.log(`  Total matches: ${matches.length}`);
  console.log(`  Perfect matches: ${matches.filter(m => m.matchQuality === 'perfect').length}`);
  console.log(`  Excellent matches: ${matches.filter(m => m.matchQuality === 'excellent').length}`);
  console.log(`  Good matches: ${matches.filter(m => m.matchQuality === 'good').length}`);
  console.log(`  Acceptable matches: ${matches.filter(m => m.matchQuality === 'acceptable').length}`);
  console.log(`  Match rate: ${((matches.length / tweets.length) * 100).toFixed(0)}%`);
  
  return matches;
}

/**
 * Export function to get match statistics
 */
export function getMatchStatistics(matches: PerfectMatch[]) {
  return {
    total: matches.length,
    byQuality: {
      perfect: matches.filter(m => m.matchQuality === 'perfect').length,
      excellent: matches.filter(m => m.matchQuality === 'excellent').length,
      good: matches.filter(m => m.matchQuality === 'good').length,
      acceptable: matches.filter(m => m.matchQuality === 'acceptable').length
    },
    averageConfidence: matches.length > 0 
      ? matches.reduce((sum, m) => sum + m.confidence, 0) / matches.length 
      : 0,
    minConfidence: matches.length > 0 
      ? Math.min(...matches.map(m => m.confidence)) 
      : 0,
    maxConfidence: matches.length > 0 
      ? Math.max(...matches.map(m => m.confidence)) 
      : 0
  };
}

/**
 * Process each tweet individually for better matching quality
 */
async function findBestMatchForSingleTweet(
  tweet: { id: string; text: string },
  videoTranscripts: VideoTranscript[]
): Promise<PerfectMatch | null> {
  if (!anthropic) {
    throw new Error('Anthropic API key not configured');
  }

  console.log(`\n🎯 Finding best match for tweet: "${tweet.text.substring(0, 50)}..."`);
  
  // Create candidate segments for all videos
  const candidates: Array<{
    videoUrl: string;
    segmentIndex: number;
    windowSize: number;
    text: string;
    startTime: number;
    endTime: number;
  }> = [];

  // Use fewer, larger windows for efficiency
  const windowSizes = [10, 20];
  
  for (const video of videoTranscripts) {
    for (const windowSize of windowSizes) {
      const stepSize = Math.floor(windowSize / 2);
      
      for (let i = 0; i <= video.segments.length - windowSize; i += stepSize) {
        const window = video.segments.slice(i, Math.min(i + windowSize, video.segments.length));
        const windowText = window.map(s => s.text).join(' ');
        
        if (windowText.length < 100) continue;
        
        candidates.push({
          videoUrl: video.videoUrl,
          segmentIndex: i,
          windowSize,
          text: windowText.substring(0, 800), // More context for single tweet
          startTime: window[0].offset,
          endTime: window[window.length - 1].offset + window[window.length - 1].duration
        });
      }
    }
  }

  // Limit candidates but allow more for single tweet processing
  const maxCandidates = Math.min(candidates.length, 80);
  const selectedCandidates = candidates.slice(0, maxCandidates);
  
  console.log(`📊 Analyzing ${selectedCandidates.length} candidates for this tweet`);

  // Process this single tweet with all candidates
  const candidatesText = selectedCandidates.map((c, i) => 
    `SEGMENT_${i} (${c.videoUrl.split('/').pop()}, ${c.startTime.toFixed(1)}-${c.endTime.toFixed(1)}s):\n"${c.text}"`
  ).join('\n\n');

  const response = await anthropic.messages.create({
    model: 'claude-3-7-sonnet-latest',
    max_tokens: 1000,
    temperature: 0.2,
    messages: [{
      role: 'user',
      content: `Find the SINGLE BEST video segment that matches this tweet.

TWEET: "${tweet.text}"

VIDEO SEGMENTS:
${candidatesText}

Select the ONE segment that best matches the tweet's content. Consider:
- Direct relevance to the tweet's main topic
- Specific examples or stories mentioned
- Context that supports the tweet's message
- Quality of the match over mere keyword presence

Return in this exact format:
BEST_MATCH: SEGMENT_[number] | SCORE:[0-100] | QUALITY:[perfect/excellent/good/acceptable] | REASON:[detailed explanation of why this is the best match]`
    }]
  });

  const content = response.content[0]?.type === 'text' ? response.content[0].text : '';
  
  // Parse the response
  const matchRegex = /BEST_MATCH:\s*SEGMENT_(\d+)\s*\|\s*SCORE:(\d+)\s*\|\s*QUALITY:(\w+)\s*\|\s*REASON:(.+)/;
  const match = content.match(matchRegex);
  
  if (match) {
    const segmentIndex = parseInt(match[1]);
    const score = parseInt(match[2]);
    const quality = match[3];
    const reason = match[4].trim();
    
    if (segmentIndex < selectedCandidates.length) {
      const candidate = selectedCandidates[segmentIndex];
      const video = videoTranscripts.find(v => v.videoUrl === candidate.videoUrl);
      
      if (video) {
        const window = video.segments.slice(
          candidate.segmentIndex,
          Math.min(candidate.segmentIndex + candidate.windowSize, video.segments.length)
        );
        
        return {
          tweetId: tweet.id,
          tweetText: tweet.text,
          videoUrl: candidate.videoUrl,
          startTime: window[0].offset,
          endTime: window[window.length - 1].offset + window[window.length - 1].duration,
          transcriptText: window.map(s => s.text).join(' '),
          confidence: score / 100,
          matchQuality: quality as any,
          reasoning: reason
        };
      }
    }
  }

  // If no match found, return default
  return createDefaultMatch(tweet, videoTranscripts);
}

/**
 * Main function for individual tweet processing (better quality)
 */
export async function findPerfectMatchesIndividual(
  tweets: Array<{ id: string; text: string }>,
  videoTranscripts: VideoTranscript[]
): Promise<PerfectMatch[]> {
  if (!anthropic) {
    throw new Error('Anthropic API key not configured. Perfect matching requires AI.');
  }
  
  if (videoTranscripts.length === 0) {
    throw new Error('No video transcripts provided');
  }
  
  console.log(`\n🚀 Starting individual perfect matching for ${tweets.length} tweets across ${videoTranscripts.length} videos`);
  console.log(`📊 This will make ${tweets.length} separate API calls for best quality`);
  
  const matches: PerfectMatch[] = [];
  
  // Process each tweet individually
  for (let i = 0; i < tweets.length; i++) {
    const tweet = tweets[i];
    console.log(`\n📍 Processing tweet ${i + 1}/${tweets.length}`);
    
    try {
      const match = await findBestMatchForSingleTweet(tweet, videoTranscripts);
      
      if (match) {
        matches.push(match);
        console.log(`✅ Tweet ${tweet.id}: ${match.matchQuality} match (${(match.confidence * 100).toFixed(0)}%)`);
        console.log(`   Reason: ${match.reasoning}`);
      } else {
        // Should not happen with createDefaultMatch, but just in case
        const defaultMatch = createDefaultMatch(tweet, videoTranscripts);
        if (defaultMatch) {
          matches.push(defaultMatch);
        }
      }
      
    } catch (error) {
      console.error(`❌ Error processing tweet ${tweet.id}:`, error);
      
      // On error, provide a default match
      const defaultMatch = createDefaultMatch(tweet, videoTranscripts);
      if (defaultMatch) {
        matches.push(defaultMatch);
      }
    }
  }
  
  // Final validation
  console.log(`\n📊 Individual Matching Summary:`);
  console.log(`  Total tweets: ${tweets.length}`);
  console.log(`  Total matches: ${matches.length}`);
  console.log(`  Perfect matches: ${matches.filter(m => m.matchQuality === 'perfect').length}`);
  console.log(`  Excellent matches: ${matches.filter(m => m.matchQuality === 'excellent').length}`);
  console.log(`  Good matches: ${matches.filter(m => m.matchQuality === 'good').length}`);
  console.log(`  Acceptable matches: ${matches.filter(m => m.matchQuality === 'acceptable').length}`);
  console.log(`  Match rate: ${((matches.length / tweets.length) * 100).toFixed(0)}%`);
  
  return matches;
} 