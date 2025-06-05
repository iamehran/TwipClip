import { promises as fs } from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import OpenAI from 'openai';

const execAsync = promisify(exec);

interface AudioChunk {
  path: string;
  startTime: number;
  duration: number;
  size: number;
}

interface TranscriptSegment {
  text: string;
  offset: number;
  duration: number;
}

const FFMPEG_PATH = "C:\\Users\\Mehran\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-7.1.1-full_build\\bin\\ffmpeg.exe";
const MAX_CHUNK_SIZE = 24 * 1024 * 1024; // 24MB to be safe (Whisper limit is 25MB)
const CHUNK_DURATION = 300; // 5 minutes per chunk initially

/**
 * Split large audio file into chunks that Whisper can handle
 */
export async function splitAudioIntoChunks(audioPath: string, tempDir: string): Promise<AudioChunk[]> {
  console.log('🔪 Splitting audio into manageable chunks...');
  
  // Get audio duration
  const durationCmd = `"${FFMPEG_PATH}" -i "${audioPath}" 2>&1`;
  const durationOutput = await execAsync(durationCmd);
  const durationMatch = durationOutput.stderr.match(/Duration: (\d{2}):(\d{2}):(\d{2})/);
  
  if (!durationMatch) {
    throw new Error('Could not determine audio duration');
  }
  
  const hours = parseInt(durationMatch[1]);
  const minutes = parseInt(durationMatch[2]);
  const seconds = parseInt(durationMatch[3]);
  const totalDuration = hours * 3600 + minutes * 60 + seconds;
  
  console.log(`📏 Total audio duration: ${totalDuration} seconds (${(totalDuration/60).toFixed(1)} minutes)`);
  
  const chunks: AudioChunk[] = [];
  let chunkIndex = 0;
  let currentTime = 0;
  
  // Calculate optimal chunk duration based on file size
  const stats = await fs.stat(audioPath);
  const bytesPerSecond = stats.size / totalDuration;
  const optimalChunkDuration = Math.floor(MAX_CHUNK_SIZE / bytesPerSecond * 0.9); // 90% to be safe
  const chunkDuration = Math.min(optimalChunkDuration, CHUNK_DURATION);
  
  console.log(`📊 Optimal chunk duration: ${chunkDuration} seconds (${(chunkDuration/60).toFixed(1)} minutes)`);
  
  while (currentTime < totalDuration) {
    const chunkPath = path.join(tempDir, `chunk_${chunkIndex}.m4a`);
    const duration = Math.min(chunkDuration, totalDuration - currentTime);
    
    // Extract chunk with compression to ensure it's under size limit
    const extractCmd = `"${FFMPEG_PATH}" -i "${audioPath}" -ss ${currentTime} -t ${duration} -ac 1 -ar 16000 -b:a 64k "${chunkPath}" -y`;
    
    console.log(`  Extracting chunk ${chunkIndex + 1}: ${currentTime}s - ${currentTime + duration}s`);
    await execAsync(extractCmd, { timeout: 60000 });
    
    // Verify chunk size
    const chunkStats = await fs.stat(chunkPath);
    if (chunkStats.size > MAX_CHUNK_SIZE) {
      // If still too large, try with lower bitrate
      console.log(`  ⚠️ Chunk too large (${(chunkStats.size / 1024 / 1024).toFixed(1)}MB), recompressing...`);
      const recompressedPath = chunkPath.replace('.m4a', '_compressed.m4a');
      await execAsync(`"${FFMPEG_PATH}" -i "${chunkPath}" -ac 1 -ar 16000 -b:a 32k "${recompressedPath}" -y`);
      await fs.unlink(chunkPath);
      await fs.rename(recompressedPath, chunkPath);
      const newStats = await fs.stat(chunkPath);
      console.log(`  ✅ Recompressed to ${(newStats.size / 1024 / 1024).toFixed(1)}MB`);
    }
    
    chunks.push({
      path: chunkPath,
      startTime: currentTime,
      duration: duration,
      size: chunkStats.size
    });
    
    currentTime += duration;
    chunkIndex++;
  }
  
  console.log(`✅ Split into ${chunks.length} chunks`);
  return chunks;
}

/**
 * Transcribe all chunks and combine results
 */
export async function transcribeChunks(chunks: AudioChunk[], openai: OpenAI): Promise<TranscriptSegment[]> {
  console.log(`🎙️ Transcribing ${chunks.length} audio chunks...`);
  
  const allSegments: TranscriptSegment[] = [];
  
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    console.log(`  Transcribing chunk ${i + 1}/${chunks.length} (${(chunk.size / 1024 / 1024).toFixed(1)}MB)...`);
    
    try {
      const audioFile = await fs.readFile(chunk.path);
      const audioBlob = new File([audioFile], `chunk_${i}.m4a`, { type: 'audio/m4a' });
      
      const transcription = await openai.audio.transcriptions.create({
        file: audioBlob,
        model: 'whisper-1',
        language: 'en',
        response_format: 'verbose_json',
        timestamp_granularities: ['segment']
      });
      
      if (transcription.segments) {
        // Adjust timestamps based on chunk offset
        const adjustedSegments = transcription.segments.map((seg: any) => ({
          text: seg.text.trim(),
          offset: chunk.startTime + seg.start,
          duration: seg.end - seg.start
        }));
        
        allSegments.push(...adjustedSegments);
        console.log(`  ✅ Chunk ${i + 1}: ${adjustedSegments.length} segments`);
      }
      
      // Clean up chunk file after transcription
      await fs.unlink(chunk.path).catch(() => {});
      
    } catch (error) {
      console.error(`  ❌ Failed to transcribe chunk ${i + 1}:`, error);
      // Continue with other chunks even if one fails
    }
  }
  
  console.log(`✅ Total segments transcribed: ${allSegments.length}`);
  return allSegments;
}

/**
 * Main function to handle large audio files
 */
export async function transcribeLargeAudio(
  audioPath: string, 
  tempDir: string,
  openai: OpenAI
): Promise<TranscriptSegment[] | null> {
  const stats = await fs.stat(audioPath);
  const sizeMB = stats.size / (1024 * 1024);
  
  console.log(`📁 Audio file size: ${sizeMB.toFixed(1)}MB`);
  
  if (sizeMB <= 24) {
    console.log('✅ File size is within Whisper limit, no chunking needed');
    return null; // Let the regular flow handle it
  }
  
  console.log('📢 File exceeds Whisper limit, using chunking strategy...');
  
  // Split into chunks
  const chunks = await splitAudioIntoChunks(audioPath, tempDir);
  
  // Transcribe all chunks
  const segments = await transcribeChunks(chunks, openai);
  
  return segments;
} 