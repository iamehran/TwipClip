import axios from 'axios';

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

export class RapidAPIYouTubeClient {
  private apiKey: string;
  private apiHost: string;
  
    constructor() {
    this.apiKey = process.env.RAPIDAPI_KEY || '';
    this.apiHost = process.env.RAPIDAPI_HOST || 'youtube-video-fast-downloader-24-7.p.rapidapi.com';
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
   * Get available quality options for a video
   */
  async getAvailableQualities(videoUrl: string): Promise<VideoQuality[]> {
    if (!this.apiKey) {
      throw new Error('RAPIDAPI_KEY environment variable is not set');
    }
    
    const videoId = this.extractVideoId(videoUrl);
    if (!videoId) {
      throw new Error('Invalid YouTube URL');
    }

    console.log(`🔍 Getting available qualities for video: ${videoId}`);

    try {
      const response = await axios.get(
        `https://${this.apiHost}/get_available_quality/${videoId}`,
        {
          headers: {
            'X-RapidAPI-Key': this.apiKey,
            'X-RapidAPI-Host': this.apiHost
          },
          timeout: 30000
        }
      );

      console.log(`✅ Found ${response.data.length} quality options`);
      return response.data;
    } catch (error: any) {
      console.error('Failed to get qualities:', error.response?.data || error.message);
      throw new Error(`Failed to get video qualities: ${error.message}`);
    }
  }

  /**
   * Get audio download URL
   */
  async getAudioDownloadUrl(videoUrl: string, preferredQuality?: number): Promise<DownloadResponse> {
    if (!this.apiKey) {
      throw new Error('RAPIDAPI_KEY environment variable is not set');
    }
    
    const videoId = this.extractVideoId(videoUrl);
    if (!videoId) {
      throw new Error('Invalid YouTube URL');
    }

    // If no preferred quality, get available qualities first
    let qualityId = preferredQuality;
    
    if (!qualityId) {
      const qualities = await this.getAvailableQualities(videoUrl);
      
      // Find best audio quality (prefer m4a/mp4 over opus)
      const audioQualities = qualities
        .filter(q => q.type === 'audio')
        .sort((a, b) => {
          // Prefer m4a/mp4 formats
          if (a.mime.includes('mp4') && !b.mime.includes('mp4')) return -1;
          if (!a.mime.includes('mp4') && b.mime.includes('mp4')) return 1;
          // Then sort by bitrate
          return b.bitrate - a.bitrate;
        });

      if (audioQualities.length === 0) {
        throw new Error('No audio qualities available');
      }

      qualityId = audioQualities[0].id;
      console.log(`📊 Selected audio quality: ${audioQualities[0].mime} (bitrate: ${audioQualities[0].bitrate})`);
    }

    console.log(`🎵 Requesting audio download for video: ${videoId} with quality ID: ${qualityId}`);

    try {
      const response = await axios.get(
        `https://${this.apiHost}/download_audio/${videoId}?quality=${qualityId}`,
        {
          headers: {
            'X-RapidAPI-Key': this.apiKey,
            'X-RapidAPI-Host': this.apiHost
          },
          timeout: 30000
        }
      );

      console.log('✅ Got audio download URL');
      return response.data;
    } catch (error: any) {
      console.error('Failed to get audio URL:', error.response?.data || error.message);
      throw new Error(`Failed to get audio download URL: ${error.message}`);
    }
  }

  /**
   * Get video download URL
   */
  async getVideoDownloadUrl(videoUrl: string, preferredQuality?: number): Promise<DownloadResponse> {
    if (!this.apiKey) {
      throw new Error('RAPIDAPI_KEY environment variable is not set');
    }
    
    const videoId = this.extractVideoId(videoUrl);
    if (!videoId) {
      throw new Error('Invalid YouTube URL');
    }

    // If no preferred quality, get available qualities first
    let qualityId = preferredQuality;
    
    if (!qualityId) {
      const qualities = await this.getAvailableQualities(videoUrl);
      
      // Find best video quality (prefer 720p mp4)
      const videoQualities = qualities
        .filter(q => q.type === 'video')
        .sort((a, b) => {
          // Prefer 720p
          if (a.quality === '720p' && b.quality !== '720p') return -1;
          if (a.quality !== '720p' && b.quality === '720p') return 1;
          // Prefer mp4
          if (a.mime.includes('mp4') && !b.mime.includes('mp4')) return -1;
          if (!a.mime.includes('mp4') && b.mime.includes('mp4')) return 1;
          // Then sort by quality
          const qualityOrder = ['1080p', '720p', '480p', '360p', '240p', '144p'];
          return qualityOrder.indexOf(a.quality || '') - qualityOrder.indexOf(b.quality || '');
        });

      if (videoQualities.length === 0) {
        throw new Error('No video qualities available');
      }

      qualityId = videoQualities[0].id;
      console.log(`📊 Selected video quality: ${videoQualities[0].quality} ${videoQualities[0].mime}`);
    }

    console.log(`🎬 Requesting video download for: ${videoId} with quality ID: ${qualityId}`);

    try {
      const response = await axios.get(
        `https://${this.apiHost}/download_video/${videoId}?quality=${qualityId}`,
        {
          headers: {
            'X-RapidAPI-Key': this.apiKey,
            'X-RapidAPI-Host': this.apiHost
          },
          timeout: 30000
        }
      );

      console.log('✅ Got video download URL');
      return response.data;
    } catch (error: any) {
      console.error('Failed to get video URL:', error.response?.data || error.message);
      throw new Error(`Failed to get video download URL: ${error.message}`);
    }
  }

  /**
   * Wait for file to be ready and download it
   */
  async waitAndDownloadFile(downloadUrl: string, outputPath: string, maxAttempts: number = 20): Promise<void> {
    console.log(`⏳ Waiting for file to be ready at: ${downloadUrl}`);
    
    const fs = require('fs').promises;
    const path = require('path');
    
    // Ensure directory exists
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    
    let attempts = 0;
    
    while (attempts < maxAttempts) {
      attempts++;
      
      try {
        // Try to download the file
        const response = await axios.get(downloadUrl, {
          responseType: 'stream',
          timeout: 300000, // 5 minutes for download
          validateStatus: (status) => status === 200 // Only accept 200 OK
        });

        // Save to file
        const stream = require('fs').createWriteStream(outputPath);
        
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
          console.log(`⏳ File not ready yet (attempt ${attempts}/${maxAttempts}), waiting 5 seconds...`);
          await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
          continue;
        }
        
        // For other errors, throw immediately
        console.error(`Download error (attempt ${attempts}):`, error.message);
        throw error;
      }
    }
    
    throw new Error(`File was not ready after ${maxAttempts} attempts`);
  }

  /**
   * Download audio from YouTube video
   */
  async downloadAudio(videoUrl: string, outputPath: string): Promise<void> {
    const downloadInfo = await this.getAudioDownloadUrl(videoUrl);
    await this.waitAndDownloadFile(downloadInfo.file, outputPath);
  }

  /**
   * Download video from YouTube
   */
  async downloadVideo(videoUrl: string, outputPath: string, quality?: string): Promise<void> {
    // If quality preference is specified, find matching quality ID
    let qualityId: number | undefined;
    
    if (quality) {
      const qualities = await this.getAvailableQualities(videoUrl);
      const match = qualities.find(q => q.quality === quality && q.type === 'video');
      if (match) {
        qualityId = match.id;
      }
    }
    
    const downloadInfo = await this.getVideoDownloadUrl(videoUrl, qualityId);
    await this.waitAndDownloadFile(downloadInfo.file, outputPath);
  }
}

// Export singleton instance with lazy initialization
let _rapidAPIClient: RapidAPIYouTubeClient | null = null;

export const rapidAPIClient = {
  getAvailableQualities: async (videoUrl: string) => {
    if (!_rapidAPIClient) _rapidAPIClient = new RapidAPIYouTubeClient();
    return _rapidAPIClient.getAvailableQualities(videoUrl);
  },
  getAudioDownloadUrl: async (videoUrl: string, preferredQuality?: number) => {
    if (!_rapidAPIClient) _rapidAPIClient = new RapidAPIYouTubeClient();
    return _rapidAPIClient.getAudioDownloadUrl(videoUrl, preferredQuality);
  },
  getVideoDownloadUrl: async (videoUrl: string, preferredQuality?: number) => {
    if (!_rapidAPIClient) _rapidAPIClient = new RapidAPIYouTubeClient();
    return _rapidAPIClient.getVideoDownloadUrl(videoUrl, preferredQuality);
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