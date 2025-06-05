# TwipClip Transcription Guide

## Current Transcription Methods

### 1. YouTube Transcript API (Free, Fast)
- ✅ Works when: Video has captions/subtitles
- ❌ Fails when: No captions available
- 📝 Your test video `ReGC2GtWFp4` has NO captions

### 2. Google Video Intelligence API 
- ✅ Works with: Direct MP4 files (e.g., `https://example.com/video.mp4`)
- ❌ Does NOT work with: YouTube URLs, Vimeo URLs, etc.
- 💰 Cost: First 60 min/month free, then $0.048/minute

### 3. OpenAI Whisper API
- ✅ Works with: Any video (downloads audio first)
- ❌ Your issue: Invalid API key (401 error)
- 💰 Cost: $0.006/minute
- 📝 Fix: Update your OpenAI API key in `.env.local`

## Recommended Solutions

### Option 1: Fix Your OpenAI API Key (BEST)
1. Get a valid key from https://platform.openai.com/api-keys
2. Update `.env.local`:
   ```
   OPENAI_API_KEY=sk-proj-YOUR_ACTUAL_KEY_HERE
   ```
3. Restart the server
4. The system will automatically use Whisper for videos without captions

### Option 2: Use Videos with Captions
Test with these videos that have captions:
- `https://www.youtube.com/watch?v=mhDJNfV7hjk`
- `https://www.youtube.com/watch?v=9OeznAuQqpA`

### Option 3: Use Direct MP4 Files
Google Video Intelligence works with these:
- `https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4`
- `https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4`

## Technical Limitation
Google Video Intelligence API requires **publicly accessible direct video files**. It cannot:
- Access YouTube's internal video streams
- Process URLs that require authentication
- Work with embedded players

This is why we need Whisper for YouTube videos without captions. 