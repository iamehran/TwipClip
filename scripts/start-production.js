const { exec } = require('child_process');

console.log('🚀 Starting TwipClip in production mode...\n');

// Set production environment
process.env.NODE_ENV = 'production';

// Check required environment variables
const required = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'RAPIDAPI_KEY'];
const missing = required.filter(key => !process.env[key]);

if (missing.length > 0) {
  console.error('❌ Missing required environment variables:', missing.join(', '));
  process.exit(1);
}

// Check RapidAPI is enabled
if (process.env.USE_RAPIDAPI !== 'true') {
  console.error('❌ USE_RAPIDAPI must be set to true');
  process.exit(1);
}

console.log('✅ All environment variables configured');
console.log('✅ RapidAPI enabled - no authentication needed\n');

// Start the production server
const server = exec('npm run start', (err, stdout, stderr) => {
  if (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
});

// Forward output
server.stdout.on('data', (data) => process.stdout.write(data));
server.stderr.on('data', (data) => process.stderr.write(data));

// Handle shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down...');
  server.kill('SIGINT');
  process.exit(0);
}); 