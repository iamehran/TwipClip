import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

const writeFile = promisify(fs.writeFile);

// Simple rate limiter
class RateLimiter {
  private requests: number[] = [];
  private readonly maxRequests: number;
  private readonly timeWindow: number;

  constructor(maxRequests: number = 13, timeWindowMs: number = 60000) {
    this.maxRequests = maxRequests;
    this.timeWindow = timeWindowMs;
  }

  async waitIfNeeded(): Promise<void> {
    const now = Date.now();
    // Remove old requests outside the time window
    this.requests = this.requests.filter(time => now - time < this.timeWindow);
    
    if (this.requests.length >= this.maxRequests) {
      // Calculate wait time
      const oldestRequest = this.requests[0];
      const waitTime = (oldestRequest + this.timeWindow) - now + 1000; // Add 1 second buffer
      console.log(`⏳ Rate limit reached (${this.requests.length}/${this.maxRequests}). Waiting ${Math.ceil(waitTime / 1000)}s...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      // Retry
      return this.waitIfNeeded();
    }
    
    this.requests.push(now);
  }
}

export interface VideoQuality {
  id: number;
  quality?: string;
  bitrate: number;
  size: string;
  type: 'video' | 'audio';
  mime: string;
}

export interface DownloadResponse {
  id: number;
  quality?: string;
  bitrate: number;
  size: string;
  mime: string;
  file: string;
  comment: string;
}

export interface VideoInfo {
  // This interface is not fully defined in the original file,
  // but it's implied by the new_code. Adding a placeholder.
}

export class RapidAPIYouTubeClient {
  private apiKey: string;
  private apiHost: string;
  private rateLimiter: RateLimiter;
  private qualityCache: Map<string, VideoQuality[]> = new Map();

  constructor() {
    this.apiKey = process.env.RAPIDAPI_KEY || '';
    this.apiHost = process.env.RAPIDAPI_HOST || 'youtube-video-fast-downloader-24-7.p.rapidapi.com';
    // Updated to 15 requests per minute for Pro plan
    this.rateLimiter = new RateLimiter(13, 60000);
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
   * Make a request with retry logic for 429 errors
   */
  private async makeRequestWithRetry(config: any, maxRetries: number = 3): Promise<any> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await axios(config);
      } catch (error: any) {
        if (error.response?.status === 429 && attempt < maxRetries) {
          const waitTime = Math.min(30000, 5000 * attempt); // 5s, 10s, 15s
          console.log(`⚠️ Rate limit hit (429). Retry ${attempt}/${maxRetries} after ${waitTime/1000}s...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }
        throw error;
      }
    }
  }

  /**
   * Get available video qualities
   */
  async getAvailableQualities(videoUrl: string): Promise<VideoQuality[]> {
    if (!this.apiKey) {
      throw new Error('RAPIDAPI_KEY environment variable is not set');
    }

    const videoId = this.extractVideoId(videoUrl);
    if (!videoId) {
      throw new Error('Invalid YouTube URL');
    }

    // Check cache first
    if (this.qualityCache.has(videoId)) {
      console.log(`✅ Using cached qualities for video: ${videoId}`);
      return this.qualityCache.get(videoId)!;
    }

    await this.rateLimiter.waitIfNeeded();
    
    try {
      console.log(`🔍 Getting available qualities for video: ${videoId}`);
      
      const response = await this.makeRequestWithRetry({
        method: 'GET',
        url: `https://${this.apiHost}/get_available_quality/${videoId}`, // Fixed endpoint
        headers: {
          'X-RapidAPI-Key': this.apiKey,
          'X-RapidAPI-Host': this.apiHost
        },
        timeout: 30000
      });

      const qualities: VideoQuality[] = response.data.formats
        ?.filter((f: any) => f.quality || f.qualityLabel)
        ?.map((f: any) => ({
          id: f.itag || f.format_id,
          quality: f.qualityLabel || f.quality || f.format_note || 'Unknown',
          type: f.mimeType?.includes('audio') || f.acodec !== 'none' ? 'audio' : 'video',
          bitrate: f.abr || f.tbr || f.bitrate || 0,
          size: f.filesize || f.filesize_approx || 'N/A',
          mime: f.mimeType || f.ext || 'Unknown'
        })) || [];

      console.log(`✅ Found ${qualities.length} quality options`);
      
      // Cache the result
      this.qualityCache.set(videoId, qualities);
      
      return qualities;
    } catch (error: any) {
      console.error('Failed to get qualities:', error.response?.data || error.message);
      throw new Error(`Failed to get video qualities: ${error.message}`);
    }
  }

  /**
   * Get video info
   */
  async getVideoInfo(videoUrl: string): Promise<any> {
    if (!this.apiKey) {
      throw new Error('RAPIDAPI_KEY environment variable is not set');
    }

    await this.rateLimiter.waitIfNeeded();
    
    const videoId = this.extractVideoId(videoUrl);
    if (!videoId) {
      throw new Error('Invalid YouTube URL');
    }

    try {
      const response = await this.makeRequestWithRetry({
        method: 'GET',
        url: `https://${this.apiHost}/get-video-info/${videoId}`, // Fixed endpoint
        headers: {
          'X-RapidAPI-Key': this.apiKey,
          'X-RapidAPI-Host': this.apiHost
        },
        timeout: 30000
      });

      return response.data;
    } catch (error: any) {
      console.error('Failed to get video info:', error.response?.data || error.message);
      throw new Error(`Failed to get video info: ${error.message}`);
    }
  }

  /**
   * Get audio download URL - optimized to skip quality check
   */
  async getAudioDownloadUrl(videoUrl: string, preferredQuality?: number): Promise<DownloadResponse> {
    if (!this.apiKey) {
      throw new Error('RAPIDAPI_KEY environment variable is not set');
    }

    await this.rateLimiter.waitIfNeeded();
    
    const videoId = this.extractVideoId(videoUrl);
    if (!videoId) {
      throw new Error('Invalid YouTube URL');
    }

    // ALWAYS check qualities first for audio - don't assume quality 140 exists
    console.log(`🎵 Getting audio for video: ${videoId}`);
    
    try {
      const qualities = await this.getAvailableQualities(videoUrl);
      const audioQualities = qualities.filter(q => q.type === 'audio');
      
      if (audioQualities.length === 0) {
        throw new Error('No audio qualities available for this video');
      }

      // Select best audio quality (prefer m4a over opus)
      const selectedQuality = audioQualities.sort((a, b) => {
        // Prefer m4a/mp4 formats
        if (a.mime.includes('mp4') && !b.mime.includes('mp4')) return -1;
        if (!a.mime.includes('mp4') && b.mime.includes('mp4')) return 1;
        // Then sort by bitrate
        return b.bitrate - a.bitrate;
      })[0];

      console.log(`📊 Selected audio quality: ${selectedQuality.mime} (bitrate: ${selectedQuality.bitrate}, id: ${selectedQuality.id})`);
      
      // Now get the download URL
      await this.rateLimiter.waitIfNeeded();
      
      const response = await this.makeRequestWithRetry({
        method: 'GET',
        url: `https://${this.apiHost}/download_audio/${videoId}`, // Fixed endpoint
        params: {
          quality: selectedQuality.id
        },
        headers: {
          'X-RapidAPI-Key': this.apiKey,
          'X-RapidAPI-Host': this.apiHost
        },
        timeout: 30000
      });

      // Check response structure
      const downloadUrl = response.data?.download_url || response.data?.url || response.data?.file;
      if (!downloadUrl) {
        console.error('Unexpected response structure:', response.data);
        throw new Error('Invalid response from download API');
      }

      return {
        id: selectedQuality.id,
        quality: selectedQuality.quality,
        bitrate: selectedQuality.bitrate,
        size: selectedQuality.size,
        mime: selectedQuality.mime,
        file: downloadUrl,
        comment: ''
      };
    } catch (error: any) {
      console.error('Failed to get audio download URL:', error.response?.data || error.message);
      throw new Error(`Failed to get audio download URL: ${error.message}`);
    }
  }

  /**
   * Get video download URL
   */
  async getVideoDownloadUrl(videoUrl: string, quality: string = '720p'): Promise<DownloadResponse> {
    if (!this.apiKey) {
      throw new Error('RAPIDAPI_KEY environment variable is not set');
    }

    await this.rateLimiter.waitIfNeeded();
    
    const videoId = this.extractVideoId(videoUrl);
    if (!videoId) {
      throw new Error('Invalid YouTube URL');
    }

    try {
      const qualities = await this.getAvailableQualities(videoUrl);
      const videoQualities = qualities.filter(q => q.type === 'video');

      // Find the closest quality match
      let selectedQuality = videoQualities.find(q => q.quality && q.quality.includes(quality));
      if (!selectedQuality && videoQualities.length > 0) {
        // Sort by quality and pick the best available under the requested quality
        const qualityNum = parseInt(quality);
        selectedQuality = videoQualities
          .filter(q => {
            const qNum = parseInt(q.quality || '0');
            return !isNaN(qNum) && qNum <= qualityNum;
          })
          .sort((a, b) => parseInt(b.quality || '0') - parseInt(a.quality || '0'))[0] || videoQualities[0];
      }

      if (!selectedQuality) {
        throw new Error('No video qualities available');
      }

      console.log(`📹 Requesting video download for ${videoId} with quality: ${selectedQuality.quality} (ID: ${selectedQuality.id})`);
      
      await this.rateLimiter.waitIfNeeded();
      
      // Check if it's a YouTube Short and use appropriate endpoint
      const isShort = videoUrl.includes('/shorts/');
      const endpoint = isShort ? 'download_short' : 'download_video';
      
      const response = await this.makeRequestWithRetry({
        method: 'GET',
        url: `https://${this.apiHost}/${endpoint}/${videoId}`, // Fixed endpoint
        params: {
          quality: selectedQuality.id
        },
        headers: {
          'X-RapidAPI-Key': this.apiKey,
          'X-RapidAPI-Host': this.apiHost
        },
        timeout: 30000
      });

      const downloadUrl = response.data?.download_url || response.data?.url || response.data?.file;
      if (!downloadUrl) {
        console.error('Unexpected response structure:', response.data);
        throw new Error('Invalid response from download API');
      }

      return {
        id: selectedQuality.id,
        quality: selectedQuality.quality,
        bitrate: selectedQuality.bitrate,
        size: selectedQuality.size,
        mime: selectedQuality.mime,
        file: downloadUrl,
        comment: ''
      };
    } catch (error: any) {
      console.error('Failed to get video download URL:', error.response?.data || error.message);
      throw new Error(`Failed to get video download URL: ${error.message}`);
    }
  }

  /**
   * Wait for file to be ready and download it
   */
  async waitAndDownloadFile(downloadUrl: string, outputPath: string, type: string = 'video', qualityId: string = ''): Promise<void> {
    console.log(`⏳ Waiting for file to be ready at: ${downloadUrl}`);
    
    // Ensure directory exists
    await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
    
    let attempts = 0;
    
    while (attempts < 20) { // Increased maxAttempts to 20
      attempts++;
      
      try {
        // Try to download the file
        const response = await axios.get(downloadUrl, {
          responseType: 'stream',
          timeout: 300000, // 5 minutes for download
          validateStatus: (status) => status === 200 // Only accept 200 OK
        });

        // Save to file
        const stream = fs.createWriteStream(outputPath);
        
        return new Promise((resolve, reject) => {
          response.data.pipe(stream);
          
          stream.on('finish', () => {
            console.log(`✅ File downloaded successfully to: ${outputPath}`);
            resolve();
          });
          
          stream.on('error', (error: any) => {
            console.error('Stream error:', error);
            reject(new Error(`Failed to save file: ${error.message}`));
          });
        });
        
      } catch (error: any) {
        // If we get a 404, the file isn't ready yet
        if (error.response?.status === 404) {
          console.log(`⏳ File not ready yet (attempt ${attempts}/${20}), waiting 5 seconds...`);
          await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
          continue;
        }
        
        // For other errors, throw immediately
        console.error(`Download error (attempt ${attempts}):`, error.message);
        throw error;
      }
    }
    
    throw new Error(`File was not ready after ${attempts} attempts`);
  }

  /**
   * Download audio from YouTube video
   */
  async downloadAudio(videoUrl: string, outputPath: string): Promise<void> {
    console.log(`🎵 Downloading audio from: ${videoUrl}`);
    
    const downloadInfo = await this.getAudioDownloadUrl(videoUrl);
    
    // Extract quality ID as string
    const qualityId = downloadInfo.id.toString();
    
    await this.waitAndDownloadFile(downloadInfo.file, outputPath, 'audio', qualityId);
  }

  /**
   * Download video from YouTube
   */
  async downloadVideo(videoUrl: string, outputPath: string, quality?: string): Promise<void> {
    const downloadInfo = await this.getVideoDownloadUrl(videoUrl, quality || '720p');
    await this.waitAndDownloadFile(downloadInfo.file, outputPath, 'video', downloadInfo.id.toString());
  }
}

// Export singleton instance with lazy initialization
let _rapidAPIClient: RapidAPIYouTubeClient | null = null;

export const rapidAPIClient = {
  _rapidAPIClient: _rapidAPIClient,
  getVideoInfo: async (videoUrl: string) => {
    if (!_rapidAPIClient) _rapidAPIClient = new RapidAPIYouTubeClient();
    return _rapidAPIClient.getVideoInfo(videoUrl);
  },
  getAvailableQualities: async (videoUrl: string) => {
    if (!_rapidAPIClient) _rapidAPIClient = new RapidAPIYouTubeClient();
    return _rapidAPIClient.getAvailableQualities(videoUrl);
  },
  getAudioDownloadUrl: async (videoUrl: string, preferredQuality?: number) => {
    if (!_rapidAPIClient) _rapidAPIClient = new RapidAPIYouTubeClient();
    return _rapidAPIClient.getAudioDownloadUrl(videoUrl, preferredQuality);
  },
  getVideoDownloadUrl: async (videoUrl: string, quality?: string) => {
    if (!_rapidAPIClient) _rapidAPIClient = new RapidAPIYouTubeClient();
    return _rapidAPIClient.getVideoDownloadUrl(videoUrl, quality);
  },
  downloadAudio: async (videoUrl: string, outputPath: string) => {
    if (!_rapidAPIClient) _rapidAPIClient = new RapidAPIYouTubeClient();
    return _rapidAPIClient.downloadAudio(videoUrl, outputPath);
  },
  downloadVideo: async (videoUrl: string, outputPath: string, quality?: string) => {
    if (!_rapidAPIClient) _rapidAPIClient = new RapidAPIYouTubeClient();
    return _rapidAPIClient.downloadVideo(videoUrl, outputPath, quality);
  }
}; 