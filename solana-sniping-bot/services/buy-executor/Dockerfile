# Base Node.js image
FROM node:18-alpine

WORKDIR /usr/src/app

COPY package*.json ./
#RUN npm ci --only=production
RUN npm install --only=production

COPY ./src ./src
#COPY ../../shared ./shared

CMD [ "node", "src/index.js" ]
