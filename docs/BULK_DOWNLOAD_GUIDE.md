# TwipClip Bulk Download Guide - Optimized for Typefully

This guide explains how to use TwipClip's bulk download feature to download multiple video clips at once, optimized specifically for uploading to Typefully.

## Overview

The bulk download feature allows you to download all matched video clips from your search results in a single ZIP file. Videos are automatically optimized for Typefully's requirements.

## Typefully Video Requirements

TwipClip automatically optimizes videos to meet Typefully's specifications:

- **Maximum file size**: 512 MB per video
- **Maximum duration**: 10 minutes per video
- **Recommended resolution**: 720p (1280×720)
- **Format**: MP4 with H.264 codec
- **Audio**: AAC at 128 kbps

## How to Use Bulk Download

1. **Search for Content**: Use the search feature to find tweets with matching video content
2. **Review Results**: Check the matched clips in your search results
3. **Click Download**: Click the "Download All Clips for Typefully" button
4. **Wait for Processing**: Videos will be downloaded and optimized automatically
5. **Download ZIP**: A ZIP file containing all compatible clips will be downloaded

## What Happens During Download

### Video Optimization

Each video is:
- Downloaded in the highest quality available (up to 720p)
- Extracted to the exact clip duration you need
- Re-encoded with optimal settings for Typefully
- Compressed to balance quality and file size

### Quality Settings

Videos are encoded with:
- **Video Codec**: H.264 (libx264)
- **Quality**: CRF 23 (good quality/size balance)
- **Resolution**: Maximum 1280×720
- **Audio**: AAC 128kbps at 44.1kHz
- **Preset**: Medium (balanced speed/compression)

### Automatic Filtering

The system automatically:
- Excludes videos larger than 512MB
- Excludes videos longer than 10 minutes
- Reports which videos were excluded and why

## Download Status Information

After download, you'll see:
- Total clips processed
- Successfully downloaded clips
- Clips ready for Typefully
- Failed downloads (if any)
- Excluded clips (if any exceed limits)
- Total size of the ZIP file

## Troubleshooting

### "Site was not available" Error

This error was fixed in the latest version. If you still encounter it:
1. Clear your browser cache
2. Ensure you're using the latest version
3. Check your internet connection

### Authentication Issues

If downloads fail due to authentication:
1. Ensure you're logged into YouTube in your browser
2. Use the YouTube authentication feature in TwipClip
3. Try different browsers if one fails

### Large Files or Long Videos

If videos are excluded:
- Videos over 512MB are automatically excluded
- Videos over 10 minutes are automatically excluded
- Consider downloading shorter clips

### Download Failures

Common causes:
- Age-restricted content (requires authentication)
- Private or deleted videos
- Network connectivity issues
- Regional restrictions

## Best Practices

1. **Authenticate First**: Always authenticate with YouTube for best results
2. **Check Clip Duration**: Ensure clips are under 10 minutes before searching
3. **Monitor File Sizes**: The UI shows file sizes for each clip
4. **Batch Processing**: Download in smaller batches if you have many clips
5. **Network Stability**: Use a stable internet connection for large downloads

## Technical Details

### File Naming Convention
- Individual clips: `tweet_{tweetId}_{timestamp}.mp4`
- ZIP file: `twipclip-typefully-{timestamp}.zip`

### Temporary Files
- Downloads are processed in system temp directory
- Files are automatically cleaned up after download
- ZIP files are deleted 1 minute after serving

### Concurrent Downloads
- Maximum 2 videos download simultaneously
- Prevents overwhelming system resources
- Ensures stable performance

## API Endpoints

### Bulk Download
```
POST /api/download-all
Body: {
  matches: Array<PerfectMatch>
}
```

### File Download
```
GET /api/download?file={encodedFilePath}
```

## Error Handling

The system includes:
- Automatic retry (up to 3 attempts)
- Fallback browser authentication
- Detailed error messages
- Progress tracking
- Graceful degradation

## Future Improvements

Planned enhancements:
- Custom quality selection
- Batch size configuration
- Resume interrupted downloads
- Cloud storage integration
- Direct Typefully API upload

## Support

If you encounter issues:
1. Check the console for detailed error messages
2. Verify your YouTube authentication
3. Ensure videos meet Typefully requirements
4. Report issues with specific tweet IDs

---

For more information, see the main [README](../README.md) or [Troubleshooting Guide](./TROUBLESHOOTING.md). 