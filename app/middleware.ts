import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { YOUTUBE_API_KEY } from './config';

// This middleware will run on API routes
export function middleware(request: NextRequest) {
  // Only check for API routes
  if (request.nextUrl.pathname.startsWith('/api/')) {
    // Check if YouTube API key is configured
    if (!YOUTUBE_API_KEY) {
      return NextResponse.json(
        { error: 'YouTube API key not configured' },
        { status: 500 }
      );
    }
  }
  
  return NextResponse.next();
}

// Configure the paths to match
export const config = {
  matcher: ['/api/:path*'],
}; 