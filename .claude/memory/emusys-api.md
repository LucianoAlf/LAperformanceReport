# API Emusys - Referência

## Base URL
```
https://api.emusys.com.br/v1/
```

## Autenticação
Header `token` em todas as requisições.

### Tokens por Unidade
| Unidade  | Token                              |
|----------|------------------------------------|
| CG       | nEAlBC5gjtqojA7qberYVOttD1lXdx    |
| Barra    | 4reVMLdiBmdNTOBQKa4m7WGYQaRDKI    |
| Recreio  | rUI85cQTePX1ecpLwWLbAWY9UM9yiF    |

## Convenções
- Protocolo: HTTPS apenas
- Formato: JSON (UTF-8)
- Métodos: GET, POST, PATCH
- Rate limit: 60 req/min por IP (rolling window, 429 se excedido)

## Estrutura de Respostas

### Sucesso
```json
{
  "status": "ok",
  "lead_id": 123
}
```

### Erro
```json
{
  "status": "Erro",
  "msg": "Lead não encontrado"
}
```

## Endpoints Conhecidos
- `POST /v1/leads/` — Criar lead
- `PATCH /v1/leads/` — Atualizar lead
- `GET /v1/cursos/` — Buscar cursos
- `GET /v1/aulas/` — Listar aulas com presença dos alunos (ver detalhes abaixo)
- Consultar disponibilidade de aulas experimentais

### GET /v1/aulas/ — Aulas e Presença
Retorna aulas com presença individual de cada aluno. Usado pelo sync automático de presença.

**Query params:**
- `data_hora_inicial` (string): `YYYY-MM-DDTHH:mm:ss` — filtro início
- `data_hora_final` (string): `YYYY-MM-DDTHH:mm:ss` — filtro fim
- `limite` (int): máx 100 por página
- `cursor` (string): cursor para paginação

**Paginação:** campo `paginacao` na resposta com `tem_mais` (bool) e `proximo_cursor` (string).

**Resposta (items[]):**
```json
{
  "id": 12345,
  "cancelada": false,
  "data_hora_inicio": "2026-03-02T08:00:00",
  "curso_nome": "Violão",
  "professores": [{ "nome": "Gabriel Barbosa Rufino Otávio", "presenca": "presente" }],
  "alunos": [
    { "nome_aluno": "João Silva", "presenca": "presente", "horario_presenca": "08:05:00" },
    { "nome_aluno": "Maria Santos", "presenca": "ausente", "horario_presenca": null }
  ]
}
```

**Volume típico:** ~20-164 aulas/dia por unidade, 2-3 chamadas paginadas.

**Usado por:** Edge Function `sync-presenca-emusys` (pg_cron diário `0 1 * * *` = 22h BRT, body `{"dias":1}`)

## MCP
- Documentação acessível via MCP GitBook SSE: `https://emusys.gitbook.io/emusys/api-emusys/~gitbook/mcp`
- Configurado em `.mcp.json` como server `emusys` (type: sse)

## Versão
- v1.1.0

## Suporte
- Email: dev@emusys.com.br
- Custo: R$ 79/mês (15 dias grátis)
- Ativação: Administração → Funcionalidades do Sistema → API Emusys
