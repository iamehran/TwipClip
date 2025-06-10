/**
 * YouTube transcript scraper that doesn't require API keys or yt-dlp
 */

import axios from 'axios';

interface TranscriptSegment {
  start: number;
  duration: number;
  text: string;
}

/**
 * Extract transcript directly from YouTube page
 */
export async function scrapeYouTubeTranscript(videoId: string): Promise<TranscriptSegment[] | null> {
  try {
    console.log(`Scraping transcript for video: ${videoId}`);
    
    // Fetch the YouTube video page
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const response = await axios.get(videoUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      timeout: 10000,
    });

    const html = response.data;
    
    // Method 1: Look for captions in ytInitialPlayerResponse
    const playerResponseMatch = html.match(/ytInitialPlayerResponse\s*=\s*({.+?});/);
    if (playerResponseMatch) {
      try {
        const playerResponse = JSON.parse(playerResponseMatch[1]);
        const captions = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
        
        if (captions && captions.length > 0) {
          // Find English captions or use the first available
          const caption = captions.find((c: any) => 
            c.languageCode === 'en' || c.languageCode === 'en-US'
          ) || captions[0];
          
          if (caption && caption.baseUrl) {
            // Fetch the transcript
            const transcriptResponse = await axios.get(caption.baseUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              },
            });
            
            // Parse the XML transcript
            const segments = parseTranscriptXML(transcriptResponse.data);
            if (segments.length > 0) {
              console.log(`✅ Successfully scraped ${segments.length} segments`);
              return segments;
            }
          }
        }
      } catch (e) {
        console.log('Failed to parse player response:', e instanceof Error ? e.message : String(e));
      }
    }

    // Method 2: Look for timedtext URL in the page
    const timedTextMatch = html.match(/"captionTracks":\[(.*?)\]/);
    if (timedTextMatch) {
      try {
        const captionData = JSON.parse(`[${timedTextMatch[1]}]`);
        const caption = captionData.find((track: any) => 
          track.languageCode === 'en' || track.languageCode === 'en-US'
        ) || captionData[0];

        if (caption && caption.baseUrl) {
          const transcriptResponse = await axios.get(caption.baseUrl);
          const segments = parseTranscriptXML(transcriptResponse.data);
          if (segments.length > 0) {
            console.log(`✅ Successfully scraped ${segments.length} segments (method 2)`);
            return segments;
          }
        }
      } catch (e) {
        console.log('Failed to parse caption tracks:', e instanceof Error ? e.message : String(e));
      }
    }

    // Method 3: Try to get from innertube API
    const segments = await fetchFromInnertubeAPI(videoId);
    if (segments && segments.length > 0) {
      return segments;
    }

    console.log('❌ No transcript found using any method');
    return null;
    
  } catch (error) {
    console.error('Transcript scraping failed:', error instanceof Error ? error.message : String(error));
    return null;
  }
}

/**
 * Parse YouTube's XML transcript format
 */
function parseTranscriptXML(xmlData: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  
  // Simple XML parsing for transcript
  const textRegex = /<text start="([\d.]+)".*?dur="([\d.]+)"[^>]*>([^<]+)<\/text>/g;
  let match;
  
  while ((match = textRegex.exec(xmlData)) !== null) {
    segments.push({
      start: parseFloat(match[1]),
      duration: parseFloat(match[2]),
      text: decodeHTMLEntities(match[3])
    });
  }

  return segments;
}

/**
 * Decode HTML entities
 */
function decodeHTMLEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/\+/g, ' ')
    .replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(parseInt(dec)));
}

/**
 * Try to fetch transcript from YouTube's innertube API
 */
async function fetchFromInnertubeAPI(videoId: string): Promise<TranscriptSegment[] | null> {
  try {
    // First, get the video page to extract necessary data
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const pageResponse = await axios.get(videoUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    // Extract API key and other necessary data
    const apiKeyMatch = pageResponse.data.match(/"INNERTUBE_API_KEY":"([^"]+)"/);
    const apiKey = apiKeyMatch ? apiKeyMatch[1] : 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8'; // Fallback

    // Try to get transcript list
    const payload = {
      context: {
        client: {
          hl: 'en',
          gl: 'US',
          clientName: 'WEB',
          clientVersion: '2.20231219.01.00',
        },
      },
      videoId: videoId,
    };

    const response = await axios.post(
      `https://www.youtube.com/youtubei/v1/get_transcript?key=${apiKey}`,
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      }
    );

    if (response.data?.actions) {
      const transcriptData = response.data.actions[0]?.updateEngagementPanelAction?.content?.transcriptRenderer;
      if (transcriptData?.body?.transcriptBodyRenderer?.cueGroups) {
        const cueGroups = transcriptData.body.transcriptBodyRenderer.cueGroups;
        return cueGroups.map((group: any) => ({
          start: parseFloat(group.transcriptCueGroupRenderer.cues[0].transcriptCueRenderer.startOffsetMs) / 1000,
          duration: parseFloat(group.transcriptCueGroupRenderer.cues[0].transcriptCueRenderer.durationMs) / 1000,
          text: group.transcriptCueGroupRenderer.cues[0].transcriptCueRenderer.cue.simpleText,
        }));
      }
    }

    return null;
  } catch (error) {
    console.log('Innertube API method failed:', error instanceof Error ? error.message : String(error));
    return null;
  }
} 