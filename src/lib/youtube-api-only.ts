/**
 * YouTube API-only solution that doesn't require yt-dlp
 * This is a fallback when yt-dlp is not available
 */

import { google } from 'googleapis';
import axios from 'axios';

const youtube = google.youtube({
  version: 'v3',
  auth: process.env.YOUTUBE_API_KEY
});

/**
 * Get video metadata without downloading
 */
export async function getVideoMetadata(videoId: string) {
  try {
    const response = await youtube.videos.list({
      part: ['snippet', 'contentDetails'],
      id: [videoId]
    });

    if (!response.data.items || response.data.items.length === 0) {
      throw new Error('Video not found');
    }

    const video = response.data.items[0];
    return {
      title: video.snippet?.title,
      description: video.snippet?.description,
      channel: video.snippet?.channelTitle,
      duration: parseDuration(video.contentDetails?.duration || ''),
      publishedAt: video.snippet?.publishedAt
    };
  } catch (error) {
    console.error('Failed to get video metadata:', error);
    throw error;
  }
}

/**
 * Get captions/transcripts using YouTube API
 */
export async function getCaptionsViaAPI(videoId: string) {
  try {
    // List available captions
    const captionsResponse = await youtube.captions.list({
      part: ['snippet'],
      videoId: videoId
    });

    const captions = captionsResponse.data.items || [];
    
    // Find English captions
    const englishCaption = captions.find(
      cap => cap.snippet?.language === 'en' || cap.snippet?.language === 'en-US'
    ) || captions[0];

    if (!englishCaption) {
      console.log('No captions available via API');
      return null;
    }

    // Note: YouTube API v3 doesn't allow downloading caption content directly
    // We need to use alternative methods
    return await getTranscriptFromAlternativeSource(videoId);
    
  } catch (error) {
    console.error('Failed to get captions:', error);
    return null;
  }
}

/**
 * Get transcript from alternative sources
 */
async function getTranscriptFromAlternativeSource(videoId: string) {
  // Try multiple transcript sources
  const sources = [
    {
      name: 'youtubetranscript.com',
      url: `https://youtubetranscript.com/api/transcript?video_id=${videoId}`,
    },
    {
      name: 'youtube-transcript-api',
      url: `https://api.youtubetranscript.com/transcript/${videoId}`,
    }
  ];

  for (const source of sources) {
    try {
      const response = await axios.get(source.url, { timeout: 10000 });
      if (response.data) {
        return formatTranscript(response.data);
      }
    } catch (e) {
      console.log(`${source.name} failed:`, e.message);
    }
  }

  // Fallback: Extract from YouTube page directly
  return await extractTranscriptFromPage(videoId);
}

/**
 * Extract transcript by parsing YouTube page
 */
async function extractTranscriptFromPage(videoId: string) {
  try {
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const html = response.data;
    
    // Look for caption tracks in the page data
    const captionRegex = /"captionTracks":\[(.*?)\]/;
    const match = html.match(captionRegex);
    
    if (match) {
      const captionData = JSON.parse(`[${match[1]}]`);
      const englishTrack = captionData.find(track => 
        track.languageCode === 'en' || track.languageCode === 'en-US'
      ) || captionData[0];

      if (englishTrack && englishTrack.baseUrl) {
        const transcriptResponse = await axios.get(englishTrack.baseUrl);
        return parseYouTubeTranscript(transcriptResponse.data);
      }
    }

    return null;
  } catch (error) {
    console.error('Failed to extract transcript from page:', error);
    return null;
  }
}

/**
 * Parse YouTube's transcript format
 */
function parseYouTubeTranscript(xmlData: string) {
  const segments: Array<{ start: number; text: string }> = [];
  
  // Simple XML parsing for transcript
  const textRegex = /<text start="([\d.]+)"[^>]*>([^<]+)<\/text>/g;
  let match;
  
  while ((match = textRegex.exec(xmlData)) !== null) {
    segments.push({
      start: parseFloat(match[1]),
      text: decodeHTMLEntities(match[2])
    });
  }

  return segments;
}

/**
 * Decode HTML entities
 */
function decodeHTMLEntities(text: string) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec));
}

/**
 * Format transcript data
 */
function formatTranscript(data: any) {
  if (Array.isArray(data)) {
    return data.map(item => ({
      start: item.start || item.offset || 0,
      text: item.text || item.content || ''
    }));
  }
  return [];
}

/**
 * Parse ISO 8601 duration to seconds
 */
function parseDuration(duration: string): number {
  const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
  if (!match) return 0;
  
  const hours = (match[1] || '').replace('H', '');
  const minutes = (match[2] || '').replace('M', '');
  const seconds = (match[3] || '').replace('S', '');
  
  return (parseInt(hours) || 0) * 3600 + 
         (parseInt(minutes) || 0) * 60 + 
         (parseInt(seconds) || 0);
} 