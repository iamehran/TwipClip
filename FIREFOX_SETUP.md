# Firefox Authentication Setup for TwipClip on Railway

This guide explains how to set up Firefox browser authentication to bypass YouTube's bot detection.

## Why This is Needed

YouTube sometimes blocks yt-dlp with the error: "Sign in to confirm you're not a bot". This happens because YouTube detects automated tools. By using browser cookies from a logged-in session, we can bypass this restriction.

## Setup Options

### Option 1: Automatic (Default - No Setup Required)

By default, the app will try to use Firefox cookies if available, but will fall back to using just the user-agent if Firefox is not set up. This means:
- The app will work without any setup
- You might occasionally hit bot detection
- Performance will be slightly degraded

### Option 2: Disable Firefox Cookies (Simplest)

If you don't want to use Firefox cookies at all, add this environment variable in Railway:

```
USE_FIREFOX_COOKIES=false
```

This will only use the user-agent approach, which works most of the time.

### Option 3: Full Firefox Setup (Most Reliable)

For the most reliable YouTube access, you'll need to set up Firefox authentication locally and then transfer the profile to Railway.

## Testing

After deployment, the app will automatically:
1. Try to use Firefox cookies if available
2. Fall back to user-agent only if Firefox is not set up
3. Show clear error messages if authentication is needed

The app should now handle most YouTube videos without bot detection!
