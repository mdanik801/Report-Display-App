const fs = require('fs');
const path = require('path');

const publicIndex = path.join(__dirname, '..', 'public', 'index.html');
const publicCss = path.join(__dirname, '..', 'public', 'style.css');
const publicJs = path.join(__dirname, '..', 'public', 'script.js');
const rootIndex = path.join(__dirname, '..', 'index.html');

let html = fs.readFileSync(publicIndex, 'utf8');
const css = fs.readFileSync(publicCss, 'utf8');
const js = fs.readFileSync(publicJs, 'utf8');

html = html.replace(/<link rel="stylesheet" href="\/??style\.css" \/>/, '<style>\n' + css + '\n</style>');
html = html.replace(/<script src="\/??script\.js"><\/script>/, '<script>\n' + js + '\n</script>');

fs.writeFileSync(rootIndex, html, 'utf8');
console.log('Successfully bundled standalone index.html (' + html.length + ' bytes)');
