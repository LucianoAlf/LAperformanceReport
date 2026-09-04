-- Mila PROATIVA (passo 5): as duas RPCs canônicas que alimentam o que a Mila
-- MANDA (manhã e fim do dia) para cada consultora, escopadas pela governança.
-- Nada aqui é regra nova: lê lead_experimentais / visitas / alunos /
-- vw_jornada_lead_v1 / radar_sinais / get_estrelas_matriculador_v1 — as mesmas
-- fontes das tools de leitura da Mila. Teto de 3 tentativas (regra do Luciano,
-- 04/09) e "ontem" = último dia útil (segunda olha para sábado).
--
-- Só o que a consultora MUDA entra: R18 (calor: preso no bot / pediu preço) é
-- o único sinal do radar listado na manhã; R15/R17 já vêm como "ontem sem
-- desfecho" e "faltou sem remarcar"; R16 (parado) NÃO entra na DM (não é uma das
-- 5 situações aprovadas e foi o ruído do relatório de 03/09).

create or replace function public.mila_apelido_v1(p_nome text) returns text
language sql immutable as $$
  select coalesce(nullif(trim(substring(p_nome from '\(([^)]+)\)')), ''),
                  split_part(trim(p_nome), ' ', 1))
$$;

create or replace function public.mila_consultoras_ativas_v1()
returns table(telefone text, nome text, apelido text, unidade_id uuid, unidade_nome text)
language sql security definer set search_path = public as $$
  select a.telefone::text, a.nome::text, public.mila_apelido_v1(a.nome), a.unidade_id, u.nome::text
  from governanca.agente_usuarios a
  join public.unidades u on u.id = a.unidade_id
  where a.ativo and a.departamento = 'comercial' and a.nivel = 'colaborador' and a.unidade_id is not null
  order by u.nome
$$;

-- Estrela mais perto de ganhar, a partir do bloco de UMA unidade devolvido por
-- get_estrelas_matriculador_v1. Distância normalizada = faltam/meta.
create or replace function public.mila_estrela_mais_perto_v1(u jsonb) returns jsonb
language sql immutable as $$
  with cand(estrela, faltam, meta, ganhou, detalhe) as (values
    ('Matrícula Plus', (u->'matricula_plus'->>'faltam')::numeric, (u->'matricula_plus'->>'meta')::numeric,
       (u->'matricula_plus'->>'ganhou')::boolean, format('%s de %s matrículas', u->'matricula_plus'->>'feito', u->'matricula_plus'->>'meta')),
    ('Show-up', (u->'show_up'->>'faltam')::numeric, (u->'show_up'->>'meta')::numeric,
       (u->'show_up'->>'ganhou')::boolean, format('%s de %s (experimentais + visitas)', u->'show_up'->>'feito', u->'show_up'->>'meta')),
    ('Max Indicação', (u->'max_indicacao'->>'meta')::numeric - (u->'max_indicacao'->>'feito')::numeric, (u->'max_indicacao'->>'meta')::numeric,
       (u->'max_indicacao'->>'ganhou')::boolean, format('%s de %s por indicação/family', u->'max_indicacao'->>'feito', u->'max_indicacao'->>'meta')),
    ('Hunter 360', (u->'hunter_360'->>'faltam_anamnese')::numeric + (u->'hunter_360'->>'faltam_comunidade')::numeric, greatest((u->'hunter_360'->>'de')::numeric, 1),
       (u->'hunter_360'->>'ganhou')::boolean, format('%s anamnese(s) e %s na comunidade faltando, de %s matrículas', u->'hunter_360'->>'faltam_anamnese', u->'hunter_360'->>'faltam_comunidade', u->'hunter_360'->>'de')),
    ('Ticket Premiado', (u->'ticket_premiado'->>'alvo')::numeric - (u->'ticket_premiado'->>'ticket_medio')::numeric, (u->'ticket_premiado'->>'alvo')::numeric,
       (u->'ticket_premiado'->>'ganhou')::boolean, format('ticket médio R$ %s, alvo R$ %s', u->'ticket_premiado'->>'ticket_medio', u->'ticket_premiado'->>'alvo'))
  )
  select jsonb_build_object('estrela', estrela, 'faltam', faltam, 'detalhe', detalhe)
  from cand
  where faltam is not null and meta > 0 and faltam > 0 and not coalesce(ganhou, false)
  order by faltam / meta asc
  limit 1
$$;

create or replace function public.mila_briefing_manha_v1(
  p_solicitante_telefone text,
  p_data date default (now() at time zone 'America/Sao_Paulo')::date
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  q record;
  v_un uuid; v_un_nome text;
  v_ontem_de date; v_ontem_ate date;
  v_hoje_exp jsonb; v_n_exp int;
  v_hoje_vis jsonb; v_n_vis int;
  v_sem_desf jsonb; v_n_sd int;
  v_faltou jsonb; v_n_f int;
  v_calor jsonb; v_n_calor int;
  v_u jsonb;
begin
  select * into q from governanca.quem_eh(p_solicitante_telefone);
  if q.nome is null then return jsonb_build_object('ok', false, 'motivo', 'nao_autorizado'); end if;
  v_un := q.unidade_id;
  if v_un is null then return jsonb_build_object('ok', false, 'motivo', 'sem_unidade', 'solicitante', q.nome); end if;
  select nome into v_un_nome from unidades where id = v_un;

  v_ontem_ate := p_data - 1;
  v_ontem_de  := case when extract(dow from p_data) = 1 then p_data - 2 else p_data - 1 end;

  -- HOJE: experimentais agendadas
  select jsonb_agg(jsonb_build_object(
           'hora', to_char(le.horario_experimental, 'HH24:MI'),
           'aluno', coalesce(nullif(le.nome_aluno, ''), l.nome),
           'lead_id', le.lead_id, 'curso', c.nome, 'professor', p.nome, 'telefone', l.telefone,
           'tentativa_n', (select count(*) from lead_experimentais x where x.lead_id = le.lead_id and x.data_experimental <= le.data_experimental))
         order by le.horario_experimental), count(*)
    into v_hoje_exp, v_n_exp
  from lead_experimentais le
  left join leads l on l.id = le.lead_id
  left join cursos c on c.id = le.curso_interesse_id
  left join professores p on p.id = le.professor_experimental_id
  where le.unidade_id = v_un and le.data_experimental = p_data and le.status = 'experimental_agendada';

  -- HOJE: visitas agendadas
  select jsonb_agg(jsonb_build_object('hora', to_char(v.horario, 'HH24:MI'), 'nome', v.nome, 'telefone', v.telefone, 'lead_id', v.lead_id)
         order by v.horario), count(*)
    into v_hoje_vis, v_n_vis
  from visitas v
  where v.unidade_id = v_un and v.data = p_data and v.status = 'agendada';

  -- ONTEM: fez experimental e ainda não tem desfecho
  select jsonb_agg(jsonb_build_object(
           'aluno', coalesce(nullif(le.nome_aluno, ''), l.nome), 'lead_id', le.lead_id,
           'curso', c.nome, 'professor', p.nome, 'telefone', l.telefone,
           'quando', to_char(le.data_experimental, 'DD/MM'))
         order by le.data_experimental, le.horario_experimental), count(*)
    into v_sem_desf, v_n_sd
  from lead_experimentais le
  join leads l on l.id = le.lead_id
  join vw_jornada_lead_v1 j on j.lead_id = le.lead_id
  left join cursos c on c.id = le.curso_interesse_id
  left join professores p on p.id = le.professor_experimental_id
  where le.unidade_id = v_un and le.status = 'experimental_realizada'
    and le.data_experimental between v_ontem_de and v_ontem_ate
    and j.etapa = 'experimental_realizada'
    and l.motivo_nao_matricula_id is null
    and not coalesce(l.converteu, false) and not coalesce(l.arquivado, false);

  -- ONTEM: faltou, sem remarcação, e ainda dentro do teto de 3 tentativas
  select jsonb_agg(jsonb_build_object(
           'aluno', coalesce(nullif(le.nome_aluno, ''), l.nome), 'lead_id', le.lead_id,
           'curso', c.nome, 'telefone', l.telefone,
           'quando', to_char(le.data_experimental, 'DD/MM'),
           'tentativas', coalesce(j.aulas_experimentais, 0))
         order by le.data_experimental), count(*)
    into v_faltou, v_n_f
  from lead_experimentais le
  join leads l on l.id = le.lead_id
  join vw_jornada_lead_v1 j on j.lead_id = le.lead_id
  left join cursos c on c.id = le.curso_interesse_id
  where le.unidade_id = v_un and le.status = 'experimental_faltou'
    and le.data_experimental between v_ontem_de and v_ontem_ate
    and j.etapa = 'experimental_faltou'
    and coalesce(j.aulas_experimentais, 0) < 3
    and l.motivo_nao_matricula_id is null
    and not coalesce(l.converteu, false) and not coalesce(l.arquivado, false);

  -- CALOR (R18): quem está quente agora — preso no bot, pediu preço, quer agendar
  select jsonb_agg(jsonb_build_object(
           'sinal_id', s.id, 'quem', s.identificacao, 'leitura', s.interpretacao, 'orientacao', s.orientacao,
           'desde', to_char(s.detectado_em at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI'))
         order by s.detectado_em desc), count(*)
    into v_calor, v_n_calor
  from (select * from radar_sinais
        where unidade_id = v_un and status = 'aberto' and regra_codigo = 'R18'
          and detectado_em >= (p_data - 1)::timestamp
        order by detectado_em desc limit 5) s;

  v_u := coalesce(get_estrelas_matriculador_v1(p_solicitante_telefone,
                    extract(year from p_data)::int, extract(month from p_data)::int)->'unidades'->0, '{}'::jsonb);

  return jsonb_build_object(
    'ok', true, 'tipo', 'manha',
    'data', to_char(p_data, 'DD/MM/YYYY'), 'dow', extract(dow from p_data)::int,
    'consultora', jsonb_build_object('nome', q.nome, 'apelido', mila_apelido_v1(q.nome), 'unidade', v_un_nome),
    'hoje', jsonb_build_object('experimentais', coalesce(v_hoje_exp, '[]'::jsonb), 'n_experimentais', v_n_exp,
                               'visitas', coalesce(v_hoje_vis, '[]'::jsonb), 'n_visitas', v_n_vis),
    'ontem', jsonb_build_object('de', to_char(v_ontem_de, 'DD/MM'), 'ate', to_char(v_ontem_ate, 'DD/MM'),
                                'sem_desfecho', coalesce(v_sem_desf, '[]'::jsonb), 'n_sem_desfecho', v_n_sd,
                                'faltou_sem_remarcar', coalesce(v_faltou, '[]'::jsonb), 'n_faltou', v_n_f),
    'quentes_agora', coalesce(v_calor, '[]'::jsonb), 'n_quentes', v_n_calor,
    'programa', jsonb_build_object('competencia', v_u->>'competencia', 'estrelas_ganhas', v_u->'estrelas',
                                   'mais_perto', mila_estrela_mais_perto_v1(v_u)),
    'nada_para_hoje', (v_n_exp = 0 and v_n_vis = 0 and v_n_sd = 0 and v_n_f = 0 and v_n_calor = 0)
  );
end $$;

create or replace function public.mila_fechamento_dia_v1(
  p_solicitante_telefone text,
  p_data date default (now() at time zone 'America/Sao_Paulo')::date
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  q record;
  v_un uuid; v_un_nome text; v_amanha date;
  v_real jsonb; v_n_real int;
  v_faltou jsonb; v_n_f int;
  v_n_canc int;
  v_matr jsonb; v_n_m int;
  v_am_exp jsonb; v_n_ae int;
  v_am_vis jsonb; v_n_av int;
  v_fica jsonb; v_n_fica int;
  v_pend jsonb; v_u jsonb;
begin
  select * into q from governanca.quem_eh(p_solicitante_telefone);
  if q.nome is null then return jsonb_build_object('ok', false, 'motivo', 'nao_autorizado'); end if;
  v_un := q.unidade_id;
  if v_un is null then return jsonb_build_object('ok', false, 'motivo', 'sem_unidade', 'solicitante', q.nome); end if;
  select nome into v_un_nome from unidades where id = v_un;
  v_amanha := case when extract(dow from p_data) = 6 then p_data + 2 else p_data + 1 end;

  -- HOJE: experimentais realizadas e o desfecho de cada uma
  select jsonb_agg(jsonb_build_object(
           'hora', to_char(le.horario_experimental, 'HH24:MI'),
           'aluno', coalesce(nullif(le.nome_aluno, ''), l.nome), 'lead_id', le.lead_id,
           'curso', c.nome, 'professor', p.nome, 'telefone', l.telefone,
           'desfecho', case when coalesce(l.converteu, false) then 'matriculou'
                            when l.motivo_nao_matricula_id is not null then 'perdido'
                            when j.etapa = 'experimental_agendada' then 'remarcou'
                            else 'sem_desfecho' end)
         order by le.horario_experimental), count(*)
    into v_real, v_n_real
  from lead_experimentais le
  join leads l on l.id = le.lead_id
  join vw_jornada_lead_v1 j on j.lead_id = le.lead_id
  left join cursos c on c.id = le.curso_interesse_id
  left join professores p on p.id = le.professor_experimental_id
  where le.unidade_id = v_un and le.data_experimental = p_data and le.status = 'experimental_realizada';

  -- HOJE: faltou (remarcada? teto atingido?)
  select jsonb_agg(jsonb_build_object(
           'hora', to_char(le.horario_experimental, 'HH24:MI'),
           'aluno', coalesce(nullif(le.nome_aluno, ''), l.nome), 'lead_id', le.lead_id,
           'curso', c.nome, 'telefone', l.telefone,
           'remarcada', (j.etapa = 'experimental_agendada'),
           'tentativas', coalesce(j.aulas_experimentais, 0),
           'teto_atingido', coalesce(j.aulas_experimentais, 0) >= 3)
         order by le.horario_experimental), count(*)
    into v_faltou, v_n_f
  from lead_experimentais le
  join leads l on l.id = le.lead_id
  join vw_jornada_lead_v1 j on j.lead_id = le.lead_id
  left join cursos c on c.id = le.curso_interesse_id
  where le.unidade_id = v_un and le.data_experimental = p_data and le.status = 'experimental_faltou'
    and not coalesce(l.converteu, false);

  select count(*) into v_n_canc from lead_experimentais
   where unidade_id = v_un and data_experimental = p_data and status = 'cancelada';

  -- HOJE: matrículas (pessoa, não 2º curso)
  select jsonb_agg(jsonb_build_object('aluno', a.nome, 'curso', c.nome) order by a.nome), count(*)
    into v_matr, v_n_m
  from alunos a left join cursos c on c.id = a.curso_id
  where a.unidade_id = v_un and a.data_matricula = p_data and not coalesce(a.is_segundo_curso, false);

  -- AMANHÃ (próximo dia útil): experimentais e visitas já marcadas
  select jsonb_agg(jsonb_build_object('hora', to_char(le.horario_experimental, 'HH24:MI'),
           'aluno', coalesce(nullif(le.nome_aluno, ''), l.nome), 'lead_id', le.lead_id, 'curso', c.nome, 'professor', p.nome)
         order by le.horario_experimental), count(*)
    into v_am_exp, v_n_ae
  from lead_experimentais le
  left join leads l on l.id = le.lead_id
  left join cursos c on c.id = le.curso_interesse_id
  left join professores p on p.id = le.professor_experimental_id
  where le.unidade_id = v_un and le.data_experimental = v_amanha and le.status = 'experimental_agendada';

  select jsonb_agg(jsonb_build_object('hora', to_char(v.horario, 'HH24:MI'), 'nome', v.nome, 'lead_id', v.lead_id) order by v.horario), count(*)
    into v_am_vis, v_n_av
  from visitas v where v.unidade_id = v_un and v.data = v_amanha and v.status = 'agendada';

  -- FICA PARA AMANHÃ: fez experimental nos últimos 3 dias e segue sem desfecho
  select jsonb_agg(jsonb_build_object('aluno', coalesce(nullif(le.nome_aluno, ''), l.nome), 'lead_id', le.lead_id,
           'curso', c.nome, 'telefone', l.telefone, 'quando', to_char(le.data_experimental, 'DD/MM'))
         order by le.data_experimental desc), count(*)
    into v_fica, v_n_fica
  from (select distinct on (lead_id) * from lead_experimentais
        where unidade_id = v_un and status = 'experimental_realizada'
          and data_experimental between p_data - 3 and p_data
        order by lead_id, data_experimental desc) le
  join leads l on l.id = le.lead_id
  join vw_jornada_lead_v1 j on j.lead_id = le.lead_id
  left join cursos c on c.id = le.curso_interesse_id
  where j.etapa = 'experimental_realizada' and l.motivo_nao_matricula_id is null
    and not coalesce(l.converteu, false) and not coalesce(l.arquivado, false);

  v_pend := radar_pendencias_comerciais_v1(p_solicitante_telefone, 5);
  v_u := coalesce(get_estrelas_matriculador_v1(p_solicitante_telefone,
                    extract(year from p_data)::int, extract(month from p_data)::int)->'unidades'->0, '{}'::jsonb);

  return jsonb_build_object(
    'ok', true, 'tipo', 'fim_do_dia',
    'data', to_char(p_data, 'DD/MM/YYYY'), 'dow', extract(dow from p_data)::int,
    'consultora', jsonb_build_object('nome', q.nome, 'apelido', mila_apelido_v1(q.nome), 'unidade', v_un_nome),
    'hoje', jsonb_build_object('realizadas', coalesce(v_real, '[]'::jsonb), 'n_realizadas', v_n_real,
                               'faltou', coalesce(v_faltou, '[]'::jsonb), 'n_faltou', v_n_f,
                               'n_canceladas', v_n_canc,
                               'matriculas', coalesce(v_matr, '[]'::jsonb), 'n_matriculas', v_n_m),
    'fica_para_amanha', coalesce(v_fica, '[]'::jsonb), 'n_fica_para_amanha', v_n_fica,
    'amanha', jsonb_build_object('data', to_char(v_amanha, 'DD/MM'),
                                 'experimentais', coalesce(v_am_exp, '[]'::jsonb), 'n_experimentais', v_n_ae,
                                 'visitas', coalesce(v_am_vis, '[]'::jsonb), 'n_visitas', v_n_av),
    'pendencias_cadastrais', v_pend,
    'programa', jsonb_build_object('competencia', v_u->>'competencia', 'estrelas_ganhas', v_u->'estrelas',
                                   'mais_perto', mila_estrela_mais_perto_v1(v_u)),
    'nada_para_hoje', (v_n_real = 0 and v_n_f = 0 and v_n_m = 0 and v_n_fica = 0 and v_n_ae = 0 and v_n_av = 0)
  );
end $$;

-- ACL: mesmo padrão das outras RPCs da Mila (nunca anon/authenticated)
revoke all on function public.mila_apelido_v1(text) from public, anon, authenticated;
revoke all on function public.mila_estrela_mais_perto_v1(jsonb) from public, anon, authenticated;
revoke all on function public.mila_consultoras_ativas_v1() from public, anon, authenticated;
revoke all on function public.mila_briefing_manha_v1(text, date) from public, anon, authenticated;
revoke all on function public.mila_fechamento_dia_v1(text, date) from public, anon, authenticated;
grant execute on function public.mila_apelido_v1(text) to service_role, mila_acesso_restrito;
grant execute on function public.mila_estrela_mais_perto_v1(jsonb) to service_role, mila_acesso_restrito;
grant execute on function public.mila_consultoras_ativas_v1() to service_role, mila_acesso_restrito;
grant execute on function public.mila_briefing_manha_v1(text, date) to service_role, mila_acesso_restrito;
grant execute on function public.mila_fechamento_dia_v1(text, date) to service_role, mila_acesso_restrito;
