# Teste de envio em Configurações — atualização do ScanRadar

Base: repositório dybola21/scanradar_V1, commit 313c6898ce3d9bb9b156c6260890be42688c841c.

O botão fica em **Configurações → Teste de envio de mensagem**. Não fica em Resultados e não exige uma pesquisa. Use um número seu ou que autorizou o teste, diferente do número conectado à instância que envia. A mensagem usa o nome de uma empresa fictícia e uma cidade preenchidos nessa configuração, junto com sua oferta e o prompt/modelo de IA do workflow.

Cada clique confirmado gera uma rodada própria. Uma nova rodada permite testar novamente o mesmo número. Nenhum status de lead, reserva comercial ou planilha é apagado ou alterado. Teste e prospecção compartilham a mesma trava global de WhatsApp. O teste envia mensagem real e pode consumir créditos da IA.

## Antes de atualizar

1. Espere a automação atual terminar. Se houver uma rodada presa, use o cancelamento existente e confirme seu encerramento.
2. No n8n, abra o workflow de mensagens que funciona hoje e exporte seu JSON pelo menu de três pontos → Download/Export. Guarde esse arquivo como backup.
3. No GitHub Desktop, selecione `scanradar_V1`, branch `main`, e clique em **Fetch origin** e **Pull origin**, caso apareça.
4. Não apague o banco, a pasta do projeto ou registros de mensagens. Esta atualização usa uma migração nova para o banco existente.

## 1 — Atualizar o Supabase

Faça esta etapa no navegador, no painel do **seu Supabase**, não no terminal e não no n8n.

1. Entre no projeto `bnffqhtwwuvpidyapqin`.
2. Abra **SQL Editor → New query**.
3. No pacote entregue, abra o arquivo `supabase/migrations/20260911000000_message_tests.sql` no VS Code ou Bloco de Notas.
4. Copie todo o conteúdo do arquivo e cole no SQL Editor.
5. Clique em **Run**. Aguarde a confirmação de sucesso.

Execute esse SQL **uma única vez**. Não execute novamente `20260909000000_scanradar_initial.sql`: a migração inicial é somente para banco vazio. Se aparecer erro, pare nessa etapa e guarde o texto do erro. Não tente resolver apagando tabelas.

A nova migração cria as configurações e tentativas de teste e permite rodadas do tipo teste sem pesquisa. A tabela `automation_runs` e seu índice de conexão ativa continuam controlando a trava compartilhada. Funções novas são executáveis apenas pelo backend; o navegador não pode liberar a trava ou confirmar envios pelo banco.

Se usa Supabase CLI para gerenciar migrações, aplique a nova migração pelo seu processo de CLI em vez de executar o mesmo SQL também pelo Editor. Não use ambos para aplicar a mesma alteração.

## 2 — Atualizar os arquivos no GitHub

Faça esta etapa no seu computador.

1. Extraia `ScanRadar-Teste-Configuracoes.zip`.
2. Dentro dele, abra a pasta **arquivos-do-projeto**.
3. No GitHub Desktop, use **Repository → Show in Explorer** para abrir a pasta correta de `scanradar_V1`.
4. Copie o **conteúdo** de `arquivos-do-projeto` para essa pasta do projeto. Aceite substituir os arquivos existentes e mesclar as pastas. Não crie uma segunda pasta `scanradar_V1` dentro dela. Não apague os outros arquivos do projeto.
5. Volte ao GitHub Desktop. Em **Changes**, confira as alterações listadas no arquivo `ARQUIVOS-ALTERADOS.txt` do pacote. Não selecione arquivos com credenciais privadas ou exports do seu n8n.
6. Escreva o resumo `feat: teste de envio nas configuracoes`.
7. Clique em **Commit to main** e depois em **Push origin**.
8. No GitHub, acompanhe **Actions → Validar ScanRadar**, na execução do novo commit.
9. Na Netlify, acompanhe o deploy associado ao mesmo commit. Aguarde ficar **Published**. Se o deploy automático estiver pausado, inicie um novo deploy da branch `main` depois do push.

Não há novas dependências npm. Não apague `node_modules` ou `package-lock.json` para esta atualização. Os comandos de validação do projeto continuam iguais.

**Importante:** copiar o arquivo SQL para o GitHub não o executa no seu Supabase. Por isso a etapa 1 é necessária.

## 3 — Atualizar o fluxo n8n sem perder suas configurações

Esta é a opção indicada para o seu workflow que já funciona, pois preserva o DeepSeek (ou outro modelo), seu prompt, as credenciais e o nó de configuração de chaves.

1. No pacote, abra **ATUALIZAR-FLUXO.html** com um duplo clique. Ele abre no navegador e funciona localmente, sem enviar o JSON para um servidor.
2. Clique em **Escolher arquivo** e selecione o JSON do workflow de mensagens que você exportou antes.
3. Clique em **Baixar fluxo atualizado**. Será gerado `prospeccao-com-teste.json`.
4. No n8n, abra o **mesmo workflow de mensagens**. Importe o JSON atualizado usando a opção de importar de arquivo do editor. Confira que os nós antigos foram substituídos, não duplicados. Se seu editor acrescentar nós em vez de substituir, desfaça a importação e substitua o conteúdo do canvas antes de importar novamente.
5. Confira que a URL de produção do Webhook e a credencial de autenticação continuam iguais.
6. Confira o nó **Configuração do App**: domínio do aplicativo e origem de `X-Callback-Secret` continuam como estavam. O atualizador preserva tanto a configuração por credencial quanto a configuração centralizada em nó.
7. Confira que seu modelo de IA, prompt e credenciais Evolution continuam os mesmos.
8. Salve e **publique/ative** o workflow. O arquivo é gerado inativo para evitar ativação acidental durante a importação.
9. Mantenha apenas um workflow ativo para o mesmo caminho de webhook.

O ID do workflow precisa continuar igual ao valor de `N8N_PROSPECTION_WORKFLOW_ID` na Netlify. Se a importação gerar um workflow novo, atualize essa variável com o ID novo, confira a URL de produção salva no ScanRadar e faça outro deploy da Netlify. Preferimos atualizar o mesmo workflow para não mudar esses valores.

O arquivo `n8n/prospeccao.json` dentro do projeto também foi atualizado, mas é o modelo do repositório. Para preservar suas configurações reais, use o atualizador com o JSON exportado do n8n, conforme explicado acima. **Não envie `prospeccao-com-teste.json` ao GitHub público:** ele pode conter suas chaves privadas.

Se o atualizador disser que não reconheceu um nó, ele não gera um arquivo parcial. Guarde o erro e envie o JSON para revisão. Se disser que já contém o teste, não aplique a atualização duas vezes.

O scraper não precisa ser alterado. Não é necessário criar abas de teste nas planilhas.

## 4 — Conferir as variáveis já existentes na Netlify

Não é necessária nenhuma variável nova. Confira as existentes no contexto **Production**:

- `SCANRADAR_ENABLE_AUTOMATIONS`: `true` quando estiver pronto para executar envios reais.
- `N8N_API_BASE_URL`: sua API pública do n8n, terminada em `/api/v1`.
- `N8N_API_KEY`: chave da API do n8n.
- `N8N_PROSPECTION_WORKFLOW_ID`: ID do workflow de mensagens publicado.
- Supabase e `ENCRYPTION_KEY`: mantenha os valores já usados pelo aplicativo.

Mudar uma variável exige novo deploy. Não gere outra `ENCRYPTION_KEY` durante esta atualização: o aplicativo precisa da mesma chave para ler os segredos que já estão gravados.

## 5 — Fazer o primeiro teste

1. Abra seu site publicado e faça login.
2. Vá a **Configurações**. Abaixo de **Prospecção por resultado**, aparece **Teste de envio de mensagem**.
3. Marque **Habilitar testes para um número meu ou autorizado**.
4. Preencha seu WhatsApp com **55 + DDD + número**. Use um número que possa receber a mensagem da instância conectada.
5. Preencha o nome da empresa fictícia e a cidade. Esses dados servem para personalizar a mensagem; não criam um lead comercial.
6. Clique em **Salvar configuração de teste**.
7. Clique em **Testar envio**. Confira o destinatário mostrado e confirme.
8. Acompanhe **Últimos testes**. Confira também a execução correspondente no n8n e o recebimento no WhatsApp.
9. O resultado esperado é **Concluído**, **Enviados: 1**, com a mensagem no histórico. “Enviados” confirma o aceite da Evolution; não comprova leitura da mensagem pelo destinatário.
10. Após o encerramento, clique em **Testar envio** novamente para uma nova rodada. O histórico anterior permanece intacto.

## Cancelamento e falhas

- **Cancelar teste** registra o cancelamento antes de chamar a API do n8n. O app só libera a conexão após confirmação de encerramento, ou quando nenhuma execução foi autorizada e o banco já impede autorizações futuras.
- Se a sua versão do n8n não permitir parar pela API, o estado permanece **Cancelando…** até o fluxo reconhecer a parada. Use **Verificar cancelamento** para consultar novamente. Também é possível encerrar a execução pelo painel do n8n e depois clicar em Verificar cancelamento.
- O workflow consulta o cancelamento antes de reservar e antes de iniciar o envio. Uma mensagem já entregue à API do WhatsApp pode chegar depois do clique em cancelar.
- Se ficar **Em revisão**, use **Reconciliar confirmação**. O backend procura o comprovante real no histórico da execução; não usa a planilha e não reenvia a mensagem.
- Se houver um envio incerto, confira seu WhatsApp antes de iniciar outro teste deliberadamente. Repetir o teste é um novo envio real, não uma reconciliação.
- A opção **Verificar tentativa anterior** reaproveita a chave da tentativa armazenada no navegador. Se o primeiro pedido já criou uma rodada, ela não é disparada novamente.
- Testes nunca mudam o telefone ou o status de um lead comercial.

## Validação entregue e limites

Foi executado `npm run check` localmente: build, tipos, testes e smoke. Os testes de banco aplicam a migração inicial e depois a incremental em banco descartável PGlite. O GitHub Actions está configurado para usar PostgreSQL 17 descartável e executar também os cenários de sessões concorrentes que não rodam em PGlite.

Os testes cobrem isolamento, trava compartilhada com produção, idempotência, autorização de destinatário, confirmação, callback duplicado/atrasado, cancelamento e preservação dos dados comerciais. O fluxo n8n foi verificado com entradas simuladas, sem chamadas reais à Evolution.

Não foram aplicadas mudanças no seu Supabase, não foi publicado o site e não foram enviadas mensagens durante a preparação deste pacote. A validação contra a sua instância n8n e seu WhatsApp é a etapa 5, depois de atualizar os três ambientes.

## Arquitetura para manutenção

- `src/components/MessageTestSettings.tsx`: configuração, confirmação e histórico, incluídos somente em SettingsPage.
- `/api/message-tests`: GET de configuração/histórico e PUT de configuração autenticada.
- `/api/message-tests/start`: cria rodada e dispara o webhook uma vez, após commit.
- `/api/message-tests/cancel`: cancela e confirma parada no n8n.
- `/api/message-tests/reconcile`: procura comprovante de envio sem reenviar.
- Os callbacks públicos existentes reconhecem uma rodada de teste persistida, verificam o segredo do seu proprietário e encaminham para as funções transacionais de teste.
- `automation_runs.mode='test'` usa `search_id=NULL`; o identificador de escopo enviado ao worker em `searchId` é o próprio ID da rodada. Nenhuma pesquisa sintética é criada.
- `message_test_attempts` registra o destinatário imutável por rodada; `contact_reservations` comercial não é alterada.
- `scripts/message-test-workflow.mjs`: transformação local usada pelo atualizador HTML, preservando as configurações do fluxo de entrada.
