import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function GET() {
  const cookieStore = cookies();
  const isAuthenticated = cookieStore.get('youtube_authenticated')?.value === 'true';
  
  return NextResponse.json({
    connected: isAuthenticated
  });
} 