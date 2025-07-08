# YouTube Authentication Troubleshooting Guide

This guide helps you resolve YouTube authentication issues and the "Sign in to confirm you're not a bot" error.

## Table of Contents
- [Cookie Upload Method (Recommended)](#cookie-upload-method-recommended)
- [Browser Method (Alternative)](#browser-method-alternative)
- [Common Issues](#common-issues)
- [Testing Authentication](#testing-authentication)

## Cookie Upload Method (Recommended)

The cookie upload method is the most reliable way to authenticate with YouTube and avoid bot detection.

### Step 1: Install Browser Extension

Install one of these cookie export extensions:
- **Chrome/Edge**: [Get cookies.txt LOCALLY](https://chrome.google.com/webstore/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc)
- **Firefox**: [cookies.txt](https://addons.mozilla.org/en-US/firefox/addon/cookies-txt/)

### Step 2: Export YouTube Cookies

1. **Log into YouTube** in your browser
2. Navigate to [youtube.com](https://youtube.com)
3. Click the cookie extension icon
4. Select **"Current Site"** or **"youtube.com"**
5. Click **"Export"** or **"Download"**
6. Save the file as `youtube_cookies.txt`

### Step 3: Upload Cookies to TwipClip

1. Open TwipClip in your browser
2. Look for the **"Upload YouTube Cookies"** button (usually in the header)
3. Click the button and select your `youtube_cookies.txt` file
4. You should see a success message

### Step 4: Verify Upload

The cookies are stored in:
- Session-specific: `temp/user-cookies/{your-session-id}/youtube_cookies.txt`
- This ensures each user has their own authentication

## Why Cookie Upload Works Better

When you upload cookies, TwipClip:
1. **Uses your actual YouTube session** - You're already authenticated
2. **Includes anti-bot headers** - Mimics real browser behavior
3. **Persists authentication** - Works until cookies expire

## Testing Your Authentication

Run this command to test if your cookies are working:

```bash
# Test with your session ID (shown in the UI after upload)
node scripts/test-youtube-auth.js YOUR_SESSION_ID

# Or test global cookies
node scripts/test-youtube-auth.js
```

## Important Cookie Tips

### 1. Cookie Quality Matters
Make sure you're properly logged into YouTube before exporting:
- ✅ Can watch age-restricted videos
- ✅ Can see your subscriptions
- ✅ Not in incognito/private mode

### 2. Cookie Expiration
YouTube cookies typically expire after:
- 2 years for persistent login
- 6 months for session cookies
- Re-upload if you see authentication errors

### 3. Essential Cookies
Your cookie file should contain these:
- `LOGIN_INFO` - Main authentication token
- `SID` - Session identifier
- `HSID` - Secure session ID
- `SAPISID` - API access token

## Browser Method (Alternative)

### Solution 1: Use Browser Authentication (Recommended)

1. Open the TwipClip app
2. Click on "YouTube Authentication" in the top right
3. Select the browser where you're logged into YouTube
4. Click "Test" to verify it works
5. Try downloading again

### Solution 2: Fresh Login

1. Open your browser
2. Go to youtube.com
3. Log out completely
4. Clear cookies for youtube.com
5. Log back in
6. Try downloading again

### Solution 3: Use a Different Browser

Some browsers work better than others:
- **Firefox** - Most reliable, works while running
- **Edge** - Good alternative on Windows
- **Brave** - Works well if you're logged in
- **Chrome** - Must be closed on Windows

### Solution 4: Upload Cookie File (Advanced)

If browser authentication fails:
1. Use a browser extension to export YouTube cookies
2. Save as `youtube_cookies.txt` in Netscape format
3. Upload via "Upload Cookies" button in the app

## Common Issues

### "Sign in to confirm you're not a bot"

**With Cookie Upload:**
1. Your cookies may be expired or invalid
2. You weren't fully logged in when exporting
3. Solution: Log out and back into YouTube, then re-export cookies

**Prevention:**
- Always use the cookie upload method
- Export cookies from a fresh YouTube session
- Make sure you can watch age-restricted content before exporting

### "No cookies found"

1. Check the file exists at the correct path
2. Ensure the file isn't empty
3. Verify it contains YouTube domain cookies

### "Authentication still fails"

1. Clear YouTube cookies in your browser
2. Log into YouTube fresh
3. Watch a video to ensure session is active
4. Export cookies again
5. Upload to TwipClip

## How TwipClip Prevents Bot Detection

TwipClip uses multiple strategies:

1. **Real Browser Headers**
   ```
   User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64)...
   Accept-Language: en-US,en;q=0.9
   Accept: text/html,application/xhtml+xml...
   ```

2. **Your Actual Cookies**
   - Uses your authenticated session
   - Includes all tracking cookies YouTube expects

3. **No Certificate Checking**
   - Prevents SSL errors that trigger bot detection

## Quick Checklist

Before downloading videos:
- [ ] Logged into YouTube in browser
- [ ] Can watch age-restricted videos
- [ ] Exported cookies using extension
- [ ] Uploaded cookies to TwipClip
- [ ] See "Cookies uploaded successfully" message
- [ ] Test with `node scripts/test-youtube-auth.js`

## Need More Help?

If you're still experiencing issues:
1. Check the [Installation Guide](./INSTALLATION.md)
2. Review the [Troubleshooting Guide](./TROUBLESHOOTING.md)
3. Ensure yt-dlp is up to date: `pip install -U yt-dlp`
4. Try a different browser for cookie export

## Platform-Specific Issues

### Windows + Chrome
- Chrome MUST be completely closed
- Check Task Manager - no chrome.exe processes
- Use Firefox or Edge as alternatives

### macOS
- All browsers typically work fine
- Safari is not supported (use Chrome/Firefox)

### Linux
- Firefox usually works best
- Make sure browser is in default location

## Why This Happens

YouTube uses bot detection to prevent abuse. The app needs to prove it's acting on your behalf by:
- Using your browser cookies
- Sending proper headers
- Appearing like a real browser

## Best Practices

1. **Stay Logged In** - Keep YouTube logged in your browser
2. **Use Firefox** - Most reliable across all platforms
3. **Regular Use** - Using YouTube normally helps avoid detection
4. **One Browser** - Stick to one browser for consistency

## Still Having Issues?

If none of the above works:

1. **Check Video Restrictions**
   - Is the video private?
   - Is it age-restricted?
   - Is it region-blocked?

2. **Network Issues**
   - Try a different network
   - Disable VPN if using one
   - Check firewall settings

3. **Report the Issue**
   - Note which browser you're using
   - Include the exact error message
   - Mention which videos fail

## Command Line Testing

Test with yt-dlp directly:

```bash
# Test browser authentication
yt-dlp --cookies-from-browser firefox "https://www.youtube.com/watch?v=dQw4w9WgXcQ" --dump-json

# Test with headers (what the app uses)
yt-dlp --cookies-from-browser firefox \
  --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" \
  --add-header "Accept-Language: en-US,en;q=0.9" \
  "https://www.youtube.com/watch?v=dQw4w9WgXcQ" --dump-json
```

If the command line works but the app doesn't, there may be a configuration issue.

---

Remember: The app never stores your YouTube password. It only uses browser cookies, just like any website that offers "Login with Google". 