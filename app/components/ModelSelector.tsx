'use client';

import { useState, useEffect, useRef } from 'react';

export interface ModelSettings {
  model: 'claude-opus-4-20250514' | 'claude-sonnet-4-20250514';
  thinkingEnabled: boolean;
  tokenUsage: 'low' | 'medium' | 'high';
}

interface ModelSelectorProps {
  onSettingsChange: (settings: ModelSettings) => void;
  disabled?: boolean;
}

export default function ModelSelector({ onSettingsChange, disabled = false }: ModelSelectorProps) {
  const [model, setModel] = useState<ModelSettings['model']>('claude-sonnet-4-20250514');
  const [thinkingEnabled, setThinkingEnabled] = useState(false);
  const [tokenUsage, setTokenUsage] = useState<ModelSettings['tokenUsage']>('medium');
  const [showModelMenu, setShowModelMenu] = useState(false);
  const modelMenuRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modelMenuRef.current && !modelMenuRef.current.contains(event.target as Node)) {
        setShowModelMenu(false);
      }
    };

    if (showModelMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showModelMenu]);

  // Notify parent component of settings changes
  useEffect(() => {
    onSettingsChange({
      model,
      thinkingEnabled,
      tokenUsage
    });
  }, [model, thinkingEnabled, tokenUsage, onSettingsChange]);

  const modelDisplayNames = {
    'claude-opus-4-20250514': 'Claude Opus 4',
    'claude-sonnet-4-20250514': 'Claude Sonnet 4'
  };

  const tokenUsageDescriptions = {
    low: 'Fast & Economical',
    medium: 'Balanced Quality',
    high: 'Maximum Quality'
  };

  return (
    <div className="w-full max-w-4xl mx-auto bg-gray-800/30 rounded-lg p-5 border border-gray-700/50">
      <h3 className="text-base font-semibold text-white mb-4">AI Model Settings</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Model Selection */}
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Model</label>
          <div className="relative" ref={modelMenuRef}>
            <button
              onClick={() => setShowModelMenu(!showModelMenu)}
              disabled={disabled}
              className={`w-full px-3 py-2 rounded-lg text-sm transition-all duration-200 flex items-center justify-between ${
                disabled
                  ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                  : 'bg-gray-700 hover:bg-gray-600 text-white border border-gray-600'
              }`}
            >
              <span className="font-medium">{modelDisplayNames[model]}</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            
            {showModelMenu && !disabled && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-lg overflow-hidden z-10">
                <button
                  onClick={() => { setModel('claude-sonnet-4-20250514'); setShowModelMenu(false); }}
                  className={`block w-full px-3 py-2 text-left hover:bg-gray-700 transition-colors text-sm ${
                    model === 'claude-sonnet-4-20250514' ? 'bg-gray-700 text-[#b8a887]' : 'text-white'
                  }`}
                >
                  Claude Sonnet 4
                </button>
                <button
                  onClick={() => { setModel('claude-opus-4-20250514'); setShowModelMenu(false); }}
                  className={`block w-full px-3 py-2 text-left hover:bg-gray-700 transition-colors text-sm ${
                    model === 'claude-opus-4-20250514' ? 'bg-gray-700 text-[#b8a887]' : 'text-white'
                  }`}
                >
                  Claude Opus 4
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Thinking Mode Toggle */}
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Thinking Mode</label>
          <button
            onClick={() => setThinkingEnabled(!thinkingEnabled)}
            disabled={disabled}
            className={`w-full px-3 py-2 rounded-lg text-sm transition-all duration-200 flex items-center justify-center gap-2 ${
              disabled
                ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                : thinkingEnabled
                ? 'bg-[#b8a887] text-[#0e1e2d]'
                : 'bg-gray-700 hover:bg-gray-600 text-white border border-gray-600'
            }`}
          >
            <svg 
              className="w-4 h-4" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth="2" 
                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" 
              />
            </svg>
            <span className="font-medium">{thinkingEnabled ? 'Thinking On' : 'Thinking Off'}</span>
          </button>
        </div>

        {/* Token Usage Selection */}
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Token Usage</label>
          <div className="flex gap-1">
            {(['low', 'medium', 'high'] as const).map((level) => (
              <button
                key={level}
                onClick={() => setTokenUsage(level)}
                disabled={disabled}
                className={`flex-1 px-2 py-2 rounded-lg text-xs font-medium transition-all duration-200 ${
                  disabled
                    ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                    : tokenUsage === level
                    ? 'bg-[#b8a887] text-[#0e1e2d]'
                    : 'bg-gray-700 hover:bg-gray-600 text-white border border-gray-600'
                }`}
                title={tokenUsageDescriptions[level]}
              >
                {level.charAt(0).toUpperCase() + level.slice(1)}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-500 text-center mt-1">
            {tokenUsageDescriptions[tokenUsage]}
          </p>
        </div>
      </div>

      {/* Cost indicator - more subtle */}
      <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
        <span>Estimated cost multiplier:</span>
        <span className={`font-medium ${
          model === 'claude-opus-4-20250514' ? 'text-orange-400' : 'text-green-400'
        }`}>
          {model === 'claude-opus-4-20250514' ? '5x' : '1x'} base cost
          {tokenUsage === 'high' ? ' × 3' : tokenUsage === 'medium' ? ' × 2' : ' × 1'}
        </span>
      </div>
    </div>
  );
} 