# TwipClip User Guide

## Table of Contents
1. [What is TwipClip?](#what-is-twipclip)
2. [Getting Started](#getting-started)
3. [YouTube Authentication Setup](#youtube-authentication-setup)
4. [Using TwipClip](#using-twipclip)
5. [Common Issues & Solutions](#common-issues--solutions)
6. [Tips for Best Results](#tips-for-best-results)
7. [Troubleshooting](#troubleshooting)

## What is TwipClip?

TwipClip is an AI-powered tool that automatically finds YouTube video clips that match the content of Twitter/X threads. It analyzes your thread, searches for relevant videos, and extracts the exact moments that relate to your content.

## Getting Started

### Prerequisites
- A modern web browser (Chrome, Firefox, or Edge recommended)
- YouTube cookies for authentication (required due to YouTube's bot protection)
- Twitter/X thread URL or content

### First-Time Setup

1. **Access TwipClip**: Open the application in your browser
2. **Check Authentication Status**: Look for the YouTube authentication indicator
3. **Upload Cookies** (if not authenticated): Follow the authentication setup below

## YouTube Authentication Setup

### Why Authentication is Required
YouTube requires authentication to prevent bot abuse. Without proper authentication, you'll encounter "Sign in to confirm you're not a bot" errors.

### Step-by-Step Cookie Setup

#### Method 1: Browser Extension (Recommended)

1. **Install a Cookie Export Extension**:
   - Chrome: [EditThisCookie](https://chrome.google.com/webstore/detail/editthiscookie/fngmhnnpilhplaeedifhccceomclgfbg)
   - Firefox: [Cookie Quick Manager](https://addons.mozilla.org/en-US/firefox/addon/cookie-quick-manager/)

2. **Sign in to YouTube**:
   - Go to [YouTube.com](https://youtube.com)
   - Sign in with your Google account
   - Make sure "Remember me" is checked

3. **Export Cookies**:
   - Click the cookie extension icon
   - Select "Export" or "Export All"
   - Choose "Netscape HTTP Cookie File" format
   - Save the file as `youtube_cookies.txt`

4. **Upload to TwipClip**:
   - Click "Upload YouTube Cookies" button
   - Select your `youtube_cookies.txt` file
   - Wait for confirmation message
   - The page will refresh automatically

#### Method 2: Manual Browser Method

**For Chrome/Edge:**
1. Open YouTube and sign in
2. Press `F12` to open Developer Tools
3. Go to Application → Cookies → https://www.youtube.com
4. Look for these essential cookies:
   - `__Secure-1PAPISID`
   - `__Secure-1PSID`
   - `__Secure-3PAPISID`
   - `__Secure-3PSID`
   - `LOGIN_INFO`
   - `PREF`
   - `SID`
   - `HSID`
   - `SSID`
   - `APISID`
   - `SAPISID`

5. Create a text file with this format:
```
# Netscape HTTP Cookie File
.youtube.com	TRUE	/	TRUE	[expiry]	[name]	[value]
```

**For Firefox:**
1. Similar process but access via Web Developer → Storage Inspector

### Verifying Authentication

After uploading cookies:
- Look for green "YouTube: Authenticated" status
- Try the "Load Example" button to test
- If it fails, re-export and upload fresh cookies

## Using TwipClip

### Basic Usage

1. **Enter Twitter/X Thread**:
   - Paste the full thread URL, OR
   - Copy and paste the thread text directly

2. **Select AI Model** (Optional):
   - GPT-4: Most accurate but slower
   - GPT-3.5: Faster but less accurate
   - Claude: Good balance (if available)

3. **Click "Find Clips"**:
   - Processing typically takes 2-5 minutes
   - Progress bar shows current status

4. **Review Results**:
   - Each matching clip shows:
     - Video title and channel
     - Timestamp and duration
     - Relevance score
     - Preview (if available)

5. **Download Clips**:
   - Click "Download" on individual clips
   - Use "Download All" for bulk download

### Understanding Progress States

- **0-20%**: Analyzing thread content
- **20-40%**: Searching for videos
- **40-60%**: Downloading video data
- **60-80%**: Transcribing content
- **80-95%**: Matching clips
- **95-100%**: Finalizing results

## Common Issues & Solutions

### 1. "Sign in to confirm you're not a bot"

**Problem**: YouTube blocking downloads
**Solution**: 
- Re-export fresh cookies from browser
- Ensure you're logged into YouTube
- Upload new cookie file
- Clear browser cache and try again

### 2. Stuck at Loading/High Progress

**Problem**: Frontend shows loading despite completion
**Solution**:
- Wait 30 seconds for auto-recovery
- Refresh the page
- Check if results are actually ready

### 3. "No YouTube videos found"

**Problem**: Search returned no results
**Solution**:
- Try more specific keywords
- Check if thread contains video-related content
- Use "Load Example" to test functionality

### 4. Cookie Upload Not Working

**Problem**: Uploaded but still shows unauthenticated
**Solution**:
- Ensure cookie file format is correct
- Check file isn't empty or corrupted
- Try different browser for export
- Use incognito mode for clean export

### 5. Download Failures

**Problem**: Individual clips fail to download
**Solution**:
- Check your internet connection
- Verify YouTube authentication
- Try downloading one at a time
- Check if video is age-restricted

## Tips for Best Results

### Thread Optimization
- **Be Specific**: Include key terms and concepts
- **Add Context**: Mention video types (tutorial, lecture, etc.)
- **Use Quotes**: For exact phrases you want to match

### Search Strategies
- **Educational Content**: Works best with tutorials, lectures, how-tos
- **Popular Topics**: Better results for mainstream subjects
- **Recent Content**: Newer videos often have better transcripts

### Performance Tips
- **Avoid Peak Hours**: YouTube rate limits are stricter during peak times
- **Smaller Threads**: Break long threads into focused segments
- **Patience**: Let the process complete without refreshing

## Troubleshooting

### Debug Information

If you encounter persistent issues:

1. **Check Browser Console**:
   - Press `F12`
   - Look for red error messages
   - Screenshot for support

2. **Verify Cookie Status**:
   - Check authentication indicator
   - Try re-uploading cookies
   - Test with example content

3. **System Requirements**:
   - Stable internet connection
   - Modern browser (updated)
   - Cookies enabled
   - JavaScript enabled

### Getting Help

If problems persist:
1. Document the error message
2. Note what step failed
3. Include thread URL/content
4. Contact support with details

### Quick Fixes Checklist

- [ ] Cookies uploaded recently (within 24h)
- [ ] Signed into YouTube in browser
- [ ] Using supported browser
- [ ] Cleared cache/cookies
- [ ] Tried incognito mode
- [ ] Tested with example content
- [ ] Checked internet connection
- [ ] Disabled ad blockers

## Privacy & Security Notes

- **Cookie Security**: Your cookies are stored securely and isolated by session
- **No Password Storage**: We never ask for or store passwords
- **Session Isolation**: Each user's data is kept separate
- **Auto-Cleanup**: Temporary files are deleted after processing

## Limitations

- **Rate Limits**: Maximum 30 YouTube requests per minute
- **Video Length**: Very long videos (>2 hours) may timeout
- **Age-Restricted**: Some content requires additional verification
- **Regional Blocks**: Geo-restricted content may not be accessible
- **Live Streams**: Cannot process ongoing live streams

---

*Last Updated: [Current Date]*
*Version: 1.0* 