# Google Video Intelligence API Setup Guide

## Overview

Google Video Intelligence API is a powerful alternative to Whisper that can:
- Process videos up to **10GB** (vs Whisper's 25MB audio limit)
- Work directly with video URLs (no audio extraction needed)
- No FFmpeg required
- Better accuracy for professional content
- Supports multiple languages

## Pricing (as of 2024)

**Speech Transcription Pricing:**
- First 60 minutes/month: **FREE**
- After 60 minutes: **$0.048 per minute**

**Examples:**
- 10 videos × 10 minutes each = 100 minutes = First 60 free + 40 × $0.048 = **$1.92**
- 100 videos × 5 minutes each = 500 minutes = First 60 free + 440 × $0.048 = **$21.12**

## Setup Steps

### 1. Create Google Cloud Account
1. Visit https://console.cloud.google.com/
2. Sign up (get $300 free credits for 90 days)
3. Create a new project (e.g., "TwipClip")

### 2. Enable Video Intelligence API
1. In Console, go to **APIs & Services** → **Library**
2. Search for "Cloud Video Intelligence API"
3. Click **ENABLE**

### 3. Create API Key
1. Go to **APIs & Services** → **Credentials**
2. Click **+ CREATE CREDENTIALS** → **API key**
3. Copy the key immediately
4. Click **RESTRICT KEY** for security:
   - Application restrictions: None (for testing) or HTTP referrers
   - API restrictions: Select "Cloud Video Intelligence API"

### 4. Enable Billing
1. Go to **Billing** in the console
2. Link a billing account (required but won't charge during free trial)
3. Set up budget alerts (optional but recommended)

### 5. Add to TwipClip
1. Copy your API key
2. Add to `.env.local`:
```env
GOOGLE_CLOUD_API_KEY=your_actual_api_key_here
```

## Testing Your Setup

Run this test command to verify your API key works:

```bash
curl -X POST \
  "https://videointelligence.googleapis.com/v1/videos:annotate?key=YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "inputUri": "gs://cloud-samples-data/video/cat.mp4",
    "features": ["SPEECH_TRANSCRIPTION"]
  }'
```

## Advantages Over Whisper

| Feature | Whisper API | Google Video Intelligence |
|---------|-------------|---------------------------|
| Max file size | 25MB (audio only) | 10GB (video) |
| Processing | Need FFmpeg + audio extraction | Direct video processing |
| Languages | ~100 | ~120 |
| Accuracy | Good | Excellent (esp. for clear speech) |
| Speed | Fast (< 1 min) | Moderate (2-5 min) |
| Cost | $0.006/minute | $0.048/minute (after 60 free) |

## Common Issues & Solutions

### "API not enabled" error
- Make sure you enabled the API in step 2
- Wait 2-3 minutes after enabling

### "Billing not enabled" error
- You must add a payment method even during free trial
- Go to Billing → Link billing account

### "Permission denied" error
- Check API key restrictions
- Make sure key is for the correct project

### "Video not accessible" error
- Google needs public video URLs
- YouTube, Vimeo public videos work
- Private/authenticated videos won't work

## Best Practices

1. **Monitor Usage**: Set up billing alerts at $10, $50, etc.
2. **Cache Results**: Store transcripts to avoid re-processing
3. **Batch Process**: Process multiple videos in parallel
4. **Use Restrictions**: Always restrict API keys in production

## Migration from Whisper

To completely replace Whisper:

1. **Update `.env.local`**: Add `GOOGLE_CLOUD_API_KEY`
2. **No FFmpeg needed**: Google handles video directly
3. **Better for long videos**: No file size limits
4. **Cost consideration**: Whisper is cheaper but limited

## Cost Optimization Tips

1. **Use YouTube transcripts first** (free)
2. **Cache everything** (avoid re-processing)
3. **Process only needed segments** (if possible)
4. **Monitor daily usage** in Google Console

## Quick Start Checklist

- [ ] Created Google Cloud account
- [ ] Created new project
- [ ] Enabled Video Intelligence API
- [ ] Created and copied API key
- [ ] Enabled billing
- [ ] Added key to `.env.local`
- [ ] Tested with sample video
- [ ] Set up billing alerts

## Support

- [API Documentation](https://cloud.google.com/video-intelligence/docs)
- [Pricing Calculator](https://cloud.google.com/products/calculator)
- [Support Forum](https://stackoverflow.com/questions/tagged/google-cloud-video-intelligence) 