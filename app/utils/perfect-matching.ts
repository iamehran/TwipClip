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

interface TweetAnalysis {
  mainTopic: string;
  keyPhrases: string[];
  searchIntent: string;
  expectedContent: string;
  contextClues: string[];
}

/**
 * Analyze tweet to understand what we're looking for
 */
async function analyzeTweet(tweetText: string): Promise<TweetAnalysis> {
  if (!anthropic) {
    throw new Error('Anthropic API key not configured');
  }

  const response = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 400,
    temperature: 0.2,
    messages: [{
      role: 'user',
      content: `Analyze this tweet to understand what video content would be most valuable:

Tweet: "${tweetText}"

Provide a structured analysis:
MAIN_TOPIC: [The primary subject in 3-5 words]
KEY_PHRASES: [3-5 most important phrases/concepts, comma-separated]
SEARCH_INTENT: [What the tweet author is trying to communicate]
EXPECTED_CONTENT: [What video content would best support this tweet]
CONTEXT_CLUES: [Any specific details, names, events, or references to look for]

Be specific and actionable.`
    }]
  });

  const content = response.content[0]?.text || '';
  
  return {
    mainTopic: content.match(/MAIN_TOPIC:\s*(.+?)(?=\n|$)/)?.[1]?.trim() || '',
    keyPhrases: content.match(/KEY_PHRASES:\s*(.+?)(?=\n|$)/)?.[1]?.split(',').map(s => s.trim()) || [],
    searchIntent: content.match(/SEARCH_INTENT:\s*(.+?)(?=\n|$)/)?.[1]?.trim() || '',
    expectedContent: content.match(/EXPECTED_CONTENT:\s*(.+?)(?=\n|$)/)?.[1]?.trim() || '',
    contextClues: content.match(/CONTEXT_CLUES:\s*(.+?)(?=\n|$)/)?.[1]?.split(',').map(s => s.trim()) || []
  };
}

/**
 * Score a video segment against tweet requirements
 */
async function scoreSegment(
  segment: { text: string; startTime: number; endTime: number },
  tweetAnalysis: TweetAnalysis,
  tweetText: string
): Promise<{ score: number; reasoning: string; quality: string }> {
  if (!anthropic) {
    throw new Error('Anthropic API key not configured');
  }

  const response = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 300,
    temperature: 0.2,
    messages: [{
      role: 'user',
      content: `Score how well this video segment matches the tweet's needs:

TWEET: "${tweetText}"
TWEET ANALYSIS:
- Main Topic: ${tweetAnalysis.mainTopic}
- Looking For: ${tweetAnalysis.expectedContent}
- Key Phrases: ${tweetAnalysis.keyPhrases.join(', ')}

VIDEO SEGMENT (${(segment.endTime - segment.startTime).toFixed(1)}s):
"${segment.text}"

Score this match:
RELEVANCE_SCORE: [0-100, how well it addresses the tweet's topic]
INFORMATION_VALUE: [0-100, how much value it adds]
CONTEXT_MATCH: [0-100, how well it fits the tweet's context]
OVERALL_SCORE: [0-100, weighted average]
QUALITY: [perfect|excellent|good|acceptable|poor]
REASONING: [One sentence explaining why this is or isn't a good match]

Be strict but fair. Only give high scores to truly relevant content.`
    }]
  });

  const content = response.content[0]?.text || '';
  
  const overallScore = parseInt(content.match(/OVERALL_SCORE:\s*(\d+)/)?.[1] || '0');
  const quality = content.match(/QUALITY:\s*(\w+)/)?.[1] || 'poor';
  const reasoning = content.match(/REASONING:\s*(.+?)(?=\n|$)/)?.[1]?.trim() || '';

  return {
    score: overallScore / 100,
    reasoning,
    quality
  };
}

/**
 * Find the single best match for a tweet across all videos
 */
async function findBestMatchForTweet(
  tweetText: string,
  tweetId: string,
  videoTranscripts: VideoTranscript[]
): Promise<PerfectMatch | null> {
  console.log(`\n🎯 Finding perfect match for tweet: "${tweetText.substring(0, 50)}..."`);
  
  // Step 1: Analyze the tweet
  const tweetAnalysis = await analyzeTweet(tweetText);
  console.log(`📊 Tweet analysis: ${tweetAnalysis.mainTopic} | ${tweetAnalysis.expectedContent}`);
  
  let bestMatch: PerfectMatch | null = null;
  let bestScore = 0;
  
  // Step 2: Search each video for the best segment
  for (const video of videoTranscripts) {
    console.log(`🔍 Searching video: ${video.videoUrl}`);
    
    // Use sliding windows of different sizes for comprehensive coverage
    const windowSizes = [5, 10, 15]; // Different context sizes
    
    for (const windowSize of windowSizes) {
      const stepSize = Math.max(1, Math.floor(windowSize / 3));
      
      for (let i = 0; i <= video.segments.length - windowSize; i += stepSize) {
        const window = video.segments.slice(i, Math.min(i + windowSize, video.segments.length));
        const windowText = window.map(s => s.text).join(' ');
        
        // Skip very short segments
        if (windowText.length < 50) continue;
        
        // Quick relevance check using key phrases
        const hasRelevantContent = tweetAnalysis.keyPhrases.some(phrase => 
          windowText.toLowerCase().includes(phrase.toLowerCase())
        ) || tweetAnalysis.contextClues.some(clue => 
          windowText.toLowerCase().includes(clue.toLowerCase())
        );
        
        // If no keyword match and window is large, skip detailed analysis
        if (!hasRelevantContent && windowSize > 10) continue;
        
        const segment = {
          text: windowText,
          startTime: window[0].offset,
          endTime: window[window.length - 1].offset + window[window.length - 1].duration
        };
        
        try {
          const { score, reasoning, quality } = await scoreSegment(segment, tweetAnalysis, tweetText);
          
          if (score > bestScore) {
            bestScore = score;
            bestMatch = {
              tweetId,
              tweetText,
              videoUrl: video.videoUrl,
              startTime: segment.startTime,
              endTime: segment.endTime,
              transcriptText: segment.text,
              confidence: score,
              matchQuality: quality as any,
              reasoning
            };
            
            console.log(`  ✅ New best match (${(score * 100).toFixed(0)}%): ${reasoning}`);
            
            // If we find a perfect match, we can stop searching
            if (quality === 'perfect' && score > 0.9) {
              console.log(`  🎯 Perfect match found! Stopping search.`);
              return bestMatch;
            }
          }
        } catch (error) {
          console.warn(`  ⚠️ Error scoring segment:`, error);
        }
      }
    }
  }
  
  // Step 3: Ensure we always return something
  if (!bestMatch && videoTranscripts.length > 0) {
    console.log(`⚠️ No good match found, creating fallback match...`);
    
    // Find the most relevant fallback based on simple keyword matching
    let fallbackMatch: PerfectMatch | null = null;
    let maxKeywordMatches = 0;
    
    for (const video of videoTranscripts) {
      for (let i = 0; i < video.segments.length - 5; i += 3) {
        const window = video.segments.slice(i, i + 10);
        const windowText = window.map(s => s.text).join(' ').toLowerCase();
        
        const keywordMatches = tweetAnalysis.keyPhrases.filter(phrase => 
          windowText.includes(phrase.toLowerCase())
        ).length;
        
        if (keywordMatches > maxKeywordMatches) {
          maxKeywordMatches = keywordMatches;
          fallbackMatch = {
            tweetId,
            tweetText,
            videoUrl: video.videoUrl,
            startTime: window[0].offset,
            endTime: window[window.length - 1].offset + window[window.length - 1].duration,
            transcriptText: window.map(s => s.text).join(' '),
            confidence: 0.3,
            matchQuality: 'acceptable',
            reasoning: `Fallback match based on ${keywordMatches} keyword matches`
          };
        }
      }
    }
    
    // If still no match, just take a relevant portion from the first video
    if (!fallbackMatch && videoTranscripts[0]?.segments.length > 0) {
      const midPoint = Math.floor(videoTranscripts[0].segments.length / 2);
      const window = videoTranscripts[0].segments.slice(
        Math.max(0, midPoint - 5),
        Math.min(videoTranscripts[0].segments.length, midPoint + 5)
      );
      
      fallbackMatch = {
        tweetId,
        tweetText,
        videoUrl: videoTranscripts[0].videoUrl,
        startTime: window[0].offset,
        endTime: window[window.length - 1].offset + window[window.length - 1].duration,
        transcriptText: window.map(s => s.text).join(' '),
        confidence: 0.2,
        matchQuality: 'acceptable',
        reasoning: 'Default match - middle portion of video'
      };
    }
    
    bestMatch = fallbackMatch;
  }
  
  return bestMatch;
}

/**
 * Main function: Find one perfect match for each tweet
 */
export async function findPerfectMatches(
  tweets: Array<{ id: string; text: string }>,
  videoTranscripts: VideoTranscript[]
): Promise<PerfectMatch[]> {
  if (!anthropic) {
    throw new Error('Anthropic API key not configured. Perfect matching requires AI.');
  }
  
  if (videoTranscripts.length === 0) {
    throw new Error('No video transcripts provided');
  }
  
  console.log(`\n🚀 Starting perfect matching for ${tweets.length} tweets across ${videoTranscripts.length} videos`);
  
  const matches: PerfectMatch[] = [];
  
  // Process each tweet
  for (const tweet of tweets) {
    try {
      const match = await findBestMatchForTweet(tweet.text, tweet.id, videoTranscripts);
      
      if (match) {
        matches.push(match);
        console.log(`✅ Tweet ${tweet.id}: ${match.matchQuality} match (${(match.confidence * 100).toFixed(0)}%)`);
      } else {
        console.error(`❌ Tweet ${tweet.id}: No match found (this should not happen)`);
      }
      
    } catch (error) {
      console.error(`❌ Error processing tweet ${tweet.id}:`, error);
      
      // Even on error, provide a fallback match
      if (videoTranscripts[0]?.segments.length > 0) {
        const segments = videoTranscripts[0].segments;
        const midPoint = Math.floor(segments.length / 2);
        const window = segments.slice(
          Math.max(0, midPoint - 5),
          Math.min(segments.length, midPoint + 5)
        );
        
        matches.push({
          tweetId: tweet.id,
          tweetText: tweet.text,
          videoUrl: videoTranscripts[0].videoUrl,
          startTime: window[0].offset,
          endTime: window[window.length - 1].offset + window[window.length - 1].duration,
          transcriptText: window.map(s => s.text).join(' '),
          confidence: 0.1,
          matchQuality: 'acceptable',
          reasoning: 'Error fallback - using middle portion of first video'
        });
      }
    }
  }
  
  // Final validation
  console.log(`\n📊 Matching Summary:`);
  console.log(`  Total tweets: ${tweets.length}`);
  console.log(`  Total matches: ${matches.length}`);
  console.log(`  Perfect matches: ${matches.filter(m => m.matchQuality === 'perfect').length}`);
  console.log(`  Excellent matches: ${matches.filter(m => m.matchQuality === 'excellent').length}`);
  console.log(`  Good matches: ${matches.filter(m => m.matchQuality === 'good').length}`);
  console.log(`  Acceptable matches: ${matches.filter(m => m.matchQuality === 'acceptable').length}`);
  
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
    averageConfidence: matches.reduce((sum, m) => sum + m.confidence, 0) / matches.length,
    minConfidence: Math.min(...matches.map(m => m.confidence)),
    maxConfidence: Math.max(...matches.map(m => m.confidence))
  };
} 