import { NextResponse } from 'next/server';
import { Anthropic } from '@anthropic-ai/sdk';

export async function GET() {
  try {
    // Check if API key is configured
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({
        success: false,
        error: 'Anthropic API key not configured',
        message: 'Please set ANTHROPIC_API_KEY in your environment variables'
      }, { status: 500 });
    }

    // Try to initialize the client
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    // Make a simple test request
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 50,
      messages: [{
        role: 'user',
        content: 'Say "API is working" in exactly 3 words.'
      }]
    });

    return NextResponse.json({
      success: true,
      message: 'Anthropic API is configured and working',
      response: response.content[0]?.type === 'text' ? response.content[0].text : 'No response',
      model: 'claude-sonnet-4-20250514'
    });

  } catch (error: any) {
    console.error('Anthropic API test failed:', error);
    
    return NextResponse.json({
      success: false,
      error: error.message || 'Unknown error',
      details: error.response?.data || error.toString()
    }, { status: 500 });
  }
} 