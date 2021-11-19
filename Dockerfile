FROM node:lts-alpine as build-step
WORKDIR /app
ENV PATH /app/node_modules/.bin:$PATH
COPY .  ./
RUN npm install grunt string yamljs
RUN grunt lunr-index
RUN apk add hugo
RUN hugo

FROM caddy:alpine
EXPOSE 80
COPY --from=build-step /app/public /usr/share/caddy