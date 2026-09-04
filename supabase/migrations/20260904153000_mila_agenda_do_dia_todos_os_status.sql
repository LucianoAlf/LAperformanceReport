-- "Quais as experimentais de hoje?" tem que devolver TODAS as do dia, com o
-- status de cada uma — nao so as ainda `experimental_agendada`. Medido em
-- 04/09: a Dai perguntou as 15:23, as 11 do Recreio ja estavam
-- realizada/faltou/cancelada, a agenda respondeu ZERO e a Mila caiu na pauta
-- (respondeu lead sem desfecho no lugar da agenda). O dia anda; o status muda
-- ao longo dele; a pergunta e sobre o DIA, nao sobre o que falta acontecer.
do $do$
declare
  v_def text;
  v_ant text := $a$  select jsonb_agg(jsonb_build_object(
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
  where le.unidade_id = v_un and le.data_experimental = p_data and le.status = 'experimental_agendada';$a$;
  v_novo text := $b$  select jsonb_agg(jsonb_build_object(
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
  where le.unidade_id = v_un and le.data_experimental = p_data;$b$;
  v_decl_ant text := $c$  v_hoje_exp jsonb; v_n_exp int;$c$;
  v_decl_novo text := $c2$  v_hoje_exp jsonb; v_n_exp int; v_n_exp_agendadas int;$c2$;
  v_ret_ant text := $d$    'hoje', jsonb_build_object('experimentais', coalesce(v_hoje_exp, '[]'::jsonb), 'n_experimentais', v_n_exp,$d$;
  v_ret_novo text := $d2$    'hoje', jsonb_build_object('experimentais', coalesce(v_hoje_exp, '[]'::jsonb), 'n_experimentais', v_n_exp,
                               'n_experimentais_ainda_agendadas', v_n_exp_agendadas,$d2$;
  n int;
begin
  select pg_get_functiondef('public.mila_briefing_manha_v1(text, date)'::regprocedure) into v_def;
  n := (length(v_def) - length(replace(v_def, v_ant, ''))) / length(v_ant);
  if n <> 1 then raise exception 'ancora do bloco experimentais: % (esperado 1)', n; end if;
  n := (length(v_def) - length(replace(v_def, v_decl_ant, ''))) / length(v_decl_ant);
  if n <> 1 then raise exception 'ancora da declaracao: % (esperado 1)', n; end if;
  n := (length(v_def) - length(replace(v_def, v_ret_ant, ''))) / length(v_ret_ant);
  if n <> 1 then raise exception 'ancora do retorno: % (esperado 1)', n; end if;
  v_def := replace(v_def, v_ant, v_novo);
  v_def := replace(v_def, v_decl_ant, v_decl_novo);
  v_def := replace(v_def, v_ret_ant, v_ret_novo);
  execute v_def;
end $do$;
