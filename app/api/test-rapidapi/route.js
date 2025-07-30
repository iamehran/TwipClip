import { NextResponse } from 'next/server';
import axios from 'axios';
import { getRapidAPIClientV2 } from '../../../src/lib/rapidapi-youtube-v2';
import { rapidAPIClient } from '../../../src/lib/rapidapi-youtube';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const testType = searchParams.get('test') || 'all';
    const videoUrl = searchParams.get('url') || 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
    
    const videoId = videoUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([^&\n?#]+)/)?.[1];
    const apiKey = process.env.RAPIDAPI_KEY;
    const apiHost = process.env.RAPIDAPI_HOST || 'youtube-video-fast-downloader-24-7.p.rapidapi.com';
    
    console.log('🧪 Testing RapidAPI endpoints...');
    console.log('Video URL:', videoUrl);
    console.log('Video ID:', videoId);
    console.log('Test Type:', testType);
    
    const results = {};
    
    // Test 1: Get Video Info
    if (testType === 'all' || testType === 'info') {
      console.log('\n📺 Testing get-video-info endpoint...');
      try {
        const infoResponse = await axios({
          method: 'GET',
          url: `https://${apiHost}/get-video-info/${videoId}`,
          headers: {
            'X-RapidAPI-Key': apiKey,
            'X-RapidAPI-Host': apiHost
          },
          timeout: 30000
        });
        
        results.videoInfo = {
          success: true,
          data: infoResponse.data,
          hasFormats: !!infoResponse.data.formats,
          formatsCount: infoResponse.data.formats?.length || 0,
          title: infoResponse.data.title,
          duration: infoResponse.data.duration
        };
        console.log('✅ Video info retrieved successfully');
      } catch (error) {
        results.videoInfo = {
          success: false,
          error: error.message,
          status: error.response?.status,
          data: error.response?.data
        };
        console.error('❌ Video info error:', error.message);
      }
    }
    
    // Test 2: Direct Audio Download
    if (testType === 'all' || testType === 'audio') {
      console.log('\n🎵 Testing direct audio download...');
      try {
        const audioResponse = await axios({
          method: 'GET',
          url: `https://${apiHost}/download_audio/${videoId}`,
          headers: {
            'X-RapidAPI-Key': apiKey,
            'X-RapidAPI-Host': apiHost
          },
          timeout: 30000
        });
        
        results.audioDownload = {
          success: true,
          hasUrl: !!(audioResponse.data?.url || audioResponse.data?.download_url || audioResponse.data?.file),
          responseKeys: Object.keys(audioResponse.data),
          data: audioResponse.data
        };
        console.log('✅ Audio download URL retrieved');
      } catch (error) {
        results.audioDownload = {
          success: false,
          error: error.message,
          status: error.response?.status,
          data: error.response?.data
        };
        console.error('❌ Audio download error:', error.message);
      }
    }
    
    // Test 3: Video Download
    if (testType === 'all' || testType === 'video') {
      console.log('\n📹 Testing video download...');
      const isShort = videoUrl.includes('/shorts/');
      const endpoint = isShort ? `/download_short/${videoId}` : `/download_video/${videoId}`;
      
      try {
        const videoResponse = await axios({
          method: 'GET',
          url: `https://${apiHost}${endpoint}`,
          params: { quality: '720' },
          headers: {
            'X-RapidAPI-Key': apiKey,
            'X-RapidAPI-Host': apiHost
          },
          timeout: 30000
        });
        
        results.videoDownload = {
          success: true,
          endpoint: endpoint,
          hasUrl: !!(videoResponse.data?.url || videoResponse.data?.download_url || videoResponse.data?.file),
          responseKeys: Object.keys(videoResponse.data),
          data: videoResponse.data
        };
        console.log('✅ Video download URL retrieved');
      } catch (error) {
        results.videoDownload = {
          success: false,
          endpoint: endpoint,
          error: error.message,
          status: error.response?.status,
          data: error.response?.data
        };
        console.error('❌ Video download error:', error.message);
      }
    }
    
    // Test 4: RapidAPI Client V2
    if (testType === 'all' || testType === 'v2') {
      console.log('\n🚀 Testing RapidAPIClientV2...');
      const clientV2 = getRapidAPIClientV2();
      
      try {
        const audioResult = await clientV2.downloadAudio(videoUrl);
        results.clientV2Audio = {
          success: true,
          hasUrl: !!audioResult.url,
          url: audioResult.url
        };
        console.log('✅ ClientV2 audio download successful');
      } catch (error) {
        results.clientV2Audio = {
          success: false,
          error: error.message
        };
        console.error('❌ ClientV2 audio error:', error.message);
      }
    }
    
    // Test 5: Original RapidAPI Client
    if (testType === 'all' || testType === 'v1') {
      console.log('\n📦 Testing original RapidAPIClient...');
      
      try {
        const qualities = await rapidAPIClient.getAvailableQualities(videoUrl);
        results.clientV1Qualities = {
          success: true,
          count: qualities.length,
          audioQualities: qualities.filter(q => q.type === 'audio').length,
          videoQualities: qualities.filter(q => q.type === 'video').length,
          qualities: qualities
        };
        console.log('✅ ClientV1 qualities retrieved');
      } catch (error) {
        results.clientV1Qualities = {
          success: false,
          error: error.message
        };
        console.error('❌ ClientV1 qualities error:', error.message);
      }
    }
    
    // Summary
    const allSuccess = Object.values(results).every(r => r.success !== false);
    
    return NextResponse.json({
      success: allSuccess,
      videoUrl: videoUrl,
      videoId: videoId,
      timestamp: new Date().toISOString(),
      results: results,
      summary: {
        totalTests: Object.keys(results).length,
        passed: Object.values(results).filter(r => r.success).length,
        failed: Object.values(results).filter(r => !r.success).length
      }
    });
    
  } catch (error) {
    console.error('Test Error:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
}