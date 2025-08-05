import axios, { AxiosInstance } from 'axios';

// Simple and direct RapidAPI client
export class RapidAPIYouTubeClientV2 {
  private apiKey: string;
  private apiHost: string;
  private client: AxiosInstance;
  private lastRequestTime: number = 0;
  private requestDelay: number = 1500; // 1.5 seconds between requests - optimized for 28 req/min
  private requestCount: number = 0;
  private windowStart: number = Date.now();
  private qualityCache: Map<string, { qualities: any[], timestamp: number }> = new Map();

  constructor() {
    this.apiKey = process.env.RAPIDAPI_KEY || '';
    this.apiHost = process.env.RAPIDAPI_HOST || 'youtube-video-fast-downloader-24-7.p.rapidapi.com';
    
    this.client = axios.create({
      baseURL: `https://${this.apiHost}`,
      headers: {
        'X-RapidAPI-Key': this.apiKey,
        'X-RapidAPI-Host': this.apiHost
      },
      timeout: 60000  // Increased to 60 seconds
    });
  }

  /**
   * Extract video ID from YouTube URL using proper URL parsing
   */
  private extractVideoId(url: string): string | null {
    try {
      const cleanUrl = url.trim();
      
      // Handle youtu.be short URLs
      if (cleanUrl.includes('youtu.be/')) {
        const match = cleanUrl.match(/youtu\.be\/([^?#&]+)/);
        if (match) return match[1];
      }
      
      // Handle youtube.com URLs
      if (cleanUrl.includes('youtube.com')) {
        const urlObj = new URL(cleanUrl);
        
        // Check for video ID in query parameters (most common)
        const videoId = urlObj.searchParams.get('v');
        if (videoId) return videoId;
        
        // Check for shorts
        if (urlObj.pathname.includes('/shorts/')) {
          const match = urlObj.pathname.match(/\/shorts\/([^/?#]+)/);
          if (match) return match[1];
        }
        
        // Check for embed URLs
        if (urlObj.pathname.includes('/embed/')) {
          const match = urlObj.pathname.match(/\/embed\/([^/?#]+)/);
          if (match) return match[1];
        }
        
        // Check for /v/ URLs (older format)
        if (urlObj.pathname.includes('/v/')) {
          const match = urlObj.pathname.match(/\/v\/([^/?#]+)/);
          if (match) return match[1];
        }
      }
      
      return null;
    } catch (error) {
      // If URL parsing fails, return null
      console.error('Error parsing YouTube URL:', error);
      return null;
    }
  }

  /**
   * Wait if needed to respect rate limits (28 requests per minute - Ultra plan)
   */
  private async waitIfNeeded(): Promise<void> {
    const now = Date.now();
    
    // Reset window if more than a minute has passed
    if (now - this.windowStart > 60000) {
      this.windowStart = now;
      this.requestCount = 0;
    }
    
    // If we've hit the limit, wait until next window
    if (this.requestCount >= 28) {
      const waitTime = 60000 - (now - this.windowStart) + 1000; // +1s buffer
      console.log(`⏳ Rate limit reached (28/28). Waiting ${Math.ceil(waitTime / 1000)}s for next window...`);
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
   * Get video info with formats
   */
  async getVideoInfo(videoUrl: string): Promise<any> {
    const videoId = this.extractVideoId(videoUrl);
    if (!videoId) throw new Error('Invalid YouTube URL');

    await this.waitIfNeeded();

    try {
      const response = await this.client.get(`/get-video-info/${videoId}`);
      
      // Log available formats if present
      if (response.data?.formats) {
        console.log(`📋 Available formats for ${videoId}:`);
        response.data.formats.forEach((f: any) => {
          if (f.itag && f.qualityLabel) {
            console.log(`  - itag ${f.itag}: ${f.qualityLabel} (${f.mimeType})`);
          }
        });
      }
      
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
   * Get video download URL with proper quality selection
   */
  async getVideoDownloadUrl(videoUrl: string, quality: string = '720'): Promise<{ url: string }> {
    const videoId = this.extractVideoId(videoUrl);
    if (!videoId) throw new Error('Invalid YouTube URL');

    console.log(`📹 Downloading video for: ${videoId} (quality: ${quality})`);
    await this.waitIfNeeded();

    try {
      // Step 1: Get available quality options (check cache first)
      let availableQualities;
      const cacheKey = videoId;
      const cached = this.qualityCache.get(cacheKey);
      const cacheMaxAge = 30 * 60 * 1000; // 30 minutes
      
      if (cached && (Date.now() - cached.timestamp) < cacheMaxAge) {
        console.log(`📦 Using cached quality options for ${videoId}`);
        availableQualities = cached.qualities;
      } else {
        console.log(`🔍 Getting available quality options for ${videoId}...`);
        const qualityResponse = await this.client.get(`/get_available_quality/${videoId}`);
        availableQualities = qualityResponse.data;
        
        // Cache the result
        this.qualityCache.set(cacheKey, { 
          qualities: availableQualities, 
          timestamp: Date.now() 
        });
      }
      
      if (!Array.isArray(availableQualities) || availableQualities.length === 0) {
        throw new Error('No quality options available for this video');
      }
      
      console.log(`📋 Available qualities:`);
      availableQualities.forEach((q: any) => {
        if (q.type === 'video') {
          console.log(`  - ID: ${q.id}, Quality: ${q.quality}, Size: ${q.size}, Type: ${q.type}`);
        }
      });
      
      // Step 2: Find 720p quality ID (not itag!)
      const targetQuality = quality.replace('p', ''); // '720p' -> '720'
      const qualityOption = availableQualities.find((q: any) => 
        q.type === 'video' && 
        q.quality === `${targetQuality}p`
      );
      
      if (!qualityOption) {
        // Log what's available if 720p not found
        const availableVideoQualities = availableQualities
          .filter((q: any) => q.type === 'video')
          .map((q: any) => q.quality)
          .join(', ');
        
        throw new Error(`720p quality not available. Available qualities: ${availableVideoQualities}`);
      }
      
      console.log(`✅ Found 720p quality with ID: ${qualityOption.id}`);
      
      // Step 3: Download with the correct quality ID
      const isShort = videoUrl.includes('/shorts/');
      const endpoint = isShort ? `/download_short/${videoId}` : `/download_video/${videoId}`;
      
      console.log(`📡 Requesting ${endpoint}?quality=${qualityOption.id}`);
      
      const response = await this.client.get(`${endpoint}?quality=${qualityOption.id}`);
      console.log(`📥 Download response:`, {
        status: response.status,
        quality: response.data?.quality,
        size: response.data?.size
      });
      
      const downloadUrl = response.data?.file || 
                         response.data?.url || 
                         response.data?.download_url || 
                         response.data?.link;
      
      if (downloadUrl) {
        console.log(`✅ Got video download URL for quality ${response.data?.quality || 'unknown'}`);
        return { url: downloadUrl };
      }

      throw new Error('No download URL in response');
    } catch (error: any) {
      console.error('Video download error:', error.response?.data || error.message);
      throw new Error(`Failed to download video: ${error.message}`);
    }
  }

  /**
   * Download video and save to file
   */
  async downloadVideo(videoUrl: string, outputPath: string, quality?: string): Promise<void> {
    // Normalize quality parameter - RapidAPI expects numbers only (720, not 720p)
    const normalizedQuality = quality ? quality.replace(/[^0-9]/g, '') : '720';
    
    // We only support 720p - no lower quality fallbacks
    if (normalizedQuality !== '720') {
      console.warn(`⚠️ Requested quality ${quality} normalized to ${normalizedQuality}, but we only support 720p`);
    }
    
    console.log(`📹 Downloading video in 720p HD (itag 22)`);
    const downloadInfo = await this.getVideoDownloadUrl(videoUrl, normalizedQuality);
    await this.waitAndDownloadFile(downloadInfo.url, outputPath);
  }

  /**
   * Wait for file to be ready and download it (optimized with HEAD checks)
   */
  private async waitAndDownloadFile(downloadUrl: string, outputPath: string): Promise<void> {
    console.log(`⏳ Checking file availability at: ${downloadUrl}`);
    
    // Ensure directory exists
    const dir = require('path').dirname(outputPath);
    await require('fs').promises.mkdir(dir, { recursive: true });
    
    let attempts = 0;
    const maxAttempts = 20;
    
    // Phase 1: Use HEAD requests to check file availability (saves bandwidth)
    while (attempts < maxAttempts) {
      attempts++;
      
      try {
        // Use HEAD request to check if file exists without downloading
        await axios.head(downloadUrl, {
          timeout: 5000,
          validateStatus: (status: number) => status === 200
        });
        
        console.log(`✅ File is ready after ${attempts} checks!`);
        break;
        
      } catch (error: any) {
        if (error.response?.status === 404) {
          // Smart wait strategy based on attempt number
          let waitTime: number;
          if (attempts <= 3) {
            waitTime = 3000; // First 3 attempts: 3 seconds
          } else if (attempts <= 6) {
            waitTime = 5000; // Next 3 attempts: 5 seconds
          } else {
            waitTime = 10000; // Remaining: 10 seconds
          }
          
          console.log(`⏳ File not ready (check ${attempts}/${maxAttempts}), waiting ${waitTime/1000}s...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }
        
        // For other errors, throw
        throw new Error(`HEAD request failed: ${error.message}`);
      }
    }
    
    if (attempts >= maxAttempts) {
      throw new Error(`File not ready after ${maxAttempts} checks`);
    }
    
    // Phase 2: Download the file
    console.log(`📥 Downloading file...`);
    const downloadTimeout = parseInt(process.env.RAPIDAPI_DOWNLOAD_TIMEOUT || '300000');
    
    try {
      const response = await axios.get(downloadUrl, {
        responseType: 'stream',
        timeout: downloadTimeout,
        validateStatus: (status: number) => status === 200
      });

      // Save to file
      const stream = require('fs').createWriteStream(outputPath);
      
      return new Promise((resolve, reject) => {
        let downloadedSize = 0;
        
        response.data.on('data', (chunk: any) => {
          downloadedSize += chunk.length;
          // Log progress every 10MB
          if (downloadedSize % (10 * 1024 * 1024) < chunk.length) {
            console.log(`📊 Downloaded: ${(downloadedSize / 1024 / 1024).toFixed(1)}MB`);
          }
        });
        
        response.data.pipe(stream);
        
        stream.on('finish', () => {
          console.log(`✅ File downloaded successfully: ${(downloadedSize / 1024 / 1024).toFixed(1)}MB`);
          resolve();
        });
        
        stream.on('error', (error: any) => {
          console.error('Stream error:', error);
          reject(new Error(`Failed to save file: ${error.message}`));
        });
        
        response.data.on('error', (error: any) => {
          console.error('Download error:', error);
          reject(new Error(`Failed to download file: ${error.message}`));
        });
      });
    } catch (error: any) {
      throw new Error(`Failed to download file: ${error.message}`);
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