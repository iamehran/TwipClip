import { promises as fs } from 'fs';
import * as path from 'path';

/**
 * Set up YouTube cookies from environment variable
 * This ensures cookies are available in the expected location
 */
export async function setupYouTubeCookies(): Promise<void> {
  if (!process.env.YOUTUBE_COOKIES) {
    console.log('No YOUTUBE_COOKIES environment variable found');
    return;
  }

  try {
    // Determine the correct directory based on environment
    const isRailway = process.env.RAILWAY_ENVIRONMENT || process.env.DOCKER_ENV;
    const cookieDir = isRailway ? '/app/temp' : path.join(process.cwd(), 'temp');
    
    // Create the directory if it doesn't exist
    await fs.mkdir(cookieDir, { recursive: true });
    
    // Write cookies to the expected file location
    const cookieFile = path.join(cookieDir, 'youtube_cookies.txt');
    await fs.writeFile(cookieFile, process.env.YOUTUBE_COOKIES, 'utf-8');
    
    console.log('✅ YouTube cookies set up successfully at:', cookieFile);
    
    // Verify the file was created
    const stats = await fs.stat(cookieFile);
    console.log(`Cookie file size: ${stats.size} bytes`);
    
    // On Railway, also ensure it's in /app/temp specifically
    if (isRailway && cookieDir !== '/app/temp') {
      await fs.mkdir('/app/temp', { recursive: true });
      await fs.writeFile('/app/temp/youtube_cookies.txt', process.env.YOUTUBE_COOKIES, 'utf-8');
      console.log('✅ Also created cookie file at /app/temp/youtube_cookies.txt for Railway');
    }
    
  } catch (error) {
    console.error('Failed to set up YouTube cookies:', error);
  }
}

// Run setup when module is imported
setupYouTubeCookies().catch(console.error); 