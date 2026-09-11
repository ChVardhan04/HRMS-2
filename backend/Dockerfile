FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl
COPY package*.json ./
COPY prisma ./prisma
RUN npm install
COPY . .
RUN npx prisma generate && npm run build

FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache openssl
ENV NODE_ENV=production

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

EXPOSE 4000

CMD ["node", "dist/src/main.js"]