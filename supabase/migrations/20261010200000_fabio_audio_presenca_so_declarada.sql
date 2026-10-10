-- 20261010200000 — presença por áudio vale só para quem o áudio declara
--
-- Caso real (09/10 Recreio, aula 73294327): o áudio do professor Akeem falava
-- só do Levi ("O aluno Levi hoje estudou a música Lilás do Djavan..."). O
-- worker do Fábio criou uma fatia por aluno do roster — a do Caio era casca
-- vazia (presenca='presente' sem progresso/observação nenhuma). Na confirmação,
-- fabio_emitir_presenca_registro_canonica_v2_interno reduzia as fatias a uma
-- lista de ausentes e fabio_criar_comando_chamada_v2 marcava PRESENTE todo o
-- roster fora dela. Resultado: aluno_presenca do Caio ficou 'presente' por
-- 'fabio_audio' às 20:09 sem o professor ter dito isso; a secretaria lançou
-- 'falta' às 20:11 e o slot ficou em conflito permanente ("está com falta no
-- report e no Emusys, mas consta como conflito" — Vitória).
--
-- Duas invenções, dois pontos de correção:
--
--   1) fabio_criar_registro — fatia de áudio cujo único conteúdo é
--      presenca='presente' nu é placeholder de roster, não declaração do
--      professor. Não vira filho. 'ausente' (mesmo sem conteúdo) continua
--      valendo: falta declarada nunca é preenchimento automático.
--
--   2) fabio_emitir_presenca_registro_canonica_v2_interno — para fonte
--      fabio_audio a emissão passa a escrever só nas fatias que declaram
--      presença, aluno a aluno, via o novo
--      fabio_emitir_presenca_audio_itens_v2_interno (a porta v2 de comandos
--      exige itens = roster inteiro, o que reintroduziria o broadcast).
--      Aluno do roster sem declaração fica sem_resposta e entra na fila da
--      equipe, que lança 100% todo dia. modo_entrada='manual' (LA Teacher)
--      segue com o comportamento de chamada completa: lá o professor marca
--      cada fatia na tela.
--
--   3) Correção do dado: a linha fantasma do Caio (aluno_presenca
--      35b98028-..., aula 73294327) é desfeita pelo mesmo ramo canônico do
--      status 'indeterminado' de app_registrar_chamada_agenda — retificação
--      registrada em nome da Vitória (usuária 34, que verificou com o
--      professor), linha volta ao estado bruto do Emusys e os dois registros
--      espelhados em aluno_presenca_conflitos são resolvidos. Sem delete:
--      rastro fica em aluno_presenca_retificacoes e presenca_acao_eventos.

-- ============================================================
-- 1) fabio_criar_registro — casca de áudio não declara presença
-- ============================================================

create or replace function public.fabio_criar_registro(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_audio_text text := nullif(btrim(p_payload ->> 'audio_id'), '');
  v_audio_id uuid;
  v_aula_id integer := (p_payload ->> 'aula_id')::integer;
  v_professor integer := (p_payload ->> 'professor_id')::integer;
  v_unidade uuid;
  v_ancora public.aulas_emusys%rowtype;
  v_aula_fatia public.aulas_emusys%rowtype;
  v_alvo_canonico integer;
  v_aluno_fatia integer;
  v_aula_do_aluno integer;
  v_molde text := coalesce(p_payload ->> 'molde', 'C');
  v_tronco_id uuid;
  v_tronco_campos jsonb := coalesce(p_payload -> 'tronco' -> 'campos', '{}'::jsonb);
  v_fatia jsonb;
  v_fatia_campos jsonb;
  v_fatia_aula integer;
  v_qtd_fatias integer := 0;
  v_origem text := 'app';
  v_audio_status text;
  v_audio_erro_tipo text;
begin
  if v_aula_id is null then raise exception 'aula_id obrigatorio'; end if;
  if v_professor is null then raise exception 'professor_id obrigatorio'; end if;

  select * into v_ancora
    from public.aulas_emusys
   where id = v_aula_id
     and professor_id = v_professor
     and coalesce(cancelada, false) = false;
  if not found then raise exception 'aula_nao_pertence_ao_professor'; end if;
  v_unidade := v_ancora.unidade_id;

  if v_audio_text is not null then
    begin
      v_audio_id := v_audio_text::uuid;
    exception when invalid_text_representation then
      raise exception 'audio_id_invalido';
    end;
    select f.origem, f.status, f.erro_tipo
      into v_origem, v_audio_status, v_audio_erro_tipo
      from public.fabio_fila_audios f
     where f.id = v_audio_id
       and f.professor_id = v_professor
       and f.aula_id = v_ancora.id
       and f.unidade_id = v_unidade
     for update;
    if not found then
      raise exception 'audio_id_invalido';
    end if;
    if v_audio_status = 'erro_terminal'
       or v_audio_erro_tipo = 'semantico_terminal' then
      raise exception 'audio_terminal_nao_normalizavel';
    end if;
  end if;

  if v_audio_id is not null then
    select id into v_tronco_id from public.fabio_registros_aula
     where audio_id = v_audio_id and parent_id is null limit 1;
    if v_tronco_id is not null then
      return jsonb_build_object('status', 'ja_existe', 'registro_id', v_tronco_id);
    end if;
  end if;

  -- 15/09/2026 -- O AUDIO QUE COMPLEMENTA NAO VIRA FICHA NOVA, EM PORTA NENHUMA.
  -- "Corrigir por voz" grava na ficha de origem campos.audio_complemento_id =
  -- este audio. O worker direto ja pergunta isso antes de criar (f07498e);
  -- quando ele falha e o Hermes assume, a ferramenta chama ESTA funcao e a
  -- ficha nova nascia do mesmo jeito que antes do conserto. A pergunta mora
  -- aqui, no banco, para valer para qualquer chamador. A fusao e a da funcao
  -- que ja esta no ar; o campo do aviso de aluno divergente nao e gaveta de
  -- complemento e sai do payload (a funcao recusa chave desconhecida).
  if v_audio_id is not null then
    select r.id into v_tronco_id
      from public.fabio_registros_aula r
     where r.parent_id is null
       and r.aula_id = v_aula_id
       and r.professor_id = v_professor
       and r.status in ('rascunho', 'aguardando_confirmacao')
       and r.campos ->> 'audio_complemento_id' = v_audio_id::text
     limit 1;
    if v_tronco_id is not null then
      return public.fabio_complementar_registro_aula(
        v_audio_id, p_payload #- '{tronco,campos,alunos_divergentes}');
    end if;
  end if;

  insert into public.fabio_registros_aula
    (aula_id, unidade_id, professor_id, aluno_id, parent_id, molde, campos,
     texto_consolidado, status, origem, audio_id)
  values
    (v_aula_id, v_unidade, v_professor, null, null, v_molde,
     v_tronco_campos,
     public.fn_compor_texto_prontuario(v_tronco_campos, '{}'::jsonb),
     'aguardando_confirmacao', v_origem, v_audio_id)
  returning id into v_tronco_id;

  for v_fatia in select * from jsonb_array_elements(coalesce(p_payload -> 'fatias', '[]'::jsonb))
  loop
    if jsonb_typeof(v_fatia) <> 'object' then raise exception 'fatia_invalida'; end if;
    v_aluno_fatia := nullif(v_fatia ->> 'aluno_id', '')::integer;
    if v_aluno_fatia is null then raise exception 'fatia_sem_aluno'; end if;
    -- 10/09/2026: o aluno pertence a SESSAO, nao so a ancora. Quem esta na
    -- ancora sai com v_aula_do_aluno = v_aula_id e tudo abaixo e o de antes;
    -- o aluno da aula irma resolve o alvo a partir da aula DELE.
    select s.aula_emusys_id into v_aula_do_aluno
      from public.fn_roster_da_sessao(v_aula_id) s
     where s.aluno_id = v_aluno_fatia;
    if v_aula_do_aluno is null then
      raise exception 'fatia_aluno_fora_do_roster';
    end if;

    v_alvo_canonico := public.fn_aula_individual_do_aluno_ou_null(v_aula_do_aluno, v_aluno_fatia);
    -- Sem alvo seguro (aluno faltou, individual cancelada): fatia VAZIA e
    -- pulada -- nao ha conteudo a perder nem onde grava-lo sem vazar. Fatia
    -- COM conteudo cai na trava original, que continua recusando.
    if v_alvo_canonico is null then
      if not exists (
        select 1 from jsonb_each_text(coalesce(v_fatia -> 'campos', '{}'::jsonb)) kv
         where nullif(btrim(coalesce(kv.value, '')), '') is not null
      ) then
        continue;
      end if;
      perform public.fn_aula_individual_do_aluno(v_aula_do_aluno, v_aluno_fatia);
    end if;
    v_fatia_aula := coalesce(nullif(v_fatia ->> 'aula_id', '')::integer, v_alvo_canonico);
    select * into v_aula_fatia
      from public.aulas_emusys
     where id = v_fatia_aula
       and coalesce(cancelada, false) = false;
    if not found then raise exception 'fatia_aula_nao_encontrada'; end if;
    if v_aula_fatia.professor_id is distinct from v_professor then
      raise exception 'fatia_aula_nao_pertence_ao_professor';
    end if;
    if v_aula_fatia.unidade_id is distinct from v_ancora.unidade_id
       or v_aula_fatia.id is distinct from v_alvo_canonico then
      raise exception 'fatia_aula_fora_da_sessao';
    end if;
    if not exists (
      select 1
        from public.aula_alunos_emusys aa
       where aa.aula_emusys_id = v_fatia_aula
         and aa.aluno_id = v_aluno_fatia
    ) then
      raise exception 'fatia_aluno_fora_da_sessao';
    end if;

    v_fatia_campos := public.fn_remover_campos_comuns_da_fatia(
      v_tronco_campos,
      coalesce(v_fatia -> 'campos', '{}'::jsonb)
    );

    -- 10/10/2026 -- casca de audio nao declara presenca. O worker preenche a
    -- turma inteira com presenca='presente' e mais nada quando o audio so
    -- fala de alguns alunos; filho nascido assim vira 'presente' fantasma na
    -- presenca (09/10, Caio/Recreio). Fatia de audio que so tem o sinal nu --
    -- sem progresso/observacao/repertorio nem nada -- e preenchimento de
    -- roster, nao declaracao do professor: nao nasce filho. 'ausente' vale
    -- sempre (falta nunca e preenchimento automatico).
    if v_audio_id is not null
       and coalesce(v_fatia_campos ->> 'presenca', '') = 'presente'
       and not exists (
         select 1
           from jsonb_each_text(
                  v_fatia_campos
                  - '{presenca,aula_alvo_resolvida,inferidos}'::text[]
                ) kv
          where nullif(btrim(coalesce(kv.value, '')), '') is not null
       ) then
      continue;
    end if;

    insert into public.fabio_registros_aula
      (aula_id, unidade_id, professor_id, aluno_id, parent_id, molde, campos,
       texto_consolidado, status, origem, audio_id)
    values
      (v_fatia_aula, v_unidade, v_professor,
       v_aluno_fatia, v_tronco_id, v_molde,
       v_fatia_campos,
       public.fn_compor_texto_prontuario(v_tronco_campos, v_fatia_campos),
       'aguardando_confirmacao', v_origem, v_audio_id);
    v_qtd_fatias := v_qtd_fatias + 1;
  end loop;

  if v_audio_id is not null then
    update public.fabio_fila_audios
       set status = 'normalizado', atualizado_em = now()
     where id = v_audio_id;
  end if;

  return jsonb_build_object('status', 'criado', 'registro_id', v_tronco_id, 'fatias', v_qtd_fatias);
end
$function$;

-- ============================================================
-- 2) emitir presenca do registro — audio emite so o declarado
--
-- O comando canonico v2 exige paridade itens = roster (a chamada v2 e uma
-- declaracao de aula inteira por construcao). Um audio-relatorio que fala de
-- UM aluno nao cabe nesse contrato sem mentir no resto. Por isso o ramo de
-- audio passa a gravar por aluno declarado, com a mesma guarda de
-- divergencia da porta do professor: decisao humana forte divergente nao e
-- sobrescrita — vira conflito aberto (a divergencia aparece, como manda a
-- regra das gavetas).
-- ============================================================

create or replace function public.fabio_emitir_presenca_audio_itens_v2_interno(
  p_request_id uuid,
  p_registro_id uuid,
  p_aula_ancora_id integer
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_aula     public.aulas_emusys%rowtype;
  v_fatia    record;
  v_atual    public.aluno_presenca%rowtype;
  v_status   text;
  v_gravados integer := 0;
  v_repetidos integer := 0;
  v_divergentes integer := 0;
  v_gemeos   integer;
begin
  -- mesma janela de chamada que o caminho do comando impunha
  select * into v_aula
    from public.aulas_emusys
   where id = p_aula_ancora_id
   for update;
  if not found then
    return jsonb_build_object('status', 'falhou', 'motivo', 'aula_nao_encontrada');
  end if;
  if v_aula.data_hora_inicio > now() + interval '15 minutes' then
    return jsonb_build_object('status', 'falhou', 'motivo', 'chamada_ainda_nao_disponivel');
  end if;
  if coalesce(v_aula.data_hora_fim, v_aula.data_hora_inicio)
       < now() - (public.fn_janela_registro_dias() || ' days')::interval then
    return jsonb_build_object('status', 'falhou', 'motivo', 'janela_de_chamada_encerrada');
  end if;

  for v_fatia in
    select f.aluno_id,
           case f.campos ->> 'presenca'
             when 'ausente' then 'falta'
             else 'presente'
           end as status_declarado
      from public.fabio_registros_aula f
      join public.aula_alunos_emusys r
        on r.aula_emusys_id = v_aula.id
       and r.aluno_id = f.aluno_id
       and r.ativo_operacional
     where f.parent_id = p_registro_id
       and f.aluno_id is not null
       and f.campos ->> 'presenca' in ('presente', 'ausente')
     order by f.aluno_id
  loop
    v_status := v_fatia.status_declarado;

    select * into v_atual
      from public.aluno_presenca
     where aula_emusys_id = v_aula.id
       and aluno_id = v_fatia.aluno_id
     for update;

    -- decisao humana forte divergente na propria linha: o audio nao desempata,
    -- mesmo padao do comando (on conflict where not forte). A divergencia
    -- aparece onde a regra das gavetas manda: o sync de gemeos abaixo gera
    -- 'decisoes_gemeas_divergentes' quando as linhas irmao discordam, e a
    -- declaracao divergente fica auditada na fatia + no carimbo do registro.
    if found
       and public.fn_presenca_e_forte(v_atual.respondido_por)
       and v_atual.status_presenca is distinct from v_status then
      v_divergentes := v_divergentes + 1;
      continue;
    end if;

    if found
       and v_atual.status_presenca is not distinct from v_status
       and public.fn_presenca_e_forte(v_atual.respondido_por) then
      v_repetidos := v_repetidos + 1;
      continue;
    end if;

    if found then
      update public.aluno_presenca
         set status = case when v_status = 'presente' then 'presente' else 'ausente' end,
             status_presenca = v_status,
             respondido_por = 'fabio_audio',
             respondido_em = now(),
             espelhado_de_presenca_id = null
       where id = v_atual.id;
    else
      insert into public.aluno_presenca(
        aluno_id, aula_emusys_id, professor_id, unidade_id, data_aula,
        horario_aula, status, status_presenca, curso_nome, turma_nome,
        sala_nome, respondido_por, respondido_em
      ) values (
        v_fatia.aluno_id, v_aula.id, v_aula.professor_id, v_aula.unidade_id,
        v_aula.data_aula,
        (v_aula.data_hora_inicio at time zone 'America/Sao_Paulo')::time,
        case when v_status = 'presente' then 'presente' else 'ausente' end,
        v_status,
        v_aula.curso_nome, v_aula.turma_nome, v_aula.sala_nome,
        'fabio_audio', now()
      );
    end if;
    v_gravados := v_gravados + 1;
  end loop;

  v_gemeos := public.fn_sincronizar_gemeos_presenca(v_aula.id);

  return jsonb_build_object(
    'status', case when v_divergentes > 0 then 'parcial' else 'concluido' end,
    'aplicado', true,
    'gravados', v_gravados,
    'repetidos', v_repetidos,
    'divergentes', v_divergentes,
    'gemeos_sincronizados', coalesce(v_gemeos, 0)
  );
end
$function$;

-- interno como os irmaos: so postgres executa (mesmo ACL de
-- fabio_registrar_presencas_aula_canonica_v2_interno)
revoke all on function public.fabio_emitir_presenca_audio_itens_v2_interno(uuid, uuid, integer)
  from public, anon, authenticated, service_role;

create or replace function public.fabio_emitir_presenca_registro_canonica_v2_interno(p_registro_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_reg public.fabio_registros_aula%rowtype;
  v_aula_reg public.aulas_emusys%rowtype;
  v_ausentes integer[];
  v_ancora integer;
  v_roster_ind integer;
  v_tem_sinal boolean;
  v_res jsonb;
  v_fonte text;
  v_request_id uuid := md5('fabio-registro:' || p_registro_id::text)::uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and current_setting('app.presenca_fabio_trusted', true) is distinct from 'on' then
    raise exception 'service_role_obrigatorio' using errcode = '42501';
  end if;

  select *
    into v_reg
    from public.fabio_registros_aula
   where id = p_registro_id
     and parent_id is null;
  if not found then
    return jsonb_build_object(
      'aplicado', false,
      'motivo', 'registro_nao_encontrado'
    );
  end if;

  v_fonte := case
    when v_reg.modo_entrada = 'manual' then 'professor_la_teacher'
    else 'fabio_audio'
  end;
  select *
    into v_aula_reg
    from public.aulas_emusys
   where id = v_reg.aula_id;
  if not found then
    update public.fabio_registros_aula
       set campos = coalesce(campos, '{}'::jsonb) || jsonb_build_object(
         'presenca_emitida', true,
         'presenca_emitida_em', now(),
         'presenca_aplicado', false,
         'presenca_erro', 'aula_do_registro_nao_encontrada',
         'presenca_fonte', v_fonte,
         'presenca_request_id', v_request_id
       )
     where id = p_registro_id;
    return jsonb_build_object(
      'aula_id', v_reg.aula_id,
      'aplicado', false,
      'motivo', 'aula_do_registro_nao_encontrada',
      'request_id', v_request_id
    );
  end if;

  if v_reg.aluno_id is not null then
    v_ancora := v_reg.aula_id;
    select count(*)
      into v_roster_ind
      from public.aula_alunos_emusys
     where aula_emusys_id = v_ancora
       and aluno_id is not null
       and ativo_operacional;
    if coalesce(v_roster_ind, 0) > 1 then
      update public.fabio_registros_aula
         set campos = coalesce(campos, '{}'::jsonb) || jsonb_build_object(
           'presenca_emitida', true,
           'presenca_emitida_em', now(),
           'presenca_aplicado', false,
           'presenca_erro', 'registro_individual_em_aula_de_turma',
           'presenca_fonte', v_fonte,
           'presenca_request_id', v_request_id
         )
       where id = p_registro_id;
      return jsonb_build_object(
        'aula_id', v_ancora,
        'aplicado', false,
        'motivo', 'registro_individual_em_aula_de_turma'
      );
    end if;
    v_tem_sinal := (v_reg.campos ->> 'presenca') is not null;
    v_ausentes := case
      when coalesce(v_reg.campos ->> 'presenca', 'presente') = 'ausente'
        then array[v_reg.aluno_id]
      else '{}'::integer[]
    end;
  else
    if coalesce(v_aula_reg.tipo, '') = 'turma' then
      v_ancora := v_reg.aula_id;
    else
      select coalesce((
        select t.id
          from public.aulas_emusys t
         where t.tipo = 'turma'
           and t.unidade_id = v_aula_reg.unidade_id
           and t.data_hora_inicio = v_aula_reg.data_hora_inicio
           and t.professor_id is not distinct from v_reg.professor_id
           and not coalesce(t.cancelada, false)
         limit 1
      ), v_reg.aula_id)
        into v_ancora;
    end if;

    if v_fonte = 'fabio_audio' then
      -- 10/10/2026 -- audio vale so para quem a fatia declara. O caminho de
      -- ausentes + broadcast ("todo o roster fora da lista estava presente")
      -- transformava casca preenchida pelo worker em decisao humana do
      -- professor. Sinal agora e so fatia declarada que resolve na ancora;
      -- aluno do roster sem declaracao nao recebe nada -- fica sem_resposta
      -- e entra na fila da equipe (que lanca 100% todo dia).
      v_tem_sinal := exists (
        select 1
          from public.fabio_registros_aula f
          join public.aula_alunos_emusys r
            on r.aula_emusys_id = v_ancora
           and r.aluno_id = f.aluno_id
           and r.ativo_operacional
         where f.parent_id = p_registro_id
           and f.aluno_id is not null
           and f.campos ->> 'presenca' in ('presente', 'ausente')
      );
      v_ausentes := '{}'::integer[];
    else
      select coalesce(array_agg(f.aluno_id) filter (
        where coalesce(f.campos ->> 'presenca', 'presente') = 'ausente'
          and f.aluno_id is not null
      ), '{}'::integer[])
        into v_ausentes
        from public.fabio_registros_aula f
       where f.parent_id = p_registro_id;
      v_tem_sinal := exists (
        select 1
          from public.fabio_registros_aula f
         where f.parent_id = p_registro_id
           and (f.campos ->> 'presenca') is not null
      );
    end if;
  end if;

  -- 12/09: também carimba. Sem isto, "a emissão não rodou" e "rodou e não
  -- havia sinal nenhum" ficavam iguais para quem lê o registro depois.
  if not coalesce(v_tem_sinal, false) then
    update public.fabio_registros_aula
       set campos = coalesce(campos, '{}'::jsonb) || jsonb_build_object(
         'presenca_emitida', false,
         'presenca_emitida_em', now(),
         'presenca_aplicado', false,
         'presenca_erro', 'sem_sinal_de_presenca_no_registro',
         'presenca_fonte', v_fonte,
         'presenca_request_id', v_request_id
       )
     where id = p_registro_id;
    return jsonb_build_object(
      'aula_id', v_ancora,
      'aplicado', false,
      'motivo', 'sem_sinal_de_presenca_no_registro'
    );
  end if;

  -- 12/09: a recusa do comando (roster_nao_confirmado, aula_cancelada...) vinha
  -- como EXCEÇÃO e era engolida pelo gancho — o registro ficava sem carimbo e o
  -- laudo dizia "a emissão não rodou". Recusa também é resposta: carimba e volta.
  begin
    if v_fonte = 'fabio_audio' and v_reg.aluno_id is null then
      -- audio emite por aluno declarado, sem broadcast de roster.
      v_res := public.fabio_emitir_presenca_audio_itens_v2_interno(
        v_request_id, p_registro_id, v_ancora
      );
    else
      v_res := public.fabio_registrar_presencas_aula_canonica_v2_interno(
        v_request_id,
        v_reg.professor_id,
        v_ancora,
        v_ausentes,
        v_fonte
      );
    end if;
  exception when others then
    update public.fabio_registros_aula
       set campos = coalesce(campos, '{}'::jsonb) || jsonb_build_object(
         'presenca_emitida', true,
         'presenca_emitida_em', now(),
         'presenca_aplicado', false,
         'presenca_erro', sqlerrm,
         'presenca_fonte', v_fonte,
         'presenca_request_id', v_request_id
       )
     where id = p_registro_id;
    return jsonb_build_object(
      'aula_id', v_ancora,
      'aplicado', false,
      'motivo', sqlerrm,
      'request_id', v_request_id
    );
  end;

  -- 12/09: o status fora do trio conhecido ('concluido', 'parcial', 'falhou')
  -- saía por um return próprio, SEM carimbar. Não precisa de ramo: o carimbo
  -- abaixo já escreve qualquer status em `presenca_erro` e só marca
  -- `presenca_aplicado` quando concluiu.
  update public.fabio_registros_aula
     set campos = coalesce(campos, '{}'::jsonb) || jsonb_build_object(
       'presenca_emitida', true,
       'presenca_emitida_em', now(),
       'presenca_aplicado', v_res ->> 'status' = 'concluido','presenca_diag',public.fn_presenca_diagnostico_v1(v_res),
       'presenca_erro', case
         when v_res ->> 'status' = 'concluido' then null
         else v_res ->> 'status'
       end,
       'presenca_fonte', v_fonte,
       'presenca_request_id', v_request_id
     )
   where id = p_registro_id;
  return v_res || jsonb_build_object(
    'ausentes', to_jsonb(coalesce(v_ausentes, '{}'::integer[])),
    'fonte', v_fonte
  );
end
$function$;

-- ============================================================
-- 3) correção do dado: presença fantasma do Caio na aula 73294327
--    (09/10 Recreio) — mesmo ramo 'indeterminado' de
--    app_registrar_chamada_agenda, com retificação auditada.
-- ============================================================

do $$
declare
  v_presenca public.aluno_presenca%rowtype;
  v_status_anterior text;
begin
  select * into v_presenca
    from public.aluno_presenca
   where id = '35b98028-fece-4068-89b4-07295e25e002'::uuid
   for update;

  if not found then
    raise exception 'correcao_caio: linha de presenca esperada nao existe';
  end if;

  if v_presenca.aluno_id is distinct from 464
     or v_presenca.aula_emusys_id is distinct from 73294327
     or v_presenca.respondido_por is distinct from 'fabio_audio'
     or v_presenca.status_presenca is distinct from 'presente' then
    raise exception 'correcao_caio: a linha mudou de estado -- revisar antes de corrigir';
  end if;

  v_status_anterior := coalesce(
    v_presenca.status_presenca,
    case v_presenca.status when 'presente' then 'presente' when 'ausente' then 'falta' end
  );

  insert into public.aluno_presenca_retificacoes (
    aluno_presenca_id, unidade_id, status_anterior, status_novo,
    respondido_por_anterior, respondido_em_anterior,
    motivo, autor_usuario_id, autor_auth_user_id
  ) values (
    v_presenca.id, v_presenca.unidade_id, v_status_anterior, 'indeterminado',
    v_presenca.respondido_por, v_presenca.respondido_em,
    'Audio do professor mencionava apenas o Levi; a presenca do Caio foi preenchimento automatico do roster (verificado com o professor pela Vitoria).',
    34, 'fc179389-8334-45f0-b91d-4ab76ded7750'::uuid
  );

  update public.aluno_presenca
     set status = case
           when lower(coalesce(emusys_presenca_bruta, '')) = 'presente' then 'presente'
           when emusys_presenca_bruta is not null then 'ausente'
           else 'pendente'
         end,
         status_presenca = case
           when lower(coalesce(emusys_presenca_bruta, '')) = 'presente' then 'presente'
           else null
         end,
         respondido_por = case
           when emusys_presenca_bruta is not null then 'emusys'
           else 'sistema'
         end,
         respondido_em = null,
         espelhado_de_presenca_id = null
   where id = v_presenca.id;

  -- os dois lados do conflito gemeo ficam resolvidos: a decisao fantasma saiu
  update public.aluno_presenca_conflitos
     set estado = 'resolvido',
         resolvido_em = now(),
         resolucao = 'decisao_humana_retirada',
         atualizado_em = now()
   where estado = 'aberto'
     and (
       aluno_presenca_id = v_presenca.id
       or aluno_presenca_gemea_id = v_presenca.id
     );
end
$$;
