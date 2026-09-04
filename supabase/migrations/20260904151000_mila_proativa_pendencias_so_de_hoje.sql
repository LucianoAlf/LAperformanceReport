-- Mila PROATIVA — correção depois do 1º ensaio real (Dai, fim do dia 04/09):
-- (1) `pendencias_cadastrais` vinha do backlog GLOBAL (radar_pendencias_comerciais_v1:
--     "250 sem anamnese", "64 sem ficha") — é exatamente a "coisa antiga" que o
--     Luciano mandou tirar da DM. Agora só entram pendências dos leads QUE A
--     CONSULTORA TOCOU HOJE (experimental hoje) e que ela resolve comigo em uma
--     linha: curso de interesse e canal de origem vazios.
-- (2) `fica_para_amanha` repetia os 10 de hoje (já listados em `hoje.realizadas`).
--     Janela passa a ser p_data-3 .. p_data-1: só quem é de dias anteriores.
-- (3) A manhã ganha `pendencias_de_hoje` no mesmo espírito (agendadas de hoje sem curso/canal).

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
  v_pend jsonb; v_n_pend int;
  v_u jsonb;
begin
  select * into q from governanca.quem_eh(p_solicitante_telefone);
  if q.nome is null then return jsonb_build_object('ok', false, 'motivo', 'nao_autorizado'); end if;
  v_un := q.unidade_id;
  if v_un is null then return jsonb_build_object('ok', false, 'motivo', 'sem_unidade', 'solicitante', q.nome); end if;
  select nome into v_un_nome from unidades where id = v_un;

  v_ontem_ate := p_data - 1;
  v_ontem_de  := case when extract(dow from p_data) = 1 then p_data - 2 else p_data - 1 end;

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

  select jsonb_agg(jsonb_build_object('hora', to_char(v.horario, 'HH24:MI'), 'nome', v.nome, 'telefone', v.telefone, 'lead_id', v.lead_id)
         order by v.horario), count(*)
    into v_hoje_vis, v_n_vis
  from visitas v
  where v.unidade_id = v_un and v.data = p_data and v.status = 'agendada';

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

  select jsonb_agg(jsonb_build_object(
           'sinal_id', s.id, 'quem', s.identificacao, 'leitura', s.interpretacao, 'orientacao', s.orientacao,
           'desde', to_char(s.detectado_em at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI'))
         order by s.detectado_em desc), count(*)
    into v_calor, v_n_calor
  from (select * from radar_sinais
        where unidade_id = v_un and status = 'aberto' and regra_codigo = 'R18'
          and detectado_em >= (p_data - 1)::timestamp
        order by detectado_em desc limit 5) s;

  -- pendências SÓ dos leads com experimental HOJE: o que ela resolve comigo em uma linha
  select jsonb_agg(jsonb_build_object('aluno', l.nome, 'lead_id', l.id,
           'falta', array_remove(array[case when l.curso_interesse_id is null then 'curso' end,
                                       case when j.canal_origem is null then 'canal' end], null))
         order by l.nome), count(*)
    into v_pend, v_n_pend
  from (select distinct lead_id from lead_experimentais
        where unidade_id = v_un and data_experimental = p_data and status = 'experimental_agendada' and lead_id is not null) x
  join leads l on l.id = x.lead_id
  join vw_jornada_lead_v1 j on j.lead_id = l.id
  where l.curso_interesse_id is null or j.canal_origem is null;

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
    'pendencias_de_hoje', coalesce(v_pend, '[]'::jsonb), 'n_pendencias_de_hoje', v_n_pend,
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
  v_pend jsonb; v_n_pend int; v_u jsonb;
begin
  select * into q from governanca.quem_eh(p_solicitante_telefone);
  if q.nome is null then return jsonb_build_object('ok', false, 'motivo', 'nao_autorizado'); end if;
  v_un := q.unidade_id;
  if v_un is null then return jsonb_build_object('ok', false, 'motivo', 'sem_unidade', 'solicitante', q.nome); end if;
  select nome into v_un_nome from unidades where id = v_un;
  v_amanha := case when extract(dow from p_data) = 6 then p_data + 2 else p_data + 1 end;

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

  select jsonb_agg(jsonb_build_object('aluno', a.nome, 'curso', c.nome) order by a.nome), count(*)
    into v_matr, v_n_m
  from alunos a left join cursos c on c.id = a.curso_id
  where a.unidade_id = v_un and a.data_matricula = p_data and not coalesce(a.is_segundo_curso, false);

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

  -- FICA PARA AMANHÃ: de DIAS ANTERIORES (os de hoje já estão em hoje.realizadas)
  select jsonb_agg(jsonb_build_object('aluno', coalesce(nullif(le.nome_aluno, ''), l.nome), 'lead_id', le.lead_id,
           'curso', c.nome, 'telefone', l.telefone, 'quando', to_char(le.data_experimental, 'DD/MM'))
         order by le.data_experimental desc), count(*)
    into v_fica, v_n_fica
  from (select distinct on (lead_id) * from lead_experimentais
        where unidade_id = v_un and status = 'experimental_realizada'
          and data_experimental between p_data - 3 and p_data - 1
        order by lead_id, data_experimental desc) le
  join leads l on l.id = le.lead_id
  join vw_jornada_lead_v1 j on j.lead_id = le.lead_id
  left join cursos c on c.id = le.curso_interesse_id
  where j.etapa = 'experimental_realizada' and l.motivo_nao_matricula_id is null
    and not coalesce(l.converteu, false) and not coalesce(l.arquivado, false);

  -- pendências SÓ dos leads que ela tocou HOJE (experimental hoje): curso / canal vazios
  select jsonb_agg(jsonb_build_object('aluno', l.nome, 'lead_id', l.id,
           'falta', array_remove(array[case when l.curso_interesse_id is null then 'curso' end,
                                       case when j.canal_origem is null then 'canal' end], null))
         order by l.nome), count(*)
    into v_pend, v_n_pend
  from (select distinct lead_id from lead_experimentais
        where unidade_id = v_un and data_experimental = p_data
          and status in ('experimental_realizada', 'experimental_faltou') and lead_id is not null) x
  join leads l on l.id = x.lead_id
  join vw_jornada_lead_v1 j on j.lead_id = l.id
  where l.curso_interesse_id is null or j.canal_origem is null;

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
    'pendencias_de_hoje', coalesce(v_pend, '[]'::jsonb), 'n_pendencias_de_hoje', v_n_pend,
    'programa', jsonb_build_object('competencia', v_u->>'competencia', 'estrelas_ganhas', v_u->'estrelas',
                                   'mais_perto', mila_estrela_mais_perto_v1(v_u)),
    'nada_para_hoje', (v_n_real = 0 and v_n_f = 0 and v_n_m = 0 and v_n_fica = 0 and v_n_ae = 0 and v_n_av = 0)
  );
end $$;
