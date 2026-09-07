-- MATRICULA ENTROU SEM ANAMNESE: A MILA AVISA NA HORA (06/09/2026).
--
-- Pedido do Alf: "entrou a matricula do aluno no LA Report, bateu la: se nao
-- tiver preenchida a anamnese, ja tem que disparar para a consultora. Na hora.
-- Se tiver anamnese, nao fala nada."
--
-- 🔴 O MOMENTO E O PRODUTO. A anamnese ja aparecia na tool `pendencias_
--    comerciais`, mas como TOTAL ACUMULADO — 180 na Barra. Numero desse
--    tamanho nao vira acao, vira paisagem, e citar 180 todo dia no briefing
--    seria exatamente o ruido que acabamos de tirar do relatorio. O que
--    funciona e o aviso no dia da matricula, quando mandar o link ainda e
--    natural e o numero e 1.
--
-- MEDIDO antes de construir — matriculas por dia na rede, sem anamnese:
--   05/09: 2 de 4 · 02/09: 2 de 4 · 31/08: 2 de 3 · 28/08: 1 de 3 · 24/08: 3 de 6
-- Ou seja **0 a 3 por dia na rede inteira**. Cabe na cutucada sem afogar nada.
--
-- ⚠️ SEM CRON NOVO. A cutucada ja roda de hora em hora (09-18, seg-sab), ja
--    deduplica por pessoa/dia, ja tem teto e ja respeita a agenda da escola
--    (feriado nao cutuca). O detector e chamado por ela, ANTES da leitura —
--    assim a ordem detecta->le fica garantida sem corrida entre dois crons.
--    O detector diario (jobid 196, 06:10) roda 1x ao dia e nao serviria para
--    "na hora".
--
-- ⚠️ JANELA DE 2 DIAS, nao 1: se a cutucada nao rodar num dia (feriado,
--    incidente), a matricula de ontem nao pode sumir sem nunca ter sido avisada.
--
-- ⚠️ EXPIRA EM 3 DIAS, de proposito. E um aviso de MOMENTO. Passado o momento,
--    o caso continua vivo na lista de pendencias — mas para de cutucar, senao
--    vira a cobranca diaria que nao queremos.
--
-- ⚠️ O predicado da anamnese e COPIA do que `radar_pendencias_comerciais_v1` ja
--    usa (`status='ativo'`, `not anamnese_preenchida`, `not is_segundo_curso`).
--    Segundo curso fica de fora porque a anamnese e da PESSOA, nao da matricula.

insert into public.radar_regras
  (codigo, titulo, descricao, entidade_tipo, origem, severidade_padrao, canonico, ativo,
   lastro, orientacao_padrao, versao, dominio)
values
  ('R21', 'Matrícula entrou e a anamnese não foi preenchida',
   'Aluno matriculado nos últimos 2 dias, curso principal, sem anamnese. É um aviso de '
   'momento: no dia da matrícula mandar o link ainda é natural.',
   'aluno', 'sql_comercial', 'atencao', true, true,
   'A anamnese é o que trava a estrela HUNTER 360 e alimenta o briefing do professor. '
   'Medido em 06/09/2026: 0 a 3 matrículas por dia na rede entram sem ela, mas o acumulado '
   'já passa de 180 na Barra — o problema não é volume, é o momento em que se avisa.',
   'Avise pelo nome, sem cobrança: "acabei de ver que a matrícula do Guilherme entrou e a '
   'anamnese ainda não foi preenchida — quer que eu te passe o link?". Uma linha. Se ela '
   'disser que já mandou, não insista: o preenchimento é da família.',
   'v1', 'comercial')
on conflict (codigo) do update set
  titulo = excluded.titulo, descricao = excluded.descricao, lastro = excluded.lastro,
  orientacao_padrao = excluded.orientacao_padrao, ativo = true, atualizada_em = now();

-- ── o detector, chamavel de hora em hora ──────────────────────────────────
create or replace function public.radar_detectar_matricula_sem_anamnese_v1()
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_competencia date := date_trunc('month', v_hoje)::date;
  v_n int := 0;
begin
  with alvo as (
    select a.id, a.nome, a.unidade_id, a.data_matricula, c.nome curso
    from alunos a
    left join cursos c on c.id = a.curso_id
    where a.status = 'ativo'
      and not coalesce(a.anamnese_preenchida, false)
      and coalesce(a.is_segundo_curso, false) = false
      -- janela de 2 dias: um dia sem cutucada nao pode engolir o aviso
      and a.data_matricula between v_hoje - 1 and v_hoje
  ), ins as (
    insert into public.radar_sinais
      (entidade_tipo, entidade_id, unidade_id, regra_codigo, tipo_sinal, severidade,
       canonico, origem, dominio, contexto, interpretacao, orientacao, evidencia,
       identificacao, detectado_em, competencia, expira_em, chave_dedup, status, regra_versao)
    select 'aluno', a.id, a.unidade_id, 'R21', 'matricula_sem_anamnese', r.severidade_padrao,
           true, 'sql_comercial', 'comercial',
           -- ⚠️ O nome vem PRIMEIRO e separado por " — ": a cutucada so faz join
           --    com `leads`, e para entidade 'aluno' ela cai no fallback
           --    split_part(contexto, ' — ', 1) para saber de quem se trata.
           a.nome || ' — matrícula entrou em ' ||
             to_char(a.data_matricula, 'DD/MM') ||
             coalesce(' (' || a.curso || ')', '') || ' e a anamnese não foi preenchida.',
           r.lastro, r.orientacao_padrao,
           jsonb_build_object('aluno_id', a.id, 'data_matricula', a.data_matricula,
                              'curso', a.curso),
           jsonb_build_object('metodo','alunos.anamnese_preenchida','confianca',1.0,
                              'aluno_id', a.id),
           now(), v_competencia,
           -- aviso de MOMENTO: 3 dias e ele sai de cena; o caso segue na lista
           -- de pendencias, mas para de cutucar
           (v_hoje + 3)::timestamptz,
           'R21|aluno|' || a.id, 'aberto', r.versao
    from alvo a cross join (select * from public.radar_regras where codigo='R21') r
    on conflict (chave_dedup) do nothing
    returning 1
  ) select count(*) into v_n from ins;

  return jsonb_build_object('ok', true, 'novos', v_n, 'data', v_hoje);
end; $function$;

revoke all on function public.radar_detectar_matricula_sem_anamnese_v1() from public, anon;
grant execute on function public.radar_detectar_matricula_sem_anamnese_v1() to service_role;

-- ── a cutucada passa a enxergar R21 ───────────────────────────────────────
do $patch$
declare v_def text; v_n int;
  ANC constant text := '      and (r.regra_codigo = ''R18'' or (r.regra_codigo = ''R7'' and r.dominio = ''comercial''))';
  NOVO constant text := '      and (r.regra_codigo in (''R18'', ''R21'') or (r.regra_codigo = ''R7'' and r.dominio = ''comercial''))';
begin
  select pg_get_functiondef(oid) into v_def from pg_proc where proname = 'mila_cutucada_v1';
  if position('R21' in v_def) > 0 then
    raise notice 'a cutucada ja enxerga R21 — nada a fazer';
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, ANC, ''))) / length(ANC);
  if v_n <> 1 then
    raise exception 'ancora do filtro de regras: esperava 1, achei %', v_n;
  end if;
  execute replace(v_def, ANC, NOVO);
  raise notice 'mila_cutucada_v1 passou a enxergar R21';
end $patch$;

revoke all on function public.mila_cutucada_v1(text, integer) from public, anon;
grant execute on function public.mila_cutucada_v1(text, integer) to service_role;

-- ── prova ──────────────────────────────────────────────────────────────────
do $prova$
declare v jsonb; v_abertos int; v_com_anamnese int; v_tel text; c jsonb;
begin
  v := radar_detectar_matricula_sem_anamnese_v1();
  if not (v->>'ok')::bool then raise exception 'detector falhou: %', v; end if;

  select count(*) into v_abertos from radar_sinais
   where regra_codigo = 'R21' and status = 'aberto';

  -- 🔴 quem TEM anamnese nao pode aparecer: "se tiver anamnese, nao fala nada"
  select count(*) into v_com_anamnese
    from radar_sinais s join alunos a on a.id = s.entidade_id
   where s.regra_codigo = 'R21' and s.status = 'aberto'
     and coalesce(a.anamnese_preenchida, false);
  if v_com_anamnese > 0 then
    raise exception '% alunos COM anamnese entraram no aviso', v_com_anamnese;
  end if;

  -- idempotencia: rodar de novo nao duplica
  v := radar_detectar_matricula_sem_anamnese_v1();
  if (v->>'novos')::int <> 0 then
    raise exception 'a 2a rodada criou % sinais — a chave de dedup nao segura', v->>'novos';
  end if;

  raise notice 'R21 provado: % aviso(s) aberto(s), 0 com anamnese, e a 2a rodada nao duplicou',
    v_abertos;
end $prova$;
