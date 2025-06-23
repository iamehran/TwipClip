/**
 * Hybrid Authentication Solution
 * 
 * Run a local auth server that:
 * 1. Extracts cookies from your local browser
 * 2. Provides them to your Railway app via secure API
 * 
 * This gives you the best of both worlds:
 * - Railway for hosting
 * - Local browser for authentication
 */

// LOCAL AUTH SERVER (run on your computer)
// Save as: local-auth-server.js

import express from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import crypto from 'crypto';

const execAsync = promisify(exec);
const app = express();

// Secret key shared with Railway app
const AUTH_SECRET = process.env.AUTH_SECRET || 'your-secret-key';

app.get('/api/cookies/:token', async (req, res) => {
  try {
    // Verify token
    const { token } = req.params;
    const expectedToken = crypto
      .createHash('sha256')
      .update(AUTH_SECRET + new Date().toISOString().slice(0, 10))
      .digest('hex');
    
    if (token !== expectedToken) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Extract cookies from local browser
    const { stdout } = await execAsync(
      'yt-dlp --cookies-from-browser chrome --cookies - --skip-download https://youtube.com'
    );

    // Return cookies
    res.json({
      cookies: Buffer.from(stdout).toString('base64'),
      expires: Date.now() + 24 * 60 * 60 * 1000 // 24 hours
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to extract cookies' });
  }
});

app.listen(3001, () => {
  console.log('Local auth server running on http://localhost:3001');
  console.log('Use ngrok to expose this to your Railway app');
});

// RAILWAY APP SIDE
// Use this in your Railway app:

export class HybridAuthClient {
  private static authServerUrl = process.env.LOCAL_AUTH_SERVER_URL; // Set in Railway
  private static authSecret = process.env.AUTH_SECRET;
  private static cachedCookies: { data: string; expires: number } | null = null;

  static async getCookies(): Promise<string | null> {
    // Check cache
    if (this.cachedCookies && this.cachedCookies.expires > Date.now()) {
      return this.cachedCookies.data;
    }

    if (!this.authServerUrl || !this.authSecret) {
      console.warn('Local auth server not configured');
      return null;
    }

    try {
      // Generate token
      const token = crypto
        .createHash('sha256')
        .update(this.authSecret + new Date().toISOString().slice(0, 10))
        .digest('hex');

      // Fetch cookies from local server
      const response = await fetch(`${this.authServerUrl}/api/cookies/${token}`);
      const data = await response.json();

      if (data.cookies) {
        // Cache the cookies
        this.cachedCookies = {
          data: data.cookies,
          expires: data.expires
        };

        // Save to file for yt-dlp
        const cookieContent = Buffer.from(data.cookies, 'base64').toString();
        const fs = require('fs');
        const path = require('path');
        
        const cookiePath = path.join(process.cwd(), 'temp', 'cookies.txt');
        fs.mkdirSync(path.dirname(cookiePath), { recursive: true });
        fs.writeFileSync(cookiePath, cookieContent);

        return cookiePath;
      }
    } catch (error) {
      console.error('Failed to get cookies from local server:', error);
    }

    return null;
  }
}

// SETUP INSTRUCTIONS:
/*
1. Run local auth server on your computer:
   node local-auth-server.js

2. Expose it with ngrok:
   ngrok http 3001

3. Set in Railway environment:
   LOCAL_AUTH_SERVER_URL=https://your-ngrok-url.ngrok.io
   AUTH_SECRET=your-secret-key

4. Your Railway app now has access to your browser cookies!
*/ 