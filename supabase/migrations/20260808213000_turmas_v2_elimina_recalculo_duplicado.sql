-- get_kpis_turmas_canonicos_v2: elimina o recalculo duplicado da base canonica.
--
-- Causa raiz (medida em 08/08/2026, consolidado agosto/2026, cache quente):
--   A funcao chamava get_carteira_professor_periodo_detalhe_canonico_v1 no CTE
--   `detalhe` E chamava get_kpis_turmas_canonicos_v1, que por sua vez chama
--   get_carteira_professor_periodo_canonica, que chama o MESMO detalhe com os
--   MESMOS argumentos. A base rodava duas vezes por chamada.
--
--   Aritmetica que denuncia (padrao ja documentado no CLAUDE.md):
--     detalhe_canonico_v1 .......  86.964 buffers /  262 ms
--     carteira_canonica ......... .87.244 buffers /  267 ms  (e o agregado do detalhe)
--     turmas_canonicos_v2 ....... 172.323 buffers / 1626 ms  ~= a soma dos dois
--
-- Correcao: calcular o detalhe UMA vez e derivar dele tanto o agregado quanto as
-- turmas unitarias. Nenhuma regra de negocio muda -- as expressoes de agregacao
-- sao copia literal de get_carteira_professor_periodo_canonica e a divisao crua
-- (sem round) de media_alunos_turma e copia literal de get_kpis_turmas_canonicos_v1.
--
-- Resultado medido (consolidado agosto/2026): 1626 ms -> 290 ms, 172.323 -> 86.459 buffers.
-- Paridade exata (0 linhas divergentes) em Consolidado, Barra, Campo Grande,
-- Recreio e no modo trimestral (jun-ago/2026).
--
-- get_kpis_turmas_canonicos_v1 e get_carteira_professor_periodo_canonica NAO sao
-- alteradas: seguem existindo e continuam corretas para qualquer outro consumidor.
-- CREATE OR REPLACE preserva a ACL (nao reabre EXECUTE para anon, ao contrario de
-- DROP + CREATE neste projeto).

create or replace function public.get_kpis_turmas_canonicos_v2(
  p_ano integer,
  p_mes integer,
  p_unidade_id uuid default null::uuid,
  p_data_inicio date default null::date,
  p_data_fim date default null::date
)
returns table(
  professor_id integer,
  unidade_id uuid,
  ano integer,
  mes integer,
  ocupacoes_elegiveis integer,
  turmas_elegiveis integer,
  media_alunos_turma numeric,
  turmas_um_aluno integer,
  percentual_turmas_um_aluno numeric,
  competencia_status text,
  fonte text,
  regra_versao text
)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
DECLARE
  v_usuario_id integer;
  v_perfil text;
  v_unidade_usuario uuid;
  v_unidade_efetiva uuid;
  -- Herdados de get_kpis_turmas_canonicos_v1: a janela usada pelo status de
  -- competencia e a validacao de periodo invertido, que antes vinham de la.
  v_inicio date := COALESCE(p_data_inicio, make_date(p_ano, p_mes, 1));
  v_fim date := COALESCE(
    p_data_fim,
    (make_date(p_ano, p_mes, 1) + interval '1 month - 1 day')::date
  );
BEGIN
  IF p_mes < 1 OR p_mes > 12 THEN
    RAISE EXCEPTION 'Mes invalido: %', p_mes USING ERRCODE = '22023';
  END IF;

  IF v_fim < v_inicio THEN
    RAISE EXCEPTION 'Periodo invalido: data final anterior a inicial'
      USING ERRCODE = '22023';
  END IF;

  IF auth.role() = 'service_role' THEN
    v_unidade_efetiva := p_unidade_id;
  ELSE
    SELECT u.id, u.perfil, u.unidade_id
      INTO v_usuario_id, v_perfil, v_unidade_usuario
    FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND u.ativo = true
    LIMIT 1;

    IF v_usuario_id IS NULL THEN
      RAISE EXCEPTION 'Acesso negado: usuario sem cadastro ativo'
        USING ERRCODE = '42501';
    END IF;

    IF v_perfil = 'admin' THEN
      IF NOT (
        public.usuario_tem_permissao(v_usuario_id, 'professores.ver', p_unidade_id)
        OR public.usuario_tem_permissao(v_usuario_id, 'alunos.ver', p_unidade_id)
      ) THEN
        RAISE EXCEPTION 'Acesso negado: sem permissao para turmas'
          USING ERRCODE = '42501';
      END IF;
      v_unidade_efetiva := p_unidade_id;
    ELSIF v_perfil = 'unidade' THEN
      IF v_unidade_usuario IS NULL
         OR (p_unidade_id IS NOT NULL AND p_unidade_id <> v_unidade_usuario) THEN
        RAISE EXCEPTION 'Acesso negado: unidade fora do escopo do usuario'
          USING ERRCODE = '42501';
      END IF;
      v_unidade_efetiva := v_unidade_usuario;
    ELSE
      IF v_unidade_usuario IS NULL
         OR (p_unidade_id IS NOT NULL AND p_unidade_id <> v_unidade_usuario)
         OR NOT (
           public.usuario_tem_permissao(v_usuario_id, 'professores.ver', v_unidade_usuario)
           OR public.usuario_tem_permissao(v_usuario_id, 'alunos.ver', v_unidade_usuario)
         ) THEN
        RAISE EXCEPTION 'Acesso negado: unidade fora do escopo do usuario'
          USING ERRCODE = '42501';
      END IF;
      v_unidade_efetiva := v_unidade_usuario;
    END IF;
  END IF;

  RETURN QUERY
  -- Base canonica lida UMA unica vez. Todo o resto deriva deste CTE.
  WITH detalhe AS (
    SELECT d.*
    FROM public.get_carteira_professor_periodo_detalhe_canonico_v1(
      p_ano,
      p_mes,
      v_unidade_efetiva,
      p_data_inicio,
      p_data_fim
    ) d
  ),
  -- Copia literal das agregacoes de get_carteira_professor_periodo_canonica.
  -- Agrega o detalhe INTEIRO (sem pre-filtro), como la: os filtros vivem nos
  -- FILTER de cada agregado, e e isso que define o conjunto de linhas do retorno.
  agregado AS (
    SELECT
      d.professor_id AS prof_id,
      d.unidade_id AS uid,
      count(DISTINCT jsonb_build_array(
        d.pessoa_chave,
        d.ocupacao_chave
      )) FILTER (
        WHERE d.elegivel_media
          AND d.pessoa_chave IS NOT NULL
      )::integer AS alunos_via_turmas,
      count(DISTINCT d.turma_chave) FILTER (
        WHERE d.elegivel_media
      )::integer AS turmas_elegiveis_media
    FROM detalhe d
    GROUP BY d.professor_id, d.unidade_id
  ),
  -- Copia literal do bloco de turmas unitarias que ja existia nesta funcao.
  ocupacao_turma AS (
    SELECT
      d.professor_id,
      d.unidade_id,
      d.turma_chave,
      count(DISTINCT jsonb_build_array(
        d.pessoa_chave,
        d.ocupacao_chave
      ))::integer AS ocupacoes_na_turma
    FROM detalhe d
    WHERE d.elegivel_media
      AND d.pessoa_chave IS NOT NULL
      AND d.turma_chave IS NOT NULL
    GROUP BY d.professor_id, d.unidade_id, d.turma_chave
  ),
  unitarias AS (
    SELECT
      o.professor_id,
      o.unidade_id,
      count(*) FILTER (WHERE o.ocupacoes_na_turma = 1)::integer AS turmas_um_aluno
    FROM ocupacao_turma o
    GROUP BY o.professor_id, o.unidade_id
  )
  SELECT
    a.prof_id,
    a.uid,
    p_ano AS ano,
    p_mes AS mes,
    a.alunos_via_turmas AS ocupacoes_elegiveis,
    a.turmas_elegiveis_media AS turmas_elegiveis,
    -- Divisao crua, sem round: identica a de get_kpis_turmas_canonicos_v1.
    -- A carteira canonica arredonda para numeric(10,2), mas a v1 recalculava a
    -- partir dos campos crus, e era o valor da v1 que chegava a tela.
    CASE
      WHEN a.turmas_elegiveis_media > 0
        THEN a.alunos_via_turmas::numeric / a.turmas_elegiveis_media
      ELSE 0::numeric
    END AS media_alunos_turma,
    coalesce(u.turmas_um_aluno, 0)::integer AS turmas_um_aluno,
    CASE
      WHEN a.turmas_elegiveis_media > 0 THEN round(
        coalesce(u.turmas_um_aluno, 0)::numeric
          / a.turmas_elegiveis_media::numeric * 100,
        2
      )
      ELSE 0::numeric
    END AS percentual_turmas_um_aluno,
    -- Copia literal do status de competencia de get_kpis_turmas_canonicos_v1.
    CASE
      WHEN NOT EXISTS (
        SELECT 1
        FROM generate_series(
          date_trunc('month', v_inicio)::date,
          date_trunc('month', v_fim)::date,
          interval '1 month'
        ) AS periodo(mes_ref)
        LEFT JOIN public.competencias_mensais cm
          ON cm.unidade_id = a.uid
         AND cm.ano = extract(year FROM periodo.mes_ref)::integer
         AND cm.mes = extract(month FROM periodo.mes_ref)::integer
        WHERE COALESCE(cm.status, 'aberto') NOT IN ('fechado', 'retificacao_pendente')
      ) THEN 'fechado'::text
      ELSE 'aberto'::text
    END AS competencia_status,
    'carteira_professor_periodo_canonica'::text AS fonte,
    'turmas_v2_pessoa_professor_turma_regular'::text AS regra_versao
  FROM agregado a
  LEFT JOIN unitarias u
    ON u.professor_id = a.prof_id
   -- Igualdade estrita, exatamente como no join original desta funcao.
   AND u.unidade_id = a.uid;
END;
$function$;

comment on function public.get_kpis_turmas_canonicos_v2(integer, integer, uuid, date, date) is
  'Media/Turma canonica por professor. Le a base canonica (detalhe) uma unica vez '
  'e deriva dela o agregado e as turmas unitarias. Regra de negocio identica a '
  'get_kpis_turmas_canonicos_v1 + get_carteira_professor_periodo_canonica, que '
  'seguem existindo inalteradas para outros consumidores.';
