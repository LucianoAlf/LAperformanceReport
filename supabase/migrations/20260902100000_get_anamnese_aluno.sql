-- LAPE-19 — fonte unica de leitura da anamnese.
-- Spec:  docs/superpowers/specs/2026-09-01-anamnese-por-pessoa-design.md
-- Plano: docs/superpowers/plans/2026-09-01-anamnese-por-pessoa.md (Task 3)
--
-- A ficha, o link publico e o texto de WhatsApp passam a ler daqui. Reimplementar
-- a resolucao em cada consumidor foi a causa-raiz das duplicatas de renovacao --
-- nao repetir o padrao na leitura.

create or replace function public.get_anamnese_aluno(p_aluno_id integer)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_chave   text;
  v_unidade uuid;
  v_anam    public.anamneses%rowtype;
  v_curso   text;
  v_resp    jsonb;
  v_ant     jsonb;
begin
  select v.pessoa_chave, v.unidade_id into v_chave, v_unidade
    from public.vw_aluno_pessoa_chave v where v.aluno_id = p_aluno_id;

  if v_chave is null then
    return jsonb_build_object('anamnese', null, 'procedencia', null, 'anteriores', '[]'::jsonb);
  end if;

  -- A vigente e a completa mais recente da PESSOA (nao desta matricula).
  select * into v_anam
    from public.anamneses
   where unidade_id = v_unidade and pessoa_chave = v_chave and status = 'completa'
   order by created_at desc
   limit 1;

  if not found then
    return jsonb_build_object('anamnese', null, 'procedencia', null, 'anteriores', '[]'::jsonb);
  end if;

  -- Procedencia: em qual matricula ela foi respondida. E o que alimenta a faixa
  -- "respondida na matricula de Violao" na ficha dos outros cursos.
  select c.nome into v_curso
    from public.alunos a left join public.cursos c on c.id = a.curso_id
   where a.id = v_anam.aluno_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'pergunta_numero', r.pergunta_numero,
           'resposta_posicao', r.resposta_posicao) order by r.pergunta_numero), '[]'::jsonb)
    into v_resp
    from public.anamnese_respostas_perfil r where r.anamnese_id = v_anam.id;

  -- Historico: a antiga perde para a mais nova, mas nao some da tela.
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', x.id, 'created_at', x.created_at, 'tipo_formulario', x.tipo_formulario)
           order by x.created_at desc), '[]'::jsonb)
    into v_ant
    from public.anamneses x
   where x.unidade_id = v_unidade and x.pessoa_chave = v_chave
     and x.status = 'completa' and x.id <> v_anam.id;

  return jsonb_build_object(
    'anamnese', to_jsonb(v_anam) || jsonb_build_object('anamnese_respostas_perfil', v_resp),
    'procedencia', jsonb_build_object(
      'aluno_id', v_anam.aluno_id,
      'curso_nome', v_curso,
      'respondida_em', v_anam.created_at,
      'e_esta_matricula', v_anam.aluno_id = p_aluno_id
    ),
    'anteriores', v_ant
  );
end;
$function$;

revoke execute on function public.get_anamnese_aluno(integer) from public;
revoke execute on function public.get_anamnese_aluno(integer) from anon;
grant execute on function public.get_anamnese_aluno(integer) to authenticated, service_role;

-- get_anamnese_publica: unica mudanca e parar de expor o professor.
--
-- Ela resolvia o professor por alunos.professor_atual_id da linha vinculada. Com
-- a anamnese valendo para todos os cursos, o professor de Bateria abriria o link
-- e leria o nome do professor de Violao. E nao ha alternativa: a pagina e aberta
-- por TOKEN e nao sabe quem esta do outro lado.
--
-- O app externo (anamnese-la-music/src/components/PerfilPublico.tsx:340) ja trata
-- o campo como nulavel e so renderiza quando existe -- a linha some sozinha.
create or replace function public.get_anamnese_publica(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_anam anamneses%ROWTYPE;
  v_unidade_nome text;
  v_aluno_nome text;
  v_aluno_data_nascimento date;
  v_respostas jsonb;
BEGIN
  IF p_token IS NULL OR length(p_token) < 16 THEN
    RETURN NULL;
  END IF;

  SELECT *
    INTO v_anam
    FROM anamneses
   WHERE share_token = p_token
     AND status = 'completa'
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT nome INTO v_unidade_nome FROM unidades WHERE id = v_anam.unidade_id;

  IF v_anam.aluno_id IS NOT NULL THEN
    SELECT a.nome, a.data_nascimento
      INTO v_aluno_nome, v_aluno_data_nascimento
      FROM alunos a
     WHERE a.id = v_anam.aluno_id;
  END IF;

  SELECT COALESCE(
           jsonb_agg(
             jsonb_build_object(
               'pergunta_numero', pergunta_numero,
               'resposta_posicao', resposta_posicao
             ) ORDER BY pergunta_numero
           ),
           '[]'::jsonb
         )
    INTO v_respostas
    FROM anamnese_respostas_perfil
   WHERE anamnese_id = v_anam.id;

  RETURN jsonb_build_object(
    'id', v_anam.id,
    'tipo_formulario', v_anam.tipo_formulario,
    'created_at', v_anam.created_at,
    'modo_resposta', v_anam.modo_resposta,
    'nome_aluno', v_anam.nome_aluno,
    'data_nascimento', v_aluno_data_nascimento,
    'genero', v_anam.genero,
    'telefone_aluno', v_anam.telefone_aluno,
    'aluno_nome_oficial', v_aluno_nome,
    'professor_nome', null,
    'unidade_nome', v_unidade_nome,
    'cursos_escolhidos', v_anam.cursos_escolhidos,
    'possui_instrumento', v_anam.possui_instrumento,
    'objetivos', v_anam.objetivos,
    'tempo_para_metas', v_anam.tempo_para_metas,
    'tempo_disponivel_estudo', v_anam.tempo_disponivel_estudo,
    'generos_musicais', v_anam.generos_musicais,
    'instrumentos_toca', v_anam.instrumentos_toca,
    'experiencia_anterior', v_anam.experiencia_anterior,
    'nivel_conhecimento_musical', v_anam.nivel_conhecimento_musical,
    'nivel_habilidade_instrumento', v_anam.nivel_habilidade_instrumento,
    'interesse_bandas', v_anam.interesse_bandas,
    'motivo_procura_pais', v_anam.motivo_procura_pais,
    'metas_pais', v_anam.metas_pais,
    'fonte_exposicao_musical', v_anam.fonte_exposicao_musical,
    'musicos_na_familia', v_anam.musicos_na_familia,
    'interesse_instrumento_cantar', v_anam.interesse_instrumento_cantar,
    'exposicao_telas', v_anam.exposicao_telas,
    'comunicacao_crianca', v_anam.comunicacao_crianca,
    'sono_crianca', v_anam.sono_crianca,
    'estereotipias', v_anam.estereotipias,
    'quem_traz_crianca', v_anam.quem_traz_crianca,
    'diagnosticos', v_anam.diagnosticos,
    'diagnosticos_outro', v_anam.diagnosticos_outro,
    'cuidado_medico', v_anam.cuidado_medico,
    'medicacao_continua', v_anam.medicacao_continua,
    'necessidade_apoio', v_anam.necessidade_apoio,
    'perfil_baby', v_anam.perfil_baby,
    'temperamento_primario', v_anam.temperamento_primario,
    'temperamento_secundario', v_anam.temperamento_secundario,
    'temperamento_codinome', v_anam.temperamento_codinome,
    'respostas_perfil', v_respostas,
    'observacoes_entrevistador', v_anam.observacoes_entrevistador
  );
END;
$function$;

-- Recriar funcao reabre EXECUTE para anon neste schema (ALTER DEFAULT PRIVILEGES).
-- Aqui anon e DESEJADO: o app externo chama esta funcao com a anon key.
revoke execute on function public.get_anamnese_publica(text) from public;
grant execute on function public.get_anamnese_publica(text) to anon, authenticated, service_role;
