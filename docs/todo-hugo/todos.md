
- o ltv tambem conta dados historicos e nao filtra corretamente pelos dados.

- Professor Gabriel Antony Trabalha em duas unidades mas so esta configurada para uma.


Do adm:
1. ⁠1. A Grade horária está com horários diferentes do real(emusys), aulas em horários diferentes.
2. ⁠Distribuição dos alunos por professor irregular.
3. ⁠Quantidade de novas matriculas irregular, ferindo o saldo liquido no report. 

Do comercial: 
1. Irregularidades na  sinalização das matriculas dos professores, experimental computada, mas matricula não direcionada aos professores. 
2. ⁠Quantidade de Matriculas no mês diferente entre os dois sistemas, ora para mais ora pra menos.

"Gap" dos 16 leads (INVESTIGADO 2026-05-21 — NÃO É BUG):
- Os 16 leads que apareciam como "gap" (data_experimental preenchido mas sem linha em lead_experimentais) são na verdade **VISITAS ESCOLARES** corretamente registradas pela Mila SDR.
- Todos têm `tipo_agendamento='visita'`, `status='visita_escola'`, `etapa_pipeline_id=6` e linha correspondente em `visitas` (`criado_por='mila'`).
- O campo `leads.data_experimental` é reaproveitado como "data de qualquer agendamento" (visita OU experimental). Pra distinguir, filtrar por `tipo_agendamento`.
- **Implicação pra queries de experimentais**: SEMPRE filtrar `tipo_agendamento='experimental'` (ou ler direto de `lead_experimentais` que só contém experimentais reais).
- **Dívida de design** (não urgente): renomear `leads.data_experimental` → `leads.data_agendamento` pra deixar a semântica explícita.

Pendências de fix (2026-05-21):
- **Fix flags `registrar_experimental`**: a função Postgres `registrar_experimental` (9 e 10 params) não zera `experimental_realizada`/`faltou_experimental` ao agendar uma nova experimental. Solução: adicionar CASE WHEN no UPDATE do Bloco 4 zerando essas flags quando `p_status='experimental_agendada'`. Resolve o paradoxo da Alice (lead 7815) e os 3 críticos do painel Saúde. Migration deletada (estava em `supabase/migrations/20260521_fix_registrar_experimental_zera_flags.sql`) — recriar quando for aplicar. Sem backfill por enquanto.
- **Fix AgendaTab**: aba filtra leads por `data_contato` (mês) e busca apenas via `useLeadsCRM`, mas deveria buscar experimentais por `data_experimental` (mês) na tabela `lead_experimentais` (com fallback em `leads` enquanto o gap dos 16 não for resolvido na origem). Implementação anterior em `useExperimentaisDoMes.ts` (hook deletado, recriar). Só frontend, sem mudança de banco. Reversível sem risco.
- **Cancelamento de experimental não propaga ao banco (descoberto 2026-05-21)**: webhook `Fucq0bQwF4oeuWnv` recebeu evento `aula_experimental_cancelada` 2× para Maria Luiza (lead 9041, tel 5521980039421, Barra) e a execução retornou success, mas no banco: linha em `lead_experimentais` continua `status='experimental_agendada'` (não virou `cancelada`) E flags em `leads` continuam `experimental_agendada=true`. Resultado: o aluno cancelado continua aparecendo no Comercial → Barra → Hoje como agendado. Investigar: (a) qual node do `Fucq0bQwF4oeuWnv` trata `aula_experimental_cancelada`, (b) se ele chama `registrar_experimental(p_status='cancelada')` corretamente, (c) se a função tá aplicando o UPDATE de cancelamento (o código existe no Bloco 2 da função — `IF p_status IN ('cancelada', 'novo')` — mas pode não estar sendo acionado pelo workflow).
- **Redefinição semântica dos KPIs do Comercial — funil correto (proposto 2026-05-21)**: o dashboard Comercial deveria seguir um funil clássico, todos os marcos dentro do MESMO período selecionado:
  - **Leads novos no período** (já correto): `leads.data_contato BETWEEN startDate AND endDate`
  - **Experimentais agendadas no período**: desses leads novos, quantas experimentais foram AGENDADAS durante o período. Query proposta: `JOIN lead_experimentais le ON le.lead_id = l.id WHERE le.created_at BETWEEN startDate AND endDate AND le.status != 'cancelada'`. **Hoje filtra errado por `data_experimental` (data DA AULA) em vez de `created_at` (data DO AGENDAMENTO)** — por isso Alice Duarte (aula 22/05) e Alice e Giovana (aula 26/05), ambas agendadas hoje na Barra, somem do filtro "Hoje" mesmo sendo o caso clássico de "agendado hoje".
  - **Matrículas no período**: leads novos do período que matricularam no período. Verificar se a query atual filtra apenas por status ou se também filtra por `leads.data_conversao BETWEEN startDate AND endDate`. Se for só por status, está errado em períodos longos.
  - Versão **estrita** (recomendada pra esse dashboard "Lançamento diário"): tudo dentro do mesmo range — lead + experimental + matrícula no período.
  - Lacuna conceitual: também não existe view "Atividade do dia" mostrando o que o comercial agendou/matriculou hoje independente de quando o lead chegou.
  - Só frontend (ajuste de query no ComercialPage.tsx), sem mudança de banco. Reversível sem risco.