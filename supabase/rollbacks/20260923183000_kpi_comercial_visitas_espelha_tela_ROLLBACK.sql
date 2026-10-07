-- Rollback: `get_kpis_comercial_canonicos_v2.visitas` volta a contar SO a tabela
-- `visitas` (o que foi agendado), e os 5 campos novos deixam de existir.
--
-- Depois de rodar isto, o relatorio do WhatsApp volta a dizer 26/0/0 em set/2026 em
-- vez de 7/11/11 -- e passa a DIVERGIR da tela do Comercial, que le as tabelas direto
-- e continua na regra do comparecimento. Reverter aqui exige reverter o frontend
-- junto (`src/lib/visitasComercial.ts` e o card em `ComercialPage.tsx`), senao o
-- numero da tela e o do grupo voltam a discordar, que e o defeito que originou a
-- LAPE-44.

do $$
declare
  v_def text;
  v_antigo text;
  v_ocorrencias int;
  v_ini int;
  v_fim int;
begin
  select pg_get_functiondef(oid) into v_def
  from pg_proc where proname = 'get_kpis_comercial_canonicos_v2';

  if v_def is null then
    raise exception 'get_kpis_comercial_canonicos_v2 nao existe';
  end if;

  if position($q$visitas_sem_hora_marcada$q$ in v_def) = 0 then
    raise exception 'a funcao ja esta na versao antiga -- nada a reverter';
  end if;

  -- 1. CTE de visitas volta ao original
  -- `substr` posicional, nao `substring(... from ... for ...)`: a forma com palavras-
  -- chave quebra quando a expressao de posicao carrega um parentese dentro da string
  -- procurada ("mismatched parentheses", pego no ensaio).
  v_ini := position('visitas_base AS' in v_def);
  v_fim := position('matriculas_base AS' in v_def);
  if v_ini = 0 or v_fim = 0 or v_fim <= v_ini then
    raise exception 'nao consegui isolar o CTE visitas_base (ini=%, fim=%)', v_ini, v_fim;
  end if;
  v_antigo := substr(v_def, v_ini, v_fim - v_ini);

  v_def := replace(v_def, v_antigo, $q$visitas_base AS (
  SELECT
    v.unidade_id,
    count(*)::int AS visitas
  FROM public.visitas v
  CROSS JOIN periodo p
  WHERE v.data >= p.inicio::date
    AND v.data < p.fim_exclusivo::date
    AND coalesce(v.status, '') NOT IN ('cancelada', 'cancelado')
    AND (p_unidade_id IS NULL OR v.unidade_id = p_unidade_id)
  GROUP BY v.unidade_id
),
$q$);

  -- 2. Campos do CTE `base`
  v_def := replace(v_def, $q$    coalesce(vb.visitas_total, 0)::int AS visitas_total,
    coalesce(vb.visitas_agendadas, 0)::int AS visitas_agendadas,
    coalesce(vb.visitas_confirmadas, 0)::int AS visitas_confirmadas,
    coalesce(vb.visitas_aguardando, 0)::int AS visitas_aguardando,
    coalesce(vb.visitas_sem_hora_marcada, 0)::int AS visitas_sem_hora_marcada,
$q$, '');

  -- 3. Campos do consolidado
  v_def := replace(v_def, $q$    sum(visitas_total)::int AS visitas_total,
    sum(visitas_agendadas)::int AS visitas_agendadas,
    sum(visitas_confirmadas)::int AS visitas_confirmadas,
    sum(visitas_aguardando)::int AS visitas_aguardando,
    sum(visitas_sem_hora_marcada)::int AS visitas_sem_hora_marcada,
$q$, '');

  -- 4. Campos da saida `kpis`
  v_def := replace(v_def, $q$      'visitas_total', visitas_total,
      'visitas_agendadas', visitas_agendadas,
      'visitas_confirmadas', visitas_confirmadas,
      'visitas_aguardando', visitas_aguardando,
      'visitas_sem_hora_marcada', visitas_sem_hora_marcada,
$q$, '');

  -- 5. Campos do recorte por unidade
  v_def := replace(v_def, $q$,
          'visitas_total', visitas_total,
          'visitas_confirmadas', visitas_confirmadas,
          'visitas_aguardando', visitas_aguardando,
          'visitas_sem_hora_marcada', visitas_sem_hora_marcada
        )$q$, $q$
        )$q$);

  -- Nao pode sobrar nenhum vestigio: se sobrar, a funcao ficaria referenciando coluna
  -- que o CTE nao produz mais e quebraria na primeira chamada, em producao.
  v_ocorrencias := (length(v_def) - length(replace(v_def, 'visitas_sem_hora_marcada', ''))) / length('visitas_sem_hora_marcada');
  if v_ocorrencias <> 0 then
    raise exception 'rollback incompleto: sobraram % referencias a visitas_sem_hora_marcada', v_ocorrencias;
  end if;

  execute v_def;
end $$;

-- Prova de que voltou ao comportamento antigo: `visitas` tem de ser igual a contagem
-- crua da tabela, e os campos novos nao podem mais existir.
do $$
declare r record; v_esperado int;
begin
  for r in
    select u.id, u.nome,
           (public.get_kpis_comercial_canonicos_v2(u.id, 2026, 9, 'mensal')->'kpis') as k
    from public.unidades u where u.ativo and u.nome in ('Campo Grande','Recreio','Barra')
  loop
    if r.k ? 'visitas_sem_hora_marcada' then
      raise exception '% : campo novo ainda presente apos rollback', r.nome;
    end if;
    select count(*) into v_esperado from public.visitas v
    where v.unidade_id = r.id
      and v.data >= date '2026-09-01' and v.data < date '2026-10-01'
      and coalesce(v.status, '') not in ('cancelada', 'cancelado');
    if (r.k->>'visitas')::int <> v_esperado then
      raise exception '% : visitas % difere da contagem crua %', r.nome, r.k->>'visitas', v_esperado;
    end if;
  end loop;
end $$;
