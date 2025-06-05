'use client';

import { useEffect, useState } from 'react';

interface LoadingStateProps {
  status?: string;
  progress?: number;
  currentVideo?: number;
  totalVideos?: number;
}

export default function LoadingState({ 
  status = 'Processing your content...', 
  progress = 0,
  currentVideo,
  totalVideos 
}: LoadingStateProps) {
  const [dots, setDots] = useState('');
  
  useEffect(() => {
    const interval = setInterval(() => {
      setDots(prev => prev.length >= 3 ? '' : prev + '.');
    }, 500);
    
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="mt-12">
      <div className="max-w-2xl mx-auto">
        {/* Main Loading Card */}
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl p-8 border border-gray-700 shadow-2xl">
          {/* Animated Icon */}
          <div className="flex justify-center mb-6">
            <div className="relative">
              <div className="w-20 h-20 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 animate-spin" 
                   style={{ animationDuration: '3s' }}>
                <div className="absolute inset-2 bg-gray-900 rounded-full"></div>
              </div>
              <div className="absolute inset-0 flex items-center justify-center">
                <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" 
                        d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>
            </div>
          </div>
          
          {/* Status Text */}
          <h3 className="text-xl font-semibold text-white text-center mb-2">
            {status}{dots}
          </h3>
          
          {/* Progress Bar */}
          {progress > 0 && (
            <div className="mt-6 mb-4">
              <div className="bg-gray-700 rounded-full h-2 overflow-hidden">
                <div 
                  className="bg-gradient-to-r from-blue-500 to-purple-500 h-full transition-all duration-500 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-center text-sm text-gray-400 mt-2">{Math.round(progress)}% complete</p>
            </div>
          )}
          
          {/* Current Video Info */}
          {currentVideo && totalVideos && (
            <div className="mt-6 p-4 bg-gray-900/50 rounded-lg">
              <p className="text-sm text-gray-400 text-center">
                Processing video {currentVideo} of {totalVideos}
              </p>
            </div>
          )}
          
          {/* Processing Steps */}
          <div className="mt-6 space-y-3">
            <ProcessingStep 
              icon="🎬" 
              text="Extracting audio from videos" 
              active={progress < 33} 
              completed={progress >= 33} 
            />
            <ProcessingStep 
              icon="🎙️" 
              text="Transcribing with AI (Whisper)" 
              active={progress >= 33 && progress < 66} 
              completed={progress >= 66} 
            />
            <ProcessingStep 
              icon="🔍" 
              text="Finding perfect matches" 
              active={progress >= 66 && progress < 100} 
              completed={progress >= 100} 
            />
          </div>
          
          {/* Tips */}
          <div className="mt-8 p-4 bg-blue-900/20 rounded-lg border border-blue-800/30">
            <p className="text-xs text-blue-300 text-center">
              💡 Tip: Whisper transcription provides the highest quality results with proper punctuation
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProcessingStep({ icon, text, active, completed }: { 
  icon: string; 
  text: string; 
  active: boolean; 
  completed: boolean; 
}) {
  return (
    <div className={`flex items-center gap-3 transition-all duration-300 ${
      active ? 'scale-105' : ''
    }`}>
      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm
        ${completed ? 'bg-green-500/20 text-green-400' : 
          active ? 'bg-blue-500/20 text-blue-400 animate-pulse' : 
          'bg-gray-700/50 text-gray-500'}`}>
        {completed ? '✓' : icon}
      </div>
      <p className={`text-sm ${
        completed ? 'text-green-400' : 
        active ? 'text-white' : 
        'text-gray-500'
      }`}>
        {text}
      </p>
      {active && (
        <div className="ml-auto">
          <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      )}
    </div>
  );
} 