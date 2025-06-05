'use client';

import { useState } from 'react';

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
  matchedTweet?: string;
}

interface VideoResultProps {
  clip: VideoClip;
}

export default function VideoResult({ clip }: VideoResultProps) {
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [copied, setCopied] = useState(false);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Extract YouTube video ID from URL if needed
  const getYouTubeId = (url: string): string => {
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/);
      return match ? match[1] : clip.videoId;
    }
    return clip.videoId;
  };

  const videoId = getYouTubeId(clip.videoId);

  const handleDownload = async () => {
    setDownloading(true);
    setDownloadError(null);

    try {
      const response = await fetch('/api/download-clip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoUrl: clip.videoId,
          startTime: clip.startTime,
          endTime: clip.endTime,
          tweet: clip.matchedTweet
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Download failed');
      }

      // Get the blob from response
      const blob = await response.blob();
      
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      // Extract filename from Content-Disposition header or create one
      const contentDisposition = response.headers.get('Content-Disposition');
      const filenameMatch = contentDisposition?.match(/filename="(.+)"/);
      const filename = filenameMatch ? filenameMatch[1] : `clip_${Date.now()}.mp4`;
      
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      
      // Cleanup
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : 'Download failed');
    } finally {
      setDownloading(false);
    }
  };

  const copyTimestamp = () => {
    const timestamp = `${formatTime(clip.startTime)} - ${formatTime(clip.endTime)}`;
    navigator.clipboard.writeText(timestamp);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getMethodBadge = () => {
    switch (clip.matchMethod) {
      case 'semantic':
        return { icon: '🧠', text: 'AI Match', color: 'bg-purple-500/20 text-purple-300 border-purple-500/30' };
      case 'phrase':
        return { icon: '📝', text: 'Phrase Match', color: 'bg-blue-500/20 text-blue-300 border-blue-500/30' };
      case 'keyword':
        return { icon: '🔍', text: 'Keyword', color: 'bg-green-500/20 text-green-300 border-green-500/30' };
    }
  };

  const methodBadge = getMethodBadge();

  return (
    <div className="group bg-gray-800/30 rounded-xl p-4 border border-gray-700 hover:border-gray-600 transition-all duration-300">
      {/* YouTube Embed Preview */}
      {showPreview && (
        <div className="mb-4 aspect-video rounded-lg overflow-hidden">
          <iframe
            width="100%"
            height="100%"
            src={`https://www.youtube.com/embed/${videoId}?start=${Math.floor(clip.startTime)}&end=${Math.floor(clip.endTime)}&autoplay=1`}
            title={clip.title}
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      )}

      <div className="flex gap-4">
        {/* Thumbnail with Preview Toggle */}
        <div className="relative flex-shrink-0 group/thumb">
          <img
            src={`https://img.youtube.com/vi/${videoId}/mqdefault.jpg`}
            alt={clip.title}
            className="w-40 h-24 object-cover rounded-lg cursor-pointer"
            onClick={() => setShowPreview(!showPreview)}
          />
          <div 
            className="absolute inset-0 bg-black/50 rounded-lg opacity-0 group-hover/thumb:opacity-100 transition-opacity duration-200 flex items-center justify-center cursor-pointer"
            onClick={() => setShowPreview(!showPreview)}
          >
            <div className="w-12 h-12 bg-red-600 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-white ml-1" fill="currentColor" viewBox="0 0 20 20">
                <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
              </svg>
            </div>
          </div>
          
          {/* Duration Badge */}
          <div className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-2 py-1 rounded">
            {clip.clipDuration}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Title */}
          <h4 className="font-medium text-white text-sm line-clamp-1">
            AI Matched Clip
          </h4>
          
          {/* Badges */}
          <div className="flex flex-wrap gap-2 mt-2">
            {/* Match Method Badge */}
            <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border ${methodBadge.color}`}>
              <span>{methodBadge.icon}</span>
              <span>{methodBadge.text}</span>
            </span>

            {/* Confidence Score */}
            <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-gray-700/50 text-gray-300">
              <span className="font-mono">{(clip.confidence * 100).toFixed(0)}%</span>
              <span className="text-gray-500">match</span>
            </span>
          </div>

          {/* Transcript Preview */}
          <div className="mt-3 p-3 bg-gray-900/50 rounded-lg border border-gray-700/50">
            <p className="text-xs text-gray-300 line-clamp-2 italic">
              "{clip.transcriptText}"
            </p>
          </div>

          {/* Timestamp and Actions */}
          <div className="flex items-center justify-between mt-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">
                {formatTime(clip.startTime)} - {formatTime(clip.endTime)}
              </span>
              <button
                onClick={copyTimestamp}
                className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                title="Copy timestamp"
              >
                {copied ? '✓ Copied' : '📋'}
              </button>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
              {/* Preview Toggle */}
              <button
                onClick={() => setShowPreview(!showPreview)}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-700 hover:bg-gray-600 text-white transition-all"
              >
                {showPreview ? 'Hide' : 'Preview'}
              </button>

              {/* Download Button */}
              <button
                onClick={handleDownload}
                disabled={downloading}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-200 ${
                  downloading 
                    ? 'bg-gray-700 text-gray-400 cursor-not-allowed' 
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
              >
                {downloading ? 'Downloading...' : 'Download Clip'}
              </button>
            </div>
          </div>

          {/* Error Message */}
          {downloadError && (
            <p className="mt-2 text-xs text-red-400 bg-red-900/20 px-2 py-1 rounded">
              {downloadError}
            </p>
          )}
        </div>
      </div>
    </div>
  );
} 