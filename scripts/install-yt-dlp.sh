#!/bin/bash

# Install yt-dlp binary directly as recommended in the documentation
# https://github.com/yt-dlp/yt-dlp/wiki/Installation

echo "Installing yt-dlp..."

# Create local bin directory if it doesn't exist
mkdir -p ~/.local/bin

# Download yt-dlp binary
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o ~/.local/bin/yt-dlp

# Make it executable
chmod a+rx ~/.local/bin/yt-dlp

# Add to PATH
export PATH="$HOME/.local/bin:$PATH"

# Verify installation
if ~/.local/bin/yt-dlp --version; then
    echo "✅ yt-dlp installed successfully!"
else
    echo "❌ yt-dlp installation failed, trying pip method..."
    python3 -m pip install --break-system-packages -U yt-dlp
fi 