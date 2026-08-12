-- O sync-matriculas-emusys passou a emitir data_nascimento_divergente, mas o
-- contrato da tabela ainda enumerava apenas os tipos anteriores. O POST era
-- rejeitado pelo CHECK e a divergencia sumia da fila de conciliacao.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table public.alunos_emusys_atributos_divergencias
  drop constraint if exists alunos_emusys_atributos_divergencias_tipo_divergencia_check;

alter table public.alunos_emusys_atributos_divergencias
  add constraint alunos_emusys_atributos_divergencias_tipo_divergencia_check
  check (tipo_divergencia in (
    'foto_ausente',
    'instagram_ausente',
    'instagram_divergente',
    'contato_divergente',
    'responsavel_divergente',
    'status_financeiro_divergente',
    'forma_pagamento_divergente',
    'anamnese_pendente',
    'contrato_assinatura_pendente',
    'aguardando_renovacao_divergente',
    'data_nascimento_divergente'
  )) not valid;

alter table public.alunos_emusys_atributos_divergencias
  validate constraint alunos_emusys_atributos_divergencias_tipo_divergencia_check;

commit;
