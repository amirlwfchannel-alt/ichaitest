/* Run against an isolated Chrome: node templates/qa/browser.cjs.
   Defaults: CDP port 9347 and static HTTP port 8787. No dependencies. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const endpoint = process.env.CDP_URL || 'http://127.0.0.1:9347';
const base = process.env.TEMPLATE_BASE_URL || 'http://127.0.0.1:8787';
let serial = 0;
let checks = 0;
const evidence = [];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  const target = await (await fetch(`${endpoint}/json/new?about:blank`, {method:'PUT'})).json();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(resolve => socket.addEventListener('open', resolve, {once:true}));
  const pending = new Map();
  const networkErrors = [];
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const job = pending.get(message.id);
      if (!job) return;
      pending.delete(message.id);
      if (message.error) job.reject(new Error(JSON.stringify(message.error)));
      else job.resolve(message.result);
    }
    if (message.method === 'Network.responseReceived' && message.params.response.status >= 400) networkErrors.push(message.params.response.url);
  });
  const cdp = (method, params = {}) => new Promise((resolve,reject) => { const id = ++serial; pending.set(id,{resolve,reject}); socket.send(JSON.stringify({id,method,params})); });
  const js = async expression => {
    const result = await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const check = async (expression, label) => { assert(await js(expression),label); checks++; };
  const navigate = async route => {
    await cdp('Page.navigate',{url:base+route});
    for(let i=0;i<80;i++) { await pause(60); if(await js(`location.pathname === ${JSON.stringify(route)} && document.readyState === 'complete'`)) break; }
    await cdp('Page.bringToFront');
    await js('document.fonts.ready.then(()=>true)');
  };
  const click = selector => js(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const key = async key => {
    const extra = key==='Escape' ? {code:'Escape',windowsVirtualKeyCode:27} : {code:'Tab',windowsVirtualKeyCode:9};
    await cdp('Input.dispatchKeyEvent',{type:'keyDown',key,...extra});
    await cdp('Input.dispatchKeyEvent',{type:'keyUp',key,...extra});
  };
  try {
    await cdp('Page.enable'); await cdp('Runtime.enable'); await cdp('Network.enable');
    await cdp('Page.addScriptToEvaluateOnNewDocument',{source:"window.__errors=[]; addEventListener('error',e=>__errors.push(e.message)); addEventListener('unhandledrejection',e=>__errors.push(String(e.reason)));"});
    await navigate('/templates/index.html');
    await js("Object.keys(localStorage).filter(k=>k.startsWith('cafe-template:')).forEach(k=>localStorage.removeItem(k))");
    for(const theme of ['classic','garden','midnight']) {
      const route = `/templates/${theme}/index.html`;
      await navigate(route);
      await check("document.querySelectorAll('[data-product-id]').length===8",theme+': static menu');
      await check("document.querySelector('[data-cart-count]').textContent==='۰'",theme+': isolated empty cart');
      await check("getComputedStyle(document.body).direction==='rtl' && document.fonts.check('15px Vazirmatn')",theme+': RTL and local font');
      await click('[data-category-filter="tea"]');
      await check("document.querySelectorAll('[data-product-id]:not([hidden])').length===2",theme+': category filter');
      await js("document.querySelector('#menu-search').value='چاي'; document.querySelector('#menu-search').dispatchEvent(new Event('input'))");
      await check("document.querySelectorAll('[data-product-id]:not([hidden])').length===1 && !document.querySelector('[data-product-id=tea]').hidden",theme+': Arabic-normalized combined search');
      await js("document.querySelector('#menu-search').value='پیدا نشود'; document.querySelector('#menu-search').dispatchEvent(new Event('input'))");
      await check("!document.querySelector('#empty-results').hidden",theme+': empty state');
      await click('[data-reset-filters]');
      await check("document.querySelectorAll('[data-product-id]:not([hidden])').length===8 && document.activeElement.id==='menu-search'",theme+': reset and focus');
      await click('[data-add=espresso]'); await click('[data-add=espresso]'); await click('[data-add=latte]');
      await check("document.querySelector('[data-cart-count]').textContent==='۳'",theme+': add');
      await js("document.querySelector('[data-open-cart]').focus(); document.querySelector('[data-open-cart]').click()");
      await check("document.querySelector('dialog').open && document.querySelector('dialog').contains(document.activeElement)",theme+': native modal focus');
      await check("document.querySelector('#cart-total').textContent==='۲۹۵٬۰۰۰ تومان'",theme+': total');
      for(let i=0;i<10;i++){ await key('Tab'); await check("document.querySelector('dialog').contains(document.activeElement)",theme+': tab containment'); }
      await key('Escape'); await pause(50);
      await check("!document.querySelector('dialog').open && document.activeElement.matches('[data-open-cart]')",theme+': Escape and focus restoration');
      await navigate(route);
      await check("document.querySelector('[data-cart-count]').textContent==='۳'",theme+': reload persistence');
      await click('[data-open-cart]');
      await js("document.querySelector('[data-quantity-id=espresso][data-delta=\"-1\"]').focus(); document.activeElement.click()");
      await check("document.querySelector('#cart-total').textContent==='۲۱۰٬۰۰۰ تومان' && document.activeElement.dataset.quantityId==='espresso'",theme+': decrease and retained focus');
      await click('[data-clear-cart]');
      await check("!document.querySelector('#cart-empty').hidden && document.querySelector('[data-clear-cart]').disabled",theme+': clear');
      await click('[data-close-cart]');
      for(const width of [320,390,768,1024,1440]) {
        await cdp('Emulation.setDeviceMetricsOverride',{width,height:950,deviceScaleFactor:1,mobile:false});
        await pause(80);
        const metrics = await js("({width:innerWidth,scroll:document.documentElement.scrollWidth,bg:getComputedStyle(document.body).backgroundColor,grid:getComputedStyle(document.querySelector('.menu-grid')).gridTemplateColumns})");
        assert(metrics.scroll<=width,theme+': horizontal overflow at '+width+' '+JSON.stringify(metrics)); checks++;
        evidence.push({theme,...metrics});
        await check("[...document.querySelectorAll('button:not(:disabled),input')].filter(e=>e.getClientRects().length&&!e.closest('dialog')).every(e=>e.getBoundingClientRect().height>=43)",theme+': 44px controls '+width);
        if(width===390 || width===1440) {
          await js('scrollTo(0,0)'); await pause(80);
          const shot = await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
          fs.writeFileSync(path.join(__dirname,`${theme}-${width}.png`),Buffer.from(shot.data,'base64'));
        }
      }
      await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
      await check("getComputedStyle(document.documentElement).scrollBehavior==='auto' && getComputedStyle(document.querySelector('.menu-card')).transitionDuration==='0s'",theme+': reduced motion');
      await cdp('Emulation.setEmulatedMedia',{features:[]});
      await check('window.__errors.length===0',theme+': no runtime errors');
      await check("performance.getEntriesByType('resource').every(e=>e.name.startsWith(location.origin))",theme+': all resources local');
      // Keep a value in this theme to prove the next theme starts independently.
      await click('[data-add=tea]');
    }
    await navigate('/templates/index.html');
    for(const width of [320,390,768,1440]) {
      await cdp('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false}); await pause(60);
      await check('document.documentElement.scrollWidth<=innerWidth','gallery overflow '+width);
    }
    await check("document.querySelectorAll('.gallery-card').length===3",'gallery variants');
    await cdp('Emulation.setScriptExecutionDisabled',{value:true});
    await navigate('/templates/classic/index.html');
    await check("document.querySelectorAll('[data-product-id]').length===8 && document.querySelectorAll('[data-product-id][hidden]').length===0",'no-JS readable menu');
    await check("document.querySelector('[data-open-cart]').disabled && document.querySelector('[data-enhancement]').hidden",'no-JS honest inactive controls');
    await cdp('Emulation.setScriptExecutionDisabled',{value:false});
    await navigate('/templates/classic/index.html');
    await js("localStorage.setItem('cafe-template:classic:cart:v1','{bad')");
    await navigate('/templates/classic/index.html');
    await check("document.querySelector('[data-cart-count]').textContent==='۰'",'corrupt storage recovery');
    await cdp('Page.addScriptToEvaluateOnNewDocument',{source:"Object.defineProperty(window,'localStorage',{get(){throw new Error('blocked')}})"});
    await navigate('/templates/garden/index.html'); await click('[data-add=tea]'); await click('[data-open-cart]');
    await check("document.querySelector('#cart-total').textContent==='۶۵٬۰۰۰ تومان' && !document.querySelector('#storage-note').hidden",'blocked storage graceful in-memory cart');
    await check('window.__errors.length===0','blocked storage no crash');
    assert.equal(networkErrors.length,0,'HTTP failures: '+networkErrors.join(', ')); checks++;
    const report = {checks,status:'PASS',browser:(await (await fetch(endpoint+'/json/version')).json()).Browser,viewports:evidence,networkErrors};
    fs.writeFileSync(path.join(__dirname,'report.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify(report,null,2));
  } finally {
    await cdp('Page.close').catch(()=>{}); socket.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1});
