FROM golang:alpine as builder
RUN apk update && apk add --no-cache git minify
RUN apk add --repository=https://dl-cdn.alpinelinux.org/alpine/edge/community --no-cache hugo=~0.120.4r0
RUN mkdir /app
WORKDIR /app
COPY . .
RUN hugo 
RUN minify -r -o public public

FROM pierrezemb/gostatic
COPY --from=builder /app/public /srv/http
