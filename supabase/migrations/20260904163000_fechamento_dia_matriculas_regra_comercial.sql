-- O fechamento do dia contava `alunos` do dia sem regra nenhuma — diria "3
-- matriculas hoje" incluindo 2o curso e bolsista, o mesmo erro das estrelas.
-- Passa a usar matriculas_comerciais_v1 (20260904160000).
--
-- No MESMO dia o passaporte quase sempre ainda nao foi pago/sincronizado
-- (emusys_faturas roda 3x/dia). Por isso aqui a lista NAO esconde quem esta sem
-- passaporte: mostra `conta_para_o_programa` e `aguardando_passaporte` lado a
-- lado. Esconder faria a Mila anunciar "nenhuma matricula hoje" num dia que teve.
do $do$
declare v_def text; n int;
  v_ant text := $a$  select jsonb_agg(jsonb_build_object('aluno', a.nome, 'curso', c.nome) order by a.nome), count(*)
    into v_matr, v_n_m
  from alunos a left join cursos c on c.id = a.curso_id
  where a.unidade_id = v_un and a.data_matricula = p_data and not coalesce(a.is_segundo_curso, false);$a$;
  v_novo text := $b$  select jsonb_agg(jsonb_build_object('aluno', m.nome, 'curso', m.curso, 'tipo', m.tipo_matricula,
                          'conta_para_o_programa', m.conta,
                          'aguardando_passaporte', (m.motivo_fora = 'sem_passaporte_pago'),
                          'fora_porque', m.motivo_fora) order by m.nome),
         count(*) filter (where m.conta)
    into v_matr, v_n_m
  from public.matriculas_comerciais_v1(v_un, p_data, p_data + 1) m;$b$;
begin
  select pg_get_functiondef('public.mila_fechamento_dia_v1(text, date)'::regprocedure) into v_def;
  n := (length(v_def) - length(replace(v_def, v_ant, ''))) / length(v_ant);
  if n <> 1 then raise exception 'ancora matriculas do dia: % (esperado 1)', n; end if;
  v_def := replace(v_def, v_ant, v_novo);

  n := (length(v_def) - length(replace(v_def, $c$'matriculas', coalesce(v_matr, '[]'::jsonb), 'n_matriculas', v_n_m)$c$, ''))) / length($c$'matriculas', coalesce(v_matr, '[]'::jsonb), 'n_matriculas', v_n_m)$c$);
  if n <> 1 then raise exception 'ancora retorno matriculas: % (esperado 1)', n; end if;
  v_def := replace(v_def,
    $c$'matriculas', coalesce(v_matr, '[]'::jsonb), 'n_matriculas', v_n_m)$c$,
    $d$'matriculas', coalesce(v_matr, '[]'::jsonb), 'n_matriculas', v_n_m,
                               'nota_matriculas', 'n_matriculas ja aplica a regra do comercial (sem 2o curso, bolsista, banda e sem passaporte pago). No mesmo dia o passaporte costuma nao estar sincronizado ainda — por isso a lista traz aguardando_passaporte.')$d$);
  execute v_def;
end $do$;
