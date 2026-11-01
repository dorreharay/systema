# Backend image (Express API, port 4000). Build it from this folder: docker build -t systema-backend .
FROM node:22-slim

ENV NODE_ENV=production
WORKDIR /app

# Dependencies first, so Docker can cache this layer
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY drizzle ./drizzle

EXPOSE 4000
USER node

# Apply migrations, then start the server.
# Fine with one instance. With two or more, run migrations as a separate step instead.
CMD ["sh", "-c", "node src/db/migrate.js && node src/index.js"]
