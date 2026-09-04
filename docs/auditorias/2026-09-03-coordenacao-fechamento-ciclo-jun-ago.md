# Auditoria — Relatório da Coordenação quebrado e fechamento do ciclo Jun-Ago/2026

**Data:** 2026-09-03 · **Solicitante:** Alf (via relato do Quintela) · **Executado por:** Devin
**Autorização:** explícita do Alf ("faz tudo, sem quebrar meses já fechados").

---

## Sintomas (Quintela, 03/09)

- Relatório do ciclo Jun-Ago não gera (carrega e morre).
- Mensal de junho não gera; mensal de agosto idem; ranking de agosto idem.
- Julho mensal funciona, mas o ranking saiu só por health score (sumiram os tops por categoria).
- Tela inteira em "Dados em auditoria"; coordenadores perguntam "sem experimentais confirmadas".
- Gerencial WhatsApp: "RANKINGS OFICIAIS — Sem dados suficientes" e comparativos bloqueados.

## Raiz (todas as frentes medidas contra o banco)

**1. Faltavam as capturas v2 de junho e agosto.** Para mês passado,
`get_relatorio_coordenacao_canonico_v2` só lê `fechamento_mensal_snapshots`
(`dominio='relatorio_coordenacao'`, `status='fechado'`, fonte `montar_relatorio_coordenacao_payload_v2`,
schema_version=2). Só julho tinha (rodada em 03/08). Junho quebrava com
`RELATORIO_COORDENACAO_V2_FECHADO_INDISPONIVEL` (reproduzido); agosto tinha snapshot com fonte
antiga (`get_dados_relatorio_coordenacao`, v1) que o leitor ignora — quebrava igual, e o relatório
de ciclo chama a base de agosto, herdando a quebra.

**2. O ciclo `2026-JUN-AGO` nunca foi oficialmente fechado** (`estado='aberto'`,
`publicacao_oficial=false`). Consequência dominó: 0 snapshots `oficial` na base inteira (9.805
criados desde junho), tela toda "em auditoria", `ranking_oficial` vazio → fallback só-health-score,
rankings por categoria e do gerencial "Sem dados suficientes".

**3. A cerimônia de fechamento nunca tinha rodado — era impossível de rodar.** Três armadilhas
empilhadas, medidas uma de cada vez:

- **Roster gate travava com 14 excedentes** (professores desligados/mesclados/sem vínculo Emusys
  na unidade que tinham snapshot do ciclo). Não existia forma governada de resolver.
- **Deadlock estrutural de 'sem_base':** o trigger `fn_health_score_v3_bloquear_sem_disponibilidade`
  FORÇA `estado_publicacao='sem_base'` em qualquer UPDATE de snapshot com
  disponibilidade canônica ausente → o gate de excedentes (que olhava parcial/sem_base/oficial) nunca
  limparia por escrita. Gate refinado: excedentes só contam retratos com evidência ('parcial'/'oficial');
  ausências continuam vendo o retrato amplo (sem_base retrata roster sem evidência, não some do radar).
- **Deadlock de métricas:** a cerimônia insere a revisão oficial já `'fechada'` e depois copia as
  métricas — mas `fn_health_score_professor_v3_bloquear_metrica_fechada` exigia snapshot aberto e a
  cerimônia não setava a chave de sessão `app.health_score_v3_mutacao_controlada`. Corrigido: chave
  passa a autorizar o INSERT governado (UPDATE/DELETE seguem proibidos) e a cerimônia seta a chave.

## O que foi executado (ordem, tudo com trilha)

1. `capturar_relatorio_coordenacao_canonico_v2(2026,6)` → 4 snapshots (3 unidades + consolidado),
   motivo auditado. ⚠️ junho reflete a base corrigida de hoje (a captura calcula com os dados atuais).
2. `capturar_relatorio_coordenacao_canonico_v2(2026,8)` → idem.
3. Nova cerimônia versionada `retirar_do_roster_health_score_v3_ciclo(ciclo, professor, unidade, motivo)`
   (migration `20260903120000_...`): marca snapshots parcial/sem_base de excedentes como
   `em_andamento` + motivo auditável, sem apagar nada (74 revisões marcadas).
4. Gate do fechamento refinado (migration `20260903130000_...` — também corrige a trava de métricas).
5. `fechar_health_score_professor_v3_ciclo('2026-JUN-AGO', justificativa)` → **sucesso:
   12 revisões oficiais criadas, ranking_habilitado=true, ciclo fechado.**
6. Prevenção: cron `capturar-relatorio-coordenacao-v2-mensal` (dia 2, 03:15 UTC) — a captura é
   idempotente; nunca mais depende de alguém lembrar.

**Nada fechado anteriormente (admin/comercial v2, coordenação v1) foi tocado.**

## Estado depois

- Relatório de ciclo Jun-Ago GERA e vem `estado_publicacao='oficial'`.
- Mensal junho e agosto voltam a gerar (snapshot v2 existe).
- Tela sai de "auditoria" para o que é oficial; relatório gerencial deixa de dizer "sem dados"
  nos próximos envios (os já enviados não mudam retroativamente).

## O que NÃO é mais plomagem — é régua (decisão do Alf pendente)

Só **12 snapshots** rede inteira viraram oficiais no fechamento (Recreio: 2 de 24 — Isaque 76,5 e
Kaio 79,1). A cerimônia só promove quem tem **todas** as métricas com `apta_oficial=true`.
Causas medidas nas reprovas:

- `presenca`: exige **cobertura semântica ≥ 95%** do roster; a maioria estava 85–90%.
- `conversao`: vive `estado_base='em_andamento'`/`confianca='provisoria'` → nunca apta até aí.
- `retencao`: nota boa e confiança alta, mas `apta_oficial=false` **sem motivo registrado** —
  provável bug de marcação no produtor (frente própria).

Enquanto a régua não for recalibrada, o ranking oficial da tela mostra poucos nomes e o resto fica
parcial. Decisão: afrouxar `apta_oficial` no fechamento (ex.: exigir pilares mínimos em vez de
"todos aptos") ou manter. Não mudei régua — mudei plomagem.

## Parked (outras raízes, frentes próprias)

- Divergência experimental→conversão (relato do Marcos/Letícia): pipeline
  `get_kpis_professor_periodo_canonico_v2` — abrir investigação separada.
- 3 professores ativos com retrato todo `sem_base` por "disponibilidade canônica ausente"
  (John, Marcos Serafim, Matheus Reis): regularizar cadastro de disponibilidade na unidade.
