# Auditoria de Sync de Presença e Matrículas

Checklist para verificar gargalos entre os fluxos do Emusys, n8n, sync de presença e contagem de matrículas. Executar periodicamente (sugestão: quinzenal) ou quando métricas de professores parecerem inconsistentes.

---

## 1. Presenças divergentes (Emusys vs Banco)

**Problema:** O sync de presença roda às 22h BRT. Se o professor marcar presença no Emusys depois disso, o banco fica com "ausente" permanente.

**Como verificar:**

```sql
-- Alunos marcados como ausente no banco mas que podem estar presentes no Emusys
-- Focar em experimentais (mais impactantes)
SELECT ap.aluno_id, a.nome, ap.data_aula, ap.status, ae.categoria, ae.professor_nome
FROM aluno_presenca ap
JOIN aulas_emusys ae ON ae.id = ap.aula_emusys_id
JOIN alunos a ON a.id = ap.aluno_id
WHERE ap.status = 'ausente'
  AND ae.categoria = 'experimental'
  AND ap.data_aula >= CURRENT_DATE - interval '30 days'
ORDER BY ap.data_aula DESC;
```

**Correção pontual:** Consultar a API do Emusys para o dia/aula específico e atualizar:
```sql
UPDATE aluno_presenca SET status = 'presente'
WHERE aluno_id = <ID> AND aula_emusys_id = <AULA_ID>;
```

**Prevenção:** O cron agora processa `dias: 2`, dando uma segunda chance. Se insuficiente, considerar `dias: 3`.

---

## 2. Matrículas não contadas (experimental_realizada = false)

**Problema:** Quando o comercial registra a matrícula no Emusys antes do aluno fazer a experimental, o webhook de matrícula marca `converteu = true` mas `experimental_realizada` fica `false`. O sync posterior ignora o lead porque já está como "convertido".

**Como verificar:**

```sql
-- Leads convertidos que tinham experimental mas experimental_realizada ficou false
SELECT l.id, l.nome, l.professor_experimental_id, p.nome as professor,
       l.data_contato, l.data_experimental, l.data_conversao,
       l.experimental_realizada, l.converteu, l.unidade_id
FROM leads l
JOIN professores p ON p.id = l.professor_experimental_id
WHERE l.converteu = true
  AND l.data_experimental IS NOT NULL
  AND l.experimental_realizada = false
  AND l.faltou_experimental IS NOT TRUE
  AND l.data_contato >= CURRENT_DATE - interval '90 days'
ORDER BY l.data_contato DESC;
```

**Impacto:** Cada registro nessa query é uma matrícula que NÃO estava sendo contada como conversão pós-experimental do professor. A correção no filtro SQL (aplicada em abril/2026) resolve a contagem, mas o flag `experimental_realizada` continua incorreto.

**Correção pontual do flag:**
```sql
-- Após confirmar que o aluno realmente fez a experimental (verificar no Emusys)
UPDATE leads SET experimental_realizada = true
WHERE id = <LEAD_ID> AND converteu = true AND data_experimental IS NOT NULL;
```

---

## 3. Sync de presença — execuções e horários

**Como verificar se o sync está rodando no horário correto:**

```sql
-- Últimas execuções do sync por unidade
SELECT data_sync, unidade_nome, total_aulas, total_registros,
       alunos_matched, alunos_nao_encontrados, executado_em,
       TO_CHAR(executado_em AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI') as horario_brt
FROM emusys_sync_log
WHERE executado_em >= CURRENT_DATE - interval '7 days'
ORDER BY executado_em DESC;
```

**O que observar:**
- `horario_brt` deve ser próximo de 22:00 (cron programado)
- Se aparecerem execuções em horários fora do padrão (ex: 18h), foi uma execução manual
- `alunos_nao_encontrados` crescendo indica nomes divergentes entre Emusys e banco

**Configuração atual do cron:**
```sql
SELECT jobid, schedule, command FROM cron.job WHERE jobname = 'sync-presenca-emusys';
-- schedule deve ser '0 1 * * *' (01:00 UTC = 22:00 BRT)
-- body deve conter "dias": 2
```

---

## 4. Alunos não encontrados no sync

**Problema:** O sync faz matching de alunos por nome normalizado. Se o nome no Emusys difere do banco (acento, abreviação, erro de digitação), o aluno não é vinculado.

**Como verificar:**

```sql
-- Nomes que o sync não conseguiu vincular nos últimos 7 dias
SELECT DISTINCT nome
FROM (
  SELECT jsonb_array_elements_text(nomes_nao_encontrados) as nome
  FROM emusys_sync_log
  WHERE executado_em >= CURRENT_DATE - interval '7 days'
    AND nomes_nao_encontrados IS NOT NULL
) sub
ORDER BY nome;
```

**Correção:** Verificar se o aluno existe no banco com nome diferente e corrigir em um dos sistemas.

---

## 5. Webhook de matrículas — logs

**Como verificar se matrículas estão sendo processadas:**

```sql
-- Últimos registros de matrícula nos logs
SELECT lead_nome, evento, acao, created_at, 
       detalhes->>'data_matricula' as data_matricula,
       detalhes->>'aluno_id' as aluno_id
FROM leads_automacao_log
WHERE evento = 'matricula_registrada' OR acao = 'convertido'
ORDER BY created_at DESC
LIMIT 20;
```

**O que observar:**
- `aluno_id` presente = matrícula criou/atualizou o aluno com sucesso
- `aluno_id` null = possível falha no processamento
- Gaps de datas = webhook pode não estar disparando

---

## 6. Leads órfãos (NocoDB sem Supabase)

**Problema:** Quando a Mila SDR cria um lead no Emusys e a API rejeita (telefone duplicado, erro 4xx), o lead aparece no NocoDB mas não no Supabase.

**Como verificar:**

```sql
-- Leads recentes sem emusys_lead_id (podem ser órfãos)
SELECT id, nome, telefone, data_contato, unidade_id, status
FROM leads
WHERE emusys_lead_id IS NULL
  AND data_contato >= CURRENT_DATE - interval '30 days'
ORDER BY data_contato DESC;
```

---

## 7. Experimentais não confirmadas pelo sync

**Problema:** O sync confirma experimentais cruzando `lead_experimentais` (status=agendada) com `aulas_emusys` (categoria=experimental). Se o lead já foi convertido antes do sync rodar, a experimental não é confirmada.

**Como verificar:**

```sql
-- Experimentais que nunca foram confirmadas (agendadas há mais de 7 dias)
SELECT le.id, le.nome_aluno, le.data_experimental, le.status, le.professor_experimental_id,
       p.nome as professor, l.status as lead_status, l.converteu
FROM lead_experimentais le
JOIN leads l ON l.id = le.lead_id
JOIN professores p ON p.id = le.professor_experimental_id
WHERE le.status = 'experimental_agendada'
  AND le.data_experimental < CURRENT_DATE - interval '7 days'
ORDER BY le.data_experimental DESC;
```

```sql
-- Experimentais convertidas sem confirmação de presença
SELECT le.id, le.nome_aluno, le.data_experimental, le.status,
       p.nome as professor, l.experimental_realizada
FROM lead_experimentais le
JOIN leads l ON l.id = le.lead_id
JOIN professores p ON p.id = le.professor_experimental_id
WHERE le.status = 'convertido'
  AND l.experimental_realizada = false
  AND le.data_experimental >= CURRENT_DATE - interval '90 days'
ORDER BY le.data_experimental DESC;
```

---

## 8. Divergência de contagem entre sistemas

**Verificação rápida para um professor específico:**

```sql
-- Comparar matrículas reais vs contadas para professor X no mês Y
WITH leads_prof AS (
  SELECT id, nome, status, experimental_realizada, converteu, data_experimental, faltou_experimental
  FROM leads
  WHERE professor_experimental_id = <PROFESSOR_ID>
    AND EXTRACT(YEAR FROM data_contato) = <ANO>
    AND EXTRACT(MONTH FROM data_contato) = <MES>
    AND unidade_id = '<UNIDADE_ID>'
)
SELECT
  COUNT(*) FILTER (WHERE status IN ('matriculado','convertido')) as matriculas_total,
  COUNT(*) FILTER (WHERE status IN ('matriculado','convertido') AND experimental_realizada = true) as pos_exp_filtro_antigo,
  COUNT(*) FILTER (WHERE status IN ('matriculado','convertido')
    AND (experimental_realizada = true OR (converteu = true AND data_experimental IS NOT NULL AND faltou_experimental IS NOT TRUE))
  ) as pos_exp_filtro_novo,
  COUNT(*) FILTER (WHERE converteu = true AND experimental_realizada = false AND data_experimental IS NOT NULL) as gap_nao_contados
FROM leads_prof;
```

Se `gap_nao_contados > 0`, existem matrículas que só o filtro novo captura.

---

## 9. Workflows n8n — IDs e verificação de execuções

### Referência de Workflows

| Workflow | ID | Descrição |
|----------|-----|-----------|
| Emusys Webhook de Leads | `EB0LibpOJCLhKp7M` | Recebe lead_criado/editado/arquivado do Emusys → upsert Supabase + NocoDB |
| NocoDB Webhook | `1uP2GhoHG1shEFLg` | NocoDB atualiza → upsert_lead Supabase (fallback) |
| Gerenciar CRM NocoDB | `dJ7Dc9LHLTSnKIsi` | Chatwoot webhook → atualiza estágio no NocoDB |
| Controle de Estágio | `nw9DOzoOVjcBJGdb` | NocoDB webhook → marca Exp. Marcada/Comparecimento |
| Sub-workflow Experimental | `j41tPbyjGXUQUxrN` | Chamado pelo Emusys webhook de aula experimental → registrar_experimental() |
| Mila SDR CG | `aHD4kJdzByLwFXA1` | Agente Mila pré-atendimento Campo Grande |
| Mila SDR Recreio | `gSHJHYMOYDQZqleW` | Agente Mila pré-atendimento Recreio |
| Mila SDR Barra | `yko5HstPTze0gsIM` | Agente Mila pré-atendimento Barra |

### Cadeia principal de leads

```
WhatsApp → Mila SDR (aHD4kJdzByLwFXA1/gSHJHYMOYDQZqleW/yko5HstPTze0gsIM)
  → Cadastrar no Emusys (API)
  → Emusys dispara webhook
  → EB0LibpOJCLhKp7M (upsert Supabase + NocoDB)
```

### Cadeia de experimentais

```
Emusys aula_experimental_criada
  → j41tPbyjGXUQUxrN (registrar_experimental no Supabase + NocoDB)
  → nw9DOzoOVjcBJGdb (marcar Exp. Marcada no NocoDB)
```

### Cadeia de matrículas

```
Emusys webhook matrícula
  → Edge Function processar-matricula-emusys
  → Converte lead, cria/atualiza aluno, registra movimentação
```

### Como verificar execuções no n8n (via MCP)

Para investigar um caso específico, usar o MCP n8n para buscar execuções:

**Verificar se o webhook de leads processou um lead específico:**
- Workflow: `EB0LibpOJCLhKp7M`
- Buscar execuções recentes e filtrar pelo nome/telefone do lead no payload

**Verificar se a experimental foi registrada:**
- Workflow: `j41tPbyjGXUQUxrN`
- Buscar execuções na data da experimental

**Verificar se a Mila processou o lead:**
- Workflows: `aHD4kJdzByLwFXA1` (CG), `gSHJHYMOYDQZqleW` (Recreio), `yko5HstPTze0gsIM` (Barra)
- Buscar execuções na data de contato do lead

### O que verificar nas execuções

| Sintoma | Workflow para verificar | O que procurar |
|---------|------------------------|----------------|
| Lead não aparece no Supabase | `EB0LibpOJCLhKp7M` | Execução falhou? Payload sem telefone (descartado)? |
| Lead sem experimental no banco | `j41tPbyjGXUQUxrN` | Execução existiu? Erro no registrar_experimental()? |
| Experimental não confirmada | sync-presenca-emusys (edge function) | Verificar emusys_sync_log no banco |
| Matrícula não registrada | processar-matricula-emusys (edge function) | Verificar automacao_log e leads_automacao_log |
| Lead no NocoDB mas não no Supabase | `EB0LibpOJCLhKp7M` + `1uP2GhoHG1shEFLg` | Emusys rejeitou? NocoDB webhook não disparou? |
| Estágio divergente NocoDB vs Supabase | `dJ7Dc9LHLTSnKIsi` | Chatwoot sobrescreveu estágio? |

### Gargalos conhecidos nos workflows

1. **Cadastrar no Emusys (`neverError: true`)** — Dentro dos workflows Mila, se o Emusys rejeita o lead (telefone duplicado, etc.), a falha é silenciosa. O lead aparece no NocoDB mas não no Emusys, e o webhook `EB0LibpOJCLhKp7M` nunca dispara.

2. **Gerenciar CRM (`dJ7Dc9LHLTSnKIsi`)** — Dispara a cada mensagem no Chatwoot. Pode sobrescrever estágio no NocoDB com valor antigo se o Chatwoot não foi atualizado. Fix parcial: IF verifica se NocoDB já tem estágio mais avançado.

3. **Race condition de webhooks** — Emusys pode disparar `lead_criado` e `lead_editado` quase simultaneamente. O `upsert_lead()` tem `ON CONFLICT (telefone, unidade_id)` para tratar isso, mas pode haver edge cases.

---

## Resumo de gaps conhecidos e status

| Gap | Descrição | Status | Prevenção |
|-----|-----------|--------|-----------|
| Presença tardia | Professor marca depois do sync | Corrigido | `dias: 2` no cron |
| Matrícula antes da exp | Comercial converte antes da aula | Corrigido | Filtro SQL ampliado |
| Nomes divergentes | Emusys ≠ banco | Monitorar | Query de não encontrados |
| Leads órfãos | Emusys rejeita, NocoDB mantém | Monitorar | Fallback no n8n (pendente) |
| Experimental não confirmada | Lead convertido antes do sync | Parcial | Filtro SQL compensa, flag não corrigido |

---

## Cronograma sugerido

- **Semanal:** Verificar itens 3 e 4 (sync rodando? alunos não encontrados?)
- **Quinzenal:** Verificar itens 1, 2 e 7 (presenças divergentes, matrículas não contadas)
- **Mensal:** Verificar itens 5, 6 e 8 (webhooks, órfãos, divergências de contagem)
