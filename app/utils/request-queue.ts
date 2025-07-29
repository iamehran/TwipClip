// Global request queue for managing concurrent operations
class RequestQueue {
  private downloadQueue: Array<() => Promise<any>> = [];
  private activeDownloads = 0;
  private maxConcurrentDownloads = parseInt(process.env.MAX_GLOBAL_DOWNLOADS || '6'); // Total across all users
  
  async addDownloadJob<T>(job: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const wrappedJob = async () => {
        try {
          this.activeDownloads++;
          const result = await job();
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          this.activeDownloads--;
          this.processQueue();
        }
      };
      
      this.downloadQueue.push(wrappedJob);
      this.processQueue();
    });
  }
  
  private processQueue() {
    while (this.activeDownloads < this.maxConcurrentDownloads && this.downloadQueue.length > 0) {
      const job = this.downloadQueue.shift();
      if (job) {
        job().catch(console.error);
      }
    }
  }
  
  getQueueStatus() {
    return {
      queueLength: this.downloadQueue.length,
      activeDownloads: this.activeDownloads,
      maxConcurrent: this.maxConcurrentDownloads
    };
  }
}

// Global instance
export const globalQueue = new RequestQueue();

// Rate limiter for YouTube
class RateLimiter {
  private requests: number[] = [];
  private windowMs = 60000; // 1 minute
  private maxRequests = parseInt(process.env.YOUTUBE_RATE_LIMIT || '30'); // 30 requests per minute
  
  async checkLimit(): Promise<boolean> {
    const now = Date.now();
    this.requests = this.requests.filter(time => now - time < this.windowMs);
    
    if (this.requests.length >= this.maxRequests) {
      return false;
    }
    
    this.requests.push(now);
    return true;
  }
  
  async waitForSlot(): Promise<void> {
    while (!(await this.checkLimit())) {
      const oldestRequest = this.requests[0];
      const waitTime = this.windowMs - (Date.now() - oldestRequest) + 1000; // Add 1s buffer
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
}

export const youtubeRateLimiter = new RateLimiter(); 