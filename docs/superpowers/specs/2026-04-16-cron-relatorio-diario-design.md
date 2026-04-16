# Spec: Cron Relatório Diário Automático

**Data:** 2026-04-16
**Status:** Aprovado v2

## Objetivo

Automatizar o envio do relatório diário administrativo via WhatsApp às 20h BRT (seg-sáb), com toggle independente por unidade.

## Fluxo

```
pg_cron (23:00 UTC = 20:00 BRT, seg-sáb)
  → chama edge function relatorio-admin-whatsapp com { modo: 'cron' }
  → para cada unidade com relatorio_diario_cron_ativo = true:
    → gera texto do relatório do dia (timezone BRT)
    → resolve credenciais UAZAPI por unidade
    → envia via UAZAPI para grupos configurados
    → se unidade sem destinatários: log warning, continua próxima
```

## Mudanças

### 1. Tabela `unidades` — novo campo

```sql
ALTER TABLE unidades ADD COLUMN relatorio_diario_cron_ativo boolean DEFAULT false;
```

### 2. Edge function `relatorio-admin-whatsapp` — novo modo

**Modo manual (sem mudança):**
- Recebe `{ texto, unidade, tipoRelatorio, competencia }`
- Envia o texto pronto

**Modo cron (novo):**
- Recebe `{ modo: 'cron' }`
- Busca unidades com `relatorio_diario_cron_ativo = true`
- Para cada unidade:
  1. Calcula datas em BRT: `new Date(now.getTime() - 3 * 60 * 60 * 1000)`
  2. Busca dados e gera texto
  3. Resolve credenciais: `getUazapiCredentials(supabase, { funcao: 'sistema', unidadeId: unidade.id })`
  4. Busca destinatários (`whatsapp_destinatarios_relatorio`, tipo=relatorio_admin)
  5. Se sem destinatários: log warning, skip
  6. Envia via UAZAPI
  7. Log resultado no console

### Dados do relatório — queries server-side

Todas as queries usam `service_role_key` (bypass RLS).

**Alunos (tabela `alunos`):**
```sql
SELECT
  COUNT(*) FILTER (WHERE status IN ('ativo','aviso_previo')) as ativos,
  COUNT(*) FILTER (WHERE tipo_aluno = 'pagante' AND status IN ('ativo','aviso_previo')) as pagantes,
  COUNT(*) FILTER (WHERE tipo_aluno = 'nao_pagante' AND status IN ('ativo','aviso_previo')) as nao_pagantes,
  COUNT(*) FILTER (WHERE tipo_aluno = 'bolsista_integral' AND status IN ('ativo','aviso_previo')) as bolsistas_integrais,
  COUNT(*) FILTER (WHERE tipo_aluno = 'bolsista_parcial' AND status IN ('ativo','aviso_previo')) as bolsistas_parciais,
  COUNT(*) FILTER (WHERE status = 'trancado') as trancados
FROM alunos WHERE unidade_id = $1;
```

**Novos no mês (tabela `alunos`):**
```sql
SELECT COUNT(*) FROM alunos
WHERE unidade_id = $1 AND status IN ('ativo','aviso_previo')
  AND created_at >= primeiro_dia_mes AND created_at < primeiro_dia_proximo_mes;
```

**Matrículas (tabela `alunos` — não existe tabela `matriculas` separada):**
```sql
SELECT
  COUNT(*) FILTER (WHERE status IN ('ativo','aviso_previo')) as ativas,
  COUNT(*) FILTER (WHERE status IN ('ativo','aviso_previo') AND tipo_matricula_id = 5) as banda,
  COUNT(*) FILTER (WHERE status IN ('ativo','aviso_previo') AND is_segundo_curso = true) as segundo_curso
FROM alunos WHERE unidade_id = $1;
```

**Coral (tabela `alunos` com join `cursos`):**
```sql
SELECT COUNT(DISTINCT a.id) FROM alunos a
JOIN cursos c ON c.id = a.curso_id
WHERE a.unidade_id = $1 AND a.status IN ('ativo','aviso_previo')
  AND c.nome ILIKE '%coral%';
```

**Renovações do mês (tabela `movimentacoes_admin`):**
```sql
SELECT m.*, p.nome as professor_nome
FROM movimentacoes_admin m
LEFT JOIN professores p ON p.id = m.professor_id
WHERE m.unidade_id = $1 AND m.tipo IN ('renovacao','nao_renovacao')
  AND m.data >= primeiro_dia_mes AND m.data <= hoje;
```

**Renovações previstas (`dados_mensais`):**
```sql
SELECT renovacoes_previstas FROM dados_mensais
WHERE unidade_id = $1 AND competencia = 'YYYY-MM';
```

**Avisos prévios (mes_saida do mês seguinte):**
```sql
SELECT m.*, p.nome as professor_nome
FROM movimentacoes_admin m
LEFT JOIN professores p ON p.id = m.professor_id
WHERE m.unidade_id = $1 AND m.tipo = 'aviso_previo'
  AND m.mes_saida >= primeiro_dia_proximo_mes AND m.mes_saida <= ultimo_dia_proximo_mes;
```

**Evasões do mês:**
```sql
SELECT m.*, p.nome as professor_nome
FROM movimentacoes_admin m
LEFT JOIN professores p ON p.id = m.professor_id
WHERE m.unidade_id = $1 AND m.tipo = 'evasao'
  AND m.data >= primeiro_dia_mes AND m.data <= hoje;
```

**Nome da unidade + farmers:**
```sql
SELECT nome, farmers_nomes FROM unidades WHERE id = $1;
```

### Formato do texto

Idêntico ao frontend `gerarRelatorioDiario()`. Rodapé indica "(automático)":

```
━━━━━━━━━━━━━━━━━━━━━━
📅 Gerado em: {data} às {hora} (automático)
━━━━━━━━━━━━━━━━━━━━━━
```

### 3. pg_cron

```sql
SELECT cron.schedule(
  'relatorio-diario-20h',
  '0 23 * * 1-6',
  $$
  SELECT net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/relatorio-admin-whatsapp',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer {SERVICE_ROLE_KEY}'
    ),
    body := '{"modo": "cron"}'::jsonb
  );
  $$
);
```

Service role key hardcoded no header (padrão já usado em `processar-mensagens-agendadas`).

### 4. Toggle no frontend

**Localização:** `ModalRelatorio.tsx`, ao lado do card "Relatório Diário".

**Comportamento:**
- Switch com label "Envio automático 20h"
- Estado: `unidades.relatorio_diario_cron_ativo`
- Toggle faz: `supabase.from('unidades').update({ relatorio_diario_cron_ativo }).eq('id', unidade)`
- Desabilitado quando `unidade === 'todos'` (tooltip: "Selecione uma unidade")
- Toast de confirmação

### Timezone

Todas as datas no edge function calculadas em BRT:
```typescript
const now = new Date();
const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
const hoje = brt.toISOString().split('T')[0]; // YYYY-MM-DD em BRT
```

### Edge cases

- **Unidade com cron ativo mas sem destinatários**: log warning, skip, continua próxima unidade
- **UAZAPI fora do ar**: erro logado no console, visível via Supabase dashboard logs
- **Domingo**: cron não dispara (1-6 = seg-sáb)

## Fora de escopo

- Horário customizado por unidade
- Outros relatórios automáticos (mensal, coordenação)
- Retry em caso de falha
- Tabela de log dedicada (usa logs do Supabase dashboard)
