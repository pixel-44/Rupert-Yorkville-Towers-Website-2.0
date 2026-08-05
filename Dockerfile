FROM node:22-slim

ENV NODE_ENV=production
ENV DATA_DIR=/data
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

RUN mkdir -p /data
VOLUME ["/data"]
EXPOSE 3000
CMD ["node", "server.js"]
