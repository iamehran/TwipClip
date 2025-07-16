import { Anthropic } from '@anthropic-ai/sdk';
import { TranscriptSegment } from './enhanced-transcripts';
import { ModelSettings } from './perfect-matching-optimized';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || ''
});

// Simple in-memory cache for batch results
const matchCache = new Map<string, ContextualMatch[]>();

function getCacheKey(tweets: Array<{ id: string; text: string }>, videoUrls: string[]): string {
  const tweetKey = tweets.map(t => t.text).join('|');
  const videoKey = videoUrls.sort().join('|');
  return `${tweetKey}::${videoKey}`;
}

export interface ContextualMatch {
  tweetId: string;
  tweetText: string;
  tweetContext: string;
  videoUrl: string;
  startTime: number;
  endTime: number;
  transcriptText: string;
  videoContext: string;
  confidence: number;
  matchQuality: 'perfect' | 'excellent' | 'good' | 'acceptable';
  reasoning: string;
}

interface VideoTranscript {
  videoUrl: string;
  segments: TranscriptSegment[];
  duration: number;
}

/**
 * Fast context-aware matching with batch processing
 * Reduces AI calls by evaluating multiple candidates at once
 */
export async function findContextAwareMatchesFast(
  tweets: Array<{ id: string; text: string }>,
  videoTranscripts: VideoTranscript[],
  modelSettings?: ModelSettings
): Promise<ContextualMatch[]> {
  console.log('\n Starting FAST context-aware matching...');
  
  const model = modelSettings?.model === 'claude-4-opus' ? 'claude-opus-4-20250514' : 'claude-sonnet-4-20250514';
  const matches: ContextualMatch[] = [];
  const usedRanges = new Map<string, Array<{ start: number; end: number }>>();
  
  // Initialize used ranges
  for (const video of videoTranscripts) {
    usedRanges.set(video.videoUrl, []);
  }
  
  // Pre-process all videos to create candidate segments
  console.log(' Pre-processing video segments...');
  const allCandidates: Array<{
    videoUrl: string;
    startTime: number;
    endTime: number;
    text: string;
    segments: TranscriptSegment[];
  }> = [];
  
  for (const video of videoTranscripts) {
    // Use larger windows for faster processing
    const windowSize = 15;
    const stepSize = 5;
    
    for (let i = 0; i <= video.segments.length - windowSize; i += stepSize) {
      const endIdx = Math.min(i + windowSize, video.segments.length);
      const window = video.segments.slice(i, endIdx);
      const text = window.map(s => s.text).join(' ');
      
      if (text.length > 200) { // Only consider substantial segments
        allCandidates.push({
          videoUrl: video.videoUrl,
          startTime: window[0].offset,
          endTime: window[window.length - 1].offset + window[window.length - 1].duration,
          text: text.substring(0, 1000), // Limit text length
          segments: window
        });
      }
    }
  }
  
  console.log(` Created ${allCandidates.length} candidate segments`);
  
  // Process all tweets in a single batch
  const batchPrompt = `You are matching tweets to video segments. For each tweet, select the BEST matching video segment that would illustrate or support the tweet's content.

TWEETS TO MATCH:
${tweets.map((t, i) => `TWEET_${i} (${t.id}): "${t.text}"`).join('\n')}

VIDEO SEGMENTS AVAILABLE:
${allCandidates.map((c, i) => `SEGMENT_${i}: [${c.videoUrl.split('/').pop()}, ${c.startTime.toFixed(1)}-${c.endTime.toFixed(1)}s] "${c.text.substring(0, 300)}..."`).join('\n')}

For each tweet, select the ONE best matching segment. Consider:
1. Direct relevance to the tweet's main point
2. Context and tone alignment
3. Whether the segment would effectively illustrate the tweet

Return ONLY a JSON array with one match per tweet:
[
  {
    "tweetIndex": 0,
    "segmentIndex": 5,
    "confidence": 0.85,
    "quality": "excellent",
    "reasoning": "This segment directly discusses..."
  },
  ...
]

IMPORTANT: 
- Each tweet MUST have exactly ONE match
- Each segment can only be used ONCE
- Only include matches with confidence >= 0.75
- If no good match exists for a tweet, set segmentIndex to -1`;

  try {
    const response = await anthropic.messages.create({
      model,
      max_tokens: 4000,
      temperature: 0.3,
      messages: [{
        role: 'user',
        content: batchPrompt
      }]
    });

    const content = response.content[0]?.type === 'text' ? response.content[0].text : '';
    
    // Parse response
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const batchResults = JSON.parse(jsonMatch[0]);
      const usedSegmentIndices = new Set<number>();
      
      for (const result of batchResults) {
        if (result.segmentIndex >= 0 && 
            result.confidence >= 0.75 && 
            !usedSegmentIndices.has(result.segmentIndex)) {
          
          const tweet = tweets[result.tweetIndex];
          const candidate = allCandidates[result.segmentIndex];
          
          // Check if this range overlaps with used ranges
          const videoUsedRanges = usedRanges.get(candidate.videoUrl) || [];
          const overlaps = videoUsedRanges.some(range => 
            (candidate.startTime >= range.start && candidate.startTime < range.end) ||
            (candidate.endTime > range.start && candidate.endTime <= range.end)
          );
          
          if (!overlaps) {
            matches.push({
              tweetId: tweet.id,
              tweetText: tweet.text,
              tweetContext: result.reasoning.substring(0, 100),
              videoUrl: candidate.videoUrl,
              startTime: candidate.startTime,
              endTime: candidate.endTime,
              transcriptText: candidate.text,
              videoContext: result.reasoning,
              confidence: result.confidence,
              matchQuality: result.quality as any,
              reasoning: result.reasoning
            });
            
            // Mark as used
            usedSegmentIndices.add(result.segmentIndex);
            videoUsedRanges.push({
              start: Math.max(0, candidate.startTime - 10),
              end: candidate.endTime + 10
            });
            
            console.log(` Matched tweet ${tweet.id} to segment ${result.segmentIndex} (${(result.confidence * 100).toFixed(0)}%)`);
          }
        }
      }
    }
  } catch (error) {
    console.error('Error in batch matching:', error);
    // Fall back to simpler matching if batch fails
    return fallbackMatching(tweets, videoTranscripts, modelSettings);
  }
  
  console.log(`\n Found ${matches.length} high-quality matches`);
  return matches;
}

/**
 * Fallback to simpler matching if batch processing fails
 */
async function fallbackMatching(
  tweets: Array<{ id: string; text: string }>,
  videoTranscripts: VideoTranscript[],
  modelSettings?: ModelSettings
): Promise<ContextualMatch[]> {
  console.log(' Using fallback fast matching...');
  
  const matches: ContextualMatch[] = [];
  const usedRanges = new Map<string, Array<{ start: number; end: number }>>();
  
  for (const video of videoTranscripts) {
    usedRanges.set(video.videoUrl, []);
  }
  
  // Simple semantic matching without multiple AI calls
  for (const tweet of tweets) {
    let bestMatch: ContextualMatch | null = null;
    let bestScore = 0;
    
    for (const video of videoTranscripts) {
      const videoUsedRanges = usedRanges.get(video.videoUrl) || [];
      
      // Check 15-second windows
      const windowSize = 15;
      for (let i = 0; i <= video.segments.length - windowSize; i += 5) {
        const window = video.segments.slice(i, i + windowSize);
        const startTime = window[0].offset;
        const endTime = window[window.length - 1].offset + window[window.length - 1].duration;
        
        // Check overlap
        const overlaps = videoUsedRanges.some(range => 
          (startTime >= range.start && startTime < range.end) ||
          (endTime > range.start && endTime <= range.end)
        );
        
        if (overlaps) continue;
        
        const transcriptText = window.map(s => s.text).join(' ');
        
        // Simple keyword matching for speed
        const tweetWords = tweet.text.toLowerCase().split(/\s+/);
        const transcriptWords = transcriptText.toLowerCase().split(/\s+/);
        const commonWords = tweetWords.filter(word => 
          word.length > 4 && transcriptWords.includes(word)
        );
        
        const score = commonWords.length / Math.max(tweetWords.length, 1);
        
        if (score > bestScore) {
          bestScore = score;
          bestMatch = {
            tweetId: tweet.id,
            tweetText: tweet.text,
            tweetContext: 'Fast semantic match',
            videoUrl: video.videoUrl,
            startTime,
            endTime,
            transcriptText,
            videoContext: 'Video segment',
            confidence: Math.min(score * 2, 0.95), // Scale up but cap at 95%
            matchQuality: score > 0.4 ? 'good' : 'acceptable',
            reasoning: `Found ${commonWords.length} matching key terms`
          };
        }
      }
    }
    
    if (bestMatch && bestMatch.confidence >= 0.75) {
      matches.push(bestMatch);
      
      const videoUsedRanges = usedRanges.get(bestMatch.videoUrl) || [];
      videoUsedRanges.push({
        start: Math.max(0, bestMatch.startTime - 10),
        end: bestMatch.endTime + 10
      });
    }
  }
  
  return matches;
}
