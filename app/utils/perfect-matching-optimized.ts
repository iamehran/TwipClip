import { Anthropic } from '@anthropic-ai/sdk';
import { TranscriptSegment } from './enhanced-transcripts';

const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
}) : null;

export interface ModelSettings {
  model: 'claude-4-opus' | 'claude-4-sonnet';
  thinkingEnabled: boolean;
  tokenUsage: 'low' | 'medium' | 'high';
}

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
  downloadError?: string;
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
 * Get token limits based on model settings
 */
function getTokenLimits(modelSettings?: ModelSettings): { maxTokens: number; maxCandidates: number } {
  const tokenUsage = modelSettings?.tokenUsage || 'medium';
      const model = getApiModelName(modelSettings?.model);
  
  // Base token limits
  let maxTokens = 2000;
  let maxCandidates = 50;
  
  // Adjust based on token usage
  if (tokenUsage === 'low') {
    maxTokens = 1000;
    maxCandidates = 30;
  } else if (tokenUsage === 'high') {
    maxTokens = 4000;
    maxCandidates = 80;
  }
  
  // Opus gets more tokens by default
  if (model === 'claude-opus-4-20250514') {
    maxTokens = Math.floor(maxTokens * 1.5);
  }
  
  return { maxTokens, maxCandidates };
}

/**
 * Get appropriate model name for API calls
 */
function getApiModelName(model?: string): string {
  // Map frontend model names to actual API model names
  switch (model) {
    case 'claude-4-opus':
      return 'claude-opus-4-20250514';
    case 'claude-4-sonnet':
      return 'claude-sonnet-4-20250514';
    default:
      return 'claude-sonnet-4-20250514'; // Default to Sonnet 4
  }
}

/**
 * Batch analyze matches with model settings
 */
async function batchAnalyzeMatches(
  tweets: Array<{ id: string; text: string }>,
  videoTranscripts: VideoTranscript[],
  modelSettings?: ModelSettings
): Promise<BatchMatchResult[]> {
  const startTime = Date.now();
  
  if (!anthropic) {
    throw new Error('Anthropic API key not configured');
  }
  
  const { maxTokens, maxCandidates } = getTokenLimits(modelSettings);
  const model = getApiModelName(modelSettings?.model);
  const useThinking = modelSettings?.thinkingEnabled || false;
  
  // Calculate fair distribution of candidates per video
  const candidatesPerVideo = Math.floor(maxCandidates / videoTranscripts.length);
  const extraCandidates = maxCandidates % videoTranscripts.length;
  
  console.log(`📊 Creating candidate segments from ${videoTranscripts.length} videos...`);
  console.log(`📊 Fair distribution: ~${candidatesPerVideo} candidates per video (total: ${maxCandidates})`);
  
  // Create candidate segments from all videos with fair distribution
  const candidatesByVideo: Map<string, Array<{
    videoUrl: string;
    segmentIndex: number;
    windowSize: number;
    text: string;
    startTime: number;
    endTime: number;
  }>> = new Map();

  // Use fewer, larger windows for efficiency
  const windowSizes = [10, 20]; // Reduced from [5, 10, 15]
  
  // First, create all candidates for each video
  for (const video of videoTranscripts) {
    const videoCandidates: Array<{
      videoUrl: string;
      segmentIndex: number;
      windowSize: number;
      text: string;
      startTime: number;
      endTime: number;
    }> = [];
    
    for (const windowSize of windowSizes) {
      const stepSize = Math.floor(windowSize / 2); // 50% overlap instead of 33%
      
      for (let i = 0; i <= video.segments.length - windowSize; i += stepSize) {
        const window = video.segments.slice(i, Math.min(i + windowSize, video.segments.length));
        const windowText = window.map(s => s.text).join(' ');
        
        // Skip very short segments
        if (windowText.length < 100) continue;
        
        videoCandidates.push({
          videoUrl: video.videoUrl,
          segmentIndex: i,
          windowSize,
          text: windowText.substring(0, 500), // Limit text for API efficiency
          startTime: window[0].offset,
          endTime: window[window.length - 1].offset + window[window.length - 1].duration
        });
      }
    }
    
    candidatesByVideo.set(video.videoUrl, videoCandidates);
  }

  // Now select candidates fairly from each video
  const selectedCandidates: Array<{
    videoUrl: string;
    segmentIndex: number;
    windowSize: number;
    text: string;
    startTime: number;
    endTime: number;
  }> = [];
  
  let videoIndex = 0;
  for (const [videoUrl, videoCandidates] of candidatesByVideo) {
    // Calculate how many candidates this video gets
    let videoQuota = candidatesPerVideo;
    if (videoIndex < extraCandidates) {
      videoQuota += 1; // Distribute extra candidates to first few videos
    }
    
    // For better coverage, try to select candidates evenly distributed throughout the video
    if (videoCandidates.length <= videoQuota) {
      // If we have fewer candidates than quota, take all
      selectedCandidates.push(...videoCandidates);
    } else {
      // Select candidates evenly distributed throughout the video
      const step = videoCandidates.length / videoQuota;
      for (let i = 0; i < videoQuota; i++) {
        const index = Math.floor(i * step);
        selectedCandidates.push(videoCandidates[index]);
      }
    }
    
    console.log(`  Video ${videoIndex + 1}: Selected ${Math.min(videoCandidates.length, videoQuota)} from ${videoCandidates.length} candidates`);
    videoIndex++;
  }

  const candidateCreationTime = Date.now() - startTime;
  console.log(`📊 Selected ${selectedCandidates.length} candidates total in ${candidateCreationTime}ms`);

  // Batch process all tweets and top candidates in a single API call
  const tweetsText = tweets.map((t, i) => `TWEET_${i}: "${t.text}"`).join('\n\n');
  const candidatesText = selectedCandidates.map((c, i) => 
    `SEGMENT_${i} (${c.videoUrl.split('/').pop()}, ${c.startTime.toFixed(1)}-${c.endTime.toFixed(1)}s):\n"${c.text}"`
  ).join('\n\n');

  console.log(`🤖 Sending batch request to ${model}${useThinking ? ' with thinking mode' : ''}...`);
  const apiStartTime = Date.now();

  // Prepare the prompt
  const prompt = `Find the SINGLE BEST video segment for each tweet. Each tweet MUST get exactly ONE match.

TWEETS:
${tweetsText}

VIDEO SEGMENTS:
${candidatesText}

For each tweet, select the ONE segment that best matches its content. Even if the match isn't perfect, choose the most relevant segment available. Return in this exact format:

MATCH_0: SEGMENT_[number] | SCORE:[0-100] | QUALITY:[perfect/excellent/good/acceptable] | REASON:[one line explanation]
MATCH_1: SEGMENT_[number] | SCORE:[0-100] | QUALITY:[perfect/excellent/good/acceptable] | REASON:[one line explanation]
...

IMPORTANT: Every tweet MUST have a match. Choose the best available segment even if the relevance is low.`;

  // Add thinking prefix if enabled
  const systemMessage = useThinking 
    ? "You are an expert at analyzing content and finding the most relevant video segments for tweets. Think step by step about each match before making your decision."
    : undefined;

  const response = await anthropic.messages.create({
    model: model,
    max_tokens: maxTokens,
    temperature: 0.2,
    ...(systemMessage && { system: systemMessage }),
    messages: [{
      role: 'user',
      content: prompt
    }]
  });

  const apiTime = Date.now() - apiStartTime;
  console.log(`✅ ${model} response received in ${apiTime}ms`);

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
  videoTranscripts: VideoTranscript[],
  modelSettings?: ModelSettings
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
    const batchResults = await batchAnalyzeMatches(tweets, videoTranscripts, modelSettings);
    
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
  videoTranscripts: VideoTranscript[],
  modelSettings?: ModelSettings
): Promise<PerfectMatch | null> {
  if (!anthropic) {
    throw new Error('Anthropic API key not configured');
  }

  const { maxTokens, maxCandidates } = getTokenLimits(modelSettings);
  const model = getApiModelName(modelSettings?.model);
  const useThinking = modelSettings?.thinkingEnabled || false;

  console.log(`\n🎯 Finding best match for tweet: "${tweet.text.substring(0, 50)}..."`);
  
  // Calculate fair distribution of candidates per video
  const candidatesPerVideo = Math.floor(maxCandidates / videoTranscripts.length);
  const extraCandidates = maxCandidates % videoTranscripts.length;
  
  // Create candidate segments for all videos with fair distribution
  const candidatesByVideo: Map<string, Array<{
    videoUrl: string;
    segmentIndex: number;
    windowSize: number;
    text: string;
    startTime: number;
    endTime: number;
  }>> = new Map();

  // Use fewer, larger windows for efficiency
  const windowSizes = [10, 20];
  
  // First, create all candidates for each video
  for (const video of videoTranscripts) {
    const videoCandidates: Array<{
      videoUrl: string;
      segmentIndex: number;
      windowSize: number;
      text: string;
      startTime: number;
      endTime: number;
    }> = [];
    
    for (const windowSize of windowSizes) {
      const stepSize = Math.floor(windowSize / 2);
      
      for (let i = 0; i <= video.segments.length - windowSize; i += stepSize) {
        const window = video.segments.slice(i, Math.min(i + windowSize, video.segments.length));
        const windowText = window.map(s => s.text).join(' ');
        
        if (windowText.length < 100) continue;
        
        videoCandidates.push({
          videoUrl: video.videoUrl,
          segmentIndex: i,
          windowSize,
          text: windowText.substring(0, 800), // More context for single tweet
          startTime: window[0].offset,
          endTime: window[window.length - 1].offset + window[window.length - 1].duration
        });
      }
    }
    
    candidatesByVideo.set(video.videoUrl, videoCandidates);
  }

  // Now select candidates fairly from each video
  const selectedCandidates: Array<{
    videoUrl: string;
    segmentIndex: number;
    windowSize: number;
    text: string;
    startTime: number;
    endTime: number;
  }> = [];
  
  let videoIndex = 0;
  for (const [videoUrl, videoCandidates] of candidatesByVideo) {
    // Calculate how many candidates this video gets
    let videoQuota = candidatesPerVideo;
    if (videoIndex < extraCandidates) {
      videoQuota += 1;
    }
    
    // For better coverage, select candidates evenly distributed throughout the video
    if (videoCandidates.length <= videoQuota) {
      selectedCandidates.push(...videoCandidates);
    } else {
      const step = videoCandidates.length / videoQuota;
      for (let i = 0; i < videoQuota; i++) {
        const index = Math.floor(i * step);
        selectedCandidates.push(videoCandidates[index]);
      }
    }
    
    videoIndex++;
  }
  
  console.log(`📊 Analyzing ${selectedCandidates.length} candidates for this tweet (fairly distributed across ${videoTranscripts.length} videos)`);

  // Process this single tweet with all candidates
  const candidatesText = selectedCandidates.map((c, i) => 
    `SEGMENT_${i} (${c.videoUrl.split('/').pop()}, ${c.startTime.toFixed(1)}-${c.endTime.toFixed(1)}s):\n"${c.text}"`
  ).join('\n\n');

  // Prepare the prompt
  const prompt = `Find the SINGLE BEST video segment that matches this tweet.

TWEET: "${tweet.text}"

VIDEO SEGMENTS:
${candidatesText}

Select the ONE segment that best matches the tweet's content. Consider:
- Direct relevance to the tweet's main topic
- Specific examples or stories mentioned
- Context that supports the tweet's message
- Quality of the match over mere keyword presence

Return in this exact format:
BEST_MATCH: SEGMENT_[number] | SCORE:[0-100] | QUALITY:[perfect/excellent/good/acceptable] | REASON:[detailed explanation of why this is the best match]`;

  // Add thinking prefix if enabled
  const systemMessage = useThinking 
    ? "You are an expert at analyzing content and finding the most relevant video segments for tweets. Think carefully about the tweet's meaning and find the segment that best supports or illustrates its message."
    : undefined;

  const response = await anthropic.messages.create({
    model: model,
    max_tokens: Math.floor(maxTokens / 2), // Less tokens needed for single tweet
    temperature: 0.2,
    ...(systemMessage && { system: systemMessage }),
    messages: [{
      role: 'user',
      content: prompt
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
  videoTranscripts: VideoTranscript[],
  modelSettings?: ModelSettings
): Promise<PerfectMatch[]> {
  if (!anthropic) {
    throw new Error('Anthropic API key not configured. Perfect matching requires AI.');
  }
  
  if (videoTranscripts.length === 0) {
    throw new Error('No video transcripts provided');
  }
  
  const model = getApiModelName(modelSettings?.model);
  
  console.log(`\n🚀 Starting individual perfect matching for ${tweets.length} tweets across ${videoTranscripts.length} videos`);
  console.log(`📊 Using model: ${model}`);
  console.log(`📊 This will make ${tweets.length} separate API calls for best quality`);
  
  const matches: PerfectMatch[] = [];
  const usedSegments = new Set<string>(); // Track used segments to avoid duplicates
  
  // Process each tweet individually
  for (let i = 0; i < tweets.length; i++) {
    const tweet = tweets[i];
    console.log(`\n📍 Processing tweet ${i + 1}/${tweets.length}`);
    
    try {
      let match = await findBestMatchForSingleTweet(tweet, videoTranscripts, modelSettings);
      
      if (match) {
        // Check if this segment has already been used
        const segmentKey = `${match.videoUrl}-${match.startTime}-${match.endTime}`;
        
        if (usedSegments.has(segmentKey)) {
          console.log(`⚠️ Segment already used, finding alternative...`);
          
          // Try to find an alternative match by shifting the time window
          const video = videoTranscripts.find(v => v.videoUrl === match!.videoUrl);
          if (video) {
            // Try segments before and after the original match
            const alternatives = [];
            
            // Try 30 seconds before
            if (match.startTime >= 30) {
              alternatives.push({
                ...match,
                startTime: match.startTime - 30,
                endTime: match.endTime - 30
              });
            }
            
            // Try 30 seconds after
            if (match.endTime + 30 <= video.duration) {
              alternatives.push({
                ...match,
                startTime: match.startTime + 30,
                endTime: match.endTime + 30
              });
            }
            
            // Find the first unused alternative
            for (const alt of alternatives) {
              const altKey = `${alt.videoUrl}-${alt.startTime}-${alt.endTime}`;
              if (!usedSegments.has(altKey)) {
                match = alt;
                console.log(`✅ Found alternative segment: ${alt.startTime}-${alt.endTime}`);
                break;
              }
            }
          }
        }
        
        // Mark this segment as used
        const finalSegmentKey = `${match.videoUrl}-${match.startTime}-${match.endTime}`;
        usedSegments.add(finalSegmentKey);
        
        matches.push(match);
        console.log(`✅ Tweet ${tweet.id}: ${match.matchQuality} match (${(match.confidence * 100).toFixed(0)}%)`);
        console.log(`   Video: ${match.videoUrl.split('/').pop()}, Time: ${match.startTime}-${match.endTime}`);
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
  console.log(`  Unique segments: ${usedSegments.size}`);
  console.log(`  Perfect matches: ${matches.filter(m => m.matchQuality === 'perfect').length}`);
  console.log(`  Excellent matches: ${matches.filter(m => m.matchQuality === 'excellent').length}`);
  console.log(`  Good matches: ${matches.filter(m => m.matchQuality === 'good').length}`);
  console.log(`  Acceptable matches: ${matches.filter(m => m.matchQuality === 'acceptable').length}`);
  console.log(`  Match rate: ${((matches.length / tweets.length) * 100).toFixed(0)}%`);
  
  return matches;
}