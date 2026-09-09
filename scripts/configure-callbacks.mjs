import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)), '..');
const value=process.argv[2];let url;
try{url=new URL(value);}catch{throw new Error('Use: node scripts/configure-callbacks.mjs https://seu-site.netlify.app');}
if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/'||url.hostname.endsWith('.invalid'))throw new Error('Informe apenas a origem HTTPS de produção, sem caminho, segredo ou query.');
for(const file of ['scraper.json','prospeccao.json']){
 const path=resolve(root,'n8n',file),workflow=JSON.parse(readFileSync(path,'utf8'));
 for(const node of workflow.nodes){
  if(node.name==='Enviar resultados ao ScanRadar')node.parameters.url=url.origin+'/api/public/results';
  if(node.name==='Configuração do App')node.parameters.jsCode=node.parameters.jsCode.replace(/const appBaseUrl = [^;]+;/,'const appBaseUrl = '+JSON.stringify(url.origin)+';');
 }
 writeFileSync(path,JSON.stringify(workflow,null,2)+'\n');
}
console.log('Callbacks configurados em n8n/scraper.json e n8n/prospeccao.json. Importe-os no n8n e selecione as credenciais privadas.');
