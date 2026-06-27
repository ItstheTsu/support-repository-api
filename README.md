# </> IncidentSQL — API

> Backend da plataforma IncidentSQL, construído com FastAPI.

---

## Requisitos

- Python 3.11+
- Conta no [Supabase](https://supabase.com) (opcional — funciona com mock em memória)

---

## Instalação

```bash
pip install -r requirements.txt
```

---

## Variáveis de ambiente

Copie `.env.example` para `.env` e preencha:

```env
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SECRET_KEY=sua_secret_key
PORT=3001
```

Sem as variáveis do Supabase, a API roda com dados mock em memória.

---

## Executar

```bash
uvicorn app.main_new:app --host 0.0.0.0 --port 3001
```

> Use `--reload` apenas em desenvolvimento. Sem ele, os dados em memória persistem enquanto o servidor estiver rodando.

---

## Endpoints

| Método | Rota | Descrição | Auth |
|--------|------|-----------|------|
| `POST` | `/api/auth/register` | Criar conta | — |
| `POST` | `/api/auth/login` | Login | — |
| `GET` | `/api/users/me` | Dados do usuário logado | USER+ |
| `GET` | `/api/users` | Listar usuários | MASTER |
| `PATCH` | `/api/users/{id}/role` | Alterar role | MASTER |
| `GET` | `/api/incidents` | Listar incidentes | USER+ |
| `POST` | `/api/incidents` | Criar incidente | MASTER |
| `PATCH` | `/api/incidents/{id}` | Editar incidente | MASTER |
| `DELETE` | `/api/incidents/{id}` | Excluir incidente | MASTER |
| `POST` | `/api/incidents/{id}/run` | Executar query | USER+ |
| `POST` | `/api/incidents/{id}/resolve` | Resolver incidente | USER+ |
| `GET` | `/api/tags` | Listar tags | USER+ |
| `POST` | `/api/tags` | Criar tag | MASTER |
| `PATCH` | `/api/tags/{id}` | Editar tag | MASTER |
| `DELETE` | `/api/tags/{id}` | Excluir tag | MASTER |
| `GET` | `/api/ranking` | Ver ranking | USER+ |

---

## Estrutura

```
app/
└── api/
    ├── auth.py           # Registro, login, sessões
    ├── users.py          # Gestão de roles
    ├── incidents_new.py  # CRUD de incidentes + validação SQL
    ├── tags_new.py       # CRUD de tags
    ├── ranking_new.py    # Ranking de usuários
    └── database.py       # Conexão com Supabase
```

---

## Credencial padrão (desenvolvimento)

```
E-mail: master@incidentsql.com
Senha:  master123
Role:   MASTER
```