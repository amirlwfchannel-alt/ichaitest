const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
function load(extra = {}) {
  let factory;
  const ctx = vm.createContext({ console: {warn(){},error(){}}, Date, Intl,
    setTimeout:()=>1, clearTimeout(){}, setInterval:()=>2, clearInterval(){},
    localStorage:{getItem:()=>null,setItem(){},removeItem(){}},
    document:{addEventListener:(name, cb)=>cb(),title:''}, window:{},
    Alpine:{data:(name, fn)=>factory=fn},
    DEFAULT_CATEGORIES:[],DEFAULT_PRODUCTS:[],DEFAULT_CAFE_INFO:{},
    SupaDB:{ready:false,init:()=>false}, stopRealtimeSystem(){}, ...extra });
  for (const file of ['utils','accounting','admin']) vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/'+file+'.js'),'utf8'),ctx);
  const admin = factory();
  admin.$nextTick = fn => fn();
  const messages = [];
  admin.toast = (message,type='success') => messages.push({message,type});
  return {ctx,admin,messages,utils:vm.runInContext('Utils',ctx),engine:vm.runInContext('AccountingEngine',ctx)};
}
test('failed order load remains retryable instead of claiming loaded', async () => {
  let calls=0;
  const {admin,messages}=load({SupaDB:{ready:true,fetchOrders:async()=>{calls++;throw Error('offline');}}});
  await admin.openOrdersPage();
  assert.equal(admin.ordersLoaded,false);
  await admin.openOrdersPage();
  assert.equal(calls,2);
  assert.equal(messages.every(m=>m.type==='error'),true);
});
test('real order wrapper propagates transport failure to admin and permits retry', async () => {
  const {ctx,admin,messages}=load();
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/supabase-client.js'),'utf8'),ctx);
  const db=vm.runInContext('SupaDB',ctx);
  let calls=0, timers=0;
  db.ready=true;
  db.client={from(){return {select(){return {order:async()=>{calls++;return {data:null,error:Error('network')};}};}};}};
  admin.startAutoDeliverTimer=()=>timers++;
  admin.orders=[{id:'previous'}];
  await admin.openOrdersPage();
  assert.equal(admin.ordersLoaded,false);
  assert.equal(admin.orders[0].id,'previous');
  await admin.openOrdersPage();
  assert.equal(calls,2);
  assert.equal(timers,0);
  assert.equal(messages.length,2);
  db.client={from(){return {select(){return {order:async()=>({data:[{id:'fresh',status:'delivered'}],error:null})};}};}};
  await admin.openOrdersPage();
  assert.equal(admin.ordersLoaded,true);
  assert.equal(admin.orders[0].id,'fresh');
  assert.equal(timers,1);
});

test('stale accounting failure cannot overwrite a newer successful load', async () => {
  const {admin,engine,messages}=load();
  const deferred=[];
  engine.loadData=()=>new Promise((resolve,reject)=>deferred.push({resolve,reject}));
  const first=admin.loadAccountingData();
  const second=admin.loadAccountingData();
  deferred[1].resolve(engine);
  await second;
  assert.equal(admin.accountingLoaded,true);
  deferred[0].reject(Error('old request failed'));
  await first.catch(()=>{});
  assert.equal(admin.accountingLoaded,true,'a late failure of a superseded request must not undo the newer load');
  assert.equal(messages.every(m=>m.type!=='error'),true);
  deferred[1].reject(Error('current request failed')); // unreachable; keeps deferred unhandled-free
});

test('logout releases timers/charts and private snapshots even when signout fails', async () => {
  const cleared=[]; let destroyed=0;
  const {admin,engine}=load({clearInterval:id=>cleared.push(id),SupaDB:{signOut:async()=>{throw Error('offline');}}});
  admin.isAuthenticated=true; admin.isDeveloper=true; admin._autoDeliverTimer=55;
  admin.loginPassword='private'; admin.visitStats={daily:[]}; admin.accountingData=[{id:'private'}];
  admin._chartInstances={chart:{destroy:()=>destroyed++}};
  engine.orders=[{id:'private'}];
  await admin.logout();
  assert.equal(admin.isAuthenticated,false);
  assert.equal(admin.isDeveloper,false);
  assert.equal(admin.loginPassword,'');
  assert.equal(admin.accountingData.length,0);
  assert.equal(engine.orders.length,0);
  assert.equal(admin.visitStats,null);
  assert.ok(cleared.includes(55));
  assert.equal(destroyed,1);
});
test('realtime hydration cannot repopulate a stopped session or duplicate an existing order', async () => {
  let resolveFull;
  const {ctx,admin} = load({SupaDB:{ready:true, subscribeOrders:()=>({}),unsubscribeOrders(){},fetchOrderWithItemsById:()=>new Promise(resolve=>resolveFull=resolve)}, Audio:class {addEventListener(){} load(){}}});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/realtime.js'),'utf8'),ctx);
  ctx.admin=admin;
  vm.runInContext('initRealtimeSystem(admin)',ctx);
  const manager=vm.runInContext('RealtimeManager',ctx);
  const first=manager.onNewOrder({id:'one'});
  vm.runInContext('stopRealtimeSystem()',ctx);
  resolveFull({id:'one'}); await first;
  assert.equal(admin.orders.length,0);
  vm.runInContext('initRealtimeSystem(admin)',ctx);
  admin.orders=[{id:'one',status:'new'}];
  const duplicate=manager.onNewOrder({id:'one'});
  resolveFull({id:'one',status:'new'}); await duplicate;
  assert.equal(admin.orders.length,1);
  assert.equal(admin.ordersLoaded,false);
});
test('custom accounting refresh preserves its day and reports a failed request without success', async () => {
  const {admin,engine,messages}=load();
  admin.accountingPeriod='custom';
  engine.customFrom='2026-09-15T20:30:00Z'; engine.customTo='2026-09-16T20:29:59.999Z';
  let args;
  engine.loadData=async(...a)=>{args=a;return engine;};
  await admin.loadAccountingData();
  assert.equal(args[1],engine.customFrom);
  assert.equal(args[2],engine.customTo);
  admin.jalaliYear=1405;admin.jalaliMonth=6;admin.jalaliDay=26;
  engine.loadData=async()=>{throw Error('offline');};
  messages.length=0;
  await admin.applyCustomJalaliDate();
  assert.equal(admin.accountingLoaded,false);
  assert.ok(messages.length>0);
  assert.equal(messages.every(m=>m.type==='error'),true);
});
test('empty CSV export never reports a download', () => {
  const {admin,messages}=load();
  admin.exportOrdersCSV(); admin.exportProductsCSV();
  assert.equal(messages.some(m=>m.type==='success'),false);
});
test('PDF prints product names as text, preserving ordinary angle brackets and ampersands', () => {
  let output='';
  const doc={open(){},write:s=>output=s,close(){}};
  const {admin,engine}=load({document:{addEventListener:(n,cb)=>cb(),createElement:()=>({style:{},contentWindow:{document:doc}}),body:{appendChild(){}}}});
  engine.items=[{product_name_fa:'Tea < seasonal > & milk',quantity:1,subtotal:50}];
  admin.exportAccountingPDF();
  assert.ok(output.includes('Tea &lt; seasonal &gt; &amp; milk'));
  assert.equal(output.includes('Tea < seasonal > & milk'),false);
});
test('pending order reads cannot revive state or timers after logout', async () => {
  let finish; let timers=0;
  const {admin}=load({setInterval:()=>{timers++;return 1;},SupaDB:{ready:true,fetchOrders:()=>new Promise(r=>finish=r),signOut:async()=>{}}});
  admin.isAuthenticated=true;
  const read=admin.loadOrders();
  await admin.logout();
  finish([{id:'private',status:'delivered'}]);
  await read;
  assert.equal(admin.orders.length,0);
  assert.equal(admin.ordersLoaded,false);
  assert.equal(timers,0);
});
test('wrong-shaped and null storage fall back to typed defaults without breaking admin init', async () => {
  const {admin,utils} = load({localStorage:{getItem:key=>key==='admin_sound_enabled'?'"false"':'null'}});
  assert.equal(utils.getStorage('admin_sound_enabled',true),true);
  assert.equal(utils.getStorage('admin_dark_mode',false),false);
  assert.deepEqual(Array.from(utils.getStorage('cafe_products',[])),[]);
  await admin.init();
  assert.equal(admin.isAuthenticated,false);
  assert.equal(admin.categories.length,0);
});
