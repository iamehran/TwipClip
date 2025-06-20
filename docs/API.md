# API Documentation

## Overview

TwipClip exposes a RESTful API for processing threads and extracting video clips. All endpoints are located under `/api/`.

## Authentication

Currently, the API does not require authentication. API keys for external services (Anthropic, Google Cloud) should be configured in environment variables.

## Endpoints

### 1. Process Thread

**POST** `/api/process`

Processes a thread and finds matching video clips.

#### Request Body

```json
{
  "thread": "Thread content with tweets separated by ---",
  "videoUrls": ["https://youtube.com/watch?v=...", "..."],
  "modelSettings": {
    "model": "claude-3.5-sonnet",
    "thinkingMode": false,
    "tokenUsage": "medium"
  }
}
```

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `thread` | string | Yes | Thread content with tweets separated by `---` |
| `videoUrls` | string[] | Yes | Array of YouTube video URLs |
| `modelSettings.model` | string | No | AI model: `claude-3-opus` or `claude-3.5-sonnet` (default) |
| `modelSettings.thinkingMode` | boolean | No | Enable thinking mode for deeper analysis (default: false) |
| `modelSettings.tokenUsage` | string | No | Token usage level: `low`, `medium` (default), or `high` |

#### Response

```json
{
  "results": [
    {
      "tweet": "Tweet content",
      "matches": [
        {
          "videoTitle": "Video Title",
          "videoId": "abc123",
          "videoUrl": "https://youtube.com/watch?v=abc123",
          "thumbnailUrl": "https://...",
          "startTime": 120,
          "endTime": 180,
          "matchedContent": "Transcript excerpt",
          "confidence": 0.95,
          "explanation": "Why this clip matches"
        }
      ]
    }
  ],
  "processingTime": 45.2,
  "totalClipsFound": 5
}
```

### 2. Download Single Clip

**POST** `/api/download-clip`

Downloads a single video clip.

#### Request Body

```json
{
  "videoUrl": "https://youtube.com/watch?v=...",
  "startTime": 120,
  "endTime": 180,
  "quality": "720p",
  "tweetNumber": 1
}
```

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `videoUrl` | string | Yes | Video URL |
| `startTime` | number | Yes | Start time in seconds |
| `endTime` | number | Yes | End time in seconds |
| `quality` | string | No | Video quality: `720p` (default) or `1080p` |
| `tweetNumber` | number | No | Tweet number for filename |

#### Response

Returns the video file as a binary stream with appropriate headers for download.

### 3. Download All Clips

**POST** `/api/download-all`

Downloads all matched clips as a ZIP file.

#### Request Body

```json
{
  "clips": [
    {
      "videoUrl": "https://youtube.com/watch?v=...",
      "startTime": 120,
      "endTime": 180,
      "tweetNumber": 1,
      "quality": "720p"
    }
  ]
}
```

#### Response

Returns a ZIP file containing all clips with appropriate naming.

### 4. Search Videos

**GET** `/api/search`

Search for videos on YouTube.

#### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `q` | string | Yes | Search query |
| `maxResults` | number | No | Maximum results (default: 10) |

#### Response

```json
{
  "videos": [
    {
      "id": "abc123",
      "title": "Video Title",
      "channel": "Channel Name",
      "duration": "10:30",
      "thumbnailUrl": "https://...",
      "url": "https://youtube.com/watch?v=abc123"
    }
  ]
}
```

### 5. Health Check

**GET** `/api/health`

Check system health and dependencies.

#### Response

```json
{
  "status": "healthy",
  "dependencies": {
    "ffmpeg": true,
    "ytdlp": true,
    "anthropic": true,
    "googleCloud": true
  },
  "timestamp": "2024-01-01T12:00:00Z"
}
```

### 6. Process Status

**GET** `/api/process/status`

Get the status of ongoing processing tasks.

#### Response

```json
{
  "activeTasks": 2,
  "queueLength": 5,
  "averageProcessingTime": 45.2
}
```

## Error Handling

All endpoints return standard HTTP status codes:

- `200 OK` - Success
- `400 Bad Request` - Invalid request parameters
- `404 Not Found` - Resource not found
- `429 Too Many Requests` - Rate limit exceeded
- `500 Internal Server Error` - Server error

Error responses follow this format:

```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "Detailed error message",
    "details": {}
  }
}
```

## Rate Limits

- Process endpoint: 10 requests per minute
- Download endpoints: 20 requests per minute
- Search endpoint: 30 requests per minute

## Best Practices

1. **Batch Processing**: Use the bulk download endpoint instead of multiple single downloads
2. **Error Handling**: Implement retry logic with exponential backoff
3. **Timeouts**: Set client timeout to at least 120 seconds for processing
4. **Validation**: Validate video URLs before sending requests

## Examples

### Process a Thread with Custom Settings

```javascript
const response = await fetch('/api/process', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    thread: "First tweet\n---\nSecond tweet",
    videoUrls: ["https://youtube.com/watch?v=abc123"],
    modelSettings: {
      model: "claude-3-opus",
      thinkingMode: true,
      tokenUsage: "high"
    }
  })
});

const data = await response.json();
```

### Download All Clips

```javascript
const clips = data.results.flatMap(r => 
  r.matches.map(m => ({
    videoUrl: m.videoUrl,
    startTime: m.startTime,
    endTime: m.endTime,
    tweetNumber: r.tweetNumber,
    quality: "1080p"
  }))
);

const response = await fetch('/api/download-all', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ clips })
});

// Handle the ZIP file download
const blob = await response.blob();
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = 'clips.zip';
a.click();
``` 