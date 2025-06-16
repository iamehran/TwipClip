import { createReadStream } from 'fs';
import { Readable } from 'stream';

// Ensure File API is available in Node.js
if (typeof globalThis.File === 'undefined') {
  try {
    const { File } = require('buffer');
    globalThis.File = File;
  } catch (error) {
    console.warn('Failed to load File from buffer module:', error);
  }
}

/**
 * Create a file-like object that works with OpenAI SDK
 * This handles both Node.js 18 and 20+ environments
 */
export async function createFileForUpload(filePath: string, mimeType: string = 'audio/mpeg'): Promise<any> {
  try {
    // Try to use createReadStream first (most compatible)
    const stream = createReadStream(filePath);
    
    // Add required properties for OpenAI SDK
    const fileStream: any = stream;
    fileStream.name = filePath.split('/').pop() || 'audio.mp3';
    fileStream.type = mimeType;
    
    return fileStream;
  } catch (error) {
    console.error('Failed to create file stream:', error);
    throw new Error(`Failed to prepare file for upload: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Convert a stream to a format compatible with OpenAI SDK
 */
export function prepareStreamForOpenAI(stream: Readable, filename: string, mimeType: string = 'audio/mpeg'): any {
  const preparedStream: any = stream;
  preparedStream.name = filename;
  preparedStream.type = mimeType;
  return preparedStream;
} 