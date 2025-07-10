import { NextResponse } from 'next/server';
import { getEnhancedTranscript, detectVideoPlatform, clearTranscriptCache } from '../../utils/enhanced-transcripts';
import { 
  findAIMatchingSegments,
  batchFindAIMatches,
  analyzeTweetIntent,
  explainMatches
} from '../../utils/ai-matching';
import axios from 'axios';
import { YOUTUBE_API_KEY } from '../../config';
import { cookies } from 'next/headers'; // Add cookies import
import { getVideoMetadata as getAuthenticatedVideoMetadata } from '../../utils/video-metadata'; // Import authenticated metadata function

interface VideoClip {
  videoId: string;
  title: string;
  thumbnail: string;
  startTime: number;
  endTime: number;
  matchScore: number;
  transcriptText: string;
  channelTitle: string;
  clipDuration: string;
  confidence: number;
  reasoning: string;
}

interface TweetResults {
  tweet: string;
  clips: VideoClip[];
  aiExplanation?: string;
}

interface ResultsByTweet {
  [key: string]: TweetResults;
}

interface VideoMetadata {
  title: string;
  channelTitle: string;
  duration: number;
  publishedAt: string;
}

// Define a minimal interface for what detectVideoPlatform returns
interface DetectedVideoInfo {
  id: string;
  platform: string;
  url: string;
}

/**
 * Parse ISO 8601 duration format (PT1H2M3S)
 */
function parseDuration(duration: string): number {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  
  const hours = parseInt(match[1] || '0');
  const minutes = parseInt(match[2] || '0');
  const seconds = parseInt(match[3] || '0');
  
  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Get video metadata using YouTube API
 */
async function getVideoMetadataFromAPI(videoUrls: string[]): Promise<Map<string, VideoMetadata>> {
  const metadata = new Map<string, VideoMetadata>();
  
  if (videoUrls.length === 0) return metadata;
  
  // Extract YouTube video IDs
  const youtubeVideos = videoUrls
    .map(url => {
      const info = detectVideoPlatform(url);
      return info?.platform === 'youtube' ? { url, id: info.id } : null;
    })
    .filter(Boolean) as { url: string; id: string }[];
  
  // Fetch YouTube metadata if API key is available
  if (youtubeVideos.length > 0 && YOUTUBE_API_KEY) {
    try {
      console.log(`📋 Fetching metadata for ${youtubeVideos.length} YouTube videos...`);
      
      const response = await axios.get(
        'https://youtube.googleapis.com/youtube/v3/videos',
        {
          params: {
            part: 'snippet,contentDetails',
            id: youtubeVideos.map(v => v.id).join(','),
            key: YOUTUBE_API_KEY
          },
          timeout: 10000
        }
      );
      
      response.data.items?.forEach((item: any) => {
        const url = youtubeVideos.find(v => v.id === item.id)?.url;
        if (url) {
          const duration = parseDuration(item.contentDetails?.duration || 'PT0S');
          metadata.set(url, {
            title: item.snippet?.title || 'Untitled',
            channelTitle: item.snippet?.channelTitle || 'Unknown Channel',
            duration,
            publishedAt: item.snippet?.publishedAt || new Date().toISOString()
          });
        }
      });
    } catch (error) {
      console.error('Failed to fetch YouTube metadata:', error);
    }
  }
  
  // For videos without metadata, use defaults
  videoUrls.forEach(url => {
    if (!metadata.has(url)) {
      const info = detectVideoPlatform(url);
      metadata.set(url, {
        title: `${info?.platform || 'Unknown'} video`,
        channelTitle: 'Unknown',
        duration: 0,
        publishedAt: new Date().toISOString()
      });
    }
  });
  
  return metadata;
}

/**
 * Get thumbnail URL for video
 */
function getVideoThumbnail(videoUrl: string): string {
  const info = detectVideoPlatform(videoUrl);
  if (!info) return '/default-video-thumbnail.jpg';
  
  switch (info.platform) {
    case 'youtube':
      return `https://img.youtube.com/vi/${info.id}/maxresdefault.jpg`;
    case 'vimeo':
      return `https://vumbnail.com/${info.id}.jpg`;
    default:
      return '/default-video-thumbnail.jpg';
  }
}

/**
 * AI-Driven Video Search
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { hook, tweets, videoUrls, forceRefresh } = body as {
      hook?: string;
      tweets: string[];
      videoUrls: string[];
      forceRefresh?: boolean;
    };
    
    // Get session ID for authentication
    const cookieStore = await cookies();
    const sessionId = cookieStore.get('twipclip_session')?.value;
    console.log('🔐 Session ID:', sessionId ? sessionId.substring(0, 8) + '...' : 'none');
    
    // Clear caches if forceRefresh is requested
    if (forceRefresh) {
      console.log('🔄 Force refresh requested - clearing caches...');
      clearTranscriptCache();
    }
    
    if (!tweets || tweets.length === 0) {
      return NextResponse.json(
        { error: 'No tweets provided' },
        { status: 400 }
      );
    }
    
    if (!videoUrls || videoUrls.length === 0) {
      return NextResponse.json(
        { error: 'No video URLs provided' },
        { status: 400 }
      );
    }
    
    const cleanTweets = tweets.filter((t: string) => t.trim() !== '');
    const cleanVideoUrls: string[] = [...new Set(videoUrls.filter((url: string) => url.trim() !== ''))]; // Deduplicate
    
    console.log(`🚀 AI-Driven Search: ${cleanTweets.length} tweets, ${cleanVideoUrls.length} unique videos`);
    console.time('total-processing');
    
    // Initialize results
    const resultsByTweet: ResultsByTweet = {};
    cleanTweets.forEach((tweet: string, index: number) => {
      resultsByTweet[`tweet-${index + 1}`] = {
        tweet,
        clips: []
      };
    });
    
    // Validate video URLs
    const validVideos: { url: string; info: DetectedVideoInfo }[] = [];
    for (const url of cleanVideoUrls) {
      const info = detectVideoPlatform(url);
      if (info !== null) {
        validVideos.push({ url, info });
      } else {
        console.warn(`⚠️ Unsupported video URL: ${url}`);
      }
    }
    
    if (validVideos.length === 0) {
      return NextResponse.json(
        { error: 'No supported video URLs found' },
        { status: 400 }
      );
    }
    
    console.log(`✅ Processing ${validVideos.length} valid videos`);
    
    // Get video metadata with authentication for better reliability
    const videoMetadata = new Map<string, VideoMetadata>();
    
    // Try to get metadata with authentication first
    for (const { url } of validVideos) {
      const authMetadata = await getAuthenticatedVideoMetadata(url, sessionId);
      if (authMetadata) {
        videoMetadata.set(url, {
          title: authMetadata.title || 'Untitled',
          channelTitle: authMetadata.uploader || 'Unknown Channel',
          duration: authMetadata.duration || 0,
          publishedAt: new Date().toISOString()
        });
      }
    }
    
    // Fall back to API metadata for any missing videos
    if (videoMetadata.size < validVideos.length) {
      const apiMetadata = await getVideoMetadataFromAPI(
        validVideos.filter(v => !videoMetadata.has(v.url)).map(v => v.url)
      );
      apiMetadata.forEach((value, key) => {
        videoMetadata.set(key, value);
      });
    }
    
    // Process each video
    let totalVideosProcessed = 0;
    let totalVideosWithTranscripts = 0;
    let totalMatches = 0;
    
    for (const { url, info } of validVideos) {
      console.log(`\n🎬 Processing ${info.platform}:${info.id}...`);
      totalVideosProcessed++;
      
      try {
        // Get transcript with session ID for authentication
        const transcript = await getEnhancedTranscript(url, sessionId);
        
        if (!transcript || transcript.segments.length === 0) {
          console.warn(`❌ No transcript available for ${info.platform}:${info.id}`);
          continue;
        }
        
        totalVideosWithTranscripts++;
        const metadata = videoMetadata.get(url)!;
        console.log(`✅ Transcribed "${metadata.title}" - ${transcript.segments.length} segments`);
        
        // Process each tweet with AI matching
        for (let i = 0; i < cleanTweets.length; i++) {
          const tweet = cleanTweets[i];
          const tweetKey = `tweet-${i + 1}`;
          
          console.log(`\n🔍 Matching against ${tweetKey}...`);
          
          // First, understand what the tweet is looking for
          const tweetIntent = await analyzeTweetIntent(tweet);
          console.log(`📌 Looking for: ${tweetIntent.lookingFor}`);
          
          // Find matches using AI
          const matches = await findAIMatchingSegments(
            transcript.segments,
            tweet,
            12 // window size
          );
          
          console.log(`🎯 Found ${matches.length} AI matches`);
          
          // Convert to clips
          for (const match of matches) {
            const clipDuration = match.endTime - match.startTime;
            
            // Basic quality checks
            if (clipDuration < 10 || clipDuration > 300) {
              console.log(`❌ Rejected: duration ${clipDuration.toFixed(1)}s out of range (min: 10s, max: 300s)`);
              continue;
            }
            
            resultsByTweet[tweetKey].clips.push({
              videoId: info.id,
              title: metadata.title,
              thumbnail: getVideoThumbnail(url),
              startTime: match.startTime,
              endTime: match.endTime,
              matchScore: match.score,
              transcriptText: match.text.substring(0, 300) + '...',
              channelTitle: metadata.channelTitle,
              clipDuration: clipDuration.toFixed(1),
              confidence: match.confidence,
              reasoning: match.reasoning
            });
            
            totalMatches++;
            console.log(`✅ Added clip: ${match.startTime.toFixed(1)}s-${match.endTime.toFixed(1)}s (${(match.score * 100).toFixed(0)}% relevant)`);
            console.log(`   Reason: ${match.reasoning}`);
          }
          
          // Get AI explanation for the matches
          if (resultsByTweet[tweetKey].clips.length > 0) {
            const explanation = await explainMatches(
              tweet,
              matches.slice(0, 5)
            );
            resultsByTweet[tweetKey].aiExplanation = explanation;
          }
        }
        
      } catch (error) {
        console.error(`💥 Error processing ${url}:`, error);
      }
    }
    
    console.timeEnd('total-processing');
    
    // Sort clips by relevance for each tweet
    Object.values(resultsByTweet).forEach(tweetResult => {
      tweetResult.clips.sort((a, b) => b.matchScore - a.matchScore);
      tweetResult.clips = tweetResult.clips.slice(0, 10); // Top 10 per tweet
    });
    
    return NextResponse.json({
      results: resultsByTweet,
      stats: {
        videosProcessed: totalVideosProcessed,
        videosTranscribed: totalVideosWithTranscripts,
        totalMatches,
        aiModel: 'Claude 3.7 Sonnet',
        matchingMethod: 'Pure AI Understanding',
        message: totalMatches > 0 
          ? `Found ${totalMatches} relevant clips using AI understanding`
          : 'No relevant clips found. The AI could not find connections between the tweets and video content.'
      }
    });
    
  } catch (error: any) {
    console.error('Error in AI search:', error);
    
    return NextResponse.json(
      { 
        error: error.message || 'An error occurred during AI processing',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}

// Specify Node.js runtime for child_process support
export const runtime = 'nodejs'; 