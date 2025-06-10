import { NextResponse } from 'next/server';
import { getYtDlpCommand } from '@/lib/system-tools';
import path from 'path';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const videoUrl = searchParams.get('url') || 'https://youtu.be/-wTbbVCflb0?si=N7ow6s8N-X4h4XCu';
  
  try {
    const ytdlpCmd = await getYtDlpCommand();
    const tempDir = path.join(process.cwd(), 'temp');
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(7);
    const audioPath = path.join(tempDir, `audio_${timestamp}_${randomId}.mp3`);
    
    const isRailway = process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV === 'production';
    
    let command: string;
    if (isRailway) {
      command = `${ytdlpCmd} -x --audio-format mp3 --audio-quality 0 "${videoUrl}" -o "${audioPath}"`;
    } else {
      command = `${ytdlpCmd} -x --audio-format mp3 --audio-quality 0 "${videoUrl}" -o "${audioPath}"`;
    }
    
    // Check for any weird characters
    const hasWeirdChars = command.includes(';') || command.includes('\n') || command.includes('\r');
    
    return NextResponse.json({
      success: true,
      ytdlpCmd,
      audioPath,
      command,
      commandLength: command.length,
      hasWeirdChars,
      weirdChars: hasWeirdChars ? {
        hasSemicolon: command.includes(';'),
        hasNewline: command.includes('\n'),
        hasCarriageReturn: command.includes('\r')
      } : null,
      // Show each part separately
      parts: {
        ytdlp: ytdlpCmd,
        videoUrl,
        audioPath
      }
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
} 