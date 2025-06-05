import OpenAI from 'openai';

// Initialize OpenAI client for quality enhancement
const openai = process.env.OPENAI_API_KEY 
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) 
  : null;

interface TranscriptSegment {
  text: string;
  offset: number; // in seconds
  duration: number; // in seconds
}

interface TranscriptResult {
  segments: TranscriptSegment[];
  source: 'whisper-api' | 'whisper-local' | 'youtube-api' | 'youtube-transcript' | 'vimeo-captions' | 'auto-generated' | 'direct-file' | 'ai-enhanced' | 'google-video-intelligence';
  quality: 'high' | 'medium' | 'low';
  language: string;
  confidence?: number;
  platform: 'youtube' | 'vimeo' | 'twitter' | 'tiktok' | 'instagram' | 'direct' | 'generic';
}

interface QualityMetrics {
  overallScore: number; // 0-1
  punctuationScore: number; // 0-1
  grammarScore: number; // 0-1
  coherenceScore: number; // 0-1
  confidenceScore: number; // 0-1
  readabilityScore: number; // 0-1
  aiEnhanced: boolean;
  enhancementMethods: string[];
}

interface EnhancedTranscriptResult extends TranscriptResult {
  qualityMetrics: QualityMetrics;
  originalQuality: 'high' | 'medium' | 'low';
  enhancementApplied: boolean;
  processingTime: number;
}

/**
 * PHASE 2B: Master quality enhancement function
 */
export async function enhanceTranscriptQuality(transcript: TranscriptResult): Promise<TranscriptResult> {
  const startTime = Date.now();
  const originalQuality = transcript.quality;
  const enhancementMethods: string[] = [];
  
  console.log(`🎯 Phase 2B: Enhancing transcript quality (current: ${transcript.quality}, source: ${transcript.source})`);
  
  // If already high quality from Whisper API, apply minimal enhancement
  if (transcript.source === 'whisper-api' && transcript.quality === 'high') {
    const lightlyEnhanced = await applyLightEnhancement(transcript);
    console.log(`✅ Light enhancement applied to high-quality Whisper transcript`);
    return lightlyEnhanced;
  }
  
  // Apply progressive enhancement based on quality level
  let enhancedTranscript = { ...transcript };
  
  // Step 1: Basic punctuation and capitalization
  console.log('📝 Applying basic punctuation enhancement...');
  enhancedTranscript.segments = enhanceBasicPunctuation(transcript.segments);
  enhancementMethods.push('basic-punctuation');
  
  // Step 2: Advanced AI-powered enhancement for medium/low quality
  if (transcript.quality === 'medium' || transcript.quality === 'low') {
    try {
      console.log('🧠 Applying AI-powered quality enhancement...');
      enhancedTranscript = await applyAIEnhancement(enhancedTranscript);
      enhancementMethods.push('ai-enhancement');
    } catch (error) {
      console.warn('AI enhancement failed, falling back to rule-based:', error);
      enhancedTranscript.segments = enhanceAdvancedPunctuation(enhancedTranscript.segments);
      enhancementMethods.push('advanced-rules');
    }
  }
  
  // Step 3: Semantic coherence enhancement
  if (transcript.quality === 'low') {
    console.log('🔗 Applying semantic coherence enhancement...');
    enhancedTranscript.segments = enhanceSemanticCoherence(enhancedTranscript.segments);
    enhancementMethods.push('semantic-coherence');
  }
  
  // Step 4: Final quality assessment and adjustment
  console.log('📊 Calculating quality metrics...');
  const qualityMetrics = await calculateQualityMetrics(enhancedTranscript.segments, transcript);
  
  // Upgrade quality based on enhancement
  if (qualityMetrics.overallScore >= 0.9) {
    enhancedTranscript.quality = 'high';
  } else if (qualityMetrics.overallScore >= 0.7) {
    enhancedTranscript.quality = 'medium';
  }
  
  // Update confidence based on quality metrics
  enhancedTranscript.confidence = Math.min(0.95, (transcript.confidence || 0.7) * qualityMetrics.overallScore);
  
  const processingTime = Date.now() - startTime;
  console.log(`✅ Quality enhancement complete: ${originalQuality} → ${enhancedTranscript.quality} (${processingTime}ms)`);
  console.log(`🎯 Quality score: ${(qualityMetrics.overallScore * 100).toFixed(1)}% | Methods: ${enhancementMethods.join(', ')}`);
  
  return enhancedTranscript;
}

/**
 * PHASE 2B: Light enhancement for high-quality Whisper transcripts
 */
async function applyLightEnhancement(transcript: TranscriptResult): Promise<TranscriptResult> {
  const enhancedSegments = transcript.segments.map(segment => {
    let text = segment.text.trim();
    
    // Fix common Whisper artifacts
    text = text.replace(/\s+/g, ' '); // Multiple spaces
    text = text.replace(/([.!?])\s*([a-z])/g, (match, p1, p2) => p1 + ' ' + p2.toUpperCase()); // Sentence boundaries
    text = text.replace(/\bi\b/g, 'I'); // Lowercase I
    
    // Ensure proper sentence ending
    if (text.length > 0 && !text.match(/[.!?]$/)) {
      // Smart sentence ending detection
      if (text.includes('?')) {
        // Already has question mark
      } else if (text.match(/(wow|amazing|incredible|great|awesome|terrible|horrible|fantastic|excellent)$/i)) {
        text += '!';
      } else {
        text += '.';
      }
    }
    
    return { ...segment, text };
  });
  
  return { ...transcript, segments: enhancedSegments };
}

/**
 * PHASE 2B: AI-powered enhancement using GPT-4
 */
async function applyAIEnhancement(transcript: TranscriptResult): Promise<TranscriptResult> {
  if (!openai) {
    throw new Error('OpenAI API key required for AI enhancement');
  }
  
  // Process segments in chunks to avoid token limits
  const chunkSize = 8;
  const enhancedSegments: TranscriptSegment[] = [...transcript.segments];
  
  for (let i = 0; i < transcript.segments.length; i += chunkSize) {
    const chunk = transcript.segments.slice(i, i + chunkSize);
    const chunkText = chunk.map((seg, idx) => `[${i + idx}] ${seg.text}`).join('\n');
    
    try {
      console.log(`🧠 Processing AI enhancement chunk ${Math.floor(i/chunkSize) + 1}/${Math.ceil(transcript.segments.length/chunkSize)}`);
      
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `You are the world's best transcript enhancer. Transform raw speech-to-text into perfect, AI-ready content.

ENHANCE FOR:
1. Perfect punctuation (periods, commas, question marks, exclamation points)
2. Proper capitalization and grammar
3. Natural reading flow
4. Semantic AI matching optimization
5. Professional clarity

PRESERVE:
- Original meaning and intent
- Segment numbering [X]
- Timing and structure
- No content addition/removal

FORMAT: [segment_number] enhanced_text

Make this transcript PERFECT for AI semantic analysis!`
          },
          {
            role: 'user',
            content: `Transform this transcript chunk into perfection:\n\n${chunkText}`
          }
        ],
        temperature: 0.1, // Low temperature for consistency
        max_tokens: 2000
      });
      
      const enhancedText = completion.choices[0]?.message?.content || '';
      
      // Parse the enhanced response
      const enhancedLines = enhancedText.split('\n').filter(line => line.trim());
      
      for (const line of enhancedLines) {
        const match = line.match(/\[(\d+)\]\s*(.+)/);
        if (match) {
          const segmentIndex = parseInt(match[1]);
          const enhancedTextContent = match[2].trim();
          
          if (segmentIndex >= i && segmentIndex < i + chunkSize && segmentIndex < enhancedSegments.length) {
            enhancedSegments[segmentIndex] = {
              ...enhancedSegments[segmentIndex],
              text: enhancedTextContent
            };
          }
        }
      }
      
      // Rate limiting delay
      await sleep(1000);
      
    } catch (error) {
      console.warn(`GPT-4 enhancement failed for chunk ${i}-${i + chunkSize}:`, error);
      // Continue with original segments for failed chunks
    }
  }
  
  return {
    ...transcript,
    segments: enhancedSegments,
    source: 'ai-enhanced'
  };
}

/**
 * PHASE 2B: Enhanced basic punctuation (bulletproof rules)
 */
export function enhanceBasicPunctuation(segments: TranscriptSegment[]): TranscriptSegment[] {
  return segments.map(segment => {
    let text = segment.text.trim();
    
    // Basic cleanup
    text = text.replace(/\s+/g, ' '); // Multiple spaces
    text = text.replace(/([.!?])\s*([a-z])/g, (match, p1, p2) => p1 + ' ' + p2.toUpperCase());
    
    // Capitalize first letter
    if (text.length > 0) {
      text = text.charAt(0).toUpperCase() + text.slice(1);
    }
    
    // Common contractions and abbreviations (bulletproof)
    const contractions: Array<[RegExp, string]> = [
      [/\bi\b/g, 'I'],
      [/\bi'm\b/gi, "I'm"],
      [/\bi'll\b/gi, "I'll"],
      [/\bi've\b/gi, "I've"],
      [/\bwe're\b/gi, "we're"],
      [/\byou're\b/gi, "you're"],
      [/\bthey're\b/gi, "they're"],
      [/\bcan't\b/gi, "can't"],
      [/\bwon't\b/gi, "won't"],
      [/\bdon't\b/gi, "don't"],
      [/\bdoesn't\b/gi, "doesn't"],
      [/\bwouldn't\b/gi, "wouldn't"],
      [/\bshouldn't\b/gi, "shouldn't"],
      [/\bcouldn't\b/gi, "couldn't"],
      [/\bwasn't\b/gi, "wasn't"],
      [/\bweren't\b/gi, "weren't"],
      [/\bisn't\b/gi, "isn't"],
      [/\baren't\b/gi, "aren't"],
      [/\bhasn't\b/gi, "hasn't"],
      [/\bhaven't\b/gi, "haven't"]
    ];
    
    contractions.forEach(([pattern, replacement]) => {
      text = text.replace(pattern, replacement);
    });
    
    // Smart punctuation based on content
    if (text.length > 0 && !text.match(/[.!?]$/)) {
      if (text.match(/\b(what|when|where|who|why|how|is|are|can|will|would|could|should)\b.*$/i)) {
        text += '?';
      } else if (text.match(/\b(wow|amazing|incredible|great|awesome|terrible|horrible|fantastic|excellent|unbelievable)\b.*$/i)) {
        text += '!';
      } else {
        text += '.';
      }
    }
    
    return { ...segment, text };
  });
}

/**
 * PHASE 2B: Advanced punctuation enhancement
 */
function enhanceAdvancedPunctuation(segments: TranscriptSegment[]): TranscriptSegment[] {
  const enhancedSegments = enhanceBasicPunctuation(segments);
  
  return enhancedSegments.map((segment) => {
    let text = segment.text;
    
    // Advanced punctuation patterns
    
    // Transition words get commas
    const transitions = [
      'however', 'therefore', 'meanwhile', 'furthermore', 'moreover',
      'nevertheless', 'consequently', 'additionally', 'similarly'
    ];
    
    transitions.forEach(transition => {
      const regex = new RegExp(`\\b${transition}\\b`, 'gi');
      text = text.replace(regex, `, ${transition},`);
    });
    
    // Coordinating conjunctions
    text = text.replace(/\b(and|but|or|so)\s+/gi, (match, conjunction) => `, ${conjunction.toLowerCase()} `);
    
    // Question patterns
    text = text.replace(/\b(what do you think|don't you think|isn't it|right|correct)\s*\.$/gi, (match) => match.replace('.', '?'));
    
    // Exclamation patterns
    text = text.replace(/\b(exactly|absolutely|definitely|certainly|of course|no way|come on)\s*\.$/gi, (match) => match.replace('.', '!'));
    
    // List indicators
    text = text.replace(/\b(first|second|third|finally|lastly|next|then)\b/gi, (match) => match + ',');
    
    // Clean up double punctuation
    text = text.replace(/[.!?]{2,}/g, '.');
    text = text.replace(/,{2,}/g, ',');
    text = text.replace(/\s*,\s*,\s*/g, ', ');
    text = text.replace(/\s+/g, ' ').trim();
    
    return { ...segment, text };
  });
}

/**
 * PHASE 2B: Semantic coherence enhancement
 */
function enhanceSemanticCoherence(segments: TranscriptSegment[]): TranscriptSegment[] {
  return segments.map((segment, index) => {
    let text = segment.text;
    
    // Common speech-to-text misheard words (bulletproof corrections)
    const corrections: Array<[RegExp, string]> = [
      [/\btheir\s+our\b/gi, 'there are'],
      [/\byour\s+are\b/gi, 'you are'],
      [/\bits\s+a\b/gi, "it's a"],
      [/\blets\s+/gi, "let's "],
      [/\bwere\s+going\s+to\b/gi, "we're going to"],
      [/\btheir\s+going\s+to\b/gi, "they're going to"],
      [/\byour\s+going\s+to\b/gi, "you're going to"],
      [/\bto\s+be\s+honest\b/gi, "to be honest,"],
      [/\bin\s+order\s+to\b/gi, "in order to"],
      [/\bas\s+well\s+as\b/gi, "as well as"],
      [/\bkind\s+of\b/gi, "kind of"],
      [/\bsort\s+of\b/gi, "sort of"],
      [/\ba\s+lot\s+of\b/gi, "a lot of"],
      [/\bin\s+terms\s+of\b/gi, "in terms of"]
    ];
    
    corrections.forEach(([pattern, replacement]) => {
      text = text.replace(pattern, replacement);
    });
    
    // Fix sentence fragments by looking at context
    if (index > 0 && text.length < 15 && !text.match(/^(yes|no|ok|okay|right|exactly|sure|maybe|perhaps)\.?$/i)) {
      const prevSegment = segments[index - 1];
      if (prevSegment && prevSegment.text.length > 10) {
        // This might be a continuation - make lowercase
        text = text.replace(/^([A-Z])/, (match, letter) => letter.toLowerCase());
      }
    }
    
    return { ...segment, text };
  });
}

/**
 * PHASE 2B: Advanced quality metrics calculation
 */
async function calculateQualityMetrics(segments: TranscriptSegment[], originalTranscript: TranscriptResult): Promise<QualityMetrics> {
  const text = segments.map(s => s.text).join(' ');
  
  console.log('📊 Calculating comprehensive quality metrics...');
  
  // Calculate individual metrics
  const punctuationScore = calculatePunctuationScore(text);
  const grammarScore = calculateGrammarScore(text);
  const coherenceScore = calculateCoherenceScore(segments);
  const confidenceScore = getSourceConfidenceScore(originalTranscript.source);
  const readabilityScore = calculateReadabilityScore(text);
  
  // Weighted overall score
  const overallScore = (
    punctuationScore * 0.25 +
    grammarScore * 0.25 +
    coherenceScore * 0.20 +
    confidenceScore * 0.20 +
    readabilityScore * 0.10
  );
  
  console.log(`📈 Quality Metrics:
    📝 Punctuation: ${(punctuationScore * 100).toFixed(1)}%
    📚 Grammar: ${(grammarScore * 100).toFixed(1)}%
    🔗 Coherence: ${(coherenceScore * 100).toFixed(1)}%
    🎯 Confidence: ${(confidenceScore * 100).toFixed(1)}%
    📖 Readability: ${(readabilityScore * 100).toFixed(1)}%
    🏆 Overall: ${(overallScore * 100).toFixed(1)}%`);
  
  return {
    overallScore,
    punctuationScore,
    grammarScore,
    coherenceScore,
    confidenceScore,
    readabilityScore,
    aiEnhanced: originalTranscript.source === 'whisper-api',
    enhancementMethods: ['comprehensive-analysis']
  };
}

/**
 * Calculate punctuation quality score
 */
function calculatePunctuationScore(text: string): number {
  let score = 0;
  const maxScore = 100;
  
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const totalSentences = sentences.length;
  
  if (totalSentences === 0) return 0;
  
  // Sentence ending punctuation (30 points)
  const properEndings = (text.match(/[.!?]/g) || []).length;
  score += (properEndings / totalSentences) * 30;
  
  // Comma usage (25 points)
  const commas = (text.match(/,/g) || []).length;
  const words = text.split(/\s+/).length;
  const commaRatio = commas / words;
  
  if (commaRatio > 0.02 && commaRatio < 0.1) {
    score += 25; // Good comma usage
  } else if (commaRatio <= 0.02) {
    score += 15; // Some comma usage
  }
  
  // Proper capitalization (25 points)
  const capitalizedSentences = sentences.filter(s => s.trim().match(/^[A-Z]/)).length;
  score += (capitalizedSentences / totalSentences) * 25;
  
  // Contractions (20 points)
  const contractions = (text.match(/\b\w+'\w+\b/g) || []).length;
  if (contractions > 0) {
    score += 20;
  }
  
  return Math.min(1, score / maxScore);
}

/**
 * Calculate grammar quality score
 */
function calculateGrammarScore(text: string): number {
  let score = 0;
  const maxScore = 100;
  
  // Subject-verb agreement (35 points)
  const agreements = [
    /\bI am\b/gi, /\bhe is\b/gi, /\bshe is\b/gi, /\bit is\b/gi,
    /\bwe are\b/gi, /\bthey are\b/gi, /\byou are\b/gi
  ];
  
  let agreementCount = 0;
  agreements.forEach(pattern => {
    if (pattern.test(text)) agreementCount++;
  });
  
  score += Math.min(35, agreementCount * 5);
  
  // Proper article usage (30 points)
  const articles = (text.match(/\b(a|an|the)\s+\w+/gi) || []).length;
  const words = text.split(/\s+/).length;
  if (articles > 0 && articles / words < 0.15) {
    score += 30;
  }
  
  // Common error avoidance (35 points)
  const commonErrors = [
    /\bthere\s+is\s+are\b/gi,
    /\byour\s+are\b/gi,
    /\bits\s+are\b/gi,
    /\bto\s+much\b/gi,
    /\bwere\s+very\b/gi,
    /\bshould\s+of\b/gi,
    /\bcould\s+of\b/gi,
    /\bwould\s+of\b/gi
  ];
  
  let errorCount = 0;
  commonErrors.forEach(pattern => {
    errorCount += (text.match(pattern) || []).length;
  });
  
  score += Math.max(0, 35 - errorCount * 7);
  
  return Math.min(1, score / maxScore);
}

/**
 * Calculate coherence score
 */
function calculateCoherenceScore(segments: TranscriptSegment[]): number {
  if (segments.length === 0) return 0;
  
  let score = 0;
  
  // Segment length distribution (25%)
  const avgLength = segments.reduce((sum, seg) => sum + seg.text.length, 0) / segments.length;
  if (avgLength > 20 && avgLength < 150) {
    score += 25;
  } else if (avgLength > 10 && avgLength < 200) {
    score += 15;
  }
  
  // Transition words presence (25%)
  const transitions = [
    'however', 'therefore', 'meanwhile', 'furthermore', 'moreover',
    'nevertheless', 'consequently', 'additionally', 'similarly',
    'for example', 'in fact', 'on the other hand', 'in conclusion'
  ];
  
  const fullText = segments.map(s => s.text).join(' ').toLowerCase();
  const transitionCount = transitions.filter(t => fullText.includes(t)).length;
  score += Math.min(25, transitionCount * 4);
  
  // Flow between segments (25%)
  let flowScore = 0;
  for (let i = 1; i < segments.length; i++) {
    const prev = segments[i - 1].text.toLowerCase();
    const curr = segments[i].text.toLowerCase();
    
    const prevWords = new Set(prev.split(/\W+/).filter(w => w.length > 3));
    const currWords = new Set(curr.split(/\W+/).filter(w => w.length > 3));
    
    const overlap = Array.from(prevWords).filter(w => currWords.has(w)).length;
    if (overlap > 0) flowScore++;
  }
  
  score += (flowScore / Math.max(1, segments.length - 1)) * 25;
  
  // Consistency (25%)
  const firstPerson = (fullText.match(/\b(i|me|my|mine)\b/gi) || []).length;
  const thirdPerson = (fullText.match(/\b(he|she|it|they|them)\b/gi) || []).length;
  
  if (firstPerson > thirdPerson * 2 || thirdPerson > firstPerson * 2) {
    score += 15; // Consistent perspective
  }
  
  score += 10; // Base coherence points
  
  return Math.min(1, score / 100);
}

/**
 * Get confidence score based on transcript source
 */
function getSourceConfidenceScore(source: TranscriptResult['source']): number {
  switch (source) {
    case 'whisper-api': return 0.95;
    case 'ai-enhanced': return 0.92;
    case 'whisper-local': return 0.90;
    case 'youtube-api': return 0.85;
    case 'youtube-transcript': return 0.75;
    case 'vimeo-captions': return 0.80;
    case 'auto-generated': return 0.60;
    case 'direct-file': return 0.70;
    case 'google-video-intelligence': return 0.85;
    default: return 0.50;
  }
}

/**
 * Calculate readability score using Flesch Reading Ease
 */
function calculateReadabilityScore(text: string): number {
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  
  if (words.length === 0 || sentences.length === 0) return 0;
  
  const avgWordsPerSentence = words.length / sentences.length;
  
  // Simplified syllable counting
  const avgSyllables = words.reduce((sum, word) => {
    const syllableCount = Math.max(1, word.toLowerCase().replace(/[^aeiou]/g, '').length);
    return sum + syllableCount;
  }, 0) / words.length;
  
  // Flesch Reading Ease formula
  const fleschScore = 206.835 - (1.015 * avgWordsPerSentence) - (84.6 * avgSyllables);
  
  // Convert to 0-1 scale (60+ is good readability)
  return Math.max(0, Math.min(1, (fleschScore + 100) / 200));
}

/**
 * Utility function for delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Export quality assessment function
 */
export async function assessTranscriptQuality(transcript: TranscriptResult): Promise<QualityMetrics> {
  return await calculateQualityMetrics(transcript.segments, transcript);
} 