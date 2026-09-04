-- Agenda, fechamento do dia e SHOW-UP passam a ler vw_experimental_situacao_v1.
-- Efeito imediato no que a consultora recebe: no Recreio de 04/09 a lista caiu
-- de 11 para 9 (as 2 reagendadas saem do dia e aparecem em
-- `reagendadas_para_outro_dia` com a data nova) e aula que ainda nao ocorreu
-- deixa de sair como "realizada". Show-up de ago: REC 61->58, BAR 34->33.
--
-- Sem isso o show-up conta experimental REAGENDADA (a linha antiga fica
-- 'experimental_realizada') e a mesma experimental chega a ser contada duas
-- vezes: Bento Lima tinha linha em 04/09 'realizada' e outra em 10/09
-- 'agendada', ambas da mesma aula.
do $do$
declare v_def text; n int;
  a1 text := $a$  select jsonb_agg(jsonb_build_object(
           'hora', to_char(le.horario_experimental, 'HH24:MI'),
           'aluno', coalesce(nullif(le.nome_aluno, ''), l.nome),
           'lead_id', le.lead_id, 'curso', c.nome, 'professor', p.nome, 'telefone', l.telefone,
           'situacao', case le.status when 'experimental_agendada' then 'agendada'
                                      when 'experimental_realizada' then 'realizada'
                                      when 'experimental_faltou' then 'faltou'
                                      when 'cancelada' then 'cancelada' else le.status end,
           'tentativa_n', (select count(*) from lead_experimentais x where x.lead_id = le.lead_id and x.data_experimental <= le.data_experimental))
         order by le.horario_experimental), count(*),
         count(*) filter (where le.status = 'experimental_agendada')
    into v_hoje_exp, v_n_exp, v_n_exp_agendadas
  from lead_experimentais le
  left join leads l on l.id = le.lead_id
  left join cursos c on c.id = le.curso_interesse_id
  left join professores p on p.id = le.professor_experimental_id
  where le.unidade_id = v_un and le.data_experimental = p_data;$a$;
  b1 text := $b$  select jsonb_agg(jsonb_build_object(
           'hora', to_char(le.horario_experimental, 'HH24:MI'),
           'aluno', coalesce(nullif(le.nome_aluno, ''), l.nome),
           'lead_id', le.lead_id, 'curso', c.nome, 'professor', p.nome, 'telefone', l.telefone,
           'situacao', le.situacao,
           'tentativa_n', (select count(*) from lead_experimentais x where x.lead_id = le.lead_id and x.data_experimental <= le.data_experimental))
         order by le.horario_experimental) filter (where le.situacao <> 'reagendada'),
         count(*) filter (where le.situacao <> 'reagendada'),
         count(*) filter (where le.situacao = 'agendada')
    into v_hoje_exp, v_n_exp, v_n_exp_agendadas
  from vw_experimental_situacao_v1 le
  left join leads l on l.id = le.lead_id
  left join cursos c on c.id = le.curso_interesse_id
  left join professores p on p.id = le.professor_experimental_id
  where le.unidade_id = v_un and le.data_experimental = p_data;

  select jsonb_agg(jsonb_build_object('hora', to_char(le.horario_experimental,'HH24:MI'),
           'aluno', coalesce(nullif(le.nome_aluno,''), l.nome), 'lead_id', le.lead_id,
           'foi_para', to_char(le.reagendada_para, 'DD/MM')) order by le.horario_experimental)
    into v_reagendadas
  from vw_experimental_situacao_v1 le left join leads l on l.id = le.lead_id
  where le.unidade_id = v_un and le.data_experimental = p_data and le.situacao = 'reagendada';$b$;
  a2 text := $c$  v_hoje_exp jsonb; v_n_exp int; v_n_exp_agendadas int;$c$;
  b2 text := $d$  v_hoje_exp jsonb; v_n_exp int; v_n_exp_agendadas int; v_reagendadas jsonb;$d$;
  a3 text := $e$                               'n_experimentais_ainda_agendadas', v_n_exp_agendadas,$e$;
  b3 text := $f$                               'n_experimentais_ainda_agendadas', v_n_exp_agendadas,
                               'reagendadas_para_outro_dia', coalesce(v_reagendadas, '[]'::jsonb),$f$;
  a4 text := $g$  from lead_experimentais le
  join leads l on l.id = le.lead_id
  join vw_jornada_lead_v1 j on j.lead_id = le.lead_id
  left join cursos c on c.id = le.curso_interesse_id
  left join professores p on p.id = le.professor_experimental_id
  where le.unidade_id = v_un and le.data_experimental = p_data and le.status = 'experimental_realizada';$g$;
  b4 text := $h$  from vw_experimental_situacao_v1 le
  join leads l on l.id = le.lead_id
  join vw_jornada_lead_v1 j on j.lead_id = le.lead_id
  left join cursos c on c.id = le.curso_interesse_id
  left join professores p on p.id = le.professor_experimental_id
  where le.unidade_id = v_un and le.data_experimental = p_data and le.situacao = 'realizada';$h$;
  a5 text := $i$  from lead_experimentais le
  join leads l on l.id = le.lead_id
  join vw_jornada_lead_v1 j on j.lead_id = le.lead_id
  left join cursos c on c.id = le.curso_interesse_id
  where le.unidade_id = v_un and le.data_experimental = p_data and le.status = 'experimental_faltou'
    and not coalesce(l.converteu, false);$i$;
  b5 text := $j$  from vw_experimental_situacao_v1 le
  join leads l on l.id = le.lead_id
  join vw_jornada_lead_v1 j on j.lead_id = le.lead_id
  left join cursos c on c.id = le.curso_interesse_id
  where le.unidade_id = v_un and le.data_experimental = p_data and le.situacao = 'faltou'
    and not coalesce(l.converteu, false);$j$;
  a6 text := $k$  select count(*) into v_n_canc from lead_experimentais
   where unidade_id = v_un and data_experimental = p_data and status = 'cancelada';$k$;
  b6 text := $l$  select count(*) into v_n_canc from vw_experimental_situacao_v1
   where unidade_id = v_un and data_experimental = p_data and situacao = 'cancelada';$l$;
  a7 text := $m$        (select count(*) from public.lead_experimentais le
          where le.unidade_id = c.unidade_id and le.status in ('experimental_realizada','convertido')
            and le.data_experimental >= v_de and le.data_experimental < v_ate_ef) exp_realizadas,$m$;
  b7 text := $n$        (select count(*) from public.vw_experimental_situacao_v1 le
          where le.unidade_id = c.unidade_id
            and (le.situacao = 'realizada' or le.status_gravado = 'convertido')
            and le.data_experimental >= v_de and le.data_experimental < v_ate_ef) exp_realizadas,$n$;
begin
  select pg_get_functiondef('public.mila_briefing_manha_v1(text, date)'::regprocedure) into v_def;
  n := (length(v_def) - length(replace(v_def, a1, ''))) / length(a1);
  if n <> 1 then raise exception 'ancora exp manha: %', n; end if;
  v_def := replace(v_def, a1, b1);
  n := (length(v_def) - length(replace(v_def, a2, ''))) / length(a2);
  if n <> 1 then raise exception 'ancora declare manha: %', n; end if;
  v_def := replace(v_def, a2, b2);
  n := (length(v_def) - length(replace(v_def, a3, ''))) / length(a3);
  if n <> 1 then raise exception 'ancora retorno manha: %', n; end if;
  execute replace(v_def, a3, b3);

  select pg_get_functiondef('public.mila_fechamento_dia_v1(text, date)'::regprocedure) into v_def;
  n := (length(v_def) - length(replace(v_def, a4, ''))) / length(a4);
  if n <> 1 then raise exception 'ancora realizadas: %', n; end if;
  v_def := replace(v_def, a4, b4);
  n := (length(v_def) - length(replace(v_def, a5, ''))) / length(a5);
  if n <> 1 then raise exception 'ancora faltou: %', n; end if;
  v_def := replace(v_def, a5, b5);
  n := (length(v_def) - length(replace(v_def, a6, ''))) / length(a6);
  if n <> 1 then raise exception 'ancora canceladas: %', n; end if;
  execute replace(v_def, a6, b6);

  select pg_get_functiondef('public.get_estrelas_matriculador_v1(text,int,int)'::regprocedure) into v_def;
  n := (length(v_def) - length(replace(v_def, a7, ''))) / length(a7);
  if n <> 1 then raise exception 'ancora show-up: %', n; end if;
  execute replace(v_def, a7, b7);
end $do$;
