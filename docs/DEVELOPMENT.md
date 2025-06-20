# Development Guide

## Table of Contents

1. [Project Overview](#project-overview)
2. [Development Setup](#development-setup)
3. [Architecture](#architecture)
4. [Core Components](#core-components)
5. [AI Integration](#ai-integration)
6. [Testing](#testing)
7. [Debugging](#debugging)
8. [Performance Optimization](#performance-optimization)
9. [Contributing Guidelines](#contributing-guidelines)

## Project Overview

TwipClip is a Next.js application that uses AI to match social media thread content with video transcripts and extract relevant clips. The application leverages Claude AI for semantic matching and various video processing tools.

### Tech Stack

- **Frontend**: Next.js 14, React, TypeScript, Tailwind CSS
- **AI**: Anthropic Claude (Opus 4 & Sonnet 4)
- **Video Processing**: yt-dlp, FFmpeg
- **Transcription**: Google Cloud Video Intelligence API
- **Deployment**: Docker, Railway, Vercel

## Development Setup

### Prerequisites

1. **Node.js 18+**: Install from [nodejs.org](https://nodejs.org/)
2. **FFmpeg**: Required for video processing
   ```bash
   # Windows (using Chocolatey)
   choco install ffmpeg
   
   # macOS
   brew install ffmpeg
   
   # Linux
   sudo apt-get install ffmpeg
   ```

3. **yt-dlp**: For video downloading
   ```bash
   pip install yt-dlp
   # or
   brew install yt-dlp
   ```

### Environment Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/twipclip.git
   cd twipclip
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create environment file:
   ```bash
   cp .env.example .env.local
   ```

4. Configure environment variables:
   ```env
   # Required API Keys
   ANTHROPIC_API_KEY=sk-ant-api03-...
   GOOGLE_CLOUD_API_KEY=AIza...
   
   # Optional Configuration
   NODE_ENV=development
   NEXT_PUBLIC_API_URL=http://localhost:3000
   ```

### Running the Application

```bash
# Development mode with hot reload
npm run dev

# Production build
npm run build
npm start

# Type checking
npm run type-check

# Linting
npm run lint
```

## Architecture

### Directory Structure

```
TwipClip/
├── app/                      # Next.js App Router
│   ├── api/                 # API routes
│   │   ├── process/         # Main processing endpoint
│   │   ├── download/        # Clip download endpoints
│   │   └── search/          # Video search
│   ├── components/          # React components
│   │   ├── SearchForm.tsx   # Main input form
│   │   ├── VideoResult.tsx  # Result display
│   │   └── ModelSelector.tsx # AI model selection
│   ├── utils/              # Frontend utilities
│   └── page.tsx            # Main page
├── src/lib/                # Core libraries
│   ├── intelligent-processor-v3.ts  # Main processing logic
│   ├── transcription.ts            # Video transcription
│   ├── video-downloader.ts         # Clip extraction
│   └── semantic-matcher.ts         # AI matching
└── docs/                   # Documentation
```

### Data Flow

1. **User Input** → SearchForm component
2. **API Request** → `/api/process` endpoint
3. **Video Processing**:
   - Transcript fetching/generation
   - AI semantic matching
   - Clip timestamp extraction
4. **Results Display** → VideoResult components
5. **Download** → `/api/download` endpoints

## Core Components

### 1. SearchForm Component

The main input interface for users.

```typescript
// app/components/SearchForm.tsx
interface SearchFormProps {
  onSearch: (data: SearchData) => void;
  isProcessing: boolean;
}

// Key features:
// - Thread input with --- separator
// - Video URL validation
// - Model selection (Opus/Sonnet)
// - Example data loading
```

### 2. Intelligent Processor

The core processing engine that orchestrates the entire workflow.

```typescript
// src/lib/intelligent-processor-v3.ts
class IntelligentProcessorV3 {
  async processThread(
    thread: string,
    videoUrls: string[],
    modelSettings: ModelSettings
  ): Promise<ProcessingResult>
}

// Handles:
// - Parallel video processing
// - Transcript fetching
// - AI matching coordination
// - Error recovery
```

### 3. Perfect Matching Algorithm

Advanced AI-powered content matching.

```typescript
// app/utils/perfect-matching-optimized.ts
async function findPerfectMatches(
  tweet: string,
  transcript: TranscriptSegment[],
  modelSettings: ModelSettings
): Promise<Match[]>

// Features:
// - Context window optimization
// - Confidence scoring
// - Multi-pass matching
// - Thinking mode support
```

### 4. Video Downloader

Handles video clip extraction using yt-dlp and FFmpeg.

```typescript
// src/lib/video-downloader.ts
class VideoDownloader {
  async downloadClip(
    videoUrl: string,
    startTime: number,
    endTime: number,
    quality: string
  ): Promise<string>
}

// Supports:
// - Quality selection (720p/1080p)
// - Format optimization
// - Error handling
// - Cleanup
```

## AI Integration

### Model Configuration

```typescript
interface ModelSettings {
  model: 'claude-3-opus' | 'claude-3.5-sonnet';
  thinkingMode: boolean;
  tokenUsage: 'low' | 'medium' | 'high';
}
```

### Token Limits

| Usage Level | Base Tokens | Opus Multiplier | Max Candidates |
|-------------|-------------|-----------------|----------------|
| Low         | 1000        | 1.5x            | 30             |
| Medium      | 2000        | 1.5x            | 50             |
| High        | 4000        | 1.5x            | 80             |

### Thinking Mode

When enabled, adds a system prompt for deeper reasoning:

```typescript
const thinkingPrompt = `
Before providing your final answer, work through the problem step by step 
in a <thinking> section. Consider multiple perspectives and be thorough 
in your analysis.
`;
```

### API Integration

```typescript
// Anthropic API configuration
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Model selection
const model = modelSettings.model === 'claude-3-opus' 
  ? 'claude-3-opus-20240229'
  : 'claude-3-5-sonnet-20241022';
```

## Testing

### Unit Tests

```bash
# Run all tests
npm test

# Watch mode
npm test -- --watch

# Coverage report
npm test -- --coverage
```

### Integration Tests

Test the API endpoints:

```typescript
// Example test
describe('Process API', () => {
  it('should process thread and return matches', async () => {
    const response = await fetch('/api/process', {
      method: 'POST',
      body: JSON.stringify({
        thread: 'Test thread',
        videoUrls: ['https://youtube.com/watch?v=test'],
        modelSettings: { model: 'claude-3.5-sonnet' }
      })
    });
    
    expect(response.status).toBe(200);
  });
});
```

### Manual Testing

1. **Test with Examples**: Use the "Load Example" button
2. **Check Logs**: Monitor console for errors
3. **Verify Downloads**: Ensure clips download correctly
4. **Test Edge Cases**: Long videos, multiple matches, etc.

## Debugging

### Common Issues

1. **Transcription Failures**
   - Check Google Cloud API key
   - Verify video has captions
   - Check API quota

2. **Download Errors**
   - Verify FFmpeg installation: `ffmpeg -version`
   - Check yt-dlp: `yt-dlp --version`
   - Test video URL accessibility

3. **AI Matching Issues**
   - Check Anthropic API key
   - Monitor token usage
   - Review match confidence scores

### Debug Tools

```typescript
// Enable debug logging
if (process.env.NODE_ENV === 'development') {
  console.log('[DEBUG]', data);
}

// API health check
GET /api/health

// System tools check
GET /api/test-tools
```

## Performance Optimization

### 1. Parallel Processing

```typescript
// Process videos in parallel
const results = await Promise.all(
  videoUrls.map(url => processVideo(url))
);
```

### 2. Caching

- Transcript caching to avoid re-fetching
- Result caching for repeated searches
- CDN for static assets

### 3. Resource Management

```typescript
// Cleanup temporary files
async function cleanup() {
  const tempDir = path.join(process.cwd(), 'temp');
  await fs.promises.rm(tempDir, { recursive: true, force: true });
}
```

### 4. Rate Limiting

```typescript
// Implement rate limiting
const rateLimiter = new RateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 10 // 10 requests per minute
});
```

## Contributing Guidelines

### Code Style

- Use TypeScript for type safety
- Follow ESLint configuration
- Use Prettier for formatting
- Write meaningful commit messages

### Pull Request Process

1. **Fork and Clone**
   ```bash
   git clone https://github.com/yourusername/twipclip.git
   cd twipclip
   git remote add upstream https://github.com/original/twipclip.git
   ```

2. **Create Feature Branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **Make Changes**
   - Write clean, documented code
   - Add tests for new features
   - Update documentation

4. **Test Thoroughly**
   ```bash
   npm run type-check
   npm run lint
   npm test
   ```

5. **Submit PR**
   - Clear description of changes
   - Reference any related issues
   - Include screenshots if UI changes

### Code Review Checklist

- [ ] Code follows project style guide
- [ ] Tests pass and coverage maintained
- [ ] Documentation updated
- [ ] No console.log statements
- [ ] Error handling implemented
- [ ] Performance impact considered
- [ ] Security best practices followed

## Security Considerations

1. **API Key Management**
   - Never commit API keys
   - Use environment variables
   - Rotate keys regularly

2. **Input Validation**
   - Sanitize user inputs
   - Validate video URLs
   - Limit request sizes

3. **Rate Limiting**
   - Implement per-IP limits
   - Monitor for abuse
   - Use CAPTCHA if needed

## Deployment

### Docker Build

```dockerfile
# Multi-stage build for optimization
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:18-alpine
WORKDIR /app
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package*.json ./
RUN npm ci --production
EXPOSE 3000
CMD ["npm", "start"]
```

### Environment Variables

```bash
# Production variables
ANTHROPIC_API_KEY=sk-ant-api03-...
GOOGLE_CLOUD_API_KEY=AIza...
NODE_ENV=production
NEXT_PUBLIC_API_URL=https://your-domain.com
```

## Monitoring

### Logging

```typescript
// Structured logging
logger.info('Processing started', {
  threadId: id,
  videoCount: urls.length,
  model: settings.model
});
```

### Metrics

- Processing time per request
- API usage and costs
- Error rates
- User engagement

### Health Checks

```typescript
// Health endpoint implementation
export async function GET() {
  const checks = {
    ffmpeg: await checkFFmpeg(),
    ytdlp: await checkYtDlp(),
    anthropic: await checkAnthropicAPI(),
    googleCloud: await checkGoogleAPI()
  };
  
  return NextResponse.json({
    status: Object.values(checks).every(v => v) ? 'healthy' : 'degraded',
    dependencies: checks,
    timestamp: new Date().toISOString()
  });
}
``` 