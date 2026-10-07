-- (1) PERFORMANCE: a view normalizava telefone a CADA leitura. fn_normalizar_telefone_br_key
--     e IMMUTABLE e PARALLEL SAFE, mas o corpo tem CTEs -> o planner NAO a inlineia e ela
--     roda uma vez por linha (o plano chegava a montar um Memoize so para segura-la).
--     Passa a ler as colunas geradas telefone_key (migration 20260922230000).
--     Medido: 1.104 ms -> 65 ms, com ZERO divergencia em estado, grupo, telefone,
--     de_quem e total de contatos.
--
-- (2) CORRECAO DE NAO-DETERMINISMO: o nome do contato saia de (array_agg(...))[1] SEM
--     ORDER BY. Como 391 telefones tem DOIS cadastros (o proprio aluno E o responsavel,
--     371 dos casos), o nome exibido era o que a ordem fisica do plano entregasse: puro
--     sorteio, que mudava sozinho quando o plano mudava. Foi a troca do item (1) que
--     revelou -- a paridade EXCEPT acusou 82 linhas, todas no nome.
--     Agora a view DECLARA OS DOIS em contato_nomes: mesma regra do de_quem dizer
--     "do aluno e do responsavel" em vez de eleger um lado.
--     contato_nome/contato_parentesco continuam existindo para nao quebrar consumidor,
--     agora DETERMINISTICOS: o que nao e proprio primeiro (acrescenta informacao),
--     depois o principal, depois o cadastro mais antigo.
--
-- ROLLBACK: recriar a definicao anterior (git: este arquivo antes deste commit).

create or replace view public.vw_aluno_comunidade_wa_v1 as
WITH fones AS (
         SELECT a_1.id AS aluno_id, a_1.unidade_id, pc.pessoa_chave,
            f.fone_key AS telefone_key, f.origem, f.fone::text AS telefone_original,
            NULL::text AS contato_nome, NULL::text AS contato_parentesco, false AS contato_principal,
            NULL::bigint AS contato_ordem
           FROM alunos a_1
             JOIN vw_aluno_pessoa_chave pc ON pc.aluno_id = a_1.id
             JOIN vw_aluno_pessoa_chave irmas ON irmas.pessoa_chave = pc.pessoa_chave AND irmas.unidade_id = pc.unidade_id
             JOIN alunos a2 ON a2.id = irmas.aluno_id
             CROSS JOIN LATERAL ( VALUES ('aluno'::text,a2.telefone,a2.telefone_key),
                                        ('aluno'::text,a2.whatsapp,a2.whatsapp_key),
                                        ('responsavel'::text,a2.responsavel_telefone,a2.responsavel_telefone_key)
                                ) f(origem, fone, fone_key)
          WHERE f.fone_key IS NOT NULL
        UNION ALL
         SELECT a_1.id, a_1.unidade_id, pc.pessoa_chave, ac.telefone_key,
            'contato_extra'::text, ac.telefone::text, ac.nome::text, ac.parentesco::text,
            COALESCE(ac.principal, false), ac.id::bigint
           FROM alunos a_1
             JOIN vw_aluno_pessoa_chave pc ON pc.aluno_id = a_1.id
             JOIN vw_aluno_pessoa_chave irmas ON irmas.pessoa_chave = pc.pessoa_chave AND irmas.unidade_id = pc.unidade_id
             JOIN aluno_contatos ac ON ac.aluno_id = irmas.aluno_id
          WHERE ac.telefone_key IS NOT NULL
        ), fones_agg AS (
         SELECT fones.aluno_id, fones.unidade_id, fones.pessoa_chave, fones.telefone_key,
            bool_or(fones.origem = 'aluno'::text) AS e_do_aluno,
            bool_or(fones.origem = 'responsavel'::text) AS e_do_responsavel,
            bool_or(fones.origem = 'contato_extra'::text) AS e_contato_extra,
            bool_or(fones.contato_principal) AS e_contato_principal,
            (array_agg(fones.telefone_original ORDER BY (length(fones.telefone_original)) DESC, fones.telefone_original))[1] AS telefone_exibicao,
            jsonb_agg(DISTINCT jsonb_build_object('nome', fones.contato_nome, 'parentesco', fones.contato_parentesco))
              FILTER (WHERE fones.contato_nome IS NOT NULL) AS contato_nomes,
            (array_agg(fones.contato_nome ORDER BY (lower(coalesce(fones.contato_parentesco,'')) = 'proprio'), fones.contato_principal DESC, fones.contato_ordem)
               FILTER (WHERE fones.contato_nome IS NOT NULL))[1] AS contato_nome,
            (array_agg(fones.contato_parentesco ORDER BY (lower(coalesce(fones.contato_parentesco,'')) = 'proprio'), fones.contato_principal DESC, fones.contato_ordem)
               FILTER (WHERE fones.contato_parentesco IS NOT NULL))[1] AS contato_parentesco
           FROM fones
          GROUP BY fones.aluno_id, fones.unidade_id, fones.pessoa_chave, fones.telefone_key
        ), grupos_ativos AS (
         SELECT g.id, g.unidade_id, g.nome,
            ( SELECT max(p.capturado_em) FROM comunidade_wa_participantes p WHERE p.grupo_id = g.id) AS ultima_captura
           FROM comunidade_wa_grupos g WHERE g.ativo
        ), captura_global AS (
         SELECT max(grupos_ativos.ultima_captura) AS mais_recente, count(*) AS total_grupos FROM grupos_ativos
        ), matches AS (
         SELECT f.aluno_id, f.unidade_id AS aluno_unidade_id, g.id AS grupo_id, g.unidade_id AS grupo_unidade_id,
            g.nome AS grupo_nome, g.ultima_captura, f.telefone_key, f.telefone_exibicao, f.contato_nome,
            f.contato_parentesco, f.contato_nomes, f.e_contato_principal,
                CASE WHEN f.e_do_aluno AND f.e_do_responsavel THEN 'aluno_e_responsavel'::text
                     WHEN f.e_do_aluno THEN 'aluno'::text
                     WHEN f.e_do_responsavel THEN 'responsavel'::text
                     ELSE 'contato_extra'::text END AS de_quem
           FROM fones_agg f
             JOIN comunidade_wa_participantes p ON p.telefone_key = f.telefone_key
             JOIN grupos_ativos g ON g.id = p.grupo_id
        ), match_escolhido AS (
         SELECT DISTINCT ON (m.aluno_id) m.aluno_id, m.grupo_id, m.grupo_nome, m.grupo_unidade_id,
            m.grupo_unidade_id = m.aluno_unidade_id AS grupo_mesma_unidade, m.ultima_captura
           FROM matches m
          ORDER BY m.aluno_id, (m.grupo_unidade_id = m.aluno_unidade_id) DESC, m.ultima_captura DESC NULLS LAST, m.grupo_id
        ), contatos_do_grupo AS (
         SELECT mm.aluno_id,
            (array_agg(mm.telefone_exibicao ORDER BY mm.ord, mm.telefone_key))[1] AS contato_telefone,
            (array_agg(mm.de_quem ORDER BY mm.ord, mm.telefone_key))[1] AS contato_de_quem,
            (array_agg(mm.contato_nome ORDER BY mm.ord, mm.telefone_key))[1] AS contato_nome,
            (array_agg(mm.contato_parentesco ORDER BY mm.ord, mm.telefone_key))[1] AS contato_parentesco,
            (array_agg(mm.contato_nomes ORDER BY mm.ord, mm.telefone_key))[1] AS contato_nomes,
            count(*)::integer AS contatos_no_grupo_total,
            jsonb_agg(jsonb_build_object('telefone', mm.telefone_exibicao, 'de_quem', mm.de_quem,
                                         'nome', mm.contato_nome, 'parentesco', mm.contato_parentesco,
                                         'nomes', mm.contato_nomes) ORDER BY mm.ord, mm.telefone_key) AS contatos_no_grupo
           FROM ( SELECT m.aluno_id, m.aluno_unidade_id, m.grupo_id, m.grupo_unidade_id, m.grupo_nome,
                    m.ultima_captura, m.telefone_key, m.telefone_exibicao, m.contato_nome, m.contato_parentesco,
                    m.contato_nomes, m.e_contato_principal, m.de_quem,
                        CASE m.de_quem WHEN 'aluno_e_responsavel'::text THEN 1 WHEN 'aluno'::text THEN 2
                             WHEN 'responsavel'::text THEN 3 ELSE 4 END
                        + CASE WHEN m.e_contato_principal THEN '-1'::integer ELSE 0 END AS ord
                   FROM matches m) mm
             JOIN match_escolhido me_1 ON me_1.aluno_id = mm.aluno_id AND me_1.grupo_id = mm.grupo_id
          GROUP BY mm.aluno_id
        ), outros_grupos AS (
         SELECT m.aluno_id, array_agg(DISTINCT m.grupo_nome ORDER BY m.grupo_nome) AS nomes
           FROM matches m JOIN match_escolhido me_1 ON me_1.aluno_id = m.aluno_id AND m.grupo_id <> me_1.grupo_id
          GROUP BY m.aluno_id
        )
 SELECT a.id AS aluno_id, a.unidade_id,
        CASE WHEN me.aluno_id IS NOT NULL THEN 'na_comunidade'::text
             WHEN cg.total_grupos = 0 THEN 'sem_grupo_configurado'::text
             WHEN cg.mais_recente IS NULL THEN 'sem_captura'::text
             WHEN cg.mais_recente < (now() - '2 days'::interval) THEN 'captura_desatualizada'::text
             ELSE 'fora_da_comunidade'::text END AS estado,
    me.grupo_id, me.grupo_nome, me.grupo_unidade_id, me.grupo_mesma_unidade,
    me.ultima_captura AS capturado_em, og.nomes AS outros_grupos_nomes,
    cdg.contato_telefone, cdg.contato_de_quem, cdg.contato_nome, cdg.contato_parentesco,
    cdg.contatos_no_grupo_total, cdg.contatos_no_grupo, cdg.contato_nomes
   FROM alunos a
     CROSS JOIN captura_global cg
     LEFT JOIN match_escolhido me ON me.aluno_id = a.id
     LEFT JOIN outros_grupos og ON og.aluno_id = a.id
     LEFT JOIN contatos_do_grupo cdg ON cdg.aluno_id = a.id;

-- a view le comunidade_wa_grupos/_participantes, que tem RLS ligada e ZERO policy: roda
-- como dono (security_invoker = false), e por isso o grant e NOMINAL, nunca por default --
-- ALTER DEFAULT PRIVILEGES daria arwdDxtm a authenticated.
revoke all on public.vw_aluno_comunidade_wa_v1 from public, anon;
grant select on public.vw_aluno_comunidade_wa_v1 to authenticated, service_role;

comment on view public.vw_aluno_comunidade_wa_v1 is
  'Estado do aluno na comunidade WhatsApp. Le alunos.telefone_key/whatsapp_key/responsavel_telefone_key e aluno_contatos.telefone_key (colunas geradas) - NAO chamar fn_normalizar_telefone_br_key aqui, era o gargalo (1.104 ms -> 65 ms). contato_nomes declara TODOS os cadastros daquele numero (tipicamente o proprio aluno e o responsavel); contato_nome e so o primeiro, deterministico. Nunca exibir telefone_key: ela descarta o 9o digito.';
