import { Anthropic } from '@anthropic-ai/sdk';
import { ProcessedTranscript } from './transcription';

interface MatchResult {
  match: boolean;
  videoUrl: string;
  startTime: number;
  endTime: number;
  transcript: string;
  tweet: string;
  confidence: number;
  reason: string;
}

export async function matchTweetsToTranscripts(
  tweets: string[],
  transcripts: ProcessedTranscript[],
  anthropicClient?: Anthropic
): Promise<MatchResult[]> {
  // Initialize Anthropic client if not provided
  const client = anthropicClient || new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY,
  });

  const matches: MatchResult[] = [];
  
  // Combine all transcripts with metadata
  const videoContexts = transcripts.map(t => ({
    url: t.videoUrl,
    segments: t.segments.map(s => ({
      start: s.startTime,
      end: s.endTime,
      text: s.text
    }))
  }));

  // Create a single prompt for all tweets and videos
  const prompt = `You are an AI assistant that matches social media content to video transcripts.

Given these tweets from a thread:
${tweets.map((t, i) => `Tweet ${i + 1}: "${t}"`).join('\n')}

And these video transcripts:
${videoContexts.map((v, i) => `
Video ${i + 1} (${v.url}):
${v.segments.map(s => `[${s.start.toFixed(1)}s-${s.end.toFixed(1)}s] ${s.text}`).join('\n')}
`).join('\n\n')}

For each tweet, find the BEST matching segment(s) from ANY video. A good match should:
- Discuss the same topic, person, or event
- Share similar themes or concepts
- Use related keywords or phrases

Return a JSON array with this exact structure:
[
  {
    "tweetIndex": 0,
    "videoUrl": "video url",
    "startTime": 10.5,
    "endTime": 25.3,
    "confidence": 0.85,
    "reason": "Brief explanation of why this matches"
  }
]

Only include matches with confidence > 0.6. Return empty array if no good matches.`;

  try {
    console.log('🤖 Using Claude 3.7 Sonnet for intelligent matching...');
    
    const response = await client.messages.create({
      model: 'claude-3-7-sonnet-latest',
      max_tokens: 4000,
      temperature: 0.3,
      system: 'You are an expert at finding semantic connections between social media content and video transcripts. Be thorough but only match content that is genuinely related. Think deeply about the connections.',
      messages: [{
        role: 'user',
        content: prompt
      }]
    });

    // Extract the JSON from Claude's response
    const responseText = response.content[0].type === 'text' ? response.content[0].text : '';
    
    // Find JSON in the response
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.log('No JSON found in Claude response');
      return matches;
    }

    const results = JSON.parse(jsonMatch[0]);
    
    // Process results
    for (const result of results) {
      if (result.confidence > 0.6) {
        // Find the matching segment text
        const video = videoContexts.find(v => v.url === result.videoUrl);
        const matchingSegments = video?.segments.filter(s => 
          s.start >= result.startTime - 1 && s.end <= result.endTime + 1
        ) || [];
        
        const transcriptText = matchingSegments.map(s => s.text).join(' ');
        
        matches.push({
          match: true,
          videoUrl: result.videoUrl,
          startTime: result.startTime,
          endTime: result.endTime,
          transcript: transcriptText,
          tweet: tweets[result.tweetIndex],
          confidence: result.confidence,
          reason: result.reason
        });
        
        console.log(`✓ Matched tweet ${result.tweetIndex + 1} to video at ${result.startTime}s (${(result.confidence * 100).toFixed(0)}% confidence)`);
      }
    }
    
    console.log(`Found ${matches.length} high-confidence matches using Claude 3.7 Sonnet`);
    
  } catch (error: any) {
    console.error('Claude 3.7 Sonnet matching error:', error.message);
    
    // NO FALLBACK - Only use Claude
    console.log('❌ Claude matching failed. No fallback method available.');
    return [];
  }
  
  return matches;
}