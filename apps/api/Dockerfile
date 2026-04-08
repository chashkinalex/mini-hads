FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/miniapp/package.json apps/miniapp/package.json
COPY packages/domain/package.json packages/domain/package.json

RUN npm install

COPY . .

RUN npm run db:generate

EXPOSE 3001

CMD ["npm", "run", "start", "-w", "@mini-hads/api"]
