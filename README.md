# TwipClip 🎬✂️

**AI-Powered Video Clip Extraction from Social Media Threads**

TwipClip is an intelligent web application that matches social media thread content to video transcripts and extracts relevant clips. Using Claude Opus 4 (Max Thinking) for semantic matching and Whisper for transcription, it finds the perfect video moments that correspond to your tweet threads.

## 🌟 Features

- **AI-Powered Matching**: Uses Claude Opus 4 (Max Thinking) for intelligent semantic matching
- **Multi-Platform Support**: YouTube, Vimeo, Twitter, TikTok, Instagram, and direct video files
- **Whisper Transcription**: High-quality audio transcription with YouTube transcript fallback
- **Parallel Processing**: Processes multiple videos simultaneously for speed
- **Direct Downloads**: Clips download directly to your browser's Downloads folder
- **Real-time Preview**: YouTube embed preview with timestamp navigation
- **Health Monitoring**: Built-in health checks and error handling
- **Production Ready**: Optimized for Railway deployment with automatic cleanup

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- Anthropic API key (for Claude Opus 4)
- OpenAI API key (for Whisper transcription)
- FFmpeg (auto-installed on Railway)
- yt-dlp (auto-installed on Railway)

### Local Development

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd TwipClip
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp env.example .env.local
   ```
   
   Edit `.env.local` with your API keys:
   ```env
   # AI API Configuration
   OPENAI_API_KEY=sk-your-openai-key-here
   ANTHROPIC_API_KEY=sk-ant-api03-your-anthropic-key-here
   
   # Environment
   NODE_ENV=development
   ```

4. **Install system dependencies** (Windows/Mac)
   - **FFmpeg**: Download from [ffmpeg.org](https://ffmpeg.org/download.html)
   - **yt-dlp**: `pip install yt-dlp`

5. **Start development server**
   ```bash
   npm run dev
   ```

6. **Open your browser**
   Navigate to `http://localhost:3000`

## 🎯 How to Use

1. **Prepare your content**:
   - Write your social media thread with tweets separated by triple dashes (`---`)
   - Collect video URLs (YouTube, Vimeo, etc.)

2. **Input your data**:
   - Paste your thread in the text area
   - Add video URLs (one per line or comma-separated)

3. **Process and download**:
   - Click "Find Clips" 
   - Preview clips with embedded players
   - Download individual clips to your computer

### Example Thread Format
```
Zuckerberg just threatened to shut down Instagram in Europe.
---
After the EU hit him with a $1.3 BILLION fine…
---
He gave them 2 options: Drop the case—or lose access for 400M users.
```

## 🏗️ Architecture

### Core Components

- **Frontend**: Next.js 15 with React 19 and Tailwind CSS
- **AI Matching**: Claude Opus 4 (Max Thinking) for semantic analysis
- **Transcription**: OpenAI Whisper with YouTube transcript fallback
- **Video Processing**: yt-dlp + FFmpeg for downloading and clipping
- **Platform Detection**: Automatic video platform recognition

### API Endpoints

- `POST /api/process` - Main processing endpoint
- `POST /api/download-clip` - Individual clip download
- `GET /api/health` - System health check
- `GET /api/test-tools` - Tool availability check
- `GET /api/cleanup` - Temporary file cleanup

## 🚀 Deployment

### Railway (Recommended)

1. **Create Railway account** at [railway.app](https://railway.app)

2. **Deploy from GitHub**:
   - Connect your GitHub repository
   - Railway auto-detects the configuration

3. **Set environment variables**:
   ```env
   OPENAI_API_KEY=sk-your-openai-key
   ANTHROPIC_API_KEY=sk-ant-api03-your-anthropic-key
   NODE_ENV=production
   CLEANUP_SECRET=your-random-secret
   ```

4. **Generate domain**:
   - Go to Settings → Generate Domain
   - Your app will be live at `yourapp.railway.app`

### Manual Deployment

For other platforms, ensure these system dependencies are installed:
- Node.js 18+
- Python 3.11+
- FFmpeg
- yt-dlp

## 🔧 Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | Yes | OpenAI API key for Whisper transcription |
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key for Claude Opus 4 matching |
| `NODE_ENV` | No | Environment (development/production) |
| `CLEANUP_SECRET` | No | Secret for cleanup endpoint security |
| `FFMPEG_PATH` | No | Custom FFmpeg path (auto-detected) |
| `YTDLP_PATH` | No | Custom yt-dlp path (auto-detected) |

### System Requirements

- **Memory**: 512MB minimum, 1GB recommended
- **Storage**: 2GB for temporary video processing
- **Network**: Stable internet for API calls and video downloads

## 🛠️ Development

### Project Structure

```
TwipClip/
├── app/                    # Next.js app directory
│   ├── api/               # API routes
│   ├── components/        # React components
│   └── page.tsx          # Main page
├── src/lib/              # Core libraries
│   ├── transcription.ts  # Video transcription
│   ├── semantic-matcher.ts # Claude matching
│   ├── video-downloader.ts # Clip extraction
│   └── system-tools.ts   # Tool detection
├── scripts/              # Utility scripts
├── nixpacks.toml        # Railway build config
└── package.json         # Dependencies
```

### Key Technologies

- **Next.js 15**: React framework with App Router
- **TypeScript**: Type-safe development
- **Tailwind CSS**: Utility-first styling
- **Claude Opus 4**: Advanced AI reasoning
- **OpenAI Whisper**: Speech-to-text transcription
- **yt-dlp**: Video downloading
- **FFmpeg**: Video processing

## 🔍 Monitoring

### Health Checks

- **Health endpoint**: `/api/health`
- **Tool status**: `/api/test-tools`
- **Logs**: Check Railway dashboard or console

### Common Issues

1. **"System requirements not met"**
   - Check `/api/health` for missing dependencies
   - Verify API keys are set correctly

2. **"No clips found"**
   - Ensure video has transcripts/captions
   - Check if thread content matches video topics

3. **Download failures**
   - Verify FFmpeg and yt-dlp are installed
   - Check video URL accessibility

## 📊 Performance

- **Processing Speed**: ~30-60 seconds for 3 videos
- **Concurrent Users**: Supports 10+ simultaneous users
- **Video Limits**: Max 5 videos per request
- **File Cleanup**: Automatic cleanup every 30 minutes

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🆘 Support

For issues and questions:
1. Check the health endpoint: `/api/health`
2. Review Railway logs for errors
3. Ensure all API keys are configured
4. Verify video URLs are accessible

## 🔮 Roadmap

- [ ] Support for more video platforms
- [ ] Batch processing for large threads
- [ ] Custom clip duration settings
- [ ] User authentication and rate limiting
- [ ] Advanced filtering and search
- [ ] Export to various formats

---

**Built with ❤️ .**
