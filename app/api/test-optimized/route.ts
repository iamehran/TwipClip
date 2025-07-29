import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Simple test to verify the optimized matching module loads correctly
    const optimizedModule = await import('../../utils/perfect-matching-optimized');
    
    return NextResponse.json({
      success: true,
      message: 'Optimized matching module loaded successfully',
      exports: Object.keys(optimizedModule)
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 