/* Explicit publishing origin only: never infer production from a git remote. */
const fs=require('node:fs');
const path=require('node:path');
const escape=s=>s.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
function deploymentSEO(value) {
  if (!value) return {head:'',sitemap:''};
  const url=new URL(value);
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash) throw Error('SITE_URL must be an HTTPS directory URL without credentials, query or fragment');
  if(!url.pathname.endsWith('/')) url.pathname+='/';
  const base=escape(url.href);
  return {head:`<link rel="canonical" href="${base}">\n  <meta property="og:url" content="${base}">\n  <meta property="og:image" content="${base}img/logo-hero-280.webp">\n  <meta property="og:image:alt" content="کافه آی‌چای">`,
    sitemap:`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${base}</loc></url></urlset>\n`};
}
module.exports={deploymentSEO};
if(require.main===module) {
  const value=process.env.SITE_URL;
  if(!value) throw Error('Set SITE_URL to the confirmed public directory URL first');
  const output=deploymentSEO(value), root=path.resolve(__dirname,'..');
  const file=path.join(root,'index.html');
  let html=fs.readFileSync(file,'utf8');
  const block=`<!-- deployment-seo:start -->\n  ${output.head}\n  <!-- deployment-seo:end -->`;
  html=html.includes('<!-- deployment-seo:start -->')?html.replace(/<!-- deployment-seo:start -->[\s\S]*?<!-- deployment-seo:end -->/,block):html.replace('</head>',`  ${block}\n</head>`);
  fs.writeFileSync(file,html);
  fs.writeFileSync(path.join(root,'sitemap.xml'),output.sitemap);
  console.log('Canonical, sharing URLs and sitemap generated for the explicit SITE_URL. No deployment.');
}
