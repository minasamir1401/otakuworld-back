FROM node:20-alpine

# Install OpenSSL for Prisma, plus Chromium and its required dependencies for Puppeteer
RUN apk add --no-cache \
    openssl \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    nodejs \
    yarn

WORKDIR /app

# Tell Puppeteer to skip downloading Chrome locally and use the system Chromium installed via apk
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Copy package configuration files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Expose port
EXPOSE 5000

ENV PORT=5000
ENV NODE_ENV=production

# Start the server daemon with database push
CMD ["sh", "-c", "npx prisma db push && node server.js"]
