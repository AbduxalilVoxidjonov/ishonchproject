const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ReceiptMath = require('./receipt-math.js');
const ReceiptLedger = require('./stock-ledger.js');
const ReceiptPair = require('./receipt-pair.js');
const source = fs.readFileSync(__dirname + '/content.js', 'utf8');
function harness() {
  const ctx = vm.createContext({ ReceiptMath, ReceiptLedger, ReceiptPair, norm:s=>String(s||'').trim().toLowerCase(), state: { items: [], mode: 'marked', plan: null }, log() {}, el: () => ({value:''}) });
  const inputs = source.slice(source.indexOf('  const parseNumber ='), source.indexOf('  // 1C grid helpers'));
  const math = source.slice(source.indexOf('  const round2 ='), source.indexOf('  // Step 2:'));
  vm.runInContext(inputs + math, ctx);
  return expr => vm.runInContext(expr, ctx);
}
function clearHarness(overrides = {}) {
  const inputs = { target: { value: '150' }, percent: { value: '10' } };
  const ctx = vm.createContext({ ReceiptMath, ReceiptLedger, ReceiptPair,
    state: { status:'idle', items:[], source:null, plan:null, log:[], history:[], document:null, phase:'transfer', ...overrides },
    activeTask:null, restored:true, alive:()=>true, saves:0, renders:0,
    save:async()=>{ctx.saves++;}, render:()=>{ctx.renders++;},
    log:(text,level)=>ctx.state.log.push({text,level}), el:name=>inputs[name],
    norm:s=>String(s||'').trim().toLowerCase(),
  });
  vm.runInContext(source.slice(source.indexOf('  const parseNumber ='), source.indexOf('  // 1C grid helpers')), ctx);
  return { ctx, inputs, run:expr=>vm.runInContext(expr,ctx) };
}
test('confirmed en_US and Russian inventory values use shared parser', () => {
  const run = harness();
  assert.equal(run("parseNumber('101.0000')"), 101);
  assert.equal(run("parseNumber('1,456,831.68')"), 1456831.68);
  assert.equal(run("parseNumber('147,140,000.00')"), 147140000);
  assert.equal(run("parseNumber('1 456 831,68')"), 1456831.68);
  assert.ok(Number.isNaN(run("parseNumber('bad')")));
});
test('no markup percentage: local preparation works without it and prices stay as they are', () => {
  const run = harness();
  run("state.items = [{name:'A',price:100,qty:2,stock:5,placed:0},{name:'B',price:50,qty:2,stock:5,placed:0}]");
  assert.equal(run('percentValue()'), 0);
  run('prepareReceipt()'); assert.equal(run('receiptReady'), true);
  assert.equal(run('ReceiptMath.lineTotals(state.items[0],percentValue()).total'),200);
  run('resetReceipt()'); assert.equal(run('receiptReady'), false);
});
test('pair planner uses the inventory prices, ignores unpriced unused goods', () => {
  const run = harness();
  run("state.items = [{name:'A',price:100,qty:0,stock:5,placed:0},{name:'B',price:50,qty:0,stock:5,placed:0},{name:'C',price:null,qty:0,stock:10,placed:0}]; applyPlan(300)");
  assert.equal(run('state.items[0].qty'),2);
  assert.equal(run('state.items[1].qty'),2);
  assert.equal(run('state.items[2].qty'),0);
  assert.equal(run('state.plan.total'),300);
  assert.equal(run('receiptReady'),true);
});
test('all-products plan uses every priced item without a target amount', () => {
  const run = harness();
  run("receiptPercent='10'; state.items=[{name:'A',price:100,stock:5,qty:0,placed:0},{name:'B',price:50,stock:1,qty:0,placed:0},{name:'C',price:null,stock:3,qty:0,placed:0}]; applyAllPlan()");
  assert.equal(JSON.stringify(run('state.items.map(i=>i.qty)')),JSON.stringify([2,1,0]));
  assert.equal(run('state.plan.all'),true);
  assert.equal(run('state.plan.target'),null);
  assert.equal(run('receiptReady'),true);
});
test('invalid prices, marked fractions and stock excess block preparation', () => {
  const run = harness();
  run("receiptPercent='0'; state.items=[{price:null,qty:1,stock:5}]; prepareReceipt()");
  assert.equal(run('receiptReady'),false);
  run('state.items=[{price:100,qty:1.5,stock:5}]; prepareReceipt()'); assert.equal(run('receiptReady'),false);
  run('prepareReceipt()'); assert.equal(run('receiptReady'),false);
  run('state.items[0].qty=6; prepareReceipt()'); assert.equal(run('receiptReady'),false);
});
test('Tozalash clears an idle unstarted draft and preserves receipt history', async()=>{
  const history=[{total:330,items:[{name:'Old',qty:2}]}];
  const {ctx,inputs,run}=clearHarness({
    items:[{name:'A',stock:2,qty:0,placed:0,deducted:0}],
    source:{title:'Inventory'}, plan:{target:150,total:150}, log:[{text:'old'}], history,
    receiptTarget:150, pricingPercent:10, pricingResult:{total:150}, incomplete:true,
  });
  await run('clearUnstarted()');
  assert.equal(ctx.state.items.length,1);
  assert.deepEqual(ctx.state.source,{title:'Inventory'}); assert.equal(ctx.state.plan,null); assert.equal(ctx.state.log.length,1);
  assert.equal(JSON.stringify(ctx.state.history),JSON.stringify(history));
  assert.equal(ctx.state.status,'idle'); assert.equal(ctx.state.receiptTarget,null); assert.equal(ctx.state.pricingPercent,null);
  assert.equal(inputs.target.value,'');
  assert.equal(ctx.saves,1); assert.equal(ctx.renders,1);
});
test('Tozalash logs a reason and leaves an unsafe draft untouched', async()=>{
  for (const blocked of ['activeTask','inFlight','intent','running']) {
    const base={items:[{name:'A',stock:2,qty:0,placed:0,deducted:0}],source:{title:'Inventory'},plan:{target:150},log:[{text:'old'}],history:[{total:1}],document:null,status:'idle'};
    const {ctx,inputs,run}=clearHarness(base);
    if (blocked==='activeTask') ctx.activeTask='capture';
    if (blocked==='inFlight') ctx.state.inFlight={index:0};
    if (blocked==='intent') { ctx.state.items[0].placed=1; ctx.state.items[0].deducted=0; }
    if (blocked==='running') ctx.state.status='running';
    const before=JSON.stringify({items:ctx.state.items,source:ctx.state.source,plan:ctx.state.plan,history:ctx.state.history,target:inputs.target.value,percent:inputs.percent.value});
    await run('clearUnstarted()');
    assert.equal(JSON.stringify({items:ctx.state.items,source:ctx.state.source,plan:ctx.state.plan,history:ctx.state.history,target:inputs.target.value,percent:inputs.percent.value}),before,blocked);
    assert.equal(ctx.saves,0,blocked); assert.match(ctx.state.log.at(-1).text,/Tozalash mumkin emas/);
  }
});
test('Tozalash after a completed receipt preserves ledger stock and archives the receipt', async()=>{
  const item=ReceiptLedger.normalizeItem({name:'A',stock:3,qty:2,placed:2,deducted:2,price:100,totalUsed:2,initialStock:5});
  const history=[];
  const {ctx,run}=clearHarness({items:[item],source:{title:'Inventory'},plan:{target:220},history,status:'done',document:{prefix:'form7'},pricingPercent:10,receiptTarget:220,pricingResult:{total:220}});
  ctx.snapshotReceipt=()=>ctx.state.history.push({items:[{name:'A',qty:2}]});
  await run('clearUnstarted()');
  assert.equal(ctx.state.items.length,1);
  assert.equal(item.stock,3);
  assert.equal(item.totalUsed,2);
  assert.equal(ctx.state.document,null);
  assert.equal(ctx.state.history.length,1);
  assert.equal(ctx.state.history[0].items[0].qty,2);
  assert.equal(ctx.state.status,'idle');
});
test('Omborni tozalash removes captured goods separately', async()=>{
  const item=ReceiptLedger.normalizeItem({name:'A',stock:2,qty:0,placed:0,deducted:0,price:100,initialStock:2});
  const {ctx,run}=clearHarness({items:[item],source:{title:'Inventory'},history:[{total:1}],status:'idle'});
  await run('clearWarehouse()');
  assert.equal(ctx.state.items.length,0);
  assert.equal(ctx.state.source,null);
  assert.equal(ctx.state.history.length,1);
});
test('preparation has no document actions; transfer guards and fixed anchor remain', () => {
  const prepare = source.slice(source.indexOf('  function prepareReceipt()'), source.indexOf('  const fmtSum'));
  assert.doesNotMatch(prepare, /cdp\(|transfer\(|runLoop\(|domClick\(/);
  // The panel lives in Chrome's side panel: the model is never put over the 1C page
  assert.doesNotMatch(source, /appendChild\(host\)/);
  assert.doesNotMatch(source, /host\.style\./);
  const run = source.slice(source.indexOf('  async function runLoop()'), source.indexOf('  // Panel UI'));
  assert.doesNotMatch(run, /ReceiptMarkup/);
  assert.match(run, /pricingResult = \{ total:/);
  assert.match(run, /if \(!receiptReady\)/);
});


function engineHarness({ placed = 2, fail = false } = {}) {
  const ctx = vm.createContext({ ReceiptMath, ReceiptLedger, document: {}, IS_MAC:false,
    state: { mode:'marked', status:'running', source:{warehouse:'A'}, items:[], index:0, history:[], document:{prefix:'form7'} },
    activeTask:null, resumeCount:0, StopError:class extends Error {}, saved:[], transfers:0,
    save:async function() { ctx.saved.push(JSON.parse(JSON.stringify(ctx.state))); },
    log(){}, render(){}, el:()=>({value:''}), sleep:async()=>{}, checkpoint:async()=>{},
    openPodbor:async()=>{}, enableMarkingMode:async()=>{}, searchItem:async()=>{},
    fillQuantities:async()=>placed, closePodbor:async()=>{},
    transfer:async()=>{ctx.transfers++; if(fail) throw Error('timeout');},
    assertDocument:()=> 'form7', formPrefix:()=> 'form8', salesPodborButton:()=>({}),
    resetReceipt(){ctx.reset=true;}, emptyDocument:()=>true, hasProgress:()=>ctx.state.items.some(i=>i.placed>0),
    startClock(){}, validUnits:n=>Number.isInteger(n)&&n>=1&&n<=2, capText:()=>'ko‘pi bilan 2 dona',
  });
  vm.runInContext(source.slice(source.indexOf('  async function processItem('), source.indexOf('  async function runLoop(')),ctx);
  vm.runInContext(source.slice(source.indexOf('  async function reconcileTransfer('), source.indexOf('  // Panel UI')).split('  // ---------------------------------------------------------------------------')[0],ctx);
  ctx.state.items=[ReceiptLedger.normalizeItem({name:'A',stock:5,price:100,qty:3,placed:0,status:'pending'})];
  return {ctx,run:expr=>vm.runInContext(expr,ctx)};
}
test('partial successful transfer deducts confirmed amount once and next receipt retains remaining',async()=>{
  const {ctx,run}=engineHarness();
  await run('processItem(state.items[0])');
  assert.equal(ctx.state.items[0].stock,3);
  assert.equal(ctx.state.items[0].placed,2);
  assert.equal(ctx.state.items[0].status,'kam');
  ReceiptLedger.commit(ctx.state.items[0],2);
  assert.equal(ctx.state.items[0].stock,3);
  ctx.state.status='done';
  await run('nextReceipt()');
  assert.equal(ctx.state.items[0].qty,3);
  assert.equal(ctx.state.items[0].placed,0);
  assert.equal(ctx.state.items[0].totalUsed,2);
  assert.equal(ctx.reset,true);
});
test('timeout persists intent before click, blocks retries and new receipt; reconciliation is idempotent',async()=>{
  const {ctx,run}=engineHarness({fail:true});
  await assert.rejects(run('processItem(state.items[0])'),/timeout/);
  assert.equal(ctx.saved[0].inFlight.confirmedPlaced,2);
  assert.equal(ctx.state.items[0].stock,5);
  await assert.rejects(run('processItem(state.items[0])'),/tasdiqlang/);
  await run('nextReceipt()');
  assert.equal(ctx.transfers,1);
  assert.equal(ctx.state.items[0].qty,3);
  // Same durable state restored after reload must still refuse a transfer.
  ctx.state=JSON.parse(JSON.stringify(ctx.saved[0]));
  await assert.rejects(run('processItem(state.items[0])'),/tasdiqlang/);
  await run('reconcileTransfer(true)');
  await run('reconcileTransfer(true)');
  assert.equal(ctx.state.items[0].stock,3);
  assert.equal(ctx.state.items[0].placed,2);
});
test('negative reconciliation of marked shortage deducts nothing',async()=>{
  const {ctx,run}=engineHarness({placed:1,fail:true});
  ctx.state.items[0].qty=2;
  await assert.rejects(run('processItem(state.items[0])'),/timeout/);
  assert.equal(ctx.state.current.need,2);
  await run('reconcileTransfer(false)');
  assert.equal(ctx.state.items[0].stock,5);
  assert.equal(ctx.state.items[0].placed,0);
});
test('preparation compares outstanding plan with remaining stock on resume',()=>{
  const run=harness();
  run("receiptPercent='12'; state.items=[{name:'A',price:100,qty:2,stock:1,placed:1,deducted:1},{name:'B',price:50,qty:2,stock:2,placed:0}]; prepareReceipt()");
  assert.equal(run('receiptReady'),true);
  run('state.items[0].qty=6; prepareReceipt()');
  assert.equal(run('receiptReady'),false);
});

test('run finishes without a markup step: transfers happen once, total is the local sum, target stays pinned', async()=>{
  const {ctx,run}=engineHarness();
  Object.assign(ctx, { validPercent:()=>true, percentValue:()=>0, receiptReady:true,
    isVisible:()=>true, domClick(){}, realClick:async()=>{}, cdp:async()=>{}, waitFor:async()=>{},
    norm:s=>String(s||'').trim().toLowerCase(), parseNumber:ReceiptMath.parseNumber, fmtSum:String, round2:n=>Math.round(n*100)/100,
    snapshotReceipt:()=>{ctx.snapshot=ctx.state.pricingResult.total;}, announce(c){(ctx.said=ctx.said||[]).push(c);},
  });
  vm.runInContext(source.slice(source.indexOf('  async function runLoop()'),source.indexOf('  /** Continue after a pause:')),ctx);
  ctx.announce=(c)=>{(ctx.said=ctx.said||[]).push(c);}; // the slice defines the real one
  ctx.state.plan={target:220};
  await run('runLoop()');
  assert.equal(ctx.state.status,'done');
  assert.equal(ctx.state.items[0].stock,3);
  assert.equal(ctx.transfers,1);
  assert.equal(ctx.state.receiptTarget,220);
  assert.equal(ctx.snapshot,200);
  assert.equal(ctx.said,undefined); // no sound / voice at the end of a receipt
  assert.equal(ctx.state.pricingResult.total,200);
  await run('runLoop()');
  assert.equal(ctx.transfers,1);
});


test('three-product smoke selects the closest total at 0 percent for target 500',()=>{
  const run=harness();
  run("state.items=[{name:'A',price:100,stock:5,qty:0,placed:0},{name:'B',price:250,stock:5,qty:0,placed:0},{name:'C',price:150,stock:5,qty:0,placed:0}]; applyPlan(500)");
  assert.equal(run('JSON.stringify(state.items.map(i=>i.qty))'),'[2,0,2]');
  assert.equal(run('state.plan.total'),500);
  assert.equal(run('receiptReady'),true);
});

test('document guard requires captured warehouse, same warehouse and pinned prefix',()=>{
  const ctx=vm.createContext({state:{source:{warehouse:'Main'},document:{prefix:'form7'}},
    formPrefix:()=>ctx.prefix, salesPodborButton:()=>({}), docError:m=>Object.assign(Error(m),{document:true}), norm:s=>String(s||'').trim().toLowerCase(),
    document:{getElementById:id=>id.endsWith('_Склад_i0')?{value:ctx.warehouse}:null},
  });
  ctx.prefix='form7';ctx.warehouse='Main';
  vm.runInContext(source.slice(source.indexOf('  function assertDocument('),source.indexOf('  function emptyDocument(')),ctx);
  assert.equal(vm.runInContext('assertDocument()',ctx),'form7');
  ctx.warehouse='Other';assert.throws(()=>vm.runInContext('assertDocument()',ctx),/ombori/);
  ctx.warehouse='Main';ctx.prefix='form8';assert.throws(()=>vm.runInContext('assertDocument()',ctx),/o‘zgardi/);
  ctx.prefix='form7';ctx.state.source.warehouse='';assert.throws(()=>vm.runInContext('assertDocument()',ctx),/qayta o‘qing/);
});


test('preparation accepts any positive number of distinct goods with one or two units each', () => {
  for (const quantities of [[1], [1,1], [1,2], [2,1], [2,2], [1,1,2]]) {
    const run = harness();
    run(`receiptPercent='0'; state.items=${JSON.stringify(quantities.map((quantity, index) => ({name:String.fromCharCode(65 + index),price:100 - index * 10,stock:2,qty:quantity,placed:0})))}; prepareReceipt()`);
    assert.equal(run('receiptReady'), true);
  }
});
test('preparation rejects missing, duplicate, fractional, excessive and over-stock quantities', () => {
  for (const items of [
    [{name:'A',price:100,stock:5,qty:1,placed:0},{name:'B',price:50,stock:5,placed:0}],
    [{name:'A',price:100,stock:5,qty:1,placed:0},{name:'A',price:50,stock:5,qty:1,placed:0}],
    [{name:'A',price:100,stock:5,qty:1,placed:0},{name:'B',price:50,stock:5,qty:1.5,placed:0}],
    [{name:'A',price:100,stock:5,qty:1,placed:0},{name:'B',price:50,stock:5,qty:3,placed:0}],
    [{name:'A',price:100,stock:0,qty:1,placed:0}],
    [{name:'A',price:100,stock:1,qty:2,placed:0}],
  ]) {
    const run = harness();
    run(`receiptPercent='0'; state.items=${JSON.stringify(items)}; prepareReceipt()`);
    assert.equal(run('receiptReady'), false);
  }
});
test('completion accepts any positive number of planned goods but rejects missing or invalid quantities', async () => {
  for (const [quantities, incomplete] of [
    [[1,1,1], false], [[1,2,2], false], [[1], false],
    [[0,1,2], true], [[1,0,1], true], [[0,0,0], true], [[1,3,1], true],
  ]) {
    const {ctx,run} = engineHarness();
    Object.assign(ctx, { validPercent:()=>true, percentValue:()=>0, receiptReady:true,
      isVisible:()=>true, domClick(){}, realClick:async()=>{}, cdp:async()=>{}, waitFor:async()=>{},
      norm:s=>String(s||'').trim().toLowerCase(), parseNumber:ReceiptMath.parseNumber, fmtSum:String, round2:n=>n,
      snapshotReceipt(){}, announce(){},
    });
    ctx.state.items = quantities.map((placed,index)=>({name:String.fromCharCode(65 + index),qty:2,placed,status:'kam'}));
    ctx.state.index = ctx.state.items.length;
    vm.runInContext(source.slice(source.indexOf('  async function runLoop()'),source.indexOf('  /** Continue after a pause:')),ctx);
    await run('runLoop()');
    assert.equal(ctx.state.status,'done');
    assert.equal(ctx.state.incomplete, incomplete);
  }
});


test('marked-only UI and engine contain no mode selector or plain-item path', () => {
  assert.match(source, /Faqat markirovkali/);
  assert.match(source, /har bir tovardan \$\{capText\(/);
  assert.match(source, /turlar soni cheklanmagan/);
  assert.doesNotMatch(source, /aynan 2 xil tovar/);
  assert.doesNotMatch(source, /type="radio"|modeMarked|modeUnmarked|setMode|canChangeMode|disableMarkingMode|plainListGrid|pickedGrid|fillPlain|plainQuantityDialog|confirmPlainQuantity|focusColumn|visibleCellOf/);
  const process = source.slice(source.indexOf('  async function processItem('),source.indexOf('  async function runLoop('));
  assert.match(process, /await enableMarkingMode\(\)/);
  assert.match(process, /await searchItem\(item\)/);
  assert.match(process, /await fillQuantities\(item, need\)/);
  assert.doesNotMatch(process, /state\.mode/);
});

test('one available marking code transfers one of planned two and deducts only after transfer', async () => {
  const {ctx,run} = engineHarness({placed:1});
  ctx.state.items[0].qty=2;
  ctx.transfer=async()=>{
    assert.equal(ctx.state.items[0].stock,5);
    assert.equal(ctx.state.inFlight.confirmedPlaced,1);
    ctx.transfers++;
  };
  await run('processItem(state.items[0])');
  assert.equal(ctx.transfers,1);
  assert.equal(ctx.state.items[0].stock,4);
  assert.equal(ctx.state.items[0].placed,1);
  assert.equal(ctx.state.items[0].qty,2);
  assert.equal(ctx.state.items[0].status,'kam');
});

test('legacy recovery requires reconciled intent and a new empty document; preserves remaining stock', async () => {
  for (const added of [false,true]) {
    const {ctx,run}=engineHarness({placed:1,fail:true});
    ctx.state.items[0].qty=2;
    await assert.rejects(run('processItem(state.items[0])'),/timeout/);
    ctx.state.legacyModeBlocked=true;
    ctx.state.documentNeedsAck=true;
    ctx.state.status='paused';
    await run('nextReceipt()');
    assert.equal(ctx.state.legacyModeBlocked,true);
    await run(`reconcileTransfer(${added})`);
    ctx.formPrefix=()=> 'form7';
    await run('nextReceipt()');
    assert.equal(ctx.state.legacyModeBlocked,true);
    ctx.formPrefix=()=> 'form8';
    ctx.emptyDocument=()=>false;
    await run('nextReceipt()');
    assert.equal(ctx.state.legacyModeBlocked,true);
    ctx.emptyDocument=()=>true;
    await run('nextReceipt()');
    assert.equal(ctx.state.legacyModeBlocked,false);
    assert.equal(ctx.state.mode,'marked');
    assert.equal(ctx.state.status,'idle');
    assert.equal(ctx.state.items[0].stock,added?4:5);
    assert.equal(ctx.state.items[0].totalUsed,added?1:0);
    assert.equal(ctx.state.items[0].placed,0);
    assert.equal(ctx.state.history[0].status,'stopped');
    assert.equal(ctx.state.history[0].legacy,true);
    assert.equal(ctx.state.history[0].items.length,added?1:0);
  }
});

function primaryHarness() {
  const inputs = { target:{value:'300'} };
  const ctx = vm.createContext({ReceiptMath,ReceiptPair,ReceiptLedger,
    state:{status:'idle',items:[{name:'A',price:100,stock:5,qty:0,placed:0},{name:'B',price:50,stock:5,qty:0,placed:0}],index:0,phase:'transfer',history:[]},
    restored:true,alive:()=>true,activeTask:null, el:name=>inputs[name],norm:s=>String(s||'').trim().toLowerCase(),
    save(){},render(){},log(){},runs:0,resumes:0,
    runLoop:async()=>{ctx.runs++;ctx.state.status='running';ctx.activeTask='run';},
    resume:()=>{ctx.resumes++;ctx.state.status='running';ctx.activeTask='run';},
    formPrefix:()=> 'form8',salesPodborButton:()=>({}),emptyDocument:()=>true,
  });
  vm.runInContext(source.slice(source.indexOf('  const parseNumber ='),source.indexOf('  // 1C grid helpers')) +
    source.slice(source.indexOf('  const round2 ='),source.indexOf('  // Step 2:')) +
    source.slice(source.indexOf('  async function primaryAction()'),source.indexOf('  function assertDocument(')) +
    source.slice(source.indexOf('  async function nextReceipt()'),source.indexOf('  // Panel UI')),ctx);
  return {ctx,inputs,run:expr=>vm.runInContext(expr,ctx)};
}
test('primary automatically plans, starts, pauses and resumes without a second control',async()=>{
  const {ctx,run}=primaryHarness();
  await run('primaryAction()');
  assert.equal(ctx.runs,1);
  assert.equal(ctx.state.plan.total,300);
  assert.equal(ctx.state.stepMode,false);
  await run('primaryAction()');
  assert.equal(ctx.state.status,'paused');
  await run('primaryAction()');
  assert.equal(ctx.resumes,1);
  assert.equal(ctx.runs,1);
});
test('done primary preserves newly entered target and plans remaining stock',async()=>{
  const {ctx,inputs,run}=primaryHarness();
  ctx.state.status='done';ctx.state.document={prefix:'form7'};
  ctx.state.items.forEach(i=>{i.stock=3;i.qty=2;i.placed=2;i.deducted=2;i.totalUsed=2;});
  inputs.target.value='300';
  await run('primaryAction()');
  assert.equal(ctx.runs,1);
  assert.equal(ctx.state.plan.target,300);
  assert.equal(ctx.state.plan.total,300);
  assert.equal(run('percentValue()'),0);
  assert.equal(inputs.target.value,'300');
  assert.equal(ctx.state.items[0].stock,3);
  assert.equal(ctx.state.items[0].placed,0);
});
test('done primary refuses existing or nonempty document without resetting receipt',async()=>{
  for(const empty of [false,true]) {
    const {ctx,run}=primaryHarness();
    ctx.state.status='done';ctx.state.document={prefix:'form8'};
    ctx.emptyDocument=()=>empty;
    ctx.state.items[0].placed=2;
    await run('primaryAction()');
    assert.equal(ctx.state.status,'done');assert.equal(ctx.state.items[0].placed,2);assert.equal(ctx.runs,0);
  }
});
test('restored progress resumes its quantities',async()=>{
  for(const status of ['idle','stopped','paused']) {
    const {ctx,run}=primaryHarness();
    ctx.state.status=status;ctx.state.pricingPercent=10;
    ctx.state.items.forEach(i=>{i.qty=2;});ctx.state.items[0].placed=1;
    await run('primaryAction()');
    assert.equal(ctx.resumes,1);assert.equal(ctx.state.plan,undefined);
    assert.equal(ctx.state.items[0].placed,1);
  }
});
test('capture and unresolved intent block primary without planning or resetting',async()=>{
  for(const blocked of ['capture','intent','document']) {
    const {ctx,run}=primaryHarness();
    if(blocked==='capture')ctx.activeTask='capture';
    if(blocked==='intent')ctx.state.inFlight={index:0};
    if(blocked==='document')ctx.state.documentNeedsAck=true;
    await run('primaryAction()');assert.equal(ctx.runs,0);assert.equal(ctx.resumes,0);assert.equal(ctx.state.plan,undefined);
  }
});
test('compact panel has one primary, collapsed details and truly hidden conditional recovery',()=>{
  const ui=source.slice(source.indexOf('  root.innerHTML ='),source.indexOf('  const PANEL_HTML'));
  assert.equal((ui.match(/class="b primary"/g)||[]).length,1);
  assert.match(ui,/data-el="perItem"/); assert.match(ui,/data-el="clock"/); assert.match(ui,/data-el="bad"/);
  assert.doesNotMatch(ui,/data-a="(?:min|close)"/);
  assert.match(ui,/<details class="card fold" data-el="details">/); assert.match(ui,/Tafsilotlar va jurnal<\/summary>/);
  // Ishonch dasturida qo'lda boshqarish yashirin (avtomatika tugmalarni ichkaridan bosadi), Chrome kengaytmasida ko'rinadi
  assert.match(ui,/data-el="manual"\$\{IS_DESKTOP \? ' hidden' : ''\}/);
  assert.match(ui,/\[hidden\] \{ display: none !important; \}/);
  assert.match(ui,/data-a="clear"/); assert.match(ui,/>Tozalash<\/button>/);
  assert.match(ui,/data-a="clearWarehouse"/); assert.match(ui,/>Omborni tozalash<\/button>/);
  assert.match(ui,/data-a="all"/); assert.match(ui,/>Barcha mahsulotlarni qo‘shish<\/button>/);
  assert.doesNotMatch(ui,/data-a="(?:newReceipt|prepare|plan|unplan|one|stop|pause|resume)"|data-el="stepMode"/);
  assert.match(source,/btn\('confirmAdded'\).hidden = btn\('confirmNotAdded'\).hidden = !state.inFlight/);
  assert.match(source,/btn\('confirmDocument'\).hidden = !state.documentNeedsAck \|\| !!state.inFlight/);
});

test('paused without a bound document or progress starts with a fresh automatic plan',async()=>{
  const {ctx,run}=primaryHarness();ctx.state.status='paused';
  ctx.state.items.forEach(i=>i.qty=5);
  await run('primaryAction()');
  assert.equal(ctx.runs,1);assert.equal(ctx.resumes,0);assert.equal(ctx.state.plan.total,300);
});
test('summary hides unplanned inventory and keeps completed actual totals pinned',()=>{
  const snippet=source.slice(source.indexOf('    const outsideRange ='),source.indexOf('    const totalUnits',source.indexOf('    const showSummary =')));
  const summary={};
  const ctx=vm.createContext({state:{status:'idle',items:[{qty:5,placed:0}]},receiptReady:false,hasProgress:()=>false,
    el:()=>summary,validTotals:true,sum:()=>999,fmtSum:String,hasTarget:true,currentTarget:100,round2:n=>n});
  vm.runInContext(snippet,ctx);assert.equal(summary.hidden,true);assert.equal(summary.textContent,'');
  ctx.receiptReady=true;vm.runInContext('{'+snippet+'}',ctx);
  assert.equal(summary.hidden,false);assert.equal(summary.textContent,'Reja: 999 so‘m • farq 899');
  ctx.state.status='done';ctx.state.pricingResult={total:224};ctx.state.receiptTarget=220;ctx.currentTarget=999;
  vm.runInContext('{'+snippet+'}',ctx);assert.equal(summary.textContent,'Yig‘ib bo‘lindi • Jami: 224 so‘m • farq 4');
});

function captureHarness({ limit = '', start = 200, total = 319, known = true, zero = false, duplicate = false, invalidQty = false } = {}) {
  let position = Math.min(start, total);
  const input = { value: limit };
  const grid = { querySelector: () => ({}), contains: () => true };
  const ctx = vm.createContext({ ReceiptMath, ReceiptLedger, Map, Date, Number,
    state: { status:'idle', items:[{name:'existing'}], plan:{target:123}, captureLimit:limit, log:[] },
    activeTask:null, resumeCount:0, StopError:class extends Error {}, T:{}, calls:[], messages:[], resets:0,
    el:()=>input, hasProgress:()=>false, render(){}, save(){}, startClock(){},
    log:(text,level)=>ctx.messages.push({text,level}), resetReceipt:()=>ctx.resets++,
    document:{activeElement:{},getElementById:()=>({value:'Main'})},
    findInventoryGrid:()=>grid, gridColumns:()=>({}), colOf:(_,key)=>key,
    inventoryTitle:()=>({title:'Inventory',rowCount:known?total:null}), formPrefix:()=> 'form7',
    gridRows:()=>Array.from({length:Math.min(10,total-position+1)},(_,i)=>position+i),
    cellOf:row=>row, cellText:(row,col)=>col==='rowNumber'?String(row):col==='item'?(duplicate && row<=2?'Same':`Item ${row}`):col==='qtyActual'?(invalidQty && row===2?'bad':(zero && row===1?'0':'5')):'100',
    parseNumber:ReceiptMath.parseNumber,norm:s=>s.toLowerCase(), sleep:async()=>{},checkpoint:async()=>{},
    realClick:async()=>ctx.calls.push('click'),
    cdp:async action=>{ctx.calls.push(action.key);position=action.key==='PageUp'?Math.max(1,position-10):Math.min(Math.max(1,total-9),position+10);},
  });
  // Use actual capture functions with a virtual grid and trusted-input spy.
  vm.runInContext(source.slice(source.indexOf('  function parseCaptureLimit('),source.indexOf('  // Sum plan:')),ctx);
  return {ctx,input,run:expr=>vm.runInContext(expr,ctx)};
}

test('limited capture seeks from row 200 to top before selecting physical rows 1..100',async()=>{
  for (const known of [true,false]) {
    const {ctx,run}=captureHarness({limit:'100',known});
    await run('capture()');
    assert.equal(ctx.state.source.rowCount,100);
    assert.equal(ctx.state.source.requestedLimit,100);
    assert.equal(ctx.state.source.totalRowCount,known?319:null);
    assert.deepEqual(Array.from(ctx.state.items.flatMap(i=>i.rowNumbers)),Array.from({length:100},(_,i)=>i+1));
    assert.equal(ctx.calls.filter(c=>c==='PageDown').length,9);
    assert.ok(ctx.calls.filter(c=>c==='PageUp').length>3);
    assert.equal(ctx.messages.some(m=>m.text.startsWith('Diqqat:')),false);
  }
});

test('limited capture rejects a frozen middle viewport and retains existing items',async()=>{
  for (const known of [true,false]) {
    const {ctx,run}=captureHarness({limit:'100',start:200,known});
    const items=ctx.state.items;
    const prior=JSON.stringify(items);
    ctx.cdp=async action=>{ctx.calls.push(action.key);};
    await assert.rejects(run('capture()'),/Jadval boshiga o‘tib bo‘lmadi/);
    assert.equal(ctx.state.items,items);
    assert.equal(JSON.stringify(ctx.state.items),prior);
    assert.equal(ctx.state.source,undefined);
    assert.deepEqual(ctx.calls,['click','PageUp','PageUp','PageUp']);
    assert.equal(ctx.activeTask,null);
    assert.equal(ctx.state.status,'idle');
  }
});

test('zero stock counts toward row limit and duplicate names merge only after selection',async()=>{
  const zero=captureHarness({limit:'2',zero:true});
  await zero.run('capture()');
  assert.equal(zero.ctx.state.source.rowCount,2);
  assert.deepEqual(Array.from(zero.ctx.state.items.flatMap(i=>i.rowNumbers)),[2]);
  const duplicate=captureHarness({limit:'2',duplicate:true});
  await duplicate.run('capture()');
  assert.equal(duplicate.ctx.state.items.length,1);
  assert.equal(duplicate.ctx.state.items[0].stock,10);
  assert.deepEqual(Array.from(duplicate.ctx.state.items[0].rowNumbers),[1,2]);
});

test('invalid quantity skips only that inventory row and continues capture',async()=>{
  const result=captureHarness({limit:'3',invalidQty:true});
  await result.run('capture()');
  assert.deepEqual(Array.from(result.ctx.state.items.flatMap(i=>i.rowNumbers)),[1,3]);
  assert.equal(result.ctx.state.items.length,2);
  assert.ok(result.ctx.messages.some(m=>m.level==='warn' && m.text.includes('Item 2')));
  assert.ok(result.ctx.messages.some(m=>m.level==='warn' && m.text.includes('1 ta qator')));
});

test('limit exceeding available rows finishes with known or unknown total',async()=>{
  for(const known of [true,false]) {
    const {ctx,run}=captureHarness({limit:'100',total:23,start:20,known});
    await run('capture()');
    assert.equal(ctx.state.source.rowCount,23);
    assert.equal(ctx.state.items.length,23);
    assert.ok(ctx.calls.length<30);
    assert.equal(ctx.messages.some(m=>m.text.startsWith('Diqqat:')),false);
  }
});

test('blank limit retains full two-direction capture from middle with unknown total',async()=>{
  for(const known of [true,false]) {
    const {ctx,run}=captureHarness({total:219,known});
    await run('capture()');
    assert.equal(ctx.state.source.rowCount,219);
    assert.equal(ctx.state.source.requestedLimit,null);
    assert.ok(ctx.calls.includes('PageDown'));
    assert.ok(ctx.calls.includes('PageUp'));
  }
});

test('invalid limits reject before reset, inventory clicks, CDP or existing item changes',async()=>{
  for(const limit of ['0','-1','1.5','1e2','+2','Infinity','NaN','9007199254740992','9'.repeat(400)]) {
    const {ctx,run}=captureHarness({limit});
    const prior=JSON.stringify(ctx.state);
    await assert.rejects(run('capture()'),/musbat butun/);
    assert.equal(JSON.stringify(ctx.state),prior);
    assert.equal(ctx.resets,0);
    assert.equal(ctx.calls.length,0);
    assert.equal(ctx.activeTask,null);
  }
  const {run}=captureHarness();
  assert.equal(run("parseCaptureLimit(' 100 ')"),100);
  assert.equal(run("parseCaptureLimit('   ')"),null);
  assert.equal(run("parseCaptureLimit('9007199254740991')"),Number.MAX_SAFE_INTEGER);
});

test('range "4-20" reads rows 4 to 20 inclusive, from any starting position',async()=>{
  for (const known of [true,false]) for (const start of [1,200]) {
    const {ctx,run}=captureHarness({limit:'4-20',start,known});
    await run('capture()');
    assert.deepEqual(Array.from(ctx.state.items.flatMap(i=>i.rowNumbers)),Array.from({length:17},(_,i)=>i+4));
    assert.equal(ctx.state.source.requestedFrom,4);assert.equal(ctx.state.source.requestedLimit,20);
    assert.equal(ctx.messages.some(m=>m.text.startsWith('Diqqat:')),false);
  }
});

test('range past the end of the table reads what exists; a start beyond it is refused',async()=>{
  const {ctx,run}=captureHarness({limit:'20-100',total:30,start:25});
  await run('capture()');
  assert.deepEqual(Array.from(ctx.state.items.flatMap(i=>i.rowNumbers)),Array.from({length:11},(_,i)=>i+20));
  const far=captureHarness({limit:'50-60',total:30});
  await assert.rejects(far.run('capture()'),/30 qator bor/);
  assert.equal(far.ctx.calls.length,0);
});

test('malformed ranges are rejected before anything is read',()=>{
  const {run}=captureHarness();
  for (const bad of ['20-4','0-5','4-','-5','a-b','4-20-30','4--20','1.5-3']) {
    assert.throws(()=>run(`parseCaptureLimit(${JSON.stringify(bad)})`),/musbat butun/,bad);
  }
  assert.deepEqual(JSON.parse(JSON.stringify(run("parseCaptureLimit(' 4 - 20 ')"))),{from:4,to:20});
  assert.deepEqual(JSON.parse(JSON.stringify(run("parseCaptureLimit('4–20')"))),{from:4,to:20});
  assert.deepEqual(JSON.parse(JSON.stringify(run("parseCaptureLimit('5-5')"))),{from:5,to:5});
});

test('capture setting saves independently and shares capture button protection',()=>{
  const input={value:'200',disabled:false};
  const ctx=vm.createContext({restored:true,alive:()=>true,state:{captureLimit:''},el:()=>input,saves:0,save(){ctx.saves++;}});
  let handler;
  input.addEventListener=(_,callback)=>{handler=callback;};
  vm.runInContext(source.slice(source.indexOf("  el('captureLimit').addEventListener"),source.indexOf("  el('target').addEventListener")),ctx);
  handler({target:input});
  assert.equal(ctx.state.captureLimit,'200');assert.equal(ctx.saves,1);
  input.disabled=true;input.value='300';handler({target:input});
  assert.equal(ctx.state.captureLimit,'200');assert.equal(ctx.saves,1);
  assert.match(source,/captureLimit: ''/);
  assert.match(source,/el\('captureLimit'\).disabled = btn\('capture'\).disabled/);
  const {ctx:engine,run}=engineHarness();engine.state.captureLimit='100';
  engine.state.status='done';
  return run('nextReceipt()').then(()=>assert.equal(engine.state.captureLimit,'100'));
});


test('fresh target input invalidates old plan and start passes the edited target to planner', async()=>{
  const {ctx,inputs,run}=primaryHarness();
  await run('primaryAction()');
  ctx.state.status='idle';ctx.activeTask=null;
  let inputHandler;
  inputs.target.addEventListener=(_,handler)=>{inputHandler=handler;};
  vm.runInContext(source.slice(source.indexOf("  el('target').addEventListener"), source.indexOf("  for (const type of ['keydown'")),ctx);
  inputs.target.value='440';inputHandler();
  assert.equal(ctx.state.plan,null);
  assert.equal(run('receiptReady'),false);
  let received;
  ctx.ReceiptPair={plan:(items,target,percent)=>{received={target,percent};return ReceiptPair.plan(items,target,percent);}};
  await run('primaryAction()');
  assert.deepEqual(received,{target:440,percent:0});
  assert.equal(ctx.state.plan.target,440);
  assert.equal(ctx.runs,2);
});

test('invalid fresh target clears stale readiness and plan and cannot start',async()=>{
  const {ctx,inputs,run}=primaryHarness();
  await run('primaryAction()');
  ctx.state.status='idle';ctx.activeTask=null;
  inputs.target.value='bad';
  run('applyPlan(NaN)');
  assert.equal(ctx.state.plan,null);
  assert.equal(run('receiptReady'),false);
  await run('primaryAction()');
  assert.equal(ctx.runs,1);
});


test('bound or started receipt rejects edited target and resumes only its pinned target',async()=>{
  for(const bound of ['document','progress','pricing']) {
    const {ctx,inputs,run}=primaryHarness();
    ctx.state.receiptTarget=330;
    ctx.state.items.forEach(i=>i.qty=2);
    if(bound==='document') ctx.state.document={prefix:'form7'};
    if(bound==='progress') ctx.state.items[0].placed=1;
    if(bound==='pricing') ctx.state.phase='pricing';
    inputs.target.value='440';
    await run('primaryAction()');
    assert.equal(ctx.resumes,0);assert.equal(ctx.runs,0);
    assert.equal(ctx.state.items[0].qty,2);
    inputs.target.value='330';
    await run('primaryAction()');
    assert.equal(ctx.resumes,1);
  }
});


test('clearing target before start never restores previous plan during render',()=>{
  const {ctx,inputs,run}=primaryHarness();
  run('applyPlan(330)');
  let handler;
  inputs.target.addEventListener=(_,callback)=>{handler=callback;};
  ctx.render=()=>vm.runInContext("if (state.plan) el('target').value ||= String(state.plan.target)",ctx);
  vm.runInContext(source.slice(source.indexOf("  el('target').addEventListener"),source.indexOf("  for (const type of ['keydown'")),ctx);
  inputs.target.value='';handler();
  assert.equal(inputs.target.value,'');
  assert.equal(ctx.state.plan,null);
  assert.equal(run('receiptReady'),false);
});

test('planner bounds persist and unreachable target emits warning without blocking',()=>{
  const {ctx,run}=primaryHarness();
  const messages=[];ctx.log=(message,level)=>messages.push({message,level});
  // Use the production planner so API field-name drift fails this integration test.
  assert.equal(ctx.ReceiptPair,ReceiptPair);
  run('applyPlan(500)');
  assert.equal(ctx.state.plan.minTotal,100);assert.equal(ctx.state.plan.maxTotal,300);
  assert.equal(run('receiptReady'),true);
  assert.equal(messages.at(-1).level,'warn');
  assert.match(messages.at(-1).message,/eng yaqin mumkin summa 300/);
  const summary={};
  Object.assign(ctx,{validTotals:true,sum:()=>330,hasTarget:true,currentTarget:500});
  ctx.el=()=>summary;
  const snippet=source.slice(source.indexOf('    const outsideRange ='),source.indexOf('    const totalUnits',source.indexOf('    const outsideRange =')));
  vm.runInContext(snippet,ctx);
  assert.match(summary.textContent,/eng yaqin mumkin: 330/);
  assert.match(summary.textContent,/mumkin: 100–300 • maqsad 500 • farq -170/);
});

function lifecycleHarness() {
  let finishRestore;
  const listeners=new Set(), intervals=new Map(), timeouts=new Map(), writes=[], calls=[];
  const fields=new Map();
  const clicks=[], events=[], connects=new Set();
  const field=name=>{if(!fields.has(name))fields.set(name,{value:'',style:{},addEventListener(){},textContent:'',
    tagName:name.includes('data-el')?'INPUT':'BUTTON',disabled:false,hidden:false,
    click(){clicks.push(name);},dispatchEvent(e){events.push([name,e.type]);}});return fields.get(name);};
  const root={innerHTML:'',addEventListener(){},querySelector:field,querySelectorAll:()=>[]};
  let host;
  const document={hidden:false,hasFocus:()=>true,getElementById:()=>host?.isConnected?host:null,
    createElement:()=>host={style:{},attachShadow:()=>root,isConnected:false,remove(){this.isConnected=false;}},
    documentElement:{appendChild:h=>{h.isConnected=true;}},querySelectorAll:()=>[]};
  const ctx=vm.createContext({ReceiptMath,ReceiptLedger,ReceiptPair,ReceiptStateMigration:require('./state-migration.js'),
    window:{},document,navigator:{platform:'Mac'},console,Event:class{constructor(type){this.type=type;}},
    setTimeout:fn=>{const id={};timeouts.set(id,fn);return id;},clearTimeout:id=>timeouts.delete(id),
    setInterval:fn=>{const id={};intervals.set(id,fn);return id;},clearInterval:id=>intervals.delete(id),
    chrome:{runtime:{id:'fixture',getManifest:()=>({version:'0.9.4'}),sendMessage:async msg=>{calls.push(msg);return {ok:true};},
      onMessage:{addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)},
      onConnect:{addListener:fn=>connects.add(fn),removeListener:fn=>connects.delete(fn)}},
      storage:{local:{get:()=>new Promise(resolve=>{finishRestore=resolve;}),set:async value=>writes.push(JSON.parse(JSON.stringify(value)))}}},
  });
  // Exercise production lifecycle/restore/actions, with rendering isolated from DOM layout.
  let executable=source;
  const start=executable.indexOf('  function render(live) {'),end=executable.indexOf('  // Clicking the panel',start);
  executable=executable.slice(0,start)+'  function render() {}\n'+executable.slice(end);
  executable=executable.replace(/\}\)\(\);\s*$/, 'window.testAPI={save,cdp,checkpoint,stateReady,host,getState:()=>state,timerSleep,abortAll};})();');
  return {ctx,listeners,connects,clicks,events,intervals,timeouts,writes,calls,root,field,load:()=>vm.runInContext(executable,ctx),restore:data=>finishRestore(data)};
}
test('toolbar waits for restore; actions cannot overwrite pending saved ledger',async()=>{
 const h=lifecycleHarness();h.load();
 const listener=[...h.listeners][0];let response;
 assert.equal(listener({type:'openPanel'},null,value=>{response=value;}),true);
 assert.equal(response,undefined);assert.equal(h.writes.length,0);
 const api=h.ctx.window.testAPI;
 assert.throws(()=>api.save(),/not ready/);
 h.restore({mk1c_state:{version:'0.9.4',schemaVersion:1,status:'running',items:[{name:'A',stock:3,qty:2,placed:1,deducted:1,totalUsed:2,initialStock:5}],index:0,history:[],log:[]}});
 await api.stateReady;await Promise.resolve();
 assert.equal(response.version,'0.9.4');assert.equal(api.getState().status,'paused');assert.equal(api.getState().items[0].stock,3);
 for(const type of ['mkVersion','togglePanel','openPanel']) {response=null;listener({type},null,value=>{response=value;});await Promise.resolve();assert.equal(response.version,'0.9.4');}
 await api.cdp({type:'key',key:'Enter'});assert.equal(h.calls[0].version,'0.9.4');
});
test('replacement disposes own listeners and ports; stale restore/save/CDP/checkpoint are inert',async()=>{
 const h=lifecycleHarness();h.load();const old=h.ctx.window.__mkKochirishInstance,api=h.ctx.window.testAPI;
 const oldPort=fakePort();[...h.connects][0](oldPort);
 // Existing restore is resolved before replacement, but its promise continuation runs afterwards.
 h.restore({mk1c_state:{status:'idle',items:[],index:0}});
 old.version='0.9.3';h.load();
 assert.equal(h.listeners.size,1);assert.equal(h.connects.size,1);assert.equal(h.intervals.size,0);assert.equal(old.alive(),false);
 assert.equal(oldPort.disconnected,true);
 await api.stateReady;assert.equal(h.writes.length,0);assert.equal(oldPort.sent.length,0);
 assert.throws(()=>api.save());await assert.rejects(api.cdp({}));await assert.rejects(api.checkpoint());assert.equal(h.calls.length,0);
 old.dispose();assert.equal(h.ctx.window.__mkKochirishInstance.alive(),true);
 h.restore({});await h.ctx.window.testAPI.stateReady;
 const current=h.ctx.window.__mkKochirishInstance;h.load();assert.equal(h.ctx.window.__mkKochirishInstance,current);assert.equal(h.listeners.size,1);
});
test('invalidated previous runtime cannot abort new startup and corrupt evidence is untouched',async()=>{
 const h=lifecycleHarness();h.ctx.window.__mkKochirishInstance={version:'0.9.4',alive(){throw Error('Extension context invalidated');},dispose(){throw Error('Extension context invalidated');}};
 h.load();assert.equal(h.listeners.size,1);
 h.restore({mk1c_state:{schemaVersion:999,items:[],index:0,status:'idle'}});
 await h.ctx.window.testAPI.stateReady;assert.equal(h.writes.length,0);assert.throws(()=>h.ctx.window.testAPI.save(),/not ready/);
 assert.match(h.field('[data-el="progress"]').textContent,/Unsupported saved schema/);
});


test('side panel port gets template and view, forwards enabled clicks and typed values; legacy timers stay retired',async()=>{
 const h=lifecycleHarness();
 let legacyReattachments=0;
 const legacyRepair=()=>{if(h.ctx.window.__mkKochirishAlive())legacyReattachments++;};
 h.load();
 const connect=[...h.connects][0],port=fakePort(),other=fakePort('other');
 connect(port);connect(other);
 assert.equal(port.sent.length,0); // nothing before the saved state is restored
 h.restore({});await h.ctx.window.testAPI.stateReady;await new Promise(r=>setImmediate(r));
 assert.equal(port.sent[0].type,'template');assert.equal(port.sent[0].version,'0.9.4');
 assert.equal(port.sent.at(-1).type,'view');assert.equal(port.sent.at(-1).status,'idle');
 assert.equal(other.sent.length,0);
 port.send({type:'click',a:'start'});assert.deepEqual(h.clicks,['[data-a="start"]']);
 h.field('[data-a="capture"]').disabled=true;port.send({type:'click',a:'capture'});assert.equal(h.clicks.length,1);
 port.send({type:'input',name:'target',value:'440'});
 assert.equal(h.field('[data-el="target"]').value,'440');assert.deepEqual(h.events.at(-1),['[data-el="target"]','input']);
 legacyRepair();assert.equal(legacyReattachments,0);
 assert.equal((source.match(/__mkKochirishAlive/g)||[]).length,1);
 h.ctx.window.__mkKochirishInstance.dispose();
 assert.equal(port.disconnected,true);assert.equal(h.connects.size,0);
});

function fakePort(name='mk-panel'){
 const messages=[],drops=[];
 return {name,sent:[],disconnected:false,postMessage(m){this.sent.push(JSON.parse(JSON.stringify(m)));},
  onMessage:{addListener:f=>messages.push(f)},onDisconnect:{addListener:f=>drops.push(f)},
  disconnect(){this.disconnected=true;},send:m=>messages.forEach(f=>f(m)),drop:()=>drops.forEach(f=>f())};
}

test('per-item setting takes up to N units, a smaller stock whole, or everything; it is pinned in the plan', () => {
  const items = "[{name:'A',price:100,qty:0,stock:7,placed:0},{name:'B',price:50,qty:0,stock:3,placed:0},{name:'C',price:10,qty:0,stock:1,placed:0}]";
  const run = harness();
  run(`receiptPercent='0'; state.items=${items}; state.perItemLimit='5'; applyPlan(100000)`);
  assert.deepEqual(JSON.parse(run('JSON.stringify(state.items.map(i=>i.qty))')), [5, 3, 1]);
  assert.equal(run('state.plan.perItem'), 5);
  assert.equal(run('receiptReady'), true);
  run(`state.items=${items}; state.perItemLimit=''; applyPlan(100000)`);
  assert.deepEqual(JSON.parse(run('JSON.stringify(state.items.map(i=>i.qty))')), [7, 3, 1]);
  assert.equal(run('state.plan.perItem'), 'all');
  assert.equal(run('receiptReady'), true);
  run(`state.items=${items}; state.perItemLimit='hammasi'; applyAllPlan()`);
  assert.deepEqual(JSON.parse(run('JSON.stringify(state.items.map(i=>i.qty))')), [7, 3, 1]);
  assert.equal(run('state.plan.all'), true);
  run(`state.items=${items}; state.perItemLimit='3'; applyAllPlan()`);
  assert.deepEqual(JSON.parse(run('JSON.stringify(state.items.map(i=>i.qty))')), [3, 3, 1]);
  // More than the pinned limit is refused even when the stock has it
  run('state.items[0].qty=4; prepareReceipt()');
  assert.equal(run('receiptReady'), false);
  for (const bad of ['0', '-2', '1.5', 'abc']) {
    run(`state.items=${items}; state.plan=null; state.perItemLimit=${JSON.stringify(bad)}; applyPlan(100000)`);
    assert.equal(run('state.plan'), null, bad);
    assert.equal(run('receiptReady'), false, bad);
  }
  // Saved state from before the setting keeps the old limit of 2
  run(`state.items=${items}; delete state.perItemLimit; applyPlan(100000)`);
  assert.deepEqual(JSON.parse(run('JSON.stringify(state.items.map(i=>i.qty))')), [2, 2, 1]);
});

test('bad marking codes keep product, inventory rows and list position, once per code', () => {
  const ctx = vm.createContext({ state: {} });
  vm.runInContext(source.slice(source.indexOf('  /** Remembers a skipped marking code'), source.indexOf('  /** Подбор button')), ctx);
  const item = { name: 'Sut 1L', rowNumbers: [12, 40] };
  vm.runInContext("noteBadCode(item, '0104600000000017', 3, 'sotilgan')", Object.assign(ctx, { item }));
  vm.runInContext("noteBadCode(item, '0104600000000017', 4, 'tekshirilmadi')", ctx);
  vm.runInContext("noteBadCode(item, '0104600000000024', 5, 'sotilgan')", ctx);
  assert.equal(ctx.state.badCodes.length, 2);
  assert.deepEqual({ ...ctx.state.badCodes[0], rows: [...ctx.state.badCodes[0].rows], time: undefined },
    { name: 'Sut 1L', rows: [12, 40], position: 4, code: '0104600000000017', reason: 'tekshirilmadi', time: undefined });
  const fill = source.slice(source.indexOf('  async function fillQuantities('), source.indexOf('  /** The × button'));
  assert.match(fill, /noteBadCode\(item, code, position, reason\)/);
  assert.match(fill, /\$\{position\}-kod/);
});

test('full capture from deep in the middle returns all the way to the top', async () => {
  for (const known of [true, false]) {
    const { ctx, run } = captureHarness({ start: 100, total: 319, known });
    await run('capture()');
    assert.equal(ctx.state.source.rowCount, 319, `known=${known}`);
    assert.equal(ctx.state.items.length, 319);
  }
});

test('a slow 1C reply is waited for instead of being taken for the table edge', async () => {
  const { ctx, run } = captureHarness({ start: 100, total: 319, known: false });
  const move = ctx.cdp;
  let pending = null;
  // The viewport moves only after the next wait, like a slow server round trip
  ctx.cdp = async (action) => { pending = action; ctx.calls.push(action.key); };
  ctx.sleep = async () => { if (pending) { const a = pending; pending = null; ctx.calls.pop(); await move(a); } };
  await run('capture()');
  assert.equal(ctx.state.source.rowCount, 319);
});

test('capture puts a lost cursor back into the table instead of stopping', async () => {
  const { ctx, run } = captureHarness({ start: 1, total: 60, known: true });
  let focused = true;
  ctx.findInventoryGrid = () => ({ querySelector: () => ({}), contains: () => focused });
  const click = ctx.realClick;
  ctx.realClick = async (...args) => { focused = true; return click(...args); };
  const move = ctx.cdp;
  // 1C takes the focus away once, in the middle of the table
  ctx.cdp = async (action) => { await move(action); if (ctx.calls.filter((c) => c === 'PageDown').length === 2) focused = false; };
  await run('capture()');
  assert.equal(ctx.state.source.rowCount, 60);
  assert.equal(ctx.calls.filter((c) => c === 'click').length, 2);
  assert.ok(ctx.messages.some((m) => /Kursor jadvalga qaytarildi/.test(m.text)));
});

test('next receipt names the exact reason it cannot start', async () => {
  const cases = [
    [() => '', () => true, /Реализация hujjati topilmadi/],
    [() => 'form8', () => false, /bo‘sh emas/],
    [() => 'form7', () => true, /o‘sha oynasi/],
  ];
  for (const [prefix, empty, message] of cases) {
    const { ctx, run } = engineHarness();
    const logs = [];
    ctx.log = (text) => logs.push(text);
    ctx.state.status = 'done';
    ctx.state.document = { prefix: 'form7' };
    ctx.formPrefix = prefix;
    ctx.emptyDocument = empty;
    await run('nextReceipt()');
    assert.equal(ctx.state.status, 'done');
    assert.match(logs.at(-1), message);
  }
});

test('manual marking check reports soliq.uz verdict and where 1C showed the code; blocked while running', async () => {
  const input = { value: ' 0104600000000017\u001d91AB  0104600000000024 ' };
  const logs = [];
  const asked = [];
  const ctx = vm.createContext({ state: { status: 'idle' }, activeTask: null, render() {}, el: () => input,
    log: (text) => logs.push(text),
    checkMarkingCode: async (code) => { asked.push(code); return { verdict: code.endsWith('AB') ? 'sold' : 'available', product: 'Sut 1L', steps: 4 }; } });
  vm.runInContext(source.slice(source.indexOf('  /** Remembers which product'), source.indexOf('  /** Remembers a skipped marking code')), ctx);
  vm.runInContext("rememberCode({ name: 'Sut 1L', rowNumbers: [12] }, '010460000000001791AB', 3)", ctx);
  await vm.runInContext('checkCodesManually()', ctx);
  assert.deepEqual(asked, ['010460000000001791AB', '0104600000000024']);
  assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(checkResults.map(r => [r.code, r.verdict, r.pending]))', ctx)),
    [['0104600000000024', 'available', false], ['010460000000001791AB', 'sold', false]]);
  assert.equal(ctx.state.seenCodes['010460000000001791AB'].position, 3);
  assert.equal(input.value, '');
  ctx.state.status = 'running';
  vm.runInContext("activeTask = 'run'", ctx);
  input.value = '0104600000000031';
  await vm.runInContext('checkCodesManually()', ctx);
  assert.equal(asked.length, 2);
  assert.match(logs.at(-1), /Pauza/);
});

test('Olish right after a finished receipt archives it and reads fresh data without Tozalash', async () => {
  const { ctx, run } = captureHarness({ start: 1, total: 30, known: true });
  ctx.state.status = 'done';
  let closed = 0;
  ctx.clearReceipt = async () => { closed++; ctx.state.status = 'idle'; };
  await run('capture()');
  assert.equal(closed, 1);
  assert.equal(ctx.state.source.rowCount, 30);
  assert.equal(ctx.state.items.length, 30);
  // An unfinished receipt is still protected
  const busy = captureHarness({ start: 1, total: 30, known: true });
  busy.ctx.state.status = 'paused';
  busy.ctx.clearReceipt = async () => { throw new Error('must not close'); };
  await busy.run('capture()');
  assert.equal(busy.ctx.state.source, undefined);
});

test('confirmed codes are marked used for later receipts; unconfirmed ones are dropped', async () => {
  const { ctx, run } = engineHarness();
  ctx.state.receiptId = 111;
  ctx.fillQuantities = async () => { ctx.state.pendingCodes = ['C1', 'C2']; return 2; };
  await run('processItem(state.items[0])');
  assert.deepEqual(Object.keys(ctx.state.usedCodes), ['C1', 'C2']);
  assert.equal(ctx.state.usedCodes.C1.receiptId, 111);
  assert.equal(ctx.state.usedCodes.C1.name, 'A');
  assert.deepEqual([...ctx.state.pendingCodes], []);
  // A transfer whose result is confirmed as "not added" leaves its codes free
  const second = engineHarness({ fail: true });
  second.ctx.fillQuantities = async () => { second.ctx.state.pendingCodes = ['C3']; return 1; };
  await assert.rejects(second.run('processItem(state.items[0])'), /timeout/);
  await second.run('reconcileTransfer(false)');
  assert.equal(second.ctx.state.usedCodes?.C3, undefined);
  const third = engineHarness({ fail: true });
  third.ctx.fillQuantities = async () => { third.ctx.state.pendingCodes = ['C4']; return 1; };
  await assert.rejects(third.run('processItem(state.items[0])'), /timeout/);
  await third.run('reconcileTransfer(true)');
  assert.ok(third.ctx.state.usedCodes.C4);
  const fill = source.slice(source.indexOf('  async function fillQuantities('), source.indexOf('  /** The × button'));
  assert.match(fill, /used\.receiptId !== state\.receiptId/);
  assert.ok(fill.indexOf('oldingi chekda ishlatilgan') < fill.indexOf('await checkMarkingCode(code)'));
});

function skipHarness(fails) {
  const {ctx,run}=engineHarness();
  Object.assign(ctx, { validPercent:()=>true, percentValue:()=>12, receiptReady:true, logs:[], closed:0, podborOpen:false,
    log(m){ctx.logs.push(m);}, podborCheckbox:()=>ctx.podborOpen, closePodbor:async()=>{ctx.closed++; ctx.podborOpen=false;},
    isVisible:()=>true, domClick(){}, realClick:async()=>{}, cdp:async()=>{}, waitFor:async()=>{},
    norm:s=>String(s||'').trim().toLowerCase(), parseNumber:ReceiptMath.parseNumber, fmtSum:String, round2:n=>Math.round(n*100)/100,
    snapshotReceipt(){}, announce(){},
  });
  vm.runInContext(source.slice(source.indexOf('  async function runLoop()'),source.indexOf('  /** Continue after a pause:')),ctx);
  ctx.state.plan={target:200};
  ctx.state.items=['A','B','C','D'].map(name=>ReceiptLedger.normalizeItem({name,stock:5,price:100,qty:2,placed:0,status:'pending'}));
  ctx.searchItem=async(item)=>{ ctx.podborOpen=true; const f=fails(item); if(f) throw f; };
  return {ctx,run};
}
test('a product that fails in 1C search is skipped and the run goes on with the next one', async()=>{
  const {ctx,run}=skipHarness(item=>item.name==='B' && Error('Kutish vaqti tugadi: «B» bo‘yicha qidiruv natijasi'));
  ctx.closePodbor=async()=>{ctx.closed++; ctx.podborOpen=false;};
  ctx.transfer=async()=>{ctx.transfers++; ctx.podborOpen=false;};
  await run('runLoop()');
  assert.equal(ctx.state.status,'done');
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.state.items.map(i=>[i.name,i.status,i.placed]))),[['A','ok',2],['B','skip',0],['C','ok',2],['D','ok',2]]);
  assert.equal(ctx.closed,1); // the failed product's Подбор was closed, its 1s dropped
  assert.match(ctx.state.items[1].note,/tashlab ketildi.*qidiruv/);
  assert.equal(ctx.state.incomplete,false);
  assert.ok(ctx.logs.some(m=>/1 ta tovar xato sababli tashlab ketildi/.test(m)));
});
test('document errors, unclosable Подбор and repeated failures pause instead of skipping', async()=>{
  let h=skipHarness(item=>item.name==='B' && Object.assign(Error('Hujjat raqami o‘zgardi.'),{document:true}));
  h.ctx.transfer=async()=>{h.ctx.transfers++; h.ctx.podborOpen=false;};
  h.ctx.checkpoint=async()=>{ if(h.ctx.state.status==='paused') throw new h.ctx.StopError(); };
  await h.run('runLoop()');
  assert.equal(h.ctx.state.items[1].status,'xato');
  assert.equal(h.ctx.state.index,1);

  h=skipHarness(item=>item.name==='A' && Error('focus'));
  h.ctx.closePodbor=async()=>{throw Error('no close');};
  h.ctx.checkpoint=async()=>{ if(h.ctx.state.status==='paused') throw new h.ctx.StopError(); };
  await h.run('runLoop()');
  assert.equal(h.ctx.state.items[0].status,'xato');
  assert.equal(h.ctx.state.index,0);

  h=skipHarness(()=>Error('chrome.debugger javob bermadi'));
  h.ctx.checkpoint=async()=>{ if(h.ctx.state.status==='paused') throw new h.ctx.StopError(); };
  await h.run('runLoop()');
  assert.deepEqual(JSON.parse(JSON.stringify(h.ctx.state.items.map(i=>i.status))),['skip','skip','xato','pending']);
  assert.equal(h.ctx.state.status,'paused');
});

test('capture reads numbers in the 1C locale: Russian "5,000" is 5, English "1,000" is 1000',async()=>{
  const ru=captureHarness({limit:'3'});
  ru.ctx.cellText=(row,col)=>col==='rowNumber'?String(row):col==='item'?`Item ${row}`:col==='qtyActual'?'5,000':'1 200,50';
  await ru.run('capture()');
  assert.deepEqual(Array.from(ru.ctx.state.items.map(i=>i.stock)),[5,5,5]);
  assert.equal(ru.ctx.state.items[0].price,1200.5);
  const en=captureHarness({limit:'3'});
  en.ctx.cellText=(row,col)=>col==='rowNumber'?String(row):col==='item'?`Item ${row}`:col==='qtyActual'?(row===1?'1,000':'5'):'12.50';
  await en.run('capture()');
  assert.deepEqual(Array.from(en.ctx.state.items.map(i=>i.stock)),[1000,5,5]);
});

test('row numbers with group separators are not read as row 1',async()=>{
  const {ctx,run}=captureHarness({total:1005,start:996});
  ctx.cellText=(row,col)=>col==='rowNumber'?(row>=1000?`${Math.floor(row/1000)} ${String(row%1000).padStart(3,'0')}`:String(row)):col==='item'?`Item ${row}`:col==='qtyActual'?'5':'100';
  await run('capture()');
  assert.equal(ctx.state.source.rowCount,1005);
  assert.ok(ctx.state.items.some(i=>i.name==='Item 1003'));
});

test('column headers match despite spacing, punctuation and a missing exact name',()=>{
  const ctx=vm.createContext({});
  vm.runInContext(source.slice(source.indexOf('  const COLUMN_NAMES ='),source.indexOf('  const gridRows =')).replace(/^  const /gm,'var '),ctx);
  const cols={'N':'0','Номенклатура':'1','Кол-во (факт)':'2','Цена ':'3'};
  assert.equal(ctx.colOf(cols,'qtyActual'),'2');
  assert.equal(ctx.colOf({'Количество\nфакт.':'5'},'qtyActual'),'5');
  assert.equal(ctx.colOf({'Факт. количество':'7'},'qtyActual'),'7');
  assert.equal(ctx.colOf(cols,'price'),'3');
  assert.equal(ctx.colOf(cols,'item'),'1');
  assert.equal(ctx.colOf({'Количество':'4','Количество факт':'5'},'quantity'),'4');
});

test('⛔ To‘liq to‘xtatish: needs a second click, ends a stuck receipt and restarts with a clean state',async()=>{
  const h=lifecycleHarness();h.load();
  const api=h.ctx.window.testAPI,old=h.ctx.window.__mkKochirishInstance;
  h.restore({mk1c_state:{version:'0.9.4',schemaVersion:1,status:'paused',documentNeedsAck:true,
    inFlight:{index:0,confirmedPlaced:2,prefix:'form9'},pendingCodes:['X'],current:{name:'A',need:2,placed:1},
    items:[{name:'A',stock:4,qty:2,placed:2,deducted:1,totalUsed:1,initialStock:5,status:'pending'}],index:0,history:[],log:[]}});
  await api.stateReady;await Promise.resolve();
  const before=h.writes.length;
  await api.abortAll();
  assert.equal(old.alive(),true);assert.equal(h.writes.length,before); // first click only arms
  await api.abortAll();
  assert.equal(old.alive(),false);
  const saved=h.writes.at(-1).mk1c_state;
  assert.equal(saved.status,'idle');assert.equal(saved.inFlight,null);assert.equal(saved.documentNeedsAck,false);
  assert.deepEqual(Array.from(saved.pendingCodes),[]);
  // the confirmed unit stays deducted, the unconfirmed one is dropped; the next receipt starts from zero
  assert.equal(saved.items[0].placed,0);assert.equal(saved.items[0].deducted,0);assert.equal(saved.items[0].stock,4);
  assert.equal(saved.history.length,1);
  assert.ok(saved.log.at(-1).text.includes('To‘liq to‘xtatildi'));
  assert.ok(h.calls.some(c=>c.type==='restartContent'));
  // a fresh instance can now load over the retired one
  h.load();assert.notEqual(h.ctx.window.__mkKochirishInstance,old);
});

test('Olish shows how many rows are read so far and clears the counter when done',async()=>{
  const {ctx,run}=captureHarness({limit:'4-20',total:319});
  const reads=[],totals=[];
  ctx.render=()=>{if(ctx.captureProgress){reads.push(ctx.captureProgress.read);totals.push(ctx.captureProgress.total);}};
  await run('capture()');
  assert.ok(reads.length>0);
  assert.ok(reads.every((r,i)=>i===0||r>=reads[i-1]),'counter never goes back');
  assert.equal(Math.max(...reads),17);
  assert.ok(totals.every(t=>t===17));
  assert.equal(ctx.captureProgress,null);
});

test('the Olish button pauses and resumes the running read, and does nothing otherwise',()=>{
  const logs=[];
  const ctx=vm.createContext({activeTask:'capture',captureProgress:{read:42,total:100},state:{status:'running'},
    saves:0,renders:0,save(){ctx.saves++;},render(){ctx.renders++;},log:(t,l)=>logs.push({t,l})});
  vm.runInContext(source.slice(source.indexOf('  function toggleCapturePause()'),source.indexOf('  async function captureRows(')),ctx);
  vm.runInContext('toggleCapturePause()',ctx);
  assert.equal(ctx.state.status,'paused');
  assert.match(logs.at(-1).t,/42 qator o‘qildi/);
  vm.runInContext('toggleCapturePause()',ctx);
  assert.equal(ctx.state.status,'running');
  assert.equal(ctx.saves,2);assert.equal(ctx.renders,2);
  ctx.activeTask=null;ctx.state.status='idle';
  vm.runInContext('toggleCapturePause()',ctx);
  assert.equal(ctx.state.status,'idle');assert.equal(ctx.saves,2);
  // the button label and the progress line come from the same counter
  assert.match(source,/`\$\{paused \? 'Davom' : 'Pauza'\} \(\$\{captureProgress\?\.read \?\? 0\}\)`/);
  assert.match(source,/Olish: \$\{captureProgress\.read\}/);
});

test('E-POS receipt takes the placed units and only this receipt\'s codes, per product',()=>{
  const ctx=vm.createContext({norm:s=>String(s||'').trim().toLowerCase(),IS_DESKTOP:true,activeTask:null,
    state:{receiptId:7,status:'done',inFlight:null,items:[{name:'Tovar A',placed:2,price:150000},{name:'Tovar B',placed:0,price:5},{name:'tovar c',placed:1,price:'1000'}],
      usedCodes:{C1:{name:'TOVAR A',receiptId:7},C2:{name:'Tovar A',receiptId:7},OLD:{name:'Tovar A',receiptId:3},C3:{name:'Tovar C',receiptId:7}}}});
  vm.runInContext(source.slice(source.indexOf('  function buildEposReceipt()'),source.indexOf('  async function eposSale()')),ctx);
  const r=JSON.parse(JSON.stringify(vm.runInContext('buildEposReceipt()',ctx)));
  assert.equal(r.receiptId,'7');assert.equal(r.finished,true);
  assert.equal(r.lines.length,2);
  assert.deepEqual(r.lines[0],{name:'Tovar A',quantity:2,unitPrice:150000,codes:['C1','C2']});
  assert.deepEqual(r.lines[1],{name:'tovar c',quantity:1,unitPrice:1000,codes:['C3']});
  assert.equal(vm.runInContext('eposSaleBlockReason()',ctx),null);
  ctx.state.status='running';assert.match(vm.runInContext('eposSaleBlockReason()',ctx),/bajarilmoqda/);
  ctx.state.status='done';ctx.IS_DESKTOP=false;assert.match(vm.runInContext('eposSaleBlockReason()',ctx),/faqat Ishonch dasturida/);
  ctx.IS_DESKTOP=true;ctx.state.items.forEach(i=>i.placed=0);assert.match(vm.runInContext('eposSaleBlockReason()',ctx),/tovar yo‘q/);
  assert.match(source,/data-a="eposSale" hidden/);
  assert.match(source,/btn\('eposSale'\)\.hidden = !\(IS_DESKTOP && EPOS_SALE_ENABLED\)/);
});

test('definitive soliq.uz refusals are kept in a permanent bad-code database and skipped next time',()=>{
  const ctx=vm.createContext({state:{stir:'307 813 525',badDb:{}}});
  vm.runInContext(source.slice(source.indexOf('  const stirDigits ='),source.indexOf('  /** Подбор button of the visible')),ctx);
  const item={name:'Tovar A'};
  vm.runInContext("rememberBadDb(item,'CODE1',\"sotilgan (Chakana)\",{product:'Soliq nomi'})",Object.assign(ctx,{item}));
  const saved=JSON.parse(JSON.stringify(ctx.state.badDb.CODE1));
  assert.equal(saved.name,'Tovar A');assert.equal(saved.product,'Soliq nomi');assert.equal(saved.stir,'307813525');assert.match(saved.reason,/sotilgan/);
  assert.equal(vm.runInContext("knownBadCode('CODE1')",ctx).name,'Tovar A');
  assert.equal(vm.runInContext("knownBadCode('OTHER')",ctx),null);
  // another STIR: the refusal was made for ours, so soliq.uz is asked again
  ctx.state.stir='111111111';assert.equal(vm.runInContext("knownBadCode('CODE1')",ctx),null);
  // a broken stored value never throws
  ctx.state.badDb=null;assert.equal(vm.runInContext("knownBadCode('CODE1')",ctx),null);
  vm.runInContext("rememberBadDb(item,'CODE2','x',null)",ctx);assert.ok(ctx.state.badDb.CODE2);
  // the Подбор loop asks the database first, stores only a definitive refusal and survives Tozalash
  const loop=source.slice(source.indexOf('      const knownBad = knownBadCode(code);'),source.indexOf('      if (atLeastOne(cellText(f.line, colQty)))'));
  assert.ok(loop.indexOf('knownBadCode(code)')<loop.indexOf('await checkMarkingCode(code)'));
  // definitive only: sold, or not found in soliq.uz at all (a temporary failure is not stored)
  assert.match(loop,/const permanent = sold \|\| !!checked\.notFound;/);
  assert.match(loop,/if \(permanent\) rememberBadDb\(item, code, sold \? reason : 'markirovka topilmadi', checked\)/);
  assert.doesNotMatch(source.slice(source.indexOf('  function resetReceiptState'),source.indexOf('  async function clearUnstarted')),/badDb/);
  assert.match(source,/badDb: \{\}/);assert.match(source,/data-a="clearBadDb"/);
});


test('used marking codes survive more than 20000 transfers and a saved-state reload', () => {
  const usedCodes = Object.fromEntries(Array.from({ length: 20000 }, (_, i) => ['old' + i, { receiptId: 'previous' }]));
  const ctx = vm.createContext({ state: { usedCodes, pendingCodes: ['new'], receiptId: 'current' } });
  vm.runInContext(source.slice(source.indexOf('  function markCodesUsed(item)'), source.indexOf('  /** An error of the document')), ctx);
  vm.runInContext("markCodesUsed({ name: 'Tovar' })", ctx);
  const restored = JSON.parse(JSON.stringify(ctx.state));
  assert.equal(Object.keys(restored.usedCodes).length, 20001);
  assert.equal(restored.usedCodes.old0.receiptId, 'previous');
  assert.equal(restored.usedCodes.new.receiptId, 'current');
  assert.deepEqual(restored.pendingCodes, []);
});
