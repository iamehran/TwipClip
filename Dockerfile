FROM node:18-alpine

# Install Python, pip, ffmpeg and other required tools
RUN apk add --no-cache python3 py3-pip ffmpeg curl bash

# Install yt-dlp via pip (it worked in the logs!)
RUN pip3 install --break-system-packages yt-dlp

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

# Expose the port
EXPOSE 3000

# Set environment variables using ENV (not export)
ENV NODE_ENV=production
ENV PATH="/usr/local/bin:/usr/bin:/bin:$PATH"
ENV PYTHONPATH="/usr/lib/python3.11/site-packages:$PYTHONPATH"

# Start the application directly
CMD ["npm", "start"] 