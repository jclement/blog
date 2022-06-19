---
title: Yubikey Setup
date: 2019-10-05
comments: true
tags: [yubikey, raspberrypi]
categories: ["tutorial"]
showToc: true
draft: true
---

# Overview

# Before You Start

# RasberryPi Setup

## Installing Dependencies

```
sudo apt update 
sudo apt -y upgrade
sudo apt install haveged gnupg2 scdaemon tmux vim pwgen ecryptfs-utils cryptsetup lsof yubikey-manager
```

## Disabling Wireless and Networking

Disconnect any network cables and disable Wifi and Bluetooth for the Pi.

```
echo "dtoverlay=pi3-disable-wifi" | sudo tee -a /boot/config.txt
echo "dtoverlay=pi3-disable-bt" | sudo tee -a /boot/config.txt
sudo systemctl disable hciuart
sudo reboot
```

{{% warning %}}
Do not proceed until the Pi is completely disconnected from the Internet.
{{% /warning %}}

## Setup up a New User

Create the user.  Select a strong password or passphrase:
```
sudo adduser user
```

Enable encryption of the new user's home directory:
```
ecryptfs-migrate-home -u user
```

Allow the new user to use sudo:
```
echo "user ALL=(ALL) NOPASSWD: ALL" | sudo tee /etc/sudoers.d/020_user-nopasswd
```

Finally, make sure your new user can login to the new user and that you can run things with sudo.

If this work, delete the `pi` user.
```
sudo deluser pi
```

# GnuPG Setup

## Yubikey Setup

## Move OTP to slot 2

```
ykman otp swap
```

## GnuPG Key Generation

Generate the master key:
```
gpg --full-gen-key
1
4096
2y
y
```

Add additional UIDs, if required:
```
gpg --edit-key test@test.com
adduid
1
primary
save
```

Backup the master key:
```
gpg --export-secret-key -a test@test.com > master.gpg
```

Add subkeys:
```
gpg --expert --edit-key test@test.com
```

Signing Subkey:
```
gpg> addkey
```

| Prompt | Response | Note |
|---|---|---|
| Key Type | 4 | "RSA (sign only)" |
| What keysize do you want? | 4096 | |
| Key is valid for? | 1y | |
| Is this correct? | y | |
| Really create? | y | |

Encryption Subkey:
```
gpg> addkey
```

| Prompt | Response | Note |
|---|---|---|
| Key Type | 6 | "RSA (encrypt only)" |
| What keysize do you want? | 4096 | |
| Key is valid for? | 1y | |
| Is this correct? | y | |
| Really create? | y | |

Authentication Subkey:
```
gpg> addkey
```

| Prompt | Response | Note |
|---|---|---|
| Key Type | 8 | "RSA (set your own abilities)" |
| Your selection? | S | Turn off signing |
| Your selection? | E | Turn off encryption |
| Your selection? | A | Turn on authentication |
| Your selection? | Q | Quit key abilities menu|
| What keysize do you want? | 4096 | |
| Key is valid for? | 1y | |
| Is this correct? | y | |
| Really create? | y | |

Save the changes to your key:
```
gpg> save
```

Backup our secret subkeys:
```
gpg --export-secret-subjets -a test@test.com > subkeys.gpg
```




# Workstation Setup

## MacOS

## Windows 10

## Linux