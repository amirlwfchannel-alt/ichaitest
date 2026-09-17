/* Rebuild from CURRENT sources only. No git, upload or deploy side effects. */
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const esbuild = require('esbuild');
const root = path.join(__dirname, '..');
const hash = file => createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex').slice(0,12);
async function main() {
  execFileSync(process.execPath, [require.resolve('tailwindcss/lib/cli.js'), '-c','tw.config.cjs','-o','css/tw.min.css','--minify'], {cwd:root,stdio:'inherit'});
  for (const dir of ['js','css']) {
    for (const file of fs.readdirSync(path.join(root,dir))) {
      if (file.includes('.min.') || !file.endsWith(dir==='js'?'.js':'.css')) continue;
      const rel=dir+'/'+file, out=rel.replace(/\.(js|css)$/,'.min.$1');
      await esbuild.build({entryPoints:[path.join(root,rel)],outfile:path.join(root,out),bundle:false,minify:true,
        // Global lexical names are consumed by separate scripts and Alpine expressions.
        // No bundle/IIFE/toplevel renaming: preserve SupaDB, Utils, AccountingEngine, etc.
        target:'es2020',legalComments:'none'});
    }
  }
  for (const name of ['index.html','admin.html']) {
    let html=fs.readFileSync(path.join(root,name),'utf8');
    html=html.replace(/(src|href)="((?:js|css)\/[^"?]+?)(?:\?[^" ]*)?"/g,(all,attr,file)=>{
      if(!/\.(js|css)$/.test(file)) return all;
      const out=file.includes('.min.')?file:file.replace(/\.(js|css)$/,'.min.$1');
      if(!fs.existsSync(path.join(root,out)))throw Error('Missing output: '+out);
      return `${attr}="${out}?v=${hash(out)}"`;
    });
    const scripts=[...html.matchAll(/<script[^>]*src="([^"?]+)(?:\?[^" ]*)?"[^>]*>/g)];
    const alpine=scripts.filter(m=>m[1]==='lib/alpine.min.js');
    if(alpine.length!==1||!alpine[0][0].includes('defer'))throw Error(name+': Alpine missing/duplicated/not deferred');
    if(scripts[scripts.length-1][1]!=='lib/alpine.min.js')throw Error(name+': Alpine must run after all components');
    if(scripts.some(m=>!m[0].includes('defer')))throw Error(name+': blocking script found');
    if(html.includes('lib/tailwindcss.js'))throw Error('Runtime Tailwind regression');
    fs.writeFileSync(path.join(root,name),html);
  }
  console.log('Built current JS/CSS; hashed references and deferred Alpine order verified. No deployment.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
