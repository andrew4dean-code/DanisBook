FROM node:20-alpine

# Install ffmpeg (for yt-dlp merging), curl (to fetch yt-dlp binary), and python3
RUN apk add --no-cache ffmpeg curl python3 && \
    curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
         -o /usr/local/bin/yt-dlp && \
    chmod +x /usr/local/bin/yt-dlp

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .

EXPOSE 8080
# Always update yt-dlp before starting so Instagram extraction stays current
CMD ["sh", "-c", "yt-dlp -U 2>/dev/null; npm start"]
