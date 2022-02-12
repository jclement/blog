---
title: Blog with Hugo, Gitlab CD, and Caddy
date: 2019-09-20
comments: true
tags: [server]
showToc: true
---

This post is an overview on how I setup this site (built using [Hugo](https://gohugo.io)) to be automatically deployed to my [Caddy](https://caddyserver.com/) server using [Gitlab's](https://gitlab.com) continuous deployment.

<!-- more -->

I routinely swap between fancy blogging tools like Ghost and Wordpress as well as static site generation tools like Jekyll and Hugo far more often than I should.  

I keep coming back to static site generation for several reasons:

 - **Server footprint** - It's easy to host static files.  They can be easily deployed via Amazon S3, Digital Ocean Spaces, or any random web server technology.  Static sites are trivial to scale.  Static sites have a tighter security footprint (no giant PHP process handling requests).  Static sites are faster (page generation done when content is added, not when it's viewed).
 - **Longevity** -  I like that I can zip up the contents of my website and store it somewhere and be pretty sure I'll be able to read it in 15 years.

<strike>The primary downside of a static blog is that you are stuck using tools like Disqus for comments (if you want those), which means that some 3rd party is capturing information about my visitors. </strike> I've added a bonus section below that details adding client-side search to the website so we can avoid passing visitor information to Google.

Another major annoyance for me has been deploying the static sites to production facing servers.  This post is all about automating that.

So...

The source code for my blog is stored in a private git repository on my personal Gitlab server running out of my basement.

I wanted to automatically publish updates (commits) to my blog to a separate web server hosted by Digital Ocean.  This means that when I commit to my blog project on Gitlab, I want to use Gitlab's CD mechanism to automatically build my blog and then copy it across to my public facing webserver.

This post details most of the steps required to set up my Hugo based blog to be automatically published when I update it.

# Caddy Server Setup

Let's start with the setup of the web server itself.

Historically I've used NGINX or Apache for hosting my websites.  This time around, I selected Caddy.  My primary reason for choosing Caddy was that it's something new and different (for me). I was also drawn to its simplicity, its seamless out-of-the-box HTTPS using LetsEncrypt, as well as HTTP/2 support by default.

## Caddy Installation

I started with a brand new Ubuntu 18.04 droplet on Digital Ocean (my VPS provider of choice).

Installing Caddy is a bit different because it's no (currently) in the package repos for Ubuntu.  Instead, it's packaged as a single binary.

The first step is to download and install the Caddy server to `/usr/local/bin`.

```
curl https://getcaddy.com | sudo bash -s personal
```

I'm running Caddy on the base machine (not in Docker), so the next steps are to set it up to run happily under systemd.  I followed the instructions [here](https://github.com/caddyserver/caddy/tree/master/dist/init/linux-systemd) (summarized below).

```
# allow Caddy to bind to 80 & 443
sudo setcap 'cap_net_bind_service=+ep' /usr/local/bin/caddy

# setup www-data user and group
sudo groupadd -g 33 www-data
sudo useradd \
  -g www-data --no-user-group \
  --home-dir /var/www --no-create-home \
  --shell /usr/sbin/nologin \
  --system --uid 33 www-data

sudo mkdir /etc/caddy
sudo chown -R root:root /etc/caddy
sudo mkdir /etc/ssl/caddy
sudo chown -R root:www-data /etc/ssl/caddy
sudo chmod 0770 /etc/ssl/caddy

# Setup placeholder Caddyfile
sudo touch /etc/caddy/Caddyfile
sudo chown root:root /etc/caddy/Caddyfile
sudo chmod 644 /etc/caddy/Caddyfile

# Setup /var/www
sudo mkdir /var/www
sudo chown www-data:www-data /var/www
sudo chmod 555 /var/www

# Add service for Caddy to systemd
wget https://raw.githubusercontent.com/caddyserver/caddy/master/dist/init/linux-systemd/caddy.service
sudo cp caddy.service /etc/systemd/system/
sudo chown root:root /etc/systemd/system/caddy.service
sudo chmod 644 /etc/systemd/system/caddy.service
sudo systemctl daemon-reload
sudo systemctl start caddy.service
sudo systemctl enable caddy.service
```

## Caddy Configuration

I'm hosting content for my blog (erraticbits.ca), so I'm going to create a folder under `/var/www` for my domain (erraticbits.ca), and add some configuration to my `/etc/caddy/Caddyfile`.

```
mkdir /var/www/erraticbits.ca
```

Next, I need to add a virtual host for erraticbits.ca to my Caddyfile `/etc/caddy/Caddyfile`:

```
erraticbits.ca {
  root /var/www/erraticbits.ca
  gzip
  errors {
   404 404.html
  }
}
```

I'd also like to redirect www.erraticbits.ca to erraticbits.ca, so I'll also add the following to `/etc/caddy/Caddyfile`.

```
www.erraticbits.ca {
  redir https://erraticbits.ca{uri}
}
```

At this point, assuming DNS is correctly pointing at this machine, I can restart Caddyserver and it will automatically grab an SSL certificate for erraticbits.ca and www.erraticbits.ca from LetsEncrypt, and start serving the contents of `/var/www/erraticbits.ca` for requests to erraticbits.ca.  

```
sudo systemctl restart caddy.service
```


## Generating Deployment Keys

The final steps required on the webserver machine are to set ourselves up for automated deployment by generating a new user which we'll use for deployment (`deploy_erraticbits`), and creating a new SSH keypair for our deployment process.

```
sudo adduser --disabled-password deploy_erraticbits
```

Create a SSH keypair for our deployment keys (make sure not to enter a password!):

```
ssh-keygen  -t ed25519 -f ~/deploy_erraticbits
```

Add the public key we just generated to the list of authorized keys `~/.ssh/authorized_keys`.

```
sudo -u deploy_erraticbits mkdir ~/.ssh
cat ~/deploy_erraticbits.pub | sudo -u deploy_erraticbits tee ~/.ssh/authorized_keys
```

Finally, copy the private contents of the private key (`~/deploy_erraticbits`) file somewhere safe.  We'll need those in a second when configuring Gitlab.

It'll look something like this:
```
-----BEGIN OPENSSH PRIVATE KEY-----
...
...
-----END OPENSSH PRIVATE KEY-----
```

{{% warning %}}
The private key `~/deploy_erraticbits` needs to be protected.  Anyone with that key can login to the `deploy_erraticbits` user on the webserver.  Once Gitlab is setup (below), this file should be deleted from the webserver.
{{% /warning %}}

# Setting up Gitlab CI/CD

Beyond the scope of this post is setting up Gitlab build agents.  Once you've got that up and running, setting up a CI/CD process for a Hugo project is pretty straightforward.

## Setting up the SSH environment variables

The first step is to give Gitlab our private SSH key (generated above) so that our CD process can publish builds to our webserver.

We do this by adding two variables to the CI/CD configuration (`Settings > CI/CD > Variables`) for the blog project.

| Variable Name | Variable Contents | State |
|---|---|---|
| SSH_PRIVATE_KEY | Contents of `~/deploy_erraticbits` from previous step | Protected |
| SSH_KNOWN_HOSTS | SSH fingerprint of web server.  Output of `ssh-keyscan wilbur.erraticbits.ca`. | Not Protected |

It should end up looking something like this:

![Variables](variables.png)

## CI/CD Configuration

The next step is to set up a CI/CD deployment script and add it to the root of the blog repository (`.gitlab-ci.yml`).

My script has two phases: build and deploy.  In the build phase, we build our blog using a Docker container with the latest and greatest Hugo binaries and store the generated output.  In the deploy phase, we configure SSH and then rsync the output generated from the previous step to the webserver.

```
stages:
  - build
  - deploy
  
build:
  stage:  build
  image: registry.gitlab.com/pages/hugo:latest
  variables:
    GIT_SUBMODULE_STRATEGY: recursive
  script:
  - hugo version
  - hugo
  artifacts:
    paths:
    - public
  only:
  - master

deploy:
  stage:  deploy
  image: alpine:latest
  before_script:
    - apk update && apk add openssh-client bash rsync
    - eval $(ssh-agent -s)
    - echo "$SSH_PRIVATE_KEY" | tr -d '\r' | ssh-add -
    - mkdir -p ~/.ssh
    - chmod 700 ~/.ssh
    - echo "$SSH_KNOWN_HOSTS" > ~/.ssh/known_hosts
    - chmod 644 ~/.ssh/known_hosts
  environment:
    name: production
    url: erraticbits.ca
  script:
    - rsync -hrvz --delete --exclude=_ -e "ssh" --progress public/ deploy_erraticbits@wilbur.erraticbits.ca:/var/www/erraticbits.ca
  only:
    - master
```

Once this is checked in, new commits to the blog repository will automatically trigger a build and publish to the `/var/www/erraticbits.ca` folder on the webserver using the Gitlab CI/CD functionality. 

You can see build history / monitor the pipelines under the `CI/CD > Pipelines` menu in the repository.  It'll show information about each build.  If the build fails, clicking on the failed step should allow you to see the log and troubleshoot the whole thing.

![Pipelines](pipelines.png)

# Searching (bonus)

![Search Animation](search.gif)

Rather than complicating my deployment and adding some sort of server-side searching, or outsourcing search to something like Google, I've added client-side searching using [lunr](https://lunrjs.com/).  Adding client-side searching to a Hugo site, and adding that to the build process is relatively easy.

The following is largely based on [this gist](https://gist.github.com/sebz/efddfc8fdcb6b480f567).

## Generating an Index

For development and testing, you'll need NodeJS installed, and the following packages
```
npm install -g grunt
# in your website root
npm install grunt yamljs string
```

The following `Gruntfile.js` handles the building of an index by processing all markdown and HTML files and creating JSON index in `public/lunr.json`.

```js
var yaml = require("yamljs");
var S = require("string");

var CONTENT_PATH_PREFIX = "content";

module.exports = function(grunt) {

    grunt.registerTask("lunr-index", function() {

        grunt.log.writeln("Build pages index");

        var indexPages = function() {
            var pagesIndex = [];
            grunt.file.recurse(CONTENT_PATH_PREFIX, function(abspath, rootdir, subdir, filename) {
                grunt.verbose.writeln("Parse file:",abspath);
                var processedFile = processFile(abspath, filename);
                if (processedFile) {
                    pagesIndex.push(processedFile);
                }
            });

            return pagesIndex;
        };

        var processFile = function(abspath, filename) {
            var pageIndex;

            if (S(filename).endsWith(".html")) {
                pageIndex = processHTMLFile(abspath, filename);
            } else if (S(filename).endsWith(".md")) {
                pageIndex = processMDFile(abspath, filename);
            }

            return pageIndex;
        };

        var processHTMLFile = function(abspath, filename) {
            var content = grunt.file.read(abspath);
            var pageName = S(filename).chompRight(".html").s;
            var href = S(abspath)
                .chompLeft(CONTENT_PATH_PREFIX).s;
            return {
                title: pageName,
                href: href,
                content: S(content).trim().stripTags().stripPunctuation().s
            };
        };

        var processMDFile = function(abspath, filename) {
            var content = grunt.file.read(abspath);
            var pageIndex;
            // First separate the Front Matter from the content and parse it
            content = content.split("---");
            var frontMatter;
            try {
                frontMatter = yaml.parse(content[1].trim());
            } catch (e) {
                grunt.log.writeln(filename + " - " + e.message);
                return;
            }

            var href = S(abspath).chompLeft(CONTENT_PATH_PREFIX).chompRight(".md").s;
            // href for index.md files stops at the folder name
            if (filename === "index.md") {
                href = S(abspath).chompLeft(CONTENT_PATH_PREFIX).chompRight(filename).s;
            }
            
            // Skip drafts
            if (frontMatter.draft) {
                return;
            }

            // Build Lunr index for this page
            pageIndex = {
                title: frontMatter.title,
                tags: frontMatter.tags,
                href: href,
                content: S(content[2]).trim().stripTags().stripPunctuation().s
            };

            return pageIndex;
        };

        grunt.file.write("public/lunr.json", JSON.stringify(indexPages()));
        grunt.log.ok("Index built");
    });
};
```

The lunr index build can be run manually with the following in your website root:

```
grunt lunr-index
```

This will create `public/lunr.json` which contains the text content from all the website content:

```json
[{"title":"About me","href":"/about/","content":" My name is Jeff Clement I ride bikes and unicycles I make things usual
ly out of wood I make software I love computer security and privacy Contact Information EMail jeff at erraticbits dot ca Wire j
fry fingerprints Threema TUKDSKM6 fingerprint cb8a1e3e2ea4e8d9905d44f049efb36a GnuPG 0x76B1A823FCC65FA3 E8FF 07F8 CC8B 9
5..."}, ...]
```

## Adding Searching to the Template

I added the following "search" button that pops up a modal search window (I'm using Bootstrap):

```html
<a href="#modalSearch" data-toggle="modal" data-target="#modalSearch" style="outline: none;">
  <span class="hidden-sm hidden-md hidden-lg">search</span> <span id="searchglyph" class="fas fa-search"></span>
</a>
```

And then the following modelSearch window:

```html
  <div id="modalSearch" class="modal fade" role="dialog">
    <div class="modal-dialog">
      <div class="modal-content">
        <div class="modal-header">
          <button type="button" class="close" data-dismiss="modal">&times;</button>
          <h4 class="modal-title">Search</h4>
        </div>
        <div class="modal-body">

            <form style="padding-bottom: 10px">
              <div class="input-group">
                <span class="input-group-addon" id="basic-addon1"><span class="fa fa-search"></span></span>
                <input type="text" id="search" class="form-control" placeholder="Search" aria-describedby="basic-addon1">
              </div>
            </form>

            <div id="resultsPane" style="display: none;">
              <h4>Results</h4>
              <ul id="results">
              </ul>
            </div>

            <div id="noResultsPane" style="display: none;">
              There are no search results for this search.
            </div>
            <div style="font-size: 8pt; color: #888; padding-top: 10px;">
              Use "*" in your search as a wildcard (i.e. "linu*")
            </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-default" data-dismiss="modal">Close</button>
        </div>
      </div>
    </div>
  </div>
```

The following JavaScript, handles the searching behaviour:

```js
var lunrIndex, pagesIndex;

function initLunr() {
    // First retrieve the index file
    $.getJSON("/lunr.json")
        .done(function(index) {
            pagesIndex = index;

            // Set up lunrjs by declaring the fields we use
            // Also provide their boost level for the ranking
            lunrIndex = lunr(function() {
                this.field("title", {
                    boost: 10
                });
                this.field("tags", {
                    boost: 5
                });
                this.field("content");

                // ref is the result item identifier (I chose the page URL)
                this.ref("href");

                pagesIndex.forEach(function(page) {
                    this.add(page);
                }, this);
            });

            // Feed lunr with each file and let lunr actually index them
        })
        .fail(function(jqxhr, textStatus, error) {
            var err = textStatus + ", " + error;
            console.error("Error getting Hugo index file:", err);
        });
}

// Nothing crazy here, just hook up a listener on the input field
function initUI() {
    var $root = $("#modalSearch");
    var $results = $root.find("#results");

    $root.on("show.bs.modal", function(e) {
        $root.find("#search").val("");
        if (!lunrIndex) {
            initLunr();
        }
    });

    $root.find("#search").keyup(function() {
        var query = $(this).val();
        var results = search(query);
        if (!query) {
            $root.find("#resultsPane").hide();
            $root.find("#noResultsPane").hide();
        } else if (!results.length || query.length < 2) {
            $root.find("#resultsPane").hide();
            $root.find("#noResultsPane").show();
        } else {
            $root.find("#resultsPane").show();
            $root.find("#noResultsPane").hide();
            $results.empty();
            renderResults($results, results);
        }
    });
}

/**
 * Trigger a search in lunr and transform the result
 *
 * @param  {String} query
 * @return {Array}  results
 */
function search(query) {
    // Find the item in our index corresponding to the lunr one to have more info
    // Lunr result: 
    //  {ref: "/section/page1", score: 0.2725657778206127}
    // Our result:
    //  {title:"Page1", href:"/section/page1", ...}
    return lunrIndex.search(query).map(function(result) {
            return pagesIndex.filter(function(page) {
                return page.href === result.ref;
            })[0];
        });
}

/**
 * Display the 10 first results
 *
 * @param  {Array} results to display
 */
function renderResults($results, results) {
    if (!results.length) {
        return;
    }

    // Only show the ten first results
    results.slice(0, 10).forEach(function(result) {
        var $result = $("<li>");
        $result.append($("<a>", {
            href: result.href,
            text: "» " + result.title
        }));
        $results.append($result);
    });
}

$(document).ready(function() {
    initUI();
});
```

Obviously, make sure to include `lunr.min.js` and `search.js` in your page:

```html
<script src="{{ "js/lunr.min.js" | absURL }}"></script>
<script src="{{ "js/search.js" | absURL }}"></script>
```

## Building a Lunr index automatically

I add a new stage to my `.gitlab-ci.yml` file called `index`, and then added the following:

```
index:
  stage: index
  image: node
  variables:
    GIT_SUBMODULE_STRATEGY: recursive
  script:
  - npm install -g grunt
  - npm install grunt string yamljs
  - grunt lunr-index
  artifacts:
    paths:
    - public
  only:
  - master
```

And that's about it!