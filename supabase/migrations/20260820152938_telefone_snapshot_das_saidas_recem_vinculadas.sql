-- Preencher `aluno_id` depois do fato NAO captura o telefone: o trigger
-- `capturar_telefone_snapshot_movimentacao_retencao` so age no INSERT, ou num UPDATE em que o
-- tipo ANTERIOR nao era evasao/nao_renovacao. Conservador de proposito (o snapshot e a foto do
-- contato no momento da saida), mas nas 4 linhas recem-vinculadas ele nunca rodou — ficariam sem
-- telefone para sempre, e a Pesquisa de Evasao bloquearia em 'sem_telefone' logo depois de sair
-- do 'sem_aluno'.
--
-- Aplica exatamente a MESMA regra do trigger: menor de 18 na data da movimentacao -> telefone do
-- responsavel; caso contrario whatsapp, com fallback para telefone. A procedencia fica marcada em
-- `telefone_snapshot_origem`, seguindo o padrao dos backfills anteriores
-- ('cadastro_atual_backfill_2026_07', 'cadastro_responsavel_backfill_2026_08').

update public.movimentacoes_admin m
set telefone_snapshot = v.telefone,
    telefone_snapshot_origem = v.origem
from (
  select m2.id,
         case
           when a.data_nascimento is not null
            and extract(year from age(coalesce(m2.data, current_date), a.data_nascimento))::integer < 18
             then nullif(btrim(a.responsavel_telefone), '')
           else coalesce(nullif(btrim(a.whatsapp), ''), nullif(btrim(a.telefone), ''))
         end as telefone,
         case
           when a.data_nascimento is not null
            and extract(year from age(coalesce(m2.data, current_date), a.data_nascimento))::integer < 18
             then 'cadastro_responsavel_backfill_2026_08'
           else 'cadastro_atual_backfill_2026_08'
         end as origem
  from public.movimentacoes_admin m2
  join public.alunos a on a.id = m2.aluno_id
  where m2.id in (3614, 3609, 3613, 3534)
) as v
where m.id = v.id
  and nullif(btrim(m.telefone_snapshot), '') is null
  and v.telefone is not null;
