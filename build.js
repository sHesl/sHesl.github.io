const showdown = require('showdown');
const fs = require('fs');

const converter = new showdown.Converter({strikethrough: true});

const mdDir = './md/';
const postDir = './posts/';

const contentPlaceholder = '{{CONTENT}}';
const template = fs.readFileSync('template.html');

fs.readdir(mdDir, (err, filenames) => {
  if (err) {
    console.error(err);
    return;
  }

  filenames.forEach((filename) => {
    fs.readFile(mdDir + filename, 'utf-8', (err, content) => {
      if (err) {
        console.error(err);
        return;
      }

      const postHtml = converter.makeHtml(content);
      const post = template.toString().replace(contentPlaceholder, postHtml);
      const postFileName = filename.replace('.md', '.html');
      fs.writeFile(postDir + postFileName, post, console.error);
    });
  });
});

