-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

create or replace function public.fn_experimental_pendencia_do_professor(p_professor_id integer)
returns jsonb language sql stable security definer set search_path to 'public'
as $$
  -- Ruling 17 (22/08/2026): o corte pela janela mora AQUI, na mesma funcao
  -- que fn_experimental_escalonadas usa pro lado da coordenacao
  -- (fn_janela_experimental_dias), nao numa variavel de ambiente do worker
  -- Python. As duas janelas (aluno: FABIO_ESCALONAMENTO_DIAS: registro;
  -- experimental: fn_janela_experimental_dias) sao botoes INDEPENDENTES que
  -- so batem em valor hoje por coincidencia (3 e 3) — se o worker filtrasse
  -- em Python por ESCALONAMENTO_DIAS, mudar essa env var pra trilha do aluno
  -- mudaria em silencio ate onde o professor e cobrado pela experimental, e
  -- a Task 5 (que le fn_janela_experimental_dias direto) continuaria
  -- escalando no valor antigo — a mesma cobranca em dobro que este filtro
  -- existe pra evitar, so que sem ninguem perceber a divergencia. Fonte
  -- unica: so fn_janela_experimental_dias() decide as duas pontas.
  select jsonb_build_object('ok', true, 'linhas', coalesce(
    jsonb_agg(
      jsonb_build_object(
        'vinculo_id', v.vinculo_id, 'nome_aluno', v.nome_aluno,
        'curso_nome', v.curso_nome, 'unidade_nome', v.unidade_nome,
        'quando', to_char(v.data_hora_fim at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI'),
        'dias_em_atraso', v.dias_em_atraso
      )
      order by v.data_hora_fim desc
    ), '[]'::jsonb))
  from public.vw_experimental_pendencia v
  where v.professor_id = p_professor_id
    and v.dias_em_atraso < public.fn_janela_experimental_dias();
$$;

comment on function public.fn_experimental_pendencia_do_professor(integer) is
  'O que esta pendente de devolutiva pro professor dado E AINDA DENTRO da janela (dias_em_atraso < fn_janela_experimental_dias()) — Ruling 17, 22/08/2026. Quem passou da janela ja aparece em fn_experimental_escalonadas() pra coordenacao; cobrar aqui tambem seria cobranca em dobro sem ninguem assumir, exatamente o que o comentario da funcao acima explica. NAO filtrar de novo em Python: mudar a janela e sempre mudar fn_janela_experimental_dias(), nunca uma env var do worker — as duas pontas (aqui e o escalonamento) tem que ler a MESMA fonte. p_professor_id e professores.id, NAO usuarios.id — join errado (usuarios.id) devolve a pendencia de OUTRA pessoa em silencio, sem erro (ja aconteceu: prof 10 = Isaque, usuario 10 = Jhonatan).';
