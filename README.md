# ScanRadar independente

Aplicação completa com React + TanStack Start, Supabase próprio e publicação na Netlify via GitHub. O frontend, as rotas de API e as funções de servidor estão neste repositório; não há SDK, autenticação intermediária, banco ou serviço de execução do Lovable.

**Comece por [docs/INSTALACAO.md](docs/INSTALACAO.md).** A instalação inicial destina-se a um projeto Supabase vazio. O pacote não publica sites nem altera bancos ou workflows automaticamente.

- Banco: `supabase/migrations/20260909000000_scanradar_initial.sql`.
- Fluxos: `n8n/scraper.json` e `n8n/prospeccao.json`.
- Variáveis: `.env.example`; valores públicos já apontam para o Supabase informado.
- Implantação: `netlify.toml`; validação no GitHub: `.github/workflows/check.yml`.
- Verificação: `npm ci`, depois `npm run check` com Node 22.12 ou superior.
- Desenvolvimento: copie `.env.example` para `.env`, configure seu ambiente e rode `npm run dev`.

Os workflows executam no seu n8n, com Google Sheets, Serper, modelo de IA e Evolution API existentes. O botão inicia apenas a prospecção do resultado selecionado. A conexão de WhatsApp compartilhada mantém uma trava global; cancelamentos não liberam outra rodada sem confirmação.

Leia [docs/VALIDACAO.md](docs/VALIDACAO.md) para saber o que foi testado e o que exige configuração e validação no ambiente publicado.
