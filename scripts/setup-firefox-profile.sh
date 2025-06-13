#!/bin/bash

# Script to set up Firefox profile for YouTube authentication
# This should be run once on Railway after deployment

echo "Setting up Firefox profile for YouTube authentication..."

# Create Firefox profile directory
mkdir -p ~/.mozilla/firefox/youtube.default

# Create a basic Firefox profile
cat > ~/.mozilla/firefox/profiles.ini << EOF
[General]
StartWithLastProfile=1

[Profile0]
Name=youtube
IsRelative=1
Path=youtube.default
Default=1
EOF

echo "Firefox profile created."
echo ""
echo "To complete setup:"
echo "1. SSH into your Railway container"
echo "2. Run: firefox -P youtube --new-instance"
echo "3. Navigate to youtube.com and log in"
echo "4. Close Firefox when done"
echo ""
echo "The cookies will be saved and yt-dlp will use them automatically." 