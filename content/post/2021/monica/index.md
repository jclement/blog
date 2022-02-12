---
title: "Monica on Docker"
date: 2021-05-07
tags: 
  - docker
---

I recently came across a post on Mastodon about someone adopting a personal CRM ([Monica CRM](https://www.monicahq.com/)) as a way of keeping track of their personal relationships.

This idea resonated with me.  I have a really hard time remembering details of past conversations, and getting in the habit of reaching out to friends (life just plows ahead).  It's not that I don't care... it just doesn't stick.  

Monica CRM captured my interest for several reasons:

* It's pretty.  I hate using clunky ugly apps.
* It's self-hostable.  Given the sensitive nature of this information, I much prefer that I own & manage the data.
* It can share contact information with my devices & email clients via. CardDAV.
* It can run under Docker (keeping it a bit more isolated and the setup easier)
* It can track previous conversations, debts, gifts, tasks, as well as remind you to get in touch with someone at some interval.  Handy!

Unfortunately, there are a few negatives:
* CardDav is great for getting contacts / contact information onto a phone.  Unfortunately, this isn't a solution for syncing across "what did we last talk about" type information (I do realize there isn't really a field for this).  Fortunately, the app is responsive so accessing it on a phone isn't too bad.
* No native apps.  Like I said, the UI is responsive and does OK on a mobile device, but it certainly doesn't feel native.  Given how many personal interactions happen while away from my desk, I'd prefer a great mobile experience.

That said, it's still a great piece of software that solves a real problem for me.

Which brings me to installing it. 

While I like the idea of Docker, I am not "all in" on Docker or containerization yet.  I have NGINX running on my server, and use that to proxy traffic through to individual Docker containers, rather than doing everything within Docker.

So...

On my server, I create a `docker-compose.yml` file looks like the following (APP_KEY should be a big random string, and obviously adjust URL and MAIL_* to match your needs):

```
version: "3.4"

services:
  app:
    image: monica
    depends_on:
      - db
    environment:
      - APP_KEY=....
      - APP_ENV=production
      - APP_URL=https://crm.erraticbits.ca
      - DB_HOST=db
      - MAIL_DRIVER=smtp
      - MAIL_HOST=box.erraticbits.ca
      - MAIL_USERNAME=crm@erraticbits.ca
      - MAIL_FROM_ADDRESS=crm@erraticbits.ca
      - MAIL_PASSWORD=....
      - MAIL_PORT=587
    volumes:
      - data:/var/www/html/storage
    restart: always
    ports:
            - 127.0.0.1:18012:80

  db:
    image: mysql:5.7
    environment:
      - MYSQL_RANDOM_ROOT_PASSWORD=true
      - MYSQL_DATABASE=monica
      - MYSQL_USER=homestead
      - MYSQL_PASSWORD=secret
    volumes:
      - mysql:/var/lib/mysql
    restart: always

volumes:
  data:
    name: data
  mysql:
    name: mysql

```

After starting this up `docker-compose up -d`, I now have Monica listening on 127.0.0.1:18102 on my server.

Next, I add a new Virtual Host (`/etc/nginx/sites-available/crm.erraticbits.ca.config` and symlink that to `/etc/nginx/sites-enabled/crm.erraticbits.ca.config`) on my local NGINX server to redirect traffic from "crm.erraticbits.ca" to "127.0.0.1:18102" (using certbot to fetch an SSL certificate for this thing).

```
server {
  listen 80;
  listen [::]:80;
  server_name crm.erraticbits.ca;
  return 301 https://crm.erraticbits.ca$request_uri;
}

server {
  server_name crm.erraticbits.ca;
  root /var/www/crm.erraticbits.ca;

  listen [::]:443 ssl; # managed by Certbot
  listen 443 ssl; # managed by Certbot
  ssl_certificate /etc/letsencrypt/live/crm.erraticbits.ca/fullchain.pem; # managed by Certbot
  ssl_certificate_key /etc/letsencrypt/live/crm.erraticbits.ca/privkey.pem; # managed by Certbot
  include /etc/letsencrypt/options-ssl-nginx.conf; # managed by Certbot
  ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem; # managed by Certbot

  location / {
    try_files $uri $uri @crm;
  }

  location @crm {
    proxy_pass  http://127.0.0.1:18012;
    proxy_set_header Host $http_host;
    proxy_set_header X-NginX-Proxy true;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
  }

}
```

Restart NGINX and voila.

In the future, upgrades are fairly easy:

```sh
$ docker-compose pull
$ docker-compose up -d
```

And, of course, for backups of the data, something like the following run periodically will extract useful data from the app and database containers, which can then be backed up using your normal tooling (I love [Restic](https://restic.net/)):

```sh
docker run --rm --volumes-from monica_app_1 -v ~/backup:/backup ubuntu bash -c "cd /var/www/html/storage && tar cvf /backup/app.tar ."
docker run --rm --volumes-from monica_db_1 -v ~/backup:/backup ubuntu bash -c "cd /var/lib/mysql && tar cvf /backup/db.tar ."
```
