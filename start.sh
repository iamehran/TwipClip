#!/bin/sh

# Railway provides PORT environment variable
PORT=${PORT:-3000}

echo "Starting TwipClip on port $PORT"
echo "Environment: production"
echo "Node version: $(node --version)"

# Start Next.js with the PORT from Railway
exec npx next start -p $PORT -H 0.0.0.0 