const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
function loadDB(client) {
  const values = new Map();
  const context = vm.createContext({ console: { warn() {}, error() {} }, Date, Intl,
    localStorage: { getItem: k => values.get(k) ?? null, setItem: (k,v) => values.set(k,v), removeItem: k => values.delete(k) } });
  for (const file of ['utils.js','supabase-client.js']) vm.runInContext(fs.readFileSync(path.join(__dirname,'../js',file),'utf8'),context);
  const db = vm.runInContext('SupaDB', context);
  db.client = client || null; db.ready = !!client;
  return { db, values };
}
function order() {
  return { table_number: '2', total_price: 300, item_count: 3, items: [
    { product_id: 'tea', product_name_fa: 'Tea', product_price: 100, quantity: 3, subtotal: 300 }
  ] };
}
test('feedback does not require a forbidden anonymous SELECT or hide network failures', async () => {
  const offline = loadDB(); await assert.rejects(offline.db.submitFeedback({message:'Hi'}));
  const sent=[];
  const {db} = loadDB({from(table){assert.equal(table,'feedbacks');return {insert(record){sent.push(record);return Promise.resolve({error:null});}};}});
  await db.submitFeedback({name:'Guest',message:'Hi'});
  assert.equal(sent.length,1);
  db.client={from(){return {insert:async()=>({error:Error('network')})};}};
  await assert.rejects(db.submitFeedback({message:'Hi'}), /network/);
});
function insertClient() {
  const calls = [];
  return { calls, from(table) { return { insert(record) {
    calls.push({ table, record });
    if (table === 'orders') return { select() { return { single: async () => ({ data: { id: 'order-1', ...record }, error: null }) }; } };
    return Promise.resolve({ error: null });
  } }; } };
}
test('checkout validates all lines before the first write and derives consistent totals', async () => {
  const client = insertClient(); const { db } = loadDB(client);
  for (const quantity of [0, -1, 1.5, NaN, Infinity, '3', 2147483648]) {
    const input = order(); input.items[0].quantity = quantity;
    await assert.rejects(db.createOrder(input), undefined, `quantity ${quantity}`);
  }
  for (const price of [-1, Infinity, NaN, 0.5, '100', 2147483648]) {
    const input = order(); input.items[0].product_price = price;
    await assert.rejects(db.createOrder(input));
  }
  for (const items of [[], null, {}, [null]]) await assert.rejects(db.createOrder({items}));
  assert.equal(client.calls.length, 0);
  const input = order(); input.total_price = 1; input.item_count = 99; input.items[0].subtotal = 1;
  const result = await db.createOrder(input);
  assert.equal(result.total_price, 300);
  assert.equal(result.item_count, 3);
  assert.equal(result.items[0].subtotal, 300);
});
test('unconfigured checkout rejects rather than fabricating a received order', async () => {
  const { db, values } = loadDB();
  await assert.rejects(db.createOrder(order()));
  assert.equal(values.has('cafe_orders'), false);
});
