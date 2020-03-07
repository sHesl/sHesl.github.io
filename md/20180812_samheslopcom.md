# samheslop.com

Over the past year, I’ve gone from a ‘full-stack’ developer, to working almost exclusively as a back-end engineer. Apart from a sparse few PRs to our [Ravelin dashboard](https://www.ravelin.com/ravelin-enterprise), and working on the crypto elements of [ravelinjs](https://github.com/unravelin/ravelinjs), I’ve hardly touched front-end technologies, and frankly, life feels simpler as a result. Controversial opinion here, but I think the greatest minds in our industry tend to gravitate towards server-side technologies, and the respective eco-systems reflect that. The simplicities of Go have spoilt me, and now whenever I read about current front-end stacks, I can’t help but think that people have lost the forest for the trees.

`All I need is a page full of text`

That was the philosophy I followed when designing this site. I wanted to write some blog posts as a personal exercise; the act of transforming concepts and ideas into cohesive prose is a task worth dedicating some time to once in a while. I didn’t have a particular audience in mind (or assume any audience for that matter). I just wanted to focus on the content and not worry about any of the bells and whistles sites are often overencumbered with.

## My Requirements

- Posts should be written in markdown
- Adding a new post should be frictionless
- Posts should contain syntax highlighted code snippets
- Posts should load instantaniously
- HTTPS

Looking around at all the modern static site generators, they all seemed too heavyweight. Asset pipelines, intricate navigation systems, comment support, analytics... I just needed something simple to render markdown as HTML and prettify some code snippets. [Showdown](https://github.com/showdownjs/showdown) and [highlightjs](https://github.com/highlightjs/highlight.js) have that covered. No need to cook up some ungodly webpack process or create an extensive build process via gulp, I just threw together a quick build script in Node.

## The Build Process

Since I am writing pure markdown files, I needed a way to standardise on a layout and embed any includes (mostly just highlightjs and my css) into the resulting webpage. To do so, I created a small HTML template that I could base all of my posts off.

    <html>
      <head>
        <title>Sam Heslop</title>
        <meta charset=“utf-8”>
        <link rel=“stylesheet” type=“text/css” href=“../style.css”>
        <link href=“https://fonts.googleapis.com/css?family=Oxygen” rel=“stylesheet”>
      </head>
      <body>
        <div>
          <p><a href=“https://samheslop.com” class=“me”>Sam Heslop</a><p>
        </div>
        <div id=“md”>
          {{CONTENT}}
        </div>
        <script src=“../highlight.pack.js”></script>
        <script>
        window.onload = function(){var aCodes=document.getElementsByTagName(‘pre’);for(var i=0;i<aCodes.length;i++) {hljs.highlightBlock(aCodes[i]);}};
        </script>
      </body>
    </html>

And then I wrote a quick build script to take these markdown files, render them as HTML via showdown, and place the resulting content inside the {{CONTENT}} block of my template.

    const showdown = require(‘showdown’);
    const fs = require(‘fs’);

    const converter = new showdown.Converter();

    const mdDir = ‘./md/‘;
    const postDir = ‘./posts/‘;

    const contentPlaceholder = ‘{{CONTENT}}’;
    const template = fs.readFileSync(‘template.html’);

    fs.readdir(mdDir, (err, filenames) => {
      if (err) {
        console.error(err);
        return;
      }

      filenames.forEach((filename) => {
        fs.readFile(mdDir + filename, ‘utf-8’, (err, content) => {
          if (err) {
            console.error(err);
            return;
          }

          const postHtml = converter.makeHtml(content);
          const post = template.toString().replace(contentPlaceholder, postHtml);
          const postFileName = filename.replace(‘.md’, ‘.html’);
          fs.writeFile(postDir + postFileName, post, console.error);
        });
      });
    });

I added the running of this script into my package.json `{"scripts"{ "build": "node build.js"}}`. Now I can simple create a new markdown file in my /md directory, write out a blog post, then run an `npm run build` and the new post is ready for the world!

Github Pages (and a nice domain name from Google Domain) was all it took to get this thing ready for the world. The free HTTPS support from Github is a nice addition.

## Summary
Some devs like to use a person site as a way to show some personality and showcase their skills, but I’d argue I’ve done the same. I’ve produced something that is as simple as it could possibly be, something practical, something fast, and something wholly functional. Writing new posts is a breeze, and if I ever get lax about adding new ones, it will take me less than a minute to realise how this thing is pieced together and how to build a new entry, so I’ll be able to just get straight to what’s important, the words themselves.
