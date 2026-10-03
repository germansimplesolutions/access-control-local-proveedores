FROM node:18.18-alpine3.18 

WORKDIR /app

COPY package.json .

RUN npm install

# tzdata for timzone
RUN apk add --no-cache tzdata
 
# timezone env with default
ENV TZ=America/Argentina/Buenos_Aires

COPY . .

EXPOSE 8080

CMD [ "npm", "run", "dev" ]