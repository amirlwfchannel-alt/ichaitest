const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
assert(html.includes('img/logo-hero-280.webp'),'optimized hero logo missing');
assert(html.includes('fetchpriority="high"'),'hero priority missing');
const sandbox={}; vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root,'js/img-map.js'),'utf8')+'\nthis.map=IMG_MAP;',sandbox);
vm.runInContext(fs.readFileSync(path.join(root,'js/images.js'),'utf8'),sandbox);
for(const [url,local] of Object.entries(sandbox.map)){
 assert(fs.existsSync(path.join(root,local)),local);
 assert.equal(sandbox.menuImage(url),local);
}
assert.equal(sandbox.menuImage('https://example.com/new.webp'),'https://example.com/new.webp');
const image={dataset:{},src:'missing.webp',getAttribute(){return this.src}};
sandbox.fallbackMenuImage(image,'https://example.com/new.webp');
assert.equal(image.src,'https://example.com/new.webp');
sandbox.fallbackMenuImage(image,'https://example.com/new.webp');
assert(image.src.startsWith('data:image/svg+xml'));
assert(fs.readFileSync(path.join(root,'fonts/fonts.css'),'utf8').includes('subset/'));
console.log('PASS: '+Object.keys(sandbox.map).length+' mapped images exist; unknown URLs and failed images fall back; subset fonts');
