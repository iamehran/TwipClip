import { OpenAI } from 'openai';
import { ProcessedTranscript } from './transcription';

export interface QualityMetrics {
  punctuation: number;
  grammar: number;
  coherence: number;
  confidence: number;
  readability: number;
  overallScore: number;
  needsEnhancement: boolean;
}

export async function assessTranscriptQuality(transcript: ProcessedTranscript): Promise<QualityMetrics> {
  const segments = transcript.segments;
  
  // Calculate metrics
  let punctuationCount = 0;
  let capitalizedCount = 0;
  let sentenceCount = 0;
  let wordCount = 0;
  
  for (const segment of segments) {
    const text = segment.text;
    
    // Count punctuation
    punctuationCount += (text.match(/[.!?,;:]/g) || []).length;
    
    // Count capitalized words (beginning of sentences)
    capitalizedCount += (text.match(/\b[A-Z][a-z]+/g) || []).length;
    
    // Count sentences
    sentenceCount += (text.match(/[.!?]+/g) || []).length;
    
    // Count words
    wordCount += text.split(/\s+/).filter(w => w.length > 0).length;
  }
  
  // Calculate scores
  const punctuationScore = Math.min(punctuationCount / (wordCount * 0.15), 1); // Expect ~15% punctuation
  const grammarScore = Math.min(capitalizedCount / (sentenceCount || 1), 1);
  const coherenceScore = sentenceCount > 0 ? Math.min(sentenceCount / (segments.length * 0.5), 1) : 0;
  const confidenceScore = 0.8; // Default high confidence for Whisper
  const readabilityScore = (punctuationScore + grammarScore + coherenceScore) / 3;
  
  const overallScore = (
    punctuationScore * 0.25 +
    grammarScore * 0.2 +
    coherenceScore * 0.2 +
    confidenceScore * 0.2 +
    readabilityScore * 0.15
  );
  
  return {
    punctuation: punctuationScore,
    grammar: grammarScore,
    coherence: coherenceScore,
    confidence: confidenceScore,
    readability: readabilityScore,
    overallScore,
    needsEnhancement: overallScore < 0.7
  };
}

export async function enhanceTranscriptWithAI(
  transcript: ProcessedTranscript,
  openaiClient: OpenAI,
  metrics: QualityMetrics
): Promise<ProcessedTranscript> {
  // For now, return the original transcript
  // Enhancement can be implemented later if needed
  return transcript;
} 