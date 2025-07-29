import axios from 'axios';
import OpenAI from 'openai';
import { ChatCompletionMessageParam } from 'openai/resources';

// Initialize OpenAI client if API key is available
const openai = process.env.OPENAI_API_KEY 
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) 
  : null;

// The AI model to use - using GPT-4o for better understanding and performance
const AI_MODEL = 'gpt-4o';

/**
 * Use AI to optimize YouTube search queries based on tweet content
 * @param tweets Array of tweet content
 * @param hook Optional hook or context
 * @returns Optimized search queries for YouTube
 */
export async function generateOptimizedSearchQueries(tweets: string[], hook?: string): Promise<string[]> {
  // Check if we have the OpenAI API key
  if (!openai) {
    console.log('OpenAI API key not found, using original tweets as search queries');
    return tweets;
  }
  
  try {
    console.log('Using AI to generate optimized search queries');
    
    const optimizedQueries: string[] = [];
    
    for (const tweet of tweets) {
      if (!tweet.trim()) continue;
      
      const messages: ChatCompletionMessageParam[] = [
        {
          role: "system",
          content: `You are a specialized AI for optimizing YouTube search queries. 
                   Your task is to analyze tweet content and generate the most effective search 
                   query that will find relevant videos on YouTube. Focus on extracting key topics, 
                   names, events, and unique phrases that would return targeted results.`
        },
        {
          role: "user",
          content: `Tweet content: "${tweet}"
                   ${hook ? `Context/Topic: "${hook}"` : ''}
                   
                   Generate a single optimized YouTube search query that will find videos discussing the exact 
                   topics in this tweet. Focus on specific facts, figures, quotes, or unique phrases that 
                   will return highly relevant results.
                   
                   Return ONLY the search query string with no additional text, quotes, or formatting.`
        }
      ];
      
      try {
        const response = await openai.chat.completions.create({
          model: AI_MODEL,
          messages,
          temperature: 0.3,
          max_tokens: 100
        });
        
        const searchQuery = response.choices[0].message.content?.trim();
        
        if (searchQuery) {
          optimizedQueries.push(searchQuery);
          console.log(`Original tweet: "${tweet.substring(0, 50)}..."`);
          console.log(`Optimized query: "${searchQuery}"`);
        } else {
          // Fallback to original tweet
          optimizedQueries.push(tweet);
        }
      } catch (queryError) {
        console.error('Error generating optimized query:', queryError);
        optimizedQueries.push(tweet); // Fallback to original tweet
      }
    }
    
    return optimizedQueries;
  } catch (error) {
    console.error('Error generating optimized search queries:', error);
    return tweets; // Fallback to original tweets
  }
}

/**
 * Use AI to find the best matching segments in a transcript for a given tweet
 * @param transcript Array of transcript segments
 * @param tweetContent The tweet content to match
 * @returns Array of matching segments with scores and timestamps
 */
export async function findAIEnhancedMatches(transcript: any[], tweetContent: string) {
  // Check if we have the OpenAI API key
  if (!openai) {
    console.log('OpenAI API key not found, falling back to algorithm-based matching');
    return null;
  }
  
  try {
    console.log('Using AI to find the best matching segments for tweet');
    
    // Convert transcript to a format suitable for the AI
    const transcriptText = transcript.map((segment, index) => {
      return `[${formatTime(segment.offset)} - ${formatTime(segment.offset + segment.duration)}] ${segment.text}`;
    }).join('\n');
    
    // If transcript is too long, we need to chunk it to stay within token limits
    const chunks = splitTranscriptIntoChunks(transcriptText);
    
    // Process each chunk to find matches
    const allMatches = [];
    
    for (const chunk of chunks) {
      const messages: ChatCompletionMessageParam[] = [
        {
          role: "system",
          content: `You are a specialized AI for matching tweet content to relevant parts of a video transcript. 
                   Your task is to identify the 1-3 most relevant segments of the transcript that best match the 
                   tweet content. Focus on semantic meaning, not just keyword matching. Return only the best matches.`
        },
        {
          role: "user",
          content: `Tweet content: "${tweetContent}"
                   
                   Video transcript (with timestamps):
                   ${chunk}
                   
                   Find the 1-3 most relevant segments from this transcript that match the tweet's content. 
                   Return your response as a JSON object with a "matches" key containing an array of match objects.
                   Each match object should have: "startTime" (MM:SS format), "endTime" (MM:SS format), 
                   "text" (the transcript text), "relevanceScore" (0-100), and "explanation" (brief reason for match).
                   
                   Example response format:
                   {"matches": [{"startTime": "01:23", "endTime": "01:45", "text": "sample transcript text", "relevanceScore": 85, "explanation": "This segment discusses the key topic mentioned in the tweet"}]}
                   
                   If no good matches exist in this chunk, return: {"matches": []}`
        }
      ];
      
      try {
        const response = await openai.chat.completions.create({
          model: AI_MODEL,
          messages,
          temperature: 0.3,
          response_format: { type: 'json_object' }
        });
        
        // Parse the AI response
        const content = response.choices[0].message.content || '';
        
        try {
          const jsonResponse = JSON.parse(content);
          
          if (jsonResponse.matches && Array.isArray(jsonResponse.matches)) {
            // Convert the timestamp strings back to seconds
            const processedMatches = jsonResponse.matches.map((match: any) => ({
              startTime: timeToSeconds(match.startTime),
              endTime: timeToSeconds(match.endTime),
              text: match.text,
              score: match.relevanceScore / 100, // Normalize to 0-1 scale
              explanation: match.explanation
            }));
            
            allMatches.push(...processedMatches);
          }
        } catch (parseError) {
          console.error('Error parsing AI response:', parseError);
          console.log('Raw response content:', content);
        }
      } catch (chunkError) {
        console.error('Error processing transcript chunk:', chunkError);
      }
    }
    
    // Sort by relevance score (descending)
    allMatches.sort((a, b) => b.score - a.score);
    
    // Return the top matches
    return allMatches.slice(0, 3);
  } catch (error) {
    console.error('Error using AI for transcript matching:', error);
    return null;
  }
}

// Helper function to format seconds as MM:SS
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Helper function to convert MM:SS to seconds
function timeToSeconds(timeStr: string): number {
  if (!timeStr || typeof timeStr !== 'string') {
    console.warn('Invalid time string:', timeStr);
    return 0;
  }
  
  const parts = timeStr.split(':');
  if (parts.length !== 2) {
    console.warn('Malformed time string:', timeStr);
    return 0;
  }
  
  try {
    const mins = parseInt(parts[0], 10) || 0;
    const secs = parseInt(parts[1], 10) || 0;
    return mins * 60 + secs;
  } catch (err) {
    console.warn('Error parsing time string:', timeStr, err);
    return 0;
  }
}

// Split long transcripts into manageable chunks for the API
function splitTranscriptIntoChunks(transcript: string, maxChunkSize = 4000): string[] {
  if (transcript.length <= maxChunkSize) {
    return [transcript];
  }
  
  const chunks = [];
  const lines = transcript.split('\n');
  let currentChunk = '';
  
  for (const line of lines) {
    if (currentChunk.length + line.length + 1 > maxChunkSize) {
      chunks.push(currentChunk);
      currentChunk = line;
    } else {
      currentChunk += (currentChunk ? '\n' : '') + line;
    }
  }
  
  if (currentChunk) {
    chunks.push(currentChunk);
  }
  
  return chunks;
}

interface ClipInfo {
  transcriptText: string;
  [key: string]: any;
}

/**
 * Generate a concise summary of why these clips match the tweet
 * @param clips Array of clip information
 * @param tweetContent The tweet content
 * @returns A short explanation of how the clips relate to the tweet
 */
export async function generateMatchExplanation(clips: ClipInfo[], tweetContent: string) {
  if (!openai || clips.length === 0) return null;
  
  try {
    const clipsInfo = clips.map((clip, index) => {
      return `Clip ${index + 1}: "${clip.transcriptText}"`;
    }).join('\n');
    
    const messages: ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: 'You provide brief, concise explanations about how video clips relate to tweet content.'
      },
      {
        role: "user",
        content: `Tweet: "${tweetContent}"
                 
                 Video clips found:
                 ${clipsInfo}
                 
                 In 1-2 sentences, explain how these clips relate to the tweet content.`
      }
    ];
    
    const response = await openai.chat.completions.create({
      model: AI_MODEL,
      messages,
      temperature: 0.7,
      max_tokens: 100
    });
    
    return response.choices[0].message.content?.trim() || null;
  } catch (error) {
    console.error('Error generating match explanation:', error);
    return null;
  }
} 