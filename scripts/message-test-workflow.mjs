// Pure, local transformation. No credentials, URLs, prompts or model nodes are replaced.
export function addMessageTests(input) {
 const w=structuredClone(input);
 if(!Array.isArray(w.nodes)||!w.connections) throw new Error('Selecione o JSON exportado do workflow de prospecção.');
 if(w.nodes.some(n=>n.name==='Teste autorizado pelo app?')) throw new Error('Este workflow já contém o teste de envio.');
 const find=base=>{
  const found=w.nodes.filter(n=>n.name===base||new RegExp('^'+base.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\d+$').test(n.name));
  if(found.length!==1) throw new Error('Não foi possível identificar um único nó: '+base+'. Envie o JSON para revisão.');
  return found[0];
 };
 const ctx=find('Contexto da Pesquisa'),ack=find('Responder Aceito'),read=find('Ler Leads (Google Sheets)'),normalize=find('Normalizar Campos da Planilha'),isol=find('Conferir Isolamento da Pesquisa'),fail=find('Preparar Falha da Execução');
 const sent=find('Registrar Callback de Envio'),invalid=find('Registrar Callback de Inválido'),sheetSent=find('Marcar como Enviado'),sheetInvalid=find('Marcar como Inválido'),recoverSent=find('Recuperar Registro de Envio'),recoverInvalid=find('Recuperar Registro de Inválido');
 const accept=find('Confirmar Aceite da Evolution'),loop=find('Loop Leads (um por vez)'),montar=find('Montar Mensagem Final');
 if(!ctx.parameters.jsCode.includes('const tab = reply.prospection;')) throw new Error('Código de autorização diferente do esperado. Envie o JSON para revisão.');
 const q=JSON.stringify;
 const branch=`// Test mode is accepted ONLY from the authenticated backend claim response.
if (reply.mode === 'test') {
 const t=reply.testLead;
 if(reply.testProtocolVersion!==1 || request.searchId!==request.automationRunId || !t || t['Search ID']!==request.searchId || t['Lead Key']!=='test:'+request.automationRunId || !/^55\\d{10,11}$/.test(t.Telefone) || typeof t.Nome!=='string' || !t.Nome.trim()) throw new Error('Autorização do destinatário de teste inválida.');
 return [{json:{...request,accepted:true,mode:'test',testLead:t,offerDescription:reply.offerDescription}}];
}
`;
 ctx.parameters.jsCode=ctx.parameters.jsCode.replace('const tab = reply.prospection;',branch+'const tab = reply.prospection;');
 const edge=node=>({node,type:'main',index:0});
 const set=(name,ports)=>{w.connections[name]={...w.connections[name],main:ports.map(p=>p.map(edge))};};
 const ifNode=(name,pos)=>{
  const n={id:'scanradar-'+name.replace(/[^a-z0-9]/gi,'-'),name,type:'n8n-nodes-base.if',typeVersion:2.2,position:pos,
   parameters:{conditions:{options:{caseSensitive:true,typeValidation:'strict',version:2},conditions:[{id:'test-mode',leftValue:`={{ $(${q(ctx.name)}).first().json.mode === 'test' }}`,rightValue:true,operator:{type:'boolean',operation:'true',singleValue:true}}],combinator:'and'},options:{}}};
  w.nodes.push(n);return n;
 };
 ifNode('Teste autorizado pelo app?',[ack.position[0]+160,ack.position[1]-200]);
 w.nodes.push({id:'scanradar-test-recipient',name:'Preparar destinatário de teste',type:'n8n-nodes-base.code',typeVersion:2,position:[read.position[0],read.position[1]-250],onError:'continueErrorOutput',parameters:{jsCode:`const ctx=$(${q(ctx.name)}).first().json;
if(ctx.mode!=='test'||ctx.testLead?.['Lead Key']!=='test:'+ctx.automationRunId) throw new Error('Teste não autorizado.');
return [{json:{...ctx.testLead,Website:'',Status:'pendente','Mensagem Enviada':'','Data de Envio':''},pairedItem:{item:0}}];`}});
 set(ack.name,[['Teste autorizado pelo app?']]);set('Teste autorizado pelo app?',[['Preparar destinatário de teste'],[read.name]]);
 set('Preparar destinatário de teste',[[normalize.name],[fail.name]]);
 // Original commercial isolation/Sheets branch is preserved. Tests skip both Sheets writes.
 ifNode('Teste: pular planilha de enviado?',[sent.position[0]+120,sent.position[1]-160]);
 ifNode('Teste: pular planilha de inválido?',[invalid.position[0]+120,invalid.position[1]+160]);
 set(sent.name,[['Teste: pular planilha de enviado?']]);set('Teste: pular planilha de enviado?',[[recoverSent.name],[sheetSent.name]]);
 set(invalid.name,[['Teste: pular planilha de inválido?']]);set('Teste: pular planilha de inválido?',[[recoverInvalid.name],[sheetInvalid.name]]);
 // Preserve and enhance the existing provider receipt check and callback context.
 accept.parameters.jsCode=`const lead=$(${q(montar.name)}).item.json;
const ctx=$(${q(ctx.name)}).first().json;
const response=$input.first().json, body=response.body??response, msg=body.data??body;
const id=msg.key?.id, jid=msg.key?.remoteJid;
if(response.error || Number(response.statusCode??200)>=400 || typeof id!=='string' || !id.trim() || msg.key?.fromMe!==true || ['ERROR','FAILED'].includes(String(msg.status).toUpperCase())) throw new Error('Evolution não confirmou o aceite. Resultado incerto: não reenviar automaticamente.');
if(ctx.mode==='test' && (typeof jid!=='string'||jid.split('@')[0]!==lead.telefone_limpo||!/@(s\\.whatsapp\\.net|c\\.us)$/.test(jid))) throw new Error('Comprovante não corresponde ao telefone de teste. Requer verificação.');
const callback_payload={protocolVersion:3,searchId:ctx.searchId,automationRunId:ctx.automationRunId,executionId:ctx.executionId,lead_key:lead['Lead Key'],telefone:lead.telefone_limpo,status:'enviado',mensagem_enviada:true,data_envio:new Date().toISOString(),messageText:lead.mensagem_final,messageId:id,attemptKey:ctx.executionId+':'+lead['Lead Key']};
return [{json:{...lead,callback_payload},pairedItem:{item:0}}];`;
 // Importing must never activate or replay pinned execution data.
 w.active=false;delete w.pinData;
 return w;
}
