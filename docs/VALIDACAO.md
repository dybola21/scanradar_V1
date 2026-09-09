# Validação da entrega — 09/09/2026

## Executado localmente

- Instalação npm com lockfile próprio e dependências da hospedagem independente.
- Build Vite/TanStack Start gerando `dist/client`, `dist/server` e a função de servidor da Netlify.
- TypeScript: `tsc --noEmit` aprovado.
- Vitest: **63 testes passaram; 2 testes de PostgreSQL com conexões separadas não foram executados localmente**.
- O SQL inicial COMPLETO foi instalado em PGlite, com um esquema mínimo que representa apenas o serviço Auth do Supabase. As tabelas da aplicação vieram do próprio arquivo de instalação entregue.
- Testes de contrato executam as funções SQL reais pelo adaptador HTTP: claim, reserva, início do envio, callback confirmado, cancelamento, conclusão e contadores.
- Testes de permissões conferem proteção de segredos, isolamento entre usuários, impossibilidade de o navegador forjar Enviados, bloqueio de alteração do status da pesquisa e privacidade dos logs.
- Testes da nova instalação conferem criptografia autenticada, falha com chave incorreta, bloqueio de previews e autenticação antes do disparo da pesquisa. Chamadas simultâneas ao adaptador de disparo enviam uma vez, com os parâmetros lidos do banco.
- Smoke test do bundle compilado: páginas de login e recuperação, endpoint JSON de versão e recusa de pedidos de disparo sem autenticação. Esses testes não chamam serviços externos.
- Os JSONs foram conferidos quanto a estrutura, referências entre nós e sintaxe dos nós de código. Os headers privados embutidos foram removidos das cópias destinadas ao repositório.

## Preparado para o GitHub Actions

O workflow de CI cria PostgreSQL 17 descartável, aplica o mesmo SQL de instalação e habilita os dois testes de concorrência com conexões separadas, incluindo cliques simultâneos e disputa entre trabalhadores.

Essa configuração está pronta, mas **o GitHub Actions ainda não foi executado neste repositório**. O resultado local em PGlite não foi apresentado como teste de concorrência real do PostgreSQL remoto. As credenciais que aparecem no YAML são exclusivamente do banco descartável local do job.

## Não executado

- Aplicação do SQL no Supabase do usuário, criação de usuários ou configuração de SMTP.
- Push para GitHub, publicação na Netlify ou alteração de domínio.
- Importação/publicação dos fluxos no n8n real.
- Disparo real de pesquisa, envio de WhatsApp, cancelamento de execução ativa ou consulta às chaves privadas do usuário.
- Importação de histórico, usuários ou reservas do banco antigo.

A validação de ponta a ponta depende desses passos externos e de uma rodada controlada com um número do próprio usuário. O código foi preparado e testado localmente; a implantação não foi declarada concluída.

## Mudanças principais

1. Removidos SDK de autenticação intermediária, plugin de build proprietário, armazenamento de sessão de preview, telemetria de erros e configuração de banco vinculados à plataforma anterior.
2. Adotado plugin oficial da Netlify e cliente Supabase direto, usando o projeto e a publishable key fornecidos.
3. Criado SQL inicial único, preservando as funções de protocolo 3 e a trava da conexão compartilhada.
4. Mantidos backend, frontend, pesquisa, resultados, presença digital, abas individuais, confirmação de envio e cancelamento.
5. Configurações privadas passam pelo backend autenticado; criptografia AES-256-GCM rejeita valores inválidos, sem retornar texto cru como fallback.
6. Disparo de pesquisa exige autenticação e propriedade e faz uma atualização condicional para impedir disparo duplicado do mesmo registro.
7. Recuperação de senha funciona diretamente pelo Supabase.
8. URLs dos callbacks passam para o domínio escolhido; chaves de callback/Evolution/Serper dos nós HTTP ficam em credenciais do n8n.
9. Novas execuções podem ser pausadas por variável de ambiente; previews não podem controlar o n8n de produção.

O layout e as regras de classificação existentes não foram redesenhados. Os IDs das planilhas e a instância Evolution dos workflows enviados foram preservados para uso na mesma instalação n8n.
