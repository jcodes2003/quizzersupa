FROM eclipse-temurin:21-jdk

WORKDIR /app

COPY package.json ./
COPY server.mjs ./

ENV PORT=8080

EXPOSE 8080

CMD ["npm", "start"]
