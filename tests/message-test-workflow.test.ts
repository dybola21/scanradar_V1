import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
// @ts-expect-error Local standalone JS transformer also runs in the offline HTML updater.
import { addMessageTests } from '../scripts/message-test-workflow.mjs';
const workflow=JSON.parse(readFileSync('n8n/prospeccao.json','utf8'));
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const scope={searchId:id,automationRunId:id,executionId:'test-worker'};
function node(base:string){return workflow.nodes.find((n:any)=>n.name===base||n.name===base+'1');}
function code(base:string,input:any,contexts:Record<string,any>={}){
 const n=node(base);
 const $=(name:string)=>({first:()=>({json:contexts[name]}),item:{json:contexts[name]}});
 return new Function('$input','$','$json',n.parameters.jsCode)({first:()=>({json:input}),all:()=>[{json:input}]},$,input);
}
function next(base:string,port=0){return workflow.connections[node(base).name].main[port].map((e:any)=>e.node);}
describe('Test workflow uses the real shared sending pipeline',()=>{
 test('authenticated test claim bypasses only Sheets, commercial metadata remains mandatory',()=>{
  const t={'Search ID':id,'Lead Key':'test:'+id,Telefone:'5521999991111',Nome:'Empresa teste'};
  const contexts={'Validar Solicitação do Botão':scope};
  const response={...scope,accepted:true,protocolVersion:3,mode:'test',testProtocolVersion:1,testLead:t};
  const ctx=code('Contexto da Pesquisa',response,contexts)[0].json;
  expect(ctx.mode).toBe('test');
  expect(()=>code('Contexto da Pesquisa',{...response,testLead:{...t,Telefone:'111'}},contexts)).toThrow();
  expect(()=>code('Contexto da Pesquisa',{...response,mode:'production'},contexts)).toThrow();
  expect(next('Teste autorizado pelo app?')).toEqual(['Preparar destinatário de teste']);
  expect(next('Teste autorizado pelo app?',1)).toEqual([node('Ler Leads (Google Sheets)').name]);
  const row=code('Preparar destinatário de teste',{}, {'Contexto da Pesquisa':ctx})[0].json;
  const normal=code('Normalizar Campos da Planilha',row)[0].json;
  expect(normal.elegivel).toBe(true);expect(normal.telefone_limpo).toBe(t.Telefone);
  expect(code('Classificar Presença Digital',normal)[0].json.elegivel).toBe(true);
  expect(next('Preparar destinatário de teste')).toEqual(['Normalizar Campos da Planilha']);
  expect(next('Teste: pular planilha de enviado?')).toEqual(['Recuperar Registro de Envio']);
  expect(next('Teste: pular planilha de enviado?',1)).toEqual([node('Marcar como Enviado').name]);
 });
 test('provider evidence must match test number, attempt travels into receipt; no send retries',()=>{
  const lead={'Lead Key':'test:'+id,telefone_limpo:'5521999991111',mensagem_final:'Olá, teste!'};
  const contexts={'Contexto da Pesquisa':{...scope,mode:'test'},[node('Montar Mensagem Final').name]:lead};
  const response={key:{id:'proof',remoteJid:'5521999991111@s.whatsapp.net',fromMe:true}};
  const receipt=code('Confirmar Aceite da Evolution',response,contexts)[0].json.callback_payload;
  expect(receipt.attemptKey).toBe('test-worker:test:'+id);expect(receipt.messageId).toBe('proof');
  expect(()=>code('Confirmar Aceite da Evolution',{key:{...response.key,remoteJid:'5521999993333@s.whatsapp.net'}},contexts)).toThrow();
  expect(node('Enviar Mensagem (Evolution API)').retryOnFail).not.toBe(true);
 });
 test('transformer refuses repeated patch; all edges are valid; HTML updater is local',()=>{
  expect(()=>addMessageTests(workflow)).toThrow(/já contém/);
  const names=new Set(workflow.nodes.map((n:any)=>n.name));
  for(const [source,ports] of Object.entries(workflow.connections)){
   expect(names.has(source)).toBe(true);
   for(const list of Object.values(ports as Record<string,any[]>))for(const port of list)for(const edge of port)expect(names.has(edge.node)).toBe(true);
  }
  const html=readFileSync('docs/atualizar-fluxo-teste.html','utf8');
  expect(html).not.toMatch(/fetch\(|XMLHttpRequest|https?:\/\//);
 });
});
