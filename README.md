# TwipClip 🎬

An intelligent video clip extraction tool that automatically finds and extracts the most relevant video segments for your Twitter/X threads using AI-powered content matching.

## 🚀 Overview

TwipClip analyzes your thread content and searches through multiple YouTube videos to find the perfect clips that match each tweet. It uses advanced AI models (Claude Opus 4 / Sonnet 4) to understand context and deliver highly relevant video segments.

### Key Features

- **AI-Powered Matching**: Uses Claude AI to intelligently match tweet content with video transcripts
- **Bulk Processing**: Process multiple videos and tweets simultaneously
- **Flexible AI Models**: Choose between Claude Opus 4 (highest quality) or Sonnet 4 (balanced performance)
- **Thinking Mode**: Enable deep reasoning for better match quality
- **Token Usage Control**: Optimize for speed (low), balance (medium), or quality (high)
- **Bulk Download**: Download all matched clips as a ZIP file
- **Quality Selection**: Choose between 720p and 1080p video quality
- **Real Examples**: Built-in test cases with real threads and videos

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
```

3. Set up environment variables:
```bash
cp .env.example .env.local
```

4. Configure your `.env.local`:
```env
ANTHROPIC_API_KEY=your_anthropic_api_key
GOOGLE_CLOUD_API_KEY=your_google_cloud_api_key
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
   - **Thinking Mode**: Enable for deeper analysis
   - **Token Usage**: Low (fast), Medium (balanced), or High (best quality)

4. **Process**: Click "Find Matching Clips" to start the AI analysis

5. **Download Results**: Use "Download All Clips" to get a ZIP file with all matched segments

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
