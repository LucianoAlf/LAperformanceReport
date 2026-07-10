create or replace function auth.uid()
returns uuid language sql stable as $$
  select '11111111-1111-1111-1111-111111111111'::uuid
$$;

create or replace function public.usuario_tem_permissao(
  p_usuario_id integer,
  p_codigo_permissao varchar,
  p_unidade_id uuid default null
)
returns boolean language sql stable as $$ select true $$;

insert into public.unidades (id, nome)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Teste'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Teste 2');

insert into public.usuarios (id, auth_user_id, ativo, perfil)
overriding system value
values (1, auth.uid(), true, 'admin');

insert into public.professores (id, nome, usuario_id, ativo)
overriding system value
values (1, 'Professor Teste', 1, true);

insert into public.alunos (id, nome)
overriding system value
values (1, 'Aluno Presente'), (2, 'Aluno Ausente');

insert into public.professores_unidades (
  id, professor_id, unidade_id, disponibilidade, emusys_id, validacao_status, payload_emusys, origem
)
overriding system value
values (
  1,
  1,
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '{"Segunda":{"inicio":"10:00","fim":"18:00"}}',
  999,
  'validado_humano',
  '{"preservar":true}',
  'emusys'
);

do $$
declare
  v_aula integer;
  v_resultado jsonb;
begin
  insert into public.aulas_emusys (
    emusys_id, unidade_id, data_aula, data_hora_inicio, data_hora_fim,
    duracao_minutos, tipo, curso_nome, professor_id, cancelada
  ) values (
    1001,
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    current_date,
    now() - interval '30 minutes',
    now() + interval '20 minutes',
    50,
    'turma',
    'Teste',
    1,
    false
  ) returning id into v_aula;

  insert into public.aula_alunos_emusys (
    aula_emusys_id, unidade_id, aluno_chave, aluno_id, aluno_nome, aluno_nome_normalizado
  ) values
    (v_aula, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'local:1', 1, 'Aluno Presente', 'aluno presente'),
    (v_aula, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'local:2', 2, 'Aluno Ausente', 'aluno ausente');

  v_resultado := public.app_registrar_presencas_aula(v_aula, array[2]);
  if (v_resultado ->> 'inseridos')::integer <> 2 then
    raise exception 'Primeira chamada deveria inserir duas presencas: %', v_resultado;
  end if;

  if not exists (
    select 1 from public.aluno_presenca
    where aula_emusys_id = v_aula and aluno_id = 1
      and status = 'presente' and status_presenca = 'presente'
      and respondido_por = 'professor_la_teacher'
  ) then
    raise exception 'Aluno presente nao foi gravado corretamente';
  end if;

  if not exists (
    select 1 from public.aluno_presenca
    where aula_emusys_id = v_aula and aluno_id = 2
      and status = 'ausente' and status_presenca = 'falta'
  ) then
    raise exception 'Aluno ausente nao foi gravado corretamente';
  end if;

  v_resultado := public.app_registrar_presencas_aula(v_aula, array[1]);
  if (v_resultado ->> 'inseridos')::integer <> 0 then
    raise exception 'Segunda chamada deveria respeitar first-write-wins: %', v_resultado;
  end if;

  if not exists (
    select 1 from public.aluno_presenca
    where aula_emusys_id = v_aula and aluno_id = 1 and status_presenca = 'presente'
  ) then
    raise exception 'Segunda chamada sobrescreveu a primeira';
  end if;
end $$;

do $$
declare
  v_ancora integer;
  v_individual_1 integer;
  v_individual_2 integer;
  v_minutos integer;
  v_aulas_creditadas integer;
begin
  insert into public.aulas_emusys (
    emusys_id, unidade_id, data_aula, data_hora_inicio, data_hora_fim,
    duracao_minutos, tipo, curso_nome, professor_id, cancelada
  ) values
    (1301, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', current_date - 3, (current_date - 3) + time '10:00', (current_date - 3) + time '10:50', 50, 'turma', 'Teste', 1, false),
    (1302, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', current_date - 3, (current_date - 3) + time '10:00', (current_date - 3) + time '10:50', 50, 'individual', 'Teste', 1, false),
    (1303, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', current_date - 3, (current_date - 3) + time '10:00', (current_date - 3) + time '10:50', 50, 'individual', 'Teste', 1, false);

  select id into v_ancora from public.aulas_emusys where emusys_id = 1301;
  select id into v_individual_1 from public.aulas_emusys where emusys_id = 1302;
  select id into v_individual_2 from public.aulas_emusys where emusys_id = 1303;

  insert into public.aluno_presenca (
    aluno_id, professor_id, unidade_id, data_aula, status, status_presenca, aula_emusys_id
  ) values
    (1, 1, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', current_date - 3, 'presente', 'presente', v_ancora),
    (1, 1, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', current_date - 3, 'presente', 'presente', v_individual_1),
    (2, 1, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', current_date - 3, 'presente', 'presente', v_individual_2);

  select minutos_creditados, aulas_creditadas
  into v_minutos, v_aulas_creditadas
  from public.vw_ponto_professor_diario
  where professor_id = 1 and data_aula = current_date - 3;

  if v_minutos <> 50 or v_aulas_creditadas <> 1 then
    raise exception 'Slot paralelo deveria creditar 50 minutos uma vez, obtido % em % aulas',
      v_minutos, v_aulas_creditadas;
  end if;
end $$;

do $$
declare
  v_individual integer;
begin
  insert into public.aulas_emusys (
    emusys_id, unidade_id, data_aula, data_hora_inicio, data_hora_fim,
    duracao_minutos, tipo, curso_nome, professor_id, cancelada
  ) values (
    1401,
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    current_date,
    now() - interval '20 minutes',
    now() + interval '30 minutes',
    50,
    'individual',
    'Teste',
    1,
    false
  ) returning id into v_individual;

  insert into public.aula_alunos_emusys (
    aula_emusys_id, unidade_id, aluno_chave, aluno_id, aluno_nome, aluno_nome_normalizado
  ) values (
    v_individual,
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'local:1',
    1,
    'Aluno Presente',
    'aluno presente'
  );

  begin
    perform public.app_registrar_presencas_aula(v_individual, '{}'::integer[]);
    raise exception 'Chamada em aula individual deveria ser rejeitada';
  exception
    when others then
      if sqlerrm <> 'chamada_somente_na_aula_ancora' then
        raise;
      end if;
  end;
end $$;

do $$
declare
  v_aula_13 integer;
  v_aula_14 integer;
  v_aula_15 integer;
  v_aula_16 integer;
  v_aula_unica integer;
  v_minutos integer;
begin
  insert into public.aulas_emusys (
    emusys_id, unidade_id, data_aula, data_hora_inicio, data_hora_fim,
    duracao_minutos, tipo, curso_nome, professor_id, cancelada
  ) values
    (1100, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', current_date - 1, (current_date - 1) + time '13:00', (current_date - 1) + time '13:50', 50, 'individual', 'Teste', 1, false),
    (1101, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', current_date - 1, (current_date - 1) + time '14:00', (current_date - 1) + time '14:50', 50, 'individual', 'Teste', 1, false),
    (1102, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', current_date - 1, (current_date - 1) + time '15:00', (current_date - 1) + time '15:50', 50, 'individual', 'Teste', 1, false),
    (1104, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', current_date - 1, (current_date - 1) + time '15:30', (current_date - 1) + time '16:00', 30, 'individual', 'Teste', 1, false),
    (1103, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', current_date - 1, (current_date - 1) + time '16:00', (current_date - 1) + time '16:50', 50, 'individual', 'Teste', 1, false);

  select id into v_aula_13 from public.aulas_emusys where emusys_id = 1100;
  select id into v_aula_14 from public.aulas_emusys where emusys_id = 1101;
  select id into v_aula_15 from public.aulas_emusys where emusys_id = 1102;
  select id into v_aula_16 from public.aulas_emusys where emusys_id = 1103;

  insert into public.aluno_presenca (
    aluno_id, professor_id, unidade_id, data_aula, status, status_presenca, aula_emusys_id
  ) values
    (1, 1, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', current_date - 1, 'ausente', 'falta', v_aula_13),
    (1, 1, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', current_date - 1, 'presente', 'presente', v_aula_14),
    (1, 1, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', current_date - 1, 'ausente', 'falta', v_aula_15),
    (1, 1, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', current_date - 1, 'presente', 'presente', v_aula_16);

  select minutos_creditados into v_minutos
  from public.vw_ponto_professor_diario
  where professor_id = 1 and data_aula = current_date - 1;

  if v_minutos <> 180 then
    raise exception 'Ponto cercado multiunidade esperado 180 minutos, obtido %', v_minutos;
  end if;

  if (
    select count(*) from public.vw_ponto_professor_diario
    where professor_id = 1 and data_aula = current_date - 1
  ) <> 1 or (
    select cardinality(unidades_ids) from public.vw_ponto_professor_diario
    where professor_id = 1 and data_aula = current_date - 1
  ) <> 2 then
    raise exception 'Ponto diario nao consolidou as duas unidades';
  end if;

  insert into public.professor_ponto_confirmacoes (
    professor_id, aula_emusys_id, unidade_id, data_aula, estava_presente
  ) values (
    1, v_aula_13, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', current_date - 1, true
  );

  select minutos_creditados into v_minutos
  from public.vw_ponto_professor_diario
  where professor_id = 1 and data_aula = current_date - 1;

  if v_minutos <> 230 then
    raise exception 'Ponta confirmada deveria ampliar ponto para 230 minutos, obtido %', v_minutos;
  end if;

  insert into public.aulas_emusys (
    emusys_id, unidade_id, data_aula, data_hora_inicio, data_hora_fim,
    duracao_minutos, tipo, curso_nome, professor_id, cancelada
  ) values (
    1201, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', current_date - 2,
    (current_date - 2) + time '15:00', (current_date - 2) + time '15:50',
    50, 'individual', 'Teste', 1, false
  ) returning id into v_aula_unica;

  insert into public.aluno_presenca (
    aluno_id, professor_id, unidade_id, data_aula, status, status_presenca, aula_emusys_id
  ) values (
    1, 1, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', current_date - 2,
    'presente', 'presente', v_aula_unica
  );

  select minutos_creditados into v_minutos
  from public.vw_ponto_professor_diario
  where professor_id = 1 and data_aula = current_date - 2;

  if v_minutos <> 50 then
    raise exception 'Aula unica deveria creditar 50 minutos, obtido %', v_minutos;
  end if;
end $$;

do $$
declare
  v_presenca uuid;
begin
  select id into v_presenca
  from public.aluno_presenca
  where aluno_id = 2
  order by created_at nulls last
  limit 1;

  perform public.admin_corrigir_presenca(v_presenca, 'presente', 'Correcao validada');

  if not exists (
    select 1 from public.aluno_presenca_retificacoes
    where aluno_presenca_id = v_presenca
      and status_anterior = 'falta'
      and status_novo = 'presente'
      and respondido_por_anterior = 'professor_la_teacher'
  ) then
    raise exception 'Retificacao append-only nao foi gravada';
  end if;
end $$;

do $$
declare
  v_proposta public.disponibilidade_professor_propostas%rowtype;
  v_disponibilidade jsonb;
begin
  if not public.fn_disponibilidade_professor_valida(
    '{"Terça":{"inicio":"10:00","fim":"18:00"},"Sábado":{"inicio":"10:00","fim":"14:00"},"Sexta-feira":{"inicio":"12:00","fim":"20:00"}}'::jsonb
  ) then
    raise exception 'Aliases reais de dia da semana foram rejeitados';
  end if;

  v_proposta := public.app_propor_disponibilidade(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '{"Segunda":{"inicio":"12:00","fim":"20:00"}}'::jsonb
  );

  v_proposta := public.admin_decidir_proposta_disponibilidade(v_proposta.id, 'aprovar', null);
  if v_proposta.status <> 'aprovada_aguardando_emusys' then
    raise exception 'Aprovacao nao entrou em espera pelo Emusys';
  end if;

  select disponibilidade into v_disponibilidade
  from public.professores_unidades where id = 1;
  if v_disponibilidade <> '{"Segunda":{"inicio":"10:00","fim":"18:00"}}'::jsonb then
    raise exception 'Aprovacao alterou o espelho antes do Emusys';
  end if;

  v_proposta := public.admin_efetivar_proposta_disponibilidade(v_proposta.id, true);
  select disponibilidade into v_disponibilidade
  from public.professores_unidades where id = 1;

  if v_proposta.status <> 'efetivada'
     or v_disponibilidade <> '{"Segunda":{"inicio":"12:00","fim":"20:00"}}'::jsonb then
    raise exception 'Efetivacao nao atualizou somente o espelho';
  end if;

  if not exists (
    select 1 from public.professores_unidades
    where id = 1 and emusys_id = 999 and payload_emusys = '{"preservar":true}'::jsonb
  ) then
    raise exception 'Efetivacao perdeu metadados de conciliacao';
  end if;
end $$;

select 'la_teacher_sql_assertions_ok';
