import { readFileSync as read, writeFileSync as write } from 'node:fs';
const dir = 'prototypes/whiteboard/';
let html = read(dir + 'index.html', 'utf8');
for (const file of ['experience.css', 'style.css']) {
  const css = read(dir + file, 'utf8').replace(/^\uFEFF/, '').replace('url("fonts/PatrickHand-Regular.ttf")', 'url("data:font/ttf;base64,' + read(dir + 'fonts/PatrickHand-Regular.ttf').toString('base64') + '")');
  html = html.replace('<link rel="stylesheet" href="' + file + '">', () => '<style>' + css + '</style>');
}
for (const file of ['data.js', 'app.js']) {
  let script = read(dir + file, 'utf8').replace(/^\uFEFF/, '');
  if (file === 'app.js') {
    script = script.replace(/'(mascots\/[a-z]+\.webp)'/g, (_match, asset) => `'data:image/webp;base64,${read(dir + asset).toString('base64')}'`);
    script = script.replaceAll('src="full-marks-seal-v2.png"', 'src="data:image/png;base64,' + read(dir + 'full-marks-seal-v2.png').toString('base64') + '"');
  }
  if (/<\/script/i.test(script)) throw Error('Inline script terminator in ' + file);
  html = html.replace(new RegExp('<script src="' + file + '"(?: defer)?></script>'), () => '<script>' + script + '</script>');
}
const license = read(dir + 'fonts/OFL-PatrickHand.txt', 'utf8').replace(/&/g, '&amp;').replace(/</g, '&lt;');
html = html.replace('</body>', () => '<template id="patrick-hand-license">' + license + '</template></body>');
write('../publish-artifacts/备考有方-白板修订原型.html', html.replace(/^\uFEFF/, ''));
console.log('Updated standalone prototype (embedded font, license and mascots).');
