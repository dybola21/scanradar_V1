# Instalar o ScanRadar no seu Supabase e na Netlify

Base: a última versão completa do projeto enviada, com as correções do protocolo 3, e os dois workflows mais recentes. Destino do banco: `bnffqhtwwuvpidyapqin`. O GitHub será o lugar onde você mantém o código; não é necessário conectá-lo ao Lovable.

Este pacote prepara uma **instalação nova**. Não foram importados usuários, histórico, pesquisas ou reservas do banco anterior. As planilhas continuam no Google. Você precisará cadastrar a integração novamente, pois os segredos criptografados do banco antigo não são reutilizados nesta instalação.

## 1. Criar as tabelas no Supabase vazio

1. Abra seu projeto no painel do Supabase e confira o identificador `bnffqhtwwuvpidyapqin`.
2. Abra **SQL Editor**, crie uma consulta e cole TODO o arquivo `supabase/migrations/20260909000000_scanradar_initial.sql`.
3. Execute uma única vez. O arquivo cria o esquema e as funções em uma transação. Se falhar, guarde o erro completo antes de tentar novamente.
4. Verifique as tabelas `searches`, `leads`, `n8n_settings`, `user_roles`, `scan_logs`, `search_prospection`, `automation_runs`, `contact_reservations` e `automation_events`.

O SQL inclui RLS, permissões, controle transacional de rodadas, cancelamento, confirmação de envio, proteção contra repetição, metadados das abas e publicação de `searches`/`leads` no Realtime. **Não execute `tests/fixtures.sql` no seu Supabase.** Esse arquivo só existe para bancos descartáveis de teste.

O instalador recusa um banco que já possui `public.searches`. Depois desta instalação, atualizações de banco devem usar novas migrações incrementais; não execute novamente o instalador nem apague tabelas para atualizar o app.

Se preferir usar Supabase CLI em vez do SQL Editor, vincule seu projeto com `supabase link --project-ref bnffqhtwwuvpidyapqin` e aplique a migração pelo seu fluxo habitual. Escolha um método; se instalar pelo SQL Editor e depois adotar a CLI, registre a migração como já aplicada antes de usar `db push`.

## 2. Colocar o código no GitHub

No repositório `dybola21/scanradar_V1`, coloque o **conteúdo** da pasta do projeto na raiz: `package.json`, `src`, `supabase`, `public`, `n8n`, `scripts`, `docs`, `netlify.toml` e demais arquivos de configuração.

Inclua também `.github/workflows/check.yml`, `.gitignore`, `.env.example` e `.nvmrc`. Não envie `node_modules`, `dist`, caches, `.env` com valores privados, planilhas com leads ou os JSONs originais que continham chaves embutidas. Os JSONs da pasta `n8n` deste pacote foram preparados para uso com credenciais privadas na própria instância.

Se o repositório já tiver arquivos, use uma branch para a atualização e preserve o histórico. Não é preciso apagar o repositório ou forçar um push. Depois de revisar e integrar à branch `main`, a Netlify poderá publicar cada atualização dessa branch.

## 3. Criar o projeto na Netlify

1. Na Netlify, importe um projeto existente a partir do GitHub e selecione `dybola21/scanradar_V1`.
2. Escolha `main` como branch de produção e a raiz do repositório como diretório base.
3. O arquivo `netlify.toml` define Node 22, comando `npm run check` e publicação `dist/client`.
4. O plugin oficial gera a função Node que atende as APIs e as funções de servidor. **Não publique apenas a pasta estática por arrastar e soltar e não adicione um redirect geral para `index.html`.** Isso impediria os callbacks e o backend de funcionarem corretamente.
5. Escolha um endereço estável, por exemplo `https://seu-scanradar.netlify.app`, ou conecte seu domínio.

A aplicação não roda os loops de mensagens nas funções da Netlify: os loops continuam no n8n. A hospedagem atende as chamadas curtas do app e os callbacks. Os limites do plano gratuito da Netlify e do Supabase ainda se aplicam; consulte seu painel antes de colocar volume de produção.

## 4. Configurar as variáveis na hospedagem

Cadastre as variáveis na Netlify, no ambiente de **produção**. As privadas são usadas pelas Functions; não use prefixo `VITE_` nelas. Se sua conta permitir limitar escopos, escolha Functions para os segredos. Mantenha os valores privados fora de previews e branches de teste.

| Variável | O que colocar | Visibilidade |
|---|---|---|
| `VITE_SUPABASE_URL` | `https://bnffqhtwwuvpidyapqin.supabase.co` | Pública; já está no `netlify.toml` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | A publishable key que você informou; já está no arquivo | Pública; build do navegador |
| `SUPABASE_URL` | A mesma URL do seu Supabase | Servidor |
| `SUPABASE_PUBLISHABLE_KEY` | A mesma publishable key | Servidor |
| `SUPABASE_SERVICE_ROLE_KEY` | A Secret key `sb_secret_...` do seu projeto ou a chave legada `service_role` | Privada, servidor |
| `ENCRYPTION_KEY` | Uma chave aleatória de no mínimo 32 caracteres; sugestão abaixo | Privada, servidor |
| `N8N_API_BASE_URL` | `https://man.noticiasnatela.blog/api/v1` | Configuração do servidor |
| `N8N_API_KEY` | Chave criada na sua instância n8n, em Settings → n8n API | Privada, servidor |
| `N8N_PROSPECTION_WORKFLOW_ID` | ID do workflow de mensagens que realmente será publicado, conforme a URL dele no n8n | Servidor |
| `SCANRADAR_ENABLE_AUTOMATIONS` | Inicialmente `false`; mude para `true` ao terminar a configuração e preparar o teste controlado | Servidor |

A publishable key **não substitui** a Secret key. O nome `SUPABASE_SERVICE_ROLE_KEY` foi mantido no código, mas aceita a Secret key atual do Supabase. Copie o valor privado diretamente do painel para a hospedagem; não o coloque no chat ou no GitHub. [Documentação das chaves do Supabase](https://supabase.com/docs/guides/getting-started/api-keys).

Para gerar sua chave de criptografia no seu computador:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Guarde esse valor em local seguro e copie-o para `ENCRYPTION_KEY`. Ele protege as configurações privadas armazenadas no banco, com AES-256-GCM. **Não gere outro valor a cada publicação.** Trocar a chave impede ler as integrações já gravadas; nesse caso será necessário cadastrá-las novamente. Não importe ciphertext do banco anterior como configuração válida deste banco novo.

Publique novamente após configurar as variáveis. `SCANRADAR_ENABLE_AUTOMATIONS=false` bloqueia novas pesquisas/testes de webhook e novas rodadas de mensagens; permite consultar e cancelar uma rodada existente. Previews são bloqueados também no build e não podem controlar o n8n de produção.

## 5. Configurar login no seu Supabase

Em **Authentication → URL Configuration**, configure:

- Site URL: `https://SEU-DOMINIO-PUBLICADO`.
- Redirect URLs: `https://SEU-DOMINIO-PUBLICADO/auth/callback` e `https://SEU-DOMINIO-PUBLICADO/auth/reset`.
- Para desenvolvimento local, adicione os mesmos caminhos no endereço local usado pelo Vite, somente se precisar.

Habilite o provedor de e-mail e senha. Cadastre sua nova conta pelo ScanRadar e confirme o e-mail. O banco vazio não contém os usuários do projeto anterior; não existe senha ou conta administrativa predefinida neste pacote.

O botão **Esqueci minha senha** agora envia a recuperação pelo seu Supabase e abre a página `/auth/reset` para definir a senha. Para confirmação e recuperação por e-mail funcionarem para usuários comuns, configure SMTP no Supabase. O serviço de e-mail padrão tem restrições e não é adequado como entrega geral de produção. [Configuração de SMTP](https://supabase.com/docs/guides/auth/auth-smtp).

## 6. Preparar os dois fluxos no n8n

Os fluxos estão em `n8n/scraper.json` e `n8n/prospeccao.json`, inativos. Preservam a lógica, o protocolo 3, as planilhas, os filtros de presença digital, as mensagens e os intervalos existentes. Mudam os destinos do app e o armazenamento dos headers privados.

### Domínio dos callbacks

Depois de saber o domínio de produção, rode na raiz do projeto:

```bash
node scripts/configure-callbacks.mjs https://seu-scanradar.netlify.app
```

O comando altera apenas os dois JSONs locais; não publica e não chama o n8n. Ele preenche:

- Scraper, nó **Enviar resultados ao ScanRadar**: `https://SEU-DOMINIO/api/public/results`.
- Prospecção, nó **Configuração do App**: `https://SEU-DOMINIO`. Os callbacks de controle e status usam essa origem.

Você também pode preencher esses dois locais diretamente no editor do n8n. O domínio `.invalid` entregue é um marcador e precisa ser substituído. **A URL do app não é a URL do webhook do n8n.**

### Credenciais privadas

Antes de publicar os fluxos, selecione ou crie estas credenciais no n8n:

| Credencial | Header Name | Value |
|---|---|---|
| `ScanRadar Callback Privado` | `X-Callback-Secret` | O segredo gerado na tela Configurações do NOVO ScanRadar |
| `Serper API Privada` | `X-API-KEY` | Sua chave Serper |
| `Evolution API Privada` | `apikey` | Sua chave Evolution |
| Credencial existente de entrada do webhook | `X-Webhook-Secret`, conforme configurado no app | A mesma chave de segurança cadastrada na integração do app |

Nos nós HTTP de callback, selecione `ScanRadar Callback Privado`. No nó **Busca Google**, selecione `Serper API Privada`. Nos dois nós HTTP da Evolution, selecione `Evolution API Privada`.

O nó de ferramenta **Buscar na Web (Serper)** usa o formato antigo de ferramenta HTTP: substitua `PREENCHA_SERPER_API_KEY_SOMENTE_NO_N8N` pelo valor da chave no próprio editor do n8n. Não salve esse export com a chave no repositório. As referências das credenciais de Google Sheets e do modelo de IA foram preservadas; confira se continuam selecionadas na sua instância.

No app novo, em **Configurações**:

1. Cadastre a Production URL do webhook de pesquisa e a chave de entrada correspondente.
2. Gere/rotacione o segredo de callback e copie-o para a credencial `ScanRadar Callback Privado` usada nos DOIS fluxos.
3. Em Prospecção por Resultado, cadastre a Production URL do webhook do fluxo de mensagens, o nome do header de entrada e o texto da oferta.
4. Use `scanradar-shared-whatsapp` como identificação lógica compartilhada. Ela representa a trava única do sistema; não é o nome da instância Evolution nem um número de telefone.

As URLs dos webhooks podem mudar: copie as Production URLs dos nós de entrada e atualize as configurações no app. Se importar a prospecção como um workflow novo, atualize também `N8N_PROSPECTION_WORKFLOW_ID` na Netlify. O ID da execução, como `191` ou `196`, não é o ID do workflow.

Antes de ativar os novos workflows, encerre as rodadas antigas e desative a versão antiga que usa o mesmo caminho de webhook. Uma versão antiga em execução continuará usando a configuração que tinha ao iniciar. Importar o JSON não encerra essas execuções.

### Cancelamento

O app grava o pedido de cancelamento, consulta o ID de execução vinculado à rodada, pede a parada pela API do n8n e verifica o encerramento. Ele não usa DELETE de execução como cancelamento. O usuário pode cancelar a própria rodada.

Se a versão/permissão da API não permitir a parada ou a resposta for ambígua, a trava permanece. O workflow também verifica o pedido cooperativamente antes dos próximos envios. Uma mensagem já entregue à Evolution não pode ser desfeita pelo botão. Não libere uma rodada manualmente só porque ocorreu timeout ou porque uma consulta retornou 404.

## 7. Testar antes de usar a lista inteira

1. Abra `https://SEU-DOMINIO/api/public/integration-health`. Deve retornar JSON com `protocolVersion: 3` e `build: "scanradar-independent-20260909"`. HTML/404 indica publicação ou domínio incorreto. Esse endpoint confirma o código publicado, não testa credenciais ou banco.
2. Entre com a conta nova, salve a integração e confira os campos do Supabase/Netlify.
3. Somente após configurar os fluxos, mude `SCANRADAR_ENABLE_AUTOMATIONS` para `true`, publique a alteração e use o teste de conexão do scraper.
4. Execute uma pesquisa pequena. Confira a lista completa, as duas abas no Google Sheets e o recebimento de `/api/public/results` no novo app.
5. Para validar envio, use uma lista de teste cujo único contato elegível seja um número seu. Confira autorização, reserva, `begin_send`, retorno real da Evolution e `whatsapp-status`. Só depois do retorno persistido o contador Enviados deve subir.
6. Teste Cancelar rodada e confira a mesma execução no n8n. O estado precisa refletir o encerramento confirmado; outro resultado permanece bloqueado enquanto houver uma rodada ativa ou incerta.
7. Recarregue a página e confira que contadores e estados persistem no banco. Um clique repetido não deve abrir outra rodada enquanto a anterior está ativa.

## 8. Histórico anterior e retirada definitiva do Lovable

Como o banco de destino está vazio, ele não sabe quem já recebeu mensagens no sistema anterior. **Não use as listas antigas para uma nova rodada até preservar ou reconciliar o histórico de contatos enviados.** Este pacote não contém um importador de planilhas para a tabela de confirmações; uma linha na planilha não é tratada automaticamente como comprovante de envio.

Para preservar histórico, precisamos de uma exportação do banco anterior, incluindo pesquisas, leads, estados de envio e reservas/eventos. As planilhas servem de referência, mas não substituem o histórico transacional. Usuários antigos também não são transferidos simplesmente ao importar o código. Você pode iniciar sem o histórico, com a conta nova e contatos de teste, sabendo dessa separação.

Após validar o ambiente novo e guardar os backups necessários: remova os links públicos para o app antigo, deixe os callbacks somente no domínio novo e encerre o projeto antigo conforme sua decisão. Nenhuma dessas ações em produção foi executada por este pacote.

## Atualizações futuras

Edite o projeto localmente, rode `npm ci` e `npm run check`, faça commit e envie uma branch para revisão. O GitHub Actions valida o build e executa os testes de concorrência com PostgreSQL descartável. Configure proteção de `main` exigindo o check `check` antes de integrar. A Netlify publica a branch de produção automaticamente.

Para alterações futuras no banco, crie uma nova migração. Não altere o SQL inicial já aplicado. Mantenha mudanças compatíveis durante a troca entre versões do frontend, backend e n8n.

Este pacote foi configurado para Netlify. Vercel exige outro adaptador de hospedagem e revisão das condições do plano; não basta importar o mesmo `netlify.toml` nela. A base React/TanStack/Supabase continua sendo sua e pode receber outro adaptador depois.

Referência da configuração de hospedagem: [TanStack Start na Netlify](https://docs.netlify.com/build/frameworks/framework-setup-guides/tanstack-start/).
