# TwipClip Production Setup Guide

## 🚀 Quick Start

TwipClip is a powerful tool that automatically finds and extracts the perfect video clips for your Twitter/X threads. It uses AI to match tweet content with relevant video segments, ensuring one perfect clip per tweet.

## ✅ Core Features Working

1. **Audio Extraction** - Extracts audio from videos using yt-dlp and FFmpeg
2. **Whisper Large File Support** - Handles large audio files through intelligent chunking
3. **One Clip Per Tweet** - AI-powered matching ensures exactly one perfect clip per tweet
4. **Bulk Download** - Download all matched clips as a ZIP file

## 📋 Prerequisites

### Required Software
- **Node.js** 18+ 
- **yt-dlp** (latest version)
- **FFmpeg** (with libx264 codec)

### Required API Keys
Create a `.env.local` file in the root directory:

```env
# Required - OpenAI API Key for Whisper transcription
OPENAI_API_KEY=your_openai_api_key_here

# Required - Anthropic API Key for AI-powered matching
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# Optional - Google Cloud API Key for Video Intelligence (fallback)
GOOGLE_CLOUD_API_KEY=your_google_cloud_api_key_here

# Optional - YouTube Data API Key for metadata
YOUTUBE_API_KEY=your_youtube_api_key_here
```

## 🛠️ Installation

### 1. Install System Dependencies

**Windows:**
```bash
# Install yt-dlp
winget install yt-dlp

# Install FFmpeg
winget install ffmpeg

# Or download manually:
# yt-dlp: https://github.com/yt-dlp/yt-dlp/releases
# FFmpeg: https://ffmpeg.org/download.html
```

**macOS:**
```bash
brew install yt-dlp ffmpeg
```

**Linux:**
```bash
sudo apt update
sudo apt install yt-dlp ffmpeg
```

### 2. Install Node Dependencies
```bash
npm install
```

### 3. Verify Installation
```bash
node scripts/test-system.js
```

This will check:
- ✅ System tools (yt-dlp, FFmpeg)
- ✅ API keys configuration
- ✅ Module imports
- ✅ API routes

## 🎯 How It Works

### 1. Thread Processing
- Paste your Twitter/X thread content (tweets separated by dashes or new lines)
- The system automatically parses individual tweets

### 2. Video Analysis
- Add YouTube video URLs (supports multiple videos)
- Videos are transcribed using OpenAI Whisper
- Large audio files are automatically chunked for processing

### 3. AI Matching
- Claude AI analyzes each tweet to understand the content needed
- Searches through all video transcripts for the best match
- Ensures ONE perfect clip per tweet (no duplicates)

### 4. Clip Extraction
- Uses yt-dlp with FFmpeg for precise clip extraction
- Downloads only the relevant portion (not the full video)
- Maintains quality while keeping file sizes reasonable

## 🚦 Running the Application

### Development Mode
```bash
npm run dev
```
Access at: http://localhost:3000

### Production Build
```bash
npm run build
npm start
```

## 📝 Usage Guide

1. **Enter Thread Content**
   - Paste your full thread
   - Tweets can be separated by:
     - Dashes: `Tweet 1 - Tweet 2 - Tweet 3`
     - New lines
     - Numbers: `1. Tweet 1  2. Tweet 2`

2. **Add Video URLs**
   - Paste YouTube video URLs (one per line)
   - Supports: YouTube, Vimeo, direct MP4 links
   - Maximum 5 videos per request (configurable)

3. **Process**
   - Click "Find Perfect Clips"
   - Wait for AI processing (typically 30-60 seconds)
   - Review matched clips

4. **Download**
   - Individual clips: Click download on each result
   - Bulk download: Use "Download All Clips" for a ZIP file

## 🔧 Troubleshooting

### Common Issues

**"No transcript available"**
- Video might have disabled captions
- Try a different video or wait for Whisper processing

**"System requirements not met"**
- Run `node scripts/test-system.js` to identify missing dependencies
- Ensure yt-dlp and FFmpeg are in PATH

**"API key not configured"**
- Check `.env.local` file exists
- Verify API keys are correct
- Restart the development server

**Large files timing out**
- Audio chunking should handle files up to 2GB
- Check FFmpeg is properly installed
- Ensure sufficient disk space in temp directory

### Performance Tips

1. **Use shorter videos** when possible (< 30 minutes)
2. **Process in batches** of 3-5 videos
3. **Clear cache** periodically: Delete `.next` folder
4. **Monitor temp files**: Clean `temp/` directory regularly

## 🚀 Deployment

### Railway.app (Recommended)
1. Connect GitHub repository
2. Add environment variables in Railway dashboard
3. Deploy with these settings:
   - Build: `npm run build`
   - Start: `npm start`
   - Install: `npm ci`

### Docker
```dockerfile
# Dockerfile is included
docker build -t twipclip .
docker run -p 3000:3000 --env-file .env.local twipclip
```

## 📊 API Endpoints

- `POST /api/process` - Main processing endpoint
- `GET /api/download` - Download individual clips
- `POST /api/download-all` - Bulk download as ZIP

## 🔒 Security Notes

- API keys are never exposed to the client
- All processing happens server-side
- Temporary files are cleaned up automatically
- YouTube authentication uses OAuth2 flow

## 📞 Support

For issues or questions:
1. Check the troubleshooting section
2. Run `node scripts/test-system.js` for diagnostics
3. Check server logs for detailed error messages

## 🎉 Ready to Use!

Your TwipClip instance should now be fully functional. The system will:
- ✅ Extract perfect clips for each tweet
- ✅ Handle large video files through chunking
- ✅ Provide one clip per tweet (no duplicates)
- ✅ Support bulk downloads

Happy clipping! 🎬 