/**
 * RapidAPI Configuration and Optimization Settings
 */

export const RAPIDAPI_CONFIG = {
  // Rate limiting
  MAX_REQUESTS_PER_MINUTE: 13, // Pro plan limit (using 13 instead of 15 to be safe)
  
  // Default audio quality (itag)
  DEFAULT_AUDIO_QUALITY: 140, // Standard m4a 128k - works for 99% of videos
  
  // Fallback audio qualities in order of preference
  FALLBACK_AUDIO_QUALITIES: [
    140, // m4a 128k
    251, // opus 160k
    250, // opus 70k
    249, // opus 50k
  ],
  
  // Delay between videos (milliseconds)
  INTER_VIDEO_DELAY: 4000, // 4 seconds
  
  // Cache settings
  QUALITY_CACHE_ENABLED: true,
  QUALITY_CACHE_TTL: 3600000, // 1 hour in milliseconds
  
  // Retry settings
  MAX_RETRIES: 3,
  RETRY_DELAYS: [5000, 10000, 15000], // 5s, 10s, 15s
  
  // API endpoints that count against rate limit
  RATE_LIMITED_ENDPOINTS: [
    'get_available_quality',
    'get_download_url',
    'get_video_details'
  ]
};

/**
 * Calculate optimal request distribution
 */
export function calculateOptimalRequestTiming(videoCount: number): {
  batchSize: number;
  delayBetweenBatches: number;
  estimatedTime: number;
} {
  const maxRequestsPerMinute = RAPIDAPI_CONFIG.MAX_REQUESTS_PER_MINUTE;
  
  // For audio extraction, we need 1 request per video (optimized)
  // Previously we needed 2 (quality check + download)
  const requestsPerVideo = 1;
  const totalRequests = videoCount * requestsPerVideo;
  
  // Calculate batches
  const batchSize = Math.floor(maxRequestsPerMinute / requestsPerVideo);
  const numberOfBatches = Math.ceil(videoCount / batchSize);
  
  // 60 seconds between batches to respect rate limit
  const delayBetweenBatches = 60000;
  
  // Estimated total time
  const estimatedTime = (numberOfBatches - 1) * delayBetweenBatches;
  
  return {
    batchSize,
    delayBetweenBatches,
    estimatedTime
  };
}

/**
 * Get user-friendly time estimate
 */
export function getTimeEstimate(seconds: number): string {
  if (seconds < 60) {
    return `${seconds} seconds`;
  } else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return remainingSeconds > 0 
      ? `${minutes} minutes ${remainingSeconds} seconds`
      : `${minutes} minutes`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return minutes > 0
      ? `${hours} hours ${minutes} minutes`
      : `${hours} hours`;
  }
} 