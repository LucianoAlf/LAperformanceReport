-- P09I - Fechamento Junho/2026: alinhar duas bandas ativas do Recreio
--
-- Evidencia:
-- - Emusys Recreio /matriculas status=ativa retorna 59 matriculas de banda
--   (Garage Band + Power Kids).
-- - LA Report estava com 57 bandas operacionais ativas porque:
--   1) Yuri de Souza Ribeiro tinha a matricula Emusys 613 como GarageBand,
--      mas a linha do LA Report estava inativa.
--   2) David Kayat A. Mansour tinha Garage Band ativa no Emusys
--      (matricula 1433), mas sem linha de banda correspondente no LA Report.
--
-- Esta migracao e idempotente e nao altera regras de negocio:
-- ela apenas alinha os dois vinculos de banda confirmados pelo payload vivo
-- do Emusys para o fechamento de Junho/2026.

do $$
declare
  v_recreio uuid;
  v_tipo_banda integer;
  v_curso_garage integer;
  v_prof_ramon integer;
  v_prof_lucas integer;
begin
  select id into v_recreio
  from public.unidades
  where lower(nome) like '%recreio%'
  limit 1;

  select id into v_tipo_banda
  from public.tipos_matricula
  where codigo = 'BANDA'
  limit 1;

  select id into v_curso_garage
  from public.cursos
  where nome = 'GarageBand'
    and is_projeto_banda is true
  limit 1;

  select id into v_prof_ramon
  from public.professores
  where nome = 'Ramon Pina Morais'
    and ativo is true
  limit 1;

  select id into v_prof_lucas
  from public.professores
  where nome = 'Lucas da Silva Guimarães'
    and ativo is true
  limit 1;

  if v_recreio is null
     or v_tipo_banda is null
     or v_curso_garage is null
     or v_prof_ramon is null
     or v_prof_lucas is null then
    raise exception 'P09I: referencias canonicas nao encontradas: recreio %, tipo_banda %, curso_garage %, prof_ramon %, prof_lucas %',
      v_recreio, v_tipo_banda, v_curso_garage, v_prof_ramon, v_prof_lucas;
  end if;

  update public.alunos
  set
    status = 'ativo',
    tipo_matricula_id = v_tipo_banda,
    curso_id = v_curso_garage,
    professor_atual_id = v_prof_ramon,
    valor_parcela = 0,
    valor_cheio = 0,
    desconto_fixo = 0,
    desconto_condicional = 0,
    dia_aula = 'Quarta',
    horario_aula = '18:00'::time,
    modalidade = 'turma',
    status_pagamento = 'em_dia',
    data_matricula = coalesce(data_matricula, '2022-06-06'::date),
    data_inicio_contrato = '2026-05-13'::date,
    data_fim_contrato = '2029-11-21'::date,
    data_saida = null,
    emusys_student_id = '702',
    updated_at = now(),
    updated_by = 'p09i_recreio_bandas_fechamento_junho'
  where unidade_id = v_recreio
    and emusys_matricula_id = '613';

  insert into public.alunos (
    nome,
    data_nascimento,
    idade_atual,
    classificacao,
    tempo_permanencia_meses,
    telefone,
    whatsapp,
    email,
    unidade_id,
    professor_atual_id,
    curso_id,
    tipo_matricula_id,
    data_matricula,
    data_inicio_contrato,
    data_fim_contrato,
    valor_parcela,
    valor_passaporte,
    status,
    is_ex_aluno,
    is_segundo_curso,
    canal_origem_id,
    forma_pagamento_id,
    dia_aula,
    horario_aula,
    percentual_presenca,
    agente_comercial,
    tipo_aluno,
    status_pagamento,
    responsavel_nome,
    responsavel_telefone,
    responsavel_parentesco,
    modalidade,
    emusys_student_id,
    photo_url,
    foto_url,
    instagram,
    emusys_matricula_id,
    valor_cheio,
    desconto_fixo,
    desconto_condicional,
    created_by,
    updated_by,
    created_at,
    updated_at
  )
  select
    base.nome,
    base.data_nascimento,
    base.idade_atual,
    base.classificacao,
    base.tempo_permanencia_meses,
    base.telefone,
    base.whatsapp,
    base.email,
    base.unidade_id,
    v_prof_lucas,
    v_curso_garage,
    v_tipo_banda,
    '2026-04-10'::date,
    '2026-04-10'::date,
    '2027-10-08'::date,
    0,
    0,
    'ativo',
    coalesce(base.is_ex_aluno, false),
    false,
    base.canal_origem_id,
    base.forma_pagamento_id,
    'Sexta',
    '17:00'::time,
    base.percentual_presenca,
    base.agente_comercial,
    coalesce(base.tipo_aluno, 'pagante'),
    'em_dia',
    base.responsavel_nome,
    base.responsavel_telefone,
    base.responsavel_parentesco,
    'turma',
    '1134',
    base.photo_url,
    base.foto_url,
    base.instagram,
    '1433',
    0,
    0,
    0,
    'p09i_recreio_bandas_fechamento_junho',
    'p09i_recreio_bandas_fechamento_junho',
    now(),
    now()
  from public.alunos base
  where base.unidade_id = v_recreio
    and base.emusys_matricula_id = '1350'
    and not exists (
      select 1
      from public.alunos existente
      where existente.unidade_id = v_recreio
        and existente.emusys_matricula_id = '1433'
    )
  limit 1;
end $$;
