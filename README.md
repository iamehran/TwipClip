# TwipClip 🎬

An intelligent video clip extraction tool that automatically finds and extracts the most relevant video segments for your Twitter/X threads using AI-powered content matching.

## 📚 Documentation

- **[Quick Start Guide](QUICK_START.md)** - Get up and running in 5 minutes
- **[User Guide](USER_GUIDE.md)** - Comprehensive guide with troubleshooting
- [Installation Guide](docs/INSTALLATION.md) - Detailed setup instructions
- [API Documentation](docs/API.md) - For developers

## 🚀 Overview

TwipClip analyzes your thread content and searches through multiple YouTube videos to find the perfect clips that match each tweet. It uses advanced AI models (Claude Opus 4 / Sonnet 4) to understand context and deliver highly relevant video segments.

### Key Features

- **AI-Powered Matching**: Uses Claude AI to intelligently match tweet content with video transcripts
- **Browser-Based YouTube Authentication**: Automatic cookie extraction from your browser - no manual setup required
- **Precise Clip Extraction**: Downloads only the relevant portions of videos
- **Bulk Download with Smart Optimization**: 
  - Download all matched clips as a ZIP file
  - Automatic optimization to 720p quality
  - File size limited to 512MB per video (perfect for social media)
  - Duration limited to 10 minutes per video
  - H.264 codec for maximum compatibility
- **Model Selection**: Choose between Claude Opus 4 (highest quality) or Sonnet 4 (faster)
- **Thinking Mode**: Enable step-by-step reasoning for better accuracy
- **Token Usage Control**: Adjust processing depth (Low/Medium/High)
- **Multi-Video Support**: Process multiple YouTube videos simultaneously
- **Export Functionality**: Export results as JSON for further processing

## 🛠️ Prerequisites

- Node.js 18+ and npm
- FFmpeg installed and in PATH
- yt-dlp installed and in PATH
- Anthropic API key
- Google Cloud API key (for video transcription)

## 📦 Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/twipclip.git
cd twipclip
```

2. Install dependencies:
```bash
npm install
pip install yt-dlp
```

3. Install FFmpeg:
- **Windows**: Download from [ffmpeg.org](https://ffmpeg.org/download.html)
- **macOS**: `brew install ffmpeg`
- **Linux**: `sudo apt-get install ffmpeg`

4. Set up environment variables:
```bash
cp .env.example .env.local
```

5. Configure your `.env.local`:
```env
ANTHROPIC_API_KEY=your_anthropic_api_key
GOOGLE_CLOUD_API_KEY=your_google_cloud_api_key  # Optional, for transcript enhancement
```

## 🚀 Quick Start

### Development
```bash
npm run dev
```

### Production Build
```bash
npm run build
npm start
```

### Docker (Optional)
```bash
docker build -t twipclip .
docker run -p 3000:3000 --env-file .env.local twipclip
```

## 💡 Usage

1. **Enter Your Thread**: Paste your thread content, separating each tweet with `---`

2. **Add Video URLs**: Enter YouTube video URLs (one per line) that relate to your thread

3. **Configure AI Settings**:
   - **Model**: Choose Claude Opus 4 (best quality) or Sonnet 4 (faster)
   - **Thinking Mode**: Enable for step-by-step reasoning
   - **Token Usage**: Adjust processing depth

4. **Search**: Click search to find matching clips

5. **Download**: Download individual clips or all clips as a ZIP file (optimized for social media platforms)

## 🏗️ Architecture

```
TwipClip/
├── app/                    # Next.js app directory
│   ├── api/               # API routes
│   ├── components/        # React components
│   ├── utils/             # Utility functions
│   └── data/              # Example data
├── src/lib/               # Core library functions
├── docs/                  # Documentation
└── scripts/               # Setup and utility scripts
```

## 🔧 Configuration

### AI Model Settings

| Model | Cost | Quality | Speed |
|-------|------|---------|-------|
| Claude Opus 4 | 5x | Highest | Slower |
| Claude Sonnet 4 | 1x | High | Fast |

### Token Usage Levels

| Level | Tokens | Candidates | Use Case |
|-------|--------|------------|----------|
| Low | 1000 | 30 | Quick results |
| Medium | 2000 | 50 | Balanced |
| High | 4000 | 80 | Best quality |

## 📚 API Documentation

See [API Documentation](./docs/API.md) for detailed endpoint information.

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with [Next.js](https://nextjs.org/)
- AI powered by [Anthropic Claude](https://www.anthropic.com/)
- Video processing with [yt-dlp](https://github.com/yt-dlp/yt-dlp) and [FFmpeg](https://ffmpeg.org/)

---

Built with ❤️ by Thoughtleadr

## YouTube Authentication

TwipClip uses yt-dlp's native browser cookie extraction for seamless YouTube authentication:

1. **No Manual Setup**: Automatically uses cookies from your browser
2. **Multiple Browser Support**: Works with Chrome, Firefox, Edge, Brave, and more
3. **Secure**: Cookies never leave your machine
4. **Automatic**: Just select your browser and you're ready to go

### How to Authenticate:

1. Click on "YouTube Authentication" in the app
2. Select your browser from the list
3. Make sure you're logged into YouTube in that browser
4. Click "Test" to verify it works
5. Start downloading!

**Note for Windows Chrome/Edge users**: These browsers must be completely closed before authentication. [See browser compatibility guide](docs/BROWSER_COOKIE_ISSUES.md).

## Troubleshooting

See [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) for common issues and solutions.

### YouTube Authentication Issues

If you're getting "Sign in to confirm you're not a bot" errors, see [YouTube Authentication Troubleshooting](docs/YOUTUBE_AUTH_TROUBLESHOOTING.md).

### Quick Fixes:

- **"Sign in to confirm you're not a bot"**: Set up browser authentication
- **Chrome on Windows issues**: Close Chrome before downloading
- **No browsers detected**: Ensure browser is installed in default location
- **Downloads failing**: Check if you're logged into YouTube

## Development

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for development setup and guidelines.

## Deployment

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for deployment instructions.

## Support

- GitHub Issues: [Report bugs or request features](https://github.com/yourusername/twipclip/issues)
- Documentation: Check the [docs](./docs) folder
- Troubleshooting: See [TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)


Test addition for a commit!