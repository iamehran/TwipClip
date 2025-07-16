import Anthropic from '@anthropic-ai/sdk';

// Initialize Anthropic client for Claude
const anthropic = process.env.ANTHROPIC_API_KEY 
  ? new Anthropic({ 
      apiKey: process.env.ANTHROPIC_API_KEY,
    }) 
  : null;

interface TranscriptSegment {
  text: string;
  offset: number;
  duration: number;
}

interface MatchResult {
  startTime: number;
  endTime: number;
  text: string;
  score: number;
  confidence: number;
  reasoning: string;
  method: 'ai';
}

/**
 * Pure AI-driven matching using Claude Sonnet
 * No keywords, no complex strategies - just AI understanding
 */
export async function findAIMatchingSegments(
  transcript: TranscriptSegment[], 
  tweetText: string, 
  windowSize: number = 12
): Promise<MatchResult[]> {
  if (!anthropic) {
    throw new Error('Anthropic API key not configured. Please set ANTHROPIC_API_KEY in your environment.');
  }
  
  if (!transcript || transcript.length === 0) return [];
  
  console.log('🤖 Using Claude AI for intelligent matching...');
  console.log(`📝 Tweet: "${tweetText.substring(0, 100)}..."`);
  
  const matches: MatchResult[] = [];
  
  // Process transcript in overlapping windows for better context
  const stepSize = Math.max(1, Math.floor(windowSize / 2));
  
  for (let i = 0; i <= transcript.length - windowSize; i += stepSize) {
    const window = transcript.slice(i, Math.min(i + windowSize, transcript.length));
    const windowText = window.map(s => s.text).join(' ');
    
    if (windowText.length < 50) continue; // Skip very short windows
    
    try {
      // Ask Claude to analyze the relevance
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 200,
        temperature: 0.3,
        messages: [{
          role: 'user',
          content: `You are analyzing video transcripts to find segments relevant to a tweet/social media post.

Tweet/Post:
"${tweetText}"

Video Transcript Segment (${window[0].offset.toFixed(1)}s - ${(window[window.length-1].offset + window[window.length-1].duration).toFixed(1)}s):
"${windowText}"

Analyze if this video segment is relevant to the tweet. Consider:
- Direct topic overlap
- Related concepts being discussed
- Complementary information that adds value
- Context that would interest someone reading the tweet
- Even indirect connections or background info

Respond in this exact format:
RELEVANCE: [0-100 score]
CONFIDENCE: [0-100 how confident you are]
REASONING: [One sentence explaining why this matches or doesn't match]

Be generous - if there's ANY reasonable connection, score it above 40. Look for value, not just exact matches.`
        }]
      });
      
      const content = response.content[0].type === 'text' ? response.content[0].text : '';
      
      // Parse Claude's response
      const relevanceMatch = content.match(/RELEVANCE:\s*(\d+)/);
      const confidenceMatch = content.match(/CONFIDENCE:\s*(\d+)/);
      const reasoningMatch = content.match(/REASONING:\s*(.+)/);
      
      const relevance = relevanceMatch ? parseInt(relevanceMatch[1]) / 100 : 0;
      const confidence = confidenceMatch ? parseInt(confidenceMatch[1]) / 100 : 0.5;
      const reasoning = reasoningMatch ? reasoningMatch[1].trim() : 'AI analysis';
      
      // Include matches with reasonable relevance
      if (relevance > 0.25) { // 25% relevance threshold - very generous
        matches.push({
          startTime: window[0].offset,
          endTime: window[window.length - 1].offset + window[window.length - 1].duration,
          text: windowText,
          score: relevance,
          confidence: confidence,
          reasoning: reasoning,
          method: 'ai'
        });
        
        console.log(`✅ Match found (${(relevance * 100).toFixed(0)}%): ${reasoning}`);
      }
      
    } catch (error) {
      console.warn('Claude API error for window:', error instanceof Error ? error.message : 'Unknown error');
      // Continue with next window
    }
  }
  
  // Sort by relevance score and remove overlapping matches
  const sortedMatches = matches.sort((a, b) => b.score - a.score);
  const deduplicatedMatches = removeOverlappingMatches(sortedMatches);
  
  console.log(`🎯 AI found ${deduplicatedMatches.length} relevant segments from ${matches.length} candidates`);
  
  return deduplicatedMatches.slice(0, 10); // Return top 10 matches
}

/**
 * Remove overlapping matches, keeping the highest scoring ones
 */
function removeOverlappingMatches(matches: MatchResult[]): MatchResult[] {
  const kept: MatchResult[] = [];
  
  for (const match of matches) {
    const hasSignificantOverlap = kept.some(existing => {
      const overlapStart = Math.max(match.startTime, existing.startTime);
      const overlapEnd = Math.min(match.endTime, existing.endTime);
      const overlapDuration = Math.max(0, overlapEnd - overlapStart);
      
      const matchDuration = match.endTime - match.startTime;
      const existingDuration = existing.endTime - existing.startTime;
      
      // Consider it overlapping if more than 50% of either segment overlaps
      return (overlapDuration / matchDuration > 0.5) || (overlapDuration / existingDuration > 0.5);
    });
    
    if (!hasSignificantOverlap) {
      kept.push(match);
    }
  }
  
  return kept;
}

/**
 * Batch process multiple tweets against a transcript
 */
export async function batchFindAIMatches(
  transcript: TranscriptSegment[],
  tweets: string[],
  windowSize: number = 12
): Promise<Map<string, MatchResult[]>> {
  const results = new Map<string, MatchResult[]>();
  
  for (const tweet of tweets) {
    try {
      const matches = await findAIMatchingSegments(transcript, tweet, windowSize);
      results.set(tweet, matches);
    } catch (error) {
      console.error(`Failed to process tweet: ${tweet.substring(0, 50)}...`, error);
      results.set(tweet, []);
    }
  }
  
  return results;
}

/**
 * Analyze what a tweet is looking for using AI
 */
export async function analyzeTweetIntent(tweetText: string): Promise<{
  mainTopic: string;
  lookingFor: string;
  context: string;
}> {
  if (!anthropic) {
    return {
      mainTopic: 'general',
      lookingFor: 'relevant video content',
      context: 'social media post'
    };
  }
  
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 150,
      temperature: 0.3,
      messages: [{
        role: 'user',
        content: `Briefly analyze this tweet to understand what video content would be valuable:
"${tweetText}"

MAIN_TOPIC: [one phrase]
LOOKING_FOR: [what kind of video content would add value]
CONTEXT: [why this matters]

Be concise.`
      }]
    });
    
    const content = response.content[0].type === 'text' ? response.content[0].text : '';
    
    return {
      mainTopic: content.match(/MAIN_TOPIC:\s*(.+?)(?=\n|$)/)?.[1] || 'general topic',
      lookingFor: content.match(/LOOKING_FOR:\s*(.+?)(?=\n|$)/)?.[1] || 'relevant video content',
      context: content.match(/CONTEXT:\s*(.+?)(?=\n|$)/)?.[1] || 'social media discussion'
    };
  } catch (error) {
    console.warn('Tweet intent analysis failed:', error);
    return {
      mainTopic: 'general',
      lookingFor: 'relevant video content', 
      context: 'social media post'
    };
  }
}

/**
 * Get a quick summary of why matches were found
 */
export async function explainMatches(
  tweetText: string,
  matches: MatchResult[]
): Promise<string> {
  if (!anthropic || matches.length === 0) {
    return 'No relevant matches found.';
  }
  
  try {
    const matchSummaries = matches.slice(0, 3).map((m, i) => 
      `${i + 1}. ${m.reasoning} (${(m.score * 100).toFixed(0)}% relevant)`
    ).join('\n');
    
      const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 100,
    temperature: 0.3,
      messages: [{
        role: 'user',
        content: `Summarize in one sentence why these video segments are relevant to the tweet:

Tweet: "${tweetText.substring(0, 200)}..."

Matches found:
${matchSummaries}

One sentence summary:`
      }]
    });
    
    return response.content[0].type === 'text' ? response.content[0].text : 'Found relevant video segments.';
  } catch (error) {
    return `Found ${matches.length} relevant video segments.`;
  }
} 
