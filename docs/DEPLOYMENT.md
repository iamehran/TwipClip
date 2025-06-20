# Deployment Guide

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Environment Configuration](#environment-configuration)
4. [Deployment Options](#deployment-options)
5. [Docker Deployment](#docker-deployment)
6. [Railway Deployment](#railway-deployment)
7. [Vercel Deployment](#vercel-deployment)
8. [Production Considerations](#production-considerations)
9. [Monitoring & Maintenance](#monitoring--maintenance)
10. [Troubleshooting](#troubleshooting)

## Overview

TwipClip can be deployed on various platforms. This guide covers deployment to Docker, Railway, and Vercel, with detailed instructions for each platform.

## Prerequisites

### Required Services

1. **Anthropic API Key**
   - Sign up at [console.anthropic.com](https://console.anthropic.com)
   - Generate an API key
   - Note: Opus model costs 5x more than Sonnet

2. **Google Cloud API Key**
   - Enable Video Intelligence API
   - Create credentials
   - See [Google Cloud Setup Guide](./google-video-intelligence-setup.md)

3. **System Dependencies**
   - FFmpeg (for video processing)
   - yt-dlp (for video downloading)
   - Node.js 18+ runtime

### Optional Services

- YouTube cookies for better reliability (see [YouTube API Setup](./YOUTUBE_API_SETUP.md))
- CDN for static assets
- External monitoring service

## Environment Configuration

### Required Environment Variables

```env
# API Keys (Required)
ANTHROPIC_API_KEY=sk-ant-api03-...
GOOGLE_CLOUD_API_KEY=AIza...

# Application Settings
NODE_ENV=production
NEXT_PUBLIC_API_URL=https://your-domain.com

# Optional Settings
YOUTUBE_COOKIES=[cookie_string]
CLEANUP_INTERVAL=1800000  # 30 minutes
MAX_PROCESSING_TIME=300000  # 5 minutes
```

### Environment Template

Create a `.env.production` file:

```env
# Core API Keys
ANTHROPIC_API_KEY=your_anthropic_key_here
GOOGLE_CLOUD_API_KEY=your_google_cloud_key_here

# Application Configuration
NODE_ENV=production
NEXT_PUBLIC_API_URL=https://twipclip.yourdomain.com

# Performance Settings
MAX_CONCURRENT_DOWNLOADS=3
TRANSCRIPT_CACHE_TTL=3600
CLEANUP_INTERVAL=1800000

# Security
RATE_LIMIT_WINDOW=60000
RATE_LIMIT_MAX=10

# Optional: YouTube Authentication
YOUTUBE_COOKIES=your_cookies_here
```

## Deployment Options

### Option 1: Docker (Recommended)

Best for: Full control, scalability, consistent environments

### Option 2: Railway

Best for: Quick deployment, automatic scaling, built-in monitoring

### Option 3: Vercel

Best for: Serverless deployment, global CDN, easy rollbacks

## Docker Deployment

### 1. Multi-Stage Dockerfile

The project includes an optimized multi-stage Dockerfile:

```dockerfile
# Build stage
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build

# Production stage
FROM node:18-alpine
WORKDIR /app

# Install system dependencies
RUN apk add --no-cache \
    ffmpeg \
    python3 \
    py3-pip \
    && pip3 install yt-dlp

# Copy built application
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3000
CMD ["npm", "start"]
```

### 2. Build and Run

```bash
# Build the image
docker build -t twipclip:latest .

# Run with environment file
docker run -d \
  --name twipclip \
  -p 3000:3000 \
  --env-file .env.production \
  --restart unless-stopped \
  twipclip:latest

# Or with individual environment variables
docker run -d \
  --name twipclip \
  -p 3000:3000 \
  -e ANTHROPIC_API_KEY=sk-ant-... \
  -e GOOGLE_CLOUD_API_KEY=AIza... \
  --restart unless-stopped \
  twipclip:latest
```

### 3. Docker Compose

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  twipclip:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
    env_file:
      - .env.production
    volumes:
      - ./temp:/app/temp
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

Run with Docker Compose:

```bash
docker-compose up -d
```

## Railway Deployment

### 1. Prepare Repository

Ensure your repository includes:
- `railway.json` configuration
- `nixpacks.toml` for build customization
- All required files committed

### 2. Railway Configuration

`railway.json`:
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "numReplicas": 1,
    "healthcheckPath": "/api/health",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3
  }
}
```

`nixpacks.toml`:
```toml
[phases.setup]
nixPkgs = ["nodejs-18_x", "ffmpeg", "python311"]

[phases.install]
cmds = ["npm ci", "pip install yt-dlp"]

[phases.build]
cmds = ["npm run build"]

[start]
cmd = "npm start"
```

### 3. Deploy to Railway

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login to Railway
railway login

# Create new project
railway init

# Add environment variables
railway variables set ANTHROPIC_API_KEY=sk-ant-...
railway variables set GOOGLE_CLOUD_API_KEY=AIza...

# Deploy
railway up
```

### 4. Configure Domain

```bash
# Generate domain
railway domain

# Or set custom domain
railway domain set twipclip.yourdomain.com
```

## Vercel Deployment

### 1. Prepare for Serverless

Create `vercel.json`:

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": ".next",
  "framework": "nextjs",
  "regions": ["iad1"],
  "functions": {
    "app/api/process/route.js": {
      "maxDuration": 300
    },
    "app/api/download/route.ts": {
      "maxDuration": 60
    }
  }
}
```

### 2. Install Vercel CLI

```bash
npm install -g vercel
```

### 3. Deploy

```bash
# Login to Vercel
vercel login

# Deploy to production
vercel --prod

# Set environment variables
vercel env add ANTHROPIC_API_KEY
vercel env add GOOGLE_CLOUD_API_KEY
```

### 4. Configure External Dependencies

Since Vercel is serverless, you'll need external services for:
- FFmpeg processing (use cloud service)
- File storage (use S3 or similar)
- Long-running tasks (use queue service)

## Production Considerations

### 1. Security

```typescript
// Implement rate limiting
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute
  message: 'Too many requests'
});

// Add CORS configuration
const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  credentials: true
};

// Input validation
const validateInput = (req, res, next) => {
  const { thread, videoUrls } = req.body;
  if (!thread || !videoUrls || !Array.isArray(videoUrls)) {
    return res.status(400).json({ error: 'Invalid input' });
  }
  next();
};
```

### 2. Performance Optimization

```typescript
// Enable caching
app.use((req, res, next) => {
  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'public, max-age=3600');
  }
  next();
});

// Compress responses
import compression from 'compression';
app.use(compression());

// Optimize images
import sharp from 'sharp';
const optimizeImage = async (buffer) => {
  return sharp(buffer)
    .resize(1920, 1080, { fit: 'inside' })
    .jpeg({ quality: 80 })
    .toBuffer();
};
```

### 3. Database Integration (Optional)

```typescript
// Add database for caching transcripts
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Cache transcript
async function cacheTranscript(videoId, transcript) {
  await prisma.transcript.upsert({
    where: { videoId },
    update: { content: transcript, updatedAt: new Date() },
    create: { videoId, content: transcript }
  });
}

// Retrieve cached transcript
async function getCachedTranscript(videoId) {
  const cached = await prisma.transcript.findUnique({
    where: { videoId }
  });
  
  if (cached && isRecent(cached.updatedAt)) {
    return cached.content;
  }
  return null;
}
```

### 4. Scaling Considerations

```yaml
# Kubernetes deployment example
apiVersion: apps/v1
kind: Deployment
metadata:
  name: twipclip
spec:
  replicas: 3
  selector:
    matchLabels:
      app: twipclip
  template:
    metadata:
      labels:
        app: twipclip
    spec:
      containers:
      - name: twipclip
        image: twipclip:latest
        ports:
        - containerPort: 3000
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "1Gi"
            cpu: "1000m"
        env:
        - name: ANTHROPIC_API_KEY
          valueFrom:
            secretKeyRef:
              name: twipclip-secrets
              key: anthropic-key
```

## Monitoring & Maintenance

### 1. Health Checks

```typescript
// Comprehensive health check
app.get('/api/health', async (req, res) => {
  const checks = {
    app: 'ok',
    ffmpeg: await checkFFmpeg(),
    ytdlp: await checkYtDlp(),
    anthropic: await checkAnthropicAPI(),
    googleCloud: await checkGoogleAPI(),
    diskSpace: await checkDiskSpace(),
    memory: process.memoryUsage()
  };
  
  const isHealthy = Object.values(checks)
    .filter(v => typeof v === 'boolean')
    .every(v => v);
  
  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'healthy' : 'degraded',
    checks,
    timestamp: new Date().toISOString()
  });
});
```

### 2. Logging

```typescript
// Structured logging with Winston
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

// Log important events
logger.info('Processing started', {
  threadId: id,
  videoCount: urls.length,
  model: settings.model,
  timestamp: new Date().toISOString()
});
```

### 3. Metrics Collection

```typescript
// Prometheus metrics
import { register, Counter, Histogram } from 'prom-client';

const processCounter = new Counter({
  name: 'twipclip_process_total',
  help: 'Total number of processing requests',
  labelNames: ['status', 'model']
});

const processDuration = new Histogram({
  name: 'twipclip_process_duration_seconds',
  help: 'Processing duration in seconds',
  labelNames: ['model']
});

// Track metrics
processCounter.inc({ status: 'success', model: 'claude-3.5-sonnet' });
processDuration.observe({ model: 'claude-3.5-sonnet' }, duration);

// Expose metrics endpoint
app.get('/metrics', (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(register.metrics());
});
```

### 4. Automated Cleanup

```typescript
// Scheduled cleanup job
import cron from 'node-cron';

cron.schedule('0 * * * *', async () => {
  logger.info('Starting scheduled cleanup');
  
  try {
    // Clean temp files older than 1 hour
    await cleanOldFiles('./temp', 60 * 60 * 1000);
    
    // Clean expired cache entries
    await cleanExpiredCache();
    
    logger.info('Cleanup completed successfully');
  } catch (error) {
    logger.error('Cleanup failed', error);
  }
});
```

## Troubleshooting

### Common Issues

1. **FFmpeg Not Found**
   ```bash
   # Docker: Add to Dockerfile
   RUN apk add --no-cache ffmpeg
   
   # Railway: Add to nixpacks.toml
   nixPkgs = ["ffmpeg"]
   ```

2. **Memory Issues**
   ```javascript
   // Increase Node.js memory limit
   NODE_OPTIONS="--max-old-space-size=4096"
   ```

3. **Timeout Errors**
   ```javascript
   // Increase timeout for serverless functions
   export const config = {
     api: {
       bodyParser: {
         sizeLimit: '10mb',
       },
       responseLimit: false,
       externalResolver: true,
     },
     maxDuration: 300, // 5 minutes
   };
   ```

4. **API Rate Limits**
   ```javascript
   // Implement retry logic
   async function retryWithBackoff(fn, retries = 3) {
     for (let i = 0; i < retries; i++) {
       try {
         return await fn();
       } catch (error) {
         if (i === retries - 1) throw error;
         await new Promise(r => setTimeout(r, Math.pow(2, i) * 1000));
       }
     }
   }
   ```

### Debug Mode

Enable debug logging in production:

```env
DEBUG=twipclip:*
LOG_LEVEL=debug
```

### Performance Profiling

```javascript
// Add performance monitoring
import { performance } from 'perf_hooks';

const startTime = performance.now();
// ... processing logic ...
const duration = performance.now() - startTime;

logger.info(`Processing completed in ${duration}ms`);
```

## Backup and Recovery

### 1. Data Backup

```bash
# Backup script
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/twipclip_$DATE"

# Backup environment
cp .env.production "$BACKUP_DIR/env"

# Backup logs
cp -r logs/ "$BACKUP_DIR/logs"

# Backup any persistent data
tar -czf "$BACKUP_DIR/data.tar.gz" ./data
```

### 2. Disaster Recovery

1. Keep environment variables in secure vault
2. Version control all configuration
3. Document all external dependencies
4. Test recovery procedures regularly

## Cost Optimization

1. **API Usage**
   - Monitor Anthropic API usage
   - Use Sonnet model for most requests
   - Cache results when possible

2. **Infrastructure**
   - Use auto-scaling
   - Schedule downtime for low-traffic periods
   - Optimize Docker images

3. **Storage**
   - Implement aggressive cleanup
   - Use cloud storage with lifecycle policies
   - Compress logs and archives 