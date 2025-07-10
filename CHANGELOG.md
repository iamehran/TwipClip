# Changelog

All notable changes to TwipClip will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.1] - 2024-01-XX

### Added
- **Multi-User Concurrency Support**:
  - Global request queue to prevent overwhelming YouTube
  - Rate limiting (30 requests/minute by default) 
  - Queue monitoring endpoint at `/api/queue-status`
  - Monitoring script at `scripts/monitor-queue.js`
  - `MAX_GLOBAL_DOWNLOADS` and `YOUTUBE_RATE_LIMIT` environment variables
  - Protection against directory naming collisions
  - Limited global concurrent downloads to 6 (configurable)

### Fixed
- **Resource Exhaustion**: Prevented multiple users from overwhelming server
- **YouTube Rate Limiting**: Added protection against IP-based blocking
- **File Collisions**: Fixed potential conflicts when users download simultaneously

## [0.3.0] - 2024-01-XX

### Added
- **Social Media-Optimized Bulk Downloads**: Enhanced bulk download feature optimized for social media platforms
  - Automatic video optimization to 720p quality
  - File size limiting to 512MB
  - Duration limiting to 10 minutes per video
  - H.264 codec for maximum compatibility
  - Detailed status reporting for excluded videos
  - Improved UI with optimization information
- **File Serving Capability**: Added support for serving zip files in download route
- **Comprehensive Documentation**: New bulk download guide and YouTube authentication troubleshooting
- **Anti-Bot Detection Measures**: Enhanced download commands with proper headers to prevent YouTube bot detection
  - User-Agent headers for all downloads
  - Accept-Language and Accept headers
  - SSL certificate handling
- **Authentication Testing Script**: New script to test and verify YouTube authentication setup
  - `scripts/test-youtube-auth.js` for verifying cookie authentication
  - Tests uploaded cookies validity
  - Checks for essential YouTube cookies (LOGIN_INFO, SID, HSID)
  - Verifies anti-bot headers are working properly
- **Unique Filename Generation**: Fixed issue where videos with undefined tweetIds would overwrite each other

### Fixed
- **Bulk Download "Site Not Available" Error**: Fixed critical issue preventing zip file downloads
- **Download Route Enhancement**: Added proper file serving with security checks
- **Error Handling**: Improved error messages and user feedback
- **YouTube Bot Detection**: Fixed "Sign in to confirm you're not a bot" errors
  - Added proper headers to mimic real browser behavior
  - Fixed authConfig propagation from frontend to backend
  - Improved retry logic with browser fallback
- **Duplicate Video Issue**: Fixed bug where only one video appeared in ZIP when multiple were downloaded
- **Authentication: All download functions now use uploaded cookies and anti-bot headers**
  - Individual download route (`/api/download`) now uses session cookies
  - Added anti-bot headers (User-Agent, Accept-Language, Accept) to all yt-dlp calls
  - VideoDownloader class updated with consistent authentication
  - This prevents "Sign in to confirm you're not a bot" errors when cookies are uploaded
- **Proper Tweet Naming in ZIP Files**: Videos in bulk download ZIP now use actual tweet numbers
  - Files are named "Tweet 1.mp4", "Tweet 2.mp4", "Tweet 6.mp4" etc.
  - Reflects actual tweet numbers from the thread, not sequential numbering
  - Makes it easy to identify which video corresponds to which tweet
- **Session Management Improvements**: Fixed authentication timeout issues
  - Added session keep-alive mechanism (refreshes every 2 minutes)
  - Cookie-based auth now prioritized over browser auth when available
  - Added session refresh endpoint to extend session lifetime
  - Bulk download verifies auth status before starting
  - Prevents "Please login to YouTube" errors after delays
- **Docker/Railway Cookie Path Fix**: Fixed cookie authentication on production deployments
  - Consistent Docker path handling (/app vs process.cwd())
  - Search route now uses authenticated metadata extraction
  - All cookie operations use environment-aware paths
  - Added debugging logs for cookie path resolution
  - Enhanced anti-bot headers for metadata extraction

### Changed
- **Video Encoding Settings**: Optimized FFmpeg settings for better quality/size balance (CRF 23)
- **BulkDownloadButton UI**: Made more generic while maintaining optimization features
- **Download Route**: Now handles both file downloads and video downloads seamlessly
- **Authentication Flow**: Properly passes authConfig from YouTubeAuth component to bulk download

## [0.2.0] - 2024-01-XX

### Added
- **Browser-Based YouTube Authentication**: Revolutionary new authentication system using yt-dlp's `--cookies-from-browser` feature
  - Automatic cookie extraction from Chrome, Firefox, Edge, Brave, and more
  - No manual cookie copying required
  - Intelligent browser detection and selection
  - Fallback browser support when primary fails
  - Platform-specific optimizations (e.g., Chrome on Windows warnings)
- **Enhanced Authentication UI**: New YouTubeAuthV2 component with:
  - Browser selection interface
  - Real-time authentication testing
  - Helpful warnings and tips
  - Profile selection support
- **Robust Error Handling**: Smart error recovery with:
  - Automatic browser fallback
  - Detailed error solutions
  - Retry mechanisms with exponential backoff
- **Browser Detection System**: Comprehensive browser detection across all platforms
  - Detects installed browsers
  - Checks if browsers are running
  - Finds browser profiles
  - Platform-specific path resolution

### Changed
- Replaced manual cookie extraction with automatic browser-based system
- Updated all download functions to use new authentication
- Improved bulk download reliability with retry logic
- Enhanced error messages with actionable solutions
- Updated documentation to reflect new authentication flow

### Fixed
- Windows Chrome cookie database lock issues
- Authentication failures with age-restricted content
- Bulk download authentication propagation
- Cross-platform compatibility issues

### Removed
- Old manual cookie extraction system
- YOUTUBE_COOKIES environment variable
- Complex cookie file management
- User-specific cookie storage endpoints

### Security
- Cookies never leave the user's machine
- No cookie data stored in application
- Direct browser-to-yt-dlp cookie passing
- Improved user privacy

## [0.1.2] - 2024-01-09

### Added
- Bulk download functionality with quality selection (720p/1080p)
- Real-world example threads for quick testing
- Enhanced video quality settings (CRF 18 for better quality)
- Audio bitrate increased to 192k for better sound

### Changed
- Improved fair distribution algorithm for multi-video results
- Better handling of form submission with proper event handling
- Enhanced UI responsiveness with loading states

### Fixed
- Multi-video processing bias where first video dominated results
- Form submission triggering on button clicks
- Bulk download quality issues with better encoding settings

## [0.1.1] - 2024-01-08

### Added
- AI model selection between Claude Opus 4 and Claude Sonnet 4
- Thinking mode toggle for step-by-step reasoning
- Token usage control (Low/Medium/High)
- Cost indicators for different models
- Professional documentation suite

### Changed
- UI layout optimized for wider screens (max-w-7xl)
- Improved input field heights for better visibility
- Enhanced model selector component styling

### Fixed
- TypeScript compilation errors
- Component prop type mismatches
- Build configuration issues

## [0.1.0] - 2024-01-07

### Added
- Initial release of TwipClip
- Perfect video clip matching using AI
- Multi-video processing support
- Transcript extraction and analysis
- Individual and bulk clip downloads
- Export functionality for results
- Real-time processing progress
- Responsive UI design

### Technical
- Built with Next.js 14 and TypeScript
- Integrated Anthropic Claude API
- yt-dlp and FFmpeg integration
- Tailwind CSS for styling

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