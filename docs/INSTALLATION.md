# TwipClip Installation Guide

This guide provides step-by-step instructions for installing and configuring TwipClip.

## Prerequisites

Before installing TwipClip, make sure you have:

1. **Node.js** (version 18.x or higher)
2. **npm** (usually comes with Node.js)
3. **YouTube API Key** (see [YOUTUBE_API_SETUP.md](./YOUTUBE_API_SETUP.md) for instructions)
4. **yt-dlp** (required for video clip downloading)

## Installation Steps

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/twipclip.git
cd twipclip
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Up Environment Variables

Create a `.env.local` file in the project root directory:

```bash
# Either run the setup script
node setup.js

# Or create the file manually
echo "YOUTUBE_API_KEY=your_api_key_here" > .env.local
```

Replace `your_api_key_here` with your actual YouTube API key.

### 4. Install yt-dlp

yt-dlp is required for the video clip download functionality. Installation instructions vary by operating system:

#### Windows

**Option 1: Using winget**
```bash
winget install yt-dlp
```

**Option 2: Using pip (Python package manager)**
```bash
pip install yt-dlp
```

**Option 3: Download executable**
1. Download the latest release from: https://github.com/yt-dlp/yt-dlp/releases
2. Rename the downloaded file to `yt-dlp.exe`
3. Move it to a directory in your PATH (e.g., `C:\Windows`)

#### macOS

**Using Homebrew**
```bash
brew install yt-dlp
```

**Using pip**
```bash
pip3 install yt-dlp
```

#### Linux

**Using apt (Debian/Ubuntu)**
```bash
sudo apt update
sudo apt install python3-pip
sudo pip3 install yt-dlp
```

**Using yum/dnf (Fedora/CentOS)**
```bash
sudo yum install python3-pip
sudo pip3 install yt-dlp
```

### 5. Verify yt-dlp Installation

To verify that yt-dlp is correctly installed, run:

```bash
yt-dlp --version
```

You should see the version number displayed.

### 6. Start the Development Server

```bash
npm run dev
```

### 7. Access TwipClip

Open your browser and navigate to:

```
http://localhost:3000
```

## Troubleshooting

### YouTube API Key Issues

- Ensure your API key is correctly set in the `.env.local` file
- Verify that the YouTube Data API v3 is enabled in your Google Cloud Console
- Check that your API key has the necessary permissions

### yt-dlp Not Found

If you receive a "command not found" error when trying to use yt-dlp:

1. Make sure it's installed correctly
2. Verify it's in your system PATH
3. Try using the full path to the executable in the download functionality

### Download Functionality Not Working

If clip downloading doesn't work:

1. Check the server logs for errors
2. Verify yt-dlp is installed and accessible
3. Make sure the YouTube video is not restricted or private
4. Try shortening the clip duration (less than 2 minutes)

## Additional Configuration

### Production Deployment

For production deployment, set your environment variables according to your hosting provider's instructions.

For example, on Vercel:
1. Go to your project settings
2. Add environment variable: `YOUTUBE_API_KEY`
3. Deploy your application

### Advanced yt-dlp Configuration

You can modify the yt-dlp configuration in `app/api/download/route.ts` to customize download options, formats, and other parameters. 