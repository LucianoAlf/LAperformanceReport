-- supabase/migrations/20261002120000_conversao_exp_mat_irmaos_pelo_lead_emusys.sql
--
-- Conversao experimental -> matricula: irmaos deixam de virar UMA conversao.
--
-- Caso (Barra, set/26): Lucas e Nicolas Amaral fizeram experimental e matricularam, assim como
-- Antonia e Mateus Farah. No Emusys cada crianca tem lead, aluno e aula proprios (leads 7416/7420
-- e 7492/7493). Aqui o lead e UM POR TELEFONE (UNIQUE telefone+unidade), entao cada par caiu num
-- lead so (14153 e 14677). A linha da experimental (lead_experimentais) e a do aluno guardam o
-- lead Emusys certo de cada crianca, mas lead_experimentais.aluno_id esta vazio e a conta resolvia
-- o aluno por leads.aluno_id -- um so por familia -- e contava count(distinct aluno): 14 -> 12.
--
-- Correcao: antes de cair no aluno do lead da familia, procurar o aluno pelo lead Emusys DA
-- PROPRIA experimental (alunos.emusys_lead_id = lead_experimentais.emusys_lead_id, mesma unidade).
-- Regra ja escrita (REGRAS-DE-NEGOCIO 6.3): vinculo por ID externo, nunca por telefone.
-- Muda SO o numerador da conversao. Matriculas (alunos) e experimentais com presenca (raw Emusys)
-- nao mudam. Nao regrava nenhum mes fechado (snapshot de setembro segue com 12 ate decisao).
--
-- Funcoes: get_conciliacao_experimentais_snapshot_v1 (caminho vivo: v2 -> sem_cache ->
-- snapshot_p21_v1 -> snapshot_v1) e get_conciliacao_experimentais_v2_legacy_p21_20260707
-- (lida pelo relatorio gerencial legacy p21/p22/p23). Edicao por replace com guarda de contagem
-- sobre a definicao viva, nunca transcricao a mao.

do $$
declare
  v_fn text;
  v_esperado int;
  v_def text;
  v_n int;
  v_join constant text := 'left join public.alunos al_origem on al_origem.lead_origem_id = le.lead_id';
  v_lateral constant text := v_join || '
  left join lateral (
    -- Aluno da PROPRIA crianca pelo lead Emusys da experimental (irmaos dividem o lead local).
    select a_emu.id
    from public.alunos a_emu
    where le.aluno_id is null
      and coalesce(le.emusys_lead_id, 0) > 0
      and a_emu.unidade_id = le.unidade_id
      and a_emu.emusys_lead_id = le.emusys_lead_id::text
    order by coalesce(a_emu.is_segundo_curso, false),
             (a_emu.data_matricula >= le.data_experimental) desc nulls last,
             a_emu.data_matricula nulls last,
             a_emu.id
    limit 1
  ) al_emu on true';
begin
  for v_fn, v_esperado in select * from (values
      ('get_conciliacao_experimentais_snapshot_v1', 5),
      ('get_conciliacao_experimentais_v2_legacy_p21_20260707', 3)) t(a, b)
  loop
    select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace s on s.oid = p.pronamespace
    where s.nspname = 'public' and p.proname = v_fn;
    if v_def is null then raise exception '% nao encontrada', v_fn; end if;
    if position('al_emu' in v_def) > 0 then raise exception '% ja tem al_emu', v_fn; end if;

    v_n := (length(v_def) - length(replace(v_def, v_join, ''))) / length(v_join);
    if v_n <> 1 then raise exception '%: join al_origem esperado 1, achou %', v_fn, v_n; end if;

    select count(*) into v_n
    from regexp_matches(v_def, 'le\.aluno_id,\s*l\.aluno_id,\s*al_origem\.id', 'g');
    if v_n <> v_esperado then
      raise exception '%: coalesce do aluno esperado %, achou %', v_fn, v_esperado, v_n;
    end if;

    v_def := replace(v_def, v_join, v_lateral);
    v_def := regexp_replace(v_def, '(le\.aluno_id,\s*)(l\.aluno_id,\s*al_origem\.id)', '\1al_emu.id, \2', 'g');

    select count(*) into v_n from regexp_matches(v_def, 'le\.aluno_id,\s*al_emu\.id,\s*l\.aluno_id', 'g');
    if v_n <> v_esperado then raise exception '%: troca incompleta (% de %)', v_fn, v_n, v_esperado; end if;

    execute v_def;
  end loop;
end $$;

-- O cache da conciliacao e por versao dos DADOS: mudar o codigo nao o invalida.
delete from public.conciliacao_experimentais_v2_cache;

do $$
declare
  v_r jsonb := public.conciliacao_experimentais_v2_sem_cache_20260923(
    '368d47f5-2d88-4475-bc14-ba084a9a348e', 2026, 9, 'mensal', null)->'resumo';
begin
  if (v_r->>'conversoes_exp_mat_canonicas')::int <> 14
     or (v_r->>'denominador_taxa_exp_mat')::int <> 33 then
    raise exception 'Barra set/26 fora do esperado (14 de 33): %', v_r;
  end if;
end $$;
