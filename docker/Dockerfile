# Stage 1: Build dependencies and build the application
FROM node:20-bookworm-slim AS builder

# Set NODE_ENV for the build stage to ensure dev dependencies are installed if needed for building
ENV NODE_ENV=development

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Create app directory and set ownership for the build user
WORKDIR /home/node/app
RUN chown -R node:node /home/node/app

# Switch to non-root user for npm operations
USER node

# Copy package files first to leverage Docker caching
# This layer will only be rebuilt if package*.json files change
COPY package*.json ./
COPY packages/backend/package*.json ./packages/backend/
COPY packages/datacollect/package*.json ./packages/datacollect/

# Install global husky
RUN npm install -g husky

# Install workspace dependencies
RUN npm ci --workspace=packages/backend

# Copy source code after dependencies to leverage caching
# This layer will be rebuilt if source code changes
COPY packages/backend ./packages/backend
COPY packages/datacollect ./packages/datacollect

# Build datacollect first (dependency)
WORKDIR /home/node/app/packages/datacollect
RUN npm run build

# Build backend
WORKDIR /home/node/app/packages/backend
RUN npm install ../datacollect
RUN npm run build

# Stage 2: Create the lean production image
FROM node:20-bookworm-slim

# Set NODE_ENV for production
ENV NODE_ENV=production

# Create app directory and set ownership
WORKDIR /home/node/app
RUN chown -R node:node /home/node/app

# Switch to non-root user
USER node

# Copy only the necessary artifacts from the builder stage
# This includes built code and production dependencies
COPY --from=builder --chown=node:node /home/node/app/package*.json ./
COPY --from=builder --chown=node:node /home/node/app/node_modules ./node_modules
COPY --from=builder --chown=node:node /home/node/app/packages/backend/dist ./packages/backend/dist
COPY --from=builder --chown=node:node /home/node/app/packages/datacollect/dist ./packages/datacollect/dist
# If `packages/backend` and `packages/datacollect` contain non-dist files needed at runtime, copy them:
# COPY --from=builder --chown=node:node /home/node/app/packages/backend/src ./packages/backend/src # only if needed at runtime
# COPY --from=builder --chown=node:node /home/node/app/packages/datacollect/src ./packages/datacollect/src # only if needed at runtime

EXPOSE 3000

CMD ["node", "packages/backend/dist/index.js"]