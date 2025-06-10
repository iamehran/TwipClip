FROM node:18-alpine

# Install Python, pip, ffmpeg and other required tools
RUN apk add --no-cache python3 py3-pip ffmpeg curl bash

# Install yt-dlp globally and ensure it's in PATH
RUN pip3 install --break-system-packages yt-dlp && \
    # Create symlink in /usr/local/bin to ensure it's in PATH
    ln -sf /usr/bin/yt-dlp /usr/local/bin/yt-dlp 2>/dev/null || \
    ln -sf $(which yt-dlp) /usr/local/bin/yt-dlp 2>/dev/null || \
    # If pip installed it somewhere else, find and link it
    (find / -name yt-dlp -type f -executable 2>/dev/null | head -1 | xargs -I {} ln -sf {} /usr/local/bin/yt-dlp)

# Also download the standalone binary as a fallback
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp-binary && \
    chmod a+rx /usr/local/bin/yt-dlp-binary

# Verify installations
RUN yt-dlp --version && ffmpeg -version && python3 --version

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --legacy-peer-deps

# Copy application files
COPY . .

# Create required directories
RUN mkdir -p /app/public/downloads /app/temp && \
    chmod 777 /app/public/downloads /app/temp

# Build the Next.js app
RUN npm run build

# Create a startup script that ensures yt-dlp is available
RUN echo '#!/bin/sh' > /app/start.sh && \
    echo 'export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"' >> /app/start.sh && \
    echo 'echo "Checking yt-dlp availability..."' >> /app/start.sh && \
    echo 'which yt-dlp || echo "yt-dlp not in PATH"' >> /app/start.sh && \
    echo 'yt-dlp --version || echo "yt-dlp command failed"' >> /app/start.sh && \
    echo 'python3 -m yt_dlp --version || echo "Python module failed"' >> /app/start.sh && \
    echo '/usr/local/bin/yt-dlp-binary --version || echo "Binary failed"' >> /app/start.sh && \
    echo 'echo "Starting application..."' >> /app/start.sh && \
    echo 'exec npm start' >> /app/start.sh && \
    chmod +x /app/start.sh

# Expose the port
EXPOSE 3000

# Set environment variables using ENV (not export)
ENV NODE_ENV=production
ENV PATH="/usr/local/bin:/usr/bin:/bin:$PATH"
ENV PYTHONPATH="/usr/lib/python3.11/site-packages:$PYTHONPATH"

# Use the startup script
CMD ["/app/start.sh"] 