const test=require('node:test');
const assert=require('node:assert/strict');
test('deployment SEO respects GitHub Pages subpaths and refuses guessed origins',()=>{
  const {deploymentSEO}=require('../tools/deployment-seo.cjs');
  assert.equal(deploymentSEO('').head,'');
  for(const value of ['javascript:alert(1)','http://example.org/','https://example.org/?x=1']) assert.throws(()=>deploymentSEO(value));
  const result=deploymentSEO('https://example.org/menu/');
  assert.match(result.head,/rel="canonical" href="https:\/\/example.org\/menu\/"/);
  assert.match(result.head,/og:image" content="https:\/\/example.org\/menu\/img\/logo-hero-280.webp"/);
  assert.match(result.sitemap,/<loc>https:\/\/example.org\/menu\/<\/loc>/);
  assert.doesNotMatch(result.sitemap,/admin|templates/);
});
