FROM node:18-alpine

# Install Python, pip, ffmpeg and yt-dlp
RUN apk add --no-cache python3 py3-pip ffmpeg curl bash
RUN pip3 install --break-system-packages yt-dlp

# Alternative: Download yt-dlp directly
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

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

# Make setup script executable and run it
RUN chmod +x scripts/railway-setup.sh && bash scripts/railway-setup.sh

# Build the Next.js app
RUN npm run build

# Create downloads directory
RUN mkdir -p /app/public/downloads && chmod 777 /app/public/downloads

# Expose the port
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production
ENV PATH="/usr/local/bin:/usr/bin:/bin:$PATH"
ENV PYTHONPATH="/usr/lib/python3.11/site-packages:$PYTHONPATH"

# Start the application
CMD ["npm", "start"] 