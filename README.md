# Base do Suporte — API

API Express para uma base colaborativa de conhecimento. O fluxo interno permite consulta, criação e edição sem login geral. Exclusão, restauração e rascunhos ficam restritos ao usuário de suporte. Dados persistem em SQLite; não é necessária uma conta externa de banco.

## Requisitos e primeira execução

Use **Node.js 24**. Os dois repositórios devem estar lado a lado; o frontend deve estar compilado em `../support-repository/dist`.

```bash
npm ci
cp .env.example .env
npm run password:hash
npm run seed
npm start
```

No Windows, use `copy .env.example .env` no lugar de `cp`. O comando `password:hash` pede uma senha de pelo menos 12 caracteres sem exibi-la. Copie a linha gerada para `.env`. Não há senha padrão. Sem hash configurado, a consulta e a colaboração continuam disponíveis e a administração fica bloqueada.

Para usar na rede interna, ajuste `PUBLIC_ORIGIN=http://IP_INTERNO:1992` e mantenha `HOST=0.0.0.0`. O endereço deve ser exatamente a origem usada no navegador. A aplicação compilada e `/api` compartilham **HTTP na porta 1992**. O acesso administrativo fica em `/admin`. O arquivo [INICIAR.bat](INICIAR.bat) inicia uma instalação já preparada no Windows.

`NODE_ENV=production` funciona no modo HTTP da rede interna. Se uma instalação futura usar HTTPS, configure a origem correspondente e `COOKIE_SECURE=true`. No modo HTTP existente, mantenha `COOKIE_SECURE=false`.

Para desenvolvimento com o Vite na porta 5173, use `NODE_ENV=development`. Não há CORS amplo: o fluxo utiliza a mesma origem ou o proxy do Vite, e as escritas verificam o Origin recebido.

## Permissões

| Operação                       | Equipe sem login | Suporte autenticado |
| ------------------------------ | ---------------- | ------------------- |
| Buscar e ler publicados        | Sim              | Sim                 |
| Criar e editar publicados      | Sim              | Sim                 |
| Ver/editar rascunhos           | Não              | Sim                 |
| Retirar da publicação          | Não              | Sim                 |
| Mover para lixeira e restaurar | Não              | Sim                 |

A criação e edição abertas são intencionais para a rede interna, seguindo a regra da Base do Suporte. O registro dessas alterações identifica `equipe-sem-login`, sem atribuir identidade individual. Publicar esta instalação diretamente na internet mudaria esse modelo de colaboração.

## Contrato

| Método               | Rota                                                                               | Uso                                              |
| -------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------ |
| GET                  | `/api/health`                                                                      | Verificação do serviço                           |
| GET                  | `/api/articles?q=&product=&category=&section=&tag=&page=1&limit=12&sort=relevance` | Publicados; limite máximo 50                     |
| GET                  | `/api/articles/:slug`                                                              | Artigo público                                   |
| POST                 | `/api/articles`                                                                    | Criar publicado sem login                        |
| PATCH                | `/api/articles/:id`                                                                | Editar publicado sem login; exige versão         |
| GET                  | `/api/facets`                                                                      | Filtros derivados apenas de publicados           |
| GET / POST / DELETE  | `/api/session`                                                                     | Consultar / iniciar / encerrar sessão            |
| GET                  | `/api/support/articles?status=draft&deleted=false`                                 | Gestão restrita; use deleted=true para a lixeira |
| GET / PATCH / DELETE | `/api/support/articles/:id`                                                        | Ler / editar / mover para lixeira                |
| POST                 | `/api/support/articles`                                                            | Criar como rascunho ou publicado                 |
| POST                 | `/api/support/articles/:id/restore`                                                | Restaurar como rascunho                          |

O documento contém `title, slug, summary, product, category, section, tags, symptoms, cause, steps, validation, warnings, sources, status, requiresDatabaseChange`. A API retorna também `id, version, createdAt, updatedAt, publishedAt, deletedAt`.

PATCH recebe o documento completo e `version`. DELETE e restore recebem `{"version": 1}`. Mudanças concorrentes retornam 409. O slug não pode mudar após o cadastro. A edição pública só aceita `status=published`; não permite alcançar rascunhos ou ocultar artigos.

## Persistência e conteúdo inicial

O arquivo `data/knowledge.sqlite` guarda artigos, sessões e auditoria de ações. SQLite FTS5 indexa o conteúdo, com acentos normalizados, prefixos e relevância ponderada. Alteração do artigo, índice e auditoria participam da mesma transação.

`npm run seed` valida e adiciona o catálogo em [content/sngpc.json](content/sngpc.json): cinco publicados e um rascunho. Executá-lo novamente não sobrescreve artigos nem restaura exclusões. São sínteses próprias com links públicos para a VSM; a URL de acesso com credenciais não é armazenada.

A exclusão é lógica; não há endpoint de purga. Restaurar retorna o artigo como rascunho. A auditoria registra ação, artigo, usuário e data; não é um histórico completo das versões do texto.

Para preservar os dados, mantenha `DATABASE_PATH` em um disco persistente. Com o serviço parado, copie o diretório de dados completo antes de atualizar a instalação. Nenhum conteúdo anterior de JSON, Supabase ou outra instalação é importado automaticamente.

## Acesso e validação

Senhas usam scrypt com salt; o navegador recebe apenas um cookie HttpOnly/SameSite=Strict. Sessões expiram em oito horas, logout revoga o token e a troca do hash invalida sessões anteriores. O banco guarda apenas o hash do token. Credenciais nunca vão para localStorage ou código cliente.

A API valida o corpo com Zod, usa parâmetros SQL, limita o corpo a 128 KiB, limita tentativas de login e escritas públicas, e configura cabeçalhos Helmet. Não existe endpoint para executar SQL enviado pelo cliente.

```bash
npm test
```

Os onze testes exercitam HTTP real com banco temporário: busca, filtros, visibilidade, colaboração sem login, autorização de exclusão/restauração, concorrência, sessão, limites, persistência, seed e entrega da SPA em HTTP.

## Legado

`app/` e `requirements.txt` pertencem ao IncidentSQL/FastAPI e foram mantidos para referência. O entry point Python falha por padrão. Só pode ser habilitado explicitamente com `LEGACY_INCIDENTSQL_ENABLE=1` para estudo isolado; ele conserva as limitações da versão antiga e não é a API desta base. `npm start` executa exclusivamente o Express.

Esta proposta exige os incrementos dos dois repositórios juntos. Não altera a instalação local existente nem um projeto Supabase.
