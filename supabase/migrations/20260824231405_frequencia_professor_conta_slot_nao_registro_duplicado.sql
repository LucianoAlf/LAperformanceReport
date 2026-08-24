-- A frequência do professor passa a contar AULA REAL, não registro do Emusys.
--
-- Medido em 01-23/08/2026: 6.365 eventos contados contra 3.401 reais — quase o dobro.
-- No Valdo/CG em 21/08 a função reportava 14 eventos, 8 presenças e 6 faltas; o dia teve
-- 7 aulas, 4 presenças e 3 faltas.
--
-- Duas correções, e as duas são necessárias:
--
-- 1. FONTE → `vw_presenca_slot_canonica_v1` (uma linha por aluno/slot, decisão mais forte
--    vence). Sem isso a linha órfã do sync entra na conta como evento próprio.
--
-- 2. `evento_chave` deixa de ser `'aula:'||aula_emusys_id` e passa a ser o SLOT. O id da
--    aula É a duplicata: a gêmea tem outro id, logo virava outro evento. E só trocar a
--    fonte não bastaria — a função agrupa por `pessoa_chave`, então quem tem DUAS
--    matrículas no mesmo curso (Miguel Gomes Biancamano/CG, Contrabaixo nas linhas 320 e
--    1064) traria duas linhas canônicas que poderiam eleger aulas diferentes e dobrar de
--    novo, agora no nível da pessoa.
--
-- ⚠️ A média percentual quase não muda na rede (79,99% → 80,14%), porque a duplicação é
-- quase uniforme. O que muda é a CONTAGEM — e o indivíduo: 40 dos 44 professores desviam
-- 1 ponto ou mais, com desvio máximo de 13,1 pontos. Para avaliação individual isso não é
-- ruído, e foi por isso que a correção foi feita em vez de só documentada.
do $mig$
declare v_def text; v_new text;
begin
  select pg_get_functiondef(p.oid) into strict v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'get_frequencia_professor_periodo_canonica_v1';

  if position('vw_presenca_slot_canonica_v1' in v_def) > 0 then
    raise notice 'frequencia ja le a canonica por slot'; return;
  end if;

  v_new := replace(v_def,
    '  FROM public.vw_aluno_presenca_semantica_v1 p',
    '  FROM public.vw_presenca_slot_canonica_v1 p');
  if v_new = v_def then raise exception 'ancora da FONTE nao encontrada'; end if;

  v_def := v_new;
  v_new := replace(v_def,
$ancora$    CASE
      WHEN p.aula_emusys_id IS NOT NULL THEN 'aula:' || p.aula_emusys_id::text
      ELSE concat_ws(
        ':',
        'fallback',
        p.data_aula::text,
        p.horario_aula::text,
        COALESCE(p.professor_id::text, 'sem-professor'),
        COALESCE(lower(btrim(p.curso_nome)), 'sem-curso')
      )
    END AS evento_chave,$ancora$,
$novo$    CASE
      WHEN p.data_hora_inicio IS NOT NULL THEN concat_ws(
        ':',
        'slot',
        p.data_hora_inicio::text,
        p.data_hora_fim::text,
        COALESCE(p.professor_id::text, 'sem-professor'),
        COALESCE(lower(btrim(p.curso_nome)), 'sem-curso')
      )
      ELSE concat_ws(
        ':',
        'fallback',
        p.data_aula::text,
        p.horario_aula::text,
        COALESCE(p.professor_id::text, 'sem-professor'),
        COALESCE(lower(btrim(p.curso_nome)), 'sem-curso')
      )
    END AS evento_chave,$novo$);
  if v_new = v_def then raise exception 'ancora da evento_chave nao encontrada'; end if;

  execute v_new;
end $mig$;

revoke all on function public.get_frequencia_professor_periodo_canonica_v1(integer,integer,uuid,date,date)
  from public, anon;
grant execute on function public.get_frequencia_professor_periodo_canonica_v1(integer,integer,uuid,date,date)
  to authenticated, service_role;;
