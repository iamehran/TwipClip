import { NextResponse } from 'next/server';
import { checkSystemTools } from '../../../src/lib/system-tools';

export async function GET() {
  return NextResponse.json({ 
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'TwipClip',
    version: '1.0.0'
  });
} 