begin;

-- O nome do professor registrado no fechamento comercial e um fato historico,
-- mas nome nao e uma chave duravel. Esta funcao resolve o identificador uma
-- unica vez, no momento em que o documento e criado ou retificado, e o grava
-- dentro da propria linha imutavel da matricula.
create or replace function public.congelar_professor_experimental_relatorio_comercial_v1(
  p_payload jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_item jsonb;
  v_itens jsonb := '[]'::jsonb;
  v_nome text;
  v_aluno_id integer;
  v_professor_id integer;
  v_estado text;
begin
  if jsonb_typeof(p_payload) <> 'object'
     or jsonb_typeof(p_payload -> 'matriculas') <> 'array' then
    raise exception 'RELATORIO_COMERCIAL_MATRICULAS_INVALIDAS'
      using errcode = '22023';
  end if;

  for v_item in
    select value
    from jsonb_array_elements(p_payload -> 'matriculas') with ordinality
    order by ordinality
  loop
    if v_item ? 'professor_experimental_id_fechado' then
      v_itens := v_itens || jsonb_build_array(v_item);
      continue;
    end if;

    v_nome := coalesce(
      nullif(btrim(v_item ->> 'professores_experimentais'), ''),
      nullif(btrim(v_item ->> 'professores'), '')
    );
    v_professor_id := null;
    v_aluno_id := case
      when coalesce(v_item ->> 'id', '') ~ '^\d+$'
        then (v_item ->> 'id')::integer
      else null
    end;

    if v_aluno_id is not null then
      select a.professor_experimental_id into v_professor_id
      from public.alunos a
      where a.id = v_aluno_id;
    end if;

    if v_professor_id is null and v_nome is not null then
      select min(p.id) into v_professor_id
      from public.professores p
      where regexp_replace(lower(public.unaccent(btrim(p.nome))), '\s+', ' ', 'g')
          = regexp_replace(lower(public.unaccent(v_nome)), '\s+', ' ', 'g')
      having count(*) = 1;
    end if;

    v_estado := case
      when v_professor_id is not null then 'atribuido'
      when v_nome is null then 'nao_informado'
      else 'ambiguo_ou_nao_localizado'
    end;

    v_itens := v_itens || jsonb_build_array(
      v_item || jsonb_build_object(
        'professor_experimental_id_fechado', v_professor_id,
        'professor_experimental_atribuicao', v_estado
      )
    );
  end loop;

  return jsonb_set(p_payload, '{matriculas}', v_itens, false);
end;
$function$;

revoke all on function public.congelar_professor_experimental_relatorio_comercial_v1(jsonb)
  from public, anon, authenticated;
grant execute on function public.congelar_professor_experimental_relatorio_comercial_v1(jsonb)
  to service_role;

alter function public.montar_relatorio_comercial_mensal_payload_v1(uuid, integer, integer)
  rename to montar_rel_comercial_payload_before_professor_imutavel_20260909;

revoke all on function public.montar_rel_comercial_payload_before_professor_imutavel_20260909(
  uuid, integer, integer
) from public, anon, authenticated;
grant execute on function public.montar_rel_comercial_payload_before_professor_imutavel_20260909(
  uuid, integer, integer
) to service_role;

create or replace function public.montar_relatorio_comercial_mensal_payload_v1(
  p_unidade_id uuid,
  p_ano integer,
  p_mes integer
)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select public.congelar_professor_experimental_relatorio_comercial_v1(
    public.montar_rel_comercial_payload_before_professor_imutavel_20260909(
      p_unidade_id,
      p_ano,
      p_mes
    )
  );
$function$;

revoke all on function public.montar_relatorio_comercial_mensal_payload_v1(
  uuid, integer, integer
) from public, anon, authenticated;
grant execute on function public.montar_relatorio_comercial_mensal_payload_v1(
  uuid, integer, integer
) to service_role;

-- Evidencia nominal capturada antes do cutover. Esta tabela temporaria torna a
-- retificacao de Jun-Ago reproduzivel: cadastro vivo posterior nao reatribui a
-- autoria historica de uma aula experimental.
create temporary table pg_temp.relatorio_comercial_professor_historico_20260909 (
  ano integer not null,
  mes integer not null,
  unidade_codigo text not null,
  aluno_id integer not null,
  professor_id integer not null,
  atribuicao text not null check (atribuicao = 'atribuido'),
  primary key (ano, mes, unidade_codigo, aluno_id)
) on commit drop;

insert into pg_temp.relatorio_comercial_professor_historico_20260909
  (ano, mes, unidade_codigo, aluno_id, professor_id, atribuicao)
values
  (2026,6,'BARRA',1737,8,'atribuido'),
  (2026,6,'BARRA',1765,52,'atribuido'),
  (2026,6,'BARRA',1769,26,'atribuido'),
  (2026,6,'BARRA',1777,49,'atribuido'),
  (2026,6,'BARRA',1791,26,'atribuido'),
  (2026,6,'BARRA',1793,49,'atribuido'),
  (2026,6,'BARRA',1794,52,'atribuido'),
  (2026,6,'BARRA',1796,53,'atribuido'),
  (2026,6,'BARRA',1797,6,'atribuido'),
  (2026,6,'BARRA',1798,19,'atribuido'),
  (2026,6,'BARRA',1800,3,'atribuido'),
  (2026,6,'BARRA',1802,8,'atribuido'),
  (2026,6,'BARRA',1807,46,'atribuido'),
  (2026,6,'CG',1745,27,'atribuido'),
  (2026,6,'CG',1746,14,'atribuido'),
  (2026,6,'CG',1751,55,'atribuido'),
  (2026,6,'CG',1752,15,'atribuido'),
  (2026,6,'CG',1756,8,'atribuido'),
  (2026,6,'CG',1758,35,'atribuido'),
  (2026,6,'CG',1763,55,'atribuido'),
  (2026,6,'CG',1770,36,'atribuido'),
  (2026,6,'CG',1773,36,'atribuido'),
  (2026,6,'CG',1790,11,'atribuido'),
  (2026,6,'CG',1792,2,'atribuido'),
  (2026,6,'CG',1801,30,'atribuido'),
  (2026,6,'CG',1806,7,'atribuido'),
  (2026,6,'REC',1749,18,'atribuido'),
  (2026,6,'REC',1750,18,'atribuido'),
  (2026,6,'REC',1753,40,'atribuido'),
  (2026,6,'REC',1755,52,'atribuido'),
  (2026,6,'REC',1759,18,'atribuido'),
  (2026,6,'REC',1760,53,'atribuido'),
  (2026,6,'REC',1761,26,'atribuido'),
  (2026,6,'REC',1762,15,'atribuido'),
  (2026,6,'REC',1764,18,'atribuido'),
  (2026,6,'REC',1766,43,'atribuido'),
  (2026,6,'REC',1772,16,'atribuido'),
  (2026,6,'REC',1774,26,'atribuido'),
  (2026,6,'REC',1775,21,'atribuido'),
  (2026,6,'REC',1778,52,'atribuido'),
  (2026,6,'REC',1780,18,'atribuido'),
  (2026,6,'REC',1781,25,'atribuido'),
  (2026,6,'REC',1782,2,'atribuido'),
  (2026,6,'REC',1803,52,'atribuido'),
  (2026,6,'REC',1804,20,'atribuido'),
  (2026,6,'REC',1805,32,'atribuido'),
  (2026,7,'BARRA',1811,40,'atribuido'),
  (2026,7,'BARRA',1820,13,'atribuido'),
  (2026,7,'BARRA',1824,8,'atribuido'),
  (2026,7,'BARRA',1830,19,'atribuido'),
  (2026,7,'BARRA',1832,16,'atribuido'),
  (2026,7,'BARRA',1834,52,'atribuido'),
  (2026,7,'BARRA',1836,41,'atribuido'),
  (2026,7,'BARRA',1856,52,'atribuido'),
  (2026,7,'BARRA',1858,19,'atribuido'),
  (2026,7,'BARRA',1860,3,'atribuido'),
  (2026,7,'BARRA',1866,53,'atribuido'),
  (2026,7,'BARRA',1879,52,'atribuido'),
  (2026,7,'BARRA',1880,41,'atribuido'),
  (2026,7,'BARRA',1881,24,'atribuido'),
  (2026,7,'BARRA',1882,26,'atribuido'),
  (2026,7,'BARRA',1886,19,'atribuido'),
  (2026,7,'BARRA',1887,8,'atribuido'),
  (2026,7,'BARRA',1888,52,'atribuido'),
  (2026,7,'BARRA',1889,52,'atribuido'),
  (2026,7,'CG',1815,2,'atribuido'),
  (2026,7,'CG',1818,31,'atribuido'),
  (2026,7,'CG',1842,20,'atribuido'),
  (2026,7,'CG',1845,8,'atribuido'),
  (2026,7,'CG',1846,27,'atribuido'),
  (2026,7,'CG',1848,36,'atribuido'),
  (2026,7,'CG',1851,15,'atribuido'),
  (2026,7,'CG',1852,18,'atribuido'),
  (2026,7,'CG',1854,36,'atribuido'),
  (2026,7,'CG',1871,40,'atribuido'),
  (2026,7,'CG',1872,36,'atribuido'),
  (2026,7,'CG',1874,55,'atribuido'),
  (2026,7,'CG',1878,55,'atribuido'),
  (2026,7,'CG',1883,55,'atribuido'),
  (2026,7,'REC',521,20,'atribuido'),
  (2026,7,'REC',1812,52,'atribuido'),
  (2026,7,'REC',1813,32,'atribuido'),
  (2026,7,'REC',1816,34,'atribuido'),
  (2026,7,'REC',1822,52,'atribuido'),
  (2026,7,'REC',1827,40,'atribuido'),
  (2026,7,'REC',1829,52,'atribuido'),
  (2026,7,'REC',1838,53,'atribuido'),
  (2026,7,'REC',1840,36,'atribuido'),
  (2026,7,'REC',1864,18,'atribuido'),
  (2026,7,'REC',1868,13,'atribuido'),
  (2026,7,'REC',1875,52,'atribuido'),
  (2026,7,'REC',1876,27,'atribuido'),
  (2026,7,'REC',1877,27,'atribuido'),
  (2026,7,'REC',1884,52,'atribuido'),
  (2026,7,'REC',1885,18,'atribuido'),
  (2026,7,'REC',1890,52,'atribuido'),
  (2026,8,'BARRA',1896,52,'atribuido'),
  (2026,8,'BARRA',1898,26,'atribuido'),
  (2026,8,'BARRA',1903,6,'atribuido'),
  (2026,8,'BARRA',1904,53,'atribuido'),
  (2026,8,'BARRA',1921,49,'atribuido'),
  (2026,8,'BARRA',1922,6,'atribuido'),
  (2026,8,'BARRA',1924,46,'atribuido'),
  (2026,8,'BARRA',2062,19,'atribuido'),
  (2026,8,'BARRA',2335,8,'atribuido'),
  (2026,8,'BARRA',2339,19,'atribuido'),
  (2026,8,'BARRA',2347,49,'atribuido'),
  (2026,8,'BARRA',2351,16,'atribuido'),
  (2026,8,'BARRA',2352,46,'atribuido'),
  (2026,8,'BARRA',2357,41,'atribuido'),
  (2026,8,'BARRA',2359,10,'atribuido'),
  (2026,8,'BARRA',2467,53,'atribuido'),
  (2026,8,'BARRA',2469,20,'atribuido'),
  (2026,8,'BARRA',2471,6,'atribuido'),
  (2026,8,'BARRA',2472,20,'atribuido'),
  (2026,8,'CG',1891,15,'atribuido'),
  (2026,8,'CG',1894,18,'atribuido'),
  (2026,8,'CG',1899,15,'atribuido'),
  (2026,8,'CG',1902,14,'atribuido'),
  (2026,8,'CG',1908,2,'atribuido'),
  (2026,8,'CG',1909,34,'atribuido'),
  (2026,8,'CG',1923,13,'atribuido'),
  (2026,8,'CG',1925,62,'atribuido'),
  (2026,8,'CG',1928,2,'atribuido'),
  (2026,8,'CG',2273,31,'atribuido'),
  (2026,8,'CG',2320,11,'atribuido'),
  (2026,8,'CG',2333,11,'atribuido'),
  (2026,8,'CG',2334,15,'atribuido'),
  (2026,8,'CG',2336,56,'atribuido'),
  (2026,8,'CG',2337,1,'atribuido'),
  (2026,8,'CG',2338,56,'atribuido'),
  (2026,8,'CG',2358,11,'atribuido'),
  (2026,8,'CG',2369,34,'atribuido'),
  (2026,8,'CG',2370,13,'atribuido'),
  (2026,8,'CG',2458,18,'atribuido'),
  (2026,8,'CG',2461,27,'atribuido'),
  (2026,8,'CG',2463,36,'atribuido'),
  (2026,8,'CG',2464,15,'atribuido'),
  (2026,8,'CG',2466,3,'atribuido'),
  (2026,8,'REC',1892,18,'atribuido'),
  (2026,8,'REC',1905,41,'atribuido'),
  (2026,8,'REC',1906,20,'atribuido'),
  (2026,8,'REC',1907,36,'atribuido'),
  (2026,8,'REC',1926,18,'atribuido'),
  (2026,8,'REC',1927,18,'atribuido'),
  (2026,8,'REC',1929,53,'atribuido'),
  (2026,8,'REC',1930,43,'atribuido'),
  (2026,8,'REC',2205,53,'atribuido'),
  (2026,8,'REC',2223,52,'atribuido'),
  (2026,8,'REC',2283,36,'atribuido'),
  (2026,8,'REC',2328,16,'atribuido'),
  (2026,8,'REC',2329,18,'atribuido'),
  (2026,8,'REC',2330,56,'atribuido'),
  (2026,8,'REC',2332,53,'atribuido'),
  (2026,8,'REC',2340,52,'atribuido'),
  (2026,8,'REC',2341,11,'atribuido'),
  (2026,8,'REC',2348,16,'atribuido'),
  (2026,8,'REC',2356,53,'atribuido'),
  (2026,8,'REC',2360,37,'atribuido'),
  (2026,8,'REC',2462,32,'atribuido'),
  (2026,8,'REC',2465,21,'atribuido'),
  (2026,8,'REC',2468,40,'atribuido');

do $historico_count$
begin
  if (select count(*) from pg_temp.relatorio_comercial_professor_historico_20260909) <> 162 then
    raise exception 'RELATORIO_COMERCIAL_HISTORICO_INCOMPLETO'
      using errcode = '22000';
  end if;
end;
$historico_count$;

-- Retifica por nova versao os fechamentos ja existentes no recorte em uso.
-- O payload anterior permanece intocado e auditavel.
do $freeze_existing$
declare
  v_snapshot public.fechamento_mensal_snapshots%rowtype;
  v_payload jsonb;
  v_item jsonb;
  v_item_congelado jsonb;
  v_itens jsonb;
  v_unidade_codigo text;
  v_aluno_id integer;
  v_nome text;
  v_professor_id integer;
  v_atribuicao text;
  v_esperados integer;
  v_validar_universo_producao boolean;
  v_novo_id uuid;
  v_versao integer;
  v_hash text;
begin
  select count(*) = 3 into v_validar_universo_producao
  from public.unidades u
  where upper(u.codigo) in ('BARRA', 'CG', 'REC');

  for v_snapshot in
    select distinct on (s.ano, s.mes, s.unidade_id) s.*
    from public.fechamento_mensal_snapshots s
    where s.dominio = 'relatorio_comercial_mensal'
      and s.escopo = 'unidade'
      and make_date(s.ano, s.mes, 1) >= date '2026-06-01'
      and jsonb_typeof(s.payload -> 'matriculas') = 'array'
    order by s.ano, s.mes, s.unidade_id, s.versao desc
  loop
    if v_snapshot.payload_hash is distinct from
         public.hash_jsonb_canonico(v_snapshot.payload) then
      raise exception 'RELATORIO_COMERCIAL_SNAPSHOT_ORIGEM_HASH_INVALIDO: documento %',
        v_snapshot.id using errcode = '22000';
    end if;

    if not exists (
      select 1
      from jsonb_array_elements(v_snapshot.payload -> 'matriculas') item
      where not (item ? 'professor_experimental_id_fechado')
    ) then
      continue;
    end if;

    perform pg_advisory_xact_lock(hashtextextended(
      concat_ws(
        ':',
        'relatorio-comercial-professor-experimental',
        v_snapshot.ano,
        v_snapshot.mes,
        v_snapshot.unidade_id
      ),
      0
    ));

    select upper(u.codigo) into v_unidade_codigo
    from public.unidades u
    where u.id = v_snapshot.unidade_id;

    if v_unidade_codigo is null then
      raise exception 'RELATORIO_COMERCIAL_UNIDADE_NAO_LOCALIZADA: documento %',
        v_snapshot.id using errcode = '22000';
    end if;

    if v_validar_universo_producao
       and v_unidade_codigo in ('BARRA', 'CG', 'REC')
       and make_date(v_snapshot.ano, v_snapshot.mes, 1)
           between date '2026-06-01' and date '2026-08-01' then
      select count(*) into v_esperados
      from pg_temp.relatorio_comercial_professor_historico_20260909 h
      where h.ano = v_snapshot.ano
        and h.mes = v_snapshot.mes
        and h.unidade_codigo = v_unidade_codigo;

      if v_esperados <> jsonb_array_length(v_snapshot.payload -> 'matriculas') then
        raise exception 'RELATORIO_COMERCIAL_HISTORICO_DIVERGENTE: documento %, esperado %, recebido %',
          v_snapshot.id,
          v_esperados,
          jsonb_array_length(v_snapshot.payload -> 'matriculas')
          using errcode = '22000';
      end if;
    end if;

    v_itens := '[]'::jsonb;
    for v_item in
      select value
      from jsonb_array_elements(v_snapshot.payload -> 'matriculas') with ordinality
      order by ordinality
    loop
      if v_item ? 'professor_experimental_id_fechado' then
        v_itens := v_itens || jsonb_build_array(v_item);
        continue;
      end if;

      v_aluno_id := case
        when coalesce(v_item ->> 'id', '') ~ '^\d+$'
          then (v_item ->> 'id')::integer
        else null
      end;
      v_professor_id := null;
      v_atribuicao := null;

      select h.professor_id, h.atribuicao
        into v_professor_id, v_atribuicao
      from pg_temp.relatorio_comercial_professor_historico_20260909 h
      where h.ano = v_snapshot.ano
        and h.mes = v_snapshot.mes
        and h.unidade_codigo = v_unidade_codigo
        and h.aluno_id = v_aluno_id;

      if v_professor_id is null then
        if v_validar_universo_producao
           and v_unidade_codigo in ('BARRA', 'CG', 'REC')
           and make_date(v_snapshot.ano, v_snapshot.mes, 1)
               between date '2026-06-01' and date '2026-08-01' then
          raise exception 'RELATORIO_COMERCIAL_HISTORICO_ALUNO_NAO_MAPEADO: documento %, aluno %',
            v_snapshot.id,
            coalesce(v_aluno_id::text, 'invalido')
            using errcode = '22000';
        end if;

        -- Fora do universo nominal de producao, um documento ja fechado
        -- conserva o nome gravado nele; o cadastro vivo pode ter mudado depois.
        v_nome := coalesce(
          nullif(btrim(v_item ->> 'professores_experimentais'), ''),
          nullif(btrim(v_item ->> 'professores'), '')
        );
        if v_nome is not null then
          select min(p.id) into v_professor_id
          from public.professores p
          where regexp_replace(lower(public.unaccent(btrim(p.nome))), '\s+', ' ', 'g')
              = regexp_replace(lower(public.unaccent(v_nome)), '\s+', ' ', 'g')
          having count(*) = 1;
        end if;
        v_atribuicao := case
          when v_professor_id is not null then 'atribuido'
          when v_nome is null then 'nao_informado'
          else 'ambiguo_ou_nao_localizado'
        end;
        v_item_congelado := v_item || jsonb_build_object(
          'professor_experimental_id_fechado', v_professor_id,
          'professor_experimental_atribuicao', v_atribuicao
        );
      else
        v_item_congelado := v_item || jsonb_build_object(
          'professor_experimental_id_fechado', v_professor_id,
          'professor_experimental_atribuicao', v_atribuicao
        );
      end if;

      v_itens := v_itens || jsonb_build_array(v_item_congelado);
    end loop;

    v_payload := jsonb_set(v_snapshot.payload, '{matriculas}', v_itens, false);
    if jsonb_array_length(v_payload -> 'matriculas')
         <> jsonb_array_length(v_snapshot.payload -> 'matriculas')
       or exists (
         select 1
         from jsonb_array_elements(v_payload -> 'matriculas') item
         where not (item ? 'professor_experimental_id_fechado')
            or (
              item ->> 'professor_experimental_id_fechado' is not null
              and item ->> 'professor_experimental_id_fechado' !~ '^\d+$'
            )
       ) then
      raise exception 'RELATORIO_COMERCIAL_AUTORIA_IMUTAVEL_INVALIDA: documento %',
        v_snapshot.id using errcode = '22000';
    end if;

    select coalesce(max(s.versao), 0) + 1 into v_versao
    from public.fechamento_mensal_snapshots s
    where s.ano = v_snapshot.ano
      and s.mes = v_snapshot.mes
      and s.escopo = v_snapshot.escopo
      and s.unidade_id is not distinct from v_snapshot.unidade_id
      and s.dominio = v_snapshot.dominio;

    v_hash := public.hash_jsonb_canonico(v_payload);
    insert into public.fechamento_mensal_snapshots (
      ano, mes, escopo, unidade_id, dominio, versao, status,
      fonte, payload, payload_hash, observacao,
      capturado_em, capturado_por, aprovado_em, aprovado_por,
      fechado_em, fechado_por
    ) values (
      v_snapshot.ano,
      v_snapshot.mes,
      v_snapshot.escopo,
      v_snapshot.unidade_id,
      v_snapshot.dominio,
      v_versao,
      v_snapshot.status,
      'professor_experimental_imutavel_v1',
      v_payload,
      v_hash,
      'Professor da experimental persistido no proprio fechamento comercial',
      now(),
      auth.uid(),
      v_snapshot.aprovado_em,
      v_snapshot.aprovado_por,
      v_snapshot.fechado_em,
      v_snapshot.fechado_por
    ) returning id into v_novo_id;

    insert into public.fechamento_mensal_auditoria (
      snapshot_id, ano, mes, escopo, unidade_id, acao, detalhes, actor_id
    ) values (
      v_novo_id,
      v_snapshot.ano,
      v_snapshot.mes,
      v_snapshot.escopo,
      v_snapshot.unidade_id,
      'snapshot_gravado',
      jsonb_build_object(
        'dominio', v_snapshot.dominio,
        'versao', v_versao,
        'documento_anterior_id', v_snapshot.id,
        'documento_anterior_versao', v_snapshot.versao,
        'motivo', 'professor_experimental_imutavel',
        'payload_hash', v_hash
      ),
      auth.uid()
    );
  end loop;
end;
$freeze_existing$;

-- A composicao passa a confiar somente no identificador congelado quando ha
-- documento comercial. Fonte viva permanece permitida apenas no mes corrente.
create or replace function public.relatorio_coordenacao_matriculas_base_v4(
  p_unidade_id uuid,
  p_ano integer,
  p_mes integer,
  p_periodicidade text,
  p_data_corte date
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_periodo record;
  v_unidade record;
  v_documento public.fechamento_mensal_snapshots%rowtype;
  v_item jsonb;
  v_linha record;
  v_professor_id integer;
  v_total integer := 0;
  v_atribuidas integer := 0;
  v_sem_professor integer := 0;
  v_total_fonte integer;
  v_origem_completa boolean := true;
  v_por_professor jsonb := '{}'::jsonb;
  v_documentos jsonb := '[]'::jsonb;
begin
  for v_periodo in
    select * from public.relatorio_coordenacao_periodos_v4(
      p_ano, p_mes, p_periodicidade, p_data_corte
    ) order by competencia
  loop
    for v_unidade in
      select * from public.relatorio_coordenacao_unidades_v4(p_unidade_id)
      order by unidade_id
    loop
      v_documento := null;
      v_total_fonte := 0;

      select s.* into v_documento
      from public.fechamento_mensal_snapshots s
      where s.ano = extract(year from v_periodo.competencia)::integer
        and s.mes = extract(month from v_periodo.competencia)::integer
        and s.escopo = 'unidade'
        and s.unidade_id = v_unidade.unidade_id
        and s.dominio = 'relatorio_comercial_mensal'
        and s.status in ('preview', 'aprovado', 'fechado', 'retificado')
        and jsonb_typeof(s.payload -> 'matriculas') = 'array'
      order by s.versao desc
      limit 1;

      if v_documento.id is not null then
        if exists (
          select 1
          from jsonb_array_elements(v_documento.payload -> 'matriculas') item
          where not (item ? 'professor_experimental_id_fechado')
        ) then
          raise exception 'RELATORIO_COORDENACAO_V4_AUTORIA_COMERCIAL_NAO_CONGELADA: documento %',
            v_documento.id using errcode = '22000';
        end if;

        for v_item in
          select value
          from jsonb_array_elements(v_documento.payload -> 'matriculas')
        loop
          v_total_fonte := v_total_fonte + 1;
          v_professor_id := nullif(v_item ->> 'professor_experimental_id_fechado', '')::integer;

          if v_professor_id is null then
            v_sem_professor := v_sem_professor + 1;
          else
            v_atribuidas := v_atribuidas + 1;
            v_por_professor := jsonb_set(
              v_por_professor,
              array[v_professor_id::text],
              to_jsonb(coalesce((v_por_professor ->> v_professor_id::text)::integer, 0) + 1),
              true
            );
          end if;
        end loop;

        v_documentos := v_documentos || jsonb_build_array(jsonb_build_object(
          'competencia', v_periodo.competencia,
          'unidade_id', v_unidade.unidade_id,
          'tipo', 'relatorio_comercial_mensal',
          'documento_id', v_documento.id,
          'versao', v_documento.versao,
          'hash', v_documento.payload_hash,
          'capturado_em', v_documento.capturado_em,
          'matriculas', v_total_fonte,
          'autoria', 'professor_experimental_id_fechado'
        ));
      elsif v_periodo.competencia = date_trunc('month', current_date)::date then
        for v_linha in
          select m.aluno_id, a.professor_experimental_id
          from public.matriculas_comerciais_v1(
            v_unidade.unidade_id,
            v_periodo.inicio,
            v_periodo.fim + 1
          ) m
          join public.alunos a on a.id = m.aluno_id
          where m.conta is true
          order by m.data_matricula, m.aluno_id
        loop
          v_total_fonte := v_total_fonte + 1;
          v_professor_id := v_linha.professor_experimental_id;
          if v_professor_id is null then
            v_sem_professor := v_sem_professor + 1;
          else
            v_atribuidas := v_atribuidas + 1;
            v_por_professor := jsonb_set(
              v_por_professor,
              array[v_professor_id::text],
              to_jsonb(coalesce((v_por_professor ->> v_professor_id::text)::integer, 0) + 1),
              true
            );
          end if;
        end loop;

        v_documentos := v_documentos || jsonb_build_array(jsonb_build_object(
          'competencia', v_periodo.competencia,
          'unidade_id', v_unidade.unidade_id,
          'tipo', 'periodo_em_andamento',
          'matriculas', v_total_fonte,
          'data_corte', v_periodo.fim
        ));
      else
        v_origem_completa := false;
        v_documentos := v_documentos || jsonb_build_array(jsonb_build_object(
          'competencia', v_periodo.competencia,
          'unidade_id', v_unidade.unidade_id,
          'tipo', 'fechamento_comercial_ausente',
          'matriculas', null
        ));
      end if;

      v_total := v_total + v_total_fonte;
    end loop;
  end loop;

  return jsonb_build_object(
    'origem_completa', v_origem_completa,
    'matriculas_total', case when v_origem_completa then v_total else null end,
    'matriculas_atribuidas_professor', case
      when v_origem_completa then v_atribuidas else null end,
    'matriculas_sem_professor', case
      when v_origem_completa then v_sem_professor else null end,
    'por_professor', case when v_origem_completa then v_por_professor else '{}'::jsonb end,
    'documentos', v_documentos,
    'regra', 'matriculas_comerciais_por_professor_experimental_fechado'
  );
end;
$function$;

create or replace function public.relatorio_coordenacao_matriculas_v4(
  p_unidade_id uuid,
  p_ano integer,
  p_mes integer,
  p_periodicidade text,
  p_data_corte date
)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select public.relatorio_coordenacao_matriculas_base_v4(
    p_unidade_id,
    p_ano,
    p_mes,
    p_periodicidade,
    p_data_corte
  );
$function$;

revoke all on function public.relatorio_coordenacao_matriculas_base_v4(
  uuid, integer, integer, text, date
) from public, anon, authenticated;
grant execute on function public.relatorio_coordenacao_matriculas_base_v4(
  uuid, integer, integer, text, date
) to service_role;

revoke all on function public.relatorio_coordenacao_matriculas_v4(
  uuid, integer, integer, text, date
) from public, anon, authenticated;
grant execute on function public.relatorio_coordenacao_matriculas_v4(
  uuid, integer, integer, text, date
) to service_role;

comment on function public.relatorio_coordenacao_matriculas_v4(
  uuid, integer, integer, text, date
) is
  'Matriculador da Coordenacao V4; fechamentos usam exclusivamente o professor_experimental_id persistido no documento comercial.';

commit;
