-- Campos de CONTRATO no espelho da jornada, para derivar o vencimento da ultima
-- fatura sem consultar /faturas e para ler inadimplencia sem depender do
-- inadimplencia_emusys_cache (que esta sem escrita desde 2026-07-15 e nunca teve
-- linha de Campo Grande).
--
-- Grao: a tabela e por matricula/disciplina, mas estes campos sao do CONTRATO --
-- repetem nas N linhas de uma matricula multi-disciplina, mesmo padrao do
-- qtd_contratos que ja existe aqui.

alter table public.aluno_jornada_matricula_disciplina
  add column if not exists nr_faturas integer,
  add column if not exists data_primeira_fatura date,
  add column if not exists dia_vencimento_emusys integer,
  add column if not exists inadimplente_emusys boolean;

comment on column public.aluno_jornada_matricula_disciplina.nr_faturas is
  'contrato_atual.nr_faturas do Emusys. 0 ou NULL = contrato sem parcelas.';
comment on column public.aluno_jornada_matricula_disciplina.data_primeira_fatura is
  'contrato_atual.data_primeira_fatura do Emusys.';
comment on column public.aluno_jornada_matricula_disciplina.dia_vencimento_emusys is
  'contrato_atual.dia_vencimento do Emusys. NAO confundir com alunos.dia_vencimento, '
  'que e default de formulario (91,2% no dia 5) e nao vem da origem.';
comment on column public.aluno_jornada_matricula_disciplina.inadimplente_emusys is
  'contrato_atual.inadimplente do Emusys: true se ha fatura nao paga vencida.';
