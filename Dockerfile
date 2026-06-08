FROM node:22-alpine
RUN apk add --no-cache curl openssl

EXPOSE 3000

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY package.json package-lock.json* ./

RUN npm ci

COPY . .

RUN npm run build && npm prune --omit=dev && npm cache clean --force

CMD ["npm", "run", "start"]
