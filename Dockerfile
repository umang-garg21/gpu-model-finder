FROM node:18-bullseye-slim

# Non-interactive apt and prevent services from starting during package install
# Set TERM to avoid debconf dialog frontend fallbacks during automated builds
ENV DEBIAN_FRONTEND=noninteractive TERM=linux

# Create a policy-rc.d that blocks service starts in container/CI builds
RUN printf '#!/bin/sh\nexit 101\n' > /usr/sbin/policy-rc.d \
    && chmod +x /usr/sbin/policy-rc.d

# Install only required system packages (minimal set for headless Chromium / puppeteer-like tooling)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates fonts-liberation gconf-service libappindicator1 libappindicator3-1 \
    libasound2 libatk1.0-0 libatomic1 libc6 libcairo2 libcups2 \
    libdbus-1-3 libexpat1 libfontconfig1 libgbm1 libgcc1 libgconf-2-4 libgdk-pixbuf2.0-0 \
    libglib2.0-0 libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 libpangocairo-1.0-0 \
    libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 \
    libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 lsb-release \
    wget xdg-utils xvfb \
    -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" \
    && rm -rf /var/lib/apt/lists/*

# Remove the policy file so runtime isn't affected
RUN rm -f /usr/sbin/policy-rc.d || true

WORKDIR /usr/src/app

# Install node deps
COPY package*.json ./
RUN npm ci --only=production

# Copy app
COPY . .

EXPOSE 4243
CMD ["node", "server.js"]
