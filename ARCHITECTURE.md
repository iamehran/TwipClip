# TwipClip Architecture Documentation

## Overview

TwipClip is an AI-powered video clip extraction tool that helps users create perfect video clips for their Twitter/X threads. It uses advanced AI models (Claude Opus 4 or Sonnet 4) for semantic matching and Google Cloud Video Intelligence for transcription to automatically find the most relevant segments of YouTube videos that match your thread content.

## Core Functionality

The app follows a streamlined approach:
1. **Video Processing** → 2. **Transcription** → 3. **AI Matching** → 4. **Clip Generation**

## Technical Architecture

### Tech Stack
- **Frontend**: Next.js 14 with TypeScript and React
- **UI**: Tailwind CSS with custom components
- **AI Models**: 
  - Claude 3 Opus (highest quality, 5x cost)
  - Claude 3.5 Sonnet (balanced performance)
  - Configurable thinking mode and token usage
- **Transcription**: Google Cloud Video Intelligence API
- **Video Processing**: yt-dlp + FFmpeg
- **Deployment**: Docker, Railway, Vercel

### System Flow

```
User Input (Thread + Video URLs + Model Settings)
    ↓
Parallel Video Processing
    ↓
Transcript Fetching/Generation
    ↓
AI Semantic Matching (Claude Opus/Sonnet)
    ↓
Clip Timestamp Extraction
    ↓
Results Display & Download Options
```

## Key Components

### 1. Intelligent Processor V3 (`src/lib/intelligent-processor-v3.ts`)
- Orchestrates the entire processing pipeline
- Handles parallel video processing
- Manages error recovery and retries
- Coordinates between transcription and AI matching

### 2. Video Downloader (`src/lib/video-downloader.ts`)
- Uses yt-dlp for reliable video downloading
- Supports quality selection (720p/1080p)
- FFmpeg integration for clip extraction
- Optimized encoding settings (CRF 18, 192k audio)

### 3. Transcription Service (`src/lib/transcription.ts`)
- Primary: Google Cloud Video Intelligence API
- Fallback: YouTube captions when available
- Caches transcripts to avoid redundant API calls
- Returns timestamped segments for precise matching

### 4. Perfect Matching Algorithm (`app/utils/perfect-matching-optimized.ts`)
- Advanced AI-powered content matching
- Dynamic model selection (Opus/Sonnet)
- Configurable token limits based on usage level:
  - Low: 1000 tokens (30 candidates)
  - Medium: 2000 tokens (50 candidates)
  - High: 4000 tokens (80 candidates)
- Thinking mode for deeper analysis
- Context window optimization

### 5. UI Components

#### SearchForm (`app/components/SearchForm.tsx`)
- Horizontal layout with side-by-side inputs
- Thread content and video URLs
- Model selection integration
- Example data loading

#### ModelSelector (`app/components/ModelSelector.tsx`)
- AI model dropdown (Opus/Sonnet)
- Thinking mode toggle
- Token usage selector
- Cost indicator display

#### VideoResult (`app/components/VideoResult.tsx`)
- YouTube embed preview
- Timestamp navigation
- Download buttons
- Match confidence display

## AI Model Configuration

### Model Selection
```typescript
interface ModelSettings {
  model: 'claude-3-opus' | 'claude-3.5-sonnet';
  thinkingMode: boolean;
  tokenUsage: 'low' | 'medium' | 'high';
}
```

### Token Allocation Strategy
- Base tokens determined by usage level
- Opus model receives 1.5x multiplier
- Thinking mode adds system prompts for reasoning
- Dynamic candidate limiting based on token budget

### Cost Optimization
- Sonnet as default (1x cost)
- Opus for premium quality (5x cost)
- Token usage affects both cost and quality
- Caching reduces redundant API calls

## Data Flow Architecture

### 1. Request Processing
```
Client Request
    ↓
API Route Handler (/api/process)
    ↓
Input Validation
    ↓
Intelligent Processor V3
    ↓
Parallel Execution
```

### 2. Parallel Processing
```
Video URLs → [
  Video 1 → Transcript → AI Matching
  Video 2 → Transcript → AI Matching
  Video 3 → Transcript → AI Matching
] → Aggregated Results
```

### 3. Result Compilation
```
Matched Clips
    ↓
Confidence Scoring
    ↓
Result Formatting
    ↓
Client Response
```

## Environment Configuration

```env
# Required API Keys
ANTHROPIC_API_KEY=       # For Claude AI models
GOOGLE_CLOUD_API_KEY=    # For Video Intelligence

# Optional Configuration
NODE_ENV=                # development/production
NEXT_PUBLIC_API_URL=     # API endpoint URL
MAX_CONCURRENT_DOWNLOADS=# Parallel download limit
TRANSCRIPT_CACHE_TTL=    # Cache duration in seconds

# System Paths
FFMPEG_PATH=            # Custom FFmpeg path
YTDLP_PATH=             # Custom yt-dlp path
TEMP_DIR=               # Temporary file storage
```

## Deployment Architecture

### Docker Deployment
- Multi-stage build for optimization
- Alpine Linux base for small image size
- System dependencies included
- Health check endpoints

### Railway Deployment
- Nixpacks configuration
- Automatic dependency installation
- Environment variable management
- Built-in monitoring

### Vercel Deployment
- Serverless functions
- Edge network distribution
- Automatic scaling
- External service integration required

## Performance Optimizations

### 1. Parallel Processing
- Concurrent video processing
- Promise.all for batch operations
- Resource pooling for downloads

### 2. Caching Strategy
- Transcript caching
- Result memoization
- CDN for static assets

### 3. Resource Management
- Automatic temp file cleanup
- Memory usage monitoring
- Request timeout handling

## Error Handling

### Graceful Degradation
1. Primary transcription fails → YouTube captions
2. AI model timeout → Retry with backoff
3. Download failure → Alternative quality
4. Complete failure → Detailed error reporting

### Error Recovery
```typescript
try {
  // Primary operation
} catch (error) {
  // Log error details
  logger.error('Operation failed', { error, context });
  
  // Attempt recovery
  if (isRecoverable(error)) {
    return fallbackOperation();
  }
  
  // Return user-friendly error
  throw new UserError('Unable to process video');
}
```

## Security Considerations

### API Security
- API keys server-side only
- Request validation
- Rate limiting implementation
- CORS configuration

### Input Validation
- URL format verification
- Content length limits
- Sanitization of user inputs
- SQL injection prevention

### File Security
- Temporary file isolation
- Automatic cleanup
- Path traversal prevention
- File type validation

## Monitoring & Observability

### Health Checks
```typescript
GET /api/health
{
  "status": "healthy",
  "dependencies": {
    "ffmpeg": true,
    "ytdlp": true,
    "anthropic": true,
    "googleCloud": true
  }
}
```

### Metrics Collection
- Processing time per request
- API usage by model
- Success/failure rates
- Resource utilization

### Logging Strategy
- Structured JSON logging
- Request/response tracking
- Error stack traces
- Performance metrics

## Testing Architecture

### Unit Tests
- Component testing with React Testing Library
- Utility function testing
- API endpoint testing
- Mock external services

### Integration Tests
- End-to-end processing flow
- API integration verification
- Error scenario testing
- Performance benchmarking

## Future Architecture Considerations

### Scalability
- Message queue for long tasks
- Worker pool for processing
- Database for persistent storage
- Distributed caching

### Features
- Real-time processing updates
- Batch job scheduling
- User authentication
- Usage analytics

### Optimizations
- GPU acceleration for AI
- Edge computing for global distribution
- Progressive web app capabilities
- Offline mode support

## Development Workflow

### Local Development
```bash
npm run dev          # Start development server
npm run build        # Production build
npm run test         # Run test suite
npm run lint         # Code linting
```

### Code Organization
```
app/                 # Next.js app directory
├── api/            # API routes
├── components/     # React components
├── utils/          # Utility functions
└── page.tsx        # Main page

src/lib/            # Core libraries
├── intelligent-processor-v3.ts
├── transcription.ts
├── video-downloader.ts
└── system-tools.ts
```

### Contributing Guidelines
1. Follow TypeScript best practices
2. Write comprehensive tests
3. Document API changes
4. Update architecture docs
5. Performance impact assessment

## Support & Maintenance

### Common Issues
- FFmpeg/yt-dlp installation
- API key configuration
- Memory limitations
- Timeout errors

### Debug Tools
- `/api/health` - System health
- `/api/test-tools` - Dependency check
- Browser DevTools - Client debugging
- Server logs - Backend debugging

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
