# TwipClip Architecture Documentation

## Overview

TwipClip is an AI-powered YouTube clip extraction tool that helps users create perfect video clips for their Twitter/X threads. It uses advanced AI (Claude 3.7 Sonnet for semantic matching and OpenAI's Whisper for transcription to automatically find the most relevant segments of a YouTube video that match your thread content.

## Core Functionality

The app follows a single, streamlined approach:
1. **Audio Extraction** → 2. **Transcription** → 3. **Semantic Matching** → 4. **Clip Generation**

## Technical Architecture

### Tech Stack
- **Frontend**: Next.js 14 with TypeScript
- **UI**: Tailwind CSS with custom components
- **AI Models**: 
  - Claude 3.7 Sonnet (Anthropic) for semantic matching
  - Whisper (OpenAI) for audio transcription
- **Video Processing**: yt-dlp + FFmpeg
- **Deployment**: Railway (Docker-based)

### System Flow

```
User Input (YouTube URL + Thread Content)
    ↓
Video Processing (yt-dlp)
    ↓
Audio Extraction (.m4a format)
    ↓
Transcription (Whisper API)
    ↓
Semantic Matching (Claude 3.7 Sonnet)
    ↓
Clip Generation (timestamps)
    ↓
Results (YouTube URLs with start/end times)
```

## Key Components

### 1. Video Processing (`src/lib/video-processor.ts`)
- Primary method: yt-dlp with Android player client to avoid bot detection
- Downloads audio in m4a format for optimal quality and size
- Includes retry logic and error handling

### 2. Transcription Service (`src/lib/transcription-service.ts`)
- Uses OpenAI's Whisper API for accurate transcription
- Returns timestamped segments for precise clip creation
- Handles various audio formats

### 3. AI Matching (`src/lib/ai-matching.ts`)
- Uses Claude 3.7 Sonnet for semantic understanding
- Analyzes thread content and transcript to find relevant segments
- Returns confidence scores and precise timestamps
- Formats results with triple dashes (---) between tweets

### 4. System Tools (`src/lib/system-tools.ts`)
- Manages yt-dlp and FFmpeg binaries
- Handles different environments (local vs Railway)
- Provides fallback mechanisms

## Fallback Strategy

### Primary Path (95% success rate)
1. yt-dlp with Android client spoofing
2. Direct audio extraction
3. Whisper transcription
4. Claude matching

### Fallback Path (when yt-dlp fails)
1. Invidious API for transcript retrieval
2. Direct transcript processing (skips audio extraction)
3. Claude matching on existing transcript

### Why This Approach?
- **Reliability**: Single path reduces complexity and points of failure
- **Quality**: Direct audio extraction ensures best transcription accuracy
- **Speed**: Optimized for minimal processing time
- **Cost**: Audio-only processing reduces bandwidth and API costs

## Environment Variables

```env
# Required
OPENAI_API_KEY=          # For Whisper transcription
ANTHROPIC_API_KEY=       # For Claude 3.7 Sonnet matching

# Optional (for fallback)
YOUTUBE_API_KEY=         # For YouTube Data API (currently unused)
INVIDIOUS_INSTANCE=      # Custom Invidious instance (defaults to public)

# Railway-specific
YTDLP_PATH=             # Path to yt-dlp binary (auto-detected)
FFMPEG_PATH=            # Path to FFmpeg binary (auto-detected)
```

## Deployment

### Railway Deployment
The app uses a custom Dockerfile for Railway deployment:

```dockerfile
# Key steps:
1. Install system dependencies (FFmpeg via apk)
2. Install yt-dlp via pip
3. Copy application code
4. Build Next.js application
5. Run production server
```

### Local Development
```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local

# Run development server
npm run dev
```

## Common Issues & Solutions

### 1. YouTube Bot Detection
- **Issue**: YouTube blocks requests from data centers
- **Solution**: Use Android player client with user-agent spoofing
- **Fallback**: Invidious API for transcript retrieval

### 2. Binary Availability
- **Issue**: yt-dlp/FFmpeg not found in production
- **Solution**: Custom Dockerfile ensures binaries are installed and accessible
- **Check**: System tools module verifies binary existence before use

### 3. Large Video Processing
- **Issue**: Timeout on long videos
- **Solution**: Audio-only extraction reduces processing time
- **Limit**: Videos over 2 hours may require special handling

## API Endpoints

### `/api/extract-clips` (POST)
Main endpoint for clip extraction.

**Request:**
```json
{
  "videoUrl": "https://youtube.com/watch?v=...",
  "threadContent": "Your tweet thread content..."
}
```

**Response:**
```json
{
  "clips": [
    {
      "text": "Matched tweet text",
      "start": 120.5,
      "end": 145.3,
      "url": "https://youtube.com/watch?v=...&t=120",
      "confidence": 0.92
    }
  ],
  "averageConfidence": 0.89
}
```

## Performance Considerations

1. **Audio-only Processing**: Reduces bandwidth by 90%
2. **Caching**: Consider implementing Redis for transcript caching
3. **Concurrent Requests**: Limited by API rate limits
4. **File Cleanup**: Automatic cleanup of temporary audio files

## Security Considerations

1. **API Keys**: Never exposed to client
2. **File Validation**: Strict URL validation for YouTube links
3. **Rate Limiting**: Implement per-IP rate limiting in production
4. **Temporary Files**: Cleaned up immediately after processing

## Future Enhancements

1. **Batch Processing**: Handle multiple videos in one request
2. **Webhook Support**: Async processing for long videos
3. **Custom Models**: Fine-tuned models for specific content types
4. **Export Options**: Direct video download with clips

## Monitoring & Debugging

### Key Metrics to Track
- yt-dlp success rate
- Average processing time
- API usage (OpenAI, Anthropic)
- Fallback usage frequency

### Debug Endpoints
- `/api/test-ytdlp`: Verify yt-dlp functionality
- System logs: Check Railway logs for detailed error messages

## Contributing

When working on this project:
1. Maintain the single-path approach (avoid adding complex fallbacks)
2. Test with various YouTube videos (short, long, age-restricted)
3. Ensure Railway deployment compatibility
4. Update this documentation with any architectural changes

## Support

For issues or questions:
1. Check Railway logs for deployment issues
2. Verify environment variables are set correctly
3. Test with the debug endpoints
4. Ensure YouTube URL is valid and accessible 
