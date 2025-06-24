'use client';

import { useState } from 'react';
import { Upload, AlertCircle, CheckCircle, ExternalLink, FileText } from 'lucide-react';

export default function YouTubeCookieUpload() {
  const [cookieText, setCookieText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [showInstructions, setShowInstructions] = useState(true);

  const handleSubmit = async () => {
    if (!cookieText.trim()) {
      setError('Please paste your cookies');
      return;
    }

    // Basic validation
    if (!cookieText.includes('.youtube.com') || !cookieText.includes('TRUE')) {
      setError('Invalid cookie format. Make sure you exported cookies in Netscape format.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/youtube/cookies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cookies: cookieText })
      });

      const data = await response.json();

      if (data.success) {
        setSuccess(true);
        setCookieText('');
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      } else {
        setError(data.error || 'Failed to save cookies');
      }
    } catch (error) {
      setError('Failed to save cookies. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Instructions */}
      {showInstructions && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="space-y-2">
              <h3 className="font-semibold text-blue-900 text-sm">Quick Setup (2 minutes):</h3>
              
              <ol className="list-decimal list-inside space-y-2 text-sm text-blue-800">
                <li>
                  <strong>Install this Chrome extension:</strong>
                  <a
                    href="https://chromewebstore.google.com/detail/get-cookiestxt-clean/ahmnmhfbokciafffnknlekllgcnafnie"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-blue-600 hover:text-blue-700 hover:underline mt-1 ml-4"
                  >
                    <span>Get cookies.txt Clean</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </li>
                
                <li>
                  <strong>Go to YouTube.com</strong> and make sure you're logged in
                </li>
                
                <li>
                  <strong>Click the extension icon</strong> in your browser toolbar
                </li>
                
                <li>
                  <strong>Copy the cookie file in netscape format</strong>
                </li>
                
                <li>
                  <strong>Paste it in the input field below</strong>
                </li>
              </ol>

              <button
                onClick={() => setShowInstructions(false)}
                className="text-xs text-blue-600 hover:text-blue-700 mt-2"
              >
                Hide instructions
              </button>
            </div>
          </div>
        </div>
      )}

      {!showInstructions && (
        <button
          onClick={() => setShowInstructions(true)}
          className="text-sm text-blue-600 hover:text-blue-700"
        >
          Show instructions
        </button>
      )}

      {/* Cookie Input */}
      <div className="space-y-3">
        <label className="block text-sm font-medium text-gray-700">
          Paste your YouTube cookies:
        </label>
        
        <textarea
          value={cookieText}
          onChange={(e) => setCookieText(e.target.value)}
          placeholder={`# Netscape HTTP Cookie File
# This file contains cookies from YouTube
.youtube.com	TRUE	/	TRUE	1234567890	cookie_name	cookie_value
...`}
          className="w-full h-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-xs resize-none"
          spellCheck={false}
        />

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-2">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {success && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-2">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <p className="text-sm text-green-700">Cookies saved successfully! Redirecting...</p>
            </div>
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={loading || !cookieText.trim()}
          className="w-full bg-blue-600 text-white rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <Upload className="w-4 h-4 animate-pulse" />
              Saving cookies...
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <Upload className="w-4 h-4" />
              Upload Cookies
            </span>
          )}
        </button>
      </div>

      {/* Privacy Note */}
      <div className="bg-gray-50 rounded-lg p-3">
        <div className="flex gap-2">
          <FileText className="w-4 h-4 text-gray-600 flex-shrink-0 mt-0.5" />
          <div className="space-y-1 text-xs text-gray-600">
            <p className="font-medium">Note:</p>
            <ul className="list-disc list-inside space-y-0.5">
              <li>Cookies expire after 30-60 days</li>
              <li>Your data stays on our secure servers</li>
              <li>Never share your cookie file</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
} 