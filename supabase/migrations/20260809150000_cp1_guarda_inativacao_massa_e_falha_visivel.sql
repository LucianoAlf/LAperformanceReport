-- CP1 (parte 2) — Guarda contra inativacao em massa do catalogo + falha de materializacao visivel.
--
-- O QUE ACONTECEU EM 29/07/2026
-- Uma execucao do sync de Campo Grande gravou `catalogo_inativados: 37` (as 37 disciplinas
-- da unidade) e `atribuicoes_inativadas: 119`. Sem catalogo formal, a flag `materializavel`
-- de fn_professor_curso_modalidade_evidencias_v2 ficou vazia e a reconciliacao encerrou
-- 116 vinculos de professor. Na execucao seguinte o catalogo voltou inteiro — foi um evento
-- transitorio da API do Emusys, nao uma mudanca real da escola.
--
-- POR QUE AS GUARDAS EXISTENTES NAO PEGARAM
-- Esta funcao ja recusa finalizar quando `disciplinas_processadas <> disciplinas_esperadas`
-- (execucao_incompleta) ou quando ha falhas registradas (execucao_possui_falhas). E por isso
-- que os erros EMUSYS_HTTP_429 de 07-09/08 NAO corromperam nada: o run morre antes de
-- finalizar. Mas quando a API responde com sucesso e devolve um catalogo vazio ou muito
-- reduzido, `esperadas = processadas = 0` e `falhas = []` — passa por todas as checagens e
-- a inativacao apaga a unidade inteira. Foi exatamente esse o caminho de 29/07.
--
-- GUARDA
-- Antes de inativar, mede quanto do catalogo ativo sairia nesta execucao. Se sairia metade
-- ou mais (com piso de 5 linhas ativas, para nao travar unidade recem-criada), aborta sem
-- escrever nada. A excecao derruba a finalizacao inteira: a execucao nao vira 'completa',
-- a edge cai no markFailed e o operador ve 'falhou' em vez de perder o catalogo em silencio.
-- Mesmo padrao ja adotado em atualizar-inadimplencia-emusys, que aborta sem escrever quando
-- a paginacao da API vem incompleta.
-- Uma queda real e grande de catalogo continua possivel — mas passa a exigir decisao humana,
-- que e o ponto: destruicao silenciosa nao e recuperavel, uma execucao 'falhou' e.
--
-- FALHA DE MATERIALIZACAO VISIVEL
-- O bloco exception que envolve reconciliar_professor_curso_modalidade_v2 existe por bom
-- motivo (um erro na materializacao nao pode desfazer o sync do catalogo), mas o resultado
-- ficava so dentro de estatisticas->materializacao_v2, com status 'completa' no topo. Foi o
-- que escondeu por dias que Recreio e Barra estavam falhando. Agora a falha tambem entra em
-- `falhas`, o mesmo array que o operador ja le para distinguir execucao limpa de suja.
-- O status segue 'completa' de proposito: o sync do catalogo realmente completou.

create or replace function public.finalizar_sync_professor_disciplinas_emusys_v1(p_execucao_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_execucao public.emusys_professor_disciplinas_sync_execucoes%rowtype;
  v_catalogo_inativados integer := 0;
  v_atribuicoes_inativadas integer := 0;
  v_catalogo_ativo_antes integer := 0;
  v_catalogo_a_inativar integer := 0;
  v_atribuicoes_ativas_antes integer := 0;
  v_atribuicoes_a_inativar integer := 0;
  v_materializacao jsonb;
  c_piso_linhas constant integer := 5;
  c_fracao_maxima constant numeric := 0.5;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and session_user <> 'postgres' then
    raise exception 'acesso_negado'
      using errcode = '42501';
  end if;

  select execucao.*
    into v_execucao
  from public.emusys_professor_disciplinas_sync_execucoes execucao
  where execucao.id = p_execucao_id
  for update;

  if not found then
    raise exception 'execucao_nao_encontrada'
      using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'sync_professor_disciplinas_emusys:' || v_execucao.unidade_id::text,
      0
    )
  );

  if v_execucao.status <> 'em_andamento' then
    raise exception 'execucao_nao_esta_em_andamento';
  end if;

  if v_execucao.disciplinas_processadas
       is distinct from v_execucao.disciplinas_esperadas then
    raise exception 'execucao_incompleta';
  end if;

  if jsonb_typeof(v_execucao.falhas) <> 'array'
     or jsonb_array_length(v_execucao.falhas) > 0 then
    raise exception 'execucao_possui_falhas';
  end if;

  -- GUARDA (CP1): mede o estrago antes de causa-lo.
  select count(*) filter (where disciplina.ativo_origem),
         count(*) filter (
           where disciplina.ativo_origem
             and disciplina.ultima_execucao_id is distinct from p_execucao_id
         )
    into v_catalogo_ativo_antes, v_catalogo_a_inativar
  from public.emusys_disciplinas_catalogo disciplina
  where disciplina.unidade_id = v_execucao.unidade_id;

  select count(*) filter (where atribuicao.ativo_origem),
         count(*) filter (
           where atribuicao.ativo_origem
             and atribuicao.ultima_execucao_id is distinct from p_execucao_id
         )
    into v_atribuicoes_ativas_antes, v_atribuicoes_a_inativar
  from public.emusys_professor_disciplinas atribuicao
  where atribuicao.unidade_id = v_execucao.unidade_id;

  if v_catalogo_ativo_antes >= c_piso_linhas
     and v_catalogo_a_inativar::numeric / v_catalogo_ativo_antes >= c_fracao_maxima then
    raise exception
      'catalogo_inativacao_em_massa: % de % disciplinas ativas sairiam nesta execucao (limite %%%)',
      v_catalogo_a_inativar, v_catalogo_ativo_antes, (c_fracao_maxima * 100)::integer
      using errcode = 'P0001';
  end if;

  if v_atribuicoes_ativas_antes >= c_piso_linhas
     and v_atribuicoes_a_inativar::numeric / v_atribuicoes_ativas_antes >= c_fracao_maxima then
    raise exception
      'atribuicoes_inativacao_em_massa: % de % atribuicoes ativas sairiam nesta execucao (limite %%%)',
      v_atribuicoes_a_inativar, v_atribuicoes_ativas_antes, (c_fracao_maxima * 100)::integer
      using errcode = 'P0001';
  end if;

  update public.emusys_professor_disciplinas atribuicao
     set ativo_origem = false,
         sincronizado_em = now(),
         updated_at = now()
   where atribuicao.unidade_id = v_execucao.unidade_id
     and atribuicao.ativo_origem
     and atribuicao.ultima_execucao_id is distinct from p_execucao_id;
  get diagnostics v_atribuicoes_inativadas = row_count;

  update public.emusys_disciplinas_catalogo disciplina
     set ativo_origem = false,
         sincronizado_em = now(),
         updated_at = now()
   where disciplina.unidade_id = v_execucao.unidade_id
     and disciplina.ativo_origem
     and disciplina.ultima_execucao_id is distinct from p_execucao_id;
  get diagnostics v_catalogo_inativados = row_count;

  update public.emusys_professor_disciplinas_sync_execucoes execucao
     set status = 'completa',
         finalizado_em = now(),
         estatisticas = coalesce(execucao.estatisticas, '{}'::jsonb)
           || jsonb_build_object(
             'catalogo_inativados', v_catalogo_inativados,
             'atribuicoes_inativadas', v_atribuicoes_inativadas
           ),
         updated_at = now()
   where execucao.id = p_execucao_id;

  begin
    v_materializacao :=
      public.reconciliar_professor_curso_modalidade_v2(p_execucao_id);
  exception
    when others then
      v_materializacao := jsonb_build_object(
        'status', 'falhou',
        'sqlstate', sqlstate,
        'mensagem', sqlerrm
      );
  end;

  -- A falha da materializacao passa a aparecer em `falhas`, nao so no jsonb de estatisticas.
  update public.emusys_professor_disciplinas_sync_execucoes execucao
     set estatisticas = coalesce(execucao.estatisticas, '{}'::jsonb)
           || jsonb_build_object('materializacao_v2', v_materializacao),
         falhas = case
           when v_materializacao->>'status' = 'falhou'
             then coalesce(execucao.falhas, '[]'::jsonb)
               || jsonb_build_array(jsonb_build_object(
                    'etapa', 'materializacao',
                    'codigo', 'MATERIALIZACAO_V2_FALHOU',
                    'sqlstate', v_materializacao->>'sqlstate',
                    'mensagem', v_materializacao->>'mensagem'
                  ))
           else execucao.falhas
         end,
         updated_at = now()
   where execucao.id = p_execucao_id;

  return jsonb_build_object(
    'execucao_id', p_execucao_id,
    'unidade_id', v_execucao.unidade_id,
    'status', 'completa',
    'disciplinas_esperadas', v_execucao.disciplinas_esperadas,
    'disciplinas_processadas', v_execucao.disciplinas_processadas,
    'requisicoes', v_execucao.requisicoes,
    'catalogo_inativados', v_catalogo_inativados,
    'atribuicoes_inativadas', v_atribuicoes_inativadas,
    'materializacao_v2', v_materializacao
  );
end;
$function$;

comment on function public.finalizar_sync_professor_disciplinas_emusys_v1(uuid) is
  'Finaliza a execucao do sync de disciplinas do Emusys. CP1 (09/08/2026): aborta sem '
  'escrever quando metade ou mais do catalogo (ou das atribuicoes) ativo sairia numa unica '
  'execucao — foi assim que 29/07 apagou as 37 disciplinas de Campo Grande e encerrou 116 '
  'vinculos. Falha da materializacao agora tambem entra em `falhas`, nao so em estatisticas.';
