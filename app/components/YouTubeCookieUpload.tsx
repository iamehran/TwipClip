'use client';

import { useState, useRef } from 'react';
import { Upload, AlertCircle, CheckCircle, ExternalLink, FileText } from 'lucide-react';

export default function YouTubeCookieUpload() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [showInstructions, setShowInstructions] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.name.endsWith('.txt')) {
      setError('Please upload a .txt file');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/auth/youtube/upload-cookies', {
        method: 'POST',
        body: formData
      });

      const data = await response.json();

      if (data.success) {
        setSuccess(true);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        // Force a hard refresh to clear any cached auth status
        setTimeout(() => {
          window.location.href = window.location.href; // Force hard refresh
        }, 1500);
      } else {
        setError(data.error || 'Failed to upload cookies');
      }
    } catch (error) {
      setError('Failed to upload cookies. Please try again.');
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
                  <strong>Click "Export" to download cookies.txt</strong>
                </li>
                
                <li>
                  <strong>Upload the cookies.txt file below</strong>
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

      {/* File Upload */}
      <div className="space-y-3">
        <label className="block text-sm font-medium text-gray-700">
          Upload your YouTube cookies file:
        </label>
        
        <div className="relative">
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt"
            onChange={handleFileUpload}
            disabled={loading}
            className="hidden"
            id="cookie-file-input"
          />
          
          <label
            htmlFor="cookie-file-input"
            className={`block w-full border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-gray-400 transition-colors ${
              loading ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            <Upload className="w-8 h-8 mx-auto mb-2 text-gray-400" />
            <p className="text-sm text-gray-600">
              Click to upload cookies.txt file
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Only .txt files are accepted
            </p>
          </label>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-2">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {success && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-2">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <p className="text-sm text-green-700">Cookies uploaded successfully! Redirecting...</p>
            </div>
          </div>
        )}

        {loading && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-2">
            <div className="flex items-center gap-2">
              <Upload className="w-4 h-4 text-blue-600 animate-pulse" />
              <p className="text-sm text-blue-700">Uploading cookies...</p>
            </div>
          </div>
        )}
      </div>

      {/* Privacy Note */}
      <div className="bg-gray-50 rounded-lg p-3">
        <div className="flex gap-2">
          <FileText className="w-4 h-4 text-gray-600 flex-shrink-0 mt-0.5" />
          <div className="space-y-1 text-xs text-gray-600">
            <p className="font-medium">Important:</p>
            <ul className="list-disc list-inside space-y-0.5">
              <li>Your cookies are stored securely per session</li>
              <li>Each user has their own isolated cookie storage</li>
              <li>Cookies expire after 7 days of inactivity</li>
              <li>Never share your cookie file with others</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
} 