FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && apt-get clean
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json *.ts ./
RUN npm run build && npm prune --omit=dev
USER node
ENV HOST=0.0.0.0 PORT=8787
EXPOSE 8787
CMD ["node", "dist/index.js"]
