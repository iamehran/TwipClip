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
    
    # Upgrade pip first
    echo "Upgrading pip..."
    python3 -m pip install --upgrade pip || true
else
    echo "❌ Python3 not found"
    exit 1
fi

# 2. Install yt-dlp using multiple methods
echo -e "\nInstalling yt-dlp..."

# Method 1: Direct pip install
echo "Method 1: Direct pip install..."
python3 -m pip install yt-dlp && echo "✅ Installed via pip" || echo "❌ pip install failed"

# Check if it worked
if command_exists yt-dlp || python3 -m yt_dlp --version 2>/dev/null; then
    echo "✅ yt-dlp is now available!"
else
    # Method 2: Download directly from GitHub
    echo "Method 2: Downloading yt-dlp binary..."
    mkdir -p /app/bin
    curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /app/bin/yt-dlp
    chmod +x /app/bin/yt-dlp
    export PATH="/app/bin:$PATH"
    
    # Test if binary works
    if /app/bin/yt-dlp --version; then
        echo "✅ Binary download successful"
        
        # Create a Python wrapper
        echo "Creating Python wrapper..."
        cat > /app/bin/yt-dlp-wrapper.py << 'EOF'
#!/usr/bin/env python3
import sys
import subprocess
subprocess.run(['/app/bin/yt-dlp'] + sys.argv[1:])
EOF
        chmod +x /app/bin/yt-dlp-wrapper.py
        
        # Create symlink for python module
        mkdir -p /app/.local/lib/python3.11/site-packages
        ln -sf /app/bin/yt-dlp-wrapper.py /app/.local/lib/python3.11/site-packages/yt_dlp.py
    else
        echo "❌ Binary download failed"
    fi
fi

# 3. Set up environment variables
echo -e "\nSetting up environment..."
export PATH="/app/bin:/app/.local/bin:/usr/local/bin:$PATH"
export PYTHONPATH="/app/.local/lib/python3.11/site-packages:$PYTHONPATH"
export YTDLP_PATH="/app/bin/yt-dlp"

# 4. Final verification
echo -e "\nFinal verification..."
echo "PATH: $PATH"
echo "PYTHONPATH: $PYTHONPATH"

# Test all possible ways to run yt-dlp
echo -e "\nTesting yt-dlp execution methods:"
echo "1. Direct command:"
yt-dlp --version 2>/dev/null && echo "✅ Works" || echo "❌ Failed"

echo "2. Python module:"
python3 -m yt_dlp --version 2>/dev/null && echo "✅ Works" || echo "❌ Failed"

echo "3. Direct path:"
/app/bin/yt-dlp --version 2>/dev/null && echo "✅ Works" || echo "❌ Failed"

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
mkdir -p /app/public/downloads /app/temp
chmod 777 /app/public/downloads /app/temp

# 7. Install additional Python packages if needed
echo -e "\nInstalling additional Python packages..."
if [ -f "/app/requirements.txt" ]; then
    python3 -m pip install -r /app/requirements.txt || echo "⚠️ Some packages failed to install"
fi

echo -e "\nSetup complete!"
echo "======================" 