'use client';

import { useState } from 'react';

export interface ModelSettings {
  model: 'claude-opus-4-20250514' | 'claude-sonnet-4-20250514';
  thinkingEnabled: boolean;
  tokenUsage: 'low' | 'medium' | 'high';
}

interface ModelSelectorProps {
  onModelChange: (settings: ModelSettings) => void;
  initialSettings?: ModelSettings;
}

export default function ModelSelector({ onModelChange, initialSettings }: ModelSelectorProps) {
  const [settings, setSettings] = useState<ModelSettings>(
    initialSettings || {
      model: 'claude-sonnet-4-20250514',
      thinkingEnabled: false,
      tokenUsage: 'high' // Always use high
    }
  );

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
          <option value="claude-sonnet-4-20250514">Claude Sonnet 4 (Fast)</option>
          <option value="claude-opus-4-20250514">Claude Opus 4 (Best Quality, 5x cost)</option>
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

      {/* Cost Indicator */}
      <div className="text-xs text-gray-500">
        {settings.model === 'claude-opus-4-20250514' && (
          <span className="text-yellow-500">⚡ 5x higher cost for premium quality</span>
        )}
        {settings.model === 'claude-sonnet-4-20250514' && (
          <span>✓ Balanced performance</span>
        )}
      </div>
    </div>
  );
} 