# YouTube API Key Setup Guide

This guide will walk you through the process of obtaining a YouTube API key, which is required for TwipClip to search for videos and retrieve transcripts.

## Step 1: Create a Google Cloud Project

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Sign in with your Google account
3. Click the project dropdown at the top of the page
4. Click "New Project"
5. Enter a name for your project (e.g., "TwipClip")
6. Click "Create"
7. Wait for the project to be created, then select it from the project dropdown

## Step 2: Enable the YouTube Data API

1. In the Google Cloud Console, navigate to "APIs & Services" > "Library" in the left sidebar
2. Search for "YouTube Data API v3"
3. Click on the YouTube Data API v3 card
4. Click "Enable"
5. Wait for the API to be enabled

## Step 3: Create API Key Credentials

1. After enabling the API, you'll be redirected to the API overview page
2. Click "Create Credentials" at the top of the page
3. In the "Which API are you using?" dropdown, select "YouTube Data API v3"
4. For "Where will you be calling the API from?", select "Web server (e.g., node.js, Tomcat)"
5. For "What data will you be accessing?", select "Public data"
6. Click "What credentials do I need?"
7. Enter a name for your API key (e.g., "TwipClip API Key")
8. (Optional but recommended) Click "Restrict key" and add restrictions:
   - For HTTP referrers, add your domain or localhost (e.g., `localhost:*`, `*.yourdomain.com`)
   - For API restrictions, select "YouTube Data API v3"
9. Click "Create"
10. Your API key will be displayed. Copy this key for use in TwipClip

## Step 4: Configure TwipClip with Your API Key

1. In your TwipClip project, create or edit the `.env.local` file
2. Add your API key:
   ```
   YOUTUBE_API_KEY=your_api_key_here
   ```
3. Replace `your_api_key_here` with the actual API key you copied

Alternatively, run the setup script:
```bash
npm run setup
```

## Quota Considerations

The YouTube Data API has quotas that limit the number of requests you can make:

- Each project starts with 10,000 units per day
- Each search request costs 100 units
- Each video details request costs 1 unit
- Each transcript request is free (handled by our custom implementation)

For a typical TwipClip usage pattern, this should allow for approximately 100 searches per day, which is sufficient for personal use.

## Monitoring API Usage

You can monitor your API usage in the Google Cloud Console:

1. Go to "APIs & Services" > "Dashboard"
2. Select your project
3. You'll see usage metrics for the YouTube Data API

## Increasing Your Quota (If Needed)

If you need a higher quota:

1. Go to "APIs & Services" > "Quotas" in the Google Cloud Console
2. Find the YouTube Data API v3 quotas
3. Select the quota you want to increase
4. Click "Edit Quotas"
5. Fill out the request form with your justification
6. Submit the request

Google will review your request and may ask for additional information.

## Troubleshooting

### API Key Not Working

- Verify that you've enabled the YouTube Data API v3
- Check that you've correctly copied the API key to your `.env.local` file
- Ensure you haven't applied overly restrictive API key restrictions

### Quota Exceeded Errors

- Monitor your usage in the Google Cloud Console
- Implement caching mechanisms in your application
- Consider creating multiple projects with separate API keys for development and production

### Invalid Credentials

- Generate a new API key from the Google Cloud Console
- Update your `.env.local` file with the new key

## Best Practices

- Keep your API key secure and never commit it to public repositories
- Apply appropriate restrictions to your API key
- Implement caching to reduce the number of API calls
- Consider enabling billing for higher quotas if needed for production use 