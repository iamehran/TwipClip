export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 500,
    public isOperational: boolean = true
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export function handleError(error: any): { message: string; statusCode: number } {
  console.error('Error:', error);
  
  if (error instanceof AppError) {
    return {
      message: error.message,
      statusCode: error.statusCode
    };
  }
  
  // Handle specific error types
  if (error.message?.includes('yt-dlp')) {
    return {
      message: 'Video download service temporarily unavailable',
      statusCode: 503
    };
  }
  
  if (error.message?.includes('OpenAI')) {
    return {
      message: 'AI service temporarily unavailable',
      statusCode: 503
    };
  }
  
  if (error.message?.includes('rate limit')) {
    return {
      message: 'Too many requests. Please try again later.',
      statusCode: 429
    };
  }
  
  // Generic error
  return {
    message: 'An unexpected error occurred. Please try again.',
    statusCode: 500
  };
}

export function logError(error: any, context?: string): void {
  const timestamp = new Date().toISOString();
  const errorInfo = {
    timestamp,
    context,
    message: error.message,
    stack: error.stack,
    type: error.constructor.name
  };
  
  // In production, this could send to a logging service
  console.error('🚨 Error Log:', JSON.stringify(errorInfo, null, 2));
} 