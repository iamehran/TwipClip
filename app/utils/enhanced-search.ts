import { google } from 'googleapis';
import OpenAI from 'openai';

// Initialize OpenAI client
const openai = process.env.OPENAI_API_KEY 
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) 
  : null;

// Initialize YouTube API
const youtube = google.youtube({
  version: 'v3',
  auth: process.env.YOUTUBE_API_KEY,
});

interface VideoSearchResult {
  videoId: string;
  title: string;
  description: string;
  thumbnail: string;
  channelTitle: string;
  publishedAt: string;
  viewCount: number;
  duration: string;
  relevanceScore: number;
}

interface SearchOptions {
  maxVideosPerStrategy: number;
  includeRecentVideos: boolean;
  minViewCount: number;
  maxDurationMinutes: number;
  preferHighQuality: boolean;
}

/**
 * Generate multiple search strategies for a given tweet/query
 */
export async function generateSearchStrategies(tweetText: string, hook?: string): Promise<string[]> {
  const strategies: string[] = [];
  
  // Strategy 1: Extract key terms and topics
  const keyTerms = extractKeyTerms(tweetText);
  if (keyTerms.length > 0) {
    strategies.push(keyTerms.slice(0, 4).join(' '));
  }
  
  // Strategy 2: Use exact phrases from the tweet
  const keyPhrases = extractKeyPhrases(tweetText);
  keyPhrases.forEach(phrase => {
    if (phrase.length > 5) {
      strategies.push(`"${phrase}"`);
    }
  });
  
  // Strategy 3: Topic + context search
  if (hook) {
    const combinedQuery = `${hook} ${keyTerms.slice(0, 2).join(' ')}`;
    strategies.push(combinedQuery);
  }
  
  // Strategy 4: AI-generated optimized queries
  if (openai) {
    try {
      const aiQueries = await generateAIOptimizedQueries(tweetText, hook);
      strategies.push(...aiQueries);
    } catch (error) {
      console.warn('AI query generation failed:', error);
    }
  }
  
  // Strategy 5: Fallback general searches
  strategies.push(tweetText.split(' ').slice(0, 3).join(' '));
  
  // Remove duplicates and empty queries
  return [...new Set(strategies)].filter(s => s.trim().length > 0);
}

/**
 * AI-powered query optimization using OpenAI
 */
async function generateAIOptimizedQueries(tweetText: string, hook?: string): Promise<string[]> {
  if (!openai) return [];
  
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are an expert at generating highly specific YouTube search queries. Generate 3 precise search queries that will find videos specifically discussing the exact topics, people, companies, or concepts mentioned. Focus on:
          - Specific person names, company names, product names
          - Exact topics and concepts mentioned
          - Recent events or announcements
          - Technical terms or industry-specific language
          
          Avoid generic terms. Be very specific and targeted.`
        },
        {
          role: 'user',
          content: `Tweet: "${tweetText}"${hook ? `\nContext: "${hook}"` : ''}
          
          Generate 3 highly specific YouTube search queries that will find videos discussing these EXACT topics and entities. Each query should target the specific subject matter mentioned.`
        }
      ],
      max_tokens: 200,
      temperature: 0.1, // Lower temperature for more focused results
    });
    
    const content = response.choices[0].message.content || '';
    const queries = content.split('\n')
      .map(q => q.replace(/^\d+\.?\s*/, '').trim()) // Remove numbering
      .filter(q => q.length > 5 && q.length < 100);
      
    console.log('AI-generated specific queries:', queries);
    return queries;
  } catch (error) {
    console.error('Error generating AI queries:', error);
    return [];
  }
}

/**
 * Filter out clearly irrelevant videos based on content analysis
 */
function filterRelevantVideos(videos: VideoSearchResult[], originalQuery: string, tweetText: string): VideoSearchResult[] {
  const queryWords = originalQuery.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const tweetWords = tweetText.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const allKeywords = [...new Set([...queryWords, ...tweetWords])];
  
  return videos.filter(video => {
    const title = video.title.toLowerCase();
    const description = (video.description || '').toLowerCase();
    const combinedContent = `${title} ${description}`;
    
    // Count keyword matches
    const keywordMatches = allKeywords.filter(keyword => 
      combinedContent.includes(keyword.toLowerCase())
    ).length;
    
    // Calculate relevance score
    const relevanceScore = keywordMatches / Math.max(allKeywords.length * 0.3, 1);
    
    // Filter out clearly irrelevant content
    const irrelevantPatterns = [
      /sports?.*vs.*sports?/i,
      /cricket.*match/i,
      /football.*game/i,
      /movie.*trailer/i,
      /song.*lyrics/i,
      /cooking.*recipe/i,
      /gaming.*gameplay/i
    ];
    
    const hasIrrelevantContent = irrelevantPatterns.some(pattern => 
      pattern.test(combinedContent)
    );
    
    // Keep video if it has good relevance score and no irrelevant patterns
    const isRelevant = relevanceScore > 0.15 && !hasIrrelevantContent;
    
    if (!isRelevant) {
      console.log(`Filtered out irrelevant video: "${video.title}" (score: ${relevanceScore})`);
    }
    
    return isRelevant;
  });
}

/**
 * Enhanced search with multiple strategies and better filtering
 */
export async function searchVideosEnhanced(
  tweetText: string, 
  hook?: string, 
  options: SearchOptions = {
    maxVideosPerStrategy: 6,
    includeRecentVideos: true,
    minViewCount: 500,
    maxDurationMinutes: 45,
    preferHighQuality: true
  }
): Promise<VideoSearchResult[]> {
  const maxVideosPerStrategy = options.maxVideosPerStrategy || 6;
  const allVideos: VideoSearchResult[] = [];
  const seenVideoIds = new Set<string>();
  
  console.log(`🔍 Starting enhanced search for: "${tweetText.substring(0, 100)}..."`);
  
  // Strategy 1: AI-optimized specific queries
  try {
    const aiQueries = await generateAIOptimizedQueries(tweetText, hook);
    for (const query of aiQueries.slice(0, 3)) {
      console.log(`🧠 AI Query: "${query}"`);
      const videos = await executeYouTubeSearch(query, maxVideosPerStrategy);
      const filteredVideos = filterRelevantVideos(videos, query, tweetText);
      
      filteredVideos.forEach(video => {
        if (!seenVideoIds.has(video.videoId)) {
          seenVideoIds.add(video.videoId);
          allVideos.push(video);
        }
      });
    }
  } catch (error) {
    console.error('AI query strategy failed:', error);
  }

  // Strategy 2: Enhanced entity extraction
  try {
    const entities = extractAllEntities(tweetText);
    for (const entityQuery of entities.slice(0, 2)) {
      if (entityQuery) {
        console.log(`🏢 Entity Query: "${entityQuery}"`);
        const videos = await executeYouTubeSearch(entityQuery, maxVideosPerStrategy);
        const filteredVideos = filterRelevantVideos(videos, entityQuery, tweetText);
        
        filteredVideos.forEach(video => {
          if (!seenVideoIds.has(video.videoId)) {
            seenVideoIds.add(video.videoId);
            allVideos.push(video);
          }
        });
      }
    }
  } catch (error) {
    console.error('Entity search strategy failed:', error);
  }

  // Strategy 3: Topic + timeframe combinations
  try {
    const topics = extractTopicVariations(tweetText);
    for (const topicQuery of topics.slice(0, 2)) {
      console.log(`📅 Topic Query: "${topicQuery}"`);
      const videos = await executeYouTubeSearch(topicQuery, maxVideosPerStrategy);
      const filteredVideos = filterRelevantVideos(videos, topicQuery, tweetText);
      
      filteredVideos.forEach(video => {
        if (!seenVideoIds.has(video.videoId)) {
          seenVideoIds.add(video.videoId);
          allVideos.push(video);
        }
      });
    }
  } catch (error) {
    console.error('Topic search strategy failed:', error);
  }

  // Strategy 4: Fallback broader search
  try {
    const broadQuery = extractKeyEntities(tweetText);
    if (broadQuery && allVideos.length < 10) {
      console.log(`🌐 Broad Query: "${broadQuery}"`);
      const videos = await executeYouTubeSearch(broadQuery, maxVideosPerStrategy);
      const filteredVideos = filterRelevantVideos(videos, broadQuery, tweetText);
      
      filteredVideos.forEach(video => {
        if (!seenVideoIds.has(video.videoId)) {
          seenVideoIds.add(video.videoId);
          allVideos.push(video);
        }
      });
    }
  } catch (error) {
    console.error('Broad search strategy failed:', error);
  }

  // Apply quality filtering based on options
  const qualityFilteredVideos = allVideos.filter(video => {
    if (options.minViewCount && video.viewCount < options.minViewCount) return false;
    
    const durationMinutes = parseDurationToMinutes(video.duration);
    if (options.maxDurationMinutes && durationMinutes > options.maxDurationMinutes) return false;
    
    return true;
  });
  
  // Sort by relevance score and recency
  const sortedVideos = qualityFilteredVideos.sort((a, b) => {
    // Prioritize recent videos
    const aDate = new Date(a.publishedAt).getTime();
    const bDate = new Date(b.publishedAt).getTime();
    const daysDiff = Math.abs(aDate - bDate) / (1000 * 60 * 60 * 24);
    
    if (daysDiff < 30) { // If both recent, sort by view count
      return b.viewCount - a.viewCount;
    }
    
    // Otherwise prioritize newer content
    return bDate - aDate;
  });
  
  const finalVideos = sortedVideos.slice(0, 15);
  
  console.log(`✅ Found ${finalVideos.length} unique relevant videos after filtering (from ${allVideos.length} total)`);
  return finalVideos;
}

/**
 * Execute a single YouTube search with optimized parameters
 */
async function executeYouTubeSearch(query: string, maxResults: number): Promise<VideoSearchResult[]> {
  try {
    const searchResponse = await youtube.search.list({
      part: ['snippet'],
      q: query,
      maxResults,
      type: ['video'],
      videoEmbeddable: 'true',
      relevanceLanguage: 'en',
      videoDuration: 'medium', // 4-20 minutes
      order: 'relevance',
      publishedAfter: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(), // Last year
    });
    
    const videos = searchResponse.data.items || [];
    
    if (videos.length === 0) return [];
    
    // Get additional video details (duration, view count, etc.)
    const videoIds = videos.map(v => v.id?.videoId).filter((id): id is string => Boolean(id));
    
    const detailsResponse = await youtube.videos.list({
      part: ['contentDetails', 'statistics'],
      id: videoIds,
    });
    
    const videoDetails = new Map<string, any>();
    detailsResponse.data.items?.forEach((item: any) => {
      videoDetails.set(item.id, item);
    });
    
    // Combine search results with details
    const enrichedVideos: VideoSearchResult[] = [];
    
    for (const video of videos) {
      const videoId = video.id?.videoId;
      if (!videoId) continue;
      
      const details = videoDetails.get(videoId);
      const snippet = video.snippet;
      
      enrichedVideos.push({
        videoId,
        title: snippet?.title || '',
        description: snippet?.description || '',
        thumbnail: snippet?.thumbnails?.high?.url || 
                  snippet?.thumbnails?.medium?.url || 
                  snippet?.thumbnails?.default?.url || '',
        channelTitle: snippet?.channelTitle || '',
        publishedAt: snippet?.publishedAt || '',
        viewCount: parseInt(details?.statistics?.viewCount || '0'),
        duration: details?.contentDetails?.duration || 'PT0S',
        relevanceScore: 0 // Will be calculated later
      });
    }
    
    return enrichedVideos;
  } catch (error) {
    console.error('YouTube search error:', error);
    return [];
  }
}

/**
 * Extract specific entities (people, companies, products) from text
 */
function extractKeyEntities(text: string): string {
  // Common patterns for extracting entities
  const entityPatterns = [
    /\b([A-Z][a-z]+ [A-Z][a-z]+)\b/g, // Person names (e.g., "Sundar Pichai")
    /\b(Google|Apple|Microsoft|Meta|Tesla|Amazon|Netflix|OpenAI|Nvidia|Intel|AMD)\b/gi, // Major companies
    /\b(CEO|CTO|founder|president|director)\b/gi, // Titles
    /\b([A-Z][a-zA-Z]{2,})\b/g // Proper nouns
  ];
  
  const entities = new Set<string>();
  
  entityPatterns.forEach(pattern => {
    const matches = text.match(pattern) || [];
    matches.forEach(match => entities.add(match.trim()));
  });
  
  return Array.from(entities).slice(0, 5).join(' ');
}

/**
 * Extract main topic from tweet text
 */
function extractMainTopic(text: string): string {
  // Remove common words and extract meaningful terms
  const stopWords = new Set(['the', 'is', 'was', 'are', 'were', 'will', 'be', 'have', 'has', 'had', 'do', 'does', 'did', 'can', 'could', 'should', 'would', 'this', 'that', 'with', 'from', 'they', 'them', 'their', 'said', 'say', 'says']);
  
  const words = text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 3 && !stopWords.has(word));
  
  return words.slice(0, 4).join(' ');
}

/**
 * Extract key terms from text, removing stop words and short terms
 */
function extractKeyTerms(text: string): string[] {
  const stopWords = new Set([
    'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'with', 'by',
    'from', 'up', 'about', 'into', 'through', 'during', 'before', 'after',
    'above', 'below', 'down', 'out', 'off', 'over', 'under', 'again', 'further',
    'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'any',
    'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor',
    'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'can', 'will',
    'just', 'should', 'now', 'this', 'that', 'these', 'those', 'is', 'are', 'was',
    'were', 'be', 'been', 'being', 'have', 'has', 'had', 'having', 'do', 'does',
    'did', 'doing', 'would', 'could', 'should', 'may', 'might', 'must', 'shall'
  ]);
  
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word))
    .filter(word => !/^\d+$/.test(word)); // Remove pure numbers
}

/**
 * Extract key phrases from text
 */
function extractKeyPhrases(text: string): string[] {
  // Split by punctuation and filter for meaningful phrases
  const phrases = text
    .replace(/[^\w\s.,!?-]/g, '')
    .split(/[.!?;]+/)
    .map(phrase => phrase.trim())
    .filter(phrase => phrase.length > 10 && phrase.length < 100)
    .filter(phrase => phrase.split(' ').length >= 2 && phrase.split(' ').length <= 8);
  
  return phrases;
}

/**
 * Convert ISO 8601 duration to minutes
 */
function parseDurationToMinutes(duration: string): number {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  
  const hours = parseInt(match[1] || '0');
  const minutes = parseInt(match[2] || '0');
  const seconds = parseInt(match[3] || '0');
  
  return hours * 60 + minutes + seconds / 60;
}

/**
 * Cache for search results to avoid duplicate API calls
 */
const searchCache = new Map<string, VideoSearchResult[]>();

/**
 * Cached search with TTL
 */
export function getCachedSearch(query: string): VideoSearchResult[] | null {
  return searchCache.get(query) || null;
}

export function setCachedSearch(query: string, results: VideoSearchResult[]): void {
  searchCache.set(query, results);
  
  // Simple TTL implementation - clear cache if it gets too large
  if (searchCache.size > 100) {
    const keysToDelete = Array.from(searchCache.keys()).slice(0, 50);
    keysToDelete.forEach(key => searchCache.delete(key));
  }
}

/**
 * Extract comprehensive entities and variations
 */
function extractAllEntities(text: string): string[] {
  const entities: string[] = [];
  
  // Extract the main entity query
  const mainEntity = extractKeyEntities(text);
  if (mainEntity) entities.push(mainEntity);
  
  // Extract person + company combinations
  const persons = text.match(/\b([A-Z][a-z]+ [A-Z][a-z]+)\b/g) || [];
  const companies = text.match(/\b(Google|Apple|Microsoft|Meta|Tesla|Amazon|Netflix|OpenAI|Nvidia|Intel|AMD|Facebook|Twitter|X|LinkedIn|TikTok|Spotify|Uber|Airbnb)\b/gi) || [];
  
  persons.forEach(person => {
    companies.forEach(company => {
      entities.push(`${person} ${company}`);
    });
  });
  
  return [...new Set(entities)].filter(e => e.length > 3);
}

/**
 * Extract topic variations for better coverage
 */
function extractTopicVariations(text: string): string[] {
  const topics: string[] = [];
  
  // Extract main topic
  const mainTopic = extractMainTopic(text);
  if (mainTopic) {
    topics.push(`${mainTopic} 2024 2023`);
    topics.push(`${mainTopic} interview`);
    topics.push(`${mainTopic} insights`);
    topics.push(`${mainTopic} strategy`);
  }
  
  return topics.filter(t => t.length > 5);
} 