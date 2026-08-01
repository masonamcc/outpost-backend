# nomad-backend/Dockerfile
FROM node:20
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 2749
CMD ["node", "index.js"]