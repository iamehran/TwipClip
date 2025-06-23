# Troubleshooting Guide

This guide covers common issues and their solutions.

## Table of Contents

1. [Common Issues](#common-issues)
2. [API Errors](#api-errors)
3. [Video Processing Issues](#video-processing-issues)
4. [AI Model Issues](#ai-model-issues)
5. [Performance Problems](#performance-problems)
6. [Deployment Issues](#deployment-issues)
7. [Debug Tools](#debug-tools)
8. [Getting Help](#getting-help)
9. [YouTube Authentication Issues](#youtube-authentication-issues)

## Common Issues

### 1. Application Won't Start

**Symptoms:**
- Server fails to start
- Port already in use error
- Module not found errors

**Solutions:**

```bash
# Check if port 3000 is in use
netstat -an | grep 3000

# Kill process using port (Windows)
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Kill process using port (Mac/Linux)
lsof -i :3000
kill -9 <PID>

# Clear node modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Clear Next.js cache
rm -rf .next
npm run build
```

### 2. Environment Variables Not Loading

**Symptoms:**
- API key errors
- "Missing required environment variables"

**Solutions:**

1. Check file name and location:
   ```bash
   # Development: .env.local
   # Production: .env.production
   ```

2. Verify format:
   ```env
   # Correct
   ANTHROPIC_API_KEY=sk-ant-api03-...
   
   # Wrong (quotes not needed)
   ANTHROPIC_API_KEY="sk-ant-api03-..."
   ```

3. Restart server after changes

### 3. Build Failures

**Symptoms:**
- TypeScript errors
- Module resolution failures
- Out of memory errors

**Solutions:**

```bash
# Type checking
npm run type-check

# Increase memory for build
NODE_OPTIONS="--max-old-space-size=4096" npm run build

# Clean build
rm -rf .next node_modules
npm install
npm run build
```

## API Errors

### 1. Anthropic API Errors

**Error: "Invalid API Key"**
```javascript
// Check API key format
console.log(process.env.ANTHROPIC_API_KEY?.substring(0, 10));
// Should start with "sk-ant-api"
```

**Error: "Rate limit exceeded"**
```javascript
// Implement retry logic
async function callAnthropicWithRetry(params, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await anthropic.messages.create(params);
    } catch (error) {
      if (error.status === 429 && i < retries - 1) {
        await new Promise(r => setTimeout(r, Math.pow(2, i) * 1000));
        continue;
      }
      throw error;
    }
  }
}
```

**Error: "Model not found"**
```javascript
// Check model name
const validModels = {
  'claude-3-opus': 'claude-3-opus-20240229',
  'claude-3.5-sonnet': 'claude-3-5-sonnet-20241022'
};
```

### 2. Google Cloud API Errors

**Error: "API key not valid"**
```bash
# Verify API key is enabled for Video Intelligence API
# Go to: https://console.cloud.google.com/apis/credentials
```

**Error: "Quota exceeded"**
```javascript
// Check quota usage
// https://console.cloud.google.com/apis/api/videointelligence.googleapis.com/quotas
```

### 3. Process Endpoint Errors

**Error: "Request timeout"**
```javascript
// Increase timeout in API route
export const maxDuration = 300; // 5 minutes

// Client-side timeout
const response = await fetch('/api/process', {
  method: 'POST',
  body: JSON.stringify(data),
  signal: AbortSignal.timeout(300000) // 5 minutes
});
```

## Video Processing Issues

### 1. yt-dlp Errors

**Error: "yt-dlp not found"**

```bash
# Install yt-dlp
pip install yt-dlp

# Or with homebrew
brew install yt-dlp

# Verify installation
yt-dlp --version
```

**Error: "Unable to extract video data"**

Common causes and solutions:

1. **Outdated yt-dlp**:
   ```bash
   pip install --upgrade yt-dlp
   ```

2. **Geographic restrictions**:
   ```javascript
   // Use cookies for authentication
   const cookiesPath = path.join(process.cwd(), 'cookies.txt');
   const ytdlpArgs = ['--cookies', cookiesPath];
   ```

3. **Private/deleted videos**:
   - Check if video is publicly accessible
   - Verify URL is correct

### 2. FFmpeg Errors

**Error: "ffmpeg not found"**

```bash
# Windows (Chocolatey)
choco install ffmpeg

# macOS (Homebrew)
brew install ffmpeg

# Linux
sudo apt-get install ffmpeg

# Verify installation
ffmpeg -version
```

**Error: "Conversion failed"**

```javascript
// Debug FFmpeg command
const ffmpegCommand = `ffmpeg -i input.mp4 -ss ${startTime} -to ${endTime} -c copy output.mp4`;
console.log('FFmpeg command:', ffmpegCommand);

// Try re-encoding instead of copying
const ffmpegArgs = [
  '-i', inputPath,
  '-ss', startTime.toString(),
  '-to', endTime.toString(),
  '-c:v', 'libx264',
  '-c:a', 'aac',
  outputPath
];
```

### 3. Download Quality Issues

**Problem: Poor video quality**

```javascript
// Improve quality settings
const formatString = 'bestvideo[height<=1080]+bestaudio/best[height<=1080]';
const ytdlpArgs = [
  '-f', formatString,
  '--merge-output-format', 'mp4'
];

// FFmpeg quality settings
const ffmpegArgs = [
  '-c:v', 'libx264',
  '-crf', '18', // Lower = better quality (18-23 recommended)
  '-preset', 'slow', // Slower = better compression
  '-c:a', 'aac',
  '-b:a', '192k' // Audio bitrate
];
```

## AI Model Issues

### 1. Poor Match Quality

**Problem: Irrelevant clips being selected**

Solutions:

1. **Increase token usage**:
   ```javascript
   modelSettings: {
     tokenUsage: 'high' // More context for better matches
   }
   ```

2. **Enable thinking mode**:
   ```javascript
   modelSettings: {
     thinkingMode: true // Deeper analysis
   }
   ```

3. **Use Opus model**:
   ```javascript
   modelSettings: {
     model: 'claude-3-opus' // Higher quality but 5x cost
   }
   ```

### 2. Transcript Quality Issues

**Problem: Inaccurate transcriptions**

```javascript
// Force Google Cloud transcription
const transcript = await generateTranscription(videoUrl, {
  forceGenerate: true,
  language: 'en-US'
});

// Fallback to YouTube captions
if (!transcript) {
  transcript = await getYouTubeTranscript(videoId);
}
```

### 3. Context Window Errors

**Error: "Maximum context length exceeded"**

```javascript
// Reduce context window size
const MAX_CONTEXT_TOKENS = modelSettings.tokenUsage === 'high' ? 4000 : 2000;

// Chunk transcript if too large
function chunkTranscript(transcript, maxTokens) {
  const chunks = [];
  let currentChunk = [];
  let currentTokens = 0;
  
  for (const segment of transcript) {
    const segmentTokens = estimateTokens(segment.text);
    if (currentTokens + segmentTokens > maxTokens) {
      chunks.push(currentChunk);
      currentChunk = [segment];
      currentTokens = segmentTokens;
    } else {
      currentChunk.push(segment);
      currentTokens += segmentTokens;
    }
  }
  
  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }
  
  return chunks;
}
```

## Performance Problems

### 1. Slow Processing

**Diagnosis:**
```javascript
// Add timing logs
console.time('transcript-fetch');
const transcript = await getTranscript(videoUrl);
console.timeEnd('transcript-fetch');

console.time('ai-matching');
const matches = await findMatches(tweet, transcript);
console.timeEnd('ai-matching');
```

**Solutions:**

1. **Enable parallel processing**:
   ```javascript
   // Process videos in parallel
   const results = await Promise.all(
     videoUrls.map(url => processVideo(url))
   );
   ```

2. **Implement caching**:
   ```javascript
   // Cache transcripts
   const cacheKey = `transcript:${videoId}`;
   const cached = await cache.get(cacheKey);
   if (cached) return cached;
   
   const transcript = await generateTranscript(videoUrl);
   await cache.set(cacheKey, transcript, 3600); // 1 hour
   ```

### 2. Memory Issues

**Error: "JavaScript heap out of memory"**

```bash
# Increase memory limit
NODE_OPTIONS="--max-old-space-size=4096" npm start

# Or in package.json
"scripts": {
  "start": "node --max-old-space-size=4096 node_modules/.bin/next start"
}
```

**Memory leak detection:**
```javascript
// Monitor memory usage
setInterval(() => {
  const usage = process.memoryUsage();
  console.log('Memory usage:', {
    rss: `${Math.round(usage.rss / 1024 / 1024)}MB`,
    heapTotal: `${Math.round(usage.heapTotal / 1024 / 1024)}MB`,
    heapUsed: `${Math.round(usage.heapUsed / 1024 / 1024)}MB`
  });
}, 30000);
```

### 3. Timeout Issues

**Client-side timeout handling:**
```javascript
async function fetchWithTimeout(url, options, timeout = 300000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Request timeout');
    }
    throw error;
  }
}
```

## Deployment Issues

### 1. Docker Build Failures

**Error: "npm install failed"**
```dockerfile
# Use specific Node version
FROM node:18.17-alpine

# Clear npm cache
RUN npm cache clean --force

# Use CI for reproducible builds
RUN npm ci --only=production
```

### 2. Railway Deployment Issues

**Error: "Build failed"**
```toml
# nixpacks.toml
[phases.setup]
nixPkgs = ["nodejs-18_x", "ffmpeg", "python311"]

[phases.install]
cmds = ["npm ci", "pip install yt-dlp"]

[phases.build]
cmds = ["npm run build"]
```

### 3. Vercel Deployment Issues

**Error: "Function timeout"**
```json
// vercel.json
{
  "functions": {
    "app/api/process/route.js": {
      "maxDuration": 300
    }
  }
}
```

## Debug Tools

### 1. API Health Check

```bash
# Check system health
curl http://localhost:3000/api/health

# Expected response:
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

### 2. Enable Debug Logging

```javascript
// Add to .env.local
DEBUG=twipclip:*
LOG_LEVEL=debug

// In your code
if (process.env.DEBUG) {
  console.log('[DEBUG]', data);
}
```

### 3. Test Individual Components

```bash
# Test video download
curl -X POST http://localhost:3000/api/test-ytdlp \
  -H "Content-Type: application/json" \
  -d '{"url": "https://youtube.com/watch?v=..."}'

# Test transcription
curl -X POST http://localhost:3000/api/test-transcription \
  -H "Content-Type: application/json" \
  -d '{"url": "https://youtube.com/watch?v=..."}'

# Test AI matching
curl -X POST http://localhost:3000/api/test-matching \
  -H "Content-Type: application/json" \
  -d '{"tweet": "test", "transcript": [...]}'
```

### 4. Browser DevTools

```javascript
// Add performance marks
performance.mark('process-start');
// ... processing ...
performance.mark('process-end');
performance.measure('process-duration', 'process-start', 'process-end');

// Log to console
const measures = performance.getEntriesByType('measure');
console.table(measures);
```

## Getting Help

### 1. Gathering Debug Information

When reporting issues, include:

1. **Environment info**:
   ```bash
   node --version
   npm --version
   ffmpeg -version
   yt-dlp --version
   ```

2. **Error logs**:
   ```javascript
   // Full error stack trace
   console.error(error.stack);
   ```

3. **Request/Response data**:
   ```javascript
   console.log('Request:', JSON.stringify(requestData, null, 2));
   console.log('Response:', JSON.stringify(responseData, null, 2));
   ```

### 2. Common Log Locations

- **Next.js logs**: Console output or `.next/server` directory
- **API logs**: Check server console or deployment platform logs
- **Browser logs**: DevTools Console (F12)

### 3. Creating Bug Reports

Include:
1. Steps to reproduce
2. Expected behavior
3. Actual behavior
4. Environment details
5. Error messages/logs
6. Screenshots if UI-related

### 4. Performance Profiling

```javascript
// Create performance report
function generatePerformanceReport() {
  return {
    timestamp: new Date().toISOString(),
    memory: process.memoryUsage(),
    uptime: process.uptime(),
    resourceUsage: process.resourceUsage(),
    versions: process.versions
  };
}

// Log report
console.log(JSON.stringify(generatePerformanceReport(), null, 2));
```

## YouTube Authentication Issues

### New Browser-Based Authentication System

TwipClip now uses yt-dlp's native `--cookies-from-browser` feature for authentication. This is more reliable and secure than manual cookie extraction.

### "Sign in to confirm you're not a bot" Error

**Problem**: YouTube requires authentication for some videos.

**Solution**:
1. **Connect Your Browser**:
   - Click the "YouTube Authentication" section in the UI
   - Select your browser (Chrome, Firefox, Edge, etc.)
   - Make sure you're logged into YouTube in that browser
   - Click "Test" to verify authentication works

2. **Browser-Specific Issues**:
   - **Chrome on Windows**: Close Chrome before downloading (Windows locks cookie database when Chrome is running)
   - **Firefox**: Works while browser is running
   - **Edge**: Works while browser is running
   - **Brave**: May need to select specific profile

3. **If Authentication Fails**:
   - Try a different browser
   - Ensure you're logged into YouTube
   - Clear browser cache and log in again
   - Try using a browser profile without extensions

### Browser Not Detected

**Problem**: Your browser doesn't appear in the list.

**Solution**:
1. Ensure the browser is installed in the default location
2. Supported browsers: Chrome, Firefox, Edge, Brave, Opera, Vivaldi, Safari (macOS)
3. Try restarting the application

### Cookie Extraction Failed

**Problem**: yt-dlp can't access browser cookies.

**Common Causes & Solutions**:
1. **Browser is running (Chrome on Windows)**:
   - Close Chrome completely
   - Use Task Manager to ensure no Chrome processes are running

2. **Permission Issues**:
   - Run the application with appropriate permissions
   - On Windows, try running as Administrator

3. **Browser Profile Issues**:
   - Try using the default profile
   - Create a new browser profile specifically for YouTube

### Testing Authentication

Run the test script to verify your setup:
```bash
node scripts/test-browser-auth.js
```

This will:
- Detect available browsers
- Test cookie extraction
- Verify yt-dlp integration
- Show platform-specific warnings

## Video Processing Errors

### Transcript Extraction Failed
**Error**: `Failed to extract transcript`

**Possible Causes**:
1. Video has no captions/subtitles
2. Video is private or deleted
3. Network timeout

**Solutions**:
- Verify the video URL is correct
- Check if the video has captions enabled
- Try again with a stable internet connection
- Use videos with auto-generated or manual captions

### AI Processing Timeout
**Error**: `AI processing timed out`

**Solutions**:
- Break down large threads into smaller chunks
- Reduce the number of videos processed at once
- Check your API rate limits

### No Matches Found
**Problem**: The system can't find matching clips for your tweets.

**Solutions**:
- Ensure tweets and video content are related
- Use more specific keywords in tweets
- Verify transcript quality (check if video has clear audio)
- Try different videos that discuss the tweet topics

## Download Problems

### Clip Download Failed
**Error**: `Failed to download clip`

**Common Causes**:
1. **Authentication Required**: See [YouTube Authentication](#youtube-authentication)
2. **Network Issues**: Check internet connection
3. **Video Restrictions**: Some videos can't be downloaded due to DRM

**Solutions**:
- Ensure YouTube authentication is set up
- Try downloading with lower quality (720p instead of 1080p)
- Check if the video is available in your region
- Verify sufficient disk space

### Bulk Download Issues
**Problem**: Bulk download fails or is incomplete.

**Solutions**:
- Reduce concurrent downloads in settings
- Check available disk space
- Ensure stable internet connection
- Try downloading fewer clips at once

### FFmpeg Errors
**Error**: `FFmpeg exited with code 1`

**Solutions**:
- Verify FFmpeg is properly installed
- Check FFmpeg version: `ffmpeg -version`
- Ensure video codec is supported
- Try with different quality settings

## API Issues

### Rate Limiting
**Error**: `429 Too Many Requests`

**Solutions**:
- Implement request throttling
- Add delays between API calls
- Check your API quota and limits
- Consider upgrading your API plan

### Invalid API Key
**Error**: `Invalid API key provided`

**Solutions**:
1. Verify `.env.local` file exists
2. Check API key format and validity
3. Ensure no extra spaces or quotes
4. Regenerate API key if necessary

### CORS Errors
**Error**: `CORS policy blocked`

**Solutions**:
- Ensure API routes are properly configured
- Check Next.js middleware settings
- Verify API endpoint URLs
- Use proper request headers

## Performance Issues

### Slow Processing
**Problem**: Video processing takes too long.

**Solutions**:
1. **Optimize Video Selection**:
   - Use shorter videos when possible
   - Select videos with existing transcripts

2. **System Optimization**:
   - Close unnecessary applications
   - Ensure sufficient RAM (8GB+ recommended)
   - Use SSD for temporary files

3. **Configuration**:
   - Reduce concurrent processing
   - Lower video quality for faster downloads
   - Enable caching for repeated searches

### High Memory Usage
**Problem**: Application uses too much memory.

**Solutions**:
- Process fewer videos simultaneously
- Reduce transcript buffer size
- Clear temporary files regularly
- Restart the application periodically

### Browser Freezing
**Problem**: UI becomes unresponsive during processing.

**Solutions**:
- Use async processing for large operations
- Enable progress indicators
- Break large tasks into smaller chunks
- Refresh the page if stuck

## Common Error Messages

### "ENOENT: no such file or directory"
- Ensure all required directories exist
- Check file paths in configuration
- Verify write permissions

### "EPIPE: broken pipe"
- Network connection interrupted
- Restart the download/process
- Check firewall settings

### "ENOMEM: out of memory"
- Reduce concurrent operations
- Increase Node.js memory limit:
  ```bash
  NODE_OPTIONS="--max-old-space-size=4096" npm run dev
  ```

## Getting Help

If you continue to experience issues:

1. **Check Logs**:
   - Browser console (F12)
   - Server logs in terminal
   - Application logs in `./logs`

2. **Gather Information**:
   - Error messages
   - Steps to reproduce
   - System information
   - Browser and version

3. **Report Issues**:
   - GitHub Issues with detailed description
   - Include relevant logs
   - Specify your environment

## Quick Fixes Checklist

- [ ] yt-dlp installed and updated
- [ ] FFmpeg installed and in PATH
- [ ] Logged into YouTube in browser
- [ ] Selected correct browser in UI
- [ ] API keys properly configured
- [ ] Sufficient disk space
- [ ] Stable internet connection
- [ ] Node.js 18+ installed
- [ ] All npm packages installed 