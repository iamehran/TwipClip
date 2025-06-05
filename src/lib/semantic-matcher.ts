import { OpenAI } from 'openai';
import { ProcessedTranscript, TranscriptSegment } from './transcription';

export interface MatchResult {
  match: boolean;
  tweet: string;
  videoUrl: string;
  startTime: number;
  endTime: number;
  transcript: string;
  confidence: number;
  reason: string;
}

interface ComparisonResult {
  confidence: number;
  reason: string;
}

// Detailed prompt similar to media-matcher's Claude prompt
const MATCHING_PROMPT = `You are an expert at matching tweet content with video transcript segments.
You will receive a tweet and a video transcript segment.
Determine if the segment is DIRECTLY relevant to the tweet content.

CRITICAL RULES:
1. The segment must directly discuss the specific topic in the tweet
2. General topical similarity is NOT enough - it must be directly relevant
3. Return confidence between 0-1 (0 = no match, 1 = perfect match)
4. Only return confidence > 0.3 if there's genuine relevance

Return JSON only: { "confidence": 0.0-1.0, "reason": "brief explanation" }`;

async function compareContentWithAI(
  tweet: string,
  transcript: string,
  openaiClient: OpenAI
): Promise<ComparisonResult> {
  try {
    const response = await openaiClient.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: MATCHING_PROMPT
        },
        {
          role: 'user',
          content: `Tweet: "${tweet}"\n\nTranscript: "${transcript}"`
        }
      ],
      temperature: 0.3,
      max_tokens: 200,
      response_format: { type: 'json_object' }
    });

    const result = JSON.parse(response.choices[0].message.content || '{}');
    return {
      confidence: result.confidence || 0,
      reason: result.reason || 'No reason provided'
    };
  } catch (error) {
    console.error('AI comparison error:', error);
    return { confidence: 0, reason: 'Error during comparison' };
  }
}

export async function matchTweetsToTranscripts(
  tweets: string[],
  processedTranscripts: ProcessedTranscript[],
  openaiClient: OpenAI
): Promise<MatchResult[]> {
  console.log(`\n=== Starting AI Matching for ${tweets.length} tweets ===`);
  
  const matches: MatchResult[] = [];
  const confidenceThreshold = 0.3; // Higher threshold for quality matches
  
  // Process first 2 tweets only (as per requirements)
  for (let tweetIndex = 0; tweetIndex < Math.min(tweets.length, 2); tweetIndex++) {
    const tweet = tweets[tweetIndex];
    let bestMatch: {
      confidence: number;
      segment?: TranscriptSegment;
      transcript?: ProcessedTranscript;
      reason: string;
    } = { confidence: 0, reason: '' };
    
    // Check each transcript
    for (const transcript of processedTranscripts) {
      // Group segments into 60-90 second chunks for better context
      const segmentGroups = groupSegmentsForMatching(transcript.segments);
      
      for (const group of segmentGroups) {
        const combinedText = group.map(s => s.text || s.transcript || '').join(' ');
        
        if (!combinedText.trim() || combinedText.length < 50) continue;
        
        const result = await compareContentWithAI(tweet, combinedText, openaiClient);
        
        if (result.confidence > bestMatch.confidence) {
          bestMatch = {
            confidence: result.confidence,
            segment: group[0], // Use first segment for timing
            transcript: transcript,
            reason: result.reason
          };
        }
      }
    }
    
    // Add match if above threshold
    if (bestMatch.confidence >= confidenceThreshold && bestMatch.segment && bestMatch.transcript) {
      const segment = bestMatch.segment;
      const endSegment = findEndSegment(bestMatch.transcript.segments, segment, 60, 90);
      
      console.log(`✓ Tweet ${tweetIndex + 1}: Match found (${(bestMatch.confidence * 100).toFixed(0)}% confidence)`);
      
      matches.push({
        match: true,
        tweet: tweet,
        videoUrl: bestMatch.transcript.videoUrl,
        startTime: Math.floor(segment.startTime),
        endTime: Math.ceil(endSegment.endTime),
        transcript: extractTranscriptText(bestMatch.transcript.segments, segment, endSegment),
        confidence: bestMatch.confidence,
        reason: bestMatch.reason
      });
    } else {
      console.log(`✗ Tweet ${tweetIndex + 1}: No match found (best: ${(bestMatch.confidence * 100).toFixed(0)}%)`);
    }
  }
  
  console.log(`\n=== Matching Complete: ${matches.length}/2 matches found ===\n`);
  return matches;
}

// Helper function to group segments into 30-second chunks for better context
function groupSegmentsForMatching(segments: TranscriptSegment[]): TranscriptSegment[][] {
  const groups: TranscriptSegment[][] = [];
  let currentGroup: TranscriptSegment[] = [];
  let groupDuration = 0;
  
  for (const segment of segments) {
    const segmentDuration = segment.endTime - segment.startTime;
    
    if (groupDuration + segmentDuration > 30 || currentGroup.length >= 6) {
      if (currentGroup.length > 0) {
        groups.push(currentGroup);
      }
      currentGroup = [segment];
      groupDuration = segmentDuration;
    } else {
      currentGroup.push(segment);
      groupDuration += segmentDuration;
    }
  }
  
  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }
  
  return groups;
}

// Find appropriate end segment for 60-90 second clips
function findEndSegment(
  segments: TranscriptSegment[],
  startSegment: TranscriptSegment,
  minDuration: number,
  maxDuration: number
): TranscriptSegment {
  const startIndex = segments.findIndex(s => s.index === startSegment.index);
  let endSegment = startSegment;
  
  for (let i = startIndex + 1; i < segments.length; i++) {
    const duration = segments[i].endTime - startSegment.startTime;
    
    if (duration >= minDuration) {
      endSegment = segments[i];
      if (duration >= maxDuration) break;
    }
  }
  
  return endSegment;
}

// Extract clean transcript text between segments
function extractTranscriptText(
  segments: TranscriptSegment[],
  startSegment: TranscriptSegment,
  endSegment: TranscriptSegment
): string {
  const startIndex = segments.findIndex(s => s.index === startSegment.index);
  const endIndex = segments.findIndex(s => s.index === endSegment.index);
  
  const relevantSegments = segments.slice(startIndex, endIndex + 1);
  return relevantSegments
    .map(s => s.text || s.transcript || '')
    .filter(text => text.trim())
    .join(' ')
    .trim();
}
// ... existing code ...