import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';

export async function GET() {
  const cookieStore = await cookies();
  const isAuthenticated = cookieStore.get('youtube_authenticated')?.value === 'true';
  
  if (!isAuthenticated) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  
  // Create a cookie file that tells yt-dlp to use browser cookies
  // This is a marker file that our transcription code will check
  const cookieDir = path.join(process.cwd(), 'temp');
  const cookieFile = path.join(cookieDir, 'youtube_auth.txt');
  
  try {
    if (!existsSync(cookieDir)) {
      await fs.mkdir(cookieDir, { recursive: true });
    }
    
    // Write a marker file
    await fs.writeFile(cookieFile, 'authenticated', 'utf-8');
    
    return NextResponse.json({ 
      success: true,
      message: 'Cookie file created'
    });
  } catch (error) {
    console.error('Failed to create cookie file:', error);
    return NextResponse.json({ error: 'Failed to create cookie file' }, { status: 500 });
  }
} 