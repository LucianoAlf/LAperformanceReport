-- Reparo P0/P1: classifica identidades por evidencia da API Emusys em 14/07/2026.
-- Historico resolve autoria, mas nunca reativa unidade, carteira ou notificacao.

alter table public.professores_unidades
  add column if not exists identidade_historica_valida boolean not null default false;

-- Leonardo atua somente na Barra. Campo Grande e identidade historica.
update public.professores_unidades pu
set emusys_id = 3221,
    emusys_nome = 'Leo Cabral de Castro',
    emusys_nome_normalizado = 'leo cabral de castro',
    emusys_ativo = false,
    identidade_historica_valida = true,
    updated_at = now()
from public.professores p, public.unidades u
where pu.professor_id = p.id
  and pu.unidade_id = u.id
  and p.nome_normalizado = 'LEONARDO CASTRO'
  and u.codigo = 'CG'
  and pu.validacao_status = 'ignorado'
  and pu.origem = 'validacao_humana_ignorado_p07'
  and (pu.emusys_id is null or pu.emusys_id = 3221);

insert into public.professores_sync_log (
  evento, unidade_id, professor_id, emusys_id, nome_emusys, detalhes
)
select
  'identidade_historica_revisada_20260714',
  pu.unidade_id,
  pu.professor_id,
  3221,
  'Leo Cabral de Castro',
  jsonb_build_object(
    'vinculo_operacional', false,
    'decisao_original_preservada', 'validacao_humana_ignorado_p07',
    'evidencia_nova', 'Professor atua somente na Barra; slots futuros CG sem alunos',
    'revisado_em', '2026-07-14'
  )
from public.professores_unidades pu
join public.professores p on p.id = pu.professor_id
join public.unidades u on u.id = pu.unidade_id
where p.nome_normalizado = 'LEONARDO CASTRO'
  and u.codigo = 'CG'
  and pu.emusys_id = 3221
  and pu.emusys_ativo = false
  and pu.validacao_status = 'ignorado'
  and pu.origem = 'validacao_humana_ignorado_p07'
  and not exists (
    select 1
    from public.professores_sync_log l
    where l.evento = 'identidade_historica_revisada_20260714'
      and l.unidade_id = pu.unidade_id
      and l.professor_id = pu.professor_id
      and l.emusys_id = 3221
  );

-- Vinicius nao aparece na lista atual da API do Recreio. Preserva autoria historica.
update public.professores_unidades pu
set emusys_ativo = false,
    identidade_historica_valida = true,
    updated_at = now()
from public.professores p, public.unidades u
where pu.professor_id = p.id
  and pu.unidade_id = u.id
  and p.nome_normalizado = 'VINICIUS PINHEIRO DO NASCIMENTO'
  and u.codigo = 'REC'
  and pu.emusys_id = 1392;

insert into public.professores_sync_log (
  evento, unidade_id, professor_id, emusys_id, nome_emusys, detalhes
)
select
  'identidade_historica_confirmada_20260714',
  pu.unidade_id,
  pu.professor_id,
  1392,
  p.nome,
  jsonb_build_object(
    'vinculo_operacional', false,
    'evidencia', 'ID 1392 ausente da lista atual GET /professores do Recreio',
    'revisado_em', '2026-07-14'
  )
from public.professores_unidades pu
join public.professores p on p.id = pu.professor_id
join public.unidades u on u.id = pu.unidade_id
where p.nome_normalizado = 'VINICIUS PINHEIRO DO NASCIMENTO'
  and u.codigo = 'REC'
  and pu.emusys_id = 1392
  and not exists (
    select 1 from public.professores_sync_log l
    where l.evento = 'identidade_historica_confirmada_20260714'
      and l.unidade_id = pu.unidade_id
      and l.professor_id = pu.professor_id
      and l.emusys_id = 1392
  );

-- Juliana aparece na lista atual da API de CG e possui aula futura com aluno.
update public.professores p
set ativo = true,
    updated_at = now()
from public.professores_unidades pu
join public.unidades u on u.id = pu.unidade_id
where pu.professor_id = p.id
  and p.nome_normalizado = 'JULIANA AZEVEDO TEIXEIRA BALTAZAR'
  and u.codigo = 'CG'
  and pu.emusys_id = 769;

update public.professores_unidades pu
set emusys_ativo = true,
    identidade_historica_valida = false,
    emusys_nome = 'Juliana Azevedo Teixeira Baltazar',
    emusys_nome_normalizado = 'juliana azevedo teixeira baltazar',
    last_seen_em = now(),
    updated_at = now()
from public.professores p, public.unidades u
where pu.professor_id = p.id
  and pu.unidade_id = u.id
  and p.nome_normalizado = 'JULIANA AZEVEDO TEIXEIRA BALTAZAR'
  and u.codigo = 'CG'
  and pu.emusys_id = 769;

insert into public.professores_sync_log (
  evento, unidade_id, professor_id, emusys_id, nome_emusys, detalhes
)
select
  'vinculo_operacional_confirmado_20260714',
  pu.unidade_id,
  pu.professor_id,
  769,
  p.nome,
  jsonb_build_object(
    'vinculo_operacional', true,
    'evidencia', 'ID 769 presente no GET /professores de CG e aula futura 731592 com aluno',
    'revisado_em', '2026-07-14'
  )
from public.professores_unidades pu
join public.professores p on p.id = pu.professor_id
join public.unidades u on u.id = pu.unidade_id
where p.nome_normalizado = 'JULIANA AZEVEDO TEIXEIRA BALTAZAR'
  and u.codigo = 'CG'
  and pu.emusys_id = 769
  and not exists (
    select 1 from public.professores_sync_log l
    where l.evento = 'vinculo_operacional_confirmado_20260714'
      and l.unidade_id = pu.unidade_id
      and l.professor_id = pu.professor_id
      and l.emusys_id = 769
  );

-- Corrige o ID cru de Leonardo sem depender de acentuacao na transmissao SQL.
update public.aulas_emusys ae
set emusys_professor_id = 3221
from public.unidades u
where ae.unidade_id = u.id
  and u.codigo = 'CG'
  and ae.emusys_professor_id is null
  and ae.professor_nome ilike 'L_o Cabral de Castro%';

-- Resolve autoria por (unidade, emusys_id), aceitando ativo ou historico auditado.
update public.aulas_emusys ae
set professor_id = pu.professor_id,
    sem_acompanhamento = false
from public.professores_unidades pu
join public.professores p on p.id = pu.professor_id
where ae.unidade_id = pu.unidade_id
  and ae.emusys_professor_id = pu.emusys_id
  and ae.emusys_professor_id > 0
  and (
    pu.identidade_historica_valida = true
    or (
      pu.emusys_ativo = true
      and pu.validacao_status <> 'ignorado'
      and p.ativo = true
    )
  )
  and ae.professor_id is distinct from pu.professor_id;

update public.aluno_jornada_matricula_disciplina j
set professor_id = pu.professor_id,
    updated_at = now()
from public.professores_unidades pu
join public.professores p on p.id = pu.professor_id
where j.unidade_id = pu.unidade_id
  and j.emusys_professor_id = pu.emusys_id
  and (
    pu.identidade_historica_valida = true
    or (
      pu.emusys_ativo = true
      and pu.validacao_status <> 'ignorado'
      and p.ativo = true
    )
  )
  and j.professor_id is distinct from pu.professor_id;

update public.aluno_presenca ap
set professor_id = ae.professor_id
from public.aulas_emusys ae
where ap.aula_emusys_id = ae.id
  and ae.professor_id is not null
  and ae.emusys_professor_id is not null
  and ap.professor_id is distinct from ae.professor_id;
