FROM golang:alpine as builder
RUN apk update && apk add --no-cache hugo git minify
RUN mkdir /app
WORKDIR /app
COPY . .
RUN hugo 
RUN minify -r -o public public

FROM pierrezemb/gostatic
COPY --from=builder /app/public /srv/http
