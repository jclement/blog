---
title: NGINX Semi-private Site
date: 2018-12-20
comments: true
tags: [server]
categories: ["tutorial"]
toc: false
---

We used to run a development blog for work.  We wanted:

1. To use NGINX to host this content.  It was all static pages.
2. To limit access to people within our network, or to employees while outside the network (phones, laptops, etc.).
3. We didn't want to deal with user accounts, active directory, etc.
4. We wanted super low friction for users. 

<!--more-->

The information wasn't super confidential but we didn't want it to be picked up by search engines and stuff like that.

What I settled on was the following:

1. Whitelist our public facing IPs.  If you are hitting the server from one of our networks, you get in.
2. Add special handling of "?key=XXXX" in the query string.  If there is a KEY, create a cookie called "key" and store whatever that value was in the cookie and then redirect to the site without that ?key= query string.
3. If the cookie exists and is set to a magic value, you get in.
4. Otherwise, 403!

This allows us to issue links to content on the blog in the form "http://blog/article?key=XXXXX" and they would always work regardless of where the user was connecting from.  Once they did that once, subsequent visits to the blog would just work.

It's not super secure or brilliant but it was a handy solution and I'm documentation the configuration here mostly so that "Future Jeff" has it for reference :)

```
location / {

    set $deny 1;

    # If we see the magic "key" param in the query string, set 
    # the cookie and redirect to the site without the query string
    if ($query_string ~ "(.*)key\=([A-Za-z0-9]+)(&?)(.*)") {
      set $key $2;
      add_header Set-Cookie "key=$key;Path=/;Max-Age=31536000";
      rewrite ^(.*)$ $1? permanent;
    }

    # Clone this section for each whitelisted IP
    if ($REMOTE_ADDR = "PUBLICIP") {
      set $deny 0;
    }

    # Adjust the SECRETMAGICKEY here with some sort of magic key (A-Z, 0-9)
    # This key is used to protect access to the entire site
    if ($http_cookie ~* "SECRETMAGICKEY") {
      set $deny 0;
    }

    # Allow access to .well-known folder so LetsEncrypt CertBot works.
    if ($request_uri ~* "/.well-known/") {
      set $deny 0;
    }
 
    if ($deny) {
      return 403;
    }

}
```