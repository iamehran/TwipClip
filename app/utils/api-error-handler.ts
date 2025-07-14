import { NextResponse } from 'next/server';
import { formatErrorForUser } from './error-messages';

export class APIError extends Error {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string, statusCode: number = 500, isOperational: boolean = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

export function handleAPIError(error: unknown) {
  console.error('API Error:', error);

  // Handle known API errors
  if (error instanceof APIError) {
    return NextResponse.json(
      { 
        error: error.message,
        statusCode: error.statusCode,
        operational: error.isOperational
      },
      { status: error.statusCode }
    );
  }

  // Handle standard errors
  if (error instanceof Error) {
    const userMessage = formatErrorForUser(error);
    
    // Determine status code based on error type
    let statusCode = 500;
    if (error.message.includes('not found')) statusCode = 404;
    if (error.message.includes('authentication') || error.message.includes('API key')) statusCode = 401;
    if (error.message.includes('timeout')) statusCode = 408;
    if (error.message.includes('too large') || error.message.includes('too long')) statusCode = 413;
    
    return NextResponse.json(
      { 
        error: userMessage,
        statusCode,
        technical: error.message
      },
      { status: statusCode }
    );
  }

  // Handle unknown errors
  return NextResponse.json(
    { 
      error: 'An unexpected error occurred. Please try again.',
      statusCode: 500
    },
    { status: 500 }
  );
}

// Wrapper for async route handlers
export function withErrorHandler(handler: Function) {
  return async (request: Request, ...args: any[]) => {
    try {
      return await handler(request, ...args);
    } catch (error) {
      return handleAPIError(error);
    }
  };
} 