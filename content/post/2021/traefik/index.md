---
title: "My Traefik Setup"
date: 2021-11-24
tags: 
  - docker
  - traefik
---

This post, as most of my posts tend to be, is my attempt at documenting how I set something up so that future Jeff can do it again, or troubleshoot it when it inevitable breaks at some point in the, hopefully, distant future.

On my various web servers, I've been moving more and more of my content into Docker containers to, hopefully, aid in isolation (both security and unintended interactions/interdependencies) and maintainability.  As such, I've decided to use [Traefik](https://traefik.io) to proxy requests through to the underlying containers, and to handle all the TLS stuff (getting certificates from Let's Encrypt, A+ on both [SSLLabs](https://www.ssllabs.com/ssltest/analyze.html?d=www.zeos.ca&latest) and [SecureHeaders](https://securityheaders.com/?q=www.zeos.ca&followRedirects=on)).

# Traefik Setup

The following `docker-compose.yml` file sets up the Traefik container.

```docker
version: "3.7"

services:
  traefik:
    image: "traefik:latest"
    container_name: "traefik"
    hostname: "traefik"
    ports:
      - "80:80"
      - "443:443"
    volumes:
      # Traefic needs access to docker information to detect containers/read labels
      - "/var/run/docker.sock:/var/run/docker.sock:ro"
      # Additional configuration for Traefik
      - "./traefik.yml:/traefik.yml:ro"
      - "./traefik-dynamic.yml:/traefik-dynamic.yml:ro"
      # Storage for Let's Encrypt
      - "./acme.json:/acme.json"
    labels:
      - "traefik.enable=true"

networks:
  default:
    external:
      name: traefik_net
```

Here is the `traefik.yml` file.

```yaml
log:
  level: INFO

api:
  insecure: true
  dashboard: false  # I've turned off the dashboard in my environment

entryPoints:
  web:
    address: ":80"
    http:
      redirections:  # always redirect HTTP to HTTPS
        entryPoint:
          to: websecure
          scheme: https

  websecure:
    address: ":443"
    http:
            middlewares:
                    # middleware defined in traefic-dyanmic.yml
                    # applies security headers to all HTTPS traffic
                    - secHeaders@file   

providers:
  docker:
    endpoint: "unix:///var/run/docker.sock"
    exposedByDefault: false
  file:
    filename: "/traefik-dynamic.yml"

# Setup Traefik to obtain TLS certificates from Let's Encrypt
# Using web challenge (no wildcard certs, unfortunately) because it's easy
certificatesResolvers:
  lets-encr:
    acme:
      storage: acme.json
      email: admin@domain.com
      httpChallenge:
        entryPoint: web
```

Here is `traefic-dynamic.yml` which defines middleware for Security Headers, and apex > www redirections.

```yaml
tls:
  options:
    default:
      minVersion: VersionTLS12
      cipherSuites:
        - TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256
        - TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384
        - TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305
        - TLS_AES_128_GCM_SHA256
        - TLS_AES_256_GCM_SHA384
        - TLS_CHACHA20_POLY1305_SHA256
      curvePreferences:
        - CurveP521
        - CurveP384
      sniStrict: true
http:
  middlewares:
    redirect-non-www-to-www:
      redirectregex:
        permanent: true
        regex: "^https?://(?:www\\.)?(.+)"
        replacement: "https://www.${1}"

    redirect-www-to-non-www:
      redirectregex:
        permanent: true
        regex: "^https?://www\\.(.+)"
        replacement: "https://${1}"

    secHeaders:
      headers:
        browserXssFilter: true
        contentTypeNosniff: true
        frameDeny: true
        stsIncludeSubdomains: true
        stsPreload: true
        stsSeconds: 15768000
        contentSecurityPolicy: "upgrade-insecure-requests"
        referrerPolicy: "no-referrer-when-downgrade"
        permissionsPolicy: "interest-cohort=()"

```

# Sample Container 1: Single Domain

The following `docker-compose.yml` sets up a basic Whoami service on `whoami.domain.com`.  It will be served via HTTPS (certificate automatically received from Let's Encrypt).  It should get A+ on both SecureHeaders and SSLLabs due to the additional headers and adjusted cipher suites.

```docker
version: "3.7"

services:
  whoami:
    image: "containous/whoami"
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.whoami1.entrypoints=websecure"
      - "traefik.http.routers.whoami1.rule=Host(`whoami.domain.com`)"
      - "traefik.http.routers.whoami1.tls.certresolver=lets-encr"

networks:
  default:
    external:
      name: traefik_net
```

Once Traefik is up and running, a single `docker-compose up -d` should start this container, and it'll automatically be picked up by Traefik and served on `whoami.domain.com` via. TLS.

# Sample Container 2: www. and redirect from apex

This `docker-compose.yml` sets up the same Whoami service but serves it on `www.domain.com`.  It also redirects from the apex domain `domain.com` to the canonical domain `www.domain.com` (with valid TLS certificates for both).

```docker
version: '3.8'

services:

  server:
    restart: always
    image: index.docker.io/jclement/blog:latest
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.whoami2.entrypoints=websecure"
      - "traefik.http.routers.whoami2.rule=Host(`www.domain.com`,`domain.com`)"
      - "traefik.http.routers.whoami2.tls.certresolver=lets-encr"
      - "traefik.http.routers.whoami2.middlewares=redirect-non-www-to-www@file"

networks:
  default:
    external:
      name: traefik_net
```