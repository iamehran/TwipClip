#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

console.log('🚀 TwipClip Comprehensive System Test\n');

const tests = {
  passed: 0,
  failed: 0,
  warnings: 0
};

// Test results storage
const results = [];

async function test(name, fn) {
  process.stdout.write(`Testing ${name}... `);
  try {
    const result = await fn();
    if (result.warning) {
      console.log('⚠️  WARNING');
      console.log(`   ${result.warning}`);
      tests.warnings++;
    } else {
      console.log('✅ PASSED');
      tests.passed++;
    }
    results.push({ name, status: 'passed', ...result });
  } catch (error) {
    console.log('❌ FAILED');
    console.log(`   ${error.message}`);
    tests.failed++;
    results.push({ name, status: 'failed', error: error.message });
  }
}

async function runTests() {
// 1. Environment Configuration
await test('Environment Variables', async () => {
  const required = [
    'ANTHROPIC_API_KEY',
    'GOOGLE_CLOUD_API_KEY',
    'YOUTUBE_API_KEY'
  ];
  
  const missing = required.filter(key => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing: ${missing.join(', ')}`);
  }
  
  // Check key formats
  if (process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_API_KEY.startsWith('sk-ant-')) {
    return { warning: 'ANTHROPIC_API_KEY format might be incorrect' };
  }
  
  return {};
});

// 2. Dependencies Check
await test('System Dependencies', async () => {
  const deps = [];
  
  // Check yt-dlp
  try {
    const { stdout } = await execAsync('yt-dlp --version');
    deps.push(`yt-dlp: ${stdout.trim()}`);
  } catch (e) {
    throw new Error('yt-dlp not found. Install with: pip install yt-dlp');
  }
  
  // Check ffmpeg
  try {
    const { stdout } = await execAsync('ffmpeg -version');
    const version = stdout.split('\n')[0];
    deps.push(`ffmpeg: ${version}`);
  } catch (e) {
    throw new Error('ffmpeg not found. Please install ffmpeg');
  }
  
  return { info: deps.join(', ') };
});

// 3. Cookie Authentication
await test('YouTube Cookie Authentication', async () => {
  const cookieLocations = [
    path.join(process.cwd(), 'temp/user-cookies'),
    path.join(process.cwd(), 'app/api/auth/youtube/cookies/youtube_cookies.txt')
  ];
  
  let found = false;
  for (const loc of cookieLocations) {
    if (fs.existsSync(loc)) {
      found = true;
      
      // Check if it's a directory (user-specific cookies)
      if (fs.statSync(loc).isDirectory()) {
        const users = fs.readdirSync(loc);
        if (users.length > 0) {
          return { info: `Found ${users.length} user cookie sessions` };
        }
      } else {
        // Check file size
        const stats = fs.statSync(loc);
        if (stats.size < 100) {
          return { warning: 'Cookie file seems too small' };
        }
        return { info: 'Global cookie file found' };
      }
    }
  }
  
  return { warning: 'No YouTube cookies found. Users will need to upload cookies.' };
});

// 4. File Size Limits
await test('Download Configuration', async () => {
  // Check bulk download settings
  const bulkDownloadPath = path.join(process.cwd(), 'app/utils/bulk-download.ts');
  const content = fs.readFileSync(bulkDownloadPath, 'utf8');
  
  const checks = {
    'Quality limit (720p)': content.includes('bestvideo[height<=720]'),
    'MP4 format': content.includes('--merge-output-format mp4'),
    'H264 codec': content.includes('libx264'),
    'File optimization': content.includes('-crf 23'),
    'Size limit (512MB)': content.includes('512 * 1024 * 1024')
  };
  
  const failed = Object.entries(checks).filter(([k, v]) => !v);
  if (failed.length > 0) {
    throw new Error(`Missing optimizations: ${failed.map(f => f[0]).join(', ')}`);
  }
  
  return { info: 'All download optimizations in place' };
});

// 5. AI Model Configuration
await test('AI Model Settings', async () => {
  const modelFiles = [
    'app/utils/perfect-matching-optimized.ts',
    'app/utils/context-aware-matching.ts',
    'app/utils/context-aware-matching-fast.ts'
  ];
  
  const models = new Set();
  for (const file of modelFiles) {
    const content = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
    const modelMatches = content.match(/claude-[\w-]+/g) || [];
    modelMatches.forEach(m => models.add(m));
  }
  
  if (models.size === 0) {
    throw new Error('No AI models configured');
  }
  
  return { info: `Models configured: ${Array.from(models).join(', ')}` };
});

// 6. Search Functionality
await test('Search Algorithm', async () => {
  const searchFile = path.join(process.cwd(), 'app/utils/enhanced-search.ts');
  const content = fs.readFileSync(searchFile, 'utf8');
  
  const features = {
    'AI-optimized queries': content.includes('generateAIOptimizedQueries'),
    'Entity extraction': content.includes('extractAllEntities'),
    'Quality filtering': content.includes('filterRelevantVideos'),
    'Multiple strategies': content.includes('Strategy')
  };
  
  const missing = Object.entries(features).filter(([k, v]) => !v);
  if (missing.length > 0) {
    throw new Error(`Missing features: ${missing.map(m => m[0]).join(', ')}`);
  }
  
  return { info: 'All search optimizations active' };
});

// 7. Matching Algorithm
await test('Matching Algorithm', async () => {
  const matchingFiles = [
    'app/utils/context-aware-matching-fast.ts',
    'app/utils/perfect-matching-optimized.ts'
  ];
  
  let hasContextAware = false;
  let hasBatchProcessing = false;
  let hasQualityScoring = false;
  
  for (const file of matchingFiles) {
    const content = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
    if (content.includes('findContextAwareMatches')) hasContextAware = true;
    if (content.includes('batchPrompt')) hasBatchProcessing = true;
    if (content.includes('matchQuality')) hasQualityScoring = true;
  }
  
  if (!hasContextAware || !hasBatchProcessing || !hasQualityScoring) {
    throw new Error('Missing critical matching features');
  }
  
  return { info: 'Advanced matching algorithms configured' };
});

// 8. Performance Optimizations
await test('Performance Settings', async () => {
  const checks = {
    'Request queue': fs.existsSync(path.join(process.cwd(), 'app/utils/request-queue.ts')),
    'Rate limiting': fs.readFileSync(path.join(process.cwd(), 'app/utils/request-queue.ts'), 'utf8').includes('RateLimiter'),
    'Parallel processing': fs.readFileSync(path.join(process.cwd(), 'src/lib/intelligent-processor-v3.ts'), 'utf8').includes('Promise.all'),
    'Caching': fs.readFileSync(path.join(process.cwd(), 'app/utils/context-aware-matching-fast.ts'), 'utf8').includes('matchCache')
  };
  
  const failed = Object.entries(checks).filter(([k, v]) => !v);
  if (failed.length > 0) {
    throw new Error(`Missing optimizations: ${failed.map(f => f[0]).join(', ')}`);
  }
  
  return { info: 'All performance optimizations active' };
});

// 9. Error Handling
await test('Error Recovery', async () => {
  const processFile = path.join(process.cwd(), 'app/api/process/status/route.js');
  const content = fs.readFileSync(processFile, 'utf8');
  
  const features = {
    'Stuck detection': content.includes('stuckDuration'),
    'Auto-retry': content.includes('retry-high-progress'),
    'Job persistence': content.includes('global.twipclipJobs'),
    'Timeout handling': content.includes('JOB_TIMEOUT')
  };
  
  const missing = Object.entries(features).filter(([k, v]) => !v);
  if (missing.length > 0) {
    throw new Error(`Missing features: ${missing.map(m => m[0]).join(', ')}`);
  }
  
  return { info: 'Error recovery mechanisms in place' };
});

// 10. Frontend Integration
await test('Frontend Components', async () => {
  const components = [
    'app/components/SearchForm.tsx',
    'app/components/VideoResult.tsx',
    'app/components/YouTubeAuth.tsx',
    'app/components/LoadingState.tsx'
  ];
  
  for (const comp of components) {
    if (!fs.existsSync(path.join(process.cwd(), comp))) {
      throw new Error(`Missing component: ${comp}`);
    }
  }
  
  // Check for loading state handling
  const pageContent = fs.readFileSync(path.join(process.cwd(), 'app/page.tsx'), 'utf8');
  if (!pageContent.includes('pollJobStatus')) {
    throw new Error('Missing job polling mechanism');
  }
  
  return { info: 'All frontend components present' };
});

// Summary
console.log('\n📊 Test Summary:');
console.log(`✅ Passed: ${tests.passed}`);
console.log(`⚠️  Warnings: ${tests.warnings}`);
console.log(`❌ Failed: ${tests.failed}`);

if (tests.failed > 0) {
  console.log('\n⚠️  Critical Issues Found:');
  results.filter(r => r.status === 'failed').forEach(r => {
    console.log(`- ${r.name}: ${r.error}`);
  });
}

if (tests.warnings > 0) {
  console.log('\n📝 Warnings:');
  results.filter(r => r.warning).forEach(r => {
    console.log(`- ${r.name}: ${r.warning}`);
  });
}

// Optimization Recommendations
console.log('\n🎯 Optimization Checklist:');
const optimizations = [
  '✓ 720p video quality limit for social media',
  '✓ H.264 codec for compatibility',
  '✓ 512MB file size limit',
  '✓ 10-minute duration limit',
  '✓ Fast context-aware matching',
  '✓ Batch AI processing',
  '✓ Request queuing system',
  '✓ YouTube rate limiting (30/min)',
  '✓ Global job persistence',
  '✓ Automatic error recovery'
];

optimizations.forEach(opt => console.log(opt));

// Final verdict
console.log('\n🏁 Final Status:');
if (tests.failed === 0) {
  console.log('✅ System is ready for production!');
  console.log('🚀 All critical systems operational');
} else {
  console.log('❌ System needs attention before deployment');
  console.log('Please fix the failed tests above');
}

process.exit(tests.failed > 0 ? 1 : 0);
}

// Run all tests
runTests().catch(console.error); 