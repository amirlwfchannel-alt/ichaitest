const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
function load(extra = {}) {
  const ctx = vm.createContext({ console, Date, Intl, ...extra });
  for (const file of ['utils', 'accounting']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/' + file + '.js'), 'utf8'), ctx);
  return { ctx, utils: vm.runInContext('Utils', ctx), engine: vm.runInContext('AccountingEngine', ctx) };
}
test('numeric database strings are summed, not concatenated, throughout accounting', () => {
  const { engine } = load();
  engine.orders = [{status:'delivered', total_price:'100', created_at:'2026-09-17T10:00:00Z'}, {status:'new', total_price:'50', created_at:'2026-09-17T11:00:00Z'}, {status:'cancelled', total_price:999}];
  engine.items = [{product_id:'a', product_name_fa:'Tea', quantity:'2', subtotal:'100'}, {product_id:'a', product_name_fa:'Tea', quantity:'1', subtotal:'50'}];
  assert.equal(engine.getKPIs().totalRevenue, 150);
  assert.equal(engine.getKPIs().topProduct.qty, 3);
  assert.equal(engine.getRevenueChart().values[0], 150);
  assert.equal(engine.getTopProducts()[0].revenue, 150);
  assert.equal(engine.getProductTable()[0].avgPrice, 50);
});
test('period windows include exactly N Tehran calendar days and the current Jalali month', () => {
  const { utils } = load();
  const now = '2026-09-17T10:00:00Z';
  assert.equal(utils.getPeriodStart('7days', now), '2026-09-10T20:30:00.000Z');
  assert.equal(utils.getPeriodStart('30days', now), '2026-08-18T20:30:00.000Z');
  const parts = new Intl.DateTimeFormat('en-u-ca-persian', {timeZone:'Asia/Tehran', year:'numeric',month:'numeric'}).formatToParts(new Date(now));
  const part = t => +parts.find(p=>p.type===t).value;
  assert.equal(utils.getPeriodStart('month', now), utils.jalaliToUtc(part('year'),part('month'),1).toISOString());
});
test('accounting load publishes one matching snapshot and ignores superseded requests', async () => {
  const pending = [];
  const { engine } = load({SupaDB:{
    fetchOrders: options => new Promise(resolve => pending.push({options,resolve})),
    fetchAccountingData: async since => [{since}]
  }});
  const first = engine.loadData('custom','2026-09-01T00:00:00Z','2026-09-02T00:00:00Z');
  const second = engine.loadData('all');
  pending[1].resolve([{id:'latest'}]);
  await second;
  pending[0].resolve([{id:'old'}]);
  await first;
  assert.equal(engine.orders[0].id,'latest');
  assert.equal(engine.items[0].since,null);
});
test('accounting failed item fetch does not publish a half-new snapshot', async () => {
  const {engine} = load({SupaDB:{fetchOrders:async()=>[{id:'new'}],fetchAccountingData:async()=>{throw Error('offline');}}});
  engine.orders=[{id:'old'}]; engine.items=[{id:'old-item'}];
  await assert.rejects(engine.loadData('all'), /offline/);
  assert.equal(engine.orders[0].id,'old');
  assert.equal(engine.items[0].id,'old-item');
});
test('yesterday sends the same bounded range to both accounting fetches', async () => {
  const calls=[];
  const {engine,utils} = load({SupaDB:{fetchOrders:async o=>{calls.push(o);return[];},fetchAccountingData:async(since,until)=>{calls.push({since,until});return[];}}});
  utils.now=()=>new Date('2026-09-17T10:00:00Z');
  await engine.loadData('yesterday');
  assert.equal(calls[0].since,'2026-09-15T20:30:00.000Z');
  assert.equal(calls[0].until,'2026-09-16T20:29:59.999Z');
  assert.deepEqual({...calls[0]},calls[1]);
});
test('accounting midnight Tehran belongs to hour zero, never a 25th bucket', () => {
  const { engine } = load();
  engine.orders = [{ status: 'delivered', created_at: '2026-09-16T20:30:00Z' }];
  const hours = engine.getHourlyData();
  assert.equal(hours.length, 24);
  assert.equal(hours[0], 1);
  assert.equal(hours.reduce((a, b) => a + b, 0), 1);
});
