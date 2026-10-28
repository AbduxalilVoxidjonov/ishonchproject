const {test}=require('node:test');
const assert=require('node:assert/strict');
const migration=require('./state-migration.js');
const ledger=require('./stock-ledger.js');
const defaults=()=>({status:'idle',items:[],history:[],log:[],index:0,phase:'transfer',mode:'marked'});
const fixture=(extra={})=>({...defaults(),version:'0.9.4',schemaVersion:1,plan:{target:100},log:[{text:'old'}],items:[{name:'A',stock:3,qty:2,placed:1,deducted:1,totalUsed:2,initialStock:5}],...extra});
const migrate=s=>migration.migrate(s,'0.9.4',defaults,ledger);
test('same version reload preserves receipt and ledger paused',()=>{
 const saved=fixture({status:'running',document:{prefix:'form7'},current:{name:'A'},pricingPercent:12});
 const result=migrate(saved);
 assert.equal(result.status,'paused');assert.equal(result.documentNeedsAck,true);
 for(const key of ['items','plan','current','log','document']) assert.deepEqual(result[key],saved[key]);
 assert.equal(result.pricingPercent,12);assert.equal(result.version,'0.9.4');assert.equal(result.schemaVersion,1);
});
test('idle upgrade clears stale draft for marked and legacy goods preserving stock/history',()=>{
 for(const mode of ['marked','unmarked']) {
 const saved=fixture({mode,version:'0.9.3',history:[{total:100}],index:1,items:[{name:'A',stock:3,qty:2,placed:0,deducted:0,totalUsed:2,initialStock:5}]});
 const result=migrate(saved);
 assert.equal(result.status,'idle');assert.equal(result.plan,null);assert.deepEqual(result.log,[]);assert.equal(result.index,0);
 assert.equal(result.items[0].qty,0);assert.equal(result.items[0].stock,3);assert.equal(result.items[0].totalUsed,2);assert.deepEqual(result.history,saved.history);
 }
});
test('upgrade with uncertain transfer preserves evidence and never double deducts',()=>{
 const saved=fixture({version:'0.9.3',inFlight:{index:0,confirmedPlaced:2},document:{prefix:'form7'}});
 const result=migrate(saved);assert.equal(result.status,'paused');assert.equal(result.documentNeedsAck,true);
 assert.deepEqual(result.inFlight,saved.inFlight);assert.deepEqual(result.items,saved.items);assert.deepEqual(result.plan,saved.plan);
 ledger.commit(result.items[0],2);ledger.commit(result.items[0],2);assert.equal(result.items[0].stock,2);
});
test('completed upgrade resets receipt counters through ledger and keeps consumption/history',()=>{
 const saved=fixture({version:'0.9.3',status:'done',document:{prefix:'form7'},history:[{total:100}]});
 const result=migrate(saved);assert.equal(result.status,'idle');assert.equal(result.plan,null);assert.equal(result.document,null);
 assert.equal(result.items[0].stock,3);assert.equal(result.items[0].totalUsed,2);assert.equal(result.items[0].initialStock,5);
 assert.equal(result.items[0].placed,0);assert.equal(result.items[0].deducted,0);assert.equal(result.items[0].qty,0);assert.deepEqual(result.history,saved.history);
});
test('invalid ledger, malformed state and future schema fail without changing input',()=>{
 for(const saved of [null,[],fixture({schemaVersion:2}),fixture({items:{}}),fixture({inFlight:{index:20}}),fixture({items:[{stock:-1}]})]) {
 const before=JSON.stringify(saved);assert.throws(()=>migrate(saved));assert.equal(JSON.stringify(saved),before);
 }
});
