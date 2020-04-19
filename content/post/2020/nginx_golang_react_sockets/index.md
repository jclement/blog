---
title: "Adventures with Golang, WebSockets, Create-React-App and NGINX"
date: 2020-04-18
tags: 
  - golang
  - react
  - nginx
---

As part of my COVID friendly game project, [werdz.ca](https://werdz.ca), I've been working with [GoLang](https://golang.org), [Create-React-App](https://create-react-app.dev), WebSockets and NGINX (for production).  Some of it has been "an adventure".

This post is a set of quick notes about the problems I've encountered and how I worked by them.  

<!--more--> 

# The Backend Server

The backend server for *werdz* was written in GoLang and uses the [Gorilla Mux](http://www.gorillatoolkit.org/pkg/mux) and [Gorilla Websocket](http://www.gorillatoolkit.org/pkg/websocket) libraries.


This part went reasonably smooth.  The Gorilla Mux and Websocket libraries are well documented and easy to use.

The Go code for `/api/game/ws` (the path for my websocket) looks something like this:

```go
package main

import (
    "log"
    "net/http"
    "time"

    "github.com/gorilla/mux"
    "github.com/gorilla/websocket"
    "gitlab.adipose.net/jeff/werdz/models/game"
)

func (a *App) apiGameWs(w http.ResponseWriter, r *http.Request) {
    upgrader := websocket.Upgrader{
        CheckOrigin: func(r *http.Request) bool {
            return true
        },
    }
    
    // Something along these lines to upgrade to a Websocket
    ws, err := upgrader.Upgrade(w, r, nil)
    if err != nil {
        log.Fatal(err)
        return
    }

    // hang on to the Websocket somewhere
    g.Clients[ws] = bool

    // give them the current state
    m := newGameStateMessage(g)
    ws.WriteJSON(m)

    // let the world know we have a new player
    g.PushUpdate()
}
```

and then add it to my Router

```go
app.router.HandleFunc("/api/game/ws", app.apiGameWs)
```

{{% note %}}
Throughout this document, let's assume that my backend server binds to `localhost:8100`.
{{% /note %}}

The one part I never did figure out was how to detect a client connection closing in Go (closing the browser, for example).  I'd like to be able to flag players as in-active when their connection closes so that they don't hold up the game play.  I've tried a variety of things and eventually settled on a super cheesy client-side ping over HTTP (rather than the WebSocket).  


# Create-React-App and WebSockets

I then used *Create-React-App* to build the scaffolding for the client part of *werdz*.  *Create-React-App* is pretty slick because it gets rid of a lot of the decisions and setup work and lets me get creating in no time.

I used the `--template typescript` option so that my template project is TypeScript rather than plain old JavaScript.

*Create-React-App* includes a super handy development server with automatic page refreshing.  You start it with:

```
$ npm run start
```

But... This server only hosts the client side of my application (by default on port 3000) while my server (written in GoLang) is running over on port 8100.  While I *could* prefix every API call in the client code with `http://localhost:8100` this creates a bunch of problems:

1. It's hard to deploy because I'd need to swap that out with something else in production builds
2. I'm going end up with a bunch of annoying to fix CORS errors

What I want, and what I would do in production, is:

* `/api/*` served by backend Go server
* everything else served from my client application

The Proxying in Development section of the Create-React-Apps documentation suggests the solution is to add the `proxy` setting to `package.json` and everything will magically work.

> The proxy option supports HTTP, HTTPS and **WebSocket** connections.

Unfortunately, it [does](https://github.com/facebook/create-react-app/issues/6497) [not](https://github.com/facebook/create-react-app/issues/5280).  It looks like a fix is in the works but as I sit today (April 2019), this documented feature does not work.

The fix was a little tough to track down.  You have to manually configure the proxy server.

```
$ npm install --save http-proxy-middleware
```

Create a file called `setupProxy.js` in the `src` folder under your React project, and fill it with the following.  

```js
const proxy = require("http-proxy-middleware")

module.exports = app => {
  app.use('/api', proxy.createProxyMiddleware({target: "http://localhost:8100", ws: true}))
}
```

Now, you may find yourself thinking, like I did, "Hey, I'm a Typescript app so I'll just create this as `setupProxy.ts`".  Don't do it.  This also, despite the documentation suggestion it should be fine, does [not work](https://github.com/facebook/create-react-app/issues/6794).

{{% warning %}}
One last gotcha that had me stumped for a while.  You need to remove the `proxy` property from `package.json` or Create-React-App will just ignore `setupProxy.js`.
{{% /warning %}}


# NGINX Proxy

The above got me up and running for development but the development server in *Create-React-App* is not suitable for production use and I wanted to run this on an existing server that was already running NGINX.

This part turned out to be fairly easy.

*Create-React-App* includes a helpful `build` function that builds optimized production versions of the client-side of the application.

```
$ npm run build
```

The output is placed into the `build` subdirectory and all of that gets copied across to somewhere on the production server (in my case `/var/www/werdz.ca`).

We can configure NGINX to host the contents of that folder in the usual way.

```
server {
  server_name werdz.ca;
  root /var/www/werdz.ca;
  index index.html;
  access_log /var/log/nginx/access-werdz.log;
  listen [::]:443 ssl ; # managed by Certbot
  listen 443 ssl ; # managed by Certbot
  ssl_certificate /etc/letsencrypt/live/werdz.ca/fullchain.pem; # managed by Certbot
  ssl_certificate_key /etc/letsencrypt/live/werdz.ca/privkey.pem; # managed by Certbot
  include /etc/letsencrypt/options-ssl-nginx.conf; # managed by Certbot
  ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem; # managed by Certbot
}
```

In my React application, I'm using BrowserRouter (which gives URLs like `/game/xyz` instead of `#games/xyz`).  However, because those routes don't exist as files, I need to redirect those back to my React application and let it handle those.  We can do it by redirecting 404's back to `/index.html`.

```
  location / {
    try_files $uri /index.html =404;
  }
```

So far, that only handles the client-side.  The last thing to do is proxy requests to `/api` through to my backend process (being sure to handle websockets).  That involves adding a few more things to NGINX.

```

map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

  location /api/ {
    proxy_pass http://localhost:8100;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;
    proxy_set_header Host $host;
  }
```

The finally configuration looks like this:

```

map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

server {
  server_name werdz.ca;
  root /var/www/werdz.ca;
  index index.html;
  access_log /var/log/nginx/access-werdz.log;
  listen [::]:443 ssl ; # managed by Certbot
  listen 443 ssl ; # managed by Certbot
  ssl_certificate /etc/letsencrypt/live/werdz.ca/fullchain.pem; # managed by Certbot
  ssl_certificate_key /etc/letsencrypt/live/werdz.ca/privkey.pem; # managed by Certbot
  include /etc/letsencrypt/options-ssl-nginx.conf; # managed by Certbot
  ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem; # managed by Certbot

  location / {
    try_files $uri /index.html =404;
  }


  location /api/ {
    proxy_pass http://localhost:8100;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;
    proxy_set_header Host $host;
  }

}
```

That got me up and running.  Longer-term, I'm going to deploy all of this into a Docker container and deploy that, rather than what I'm currently doing.