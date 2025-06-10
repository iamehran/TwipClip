import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Alternative video download methods that don't require yt-dlp
 */

// Method 1: Direct URL download (works for direct video URLs)
export async function downloadDirectUrl(videoUrl: string, outputPath: string): Promise<boolean> {
  try {
    const response = await axios({
      url: videoUrl,
      method: 'GET',
      responseType: 'stream',
      timeout: 30000,
    });

    const writer = fs.createWriteStream(outputPath);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', () => resolve(true));
      writer.on('error', reject);
    });
  } catch (error) {
    console.error('Direct download failed:', error instanceof Error ? error.message : String(error));
    return false;
  }
}

// Method 2: Use online YouTube downloader APIs
export async function downloadViaAPI(videoId: string, outputPath: string): Promise<boolean> {
  const apis = [
    {
      name: 'cobalt',
      url: 'https://co.wuk.sh/api/json',
      method: async (id: string) => {
        const response = await axios.post('https://co.wuk.sh/api/json', {
          url: `https://youtube.com/watch?v=${id}`,
          vQuality: 'lowest', // Lower quality for faster processing
          aFormat: 'mp3',
          filenamePattern: 'basic',
        });
        return response.data?.url;
      }
    },
    {
      name: 'youtube-mp3',
      url: 'https://api.vevioz.com/api/button/mp3',
      method: async (id: string) => {
        const response = await axios.get(`https://api.vevioz.com/api/button/mp3/${id}`);
        return response.data?.url;
      }
    }
  ];

  for (const api of apis) {
    try {
      console.log(`Trying ${api.name} API...`);
      const downloadUrl = await api.method(videoId);
      if (downloadUrl) {
        return await downloadDirectUrl(downloadUrl, outputPath);
      }
    } catch (e) {
      console.error(`${api.name} API failed:`, e instanceof Error ? e.message : String(e));
    }
  }

  return false;
}

// Method 3: Use web scraping to get video info
export async function getVideoInfoWithoutYtDlp(videoUrl: string): Promise<any> {
  try {
    // Try to extract video ID
    const videoIdMatch = videoUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/);
    if (!videoIdMatch) {
      throw new Error('Invalid YouTube URL');
    }

    const videoId = videoIdMatch[1];
    
    // Use YouTube's oembed API to get basic info
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const response = await axios.get(oembedUrl);
    
    return {
      id: videoId,
      title: response.data.title,
      author: response.data.author_name,
      thumbnail: response.data.thumbnail_url,
      // Duration not available from oembed, would need YouTube API
    };
  } catch (error) {
    console.error('Failed to get video info:', error instanceof Error ? error.message : String(error));
    return null;
  }
}

// Method 4: Use curl if available (Linux/Railway)
export async function downloadViaCurl(videoUrl: string, outputPath: string): Promise<boolean> {
  try {
    // First, try to get direct video URL using youtube-dl compatible service
    const serviceUrl = `https://api.youtube-dl.org/api/v1/extract?url=${encodeURIComponent(videoUrl)}`;
    const response = await axios.get(serviceUrl);
    
    if (response.data?.url) {
      await execAsync(`curl -L -o "${outputPath}" "${response.data.url}"`);
      return true;
    }
  } catch (error) {
    console.error('Curl download failed:', error instanceof Error ? error.message : String(error));
  }
  return false;
}

// Method 5: Python script fallback (doesn't require yt-dlp)
export async function downloadViaPythonScript(videoUrl: string, outputPath: string): Promise<boolean> {
  const pythonScript = `
import sys
import urllib.request
import json

try:
    # Use pytube as alternative
    from pytube import YouTube
    yt = YouTube(sys.argv[1])
    stream = yt.streams.filter(progressive=True, file_extension='mp4').first()
    if stream:
        stream.download(output_path=sys.argv[2])
        print("Success")
except:
    # Fallback to basic urllib
    print("Failed")
`;

  try {
    const scriptPath = path.join(process.env.TEMP || '/tmp', 'download.py');
    fs.writeFileSync(scriptPath, pythonScript);
    
    await execAsync(`python3 ${scriptPath} "${videoUrl}" "${outputPath}"`);
    fs.unlinkSync(scriptPath);
    return true;
  } catch (error) {
    console.error('Python script failed:', error instanceof Error ? error.message : String(error));
    return false;
  }
}

// Main download function with all fallbacks
export async function downloadVideoWithFallbacks(
  videoUrl: string, 
  outputPath: string
): Promise<{ success: boolean; method: string }> {
  const methods = [
    { name: 'yt-dlp', fn: () => downloadWithYtDlp(videoUrl, outputPath) },
    { name: 'API', fn: () => downloadViaAPI(extractVideoId(videoUrl), outputPath) },
    { name: 'curl', fn: () => downloadViaCurl(videoUrl, outputPath) },
    { name: 'python', fn: () => downloadViaPythonScript(videoUrl, outputPath) },
    { name: 'direct', fn: () => downloadDirectUrl(videoUrl, outputPath) },
  ];

  for (const method of methods) {
    try {
      console.log(`Attempting download with ${method.name}...`);
      const success = await method.fn();
      if (success && fs.existsSync(outputPath)) {
        console.log(`✅ Download successful with ${method.name}`);
        return { success: true, method: method.name };
      }
    } catch (error) {
      console.error(`${method.name} failed:`, error instanceof Error ? error.message : String(error));
    }
  }

  return { success: false, method: 'none' };
}

// Try yt-dlp if available
async function downloadWithYtDlp(videoUrl: string, outputPath: string): Promise<boolean> {
  try {
    const { getYtDlpCommand } = await import('./system-tools');
    const ytdlpCmd = await getYtDlpCommand();
    await execAsync(`${ytdlpCmd} -f "bestaudio[ext=m4a]/bestaudio/best" -o "${outputPath}" "${videoUrl}"`);
    return true;
  } catch {
    return false;
  }
}

function extractVideoId(url: string): string {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/);
  return match ? match[1] : '';
} 