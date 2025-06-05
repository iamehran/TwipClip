// Environment variables with fallbacks
export const YOUTUBE_API_KEY = process.env.NEXT_PUBLIC_YOUTUBE_API_KEY || process.env.YOUTUBE_API_KEY || '';
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
export const GOOGLE_CLOUD_API_KEY = process.env.GOOGLE_CLOUD_API_KEY || '';
export const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';

// Debug info
console.log('Config loaded, API Key exists:', !!YOUTUBE_API_KEY);
console.log('API Key length:', YOUTUBE_API_KEY?.length);
console.log('Google Cloud API Key exists:', !!GOOGLE_CLOUD_API_KEY);

// You'll need to set your YouTube API key in your environment
// For local development, you can use .env.local file
// For production, set it in your hosting environment

export const isConfigured = !!YOUTUBE_API_KEY && YOUTUBE_API_KEY.length > 10;
export const hasGoogleCloudAPI = !!GOOGLE_CLOUD_API_KEY && GOOGLE_CLOUD_API_KEY.length > 10; 