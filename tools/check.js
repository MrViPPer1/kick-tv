'use strict';
const fs = require('node:fs');
const path = require('node:path');
const acorn = require('acorn');
const root = path.resolve(__dirname, '../app');
for (const name of fs.readdirSync(path.join(root, 'js'))) {
  acorn.parse(fs.readFileSync(path.join(root, 'js', name), 'utf8'), {ecmaVersion:5});
  console.log('ES5 syntax:', name);
}
acorn.parse(fs.readFileSync(path.join(root, 'vendor/hls-1.4.10.min.js'), 'utf8'), {ecmaVersion:5});
console.log('ES5 syntax: bundled HLS.js');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
if (scripts.length !== new Set(scripts).size) throw new Error('Duplicate script');
for (const script of scripts) if (!fs.existsSync(path.join(root, script))) throw new Error('Missing ' + script);
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
if (ids.length !== new Set(ids).size) throw new Error('Duplicate element ID');
console.log('Script paths and IDs verified');
