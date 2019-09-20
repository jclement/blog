---
title: Ubuntu 18.04 - Encrypted Disks with USB Boot
date: 2019-09-02
comments: true
tags: [server, crypto]
toc: true
---

I'm setting up a new Ubuntu 18.04 server and wanted the drives to be encrypted.  Since the machine is headless in my basement, however, entering a password on boot is annoying.

<!--more-->

What I want is:

1. A key file on a USB drive that I can place in the machine on boot up to avoid having to plug a keyboard
2. The ability to fall back to a passphrase if the key file is unavailable or the drive fails

This information is scattered around the Internet, but most of this post is based on this StackExechange discussion.  The bulk of this solution is from Randy Orrison but is recreated here to document what worked for me.

My server is a pretty basic installation of stock Ubuntu 18.04 with Encrypted LVM.  My main drive is `/dev/sda` and my USB drive is `/dev/sdd`.  On installation, I entered a passphrase for the Encrypted volume.  I want to keep that but also add a key file.

```
NAME                     MAJ:MIN RM   SIZE RO TYPE  MOUNTPOINT
sda                        8:0    0 273.4G  0 disk
├─sda1                     8:1    0   731M  0 part  /boot
├─sda2                     8:2    0     1K  0 part
└─sda5                     8:5    0 272.7G  0 part
  └─sdb5_crypt           253:0    0 272.7G  0 crypt
    ├─server--vg-root    253:1    0 271.7G  0 lvm   /
    └─server--vg-swap_1  253:2    0   980M  0 lvm   [SWAP]
sdd                        8:48   1   7.3G  0 disk
└─sdd1                     8:49   1   7.3G  0 part
```

First I created a key file:

```
dd if=/dev/random of=keyfile bs=512 count=4
```

Luks supports multiple unlock keys, so next I added this key to my luksKeys.

```
sudo cryptsetup luksAddKey /dev/sda5 keyfile
```

Next, create a brand new ext2 file system on `/dev/sdd1` and give it a label of KEYS so we can refer to it later.

```
sudo mkfs -t ext2 /dev/sdd1
sudo e2label /dev/sdd1 KEYS
```

Copy the keyfile to the USB drive.

```
mkdir KEYS
sudo mount /dev/sdd1 KEYS
sudo cp keyfile KEYS
sudo chown root.root KEYS/keyfile
sudo chmod 400 KEYS/keyfile
```

Ubuntu doesn't ship with a mode that tries the key file on device first, and then falls back to keyboard entry but VarunAgw provided this script which does.  Create it as `/lib/cryptsetup/scripts/autounlock` and make it executable sudo `chmod +x /lib/cryptsetup/scripts/autounlock`.

```sh
#!/bin/sh

ask_for_password () {
    cryptkey="Unlocking the disk $cryptsource ($crypttarget)\nEnter passphrase: "
    if [ -x /bin/plymouth ] && plymouth --ping; then
        cryptkeyscript="plymouth ask-for-password --prompt"
        cryptkey=$(printf "$cryptkey")
    else
        cryptkeyscript="/lib/cryptsetup/askpass"
    fi
    $cryptkeyscript "$cryptkey"
}

device=$(echo $1 | cut -d: -f1)
filepath=$(echo $1 | cut -d: -f2)

# Ask for password if device doesn't exist
if [ ! -b $device ]; then
    ask_for_password
    exit
fi

mkdir /tmp/auto_unlocker
mount $device /tmp/auto_unlocker

# Again ask for password if device exist but file doesn't exist
if [ ! -e /tmp/auto_unlocker$filepath ]; then
    ask_for_password
else
    cat /tmp/auto_unlocker$filepath
fi

umount /tmp/auto_unlocker
```

Now modify /etc/crypttab and modify the line that looks like:

```
sdb5_crypt UUID=(...) none luks,discard
```

With:

```
sdb5_crypt UUID=(...) /dev/disk/by-label/KEYS:/keyfile luks,discard,keyscript=/lib/cryptsetup/scripts/autounlock
```

Finally, update initramfs and reboot!

```
sudo update-initramfs -uv
sudo reboot
```

The machine will automatically mount the encrypted volumes and boot when the USB drive is present.  If the USB drive is not present, the usual password prompt will appear and you can boot using the passphrase you provided when installing Ubuntu in the first place.
There is one annoying little issue where the system will pause for a couple minutes on bootup with a message like "A start job is running for dev/disk/by-label/KEYS...", but it doesn't seem to hurt anything.
