import assert from 'node:assert/strict';
// Production bundle, local requests only. No cloud credentials and no external requests.
process.env.SCANRADAR_ENABLE_AUTOMATIONS='false';
const {default:server}=await import('../dist/server/server.js');
let count=0;
for(const path of ['/auth','/auth/reset']){
 const response=await server.fetch(new Request('https://local.example'+path));assert.equal(response.status,200,path);await response.body?.cancel();count++;
}
const health=await server.fetch(new Request('https://local.example/api/public/integration-health'));
assert.equal(health.status,200);assert.match(health.headers.get('content-type'),/application\/json/);
assert.equal((await health.json()).protocolVersion,3);count++;
for(const path of ['/api/public/start-search','/api/automations/start']){
 const response=await server.fetch(new Request('https://local.example'+path,{method:'POST',body:'{}',headers:{'Content-Type':'application/json'}}));
 assert.equal(response.status,401,path);assert.match(response.headers.get('content-type'),/application\/json/);assert.equal((await response.json()).success,false);count++;
}
console.log(`${count} verificações locais do bundle passaram; nenhum serviço externo foi chamado.`);
