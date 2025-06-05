#!/bin/bash

echo "🚀 Starting TwipClip on Railway..."
echo "================================"

# Check FFmpeg
echo -n "Checking FFmpeg... "
if command -v ffmpeg &> /dev/null; then
    echo "✅ Found"
    ffmpeg -version | head -n 1
else
    echo "❌ Not found"
    echo "Attempting to install ffmpeg..."
    apt-get update && apt-get install -y ffmpeg
fi

# Check yt-dlp
echo -n "Checking yt-dlp... "
if command -v yt-dlp &> /dev/null; then
    echo "✅ Found"
    yt-dlp --version
else
    echo "❌ Not found"
    echo "Attempting to install yt-dlp..."
    python3 -m pip install yt-dlp
fi

# Check Python
echo -n "Checking Python... "
python3 --version

# Set environment variables for tools
export FFMPEG_PATH=$(which ffmpeg)
export YTDLP_PATH=$(which yt-dlp)

echo "================================"
echo "Tool paths:"
echo "FFmpeg: $FFMPEG_PATH"
echo "yt-dlp: $YTDLP_PATH"
echo "================================"

# Start the application
echo "Starting Next.js application..."
npm start 