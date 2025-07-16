'use client';

import { useState } from 'react';

export interface ModelSettings {
  model: 'claude-4-opus' | 'claude-4-sonnet';
  thinkingEnabled: boolean;
  tokenUsage: 'low' | 'medium' | 'high';
}

interface ModelSelectorProps {
  onModelChange: (settings: ModelSettings) => void;
}

export default function ModelSelector({ onModelChange }: ModelSelectorProps) {
  const [settings, setSettings] = useState<ModelSettings>({
    model: 'claude-4-sonnet',
    thinkingEnabled: false,
    tokenUsage: 'medium'
  });

  const handleChange = (updates: Partial<ModelSettings>) => {
    const newSettings = { ...settings, ...updates };
    setSettings(newSettings);
    onModelChange(newSettings);
  };

  return (
    <div className="bg-gray-800/50 rounded-lg p-4 space-y-4">
      <h3 className="text-sm font-medium text-gray-300">AI Settings</h3>
      
      {/* Model Selection */}
      <div>
        <label className="block text-xs text-gray-400 mb-1">Model</label>
        <select 
          value={settings.model}
          onChange={(e) => handleChange({ model: e.target.value as ModelSettings['model'] })}
          className="w-full bg-gray-700 text-white text-sm rounded px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="claude-4-sonnet">Claude 4 Sonnet (Fast)</option>
          <option value="claude-4-opus">Claude 4 Opus (Best Quality, 5x cost)</option>
        </select>
      </div>

      {/* Thinking Mode */}
      <div className="flex items-center space-x-2">
        <input
          type="checkbox"
          id="thinking-mode"
          checked={settings.thinkingEnabled}
          onChange={(e) => handleChange({ thinkingEnabled: e.target.checked })}
          className="rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-500"
        />
        <label htmlFor="thinking-mode" className="text-sm text-gray-300">
          Enable thinking mode <span className="text-xs text-gray-500">(deeper analysis)</span>
        </label>
      </div>

      {/* Token Usage */}
      <div>
        <label className="block text-xs text-gray-400 mb-1">Token Usage</label>
        <div className="flex space-x-2">
          <button
            onClick={() => handleChange({ tokenUsage: 'low' })}
            className={`flex-1 text-xs py-1 px-2 rounded ${
              settings.tokenUsage === 'low' 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Low
          </button>
          <button
            onClick={() => handleChange({ tokenUsage: 'medium' })}
            className={`flex-1 text-xs py-1 px-2 rounded ${
              settings.tokenUsage === 'medium' 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Medium
          </button>
          <button
            onClick={() => handleChange({ tokenUsage: 'high' })}
            className={`flex-1 text-xs py-1 px-2 rounded ${
              settings.tokenUsage === 'high' 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            High
          </button>
        </div>
      </div>

      {/* Cost Indicator */}
      <div className="text-xs text-gray-500">
        {settings.model === 'claude-4-opus' && (
          <span className="text-yellow-500">⚡ 5x higher cost for premium quality</span>
        )}
        {settings.model === 'claude-4-sonnet' && (
          <span>✓ Balanced performance</span>
        )}
      </div>
    </div>
  );
} 