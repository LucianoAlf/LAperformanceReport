-- Mila: anamnese é do MÊS (meta do comercial) e a retomada fecha o ciclo (14/09/2026)
--
-- Três buracos achados auditando, pergunta a pergunta, o que a Mila promete ao time —
-- a lista que ela mesma mandou à Anne Krissya em 14/09 às 14:16.
--
-- 🔴 1. ANAMNESE COM A RÉGUA ERRADA. `radar_pendencias_comerciais_v1` contava
--    `alunos.status='ativo' and not anamnese_preenchida` SEM FILTRO DE DATA: 164 no Recreio,
--    o backlog histórico inteiro da unidade. Isso não é trabalho do comercial. A régua certa
--    já existia ao lado, no HUNTER 360 (`get_estrelas_matriculador_v1`), que conta só as
--    matrículas da COMPETÊNCIA — e por isso as duas se contradiziam na mesma tela:
--    `faltam_anamnese: 0` contra `164 matriculado sem anamnese`.
--    Decisão do Luciano (14/09): "as anamneses são das matrículas feitas no mês. De agosto
--    para trás é responsabilidade da Sol/TOM/Lia. A Mila ajuda o comercial a bater a META DELE."
--    ⚠️ A fonte da matrícula é `matriculas_comerciais_lista_v1` (fonte única de 13/09) — a
--    mesma do relatório, da estrela e da Mila. Não reimplementar o predicado aqui.
--    ⚠️ Entra também `comunidade` porque a estrela HUNTER 360 exige as DUAS coisas: cobrar só
--    anamnese deixaria a consultora a um passo da estrela sem saber qual passo falta.
--
-- 🔴 2. RETOMADA SEM LEITURA DE DESFECHO. A Mila prometeu "Qual foi o desfecho da retomada?"
--    e não tinha como responder: `mila_desfecho_retomada_v1` só ESCREVE, `mila_retomadas_do_dia_v1`
--    só devolvia as abertas e `get_situacao_lead_v1` não mostrava retomada nenhuma. Medido:
--    11 retomadas registradas, 0 com desfecho — ninguém fechou nenhuma, e a pergunta que mede
--    se o bumerangue funciona não tinha resposta.
--
-- 🔴 3. FICHA DO LEAD SEM O COMBINADO. Quem abre a ficha para ligar precisa saber que a pessoa
--    pediu para ser chamada em janeiro — senão liga na hora errada, com a frase errada.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. pendências: anamnese e comunidade passam a ser das matrículas DO MÊS
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  v_def text;
  v_n int;
  v_ancora text;
  v_novo text;
begin
  select pg_get_functiondef('public.radar_pendencias_comerciais_v1'::regproc) into v_def;

  -- (a) o CTE que varria a unidade inteira vira a coorte do mês, pela fonte única
  v_ancora := E'  anam as (\n'
           || E'    select a.id, a.nome, u.nome unidade, a.data_matricula, c.nome curso\n'
           || E'      from public.alunos a join public.unidades u on u.id = a.unidade_id\n'
           || E'      left join public.cursos c on c.id = a.curso_id\n'
           || E'     where a.status = ''ativo'' and not coalesce(a.anamnese_preenchida,false)\n'
           || E'       and coalesce(a.is_segundo_curso,false) = false\n'
           || E'       and (v_u is null or a.unidade_id = v_u)\n'
           || E'  ),\n';
  v_n := (length(v_def) - length(replace(v_def, v_ancora, ''))) / greatest(length(v_ancora), 1);
  if v_n <> 1 then raise exception 'PENDENCIAS_ANCORA_ANAM: esperado 1, achado %', v_n; end if;

  v_novo := E'  -- 🔴 A ANAMNESE QUE O COMERCIAL DEVE É A DAS MATRÍCULAS DO MÊS (14/09/2026).\n'
         || E'  -- Antes isto varria `alunos` inteira sem recorte de data (164 no Recreio) e\n'
         || E'  -- contradizia o HUNTER 360 na mesma tela. Backlog anterior é da Sol/TOM/Lia.\n'
         || E'  -- A coorte vem de matriculas_comerciais_lista_v1 — a MESMA do relatório e da estrela.\n'
         || E'  coorte_mes as (\n'
         || E'    select m.unidade_id, m.id as aluno_id, m.nome, m.data_matricula, m.cursos as curso,\n'
         || E'           un.nome as unidade\n'
         || E'      from public.unidades un\n'
         || E'      cross join lateral public.matriculas_comerciais_lista_v1(\n'
         || E'             un.id, date_trunc(''month'', (now() at time zone ''America/Sao_Paulo''))::date,\n'
         || E'             (date_trunc(''month'', (now() at time zone ''America/Sao_Paulo'')) + interval ''1 month'')::date, null) m\n'
         || E'     where un.ativo and (v_u is null or un.id = v_u)\n'
         || E'  ),\n'
         || E'  anam as (\n'
         || E'    select cm.aluno_id as id, cm.nome, cm.unidade, cm.data_matricula, cm.curso\n'
         || E'      from coorte_mes cm\n'
         || E'      join public.alunos a on a.id = cm.aluno_id\n'
         || E'     where not coalesce(a.anamnese_preenchida, false)\n'
         || E'  ),\n'
         || E'  -- A estrela HUNTER 360 exige anamnese E comunidade; cobrar só uma esconde o passo que falta.\n'
         || E'  sem_comunidade as (\n'
         || E'    select cm.aluno_id as id, cm.nome, cm.unidade, cm.data_matricula, cm.curso\n'
         || E'      from coorte_mes cm\n'
         || E'      join public.alunos a on a.id = cm.aluno_id\n'
         || E'     where not exists (\n'
         || E'       select 1 from public.comunidade_wa_participantes p\n'
         || E'        where p.telefone_key = public.fn_normalizar_telefone_br_key(\n'
         || E'                coalesce(nullif(a.responsavel_telefone, ''''), a.telefone)))\n'
         || E'  ),\n';
  v_def := replace(v_def, v_ancora, v_novo);

  -- (b) o bucket publicado declara a competência e a régua
  v_ancora := E'      ''matriculado_sem_anamnese'', jsonb_build_object(''total'', (select count(*) from anam),\n';
  v_n := (length(v_def) - length(replace(v_def, v_ancora, ''))) / greatest(length(v_ancora), 1);
  if v_n <> 1 then raise exception 'PENDENCIAS_ANCORA_BUCKET: esperado 1, achado %', v_n; end if;
  v_def := replace(v_def, v_ancora,
       E'      ''matriculado_sem_comunidade'', jsonb_build_object(''total'', (select count(*) from sem_comunidade),\n'
    || E'        ''amostra'', (select coalesce(jsonb_agg(to_jsonb(s) order by s.data_matricula desc), ''[]'') from (select * from sem_comunidade order by data_matricula desc limit p_amostra) s),\n'
    || E'        ''competencia'', to_char((now() at time zone ''America/Sao_Paulo'')::date, ''MM/YYYY''),\n'
    || E'        ''acao'', ''convidar para a comunidade da unidade; conta para a estrela HUNTER 360''),\n'
    || v_ancora);

  -- (c) a ação e a nota dizem de que mês se fala
  v_ancora := E'        ''acao'', ''mandar o link da anamnese; conta para a estrela HUNTER 360''),\n';
  v_n := (length(v_def) - length(replace(v_def, v_ancora, ''))) / greatest(length(v_ancora), 1);
  if v_n <> 1 then raise exception 'PENDENCIAS_ANCORA_ACAO: esperado 1, achado %', v_n; end if;
  v_def := replace(v_def, v_ancora,
       E'        ''competencia'', to_char((now() at time zone ''America/Sao_Paulo'')::date, ''MM/YYYY''),\n'
    || E'        ''acao'', ''mandar o link da anamnese; conta para a estrela HUNTER 360''),\n');

  v_ancora := E'    ''nota'', ''sem_canal/sem_curso: so leads dos ultimos 90 dias que chegaram a experimental — backlog antigo nao e pendencia, e reativacao''\n';
  v_n := (length(v_def) - length(replace(v_def, v_ancora, ''))) / greatest(length(v_ancora), 1);
  if v_n <> 1 then raise exception 'PENDENCIAS_ANCORA_NOTA: esperado 1, achado %', v_n; end if;
  v_def := replace(v_def, v_ancora,
       E'    ''competencia'', to_char((now() at time zone ''America/Sao_Paulo'')::date, ''MM/YYYY''),\n'
    || E'    ''nota'', ''anamnese e comunidade: SO as matriculas DESTE MES, que sao a meta do comercial '' ||\n'
    || E'              ''(mesma coorte do relatorio e da estrela HUNTER 360). Matricula de mes anterior '' ||\n'
    || E'              ''sem anamnese existe, mas e de outro dono (Sol/TOM/Lia) — nao cobre a consultora por ela. '' ||\n'
    || E'              ''sem_canal/sem_curso: so leads dos ultimos 90 dias que chegaram a experimental — '' ||\n'
    || E'              ''backlog antigo nao e pendencia, e reativacao''\n');

  execute v_def;
  raise notice 'radar_pendencias_comerciais_v1: anamnese/comunidade agora sao do mes corrente';
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. retomadas: o ciclo fecha — as abertas E as que já tiveram desfecho
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.mila_retomadas_do_dia_v1(
  p_solicitante_telefone text,
  p_data date default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'governanca'
as $function$
declare q record; v_dia date; v_out jsonb;
begin
  select * into q from governanca.quem_eh(p_solicitante_telefone) limit 1;
  if q.nome is null then return jsonb_build_object('ok', false, 'motivo', 'nao_autorizado'); end if;
  v_dia := coalesce(p_data, (now() at time zone 'America/Sao_Paulo')::date);

  select jsonb_build_object(
    'ok', true, 'dia', v_dia, 'solicitante', q.nome,
    'hoje', coalesce((
      select jsonb_agg(jsonb_build_object(
               'retomada_id', r.id, 'lead_id', r.lead_id, 'lead', l.nome, 'telefone', l.telefone,
               'unidade', u.nome,
               'ele_disse', r.frase,                       -- 🔴 sempre presente
               'quando_disse', to_char(r.prometido_em, 'DD/MM/YYYY'),
               'ha_quantos_dias', (v_dia - r.prometido_em),
               'combinou_para', r.prazo_texto, 'motivo', r.motivo)
             order by r.prometido_em)
      from lead_retomada r
      join leads l on l.id = r.lead_id
      join unidades u on u.id = r.unidade_id
      where r.status = 'aguardando' and r.retomar_em is not null and r.retomar_em <= v_dia
        and (q.unidade_id is null or r.unidade_id = q.unidade_id)), '[]'::jsonb),
    'sem_data', coalesce((
      select jsonb_agg(jsonb_build_object('retomada_id', r.id, 'lead', l.nome,
               'ele_disse', r.frase, 'combinou_para', r.prazo_texto,
               'quando_disse', to_char(r.prometido_em, 'DD/MM/YYYY'))
             order by r.prometido_em)
      from lead_retomada r
      join leads l on l.id = r.lead_id
      where r.status = 'aguardando' and r.retomar_em is null
        and (q.unidade_id is null or r.unidade_id = q.unidade_id)), '[]'::jsonb),
    -- 🔴 O DESFECHO É O QUE MEDE SE O BUMERANGUE FUNCIONA (14/09/2026). Até aqui a Mila
    -- prometia "qual foi o desfecho da retomada?" e não tinha como responder: só existia
    -- a ESCRITA (mila_desfecho_retomada_v1). Janela de 30 dias — retomada fechada há mais
    -- tempo é histórico, e a pergunta da consultora é sempre sobre o que ela acabou de fazer.
    'fechadas_recentes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'retomada_id', r.id, 'lead_id', r.lead_id, 'lead', l.nome,
               'ele_disse', r.frase,
               'desfecho', r.desfecho, 'nota', r.desfecho_nota,
               'fechada_em', to_char(r.desfecho_em at time zone 'America/Sao_Paulo', 'DD/MM/YYYY'),
               'quando_disse', to_char(r.prometido_em, 'DD/MM/YYYY'))
             order by r.desfecho_em desc)
      from lead_retomada r
      join leads l on l.id = r.lead_id
      where r.desfecho is not null
        and r.desfecho_em >= (v_dia - 30)::timestamptz
        and (q.unidade_id is null or r.unidade_id = q.unidade_id)), '[]'::jsonb),
    'placar_30_dias', (
      select jsonb_build_object(
               'fechadas', count(*) filter (where r.desfecho is not null),
               'matriculou', count(*) filter (where r.desfecho = 'matriculou'),
               'segue_interessado', count(*) filter (where r.desfecho = 'segue_interessado'),
               'nao_quer', count(*) filter (where r.desfecho = 'nao_quer'),
               'sem_resposta', count(*) filter (where r.desfecho = 'sem_resposta'),
               'ainda_abertas', count(*) filter (where r.desfecho is null and r.status = 'aguardando'))
        from lead_retomada r
       where (q.unidade_id is null or r.unidade_id = q.unidade_id)
         and (r.desfecho_em is null or r.desfecho_em >= (v_dia - 30)::timestamptz)),
    'como_usar', 'SEMPRE cite `ele_disse` — a frase da pessoa — e ha quantos dias foi. '
              || 'Sem isso ela nao lembra do caso e ignora o lembrete. '
              || 'Em `sem_data` estao os que combinaram algo vago: pergunte a ela quando quer ser lembrada. '
              || 'Em `fechadas_recentes` esta o desfecho do que ela ja retomou (ultimos 30 dias); '
              || '`placar_30_dias` responde "a retomada esta dando resultado?". Se `fechadas` for 0 '
              || 'com retomadas abertas, o ciclo nao esta sendo fechado — diga isso, e nao invente resultado.'
  ) into v_out;
  return v_out;
end $function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. ficha do lead: mostra o que foi combinado (e o desfecho, se já houve)
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  v_def text;
  v_n int;
  v_ancora text;
begin
  select pg_get_functiondef('public.get_situacao_lead_v1'::regproc) into v_def;
  if position('''retomada''' in v_def) > 0 then
    raise notice 'get_situacao_lead_v1 ja tem o bloco retomada';
    return;
  end if;
  v_ancora := E'    ''cobertura'', jsonb_build_object(''calor_desde'', ''2026-09-03'', ''nota'', ''conversas comerciais so sao espelhadas desde 03/09/2026'')\n';
  v_n := (length(v_def) - length(replace(v_def, v_ancora, ''))) / greatest(length(v_ancora), 1);
  if v_n <> 1 then raise exception 'FICHA_ANCORA_COBERTURA: esperado 1, achado %', v_n; end if;

  v_def := replace(v_def, v_ancora,
       E'    -- 🔴 O COMBINADO ENTRA NA FICHA (14/09/2026). Quem abre a ficha para ligar precisa\n'
    || E'    -- saber que a pessoa pediu para ser chamada em janeiro — senao liga na hora errada,\n'
    || E'    -- com a frase errada. `ele_disse` e obrigatorio pelo mesmo motivo de retomadas_do_dia.\n'
    || E'    ''retomada'', coalesce((\n'
    || E'      select jsonb_build_object(''tem'', true, ''retomada_id'', r.id,\n'
    || E'               ''ele_disse'', r.frase, ''combinou_para'', r.prazo_texto,\n'
    || E'               ''quando_disse'', to_char(r.prometido_em, ''DD/MM/YYYY''),\n'
    || E'               ''retomar_em'', r.retomar_em, ''motivo'', r.motivo, ''status'', r.status,\n'
    || E'               ''desfecho'', r.desfecho, ''desfecho_nota'', r.desfecho_nota,\n'
    || E'               ''fechada_em'', to_char(r.desfecho_em at time zone ''America/Sao_Paulo'', ''DD/MM/YYYY''))\n'
    || E'        from public.lead_retomada r\n'
    || E'       where r.lead_id = v_lead.lead_id\n'
    || E'       order by r.prometido_em desc limit 1), jsonb_build_object(''tem'', false)),\n'
    || v_ancora);

  execute v_def;
  raise notice 'get_situacao_lead_v1: bloco retomada adicionado';
end $$;
