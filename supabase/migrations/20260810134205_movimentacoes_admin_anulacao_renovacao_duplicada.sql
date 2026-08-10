-- Marca renovacao duplicada sem deletar a linha.
--
-- POR QUE NAO DELETAR: em 2026-08-08 descobriu-se que a renovacao da Catarina
-- Petrolongo (mov 3178) tinha sido DELETADA depois do fechamento de julho. O
-- snapshot continua listando o item, e a leitura preserva itens assinados cuja
-- movimentacao sumiu -- o relatorio mostra 23 renovacoes e o banco tem 22. Um
-- registro apagado vira fantasma; um registro marcado continua auditavel.
--
-- Mesmo padrao de alunos_historico.anulado, ja usado no projeto.
--
-- COMO AS DUPLICATAS FORAM IDENTIFICADAS (metodo objetivo, nao heuristica)
--
-- Renovacao muda o valor que o aluno paga. Cruzando o historico de faturas do
-- Emusys mes a mes (GET /faturas?aluno_id=N, campo valor_pago), cada caso abaixo
-- teve UMA unica mudanca de valor em 2026 -- logo, UMA renovacao. Onde havia
-- duas registradas, a outra e duplicata:
--
--   Antonio Jose (CG)    387 (jan-jun) -> 429 (ago)      = 1 renovacao
--   Luciene (CG)         327 (jan-jul) -> 367 (ago)      = 1 renovacao
--   Philippe (REC)       400 (jan-jun) -> 428 (jul)      = 1 renovacao
--   Miguel Holanda (REC) 385 (jan-jul) -> 404,25 (ago)   = 1 renovacao
--   Lara Dias (REC)      405 (jan-jul) -> 445,50 (ago)   = 1 renovacao
--
-- ⚠️ NAO usar valor_original da fatura para isso: ele e o valor de TABELA (todo
-- Campo Grande tem 447) e nao reflete reajuste individual. O campo que revela a
-- renovacao e valor_pago.
--
-- No caso da Lara, o registro de julho trazia 453,60 -- valor que ela nunca
-- pagou. O de agosto (445,50) e o correto e foi o mantido.
--
-- RAIZ: lancamento manual nao gravava emusys_matricula_id, entao o registro
-- manual e o webhook do Emusys viravam duas linhas sem como casar. Corrigido em
-- FormRenovacao.tsx (commit 35aefa10).

alter table public.movimentacoes_admin
  add column if not exists anulado boolean not null default false,
  add column if not exists anulado_motivo text,
  add column if not exists anulado_em timestamptz,
  add column if not exists anulado_por text;

comment on column public.movimentacoes_admin.anulado is
  'Movimentacao desconsiderada nos KPIs sem ser deletada. Deletar cria fantasma: snapshot fechado continua listando o item e a leitura o preserva (caso Catarina Petrolongo, julho/2026).';

-- Indice parcial: as consultas de KPI filtram `not anulado`, e a esmagadora
-- maioria das linhas tem anulado=false.
create index if not exists idx_movimentacoes_admin_anulado
  on public.movimentacoes_admin (unidade_id, tipo, competencia_referencia)
  where not anulado;

-- As 5 duplicatas identificadas. Cada motivo carrega a evidencia do Emusys.
update public.movimentacoes_admin
set anulado = true,
    anulado_em = now(),
    anulado_por = 'auditoria-duplicatas-2026-08-08',
    anulado_motivo = case id
      when 3101 then 'Duplicata: historico de faturas do Emusys mostra 387 (jan-jun) -> 429 (ago), uma unica mudanca de valor = uma renovacao. Mantido o registro de jul (3246).'
      when 3102 then 'Duplicata: 327 (jan-jul) -> 367 (ago) no Emusys, uma unica renovacao. Mantido o registro de jul (3243).'
      when 3281 then 'Duplicata: 400 (jan-jun) -> 428 (jul) no Emusys, uma unica renovacao. Mantido o registro de jul (3208), que coincide com a mudanca.'
      when 3341 then 'Duplicata: 385 (jan-jul) -> 404,25 (ago) no Emusys, uma unica renovacao. Mantido o registro de ago (3422), que coincide com a mudanca.'
      when 3333 then 'Duplicata com valor incorreto: registrava 453,60, mas o Emusys mostra 405 (jan-jul) -> 445,50 (ago). Mantido o registro de ago (3406), com o valor que ela de fato paga.'
    end
where id in (3101, 3102, 3281, 3341, 3333)
  and not anulado;
