-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Correcao 1 da Tarefa 4: salvar_anamnese_online
--
-- Achado 1: o trigger trg_anamnese_atualiza_aluno copia anamneses.temperamento_codinome
-- para alunos.temperamento_codinome quando aluno_id is not null e status = 'completa'.
-- Como o insert original deixava as colunas temperamento_* de fora, elas entravam NULL
-- e o trigger apagava o temperamento que o aluno ja tinha. A decisao de nao aceitar
-- temperamento vindo do payload do cliente continua valendo: agora o servidor calcula
-- o temperamento a partir de p_perfil (mesma fonte usada para anamnese_respostas_perfil),
-- replicando o algoritmo de src/lib/temperamento.ts.
--
-- Achado 2: casts diretos para boolean/integer em campos livres do payload do cliente
-- (musicos_na_familia, interesse_instrumento_cantar, duracao_segundos) estouram 22P02
-- com qualquer texto nao conversivel, derrubando o insert inteiro. Ficam tolerantes:
-- so convertem quando o valor bate com o formato esperado, senao gravam null.

create or replace function public.salvar_anamnese_online(
  p_token     text,
  p_respostas jsonb,
  p_perfil    jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_convite anamnese_convites%rowtype;
  v_id      integer;
  v_r       jsonb := coalesce(p_respostas, '{}'::jsonb);

  -- calculo do temperamento a partir das respostas validas de p_perfil
  v_counts          integer[] := array[0,0,0,0];
  v_n_validos       integer := 0;
  v_rv              record;
  v_perfil_baby     boolean;
  v_pos_primario    integer;
  v_pos_secundario  integer;
  v_temp_primario   varchar;
  v_temp_secundario varchar;
  v_temp_codinome   varchar;
  v_temp_contagem   jsonb;

  v_nomes  constant varchar[] := array['colerico', 'sanguineo', 'fleumatico', 'melancolico'];
  v_codigos constant varchar[] := array['CAZUZA', 'SLASH', 'FRANK', 'AMY'];
begin
  select * into v_convite
    from anamnese_convites
   where token = p_token
     and usado_em is null
     and revogado_em is null
     and expira_em > now()
   for update;

  if not found then
    raise exception 'link invalido ou expirado' using errcode = '22023';
  end if;

  -- Mesmo filtro usado para anamnese_respostas_perfil: pergunta 1-11, posicao 1-4.
  for v_rv in
    select k::integer as pergunta_numero, v::integer as posicao
      from jsonb_each_text(coalesce(p_perfil, '{}'::jsonb)) as t(k, v)
     where k ~ '^([1-9]|1[01])$'
       and v ~ '^[1-4]$'
  loop
    v_counts[v_rv.posicao] := v_counts[v_rv.posicao] + 1;
    v_n_validos := v_n_validos + 1;
  end loop;

  if v_n_validos < 3 then
    v_perfil_baby := true;
  else
    v_perfil_baby := false;

    -- ordena as 4 posicoes por contagem decrescente e, em empate, posicao crescente
    -- (equivalente ao sort estavel de Object.entries em src/lib/temperamento.ts).
    select posicao into v_pos_primario
      from unnest(array[1,2,3,4]) as posicao
     order by v_counts[posicao] desc, posicao asc
     limit 1;

    select posicao into v_pos_secundario
      from unnest(array[1,2,3,4]) as posicao
     order by v_counts[posicao] desc, posicao asc
     offset 1 limit 1;

    v_temp_primario := v_nomes[v_pos_primario];
    v_temp_secundario := v_nomes[v_pos_secundario];
    v_temp_codinome := v_codigos[v_pos_primario] || '/' || v_codigos[v_pos_secundario];
    v_temp_contagem := jsonb_build_object(
      'colerico', v_counts[1],
      'sanguineo', v_counts[2],
      'fleumatico', v_counts[3],
      'melancolico', v_counts[4]
    );
  end if;

  -- Whitelist: so estas chaves do payload do cliente sao lidas. Tudo que
  -- identifica ou classifica a anamnese vem do convite, do servidor, ou
  -- (para o temperamento) do calculo acima sobre p_perfil - nunca do
  -- valor de temperamento que o navegador possa ter mandado em p_respostas.
  insert into anamneses (
    aluno_id, unidade_id, tipo_formulario, nome_aluno, telefone_aluno,
    share_token, entrevistador, modo_resposta, status, vinculo_status,
    duracao_segundos, created_by,
    genero, possui_instrumento, cursos_escolhidos, objetivos,
    tempo_para_metas, tempo_disponivel_estudo, experiencia_anterior,
    interesse_bandas, cuidado_medico, medicacao_continua, diagnosticos,
    necessidade_apoio, observacoes_entrevistador,
    generos_musicais, instrumentos_toca,
    nivel_conhecimento_musical, nivel_habilidade_instrumento,
    motivo_procura_pais, metas_pais, fonte_exposicao_musical,
    musicos_na_familia, interesse_instrumento_cantar, exposicao_telas,
    comunicacao_crianca, sono_crianca, estereotipias,
    situacao_responsaveis, filiacao, quem_traz_crianca,
    temperamento_primario, temperamento_secundario, temperamento_codinome,
    temperamento_contagem, perfil_baby
  ) values (
    v_convite.aluno_id,
    v_convite.unidade_id,
    v_convite.tipo_formulario,
    v_convite.nome_aluno,
    coalesce(nullif(btrim(v_r->>'telefone_aluno'), ''), v_convite.telefone_aluno),
    encode(extensions.gen_random_bytes(16), 'hex'),
    null,
    'online',
    'completa',
    case when v_convite.aluno_id is not null then 'vinculado' else 'pendente' end,
    case when v_r->>'duracao_segundos' ~ '^\d+$'
         then (v_r->>'duracao_segundos')::integer end,
    v_convite.criado_por,
    v_r->>'genero',
    v_r->>'possui_instrumento',
    v_r->>'cursos_escolhidos',
    coalesce(v_r->'objetivos', '[]'::jsonb),
    v_r->>'tempo_para_metas',
    v_r->>'tempo_disponivel_estudo',
    coalesce(v_r->'experiencia_anterior', '[]'::jsonb),
    v_r->>'interesse_bandas',
    v_r->>'cuidado_medico',
    v_r->>'medicacao_continua',
    coalesce(v_r->'diagnosticos', '[]'::jsonb),
    v_r->>'necessidade_apoio',
    v_r->>'observacoes_entrevistador',
    coalesce(v_r->'generos_musicais', '[]'::jsonb),
    coalesce(v_r->'instrumentos_toca', '[]'::jsonb),
    v_r->>'nivel_conhecimento_musical',
    v_r->>'nivel_habilidade_instrumento',
    coalesce(v_r->'motivo_procura_pais', '[]'::jsonb),
    coalesce(v_r->'metas_pais', '[]'::jsonb),
    coalesce(v_r->'fonte_exposicao_musical', '[]'::jsonb),
    case when v_r->>'musicos_na_familia' in ('true', 'false')
         then (v_r->>'musicos_na_familia')::boolean end,
    case when v_r->>'interesse_instrumento_cantar' in ('true', 'false')
         then (v_r->>'interesse_instrumento_cantar')::boolean end,
    v_r->>'exposicao_telas',
    v_r->>'comunicacao_crianca',
    coalesce(v_r->'sono_crianca', '[]'::jsonb),
    v_r->>'estereotipias',
    v_r->>'situacao_responsaveis',
    v_r->>'filiacao',
    coalesce(v_r->'quem_traz_crianca', '[]'::jsonb),
    v_temp_primario,
    v_temp_secundario,
    v_temp_codinome,
    v_temp_contagem,
    v_perfil_baby
  )
  returning id into v_id;

  -- Respostas do perfil comportamental. Posicoes fora de 1..4 sao descartadas.
  insert into anamnese_respostas_perfil (anamnese_id, pergunta_numero, resposta_posicao)
  select v_id, k::integer, v::integer
    from jsonb_each_text(coalesce(p_perfil, '{}'::jsonb)) as t(k, v)
   where k ~ '^([1-9]|1[01])$'
     and v ~ '^[1-4]$';

  update anamnese_convites
     set usado_em = now(), anamnese_id = v_id
   where id = v_convite.id;

  return jsonb_build_object('anamnese_id', v_id);
end;
$$;

grant execute on function public.salvar_anamnese_online(text, jsonb, jsonb) to anon, authenticated;
