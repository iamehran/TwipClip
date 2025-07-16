import Anthropic from '@anthropic-ai/sdk';
import { TranscriptSegment } from './enhanced-transcripts';

// Initialize Anthropic client for Claude
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || ''
});

// Enhanced cache for embeddings with TTL and memory management
const embeddingCache = new Map<string, { vector: number[]; timestamp: number; hits: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour
const MAX_CACHE_SIZE = 500; // Prevent memory issues

// Performance metrics tracking
let cacheHits = 0;
let cacheMisses = 0;
let totalEmbeddingRequests = 0;
let totalProcessingTime = 0;

// Concurrency control for embedding requests
let activeEmbeddingRequests = 0;
const MAX_CONCURRENT_EMBEDDINGS = 3; // Limit concurrent OpenAI requests

interface MatchResult {
  startTime: number;
  endTime: number;
  text: string;
  score: number;
  confidence: number;
  reasoning: string;
}

// Define TweetContext interface
interface TweetContext {
  tweet: string;
  index: number;
  topics: string[];
  entities: string[];
  sentiment: string;
}

/**
 * Simple hash function for cache keys
 */
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Get embedding vector for text with enhanced caching and performance tracking
 */
async function getEmbedding(text: string): Promise<number[] | null> {
  if (!anthropic) {
    console.warn('Anthropic not available, using keyword matching only');
    return null;
  }
  
  totalEmbeddingRequests++;
  const startTime = Date.now();
  const cacheKey = `embedding_${hashString(text)}`;
  
  // Check cache first
  if (embeddingCache.has(cacheKey)) {
    const cached = embeddingCache.get(cacheKey)!;
    
    // Check if cache is still valid
    if (Date.now() - cached.timestamp < CACHE_TTL) {
      cached.hits++;
      cacheHits++;
      return cached.vector;
    } else {
      // Remove expired entry
      embeddingCache.delete(cacheKey);
    }
  }
  
  cacheMisses++;
  
  try {
    // Shorter timeout for faster failures
    const embedding = await Promise.race([
      anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 200,
        temperature: 0.3,
        messages: [{
          role: 'user',
          content: `You are analyzing video transcripts to find segments relevant to a tweet.

Tweet:
"${text}"

Analyze if this tweet is relevant to the video content. Consider:
- Direct topic overlap
- Related concepts being discussed
- Complementary information
- Context that would interest someone reading the tweet

Respond in this exact format:
RELEVANCE: [0-100 score]
CONFIDENCE: [0-100 how confident you are]
REASONING: [One sentence explaining why this matches or doesn't match]

Be generous in finding connections - if there's any reasonable relationship, give it a score above 50.`
        }]
      }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Anthropic embedding timeout')), 12000) // Reduced from 25s to 12s
      )
    ]) as any;
    
    const vector = embedding.content[0]?.text?.match(/\[([0-9\s]+)\]/)?.[1].split(/\s+/).map(Number) || [];
    
    // Cache management - remove oldest entries if cache is full
    if (embeddingCache.size >= MAX_CACHE_SIZE) {
      const entries = Array.from(embeddingCache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      
      // Remove oldest 20% of entries
      const toRemove = entries.slice(0, Math.floor(entries.length * 0.2));
      toRemove.forEach(([key]) => embeddingCache.delete(key));
    }
    
    // Cache successful result
    embeddingCache.set(cacheKey, { vector, timestamp: Date.now(), hits: 0 });
    
    totalProcessingTime += Date.now() - startTime;
    return vector;
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.warn(`Error getting embedding: ${errorMessage}`);
    
    totalProcessingTime += Date.now() - startTime;
    // Return null instead of throwing - app will fallback to keyword matching
    return null;
  }
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(vec1: number[], vec2: number[]): number {
  if (vec1.length !== vec2.length) return 0;
  
  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;
  
  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i];
    norm1 += vec1[i] * vec1[i];
    norm2 += vec2[i] * vec2[i];
  }
  
  if (norm1 === 0 || norm2 === 0) return 0;
  
  return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
}

/**
 * Extract key phrases from text for better matching
 */
function extractKeyPhrases(text: string): string[] {
  // Split into sentences and phrases
  const phrases = text
    .replace(/[^\w\s.,!?]/g, '')
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length > 10)
    .slice(0, 3); // Top 3 phrases
  
  // Also extract noun phrases (simple approach)
  const words = text.toLowerCase().split(/\s+/);
  const keyPhrases = [];
  
  for (let i = 0; i < words.length - 1; i++) {
    const phrase = words.slice(i, i + 3).join(' ');
    if (phrase.length > 10 && !phrase.match(/^(the|and|or|but|in|on|at|to|for|with|by)$/)) {
      keyPhrases.push(phrase);
    }
  }
  
  return [...phrases, ...keyPhrases.slice(0, 5)];
}

/**
 * Pure AI-driven matching using Claude Sonnet
 * No keywords, no complex strategies - just AI understanding
 */
export async function findAIMatchingSegments(
  transcript: TranscriptSegment[], 
  tweetText: string, 
  windowSize: number = 10
): Promise<MatchResult[]> {
  if (!anthropic) {
    throw new Error('Anthropic API key not configured. Please set ANTHROPIC_API_KEY in your environment.');
  }
  
  if (!transcript || transcript.length === 0) return [];
  
  console.log('🤖 Using Claude AI for intelligent matching...');
  
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
          content: `You are analyzing video transcripts to find segments relevant to a tweet.

Tweet:
"${tweetText}"

Video Transcript Segment:
"${windowText}"

Analyze if this video segment is relevant to the tweet. Consider:
- Direct topic overlap
- Related concepts being discussed
- Complementary information
- Context that would interest someone reading the tweet

Respond in this exact format:
RELEVANCE: [0-100 score]
CONFIDENCE: [0-100 how confident you are]
REASONING: [One sentence explaining why this matches or doesn't match]

Be generous in finding connections - if there's any reasonable relationship, give it a score above 50.`
        }]
      });
      
      const content = response.content[0]?.type === 'text' ? response.content[0].text : '';
      
      // Parse Claude's response
      const relevanceMatch = content.match(/RELEVANCE:\s*(\d+)/);
      const confidenceMatch = content.match(/CONFIDENCE:\s*(\d+)/);
      const reasoningMatch = content.match(/REASONING:\s*(.+)/);
      
      const relevance = relevanceMatch ? parseInt(relevanceMatch[1]) / 100 : 0;
      const confidence = confidenceMatch ? parseInt(confidenceMatch[1]) / 100 : 0.5;
      const reasoning = reasoningMatch ? reasoningMatch[1].trim() : 'AI analysis';
      
      // Include matches with reasonable relevance
      if (relevance > 0.3) { // 30% relevance threshold
        matches.push({
        startTime: window[0].offset,
        endTime: window[window.length - 1].offset + window[window.length - 1].duration,
        text: windowText,
          score: relevance,
          confidence: confidence,
          reasoning: reasoning
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
      const overlapDuration = overlapEnd - overlapStart;
      
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
 * Advanced AI matching for precision - used in Phase 3
 */
export async function findPrecisionAIMatches(
  transcript: TranscriptSegment[],
  tweetText: string,
  tweetContext: string, // Additional context about the tweet
  videoId: string
): Promise<AdvancedMatchResult[]> {
  if (!anthropic) {
    throw new Error('Anthropic API key not configured');
  }
  
  console.log('🎯 Precision AI matching with Claude...');
  
  // First, get an AI understanding of what we're looking for
  const analysisResponse = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 300,
    temperature: 0.3,
    messages: [{
      role: 'user',
      content: `Analyze this tweet/post and tell me what kind of video content would be most relevant:

Tweet: "${tweetText}"

Provide:
1. Main topics/themes
2. Key concepts to look for
3. Type of content that would be most relevant
4. Any specific things to watch for

Be concise.`
    }]
  });
  
  const searchGuidance = analysisResponse.content[0]?.type === 'text' ? analysisResponse.content[0].text : '';
  console.log('🔍 AI Search Guidance:', searchGuidance);
  
  // Now search with this understanding
  const matches: AdvancedMatchResult[] = [];
  const windowSize = 15; // Larger windows for better context
  
  for (let i = 0; i <= transcript.length - windowSize; i += Math.floor(windowSize / 3)) {
    const window = transcript.slice(i, Math.min(i + windowSize, transcript.length));
    const windowText = window.map(s => s.text).join(' ');
    
    if (windowText.length < 100) continue;
    
    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 300,
        temperature: 0.3,
        messages: [{
          role: 'user',
          content: `You are finding video segments that would be valuable to someone who posted this tweet.

Original Tweet: "${tweetText}"

What we're looking for: ${searchGuidance}

Video Segment:
"${windowText.substring(0, 800)}${windowText.length > 800 ? '...' : ''}"

Rate this segment's relevance and explain why it would or wouldn't be valuable.

Format:
RELEVANCE: [0-100]
CONFIDENCE: [0-100]
VALUE: [What value does this provide to the tweet author/readers?]
TIMING: [Are there specific moments that are especially relevant?]
MATCH_TYPE: [exact|related|contextual|complementary|tangential]`
        }]
      });
      
      const content = response.content[0]?.type === 'text' ? response.content[0].text : '';
      
      // Parse the response
      const lines = content.split('\n');
      const matches: AdvancedMatchResult[] = [];
      
      // Parse response
      const relevance = parseInt(lines[0].match(/RELEVANCE:\s*(\d+)/)?.[1] || '0') / 100;
      const confidence = parseInt(lines[1].match(/CONFIDENCE:\s*(\d+)/)?.[1] || '50') / 100;
      const value = lines[2].match(/VALUE:\s*(.+?)(?=\n|$)/)?.[1] || '';
      const timing = lines[3].match(/TIMING:\s*(.+?)(?=\n|$)/)?.[1] || '';
      const matchType = lines[4].match(/MATCH_TYPE:\s*(\w+)/)?.[1] || 'contextual';
      
      if (relevance > 0.25) { // Even more generous threshold
        // Look for specific timing mentions to create more precise clips
        const timingInfo = extractTimingInfo(timing, window);
        
        matches.push({
          startTime: timingInfo.startTime || window[0].offset,
          endTime: timingInfo.endTime || window[window.length - 1].offset + window[window.length - 1].duration,
          text: windowText,
          score: relevance,
          method: 'semantic' as const,
          confidence: confidence,
          reasoning: value || 'AI-determined match',
          relevanceScore: relevance,
          contextScore: matchType === 'exact' ? 0.9 : matchType === 'related' ? 0.7 : 0.5,
          temporalScore: 0.7,
          uniquenessScore: 0.8,
          clipQuality: relevance > 0.7 ? 'excellent' : relevance > 0.5 ? 'good' : 'fair',
          reasonForMatch: [value, timing].filter(Boolean),
          videoId
        });
        
        console.log(`✅ ${matchType.toUpperCase()} match (${(relevance * 100).toFixed(0)}%): ${value}`);
      }
    } catch (error) {
      console.warn('Precision matching error:', error);
    }
  }
  
  return matches;
}

/**
 * Extract timing information from AI response
 */
function extractTimingInfo(timingText: string, window: TranscriptSegment[]): { startTime?: number; endTime?: number } {
  // Look for patterns like "especially from 2:30 to 3:15" or "the first half is most relevant"
  const result: { startTime?: number; endTime?: number } = {};
  
  if (timingText.includes('first half')) {
    const midPoint = window.length / 2;
    result.endTime = window[Math.floor(midPoint)].offset;
  } else if (timingText.includes('second half')) {
    const midPoint = window.length / 2;
    result.startTime = window[Math.floor(midPoint)].offset;
  } else if (timingText.includes('middle')) {
    const quarter = window.length / 4;
    result.startTime = window[Math.floor(quarter)].offset;
    result.endTime = window[Math.floor(window.length - quarter)].offset;
  }
  
  return result;
}

// Keep the advanced match interface for compatibility
interface AdvancedMatchResult extends MatchResult {
  relevanceScore: number;
  contextScore: number;
  temporalScore: number;
  uniquenessScore: number;
  clipQuality: 'excellent' | 'good' | 'fair' | 'poor';
  reasonForMatch: string[];
  videoId: string;
  method: 'semantic';
}

/**
 * Simplified tweet context analysis using AI
 */
export async function analyzeTweetWithAI(tweetText: string): Promise<{
  topics: string[];
  lookingFor: string;
  sentiment: string;
}> {
  if (!anthropic) {
    return {
      topics: [],
      lookingFor: 'relevant content',
      sentiment: 'neutral'
    };
  }
  
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 200,
      temperature: 0.3,
      messages: [{
        role: 'user',
        content: `Analyze this tweet in 3 lines:
"${tweetText}"

1. TOPICS: [comma-separated main topics]
2. LOOKING_FOR: [what video content would be most valuable]
3. SENTIMENT: [positive/negative/neutral/mixed]`
      }]
    });
    
    const content = response.content[0]?.type === 'text' ? response.content[0].text : '';
    
    return {
      topics: content.match(/TOPICS:\s*(.+)/)?.[1]?.split(',').map((t: string) => t.trim()) || [],
      lookingFor: content.match(/LOOKING_FOR:\s*(.+)/)?.[1] || 'relevant content',
      sentiment: content.match(/SENTIMENT:\s*(\w+)/)?.[1] || 'neutral'
    };
  } catch (error) {
    console.warn('Tweet analysis failed:', error);
    return {
      topics: [],
      lookingFor: 'relevant content', 
      sentiment: 'neutral'
    };
  }
}

/**
 * PHASE 3C: Video deduplication and management
 */
export interface VideoProcessingResult {
  videoUrl: string;
  videoId: string;
  platform: string;
  processed: boolean;
  transcript?: any;
  metadata?: any;
  error?: string;
}

export function deduplicateVideos(videoUrls: string[]): { uniqueUrls: string[]; duplicates: string[] } {
  console.log(`🔄 Phase 3C: Deduplicating ${videoUrls.length} video URLs`);
  
  const seen = new Set<string>();
  const uniqueUrls: string[] = [];
  const duplicates: string[] = [];
  
  for (const url of videoUrls) {
    const normalizedUrl = normalizeVideoUrl(url);
    
    if (seen.has(normalizedUrl)) {
      duplicates.push(url);
      console.log(`🔄 Duplicate detected: ${url}`);
    } else {
      seen.add(normalizedUrl);
      uniqueUrls.push(url);
    }
  }
  
  console.log(`✅ Deduplication complete: ${uniqueUrls.length} unique, ${duplicates.length} duplicates removed`);
  
  return { uniqueUrls, duplicates };
}

function normalizeVideoUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    
    // YouTube normalization
    if (urlObj.hostname.includes('youtube.com') || urlObj.hostname.includes('youtu.be')) {
      let videoId = '';
      
      if (urlObj.hostname.includes('youtu.be')) {
        videoId = urlObj.pathname.slice(1);
      } else if (urlObj.pathname.includes('/watch')) {
        videoId = urlObj.searchParams.get('v') || '';
      } else if (urlObj.pathname.includes('/shorts/')) {
        videoId = urlObj.pathname.split('/shorts/')[1];
      }
      
      return `youtube:${videoId}`;
    }
    
    // Vimeo normalization
    if (urlObj.hostname.includes('vimeo.com')) {
      const videoId = urlObj.pathname.split('/').pop();
      return `vimeo:${videoId}`;
    }
    
    // For other platforms, use normalized URL
    return `${urlObj.hostname}${urlObj.pathname}`;
    
  } catch (error) {
    // If URL parsing fails, return as-is
    return url;
  }
}

/**
 * PHASE 3C: Master function to process videos with advanced matching
 */
export async function processVideosWithAdvancedMatching(
  videoProcessingResults: VideoProcessingResult[],
  tweetContexts: TweetContext[]
): Promise<Map<string, AdvancedMatchResult[]>> {
  console.log(`🎯 Phase 3C: Processing ${videoProcessingResults.length} videos against ${tweetContexts.length} tweets`);
  
  const allMatches = new Map<string, AdvancedMatchResult[]>();
  
  // Process each tweet against all videos
  for (const tweetContext of tweetContexts) {
    const tweetKey = `tweet-${tweetContext.index}`;
    const tweetMatches: AdvancedMatchResult[] = [];
    
    console.log(`\n🔍 Finding matches for ${tweetKey}: "${tweetContext.tweet.substring(0, 80)}..."`);
    
    // Search in each video
    for (const videoResult of videoProcessingResults) {
      if (!videoResult.processed || !videoResult.transcript) continue;
      
      try {
        const matches = await findPrecisionAIMatches(
          videoResult.transcript.segments,
          tweetContext.tweet,
          tweetContext.tweet,
          videoResult.videoId
        );
        
        console.log(`📹 ${videoResult.platform}:${videoResult.videoId} - ${matches.length} matches`);
        
        // Add video metadata to matches
        const enhancedMatches = matches.map(match => ({
          ...match,
          videoUrl: videoResult.videoUrl,
          videoTitle: videoResult.metadata?.title || `${videoResult.platform} video`,
          videoThumbnail: videoResult.metadata?.thumbnail || '',
          channelTitle: videoResult.metadata?.channelTitle || videoResult.platform
        }));
        
        tweetMatches.push(...enhancedMatches);
        
      } catch (error) {
        console.warn(`Failed to match ${videoResult.videoId}:`, error);
      }
    }
    
    // Sort and limit matches for this tweet
    tweetMatches.sort((a, b) => b.score - a.score);
    allMatches.set(tweetKey, tweetMatches.slice(0, 8)); // Top 8 matches per tweet
    
    console.log(`✅ ${tweetKey}: ${tweetMatches.length} total matches, keeping top ${allMatches.get(tweetKey)?.length}`);
  }
  
  return allMatches;
}

// Export simplified interface for the rest of the app
export { findAIMatchingSegments as findAdvancedMatchingSegments }; 
