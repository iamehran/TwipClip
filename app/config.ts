// Environment variables with fallbacks
export const USE_RAPIDAPI = process.env.USE_RAPIDAPI === 'true';
export const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '';
export const RAPIDAPI_HOST = process.env.RAPIDAPI_HOST || 'youtube-video-fast-downloader-24-7.p.rapidapi.com';
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
export const GOOGLE_CLOUD_API_KEY = process.env.GOOGLE_CLOUD_API_KEY || '';
export const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';

// Debug info
console.log('Config loaded, RapidAPI enabled:', USE_RAPIDAPI);
console.log('RapidAPI key exists:', !!RAPIDAPI_KEY);
console.log('Google Cloud API Key exists:', !!GOOGLE_CLOUD_API_KEY);

// Configuration checks
export const isConfigured = USE_RAPIDAPI && !!RAPIDAPI_KEY;
export const hasGoogleCloudAPI = !!GOOGLE_CLOUD_API_KEY && GOOGLE_CLOUD_API_KEY.length > 10; 