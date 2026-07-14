FROM node:20-alpine

# Install OpenSSL for Prisma client compatibility
RUN apk add --no-cache openssl

WORKDIR /app

# Copy package configuration files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Expose port
EXPOSE 3000

ENV PORT=3000
ENV NODE_ENV=production

# Start the server daemon
CMD ["node", "server.js"]
