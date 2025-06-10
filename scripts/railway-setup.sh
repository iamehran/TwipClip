#!/bin/bash

echo "🚀 Railway Setup Script"
echo "======================"

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# 1. Check Python installation
echo "Checking Python..."
if command_exists python3; then
    echo "✅ Python3 found: $(python3 --version)"
else
    echo "❌ Python3 not found"
fi

# 2. Install yt-dlp using multiple methods
echo -e "\nInstalling yt-dlp..."

# Method 1: pip install with user flag
if command_exists pip3; then
    echo "Trying pip3 install --user..."
    pip3 install --user yt-dlp
fi

# Method 2: pip install without user flag
if ! command_exists yt-dlp; then
    echo "Trying pip3 install..."
    pip3 install yt-dlp || true
fi

# Method 3: Download directly from GitHub
if ! command_exists yt-dlp; then
    echo "Downloading yt-dlp directly..."
    curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
    chmod a+rx /usr/local/bin/yt-dlp
fi

# Method 4: Download to app directory
if ! command_exists yt-dlp; then
    echo "Downloading yt-dlp to app directory..."
    curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o ./yt-dlp
    chmod +x ./yt-dlp
    export PATH="$PATH:$(pwd)"
fi

# Method 5: Use Python module directly
if ! command_exists yt-dlp && command_exists python3; then
    echo "Setting up yt-dlp Python module alias..."
    echo '#!/bin/bash' > /usr/local/bin/yt-dlp
    echo 'python3 -m yt_dlp "$@"' >> /usr/local/bin/yt-dlp
    chmod +x /usr/local/bin/yt-dlp
fi

# 3. Update PATH to include all possible locations
export PATH="$PATH:/app/.local/bin:/root/.local/bin:/usr/local/bin:$(pwd)"

# 4. Final check
echo -e "\nFinal check..."
if command_exists yt-dlp || python3 -m yt_dlp --version 2>/dev/null; then
    echo "✅ yt-dlp is available!"
    yt-dlp --version || python3 -m yt_dlp --version
else
    echo "❌ Failed to install yt-dlp"
fi

# 5. Check FFmpeg
echo -e "\nChecking FFmpeg..."
if command_exists ffmpeg; then
    echo "✅ FFmpeg found"
    ffmpeg -version | head -n 1
else
    echo "❌ FFmpeg not found"
fi

# 6. Create required directories
echo -e "\nCreating directories..."
mkdir -p public/downloads temp
chmod 777 public/downloads temp

echo -e "\nSetup complete!"
echo "======================" 