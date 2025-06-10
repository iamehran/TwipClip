FROM node:18-alpine

# Install system dependencies including Python and FFmpeg
RUN apk add --no-cache \
    python3 \
    py3-pip \
    ffmpeg \
    curl \
    bash \
    && rm -rf /var/cache/apk/*

# Create a Python virtual environment to avoid system package conflicts
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Install yt-dlp in the virtual environment
RUN pip install --upgrade pip && \
    pip install yt-dlp

# Also download the standalone binary as a fallback
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp

# Create symlinks to ensure yt-dlp is available everywhere
RUN ln -sf /opt/venv/bin/yt-dlp /usr/bin/yt-dlp || true

# Verify installations work
RUN echo "Testing yt-dlp installations:" && \
    echo "1. Virtual env:" && /opt/venv/bin/yt-dlp --version && \
    echo "2. Binary:" && /usr/local/bin/yt-dlp --version && \
    echo "3. Python module:" && python3 -m yt_dlp --version && \
    echo "4. FFmpeg:" && ffmpeg -version

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node dependencies
RUN npm install --legacy-peer-deps

# Copy application files
COPY . .

# Create required directories
RUN mkdir -p /app/public/downloads /app/temp && \
    chmod 777 /app/public/downloads /app/temp

# Build the Next.js app
RUN npm run build

# Create a wrapper script that ensures PATH is set correctly
RUN echo '#!/bin/sh' > /app/entrypoint.sh && \
    echo 'export PATH="/opt/venv/bin:/usr/local/bin:/usr/bin:/bin:$PATH"' >> /app/entrypoint.sh && \
    echo 'echo "=== Runtime Environment ==="' >> /app/entrypoint.sh && \
    echo 'echo "PATH: $PATH"' >> /app/entrypoint.sh && \
    echo 'echo "yt-dlp locations:"' >> /app/entrypoint.sh && \
    echo 'which yt-dlp || echo "yt-dlp not in PATH"' >> /app/entrypoint.sh && \
    echo 'ls -la /opt/venv/bin/yt-dlp 2>/dev/null || echo "/opt/venv/bin/yt-dlp not found"' >> /app/entrypoint.sh && \
    echo 'ls -la /usr/local/bin/yt-dlp 2>/dev/null || echo "/usr/local/bin/yt-dlp not found"' >> /app/entrypoint.sh && \
    echo 'echo "Testing yt-dlp execution:"' >> /app/entrypoint.sh && \
    echo '/opt/venv/bin/yt-dlp --version || echo "venv yt-dlp failed"' >> /app/entrypoint.sh && \
    echo '/usr/local/bin/yt-dlp --version || echo "binary yt-dlp failed"' >> /app/entrypoint.sh && \
    echo 'echo "=== Starting Application ==="' >> /app/entrypoint.sh && \
    echo 'exec "$@"' >> /app/entrypoint.sh && \
    chmod +x /app/entrypoint.sh

# Expose port
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production
ENV PATH="/opt/venv/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
ENV PYTHONPATH="/opt/venv/lib/python3.11/site-packages:$PYTHONPATH"

# Use entrypoint to ensure environment is set up
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["npm", "start"] 