# Railway Deployment Quick Start

## 🚀 Quick Setup (5 minutes)

### 1. Set Environment Variables in Railway

```bash
# Required
ANTHROPIC_API_KEY=your_key_here
GOOGLE_CLOUD_API_KEY=your_key_here  # Optional but recommended

# Railway optimizations
NODE_ENV=production
RAILWAY_ENVIRONMENT=production
MAX_CONCURRENT_DOWNLOADS=1
NODE_OPTIONS=--max-old-space-size=512
```

### 2. YouTube Authentication for Railway

Since Railway containers can't access your browser, you have two options:

#### Option A: Public Videos Only (No Setup Required)
- Works immediately
- Limited to public YouTube videos
- May hit rate limits

#### Option B: Cookie Authentication (Recommended)

1. **Export cookies from your browser** (run locally):
```bash
# Install yt-dlp locally if you haven't
pip install yt-dlp

# Export cookies
yt-dlp --cookies-from-browser chrome --cookies cookies.txt --skip-download https://youtube.com
```

2. **Encode cookies** (run locally):
```bash
# On Windows PowerShell:
[Convert]::ToBase64String([System.IO.File]::ReadAllBytes("cookies.txt")) | Out-File cookies_base64.txt

# On Mac/Linux:
base64 -w 0 cookies.txt > cookies_base64.txt
```

3. **Add to Railway environment**:
- Copy contents of `cookies_base64.txt`
- Add as `YOUTUBE_COOKIES_BASE64` in Railway settings

### 3. Deploy

1. Connect GitHub repo to Railway
2. Railway will auto-deploy on push
3. Check deployment logs
4. Visit your app URL

## 🔍 Verify Deployment

1. **Health Check**: 
   ```
   https://your-app.railway.app/api/health
   ```

2. **Test with Public Video**:
   - Use the app normally
   - Try a public YouTube video first

3. **Check Logs**:
   - Look for "Cookie file created for Railway deployment" if using cookies
   - Check for any authentication warnings

## ⚠️ Important Notes

1. **Resource Limits**: Railway has limited resources
   - Downloads may be slower
   - Use 720p quality for better performance
   - Process fewer videos at once

2. **Cookie Expiration**: 
   - YouTube cookies expire after ~30 days
   - You'll need to re-export and update periodically

3. **Timeouts**:
   - Railway has a 5-minute request timeout
   - Very long videos may fail

## 🆘 Troubleshooting

### "No browser found" Error
- This is normal on Railway
- Make sure `YOUTUBE_COOKIES_BASE64` is set

### Downloads Failing
- Check if cookies are expired
- Try with a public video first
- Reduce quality to 720p

### Memory Errors
- Increase `NODE_OPTIONS` to `--max-old-space-size=1024`
- Process fewer videos

## 📚 More Information

See [docs/RAILWAY_DEPLOYMENT.md](docs/RAILWAY_DEPLOYMENT.md) for detailed guide. 