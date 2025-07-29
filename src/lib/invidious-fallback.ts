import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { existsSync } from 'fs';
import fetch from 'node-fetch';

const execAsync = promisify(exec);

// List of public Invidious instances
const INVIDIOUS_INSTANCES = [
  'https://invidious.io',
  'https://invidious.snopyta.org',
  'https://invidious.kavin.rocks',
  'https://invidious.osi.kr',
  'https://invidious.projectsegfau.lt'
];

export async function downloadViaInvidious(videoUrl: string, outputPath: string): Promise<boolean> {
  console.log('🔄 Trying Invidious fallback...');
  
  // Extract video ID
  const videoIdMatch = videoUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/);
  if (!videoIdMatch) {
    console.error('Could not extract video ID from URL');
    return false;
  }
  
  const videoId = videoIdMatch[1];
  
  // Try each Invidious instance
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      console.log(`Trying ${instance}...`);
      
      // Get video info from Invidious
      const response = await fetch(`${instance}/api/v1/videos/${videoId}`, {
        timeout: 10000
      });
      
      if (!response.ok) continue;
      
      const videoInfo = await response.json();
      
      // Find audio stream
      const audioStream = videoInfo.adaptiveFormats?.find(
        (format: any) => format.type?.includes('audio/mp4') || format.type?.includes('audio/webm')
      );
      
      if (!audioStream) {
        console.log('No audio stream found');
        continue;
      }
      
      console.log(`Found audio stream: ${audioStream.type}`);
      
      // Download audio using curl or wget
      const downloadUrl = audioStream.url.startsWith('http') 
        ? audioStream.url 
        : `${instance}${audioStream.url}`;
      
      const downloadCommand = process.platform === 'win32'
        ? `powershell -Command "Invoke-WebRequest -Uri '${downloadUrl}' -OutFile '${outputPath}'"`
        : `curl -L "${downloadUrl}" -o "${outputPath}"`;
      
      await execAsync(downloadCommand, {
        timeout: 300000, // 5 minutes
        maxBuffer: 1024 * 1024 * 10
      });
      
      if (existsSync(outputPath)) {
        console.log('✅ Successfully downloaded via Invidious');
        return true;
      }
      
    } catch (error) {
      console.log(`Failed with ${instance}:`, error instanceof Error ? error.message : String(error));
      continue;
    }
  }
  
  console.log('❌ All Invidious instances failed');
  return false;
} 