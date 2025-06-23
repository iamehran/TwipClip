# Railway Deployment Guide for TwipClip

This guide provides comprehensive instructions for deploying TwipClip on Railway with full YouTube authentication support.

## Prerequisites

1. A Railway account (sign up at [railway.app](https://railway.app))
2. GitHub account with the TwipClip repository
3. OpenAI API key for AI-powered matching

## Deployment Steps

### 1. Fork or Clone the Repository

First, ensure you have the TwipClip code in your GitHub account:
- Fork the repository or
- Push the code to a new repository in your GitHub account

### 2. Create a New Railway Project

1. Log in to [Railway](https://railway.app)
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Connect your GitHub account if not already connected
5. Select the TwipClip repository

### 3. Configure Environment Variables

In your Railway project dashboard, go to the "Variables" tab and add the following:

```env
# Required
OPENAI_API_KEY=your_openai_api_key_here
NODE_ENV=production
NEXT_TELEMETRY_DISABLED=1

# Optional but recommended
RAILWAY_ENVIRONMENT=production
```

### 4. Deploy Settings

Railway will automatically detect the Dockerfile and use it for deployment. The project includes a Railway-specific Dockerfile (`Dockerfile.railway`) that:

- Installs all necessary system dependencies (FFmpeg, yt-dlp, Chromium)
- Sets up the Node.js environment
- Builds the Next.js application
- Configures health checks

### 5. Domain Configuration

1. In your Railway project, go to "Settings"
2. Under "Domains", click "Generate Domain" to get a Railway subdomain
3. Or add a custom domain if you have one

### 6. YouTube Authentication Setup

The TwipClip app includes a user-based YouTube authentication system:

1. **Users download the helper app** from the web interface
2. **Run the helper locally** to extract their YouTube cookies
3. **Paste the generated token** back into TwipClip
4. **Cookies are stored per-user session** for 30 days

This approach ensures:
- No shared YouTube accounts
- Users authenticate with their own accounts
- Complies with YouTube's terms of service
- Works reliably on Railway's infrastructure

### 7. Storage Considerations

Railway provides ephemeral storage, which means:
- Files are stored in `/tmp` during runtime
- Storage is cleared on redeploy
- User sessions and cookies persist via HTTP cookies
- Downloaded videos are temporary and cleaned up automatically

### 8. Monitoring and Logs

1. View logs in the Railway dashboard under "Deployments"
2. Health check endpoint: `https://your-domain.railway.app/api/health`
3. Monitor resource usage in the "Metrics" tab

## Troubleshooting

### Build Failures

If the build fails, check:
1. All environment variables are set correctly
2. The `railway.json` file points to the correct Dockerfile
3. Review build logs for specific errors

### Runtime Issues

1. **YouTube downloads failing**: Ensure users have authenticated with the helper
2. **Memory issues**: Railway's free tier has limits; consider upgrading for heavy usage
3. **Timeout errors**: The app is configured with extended timeouts for long videos

### Cookie Authentication Issues

If users report authentication problems:
1. Have them re-run the helper app
2. Ensure they're logged into YouTube in their browser
3. Check that cookies haven't expired (30-day limit)

## Production Best Practices

1. **Regular Updates**: Keep yt-dlp updated by rebuilding periodically
2. **Monitor Usage**: Track API calls to OpenAI to manage costs
3. **Set Limits**: Configure reasonable limits for video duration and quality
4. **Clean Up**: The app automatically cleans temporary files, but monitor disk usage

## Environment-Specific Code

The app automatically detects Railway deployment and adjusts:
- Uses `/tmp` for temporary storage instead of local directories
- Configures production-ready settings
- Enables security headers and CORS policies
- Optimizes for containerized environment

## Support

For Railway-specific issues:
- Check [Railway documentation](https://docs.railway.app)
- Join [Railway Discord](https://discord.gg/railway)

For TwipClip issues:
- Check the troubleshooting guide
- Review logs in Railway dashboard
- Ensure all dependencies are properly configured 