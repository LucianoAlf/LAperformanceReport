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
| CG       | ‹token — ver Supabase secret, NÃO versionar› |
| Barra    | ‹token — ver Supabase secret, NÃO versionar› |
| Recreio  | ‹token — ver Supabase secret, NÃO versionar› |

> ⚠️ Tokens redigidos em 2026-07-07 (estavam expostos no repo público). Valores reais ficam em Supabase secret / env, nunca aqui. Ao trocar, **rotacionar no painel Emusys** (os antigos foram queimados).

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
- `GET /v1/professores` — Listar professores da unidade (ver detalhes abaixo)
- `GET /v1/matriculas` — Pull de contrato (aluno, responsável, contrato_atual, qtd_contratos). Usado por `sync-matriculas-emusys`.
- `GET /v1/pessoas/buscar` — Busca pessoa por email/CPF/telefone (mão única, não aceita id — ver `pendencias-emusys.md`).
- `GET /v1/crm/metricas` — Funil oficial do CRM por ano.
- `GET /v1/faturas` — Faturas/parcelas (ver detalhes abaixo). **Ainda não integrado a nenhuma edge/sync** (só testado manualmente 07/07).
- Consultar disponibilidade de aulas experimentais

### GET /v1/faturas — Faturas (NOVO na API v1.2.2, ainda não usado no projeto)
Lista faturas/parcelas com paginação por cursor. Testado manualmente (GET) em 2026-07-07, endpoint responde com dados reais.

**Query params:** `status` (aberta/paga/todas), `matricula_id`, `aluno_id`, `contrato_id`, `data_vencimento_inicial`, `data_vencimento_final`, `limite` (1-50, padrão 20), `cursor`.

**Resposta (items[]):** `id`, `matricula_id`, `contrato_id`, `aluno_id`, `descricao`, `status`, `data_vencimento`, `data_pagamento`, `valor_original`, `valor_pago`, `juros_e_multa` (dinâmico antes de pago), `desconto_aplicado` (dinâmico antes de pago), `desconto_fixo`, `desconto_condicional`.

**Observações da checagem manual:**
- `status=aberta` + `data_vencimento_inicial/final` = via direta para **inadimplência real por período** (hoje isso é inferido no nosso banco via `matriculas.inadimplente` local — este endpoint dá a fonte primária).
- Existe pelo menos 1 caso com `matricula_id=0` e `contrato_id=0` (fatura "órfã", não vinculada a matrícula/contrato) — cuidado se for usar `matricula_id` como chave de join.
- `data_pagamento` às vezes vem `"0000-00-00"` (não `null`) em registros antigos — tratar como não-pago se for usar para relatório de fluxo de caixa.
- Potencial uso: cruzar com `matriculas` para reconciliação financeira (o schema já documenta `inadimplente` calculado dinamicamente por contrato — `/faturas` é o detalhe fatura-a-fatura por trás desse flag).

### GET /v1/professores
Retorna a lista de professores da unidade definida pelo token (uma chamada por unidade).

**Sem query params.** Resposta:
```json
{
  "professores": [
    { "id": 1522, "nome": "Leticia de Almeida Palmeira" },
    { "id": 2109, "nome": "Erick Osmy" }
  ]
}
```

**Observacoes:**
- Mesmo humano tem `id` DIFERENTE em cada unidade (Emusys e por-escola).
- A lista provavelmente retorna apenas professores ativos no Emusys (a confirmar — quem desativar deixara de aparecer aqui).
- Usado pela edge `sync-professores-emusys` (cron semanal).

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

## Webhooks → nosso sistema

Eventos recebidos por `processar-matricula-emusys`: `matricula_nova`, `matricula_renovacao`, `matricula_trancamento`, `matricula_finalizacao` (evasao).

**Onde fica o professor no payload de matricula:**
```
payload.matricula.disciplinas[0].id_professor    ← ID Emusys
payload.matricula.disciplinas[0].nome_professor  ← nome (usado no fallback)
```
NUNCA na raiz da matricula. Edge function le `disciplinas[0]` corretamente desde v12+.

**Resolucao do `professor_atual_id`** (ver `regras-negocio.md`): 3 camadas — emusys_id+unidade → nome+unidade (auto-cura) → NULL.

## Versão
- v1.2.2 (spec completa em `~/Downloads/api_emusys.json`, verificada 07/07/2026)

## Suporte
- Email: dev@emusys.com.br
- Custo: R$ 79/mês (15 dias grátis)
- Ativação: Administração → Funcionalidades do Sistema → API Emusys
