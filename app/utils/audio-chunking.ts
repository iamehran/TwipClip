import { exec } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { promisify } from 'util';
import OpenAI from 'openai';
import { getFFmpegPath } from './system-tools';
import { getVideoMetadata } from './video-metadata';
import { getYtDlpCommand } from '../../src/lib/system-tools';

// Fix for File API in Node.js environment
if (typeof globalThis.File === 'undefined') {
  const { File } = require('buffer');
  globalThis.File = File;
}

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

// Constants for chunking
const MIN_CHUNK_DURATION = 10; // seconds
const MAX_CHUNK_DURATION = 300; // 5 minutes
const TARGET_CHUNK_SIZE = 20 * 1024 * 1024; // 20MB target size
const CHUNK_OVERLAP = 30; // 30 seconds overlap between chunks for continuity

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
  console.log('🎵 Attempting to compress audio file...');
  
  let compressedPath: string | null = null;
  
  try {
    await validateAudioFile(audioPath);
    
    const stats = await fs.stat(audioPath);
    const originalSizeMB = stats.size / (1024 * 1024);
    console.log(`📊 Original size: ${originalSizeMB.toFixed(1)}MB`);
    
    if (originalSizeMB <= 24) {
      console.log('✅ File already within size limit');
      return audioPath;
    }
    
    // Detect input format
    const inputExt = path.extname(audioPath).toLowerCase();
    const inputFormat = inputExt === '.webm' ? '-f webm' : '';
    
    compressedPath = path.join(tempDir, `compressed_${Date.now()}_${path.basename(audioPath, inputExt)}.m4a`);
    const ffmpegPath = await getFFmpegPath();
    
    // Compress with moderate settings first
    const compressCmd = `"${ffmpegPath}" ${inputFormat} -i "${audioPath}" -ac 1 -ar 16000 -b:a 64k -f mp4 "${compressedPath}" -y`;
    
    const { stdout, stderr } = await execAsync(compressCmd, {
      timeout: 180000, // 3 minutes (for compression)
      maxBuffer: 50 * 1024 * 1024 // 50MB buffer
    });
    
    // Check if compression succeeded
    try {
      const compressedStats = await fs.stat(compressedPath);
      if (compressedStats.size < MIN_CHUNK_DURATION) {
        throw new Error('Compressed file too small, likely corrupted');
      }
      
      const compressedSizeMB = compressedStats.size / (1024 * 1024);
      const reduction = ((originalSizeMB - compressedSizeMB) / originalSizeMB * 100).toFixed(1);
      
      console.log(`✅ Compressed to ${compressedSizeMB.toFixed(1)}MB (${reduction}% reduction)`);
      
      // If compressed file is still too large, try even more aggressive compression
      if (compressedSizeMB > 24) {
        console.log('⚠️ Still too large, trying more aggressive compression...');
        
        const ultraCompressedPath = path.join(tempDir, `ultra_compressed_${Date.now()}_${path.basename(audioPath, inputExt)}.m4a`);
        const ultraCompressionCmd = `"${ffmpegPath}" ${inputFormat} -i "${audioPath}" -ac 1 -ar 16000 -b:a 32k -f mp4 "${ultraCompressedPath}" -y`;
        
        await execAsync(ultraCompressionCmd, { 
          timeout: 180000, // 3 minutes
          maxBuffer: 50 * 1024 * 1024 // 50MB buffer
        });
        
        const ultraStats = await fs.stat(ultraCompressedPath);
        const ultraSizeMB = ultraStats.size / (1024 * 1024);
        
        if (ultraStats.size >= MIN_CHUNK_DURATION && ultraSizeMB <= 24) {
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
    // First, check if the file exists and is readable
    const stats = await fs.stat(audioPath);
    if (stats.size === 0) {
      throw new Error('Audio file is empty');
    }
    
    console.log(`Getting duration for: ${audioPath} (${(stats.size / 1024 / 1024).toFixed(1)}MB)`);
    
    // Try ffprobe first (more reliable)
    const probePath = ffmpegPath.replace('ffmpeg', 'ffprobe');
    const probeCmd = `"${probePath}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`;
    
    try {
      const { stdout: probeDuration } = await execAsync(probeCmd, {
        timeout: 30000,
        maxBuffer: 5 * 1024 * 1024
      });
      
      if (probeDuration && !isNaN(parseFloat(probeDuration.trim()))) {
        const duration = parseFloat(probeDuration.trim());
        console.log(`Duration from ffprobe: ${duration.toFixed(1)}s`);
        return duration;
      }
    } catch (probeError) {
      console.warn('ffprobe failed, trying ffmpeg:', probeError);
    }
    
    // Fallback to ffmpeg with format detection
    const fileExt = path.extname(audioPath).toLowerCase();
    const inputFormat = fileExt === '.webm' ? '-f webm' : '';
    
    const durationCmd = `"${ffmpegPath}" ${inputFormat} -i "${audioPath}" 2>&1`;
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
    
    const ffmpegPath = await getFFmpegPath();
    
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
    const optimalChunkDuration = Math.floor(TARGET_CHUNK_SIZE / bytesPerSecond * 0.8); // 80% to be extra safe
    const chunkDuration = Math.max(MIN_CHUNK_DURATION, Math.min(optimalChunkDuration, MAX_CHUNK_DURATION));
  
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
      // For webm input, we need to specify the input format
      const inputExt = path.extname(audioPath).toLowerCase();
      const inputFormat = inputExt === '.webm' ? '-f webm' : '';
      
      const extractCmd = `"${ffmpegPath}" ${inputFormat} -ss ${currentTime} -i "${audioPath}" -t ${duration} -ac 1 -ar 16000 -b:a 64k -f mp4 "${chunkPath}" -y`;
      
      console.log(`  Extracting chunk ${chunkIndex + 1}: ${currentTime.toFixed(1)}s - ${(currentTime + duration).toFixed(1)}s`);
      
      try {
        await execAsync(extractCmd, { 
          timeout: 180000, // 3 minute timeout per chunk
          maxBuffer: 50 * 1024 * 1024 // 50MB buffer
        });
        
        // Verify chunk was created and has valid size
    const chunkStats = await fs.stat(chunkPath);
        if (chunkStats.size < MIN_CHUNK_DURATION) {
          throw new Error(`Chunk too small (${chunkStats.size} bytes)`);
        }
        
    if (chunkStats.size > TARGET_CHUNK_SIZE) {
      // If still too large, try with lower bitrate
      console.log(`  ⚠️ Chunk too large (${(chunkStats.size / 1024 / 1024).toFixed(1)}MB), recompressing...`);
      const recompressedPath = chunkPath.replace('.m4a', '_compressed.m4a');
          
          const recompressCmd = `"${ffmpegPath}" -i "${chunkPath}" -ac 1 -ar 16000 -b:a 32k -f mp4 "${recompressedPath}" -y`;
          await execAsync(recompressCmd, {
            timeout: 120000, // 2 minutes for recompression
            maxBuffer: 50 * 1024 * 1024 // 50MB buffer
          });
          
      await fs.unlink(chunkPath);
      await fs.rename(recompressedPath, chunkPath);
          
      const newStats = await fs.stat(chunkPath);
      console.log(`  ✅ Recompressed to ${(newStats.size / 1024 / 1024).toFixed(1)}MB`);
          
          if (newStats.size > TARGET_CHUNK_SIZE) {
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
        // For the last chunk or very short chunks, don't use overlap
        const step = (duration <= CHUNK_OVERLAP || remainingDuration <= duration) 
          ? duration  // No overlap for last chunk
          : duration - CHUNK_OVERLAP;  // Normal overlap
        
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
      
      // Use our helper for proper file handling
      const { createFileForUpload } = await import('./file-upload-helper');
      const audioFile = await createFileForUpload(chunk.path, 'audio/m4a');
      
      const transcription = await openai.audio.transcriptions.create({
        file: audioFile,
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
 * Main function to handle large audio files with chunking approach
 */
export async function transcribeLargeAudio(
  audioPath: string, 
  tempDir: string,
  openai: OpenAI
): Promise<TranscriptSegment[] | null> {
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
      console.log('✅ File size is within Whisper limit, no chunking needed');
      return null; // Let the regular flow handle it
    }
    
    console.log('📢 File exceeds Whisper limit, using chunking approach...');
    
    // Ensure temp directory exists
    await fs.mkdir(tempDir, { recursive: true });
    
    // Split into chunks directly
    let chunks: AudioChunk[] = [];
    
    try {
      // Split into chunks with overlap
      chunks = await splitAudioIntoChunks(audioPath, tempDir);
      
      if (chunks.length === 0) {
        throw new Error('No chunks were created');
      }
      
      console.log(`✅ Created ${chunks.length} chunks for transcription`);
      
      // Add chunk paths to cleanup list
      chunks.forEach(chunk => cleanupFiles.push(chunk.path));
      
      // Transcribe all chunks
      const segments = await transcribeChunks(chunks, openai);
      
      if (segments.length === 0) {
        throw new Error('No segments were transcribed from chunks');
      }
      
      console.log(`✅ Successfully transcribed ${segments.length} segments from ${chunks.length} chunks`);
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

/**
 * Alternative strategy: Download audio in chunks using yt-dlp's time-based download
 * This can help avoid 403 errors on very long videos
 */
export async function downloadAudioInChunks(
  videoUrl: string,
  outputDir: string,
  chunkDurationMinutes: number = 30
): Promise<string[]> {
  const ytDlpPath = await getYtDlpCommand();
  const isDocker = process.env.RAILWAY_ENVIRONMENT || process.env.DOCKER_ENV;
  
  // Get video metadata to determine duration
  const metadata = await getVideoMetadata(videoUrl);
  if (!metadata || !metadata.duration) {
    throw new Error('Could not get video duration');
  }
  
  const totalMinutes = Math.ceil(metadata.duration / 60);
  const numChunks = Math.ceil(totalMinutes / chunkDurationMinutes);
  const audioChunks: string[] = [];
  
  console.log(`📦 Downloading ${numChunks} chunks of ${chunkDurationMinutes} minutes each...`);
  
  for (let i = 0; i < numChunks; i++) {
    const startTime = i * chunkDurationMinutes * 60;
    const endTime = Math.min((i + 1) * chunkDurationMinutes * 60, metadata.duration);
    const chunkPath = path.join(outputDir, `chunk_${i}.m4a`);
    
    console.log(`  Downloading chunk ${i + 1}/${numChunks} (${startTime}s - ${endTime}s)...`);
    
    // Build command with time-based download
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    let cookieFlag = '';
    
    const cookieFile = '/app/temp/youtube_cookies.txt';
    if (require('fs').existsSync(cookieFile)) {
      cookieFlag = `--cookies ${cookieFile} --no-cookies-from-browser`;
    }
    
    // Use download-sections to download specific time range
    const command = isDocker
      ? `${ytDlpPath} ${cookieFlag} --user-agent "${userAgent}" --download-sections "*${startTime}-${endTime}" -f "140/bestaudio[ext=m4a]/worstaudio" --no-check-certificate -o "${chunkPath}" "${videoUrl}"`
      : `"${ytDlpPath}" --download-sections "*${startTime}-${endTime}" -f "worstaudio" -o "${chunkPath}" "${videoUrl}"`;
    
    try {
      await execAsync(command, {
        timeout: 300000, // 5 minutes per chunk
        maxBuffer: 50 * 1024 * 1024
      });
      
      // Verify chunk was created
      const stats = await fs.stat(chunkPath);
      if (stats.size > 1000) {
        audioChunks.push(chunkPath);
        console.log(`    ✅ Chunk ${i + 1} downloaded: ${(stats.size / 1024 / 1024).toFixed(1)}MB`);
      } else {
        console.log(`    ⚠️ Chunk ${i + 1} too small, skipping`);
      }
    } catch (error) {
      console.error(`    ❌ Failed to download chunk ${i + 1}:`, error);
      // Continue with other chunks
    }
  }
  
  if (audioChunks.length === 0) {
    throw new Error('Failed to download any audio chunks');
  }
  
  console.log(`✅ Downloaded ${audioChunks.length}/${numChunks} chunks successfully`);
  return audioChunks;
} 