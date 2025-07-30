import axios, { AxiosInstance } from 'axios';

// Simple and direct RapidAPI client
export class RapidAPIYouTubeClientV2 {
  private apiKey: string;
  private apiHost: string;
  private client: AxiosInstance;
  private lastRequestTime: number = 0;
  private requestDelay: number = 2000; // 2 seconds between requests - optimized for 13 req/min
  private requestCount: number = 0;
  private windowStart: number = Date.now();

  constructor() {
    this.apiKey = process.env.RAPIDAPI_KEY || '';
    this.apiHost = process.env.RAPIDAPI_HOST || 'youtube-video-fast-downloader-24-7.p.rapidapi.com';
    
    this.client = axios.create({
      baseURL: `https://${this.apiHost}`,
      headers: {
        'X-RapidAPI-Key': this.apiKey,
        'X-RapidAPI-Host': this.apiHost
      },
      timeout: 30000
    });
  }

  /**
   * Extract video ID from YouTube URL
   */
  private extractVideoId(url: string): string | null {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([^&\n?#]+)/,
      /youtube\.com\/shorts\/([^&\n?#]+)/
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }

    return null;
  }

  /**
   * Wait if needed to respect rate limits (13 requests per minute)
   */
  private async waitIfNeeded(): Promise<void> {
    const now = Date.now();
    
    // Reset window if more than a minute has passed
    if (now - this.windowStart > 60000) {
      this.windowStart = now;
      this.requestCount = 0;
    }
    
    // If we've hit the limit, wait until next window
    if (this.requestCount >= 13) {
      const waitTime = 60000 - (now - this.windowStart) + 1000; // +1s buffer
      console.log(`⏳ Rate limit reached (13/13). Waiting ${Math.ceil(waitTime / 1000)}s for next window...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      this.windowStart = Date.now();
      this.requestCount = 0;
    }
    
    // Enforce minimum delay between requests
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (this.lastRequestTime > 0 && timeSinceLastRequest < this.requestDelay) {
      const waitTime = this.requestDelay - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequestTime = Date.now();
    this.requestCount++;
  }

  /**
   * Get video info (simple version)
   */
  async getVideoInfo(videoUrl: string): Promise<any> {
    const videoId = this.extractVideoId(videoUrl);
    if (!videoId) throw new Error('Invalid YouTube URL');

    await this.waitIfNeeded();

    try {
      const response = await this.client.get(`/get-video-info/${videoId}`);
      return response.data;
    } catch (error: any) {
      console.error('Video info error:', error.response?.data || error.message);
      // Return minimal info on error
      return {
        title: 'Unknown',
        duration: 0,
        videoId: videoId
      };
    }
  }

  /**
   * Download audio directly without quality checks
   */
  async downloadAudio(videoUrl: string): Promise<{ url: string }> {
    const videoId = this.extractVideoId(videoUrl);
    if (!videoId) throw new Error('Invalid YouTube URL');

    console.log(`🎵 Downloading audio for: ${videoId}`);
    await this.waitIfNeeded();

    try {
      // Try direct download endpoint
      const response = await this.client.get(`/download_audio/${videoId}`);
      
      // Try different response fields
      const downloadUrl = response.data?.url || 
                         response.data?.download_url || 
                         response.data?.file ||
                         response.data?.link;
      
      if (downloadUrl) {
        console.log(`✅ Got audio download URL`);
        return { url: downloadUrl };
      }

      // If no URL in response, throw error
      throw new Error('No download URL in response');
    } catch (error: any) {
      console.error('Audio download error:', error.response?.data || error.message);
      
      // Try alternative endpoints
      if (error.response?.status === 404) {
        console.log('⚠️ Trying alternative audio endpoint...');
        await this.waitIfNeeded();
        
        try {
          const altResponse = await this.client.get(`/audio/${videoId}`);
          const altUrl = altResponse.data?.url || 
                        altResponse.data?.download_url || 
                        altResponse.data?.file;
          
          if (altUrl) {
            return { url: altUrl };
          }
        } catch (altError) {
          console.error('Alternative endpoint failed:', altError);
        }
      }
      
      throw new Error(`Audio download failed: ${error.message}`);
    }
  }

  /**
   * Download video directly
   */
  async downloadVideo(videoUrl: string, quality: string = '720'): Promise<{ url: string }> {
    const videoId = this.extractVideoId(videoUrl);
    if (!videoId) throw new Error('Invalid YouTube URL');

    console.log(`📹 Downloading video for: ${videoId} (quality: ${quality})`);
    await this.waitIfNeeded();

    try {
      // Check if it's a short
      const isShort = videoUrl.includes('/shorts/');
      const endpoint = isShort ? `/download_short/${videoId}` : `/download_video/${videoId}`;
      
      const response = await this.client.get(endpoint, {
        params: { quality }
      });
      
      const downloadUrl = response.data?.url || 
                         response.data?.download_url || 
                         response.data?.file ||
                         response.data?.link;
      
      if (downloadUrl) {
        console.log(`✅ Got video download URL`);
        return { url: downloadUrl };
      }

      throw new Error('No download URL in response');
    } catch (error: any) {
      console.error('Video download error:', error.response?.data || error.message);
      throw new Error(`Video download failed: ${error.message}`);
    }
  }
}

// Export singleton instance
let clientInstance: RapidAPIYouTubeClientV2 | null = null;

export const getRapidAPIClientV2 = (): RapidAPIYouTubeClientV2 => {
  if (!clientInstance) {
    clientInstance = new RapidAPIYouTubeClientV2();
  }
  return clientInstance;
};