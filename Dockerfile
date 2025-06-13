FROM node:18-alpine

# Install dependencies
RUN apk add --no-cache python3 py3-pip ffmpeg curl bash

# Install yt-dlp using pip with no-cache-dir flag
RUN pip3 install --break-system-packages --no-cache-dir --upgrade yt-dlp

# Also download the standalone binary to /usr/local/bin
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp

# Create another copy in the app directory
RUN mkdir -p /app && \
    cp /usr/local/bin/yt-dlp /app/yt-dlp && \
    chmod a+rx /app/yt-dlp

# Verify at least one method works
RUN echo "Testing yt-dlp installations:" && \
    (/usr/local/bin/yt-dlp --version || echo "Binary failed") && \
    (python3 -m yt_dlp --version || echo "Python module failed") && \
    (/app/yt-dlp --version || echo "App copy failed")

# Verify FFmpeg is installed
RUN echo "Testing FFmpeg installation:" && \
    (ffmpeg -version || echo "FFmpeg not found") && \
    (which ffmpeg || echo "FFmpeg not in PATH")

WORKDIR /app

# Copy and install dependencies
COPY package*.json ./

# Configure npm with retry logic and timeout settings
RUN npm config set fetch-retries 5 && \
    npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000 && \
    npm config set fetch-timeout 300000 && \
    npm config set registry https://registry.npmjs.org/

# Install with retries - if first attempt fails, wait and retry
RUN npm install --legacy-peer-deps || \
    (echo "First npm install failed, waiting 30s and retrying..." && sleep 30 && npm install --legacy-peer-deps) || \
    (echo "Second attempt failed, trying with yarn mirror..." && \
     npm config set registry https://registry.yarnpkg.com && \
     npm install --legacy-peer-deps) || \
    (echo "Third attempt failed, clearing cache and retrying..." && \
     npm cache clean --force && \
     npm config set registry https://registry.npmjs.org/ && \
     npm install --legacy-peer-deps)

# Copy application
COPY . .

# Ensure yt-dlp is still there after COPY
RUN if [ ! -f /app/yt-dlp ]; then cp /usr/local/bin/yt-dlp /app/yt-dlp && chmod a+rx /app/yt-dlp; fi

# Build
RUN npm run build

# Create directories with proper permissions
RUN mkdir -p /app/public/downloads /app/temp && \
    chmod -R 777 /app/public/downloads /app/temp

EXPOSE 3000

# Set environment to help find yt-dlp
ENV NODE_ENV=production
ENV PATH="/app:/usr/local/bin:/usr/bin:/bin:$PATH"
ENV YTDLP_PATH="/usr/local/bin/yt-dlp"

# Direct command, no wrapper scripts
CMD ["npm", "start"] 