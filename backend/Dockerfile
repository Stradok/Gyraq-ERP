# Build from the repo root:  docker build -f backend/Dockerfile -t meridian-api .
FROM node:22-alpine
WORKDIR /app
COPY backend/package.json backend/
RUN cd backend && npm install --no-audit --no-fund
COPY backend backend
COPY frontend/src/lib frontend/src/lib
WORKDIR /app/backend
ENV NODE_ENV=production
EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=3s --retries=10 CMD wget -qO- http://localhost:4000/health || exit 1
CMD ["npm", "start"]
