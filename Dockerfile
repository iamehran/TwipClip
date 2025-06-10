FROM node:18-alpine

# Install Python, pip, ffmpeg and yt-dlp
RUN apk add --no-cache python3 py3-pip ffmpeg curl bash
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

# Build the Next.js app
RUN npm run build

# Create downloads directory
RUN mkdir -p /app/public/downloads && chmod 777 /app/public/downloads

# Expose the port
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production
ENV PATH="/usr/local/bin:/usr/bin:/bin:$PATH"

# Start the application
CMD ["npm", "start"] 