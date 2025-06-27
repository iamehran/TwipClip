# Railway Performance Optimization Guide

This guide helps you optimize TwipClip for maximum performance on Railway.

## Quick Wins (Implement First)

### 1. Enable Fast Matching
The fast context-aware matching reduces AI API calls by 80%+ through batch processing:

```bash
USE_FAST_MATCHING=true
USE_CONTEXT_AWARE=true
```

### 2. Scale Your Service
In Railway Dashboard:
- Go to your service  Settings  Resources
- Increase CPU to 4-8 vCPU
- Increase RAM to 8-16 GB
- Add 2-4 replicas for concurrent request handling

### 3. Optimize Concurrent Processing
```bash
MAX_CONCURRENT_TRANSCRIPTS=5  # Adjust based on your resources
FFMPEG_THREADS=4
```

## Performance Bottlenecks & Solutions

### 1. **Transcription Speed**
- **Problem**: Whisper API calls are sequential and slow
- **Solution**: Batch processing with concurrent limits
- **Implementation**: Already implemented with `MAX_CONCURRENT_TRANSCRIPTS`

### 2. **AI Matching Latency**
- **Problem**: Multiple AI calls for each tweet/video combination
- **Solution**: Fast batch matching that processes all tweets in one AI call
- **Implementation**: Enabled with `USE_FAST_MATCHING=true`

### 3. **Video Download Speed**
- **Problem**: yt-dlp downloads can be slow
- **Solution**: 
  - Use per-user cookies for better YouTube performance
  - Enable concurrent downloads
  - Use 720p quality (already set)

### 4. **Memory Usage**
- **Problem**: Large video files can cause OOM errors
- **Solution**: 
  ```bash
  NODE_OPTIONS="--max-old-space-size=4096"
  ```

## Railway-Specific Optimizations

### 1. **Use Railway Regions**
Deploy to the region closest to your users:
- US West (Oregon) - Best for West Coast
- US East (Virginia) - Best for East Coast
- Europe (Amsterdam) - Best for EU
- Asia (Singapore) - Best for APAC

### 2. **Enable Private Networking**
If using multiple services (e.g., Redis cache):
- Use Railway''s private networking for internal communication
- Reduces latency and egress costs

### 3. **Resource Scaling Strategy**

#### For Low Traffic (< 100 requests/day)
```
- 2 vCPU, 4 GB RAM
- 1 replica
- Hobby plan ($5/month)
```

#### For Medium Traffic (100-1000 requests/day)
```
- 4 vCPU, 8 GB RAM
- 2 replicas
- Pro plan ($20/month)
```

#### For High Traffic (1000+ requests/day)
```
- 8 vCPU, 16 GB RAM
- 4 replicas
- Pro plan with higher limits
```

## Monitoring Performance

### 1. **Railway Metrics**
Monitor in Railway Dashboard:
- CPU usage (aim for < 80%)
- Memory usage (aim for < 80%)
- Network throughput
- Request latency

### 2. **Application Logs**
Look for:
- Transcript processing times
- AI matching duration
- Download speeds
- Error rates

## Cost Optimization

### 1. **Usage-Based Scaling**
Railway charges per usage, so:
- Scale down during off-hours
- Use app sleeping for staging environments
- Monitor usage in Railway dashboard

### 2. **Egress Cost Reduction**
- Use compression for API responses
- Cache frequently accessed data
- Consider external CDN for media files

## Environment Variables Reference

```bash
# Core Performance Settings
USE_FAST_MATCHING=true
USE_CONTEXT_AWARE=true
MAX_CONCURRENT_TRANSCRIPTS=5
ENABLE_TRANSCRIPT_CACHE=true

# Resource Optimization
NODE_OPTIONS="--max-old-space-size=4096"
FFMPEG_THREADS=4

# API Optimization
ANTHROPIC_MAX_RETRIES=3
OPENAI_MAX_RETRIES=3

# Railway Auto-Set Variables
# RAILWAY_ENVIRONMENT=production
# PORT=3000
# RAILWAY_PRIVATE_DOMAIN=<service>.railway.internal
```

## Deployment Checklist

1. [ ] Set all performance environment variables
2. [ ] Scale service resources appropriately
3. [ ] Add replicas for concurrent handling
4. [ ] Choose optimal region
5. [ ] Enable monitoring alerts
6. [ ] Test with expected load
7. [ ] Monitor first 24 hours closely
