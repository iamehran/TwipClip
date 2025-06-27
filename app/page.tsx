'use client';

import { useState } from 'react';
import SearchForm from './components/SearchForm';
import VideoResult from './components/VideoResult';
import LoadingState from './components/LoadingState';
import ErrorDisplay from './components/ErrorDisplay';
import ExportButton from './components/ExportButton';
import YouTubeAuth from './components/YouTubeAuth';
import ThoughtleadrLogo from './components/ThoughtleadrLogo';
import BulkDownloadButton from './components/BulkDownloadButton';
import ModelSelector, { ModelSettings } from './components/ModelSelector';
import { cookies } from 'next/headers';
import { YouTubeAuthConfig } from '../src/lib/youtube-auth-v2';

interface VideoClip {
  videoId: string;
  title: string;
  thumbnail: string;
  startTime: number;
  endTime: number;
  matchScore: number;
  transcriptText: string;
  channelTitle: string;
  clipDuration: string;
  matchMethod: 'semantic' | 'keyword' | 'phrase';
  confidence: number;
  transcriptQuality: 'high' | 'medium' | 'low';
  transcriptSource: string;
  downloadPath: string;
  downloadSuccess: boolean;
}

interface SearchResults {
  [key: string]: {
    tweet: string;
    clips: VideoClip[];
  };
}

export default function Home() {
  const [results, setResults] = useState<SearchResults>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingStatus, setLoadingStatus] = useState('');
  const [lastSearch, setLastSearch] = useState<{ threadContent: string; videoUrls: string[]; modelSettings: ModelSettings } | null>(null);
  const [showSearchForm, setShowSearchForm] = useState(true);
  const [rawMatches, setRawMatches] = useState<any[]>([]); // Store raw matches from API
  const [authConfig, setAuthConfig] = useState<YouTubeAuthConfig | undefined>();
  const [isYouTubeAuthenticated, setIsYouTubeAuthenticated] = useState(false);

  const handleAuthChange = (isAuthenticated: boolean, browser?: string, profile?: string) => {
    setIsYouTubeAuthenticated(isAuthenticated);
    if (isAuthenticated && browser) {
      setAuthConfig({ browser, profile });
    } else {
      setAuthConfig(undefined);
    }
  };

  const handleSearch = async (threadContent: string, videoUrls: string[], forceRefresh: boolean = false, modelSettings: ModelSettings) => {
    console.log('handleSearch called with model settings:', modelSettings);
    setLoading(true);
    setError(null);
    setResults({});
    setStats(null);
    setLoadingProgress(0);
    setLoadingStatus('Initializing...');
    setLastSearch({ threadContent, videoUrls, modelSettings });
    setShowSearchForm(false); // Hide search form when processing starts

    let progressInterval: NodeJS.Timeout | undefined;
    let pollInterval: NodeJS.Timeout | undefined;

    try {
      // No need to parse - send the full thread content
      if (!threadContent.trim()) {
        throw new Error('Please enter some content');
      }

      if (videoUrls.length === 0) {
        throw new Error('Please provide at least one video URL');
      }

      console.log('Sending to process API:', { thread: threadContent, videos: videoUrls, modelSettings });

      // Start with initial progress
      setLoadingStatus('Initializing search...');
      setLoadingProgress(5);

      // First, start the async processing
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 600000); // 10 minute timeout
      
      const startResponse = await fetch('/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          thread: threadContent,
          videos: videoUrls,
          async: true,  // Enable async mode
          modelSettings // Pass model settings to API
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      console.log('Start response status:', startResponse.status);
      
      if (!startResponse.ok) {
        const errorData = await startResponse.json();
        console.error('Start response error:', errorData);
        throw new Error(errorData.error || 'Failed to start processing');
      }

      const startData = await startResponse.json();
      console.log('Start response data:', startData);
      
      // Check if we got immediate results (sync mode)
      if (startData.status === 'completed' && startData.results) {
        console.log('Received immediate results (sync mode)');
        
        // Simulate progress animation for better UX
        const animateProgress = async () => {
          const steps = [
            { progress: 20, status: 'Extracting audio from videos...', delay: 400 },
            { progress: 40, status: 'Transcribing with AI (Whisper)...', delay: 600 },
            { progress: 60, status: 'Analyzing transcripts...', delay: 500 },
            { progress: 80, status: 'Finding perfect matches with Claude AI...', delay: 700 },
            { progress: 95, status: 'Finalizing results...', delay: 400 },
            { progress: 100, status: 'Complete!', delay: 200 }
          ];
          
          for (const step of steps) {
            setLoadingProgress(step.progress);
            setLoadingStatus(step.status);
            await new Promise(resolve => setTimeout(resolve, step.delay));
          }
        };
        
        // Start animation and wait for it to complete
        await animateProgress();
        
        // Process the results after animation
        const data = startData.results;

        // Convert the new format to match the UI expectations
        const formattedResults: SearchResults = {};
        
        // First, initialize all tweets with empty clips arrays
        const tweetTexts = threadContent.split('---').map(t => t.trim()).filter(t => t.length > 0);
        tweetTexts.forEach((text, index) => {
          const tweetKey = `tweet-${index + 1}`;
          formattedResults[tweetKey] = {
            tweet: text,
            clips: []
          };
        });
        
        // Then populate with actual matches
        if (data.matches && data.matches.length > 0) {
          // Filter matches by confidence threshold (75%)
          const highConfidenceMatches = data.matches.filter((match: any) => 
            match.confidence >= 0.75
          );
          
          const lowConfidenceCount = data.matches.length - highConfidenceMatches.length;
          
          if (lowConfidenceCount > 0) {
            setNotification({
              type: 'warning',
              message: `${lowConfidenceCount} match${lowConfidenceCount > 1 ? 'es' : ''} filtered out due to low confidence (<75%). Consider providing more specific content or additional videos.`
            });
          }
          
          highConfidenceMatches.forEach((match: any) => {
            // Find which tweet this match belongs to
            const tweetIndex = tweetTexts.findIndex(text => text === match.tweet);
            if (tweetIndex !== -1) {
              const tweetKey = `tweet-${tweetIndex + 1}`;
              formattedResults[tweetKey].clips.push({
                videoId: match.videoUrl,
                title: 'AI Matched Clip',
                thumbnail: '/default-thumbnail.jpg',
                startTime: match.startTime,
                endTime: match.endTime,
                matchScore: match.confidence || 0,
                transcriptText: match.text || '',
                channelTitle: 'Video',
                clipDuration: `${match.endTime - match.startTime}s`,
                matchMethod: 'semantic' as const,
                confidence: match.confidence || 0,
                transcriptQuality: 'high' as const,
                transcriptSource: 'whisper',
                downloadPath: match.downloadPath,
                downloadSuccess: match.downloadSuccess
              });
            }
          });
        }

        setResults(formattedResults);
        setStats(data.summary || null);
        setRawMatches(data.matches || []); // Store raw matches
        
        // Set loading to false after a small delay to let UI update
        setTimeout(() => {
          setLoading(false);
          setLoadingProgress(0);
          setLoadingStatus('');
        }, 500);
        
        return; // Exit early, no need to poll
      }
      
      const { jobId } = startData;
      if (!jobId) {
        console.error('No job ID received:', startData);
        throw new Error('No job ID received from server');
      }
      
      console.log('Processing started with job ID:', jobId);

      // Now poll for status updates
      let lastProgress = 0;
      pollInterval = setInterval(async () => {
        try {
          console.log('Polling status for job:', jobId);
          const statusResponse = await fetch(`/api/process/status?jobId=${jobId}`);
          const statusData = await statusResponse.json();
          console.log('Status response:', statusData);

          if (statusData.status === 'not_found') {
            clearInterval(pollInterval);
            throw new Error('Processing job not found');
          }

          // Update progress based on actual backend progress
          if (statusData.progress !== undefined) {
            setLoadingProgress(statusData.progress);
            lastProgress = statusData.progress;
          }

          // Update status message from backend
          if (statusData.message) {
            setLoadingStatus(statusData.message);
          }

          // Check if completed
          if (statusData.status === 'completed' && statusData.results) {
            clearInterval(pollInterval);
            clearInterval(progressInterval);
            
            // Process the results
            const data = statusData.results;

      // Convert the new format to match the UI expectations
      const formattedResults: SearchResults = {};
            
            // First, initialize all tweets with empty clips arrays
            const tweetTexts = threadContent.split('---').map(t => t.trim()).filter(t => t.length > 0);
            tweetTexts.forEach((text, index) => {
          const tweetKey = `tweet-${index + 1}`;
            formattedResults[tweetKey] = {
                tweet: text,
              clips: []
            };
            });
            
            // Then populate with actual matches
            if (data.matches && data.matches.length > 0) {
              // Filter matches by confidence threshold (75%)
              const highConfidenceMatches = data.matches.filter((match: any) => 
                match.confidence >= 0.75
              );
              
              const lowConfidenceCount = data.matches.length - highConfidenceMatches.length;
              
              if (lowConfidenceCount > 0) {
                setNotification({
                  type: 'warning',
                  message: `${lowConfidenceCount} match${lowConfidenceCount > 1 ? 'es' : ''} filtered out due to low confidence (<75%). Consider providing more specific content or additional videos.`
                });
              }
              
              highConfidenceMatches.forEach((match: any) => {
                // Find which tweet this match belongs to
                const tweetIndex = tweetTexts.findIndex(text => text === match.tweet);
                if (tweetIndex !== -1) {
                  const tweetKey = `tweet-${tweetIndex + 1}`;
          formattedResults[tweetKey].clips.push({
            videoId: match.videoUrl,
            title: 'AI Matched Clip',
            thumbnail: '/default-thumbnail.jpg',
            startTime: match.startTime,
            endTime: match.endTime,
            matchScore: match.confidence || 0,
            transcriptText: match.text || '',
            channelTitle: 'Video',
            clipDuration: `${match.endTime - match.startTime}s`,
            matchMethod: 'semantic' as const,
            confidence: match.confidence || 0,
            transcriptQuality: 'high' as const,
            transcriptSource: 'whisper',
                                downloadPath: match.downloadPath,
                    downloadSuccess: match.downloadSuccess
                  });
                  }
                }
              });
            }

      setResults(formattedResults);
      setStats(data.summary || null);
            setRawMatches(data.matches || []); // Store raw matches
      
      setLoadingProgress(100);
      setLoadingStatus('Complete!');
            
            // Set loading to false when complete
            setLoading(false);
      
      // Reset progress after a short delay
      setTimeout(() => {
        setLoadingProgress(0);
        setLoadingStatus('');
      }, 1000);
          }

          // Check if failed
          if (statusData.status === 'failed') {
            clearInterval(pollInterval);
            clearInterval(progressInterval);
            setLoading(false); // Set loading to false on failure
            throw new Error(statusData.error || 'Processing failed');
          }

        } catch (pollError) {
          console.error('Polling error:', pollError);
          // Don't throw here, just log and continue polling
        }
      }, 2000); // Poll every 2 seconds

      // Also keep the visual progress animation for better UX
      progressInterval = setInterval(() => {
        setLoadingProgress(prev => {
          // Don't override actual progress from backend
          if (prev < lastProgress) {
            return lastProgress;
          }
          
          // Only animate if we haven't received real progress
          if (prev < 85 && lastProgress < 85) {
            const increment = Math.random() * 2 + 0.5; // 0.5-2.5% increment
            return Math.min(prev + increment, 85);
          }
          return prev;
        });
      }, 1000);

    } catch (err) {
      clearInterval(progressInterval);
      clearInterval(pollInterval);
      
      let errorMessage = 'An error occurred';
      
      if (err instanceof Error) {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
      console.error('Processing error:', err);
      setShowSearchForm(true); // Show form again on error
      setLoading(false); // Set loading to false on error
    }
  };

  const totalClips = Object.values(results).reduce((sum, r) => sum + r.clips.length, 0);
  const totalLowConfidenceMatches = rawMatches.filter(m => m.confidence < 0.8).length;

  return (
    <main className="min-h-screen bg-[#0e1e2d]">
      {/* Top Navigation Bar */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-[#0e1e2d]/95 backdrop-blur-md border-b border-gray-800">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            {/* Logo and Title */}
            <div className="flex items-center gap-2 sm:gap-3">
              <h1 className="text-xl sm:text-2xl font-bold text-[#b8a887]">
                TwipClip
              </h1>
              <span className="hidden sm:inline text-gray-500 text-sm">by</span>
              <ThoughtleadrLogo className="w-6 h-6 sm:w-7 sm:h-7" />
            </div>
            
            {/* Authentication Section */}
            <YouTubeAuth onAuthChange={(authenticated) => setIsYouTubeAuthenticated(authenticated)} />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 pt-24 pb-8">
        <div className="max-w-7xl mx-auto">
          {/* Header - Only show when search form is visible */}
          {showSearchForm && (
            <div className="text-center mb-8">
              <h2 className="text-2xl sm:text-3xl md:text-4xl tracking-wide font-bold mx-auto max-w-4xl px-4">
                <span className="text-white">Get </span>
                <span className="text-[#b8a887]">Perfect Video Clips</span>
                <span className="text-white"> For Your Thread</span>
              </h2>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 sm:gap-x-6 gap-y-2 text-xs sm:text-sm text-gray-400 px-2">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-[#b8a887] rounded-full animate-pulse"></span>
                  Enhanced AI Matching
                </span>
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-[#b8a887] rounded-full animate-pulse delay-100"></span>
                  Custom Video Input
                </span>
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-[#b8a887] rounded-full animate-pulse delay-200"></span>
                  Precise Clip Extraction
                </span>
              </div>
            </div>
          )}

          {/* Edit Button - Show when form is hidden */}
          {!showSearchForm && !loading && (
            <div className="mb-6 flex justify-center">
              <button
                onClick={() => setShowSearchForm(true)}
                className="px-6 py-3 bg-[#b8a887] hover:bg-[#a09775] text-[#0e1e2d] rounded-lg font-medium transition-all transform hover:scale-105 flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Edit Search
              </button>
            </div>
          )}

          {/* Search Form - Collapsible */}
          {showSearchForm && (
            <div className="mb-8">
              <SearchForm onSearch={handleSearch} loading={loading} />
            </div>
          )}

          {/* Error Display */}
          {error && (
            <ErrorDisplay 
              error={error} 
              onRetry={lastSearch ? () => handleSearch(lastSearch.threadContent, lastSearch.videoUrls, false, lastSearch.modelSettings) : undefined} 
            />
          )}

          {/* Loading State */}
          {console.log('Loading state check:', { loading, loadingStatus, loadingProgress })}
          {loading && (
            <>
              {console.log('Showing loading state:', { loadingStatus, loadingProgress })}
            <LoadingState 
              status={loadingStatus}
              progress={loadingProgress}
              currentVideo={loadingProgress > 40 ? Math.min(Math.ceil((loadingProgress - 40) / 30 * (lastSearch?.videoUrls.length || 1)), lastSearch?.videoUrls.length || 1) : undefined}
              totalVideos={lastSearch?.videoUrls.length}
            />
            </>
          )}

          {/* Results Summary */}
          {!loading && (totalClips > 0 || totalLowConfidenceMatches > 0) && (
            <div className="mt-8 p-4 sm:p-6 bg-gray-800/30 rounded-lg border border-gray-700/50">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
                <h3 className="text-base sm:text-lg font-semibold text-white">Results Summary</h3>
                <div className="flex flex-col sm:flex-row gap-3">
                  <BulkDownloadButton 
                    matches={rawMatches.filter(m => m.confidence >= 0.8)}
                    authConfig={authConfig}
                    isAuthenticated={isYouTubeAuthenticated}
                  />
                  <ExportButton data={results} />
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 text-center">
                <div>
                  <p className="text-2xl sm:text-3xl font-bold text-[#b8a887]">
                    {Object.keys(results).length}
                  </p>
                  <p className="text-xs sm:text-sm text-gray-400">Tweets Processed</p>
                </div>
                <div>
                  <p className="text-2xl sm:text-3xl font-bold text-[#b8a887]/80">
                    {totalClips}
                  </p>
                  <p className="text-xs sm:text-sm text-gray-400">Perfect Matches</p>
                </div>
                <div>
                  <p className="text-2xl sm:text-3xl font-bold text-[#b8a887]/60">
                    {stats?.videosProcessed || 0}
                  </p>
                  <p className="text-xs sm:text-sm text-gray-400">Videos Analyzed</p>
                </div>
                <div>
                  <p className="text-2xl sm:text-3xl font-bold text-[#b8a887]/40">
                    {stats?.avgConfidence ? `${(stats.avgConfidence * 100).toFixed(0)}%` : '0%'}
                  </p>
                  <p className="text-xs sm:text-sm text-gray-400">Avg Confidence</p>
                </div>
              </div>
              
              {/* Quality Indicator */}
              <div className="mt-4 pt-4 border-t border-gray-700/50">
                <p className="text-xs text-gray-400 text-center">
                  🎯 One perfect clip selected per tweet using {lastSearch?.modelSettings.model === 'claude-opus-4-20250514' ? 'Claude Opus 4' : 'Claude Sonnet 4'}
                  {lastSearch?.modelSettings.thinkingEnabled && ' with thinking mode'}
                </p>
                {totalLowConfidenceMatches > 0 && (
                  <p className="text-xs text-yellow-500 text-center mt-2">
                    ⚠️ {totalLowConfidenceMatches} low-confidence matches (below 80%) were filtered out. Please provide more relevant YouTube videos for better results.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* No High-Confidence Results Message */}
          {!loading && totalClips === 0 && totalLowConfidenceMatches > 0 && (
            <div className="mt-8 p-6 bg-yellow-900/20 rounded-lg border border-yellow-700/50">
              <div className="flex items-start gap-3">
                <svg className="w-6 h-6 text-yellow-500 flex-shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div>
                  <h3 className="text-lg font-semibold text-yellow-500 mb-2">No High-Quality Matches Found</h3>
                  <p className="text-sm text-gray-300 mb-3">
                    We found {totalLowConfidenceMatches} potential matches, but they all had confidence scores below 80%, 
                    indicating they may not be relevant to your thread.
                  </p>
                  <p className="text-sm text-gray-400">
                    <strong>Suggestions:</strong>
                  </p>
                  <ul className="list-disc list-inside text-sm text-gray-400 mt-2 space-y-1">
                    <li>Provide YouTube videos that are more closely related to your thread topics</li>
                    <li>Use videos where the speakers discuss the specific subjects mentioned in your tweets</li>
                    <li>Try videos from the same speakers or events referenced in your thread</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Results Display */}
          {!loading && Object.entries(results).map(([tweetKey, tweetData]) => (
            <div key={tweetKey} className="mt-8">
              <div className="bg-gray-800/30 rounded-lg p-4 sm:p-6 border border-gray-700/50">
                {/* Tweet Header */}
                <div className="flex items-start gap-3 sm:gap-4 mb-4 sm:mb-6">
                  <div className="flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 bg-[#b8a887] rounded-full flex items-center justify-center text-[#0e1e2d] font-bold text-sm sm:text-base">
                    {tweetKey.replace('tweet-', '')}
                  </div>
                  <div className="flex-1">
                    <p className="text-white text-base sm:text-lg leading-relaxed">{tweetData.tweet}</p>
                    <p className="text-xs sm:text-sm text-gray-500 mt-2">
                      {tweetData.clips.length} matching {tweetData.clips.length === 1 ? 'clip' : 'clips'} found
                    </p>
                  </div>
                </div>

                {/* Video Clips */}
                  <div className="grid gap-4">
                    {tweetData.clips.map((clip, index) => (
                      <VideoResult key={`${clip.videoId}-${index}`} clip={clip} />
                    ))}
                  </div>
              </div>
            </div>
          ))}

          {/* Performance Stats */}
          {stats && !loading && (
            <div className="mt-12 p-4 sm:p-6 bg-gray-800/20 rounded-lg border border-gray-700/30">
              <h3 className="text-base sm:text-lg font-semibold text-white mb-4">Performance Statistics</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4 text-xs sm:text-sm">
                <div>
                  <p className="text-gray-400">Processing Time</p>
                  <p className="text-white font-mono">{(stats.processingTimeMs / 1000).toFixed(2)}s</p>
                </div>
                <div>
                  <p className="text-gray-400">Videos Transcribed</p>
                  <p className="text-white font-mono">{stats.videosTranscribed || 0}</p>
                </div>
                <div>
                  <p className="text-gray-400">Total Segments Analyzed</p>
                  <p className="text-white font-mono">{stats.totalSegments || 0}</p>
                </div>
                <div>
                  <p className="text-gray-400">AI Model Used</p>
                  <p className="text-white font-mono">{stats.aiModel || 'Claude 3.7 Sonnet'}</p>
                </div>
                <div>
                  <p className="text-gray-400">Transcription Quality</p>
                  <p className="text-white font-mono">{stats.transcriptionQuality || 'High'}</p>
                </div>
                <div>
                  <p className="text-gray-400">Cache Hit Rate</p>
                  <p className="text-white font-mono">{stats.cacheHitRate || '0%'}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
