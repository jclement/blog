---
title:  OpenBSD Yubikey Authentication with PIN
tags: [openbsd, yubikey]
date: 2014-05-05
comments: true
---

I think that using the Yubikey for authentication is worthwhile. OpenBSD's
current implementation of `login_yubikey.c`, however, relies entirely on
the one-time password.  I think the system would be stronger combining
the Yubikey with an additional PIN so that a compromise of the physical
security of the token doesn't compromise the associated account.

My work is loosely based off of [Remi Locherer's suggested patch][patch].  Where it differs is that I'd like to add an optional additional
PIN to the authentication rather than use an existing credential, such
as the system password.  My thinking is, if you are using the Yubikey
token already, the PIN probably can be a fairly low strength password. 
The system password shouldn't be set to something simple.  This allows
for relaxed rules the the Yubikey PIN without affecting the system
password policy as a whole.

I propose adding a new `/var/db/yubikey/$user.pin` file that contains an
encrypted additional PIN (password).  If present, this PIN must precede
the Yubikey one-time password when authenticating.  

The password in `$user.pin` is encrypted in a manner similar to those in
`/etc/master.passwd`.  Obviously, in a multi-user system some tool would
need to be devised to maintain these PIN/passwords.  For my purposes,
the following works

```
# encrypt > /var/db/yubi/$user.pin
password_goes_here
```

This has a couple nice side-effects:

1. By verifying hashed passwords I believe it is less susceptible to
timing attacks and doesn't need a fancy time invariant string compare function
2. Physical compromise of the Yubikey token does not immediately yield
access to the associated account
3. Compromise (read) of the contents of `/var/db/yubikey` does not
immediately allow an attacker to access those accounts

This change is non-breaking in that, if the `$user.pin` file is not
present, login_yubikey works as before.

```diff
Index: libexec/login_yubikey/login_yubikey.8
===================================================================
RCS file: /cvs/src/libexec/login_yubikey/login_yubikey.8,v
retrieving revision 1.8
diff -u -p -u -p -r1.8 login_yubikey.8
--- libexec/login_yubikey/login_yubikey.8	14 Aug 2013 08:39:31 -0000	1.8
+++ libexec/login_yubikey/login_yubikey.8	7 May 2014 13:13:50 -0000
@@ -85,8 +85,10 @@ will read the user's UID (12 hex digits)
 .Em user.uid ,
 the user's key (32 hex digits) from
 .Em user.key ,
-and the user's last-use counter from
-.Em user.ctr
+the user's last-use counter from
+.Em user.ctr ,
+and the user's PIN (optional) from
+.Em user.pin
 in the
 .Em /var/db/yubikey
 directory.
@@ -99,6 +101,14 @@ If
 does not have a last-use counter, a value of zero is used and
 any counter is accepted during the first login.
 .Pp
+If
+.Ar user
+does have a PIN file, the PIN must be provided before the one-time password
+and the PIN will be verified (using 
+.Xr crypt 8 ) against the contents of the PIN
+file.  If the PIN file is not present, the user must provide only the one-time
+password.
+.Pp
 The one-time password provided by the user is decrypted using the
 user's key.
 After the decryption, the checksum embedded in the one-time password
@@ -124,4 +134,5 @@ Directory containing user entries for Yu
 .El
 .Sh SEE ALSO
 .Xr login 1 ,
-.Xr login.conf 5
+.Xr login.conf 5 ,
+.Xr crypt 8
Index: libexec/login_yubikey/login_yubikey.c
===================================================================
RCS file: /cvs/src/libexec/login_yubikey/login_yubikey.c,v
retrieving revision 1.8
diff -u -p -u -p -r1.8 login_yubikey.c
--- libexec/login_yubikey/login_yubikey.c	27 Nov 2013 21:25:25 -0000	1.8
+++ libexec/login_yubikey/login_yubikey.c	7 May 2014 13:13:50 -0000
@@ -44,6 +44,7 @@
 #include <syslog.h>
 #include <unistd.h>
 #include <errno.h>
+#include <util.h>
 
 #include "yubikey.h"
 
@@ -54,15 +55,18 @@
 #define	AUTH_OK		0
 #define	AUTH_FAILED	-1
 
+#define YUBIKEY_LENGTH 44
+
 static const char *path = "/var/db/yubikey";
 
 static int clean_string(const char *);
 static int yubikey_login(const char *, const char *);
+static int pin_login(const char *, const char *);
 
 int
 main(int argc, char *argv[])
 {
-	int ch, ret, mode = MODE_LOGIN;
+	int ch, ret, ret_pin, mode = MODE_LOGIN;
 	FILE *f = NULL;
 	char *username, *password = NULL;
 	char response[1024];
@@ -151,9 +155,33 @@ main(int argc, char *argv[])
 		}
 	}
 
-	ret = yubikey_login(username, password);
+	int password_length = strlen(password)-YUBIKEY_LENGTH;
+
+	/* if the password length < 0 that means this isn't even long enough to contain a valid yubi token */
+	if (password_length < 0) {
+		syslog(LOG_INFO, "user %s: reject", username);
+		fprintf(f, "%s\n			 ", BI_REJECT);
+		closelog();
+		return (EXIT_SUCCESS);			 
+	}
+
+	char password_pin[password_length +1];
+	char password_yubi[YUBIKEY_LENGTH + 1];
+
+	/* first password_length bytes are PIN */
+	strlcpy(password_pin, password, password_length + 1);
+
+	/* remaining 44 bytes are yubikey token */
+	strlcpy(password_yubi, (char*)password + password_length, YUBIKEY_LENGTH + 1);
+
+	ret = yubikey_login(username, password_yubi);
+	ret_pin = pin_login(username, password_pin);
+
 	memset(password, 0, strlen(password));
-	if (ret == AUTH_OK) {
+	memset(password_pin, 0, strlen(password_pin));
+	memset(password_yubi, 0, strlen(password_yubi));
+
+	if (ret == AUTH_OK && ret_pin == AUTH_OK) { /* successfull login calls both yubi/pin code and requires AUTH_OK from both */
 		syslog(LOG_INFO, "user %s: authorize", username);
 		fprintf(f, "%s\n", BI_AUTH);
 	} else {
@@ -174,6 +202,38 @@ clean_string(const char *s)
 	}
 	return (1);
 }
+
+static int
+pin_login(const char *username, const char *pin)
+{
+	char fn[MAXPATHLEN];
+	FILE *f;
+	char encrypted_pin[101]; // pin is salted/hashed (crypt)
+
+	snprintf(fn, sizeof(fn), "%s/%s.pin", path, username);
+	if ((f = fopen(fn, "r")) == NULL) {
+		if (strlen(pin) > 0) {
+			syslog(LOG_ERR, "user %s: fopen: %s: %m", username, fn);
+			return (AUTH_FAILED);
+		} else {
+			/* if pin is empty and file is missing revert to original behaviour */
+			return (AUTH_OK);
+		}
+	}
+
+	if (fscanf(f, "%100s", encrypted_pin) != 1) {
+		syslog(LOG_ERR, "user %s: fscanf: %s: %m", username, fn);
+		fclose(f);
+		return (AUTH_FAILED);
+	}
+	fclose(f);
+
+	char* salted_pin = crypt(pin, encrypted_pin);
+	if (strcmp(salted_pin, encrypted_pin) != 0)
+		return (AUTH_FAILED);
+
+	return (AUTH_OK);
+};
 
 static int
 yubikey_login(const char *username, const char *password)
```

[patch]: http://comments.gmane.org/gmane.os.openbsd.tech/34693
