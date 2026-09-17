const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
function harness({cached, orders, storageFails = false, db = {ready: false}} = {}) {
  const values = new Map();
  if (cached !== undefined) values.set('ichai_cart', JSON.stringify(cached));
  if (orders !== undefined) values.set('ichai_my_orders', JSON.stringify(orders));
  let init, cart; const timers = new Map(); let timerId = 0;
  const ctx = vm.createContext({ console: {warn(){},error(){}}, navigator: {}, SupaDB: db,
    localStorage: {getItem:k=>values.get(k) ?? null, setItem(k,v){if(storageFails) throw Error('quota'); values.set(k,v);}},
    setInterval(fn){timers.set(++timerId,fn);return timerId;}, clearInterval(id){timers.delete(id);},
    document: {addEventListener(event, fn){if(event==='alpine:init') init=fn;}},
    Alpine: {store(name, value){cart=value;}} });
  for (const name of ['utils.js','cart.js']) vm.runInContext(fs.readFileSync(path.join(__dirname,'../js',name),'utf8'),ctx);
  init();
  return {cart, timers, values, cookie:vm.runInContext('OrderCookie',ctx), tracker:vm.runInContext('CustomerTracker',ctx)};
}
test('malformed persisted cart and history cannot break startup or totals', () => {
  for (const cached of [null, {}, 'broken', [null, {id:'bad',price:-1,quantity:2}]]) {
    const {cart,cookie} = harness({cached,orders:{bad:true}});
    assert.equal(cart.count, 0); assert.equal(cart.total, 0); assert.equal(cookie.getOrders().length,0);
  }
  const {cart} = harness({cached:[{id:'tea',name_fa:'Tea',price:'100',quantity:'2'}]});
  assert.equal(cart.count,2); assert.equal(cart.total,200);
  cart.updateQty('tea','1'); assert.equal(cart.count,2);
  cart.updateQty('tea',Infinity); assert.equal(cart.count,2);
  cart.add({id:'bad',price:NaN}); assert.equal(cart.count,2);
});
const product = {id:'tea', name_fa:'Tea', price:100, image_url:null};
const confirmed = {id:'order-1',order_number:'C-050601-120010',status:'new',total_price:100,item_count:1,created_at:'2026-09-17T12:00:00Z'};
const deferred = () => {let resolve, reject; const promise = new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
test('checkout locks cart mutations and duplicate submit until completion', async () => {
  const pending = deferred(); let calls=0;
  const {cart} = harness({db:{ready:false, createOrder(){calls++;return pending.promise;}}});
  cart.add(product); cart.tableNumber='2';
  const submit = cart.submit();
  cart.add(product); cart.updateQty('tea',1); cart.remove('tea'); cart.clear();
  await cart.submit(); assert.equal(calls,1); assert.equal(cart.count,1);
  cart.tableNumber='3'; cart.notes='next order';
  pending.resolve(confirmed); await submit;
  assert.equal(cart.count,0); assert.equal(cart.tableNumber,'3'); assert.equal(cart.notes,'next order');
  assert.equal(cart.myOrders[0].table_number,'2'); assert.equal(cart.isSubmitting,false);
});
test('tracking startup failure cannot turn a committed checkout into failure', async () => {
  const {cart} = harness({db:{ready:true,createOrder:async()=>confirmed,client:{channel(){throw Error('no realtime');}}}});
  cart.add(product); await cart.submit();
  assert.equal(cart.orderError,''); assert.equal(cart.orderSuccess.id,confirmed.id);
});
test('missing server acknowledgement retains cart and never shows success', async () => {
  const {cart} = harness({db:{ready:false,createOrder:async()=>({})}});
  cart.add(product); await cart.submit();
  assert.equal(cart.orderSuccess,null); assert.equal(cart.count,1); assert.ok(cart.orderError);
});

test('confirmed checkout survives unavailable browser storage and keeps tracking in memory', async () => {
  const {cart,cookie} = harness({storageFails:true,db:{ready:false,createOrder:async()=>confirmed}});
  cart.add(product); await cart.submit();
  assert.equal(cart.orderSuccess?.id, confirmed.id);
  assert.equal(cart.orderError, ''); assert.equal(cart.count, 0);
  assert.equal(cart.myOrders.length, 1); assert.equal(cookie.getOrders()[0].order_number,confirmed.order_number);
});
