# Fix Grade Horária — Plano

**Status:** APLICADO (2026-05-20). Parte A (backfill), Parte B (cron diário) e invariante de professor divergente em produção. Parte C (fix da edge) segue opcional.

## Aplicado em 2026-05-20

### Parte A — Backfill ✓
- 853 alunos atualizados via UPDATE único (filtro `>= 3 aulas` em 60d, BRT)
- Backup conservador em `alunos_backup_grade_20260520` (1.209 linhas)
- Validação manual: Davi Pedro Palmerini (Barra) — Sáb 05h → Sáb 08h, confere com Emusys

### Parte B — Cron diário ✓
- RPC `public.sincronizar_grade_horaria_alunos()` criada (SECURITY DEFINER)
  - Janela 30d primária, fallback 60d, filtro `>= 3 aulas`
  - Converte `data_hora_inicio AT TIME ZONE 'America/Sao_Paulo'` antes de comparar
- pg_cron `sincronizar-grade-horaria` (jobid 17) — schedule `30 1 * * *` (22h30 BRT)
- Primeira execução manual: 90 alunos atualizados (drift acumulado pós-backfill — esperado)

### Parte D — Invariante professor_divergente_das_aulas ✓ (não estava no plano original)
Decisão de produto: webhook do Emusys só atualiza `professor_atual_id` em matricula_nova/renovacao. Troca de professor no meio do contrato fica defasada. Em vez de auto-corrigir (risco em métricas: score, comissão, carteira), foi adicionado **alerta** no auditor `auditor-divergencias-emusys` (v3):
- Regra `professor_divergente_das_aulas` (severidade `aviso`)
- Detecta `alunos.professor_atual_id` ≠ professor majoritário em `aluno_presenca` 30d (>= 3 aulas)
- Primeira run: 163 alunos sinalizados (138 com prof diferente, 25 sem prof_atual_id mas com aulas)
- Aparece na aba Saúde das Automações como aviso — ação humana decide trocar
- Agente fiscal-dados (`.claude/agents/fiscal-dados.md`) também atualizado pra observar o cenário



## Diagnóstico

**Bug:** 901 de 1.209 alunos ativos (75%) têm `alunos.dia_aula` / `alunos.horario_aula` divergentes do horário real das aulas em `aulas_emusys`. 66% têm offset exato de **+3h** = bug clássico de timezone BRT (UTC-3).

**Distribuição dos offsets** (medida em 2026-05-20):
- +3h (bug TZ): 701 alunos (66%)
- 0 (correto): 212 alunos (20%)
- +4h: 39
- +1h: 21
- −1h: 17
- +2h: 11
- −3h: 10
- Outros: ~50

**Causa raiz:** `processar-matricula-emusys` grava `agendamentos[0].horario` direto como `time` em `alunos.horario_aula`, mas o Emusys serializa horário local como se fosse UTC (bug deles). Resultado: 09h BRT vira 09:00 no banco, mas a aula real é 06:00 (banco) → 09:00 (BRT) = +3h offset.

Os outros 14% (offsets ≠ +3h) são reagendamentos legítimos no Emusys que nunca chegaram ao nosso banco (não há webhook de "aula reagendada").

**View afetada:** `vw_turmas_implicitas` (consumida pela tela `/app/alunos` → aba Grade Horária). Faz `GROUP BY a.horario_aula, a.dia_aula` — agrupamento errado quando os campos estão errados.

**Consumidores impactados (todos veem horário errado):**
- Grade Horária no Report
- Relatórios PDF / Exports
- Edge functions de WhatsApp (lembrete de aula)
- Queries ad-hoc / NocoDB
- BI dashboards

## Solução proposta

### Parte A — Backfill (UPDATE único)

Sincronizar `alunos.dia_aula` e `alunos.horario_aula` com o horário **mais frequente** das últimas aulas de cada aluno em `aulas_emusys` (60 dias).

**Critério de segurança:** só atualiza alunos com `>= 3 aulas` no mesmo horário/dia (alta confiança). Alunos com 1-2 aulas ficam intocados.

**Resultado simulado:**
- 901 alunos serão atualizados (75%)
- 217 já estão corretos (não muda)
- 91 sem aula recente ou poucas aulas (não muda — fica como está hoje)

**SQL (não executado ainda):**
```sql
WITH aulas_aluno AS (
  SELECT
    ap.aluno_id,
    EXTRACT(DOW FROM ae.data_hora_inicio AT TIME ZONE 'America/Sao_Paulo')::int as dow,
    to_char((ae.data_hora_inicio AT TIME ZONE 'America/Sao_Paulo'), 'HH24:MI:SS')::time as horario,
    count(*) as ocorrencias
  FROM aluno_presenca ap
  JOIN aulas_emusys ae ON ae.id = ap.aula_emusys_id
  WHERE ae.cancelada = false
    AND ae.data_hora_inicio > now() - interval '60 days'
  GROUP BY ap.aluno_id, dow, horario
),
top_horario AS (
  SELECT DISTINCT ON (aluno_id) aluno_id, dow, horario
  FROM aulas_aluno
  WHERE ocorrencias >= 3
  ORDER BY aluno_id, ocorrencias DESC, dow ASC
),
dia_nome AS (
  SELECT 0 as dow, 'Domingo'::text as nome UNION ALL
  SELECT 1, 'Segunda' UNION ALL
  SELECT 2, 'Terça' UNION ALL
  SELECT 3, 'Quarta' UNION ALL
  SELECT 4, 'Quinta' UNION ALL
  SELECT 5, 'Sexta' UNION ALL
  SELECT 6, 'Sábado'
)
UPDATE alunos a
SET
  horario_aula = th.horario,
  dia_aula = dn.nome::text
FROM top_horario th
JOIN dia_nome dn ON dn.dow = th.dow
WHERE a.id = th.aluno_id
  AND a.status = 'ativo'
  AND (a.horario_aula::time <> th.horario OR upper(a.dia_aula::text) <> upper(dn.nome));
```

**Reversibilidade:** antes do UPDATE, fazer SELECT INTO `alunos_backup_grade_20260520` pra dump dos campos atuais.

### Parte B — Cron diário (manutenção)

Nova RPC SQL `sincronizar_grade_horaria_alunos()` que executa o UPDATE acima. Agendar via pg_cron logo após o `sync-presenca-emusys`:

```
22:00 BRT → sync-presenca-emusys (já existe — popula aulas_emusys)
22:30 BRT → sincronizar_grade_horaria_alunos (NOVO — RPC SQL)
```

Sem nova edge function. Job pg_cron novo chama a RPC diretamente.

### Parte C — Fix do handler (opcional, baixa prioridade)

Corrigir `processar-matricula-emusys` pra interpretar `agendamentos[0].horario` corretamente (subtrair 3h ou ler `data_hora_primeira_aula` que vem com timezone explícito).

**Por que opcional:** com Parte B rodando diariamente, qualquer matrícula nova com bug é corrigida em até 24h. Custo de mexer na edge crítica não compensa o ganho marginal.

## Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Backfill atualiza um aluno errado (caso atípico) | Filtro `>= 3 aulas` evita basear em casos esporádicos. Dump antes do UPDATE. |
| Aulas de reposição em horário diferente do regular | Filtro `>= 3 aulas` exige consistência. Reposição (1-2 aulas) não vence o regular. |
| Aluno mudou de turma no Emusys mas só teve 1-2 aulas no horário novo | Fica com horário antigo até atingir 3 aulas no novo. Aceitável. |
| Cron rodar enquanto sync-presenca não terminou | Agendar com 30min de gap (22h00 sync, 22h30 cron). |
| UPDATE em produção sem testes | Backup primeiro, depois pode-se reverter com `UPDATE FROM alunos_backup`. |

## Amostras pra validar manualmente (15 alunos)

Documentado nas mensagens da sessão. Casos confirmados em 3 unidades:

**Barra:** Davi Pedro Palmerini, Marcelo Oliveira Brum Cardoso, Giovani Breda Silva, Joaquim Candido Querido Ferraz Soares, Arthur Pedro Palmerini Lomba (todos Sáb 05:00 no banco → Sáb 08:00 no Emusys).

**Campo Grande:** Laura Turques Tavares, Luan Gomes de Faria, Moisés Martins Francisco Ribeiro, Maria Flor Silva Da Conceição, Cássia Santos (todos Sáb 05:00 → Sáb 08:00).

**Recreio:** Vicente Pereira Costard (Qua 05:00 → Qua 08:00), Maria Eduarda Cardoso Moreira (Sáb 06:00 → Sáb 09:00), Rafael Souto Machado (Sáb 06:00 → Sáb 09:00), Catarina Petrolongo Pinto Abreu (Sex 06:00 → Sex 09:00), Pedro de Castro Bressane Albuquerque do Carmo (Sex 06:00 → Sex 09:00).

## Decisão pendente

Aguardando o usuário:
1. Confirmar manualmente 1-2 amostras no Emusys
2. Escolher abordagem: A só, A+B (recomendado), ou A+B+C
3. Decidir sobre dump prévio (recomendado fazer)

## Plano não inclui

- Reprocessamento de webhooks históricos de matrícula
- Mudança na view `vw_turmas_implicitas` (continua usando `alunos.dia_aula`/`horario_aula`)
- Sincronização das aulas individuais em `aulas_emusys` (já está correto)
- Mudança no fluxo do n8n
- Webhook novo de "aula reagendada" (Emusys não oferece)
