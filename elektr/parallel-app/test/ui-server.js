const fs=require('fs');const {start}=require('./mock-server');const {listen}=require('../src/server');const engine=require('../src/engine');
(async()=>{const table=fs.readFileSync(process.argv[2]);const creds=engine.readCreds(table);const pw=Object.fromEntries(creds.map(c=>[c.login,c.password]));
const m=await start(process.argv[3],pw,{});const a=await listen({port:5188,apiBase:`http://127.0.0.1:${m.port}/legal-consumer-billing/v1/mobile-cabinet`});console.log('READY',a.port);})();
