# services/sell-manager/Dockerfile
FROM node:18-alpine

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install --only=production

COPY ./src ./src

CMD [ "node", "src/index.js" ]