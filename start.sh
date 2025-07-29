#!/bin/sh

# Railway provides PORT environment variable
PORT=${PORT:-3000}

echo "Starting TwipClip on port $PORT"
echo "Environment: production"
echo "Node version: $(node --version)"
echo "Memory limit: $(cat /sys/fs/cgroup/memory/memory.limit_in_bytes 2>/dev/null || echo 'unknown')"

# Add signal handling
trap 'echo "Received signal, shutting down gracefully..."; exit 0' SIGTERM SIGINT

# Start Next.js with the PORT from Railway
exec node_modules/.bin/next start -p $PORT -H 0.0.0.0 