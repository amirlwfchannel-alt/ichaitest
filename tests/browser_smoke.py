"""Local read-only browser smoke test. Never logs in or writes remote data."""
import json, time, urllib.request, os
from websocket import create_connection

BASE=os.environ.get('QA_BASE','http://127.0.0.1:8126/')
assert BASE.startswith('http://127.0.0.1:'), 'Local QA only'
assert urllib.request.urlopen(BASE, timeout=5).status == 200
pages=json.load(urllib.request.urlopen('http://127.0.0.1:9334/json',timeout=5))
ws=create_connection(next(t['webSocketDebuggerUrl'] for t in pages if t['type']=='page'),suppress_origin=True,timeout=30)
seq=0

def cmd(method, **params):
    global seq
    seq+=1
    ws.send(json.dumps(dict(id=seq,method=method,params=params)))
    while True:
        m=json.loads(ws.recv())
        if m.get('id')==seq:
            assert 'error' not in m,m
            return m.get('result',{})

def ev(expression):
    r=cmd('Runtime.evaluate',expression=expression,returnByValue=True,awaitPromise=True)
    assert 'exceptionDetails' not in r,r
    return r.get('result',{}).get('value')

cmd('Page.enable');cmd('Runtime.enable');cmd('Network.enable')
cmd('Network.setCacheDisabled',cacheDisabled=True)
# Deterministic offline frontend test: never send analytics or orders to production.
cmd('Network.setBlockedURLs',urls=['https://*','http://*.supabase.co/*','wss://*'])
cmd('Storage.clearDataForOrigin',origin=BASE.rstrip('/'),storageTypes='local_storage')
cmd('Page.addScriptToEvaluateOnNewDocument',source="document.addEventListener('alpine:init',()=>{SupaDB.init=()=>{};SupaDB.ready=false;SupaDB.fetchCategories=async()=>DEFAULT_CATEGORIES;SupaDB.fetchProducts=async()=>DEFAULT_PRODUCTS;SupaDB.fetchCafeInfo=async()=>DEFAULT_CAFE_INFO;},{once:true});")
cmd('Page.addScriptToEvaluateOnNewDocument',source="window.__errors=[];addEventListener('error',e=>__errors.push(e.message));addEventListener('unhandledrejection',e=>__errors.push(String(e.reason)));")
reports=[]
for page in ['index.html','admin.html']:
    cmd('Page.navigate',url=BASE+page);cmd('Page.bringToFront')
    for _ in range(60):
        time.sleep(.2)
        if ev("!!window.Alpine && !!document.querySelector('[x-data]')?!!document.querySelector('[x-data]')._x_dataStack:false"):break
    time.sleep(1)
    if page == 'index.html':
        ev("document.querySelector('button[title=\"سبد خرید\"]').focus(); document.querySelector('button[title=\"سبد خرید\"]').click()")
        time.sleep(.4)
        assert ev("document.activeElement.closest('[role=dialog]') !== null"), 'dialog must receive focus'
        cmd('Input.dispatchKeyEvent',type='keyDown',key='Escape',code='Escape',windowsVirtualKeyCode=27)
        cmd('Input.dispatchKeyEvent',type='keyUp',key='Escape',code='Escape',windowsVirtualKeyCode=27)
        time.sleep(.4)
        assert ev("!Alpine.store('cart').showPanel"), 'Escape must close drawer'
        assert ev("document.activeElement.title === 'سبد خرید'"), 'focus must return to opener'
    state=ev("""(() => {
      const d=Alpine.$data(document.querySelector('[x-data]'));
      const visible=e=>!!e&&!!e.getClientRects().length;
      return {alpine:!!Alpine, errors:__errors, ready:document.readyState,
        loginVisible:visible(document.querySelector('.login-screen')),
        dashboardVisible:visible(document.querySelector('.admin-main')),
        cart:!!Alpine.store('cart'), name:d.cafeInfo?.name,
        text:document.body.innerText.slice(0,100),
        runtimeTailwind:[...document.scripts].some(s=>s.src.includes('tailwindcss.js'))};
    })()""")
    assert not state['errors'],state
    assert not state['runtimeTailwind'],state
    if page=='admin.html':
        assert state['loginVisible'] and not state['dashboardVisible'],state
    else:
        assert state['cart'] and state['name'],state
        cart=ev("""(() => {const d=Alpine.$data(document.body), c=Alpine.store('cart'); const p=d.products[0];c.add(p);return {count:c.count,total:c.total};})()""")
        assert cart['count']>0,cart
        ev("Alpine.store('cart').clear()")
    cmd('Emulation.setDeviceMetricsOverride',width=390,height=844,deviceScaleFactor=1,mobile=True)
    time.sleep(.3)
    state['mobileOverflow']=ev('document.documentElement.scrollWidth > innerWidth + 1')
    assert not state['mobileOverflow'],state
    cmd('Emulation.clearDeviceMetricsOverride')
    reports.append(dict(page=page,**state))
print(json.dumps(reports,ensure_ascii=False,indent=2))
ws.close()
