import { promises as fs } from 'fs';
import * as path from 'path';

/**
 * Validate and format cookies to ensure they're in proper Netscape format
 */
function validateAndFormatCookies(cookieContent: string): string {
  const lines = cookieContent.split('\n');
  const formattedLines: string[] = [];
  
  // Ensure header is present
  if (!lines[0]?.includes('Netscape HTTP Cookie File')) {
    formattedLines.push('# Netscape HTTP Cookie File');
    formattedLines.push('# This is a generated file!  Do not edit.');
    formattedLines.push('');
  }
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) {
      if (trimmed) formattedLines.push(trimmed);
      continue;
    }
    
    // Parse cookie line
    const parts = trimmed.split('\t');
    if (parts.length >= 7) {
      // Ensure all parts are properly formatted
      const [domain, includeSubdomains, path, secure, expiry, name, value] = parts;
      
      // Validate and fix common issues
      const fixedDomain = domain.startsWith('.') ? domain : `.${domain}`;
      const fixedIncludeSubdomains = includeSubdomains.toUpperCase() === 'TRUE' ? 'TRUE' : 'FALSE';
      const fixedSecure = secure.toUpperCase() === 'TRUE' ? 'TRUE' : 'FALSE';
      
      formattedLines.push([
        fixedDomain,
        fixedIncludeSubdomains,
        path || '/',
        fixedSecure,
        expiry || '0',
        name,
        value
      ].join('\t'));
    }
  }
  
  return formattedLines.join('\n');
}

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
    // Validate and format cookies
    const formattedCookies = validateAndFormatCookies(process.env.YOUTUBE_COOKIES);
    
    // Determine the correct directory based on environment
    const isRailway = process.env.RAILWAY_ENVIRONMENT || process.env.DOCKER_ENV;
    const cookieDir = isRailway ? '/app/temp' : path.join(process.cwd(), 'temp');
    
    // Create the directory if it doesn't exist
    await fs.mkdir(cookieDir, { recursive: true });
    
    // Write cookies to the expected file location
    const cookieFile = path.join(cookieDir, 'youtube_cookies.txt');
    await fs.writeFile(cookieFile, formattedCookies, 'utf-8');
    
    console.log('✅ YouTube cookies set up successfully at:', cookieFile);
    
    // Verify the file was created
    const stats = await fs.stat(cookieFile);
    console.log(`Cookie file size: ${stats.size} bytes`);
    
    // On Railway, also ensure it's in /app/temp specifically
    if (isRailway && cookieDir !== '/app/temp') {
      await fs.mkdir('/app/temp', { recursive: true });
      await fs.writeFile('/app/temp/youtube_cookies.txt', formattedCookies, 'utf-8');
      console.log('✅ Also created cookie file at /app/temp/youtube_cookies.txt for Railway');
    }
    
  } catch (error) {
    console.error('Failed to set up YouTube cookies:', error);
  }
}

// Run setup when module is imported
setupYouTubeCookies().catch(console.error); 