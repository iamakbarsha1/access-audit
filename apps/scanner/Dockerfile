FROM node:20-slim

# Install Chromium dependencies for Puppeteer
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Tell Puppeteer to use system Chromium instead of downloading its own
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

# Copy workspace root files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./

# Copy only the packages needed by scanner
COPY packages/db/package.json ./packages/db/
COPY packages/tsconfig/ ./packages/tsconfig/
COPY apps/scanner/package.json ./apps/scanner/

# Install dependencies (frozen lockfile for reproducibility)
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/db/src/ ./packages/db/src/
COPY packages/db/tsconfig.json ./packages/db/
COPY apps/scanner/src/ ./apps/scanner/src/
COPY apps/scanner/tsconfig.json ./apps/scanner/

WORKDIR /app/apps/scanner

EXPOSE 3001

CMD ["pnpm", "start"]
