---
title:  OpenBSD Yubikey Authentication
tags: [openbsd, yubikey]
date: 2014-05-05
comments: true
---

OpenBSD includes out-of-the-box support for login via. [YubiKey][yubikey].  Yay!

OpenBSD doesn't authenticate against a central server (such as the service offered by Yubico) to verify a YubiKey.  This is good because I don't have to trust a 3rd party with my credentials.  Unfortunately, this also means that OpenBSD is tracking the "last-use" token (not centralized) which means that without somehow synchronizing the "last-use" value I can only safely use a YubiKey token on a single machine.  Using it on multiple machines would open me up to replay attacks where a YubiKey entered on one machine (where "last-use" is big), could be used on another machine (where "last-use" is smaller).

I can live with this but it's something to be aware of.

The OpenBSD YubiKey authentication ''replaces'' password authentication.  Ideally, I would have to provide both a password and a YubiKey as credentials so that finding my YubiKey is not sufficient to compromise my system.  Fortunately [a patch exists][patch] that allows me to use both.

<div class="alert alert-success">
<b>Update:</b> See my <a href="../openbsd-yubikey-pin/">login_yubikey.c patch</a> that adds support for an additional PIN when logging in with a Yubikey.
</div>

## Configuring the YubiKey ##

Configuring the YubiKey is a bit of a pain.  Yubico offers some nice utilities and it's easiest to run these on Windows.  My preferred approach is to setup a Windows VM with the Yubi tools, turn off networking, snapshot it, program my YubiKeys, record the private id / secret key, and then rollback the snapshot.

Roughly:

1. Start the YubiKey Personalization Tool
2. Insert your YubiKey
3. Click "Yubico OTP" in the header at the top
4. Click "Quick"
5. Choose a configuration slot to program (1 is often pre-programmed so you may want to be careful overwriting that)
6. Record the "Private Identity" and "Secret Key"
7. Click "Write Configuration" to push those keys onto your YubiKey

The "Advanced" mode lets you lock your YubiKey to prevent overwriting your credentials.

![Yubikey Setup](setup.png)

## Configuring OpenBSD to Login via. YubiKey ##

1. Grab the value from the "Private Identity" field and put it into `/var/db/yubikey/$user.uid` (removing all the spaces!)
2. Grab the value from the "Secret Key" field and put it into `/var/db/yubikey/$user.key` (removing all the spaces!)
3. Make sure permissions are correct (owned by root.auth, 0640)

<div class="alert alert-info">I got hung up on the lack of spaces in the identity/key values.  The YubiKey personalization tool includes spaces between hex digits while the OpenBSD configuration files do not. </div>

Note: The echo "..." statements below work but shouldn't really be used.  They will expose the secret key in the process list and your shell's history.  Best to just open the files in a text editor and type/paste those values in.

```
# cd /var/db/yubikey
# echo "f2a4ac5bb965" > bob.uid
# echo "b70c2224b328523b43d46f4bdb5221a6" > bob.key
# chown root.auth bob.*
# chmod 640 bob.*
# ls -l
total 32
-rw-r-----  1 root  auth  33 Apr 16 07:32 bob.key
-rw-r-----  1 root  auth  13 Apr 16 07:32 bob.uid
-rw-rw----  1 root  auth   3 Apr 16 07:30 root.ctr
-rw-r-----  1 root  auth  33 Apr 16 07:29 root.key
-rw-r-----  1 root  auth  13 Apr 16 07:29 root.uid
```

Open `/etc/login.conf` and add "yubikey" to the auth-defaults.  

<div class="alert alert-danger">This will REQUIRE YubiKey logins for <b>ALL</b> users of the system so make sure you have one setup for root before enabling this or you'll be fixing it with single-user mode.</div>

```
auth-defaults:auth=yubikey,passwd,skey:
```

## Configuring SSH to require YubiKey + Public ##

I choose to configure SSH to require login using a public key AND my YubiKey by adding the following two lines to `/etc/ssh/sshd_config`.

```
AuthenticationMethods publickey,password
PasswordAuthentication no
```

When you login you should see something like this:

```
$ ssh bob@localhost
OpenBSD 5.4 (GENERIC) #37: Tue Jul 30 15:24:05 MDT 2013
Enter passphrase for key '/home/bob/.ssh/id_ecdsa':
Authenticated with partial success.
bob@localhost's password: [PRESS YUBIKEY BUTTON HERE]
$
```

[article]: http://blog.cmacr.ae/2fa-with-the-yubikey-for-ssh-access/
[yubikey]: https://www.yubico.com/products/yubikey-hardware/yubikey/
[patch]: http://comments.gmane.org/gmane.os.openbsd.tech/34693
