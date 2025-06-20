# Changelog

All notable changes to TwipClip will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- AI Model Selection feature allowing users to choose between Claude Opus 4 and Claude Sonnet 4
- Thinking mode toggle for deeper AI analysis
- Token usage levels (Low/Medium/High) for controlling processing depth and speed
- Cost indicator showing relative pricing between models (Opus is 5x more expensive)
- Load Example feature with 5 curated real-world thread examples
- Bulk download quality improvements with better video encoding settings
- Comprehensive documentation suite including:
  - API Documentation
  - Development Guide
  - Deployment Guide
  - Troubleshooting Guide
  - Contributing Guidelines

### Changed
- Updated SearchForm layout to horizontal design with Thread Content and Video URLs side by side
- Increased main page width from max-w-6xl to max-w-7xl for better content display
- Improved video quality settings:
  - Changed CRF from 23 to 18 for better visual quality
  - Increased audio bitrate from 128k to 192k
- Enhanced input field heights from h-48 to h-64 for better usability
- Made ModelSelector component more compact with reduced padding and smaller text

### Fixed
- Bulk download quality issues with improved yt-dlp format selection
- Non-working YouTube URLs in example data replaced with verified working videos

### Technical Details
- Updated `perfect-matching-optimized.ts` to support dynamic model selection
- Token limits based on usage level:
  - Low: 1000 tokens (30 candidates)
  - Medium: 2000 tokens (50 candidates)
  - High: 4000 tokens (80 candidates)
- Opus model receives 1.5x more tokens than base limits
- Added thinking mode system prompts for enhanced reasoning

## [1.0.0] - 2024-01-01

### Initial Release
- Core video clip extraction functionality
- AI-powered content matching using Claude AI
- Support for YouTube video processing
- Transcript generation and caching
- Individual and bulk clip downloads
- Real-time preview with timestamp navigation
- Health monitoring and error handling
- Production-ready deployment configurations

### Features
- Thread processing with tweet separation using `---`
- Multiple video URL support
- Quality selection (720p/1080p)
- Automatic transcript fetching with fallback options
- Parallel video processing for improved performance
- Temporary file cleanup
- Responsive web interface with Tailwind CSS

### Technologies
- Next.js 14 with App Router
- TypeScript for type safety
- Anthropic Claude API for AI matching
- Google Cloud Video Intelligence for transcription
- yt-dlp for video downloading
- FFmpeg for video processing

---

## Version History

### Versioning Scheme
- **Major (X.0.0)**: Breaking changes or significant feature additions
- **Minor (0.X.0)**: New features, backwards compatible
- **Patch (0.0.X)**: Bug fixes and minor improvements

### Upgrade Notes
When upgrading between versions:
1. Check for breaking changes in the changelog
2. Update environment variables if needed
3. Run `npm install` to update dependencies
4. Clear cache and temporary files
5. Test in development before deploying to production 