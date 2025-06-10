FROM node:20-bookworm-slim

# Install build dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /home/node/app

# Copy package files
COPY package*.json ./
COPY packages/backend/package*.json ./packages/backend/
COPY packages/datacollect/package*.json ./packages/datacollect/

# install global husky
RUN npm install -g husky

# Now install workspace dependencies
RUN npm ci --workspace=packages/backend

# Copy source code
COPY packages/backend ./packages/backend
COPY packages/datacollect ./packages/datacollect

# Build datacollect first (dependency)
WORKDIR /home/node/app/packages/datacollect
RUN npm run build

# Build backend
WORKDIR /home/node/app/packages/backend
RUN npm install ../datacollect
RUN npm run build

# Change ownership to node user
RUN chown -R node:node /home/node/app

# Switch to node user
USER node

# Set working directory back to app root
WORKDIR /home/node/app

EXPOSE 3000

CMD ["node", "packages/backend/dist/index.js"]

