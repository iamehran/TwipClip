import { Anthropic } from '@anthropic-ai/sdk';
import { TranscriptSegment } from './enhanced-transcripts';
import { ModelSettings } from './perfect-matching-optimized';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || ''
});

export interface ContextualMatch {
  tweetId: string;
  tweetText: string;
  tweetContext: string; // What the tweet is really about
  videoUrl: string;
  startTime: number;
  endTime: number;
  transcriptText: string;
  videoContext: string; // What's being discussed in this segment
  confidence: number;
  matchQuality: 'perfect' | 'excellent' | 'good' | 'acceptable';
  reasoning: string;
}

interface VideoTranscript {
  videoUrl: string;
  segments: TranscriptSegment[];
  duration: number;
}

interface TweetAnalysis {
  id: string;
  text: string;
  mainTopic: string;
  keyPoints: string[];
  lookingFor: string;
  relatedTweetIds: string[];
}

/**
 * Analyze all tweets to understand their context and relationships
 */
async function analyzeTweetsContext(
  tweets: Array<{ id: string; text: string }>,
  modelSettings?: ModelSettings
): Promise<TweetAnalysis[]> {
  const model = modelSettings?.model || 'claude-3-7-sonnet-latest';
  
  const prompt = `Analyze this Twitter/X thread to understand what each tweet is really about and how they relate to each other.

THREAD:
${tweets.map((t, i) => `TWEET_${i} (${t.id}): "${t.text}"`).join('\n\n')}

For each tweet, provide:
1. The main topic/theme
2. Key points being made
3. What kind of video content would best illustrate this tweet
4. Which other tweets in the thread are related

Format your response as JSON:
[
  {
    "id": "tweet-1",
    "mainTopic": "...",
    "keyPoints": ["point1", "point2"],
    "lookingFor": "specific type of video content needed",
    "relatedTweetIds": ["tweet-2", "tweet-3"]
  },
  ...
]`;

  const response = await anthropic.messages.create({
    model,
    max_tokens: 2000,
    temperature: 0.3,
    messages: [{
      role: 'user',
      content: prompt
    }]
  });

  const content = response.content[0]?.type === 'text' ? response.content[0].text : '';
  
  try {
    // Extract JSON from response
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const analyses = JSON.parse(jsonMatch[0]);
      return tweets.map((tweet, i) => ({
        ...tweet,
        ...analyses[i],
        id: tweet.id // Ensure we keep the original ID
      }));
    }
  } catch (error) {
    console.error('Failed to parse tweet analysis:', error);
  }

  // Fallback to basic analysis
  return tweets.map(tweet => ({
    id: tweet.id,
    text: tweet.text,
    mainTopic: tweet.text.substring(0, 50),
    keyPoints: [tweet.text],
    lookingFor: 'relevant video content',
    relatedTweetIds: []
  }));
}

/**
 * Analyze video segments to understand their context
 */
async function analyzeVideoContext(
  videoUrl: string,
  segments: TranscriptSegment[],
  windowSize: number = 15,
  modelSettings?: ModelSettings
): Promise<Map<string, string>> {
  const model = modelSettings?.model || 'claude-3-7-sonnet-latest';
  const contextMap = new Map<string, string>();
  
  // Create windows of segments for context analysis
  const windows: Array<{ startIdx: number; endIdx: number; text: string }> = [];
  const stepSize = Math.floor(windowSize / 2);
  
  for (let i = 0; i <= segments.length - windowSize; i += stepSize) {
    const window = segments.slice(i, Math.min(i + windowSize, segments.length));
    const windowText = window.map(s => s.text).join(' ');
    
    if (windowText.length > 100) {
      windows.push({
        startIdx: i,
        endIdx: Math.min(i + windowSize, segments.length),
        text: windowText.substring(0, 1000)
      });
    }
  }
  
  // Batch analyze windows
  const batchSize = 10;
  for (let i = 0; i < windows.length; i += batchSize) {
    const batch = windows.slice(i, i + batchSize);
    
    const prompt = `Analyze these video transcript segments and describe what's being discussed in each one.

${batch.map((w, idx) => `SEGMENT_${idx} (${w.startIdx}-${w.endIdx}): "${w.text}"`).join('\n\n')}

For each segment, provide a brief description of:
1. The main topic being discussed
2. Key points or examples mentioned
3. The overall context

Format as:
SEGMENT_0: [description]
SEGMENT_1: [description]
...`;

    try {
      const response = await anthropic.messages.create({
        model,
        max_tokens: 1500,
        temperature: 0.3,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      const content = response.content[0]?.type === 'text' ? response.content[0].text : '';
      
      // Parse responses
      const lines = content.split('\n');
      for (const line of lines) {
        const match = line.match(/SEGMENT_(\d+):\s*(.+)/);
        if (match) {
          const segmentIdx = parseInt(match[1]);
          const description = match[2].trim();
          
          if (segmentIdx < batch.length) {
            const window = batch[segmentIdx];
            const key = `${window.startIdx}-${window.endIdx}`;
            contextMap.set(key, description);
          }
        }
      }
    } catch (error) {
      console.error('Error analyzing video context:', error);
    }
  }
  
  return contextMap;
}

/**
 * Find contextually aware matches ensuring no duplicates
 */
export async function findContextAwareMatches(
  tweets: Array<{ id: string; text: string }>,
  videoTranscripts: VideoTranscript[],
  modelSettings?: ModelSettings
): Promise<ContextualMatch[]> {
  console.log('\n🧠 Starting context-aware matching...');
  
  // Step 1: Analyze tweet contexts
  console.log('📝 Analyzing tweet contexts and relationships...');
  const tweetAnalyses = await analyzeTweetsContext(tweets, modelSettings);
  
  // Step 2: Analyze video contexts
  console.log('🎥 Analyzing video contexts...');
  const videoContextMaps = new Map<string, Map<string, string>>();
  
  for (const video of videoTranscripts) {
    console.log(`  Analyzing ${video.videoUrl}...`);
    const contextMap = await analyzeVideoContext(
      video.videoUrl, 
      video.segments, 
      15, 
      modelSettings
    );
    videoContextMaps.set(video.videoUrl, contextMap);
  }
  
  // Step 3: Find matches with context awareness
  console.log('🎯 Finding context-aware matches...');
  const matches: ContextualMatch[] = [];
  const usedRanges = new Map<string, Array<{ start: number; end: number }>>();
  
  // Initialize used ranges map
  for (const video of videoTranscripts) {
    usedRanges.set(video.videoUrl, []);
  }
  
  // Process tweets by importance (those with fewer related tweets first)
  const sortedAnalyses = [...tweetAnalyses].sort((a, b) => 
    a.relatedTweetIds.length - b.relatedTweetIds.length
  );
  
  for (const tweetAnalysis of sortedAnalyses) {
    console.log(`\n🔍 Finding match for: "${tweetAnalysis.text.substring(0, 50)}..."`);
    console.log(`   Looking for: ${tweetAnalysis.lookingFor}`);
    
    let bestMatch: ContextualMatch | null = null;
    let bestScore = 0;
    
    // Evaluate all possible segments across all videos
    for (const video of videoTranscripts) {
      const videoUsedRanges = usedRanges.get(video.videoUrl) || [];
      const videoContextMap = videoContextMaps.get(video.videoUrl) || new Map();
      
      // Try different window sizes
      const windowSizes = [10, 15, 20];
      
      for (const windowSize of windowSizes) {
        const stepSize = Math.floor(windowSize / 3);
        
        for (let i = 0; i <= video.segments.length - windowSize; i += stepSize) {
          const startTime = video.segments[i].offset;
          const endIdx = Math.min(i + windowSize, video.segments.length);
          const endTime = video.segments[endIdx - 1].offset + video.segments[endIdx - 1].duration;
          
          // Check if this range overlaps with any used range
          const overlaps = videoUsedRanges.some(range => 
            (startTime >= range.start && startTime < range.end) ||
            (endTime > range.start && endTime <= range.end) ||
            (startTime <= range.start && endTime >= range.end)
          );
          
          if (overlaps) continue;
          
          // Get video context for this segment
          const contextKey = `${i}-${endIdx}`;
          const videoContext = videoContextMap.get(contextKey) || 'General discussion';
          
          // Create candidate match
          const window = video.segments.slice(i, endIdx);
          const transcriptText = window.map(s => s.text).join(' ');
          
          // Evaluate match with context
          const evaluation = await evaluateContextualMatch(
            tweetAnalysis,
            transcriptText,
            videoContext,
            modelSettings
          );
          
          if (evaluation.score > bestScore) {
            bestScore = evaluation.score;
            bestMatch = {
              tweetId: tweetAnalysis.id,
              tweetText: tweetAnalysis.text,
              tweetContext: tweetAnalysis.lookingFor,
              videoUrl: video.videoUrl,
              startTime,
              endTime,
              transcriptText,
              videoContext,
              confidence: evaluation.score,
              matchQuality: evaluation.quality,
              reasoning: evaluation.reasoning
            };
          }
        }
      }
    }
    
    // Add the best match and mark the range as used
    if (bestMatch && bestMatch.confidence >= 0.75) {  // Only accept matches with 75% or higher confidence
      matches.push(bestMatch);
      
      // Mark this range as used with a buffer to prevent nearby selections
      const buffer = 10; // 10 second buffer on each side
      const videoUsedRanges = usedRanges.get(bestMatch.videoUrl) || [];
      videoUsedRanges.push({
        start: Math.max(0, bestMatch.startTime - buffer),
        end: bestMatch.endTime + buffer
      });
      
      console.log(`✅ Found ${bestMatch.matchQuality} match (${(bestMatch.confidence * 100).toFixed(0)}%)`);
      console.log(`   Video: ${bestMatch.videoUrl.split('/').pop()}`);
      console.log(`   Time: ${bestMatch.startTime.toFixed(1)}-${bestMatch.endTime.toFixed(1)}s`);
      console.log(`   Context: ${bestMatch.videoContext.substring(0, 100)}...`);
      console.log(`   Reason: ${bestMatch.reasoning}`);
    } else if (bestMatch) {
      console.log(`⚠️ Match found but confidence too low: ${(bestMatch.confidence * 100).toFixed(0)}% (minimum: 75%)`);
      console.log(`   Tweet: "${tweetAnalysis.text.substring(0, 50)}..."`);
    } else {
      console.log(`⚠️ No suitable match found for tweet ${tweetAnalysis.id}`);
    }
  }
  
  return matches;
}

/**
 * Evaluate how well a video segment matches a tweet with context
 */
async function evaluateContextualMatch(
  tweetAnalysis: TweetAnalysis,
  transcriptText: string,
  videoContext: string,
  modelSettings?: ModelSettings
): Promise<{ score: number; quality: 'perfect' | 'excellent' | 'good' | 'acceptable'; reasoning: string }> {
  const model = modelSettings?.model || 'claude-3-7-sonnet-latest';
  
  const prompt = `Evaluate how well this video segment matches the tweet's needs.

TWEET: "${tweetAnalysis.text}"
TWEET IS LOOKING FOR: ${tweetAnalysis.lookingFor}
KEY POINTS: ${tweetAnalysis.keyPoints.join(', ')}

VIDEO SEGMENT CONTEXT: ${videoContext}
VIDEO SEGMENT TEXT: "${transcriptText.substring(0, 800)}..."

Rate this match on a scale of 0-100 and explain why. Consider:
1. Does the video segment directly address what the tweet is looking for?
2. Are the key points from the tweet reflected in the video?
3. Is the context and tone appropriate?
4. Would this segment effectively illustrate or support the tweet?

Respond in format:
SCORE: [0-100]
QUALITY: [perfect/excellent/good/acceptable]
REASONING: [detailed explanation]`;

  try {
    const response = await anthropic.messages.create({
      model,
      max_tokens: 500,
      temperature: 0.2,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });

    const content = response.content[0]?.type === 'text' ? response.content[0].text : '';
    
    // Parse response
    const scoreMatch = content.match(/SCORE:\s*(\d+)/);
    const qualityMatch = content.match(/QUALITY:\s*(\w+)/);
    const reasoningMatch = content.match(/REASONING:\s*(.+)/s);
    
    if (scoreMatch && qualityMatch && reasoningMatch) {
      return {
        score: parseInt(scoreMatch[1]) / 100,
        quality: qualityMatch[1] as any,
        reasoning: reasoningMatch[1].trim()
      };
    }
  } catch (error) {
    console.error('Error evaluating match:', error);
  }
  
  // Default low score
  return {
    score: 0.3,
    quality: 'acceptable',
    reasoning: 'Could not properly evaluate match'
  };
} 