import { promises as fs } from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import OpenAI from 'openai';
import { getFFmpegCommand } from './system-tools';

const execAsync = promisify(exec);

interface AudioChunk {
  path: string;
  startTime: number;
  duration: number;
  size: number;
  index: number;
}

interface TranscriptSegment {
  text: string;
  offset: number;
  duration: number;
}

const MAX_CHUNK_SIZE = 24 * 1024 * 1024; // 24MB to be safe (Whisper limit is 25MB)
const MIN_CHUNK_SIZE = 1024; // 1KB minimum to ensure valid audio
const CHUNK_DURATION = 300; // 5 minutes per chunk initially
const CHUNK_OVERLAP = 30; // 30 seconds overlap between chunks
const MIN_CHUNK_DURATION = 10; // Minimum 10 seconds per chunk

/**
 * Validate audio file before processing
 */
async function validateAudioFile(audioPath: string): Promise<void> {
  try {
    const stats = await fs.stat(audioPath);
    if (!stats.isFile()) {
      throw new Error('Path is not a file');
    }
    if (stats.size === 0) {
      throw new Error('Audio file is empty');
    }
  } catch (error) {
    throw new Error(`Invalid audio file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Compress audio file to reduce size before processing
 * Returns the path to compressed file if successful, null if compression didn't help
 */
export async function compressAudioFile(audioPath: string, tempDir: string): Promise<string | null> {
  console.log('🗜️ Attempting to compress audio file...');
  
  try {
    await validateAudioFile(audioPath);
    
    const stats = await fs.stat(audioPath);
    const originalSizeMB = stats.size / (1024 * 1024);
    console.log(`Original size: ${originalSizeMB.toFixed(1)}MB`);
    
    // If already small enough, no need to compress
    if (originalSizeMB <= 24) {
      console.log('✅ File already within size limit, no compression needed');
      return null;
    }
    
    // Ensure temp directory exists
    await fs.mkdir(tempDir, { recursive: true });
    
    const compressedPath = path.join(tempDir, `compressed_${Date.now()}_${path.basename(audioPath)}`);
    const ffmpegPath = await getFFmpegCommand();
    
    // Aggressive compression: mono, 16kHz, 64kbps
    // This should reduce file size by ~75-80%
    const compressionCmd = `"${ffmpegPath}" -i "${audioPath}" -ac 1 -ar 16000 -b:a 64k -f mp4 "${compressedPath}" -y`;
    
    console.log('Compressing with: mono, 16kHz, 64kbps...');
    const { stderr } = await execAsync(compressionCmd, { 
      timeout: 180000, // 3 minute timeout
      maxBuffer: 10 * 1024 * 1024 // 10MB buffer
    });
    
    // Check if compression succeeded
    try {
      const compressedStats = await fs.stat(compressedPath);
      if (compressedStats.size < MIN_CHUNK_SIZE) {
        throw new Error('Compressed file too small, likely corrupted');
      }
      
      const compressedSizeMB = compressedStats.size / (1024 * 1024);
      const reduction = ((originalSizeMB - compressedSizeMB) / originalSizeMB * 100).toFixed(1);
      
      console.log(`✅ Compressed to ${compressedSizeMB.toFixed(1)}MB (${reduction}% reduction)`);
      
      // If compressed file is still too large, try even more aggressive compression
      if (compressedSizeMB > 24) {
        console.log('⚠️ Still too large, trying more aggressive compression...');
        
        const ultraCompressedPath = path.join(tempDir, `ultra_compressed_${Date.now()}_${path.basename(audioPath)}`);
        const ultraCompressionCmd = `"${ffmpegPath}" -i "${audioPath}" -ac 1 -ar 16000 -b:a 32k -f mp4 "${ultraCompressedPath}" -y`;
        
        await execAsync(ultraCompressionCmd, { 
          timeout: 180000,
          maxBuffer: 10 * 1024 * 1024
        });
        
        const ultraStats = await fs.stat(ultraCompressedPath);
        const ultraSizeMB = ultraStats.size / (1024 * 1024);
        
        if (ultraStats.size >= MIN_CHUNK_SIZE && ultraSizeMB <= 24) {
          console.log(`✅ Ultra-compressed to ${ultraSizeMB.toFixed(1)}MB`);
          // Clean up intermediate file
          await fs.unlink(compressedPath).catch(() => {});
          return ultraCompressedPath;
        } else {
          // Clean up ultra-compressed file, keep the better quality one
          await fs.unlink(ultraCompressedPath).catch(() => {});
        }
      }
      
      return compressedSizeMB <= 24 ? compressedPath : null;
      
    } catch (statError) {
      console.error('❌ Compression output validation failed:', statError);
      throw new Error('Compression failed to produce valid output');
    }
    
  } catch (error) {
    console.error('❌ Compression failed:', error);
    // Clean up any partial files
    if (compressedPath) {
      await fs.unlink(compressedPath).catch(() => {});
    }
    return null;
  }
}

/**
 * Get accurate audio duration using FFmpeg
 */
async function getAudioDuration(audioPath: string, ffmpegPath: string): Promise<number> {
  try {
    const durationCmd = `"${ffmpegPath}" -i "${audioPath}" 2>&1`;
    const { stdout, stderr } = await execAsync(durationCmd, {
      timeout: 30000,
      maxBuffer: 5 * 1024 * 1024
    });
    
    const output = stderr || stdout;
    
    // Try multiple patterns to extract duration
    const patterns = [
      /Duration: (\d{2}):(\d{2}):(\d{2})\.(\d{2})/,
      /Duration: (\d{2}):(\d{2}):(\d{2})/,
      /duration=(\d+\.\d+)/i
    ];
    
    for (const pattern of patterns) {
      const match = output.match(pattern);
      if (match) {
        if (match.length >= 4) {
          // HH:MM:SS format
          const hours = parseInt(match[1]);
          const minutes = parseInt(match[2]);
          const seconds = parseInt(match[3]);
          const milliseconds = match[4] ? parseInt(match[4]) : 0;
          return hours * 3600 + minutes * 60 + seconds + milliseconds / 100;
        } else if (match[1]) {
          // Direct seconds format
          return parseFloat(match[1]);
        }
      }
    }
    
    throw new Error('Could not parse duration from FFmpeg output');
  } catch (error) {
    throw new Error(`Failed to get audio duration: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Split large audio file into chunks with overlap for better accuracy
 */
export async function splitAudioIntoChunks(audioPath: string, tempDir: string): Promise<AudioChunk[]> {
  console.log('🔪 Splitting audio into manageable chunks with overlap...');
  
  try {
    await validateAudioFile(audioPath);
    
    const ffmpegPath = await getFFmpegCommand();
    
    // Get accurate audio duration
    const totalDuration = await getAudioDuration(audioPath, ffmpegPath);
    console.log(`📏 Total audio duration: ${totalDuration.toFixed(1)} seconds (${(totalDuration/60).toFixed(1)} minutes)`);
    
    if (totalDuration < MIN_CHUNK_DURATION) {
      throw new Error(`Audio too short (${totalDuration.toFixed(1)}s). Minimum duration is ${MIN_CHUNK_DURATION}s`);
    }
    
    // Ensure temp directory exists
    await fs.mkdir(tempDir, { recursive: true });
  
  const chunks: AudioChunk[] = [];
  let chunkIndex = 0;
  let currentTime = 0;
  
  // Calculate optimal chunk duration based on file size
  const stats = await fs.stat(audioPath);
  const bytesPerSecond = stats.size / totalDuration;
    const optimalChunkDuration = Math.floor(MAX_CHUNK_SIZE / bytesPerSecond * 0.8); // 80% to be extra safe
    const chunkDuration = Math.max(MIN_CHUNK_DURATION, Math.min(optimalChunkDuration, CHUNK_DURATION));
  
  console.log(`📊 Optimal chunk duration: ${chunkDuration} seconds (${(chunkDuration/60).toFixed(1)} minutes)`);
    console.log(`📊 Using ${CHUNK_OVERLAP} seconds overlap between chunks`);
    
    while (currentTime < totalDuration - 1) { // Stop 1 second before end to avoid edge issues
      const remainingDuration = totalDuration - currentTime;
      const duration = Math.min(chunkDuration, remainingDuration);
      
      // Skip if remaining duration is too small
      if (duration < MIN_CHUNK_DURATION && chunkIndex > 0) {
        console.log(`  Skipping final ${duration.toFixed(1)}s (too short)`);
        break;
      }
      
      const chunkPath = path.join(tempDir, `chunk_${chunkIndex}_${Date.now()}.m4a`);
    
    // Extract chunk with compression to ensure it's under size limit
      // Use precise seeking with -ss before -i for accuracy
      const extractCmd = `"${ffmpegPath}" -ss ${currentTime} -i "${audioPath}" -t ${duration} -ac 1 -ar 16000 -b:a 64k -f mp4 "${chunkPath}" -y`;
      
      console.log(`  Extracting chunk ${chunkIndex + 1}: ${currentTime.toFixed(1)}s - ${(currentTime + duration).toFixed(1)}s`);
      
      try {
        await execAsync(extractCmd, { 
          timeout: 120000, // 2 minute timeout per chunk
          maxBuffer: 10 * 1024 * 1024
        });
        
        // Verify chunk was created and has valid size
    const chunkStats = await fs.stat(chunkPath);
        if (chunkStats.size < MIN_CHUNK_SIZE) {
          throw new Error(`Chunk too small (${chunkStats.size} bytes)`);
        }
        
    if (chunkStats.size > MAX_CHUNK_SIZE) {
      // If still too large, try with lower bitrate
      console.log(`  ⚠️ Chunk too large (${(chunkStats.size / 1024 / 1024).toFixed(1)}MB), recompressing...`);
      const recompressedPath = chunkPath.replace('.m4a', '_compressed.m4a');
          
          const recompressCmd = `"${ffmpegPath}" -i "${chunkPath}" -ac 1 -ar 16000 -b:a 32k -f mp4 "${recompressedPath}" -y`;
          await execAsync(recompressCmd, {
            timeout: 60000,
            maxBuffer: 10 * 1024 * 1024
          });
          
      await fs.unlink(chunkPath);
      await fs.rename(recompressedPath, chunkPath);
          
      const newStats = await fs.stat(chunkPath);
      console.log(`  ✅ Recompressed to ${(newStats.size / 1024 / 1024).toFixed(1)}MB`);
          
          if (newStats.size > MAX_CHUNK_SIZE) {
            throw new Error(`Chunk still too large after recompression: ${(newStats.size / 1024 / 1024).toFixed(1)}MB`);
          }
    }
    
    chunks.push({
      path: chunkPath,
      startTime: currentTime,
      duration: duration,
          size: chunkStats.size,
          index: chunkIndex
        });
        
        // Move forward by (duration - overlap) to create overlapping chunks
        // Ensure we move forward at least MIN_CHUNK_DURATION
        const step = Math.max(MIN_CHUNK_DURATION, duration - CHUNK_OVERLAP);
        currentTime += step;
        chunkIndex++;
        
      } catch (chunkError) {
        console.error(`  ❌ Failed to extract chunk ${chunkIndex + 1}:`, chunkError);
        // Try to clean up failed chunk
        await fs.unlink(chunkPath).catch(() => {});
        
        // If this is the first chunk, we can't continue
        if (chunkIndex === 0) {
          throw new Error(`Failed to extract first chunk: ${chunkError instanceof Error ? chunkError.message : 'Unknown error'}`);
        }
        
        // Otherwise, skip this chunk and continue
        currentTime += chunkDuration;
    chunkIndex++;
      }
    }
    
    if (chunks.length === 0) {
      throw new Error('No chunks could be extracted from the audio file');
  }
  
    console.log(`✅ Split into ${chunks.length} chunks with ${CHUNK_OVERLAP}s overlap`);
  return chunks;
    
  } catch (error) {
    console.error('❌ Audio splitting failed:', error);
    throw error;
  }
}

/**
 * Transcribe all chunks and combine results, handling overlaps
 */
export async function transcribeChunks(chunks: AudioChunk[], openai: OpenAI): Promise<TranscriptSegment[]> {
  console.log(`🎙️ Transcribing ${chunks.length} audio chunks...`);
  
  if (chunks.length === 0) {
    throw new Error('No chunks to transcribe');
  }
  
  const allSegments: TranscriptSegment[] = [];
  const failedChunks: number[] = [];
  
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    console.log(`  Transcribing chunk ${i + 1}/${chunks.length} (${(chunk.size / 1024 / 1024).toFixed(1)}MB)...`);
    
    try {
      // Validate chunk file exists
      await fs.access(chunk.path);
      
      const audioFile = await fs.readFile(chunk.path);
      if (audioFile.length === 0) {
        throw new Error('Chunk file is empty');
      }
      
      const audioBlob = new File([audioFile], `chunk_${chunk.index}.m4a`, { type: 'audio/m4a' });
      
      const transcription = await openai.audio.transcriptions.create({
        file: audioBlob,
        model: 'whisper-1',
        language: 'en',
        response_format: 'verbose_json',
        timestamp_granularities: ['segment']
      });
      
      if (transcription.segments && Array.isArray(transcription.segments)) {
        // Adjust timestamps based on chunk offset
        const adjustedSegments = transcription.segments
          .filter((seg: any) => seg.text && seg.text.trim().length > 0) // Filter out empty segments
          .map((seg: any) => ({
          text: seg.text.trim(),
            offset: chunk.startTime + (seg.start || 0),
            duration: (seg.end || seg.start || 0) - (seg.start || 0)
          }))
          .filter(seg => seg.duration > 0); // Filter out zero-duration segments
        
        if (adjustedSegments.length > 0) {
        allSegments.push(...adjustedSegments);
          console.log(`  ✅ Chunk ${i + 1}: ${adjustedSegments.length} valid segments`);
        } else {
          console.warn(`  ⚠️ Chunk ${i + 1}: No valid segments found`);
          failedChunks.push(i);
        }
      } else {
        console.warn(`  ⚠️ Chunk ${i + 1}: No segments in transcription`);
        failedChunks.push(i);
      }
      
    } catch (error) {
      console.error(`  ❌ Failed to transcribe chunk ${i + 1}:`, error);
      failedChunks.push(i);
      
      // If too many chunks fail, abort
      if (failedChunks.length > chunks.length * 0.5) {
        throw new Error(`Too many chunks failed (${failedChunks.length}/${chunks.length}). Aborting transcription.`);
      }
    } finally {
      // Always try to clean up chunk file
      try {
        await fs.unlink(chunk.path);
      } catch (cleanupError) {
        console.warn(`  Failed to clean up chunk ${i + 1}:`, cleanupError);
      }
    }
  }
  
  if (allSegments.length === 0) {
    throw new Error('No segments were successfully transcribed');
  }
  
  // Remove duplicate segments from overlapping regions
  const deduplicatedSegments = removeDuplicateSegments(allSegments);
  
  console.log(`✅ Transcription complete:`);
  console.log(`   - Total segments: ${deduplicatedSegments.length}`);
  console.log(`   - Duplicates removed: ${allSegments.length - deduplicatedSegments.length}`);
  console.log(`   - Failed chunks: ${failedChunks.length}`);
  
  return deduplicatedSegments;
}

/**
 * Remove duplicate segments from overlapping chunks
 * Keeps the best quality version when duplicates are found
 */
function removeDuplicateSegments(segments: TranscriptSegment[]): TranscriptSegment[] {
  if (!segments || segments.length === 0) return [];
  
  // Sort segments by offset
  const sorted = [...segments].sort((a, b) => a.offset - b.offset);
  const result: TranscriptSegment[] = [];
  
  for (const segment of sorted) {
    // Skip invalid segments
    if (!segment.text || segment.text.trim().length === 0 || segment.duration <= 0) {
      continue;
    }
    
    // Check if this segment overlaps significantly with the last added segment
    const lastSegment = result[result.length - 1];
    
    if (!lastSegment) {
      result.push(segment);
      continue;
    }
    
    const lastEnd = lastSegment.offset + lastSegment.duration;
    const segmentEnd = segment.offset + segment.duration;
    const overlap = Math.max(0, Math.min(lastEnd, segmentEnd) - segment.offset);
    
    // Calculate overlap percentage for both segments
    const overlapPercentForCurrent = overlap / segment.duration;
    const overlapPercentForLast = overlap / lastSegment.duration;
    
    // If overlap is more than 50% of either segment, consider them duplicates
    if (overlapPercentForCurrent > 0.5 || overlapPercentForLast > 0.5) {
      // Compare text similarity (simple length comparison for now)
      const currentLength = segment.text.length;
      const lastLength = lastSegment.text.length;
      
      // Keep the longer text (usually more complete)
      // But also check if one is significantly longer (might be concatenated)
      if (currentLength > lastLength * 1.5) {
        // Current is significantly longer, might be better
        result[result.length - 1] = segment;
      } else if (lastLength > currentLength * 1.5) {
        // Last is significantly longer, keep it
        // Do nothing
      } else {
        // Similar lengths, keep the one with better timing
        if (Math.abs(segment.offset - lastSegment.offset) < 1) {
          // Very close start times, keep longer text
          if (currentLength > lastLength) {
            result[result.length - 1] = segment;
          }
        }
      }
    } else {
      // No significant overlap, add the segment
      result.push(segment);
    }
  }
  
  return result;
}

/**
 * Main function to handle large audio files with compression-first approach
 */
export async function transcribeLargeAudio(
  audioPath: string, 
  tempDir: string,
  openai: OpenAI
): Promise<TranscriptSegment[] | null> {
  let compressedPath: string | null = null;
  const cleanupFiles: string[] = [];
  
  try {
    // Validate inputs
    if (!audioPath || !tempDir || !openai) {
      throw new Error('Missing required parameters');
    }
    
    await validateAudioFile(audioPath);
    
  const stats = await fs.stat(audioPath);
  const sizeMB = stats.size / (1024 * 1024);
  
  console.log(`📁 Audio file size: ${sizeMB.toFixed(1)}MB`);
  
  if (sizeMB <= 24) {
      console.log('✅ File size is within Whisper limit, no compression needed');
    return null; // Let the regular flow handle it
  }
  
    console.log('📢 File exceeds Whisper limit, using two-tier approach...');
    
    // Ensure temp directory exists
    await fs.mkdir(tempDir, { recursive: true });
    
    // TIER 1: Try compression first
    try {
      compressedPath = await compressAudioFile(audioPath, tempDir);
      
      if (compressedPath) {
        cleanupFiles.push(compressedPath);
        
        // Compression successful and file is now small enough
        console.log('✅ Compression successful! File now within limits');
        
        // Validate compressed file
        const compressedStats = await fs.stat(compressedPath);
        if (compressedStats.size === 0) {
          throw new Error('Compressed file is empty');
        }
        
        // Transcribe the compressed file directly
        const audioFile = await fs.readFile(compressedPath);
        const audioBlob = new File([audioFile], 'compressed_audio.m4a', { type: 'audio/m4a' });
        
        console.log('🎙️ Transcribing compressed audio...');
        const transcription = await openai.audio.transcriptions.create({
          file: audioBlob,
          model: 'whisper-1',
          language: 'en',
          response_format: 'verbose_json',
          timestamp_granularities: ['segment']
        });
        
        if (transcription.segments && Array.isArray(transcription.segments)) {
          const segments = transcription.segments
            .filter((seg: any) => seg.text && seg.text.trim().length > 0)
            .map((seg: any) => ({
              text: seg.text.trim(),
              offset: seg.start || 0,
              duration: (seg.end || seg.start || 0) - (seg.start || 0)
            }))
            .filter(seg => seg.duration > 0);
          
          if (segments.length > 0) {
            console.log(`✅ Transcription complete: ${segments.length} segments`);
            return segments;
          } else {
            console.warn('⚠️ No valid segments in compressed audio transcription');
            // Fall through to chunking
          }
        }
      }
    } catch (compressionError) {
      console.error('❌ Compression approach failed:', compressionError);
      // Fall through to chunking
    }
    
    // TIER 2: Compression didn't work or failed, use chunking with overlap
    console.log('📢 Compression insufficient, falling back to intelligent chunking...');
    
    let chunks: AudioChunk[] = [];
    
    try {
      // Split into chunks with overlap
      chunks = await splitAudioIntoChunks(audioPath, tempDir);
      
      if (chunks.length === 0) {
        throw new Error('No chunks were created');
      }
      
      // Add chunk paths to cleanup list
      chunks.forEach(chunk => cleanupFiles.push(chunk.path));
  
  // Transcribe all chunks
  const segments = await transcribeChunks(chunks, openai);
      
      if (segments.length === 0) {
        throw new Error('No segments were transcribed from chunks');
      }
  
  return segments;
      
    } catch (chunkingError) {
      console.error('❌ Chunking approach failed:', chunkingError);
      
      // Clean up any chunk files that might exist
      for (const chunk of chunks) {
        await fs.unlink(chunk.path).catch(() => {});
      }
      
      throw new Error(`Failed to process large audio file: ${chunkingError instanceof Error ? chunkingError.message : 'Unknown error'}`);
    }
    
  } catch (error) {
    console.error('❌ Large audio transcription failed:', error);
    throw error;
    
  } finally {
    // Clean up all temporary files
    console.log('🧹 Cleaning up temporary files...');
    for (const file of cleanupFiles) {
      try {
        await fs.unlink(file);
      } catch (cleanupError) {
        // Ignore cleanup errors
      }
    }
  }
} 