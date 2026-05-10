FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy application
COPY . .

# Create data directory
RUN mkdir -p data

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD sh -c 'node -e "require(\"http\").get(\"http://localhost:\" + (process.env.PORT || 3000) + \"/api/health\", (r) => { if (r.statusCode !== 200) throw new Error(r.statusCode); })"'

# Start application
CMD ["node", "backend/server.js"]
