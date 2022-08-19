---
title: "Tailscale Pi-hole Setup"
date: 2022-08-19
showTableOfContents: true
draft: false
categories: ["tutorial"]
tags: ["privacy", "self-hosting", "tailscale"]
---

I've recently started using the overlay network [Tailscale](https://tailscale.com/) to provide connectivity between my various machines, regardless of where I am.  It's extremely easy to configure and "just works".  Tailscale also includes a feature called MagicDNS that provides name resolution for machines on my tailnet (i.e. so that `ping server123` magically just works).  MagicDNS also allows you to override local DNS settings and force a custom DNS server for name resolution machines on your tailnet.  This post documents the setup of [Pi-hole](https://pi-hole.net/) (accessible only to machines on my tailnet) to provide some level of DNS privacy and Ad Blocking for machines on my tailnet.

<!--more-->

{{<figure src="pihole.png" default="true">}}

I have a Digital Ocean VPS that I wanted to use for my Pi-hole instance (since failures in DNS are annoying, I wanted it more reliable than putting this on my home servers).  I already had Docker configured on this machine and the setup will leverage that.

The first step was to create a `docker-compose.yml` file that would spin up two containers.  
1. The `tailscale` container handles connecting to tailscale and providing tailnet connectivity to another
2. The `pihole` container seems self explanatory :smile:

{{<note>}}
Make sure to update the highlighted lines below to set the machine name for your Pi-hole instance, the timezone, and a secure password for the Pi-hole Admin UI.
{{</note>}}

{{<highlight docker "linenos=table,hl_lines=5 19-20">}}
version: "3.7"

services:
  tailscale:
        hostname: pihole                         # This will become the tailscale device name
        image: tailscale/tailscale
        volumes:
            - tailscale:/var/lib/tailscale        # State data will be stored in this directory
            - "/dev/net/tun:/dev/net/tun"           # Required for tailscale to work
        cap_add:                                    # Required for tailscale to work
          - net_admin
          - sys_module
        command: tailscaled

  pihole:
    network_mode: service:tailscale
    image: pihole/pihole:latest
    environment:
      TZ: 'America/Edmonton'
      WEBPASSWORD: 'SECURE_PASSWORD_HERE'
      DNSSEC: true
    volumes:
      - 'etc-pihole:/etc/pihole'
      - 'etc-dnsmasq.d:/etc/dnsmasq.d'
    restart: unless-stopped

volumes:
  tailscale:
  etc-pihole:
{{</highlight>}}

Next, start up the containers.

```txt
$ docker compose up
```

Then we have to connect our tailscale container to our tailnet manually the first time.

```txt
$ docker compose exec tailscale tailscale up 

To authenticate, visit:

        https://login.tailscale.com/a/aaaaaaaaaaaa
```

Copy the above URL and load that up in a browser to add this new node to your tailnet (authorizing it if necessary).

{{<note>}}
Make sure to turn off Key Expiry for this node or you'll have a nasty DNS failure in 6 months.
{{</note>}}

Make sure the Tailscale ACL allows connectivity from your other nodes.  Your ACL should include some stuff kinda like this.

```json
{	
    "hosts": {
		"pihole":   "100.104.250.27", // from admin console
	},
	"acls": [
		{
			"action": "accept",
			"src":    ["*"],
			"dst":    ["pihole:53", "pihole:80"],
		}
	],
}
```

Finally, turn on MagicDNS (if it's not on already), add your Pi-hole tailnet IP address (100.104.250.27 in my example) to your list of Global Nameservers and toggle `Override local DNS`.

{{<figure src="magicdns.png" default="true">}}

You should now be able to connect to your Pi-hole instance over your tailnet `http://pihole/admin` and configure it (using the password in your configured password).  Make sure to adjust it to permit requests from all origins (safe since this thing is only accessible to your machines on your tailnet).

{{<figure src="origins.png" default="true">}}

From machines on your tailnet, you should be able to verify things are working properly with `nslookup`.

A non-blocked site should work as normal.

```
$ nslookup alpha.erraticbits.ca
Server:  magicdns.localhost-tailscale-daemon
Address:  100.100.100.100

Non-authoritative answer:
Name:    alpha.erraticbits.ca
Addresses:  2604:a880:cad:d0::ec0:2001
          165.227.32.145
```

And you can see the request hit the Query Log on the Pi-hole instance.

{{<figure src="ok.png" default="true">}}

A query for a blocked Ad CDN will fail:

```
$ nslookup cdn.bannersnack.com
Server:  magicdns.localhost-tailscale-daemon
Address:  100.100.100.100

Name:    cdn.bannersnack.com
Addresses:  ::
          0.0.0.0
```

And you can see that failure in Pi-hole's Query Log.

{{<figure src="fail.png" default="true">}}

That's it.  