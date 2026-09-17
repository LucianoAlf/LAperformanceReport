-- upsert_lead: declaracao manual para de sobrescrever prova tecnica de clique.
--
-- O PROBLEMA, flagrado no log em 17/09/2026
-- `canal_origem_id = coalesce(v_canal_id, canal_origem_id)` faz o ULTIMO a falar ganhar.
-- Como o Emusys manda o canal a cada atualizacao do lead, ele desfaz o que a atribuicao
-- apurou. Medido: o lead 9674 tinha canal Instagram (correto) e virou "Indicacao" em
-- 11/06 porque o Emusys mandou isso num update posterior. Hoje sao 18 leads com
-- meta_ctwa_clid e canal que contradiz a prova.
--
-- A REGRA, e por que ela e estreita de proposito
-- So protege quando o canal gravado CONCORDA com a prova tecnica:
--
--   gclid + canal=Google ............. protegido (foi a atribuicao do Google que gravou)
--   ctwa_clid + canal=Instagram/Face .. protegido (idem, lado Meta)
--   gclid + canal=Indicacao .......... LIVRE -- o Emusys continua mandando
--
-- O terceiro caso e livre de proposito: um clique pode ser REENGAJAMENTO. Lead que entrou
-- em maio declarado "Indicacao" e clicou num anuncio em setembro tem prova de clique sem
-- que o clique o tenha trazido -- ali quem esta certo e a declaracao, e travar a coluna
-- congelaria o erro ao contrario. Medido: dos 18 contraditorios, 1 tem o clique 117 dias
-- depois da criacao do lead, e 8 tem no mesmo dia.
--
-- ⚠️ NAO E TRIGGER, e isso e deliberado. Um trigger em `leads` protegeria a coluna em
-- TODO caminho de escrita -- inclusive a edicao humana pela tela, que ficaria revertida em
-- silencio. Aqui o escopo e so o sync automatico (emusys/nocodb/campanha): quem corrige a
-- mao pela tela continua conseguindo corrigir.

CREATE OR REPLACE FUNCTION public.upsert_lead(p_nome text, p_telefone text, p_email text, p_unidade_id uuid, p_curso text, p_canal text, p_source_id integer, p_source_type text DEFAULT 'emusys'::text, p_arquivar boolean DEFAULT false, p_data_contato date DEFAULT NULL::date, p_data_nascimento date DEFAULT NULL::date)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_lead_id       integer;
  v_curso_id      integer;
  v_canal_id      integer;
  v_telefone_safe text;
  v_action        text;
  v_detalhes      jsonb;
  v_log_nome      text;
begin
  if upper(trim(coalesce(p_nome, ''))) = 'NÃO INFORMADO' then
    p_nome := null;
  end if;

  v_log_nome := coalesce(nullif(trim(p_nome), ''), '(sem nome)');

  v_curso_id := case upper(trim(unaccent(coalesce(p_curso, ''))))
    when 'TECLADO' then 16 when 'PIANO' then 18
    when 'VIOLAO' then 10 when 'GUITARRA' then 14
    when 'CANTO' then 6  when 'BATERIA' then 27
    when 'MUSICALIZACAO' then 4 when 'UKULELE' then 8
    when 'VIOLINO' then 12 when 'FLAUTA DOCE' then 20
    when 'CONTRABAIXO' then 21 when 'SAX' then 31
    when 'CAVAQUINHO' then 35 when 'FLAUTA TRANSVERSA' then 37
    when 'VOZ' then 6
    when 'MUSICA' then 4
    when 'MUSICALIZACAO INFANTIL' then 4
    when 'MUSICALIZACAO BEBES' then 2
    when 'MUSICALIZACAO PARA BEBES' then 2
    when 'MUSICALIZACAO PREPARATORIA' then 40
    when 'SAXOFONE' then 31
    when 'FLAUTA TRANSVERSAL' then 37
    else null
  end;

  p_canal := case upper(trim(p_canal))
    when 'WHATSAPP' then 'Facebook'
    when 'SITE DA ESCOLA' then 'Google'
    when 'INTERNET' then 'Google'
    when 'E-MAIL MARKETING' then 'Google'
    when 'EX ALUNO' then 'Ex-aluno'
    when 'PLACA DA FACHADA' then 'Visita/Placa'
    when 'AMIGO' then 'Indicação'
    when 'VISITA' then 'Visita/Placa'
    when 'PROFESSOR' then 'Indicação'
    when 'ALUNO DA ESCOLA' then 'Indicação'
    when 'DIGITAL INFLUENCER' then 'Instagram'
    when 'TELEFONE' then 'Ligação'
    when 'SMS' then 'Convênios'
    when 'PANFLETOS' then 'Convênios'
    when 'PESQUISA DE RUA' then 'Convênios'
    when 'SHOPPING' then 'Convênios'
    when 'COMERCIOS' then 'Convênios'
    when 'LOJA DE MÚSICA' then 'Convênios'
    when 'IGREJA' then 'Convênios'
    when 'RECITAL' then 'Convênios'
    when 'JORNAL' then 'Convênios'
    when 'RÁDIO' then 'Convênios'
    when 'REVISTA' then 'Convênios'
    when 'TWITTER' then 'Convênios'
    when 'POLO UNIVERSITARIO' then 'Convênios'
    when 'PATROCINADORES' then 'Convênios'
    when 'FAMILY' then 'Indicação'
    when 'INSTAGRAM' then 'Instagram'
    else p_canal
  end;

  select id into v_canal_id from canais_origem where lower(nome) = lower(trim(p_canal)) limit 1;

  if p_source_type = 'emusys' then
    select id into v_lead_id from leads
      where emusys_lead_id = p_source_id and unidade_id = p_unidade_id and p_source_id is not null
      limit 1;
    if v_lead_id is null and p_telefone is not null then
      select id into v_lead_id from leads
        where telefone = p_telefone and unidade_id = p_unidade_id and arquivado = false
        limit 1;
    end if;
  elsif p_source_type = 'nocodb' then
    select id into v_lead_id from leads
      where nocodb_lead_id = p_source_id and unidade_id = p_unidade_id and p_source_id is not null
      limit 1;
    if v_lead_id is null and p_telefone is not null then
      select id into v_lead_id from leads
        where telefone = p_telefone and unidade_id = p_unidade_id and arquivado = false
        limit 1;
    end if;
  elsif p_source_type = 'campanha' then
    if p_telefone is not null then
      select id into v_lead_id from leads
        where telefone = p_telefone and unidade_id = p_unidade_id and arquivado = false
        limit 1;
    end if;
  end if;

  v_detalhes := json_build_object(
    'source_id', p_source_id, 'telefone', p_telefone, 'canal', p_canal, 'curso', p_curso,
    'data_nascimento', p_data_nascimento,
    'sem_nome', (p_nome is null or trim(p_nome) = ''), 'sem_telefone', (p_telefone is null or trim(p_telefone) = '')
  )::jsonb;

  if p_arquivar and v_lead_id is not null then
    update leads set arquivado = true, status = 'arquivado', updated_at = now() where id = v_lead_id;
    v_action := 'archived';
    insert into leads_automacao_log (lead_nome, lead_id, unidade_nome, evento, acao, detalhes, created_at)
    values (v_log_nome, v_lead_id, p_unidade_id::text, p_source_type, v_action, v_detalhes, now());
    return json_build_object('action', v_action, 'lead_id', v_lead_id);
  end if;

  if v_lead_id is not null then
    v_telefone_safe := null;
    if p_telefone is not null then
      if not exists (select 1 from leads where telefone = p_telefone and unidade_id = p_unidade_id and id != v_lead_id and arquivado = false) then
        v_telefone_safe := p_telefone;
      end if;
    end if;

    if p_source_type = 'emusys' then
      update leads set
        emusys_lead_id = coalesce(p_source_id, emusys_lead_id),
        nome = coalesce(nullif(p_nome, ''), nome),
        telefone = coalesce(v_telefone_safe, telefone),
        email = coalesce(nullif(p_email, ''), email),
        curso_interesse_id = coalesce(v_curso_id, curso_interesse_id),
        -- ver cabecalho: prova de clique que CONCORDA com o canal nao e sobrescrita
        canal_origem_id = case
          when gclid is not null and canal_origem_id = 3 then canal_origem_id
          when meta_ctwa_clid is not null and canal_origem_id in (1, 2) then canal_origem_id
          else coalesce(v_canal_id, canal_origem_id)
        end,
        data_nascimento = coalesce(p_data_nascimento, data_nascimento),
        data_contato = coalesce(p_data_contato, data_contato),
        updated_at = now(), data_ultimo_contato = now()
      where id = v_lead_id;
    elsif p_source_type = 'nocodb' then
      update leads set
        nocodb_lead_id = coalesce(p_source_id, nocodb_lead_id),
        nome = coalesce(nullif(p_nome, ''), nome),
        telefone = coalesce(v_telefone_safe, telefone),
        email = coalesce(nullif(p_email, ''), email),
        curso_interesse_id = coalesce(v_curso_id, curso_interesse_id),
        canal_origem_id = case
          when gclid is not null and canal_origem_id = 3 then canal_origem_id
          when meta_ctwa_clid is not null and canal_origem_id in (1, 2) then canal_origem_id
          else coalesce(v_canal_id, canal_origem_id)
        end,
        data_nascimento = coalesce(p_data_nascimento, data_nascimento),
        data_contato = coalesce(p_data_contato, data_contato),
        updated_at = now(), data_ultimo_contato = now()
      where id = v_lead_id;
    elsif p_source_type = 'campanha' then
      update leads set updated_at = now(), data_ultimo_contato = now() where id = v_lead_id;
    end if;

    v_action := 'updated';
    insert into leads_automacao_log (lead_nome, lead_id, unidade_nome, evento, acao, detalhes, created_at)
    values (v_log_nome, v_lead_id, p_unidade_id::text, p_source_type, v_action, v_detalhes, now());
    return json_build_object('action', v_action, 'lead_id', v_lead_id);
  end if;

  if p_source_type = 'emusys' then
    insert into leads (nome, telefone, email, unidade_id, emusys_lead_id, curso_interesse_id, canal_origem_id, data_nascimento, etapa_pipeline_id, status, data_contato, created_at, updated_at)
    values (p_nome, p_telefone, p_email, p_unidade_id, p_source_id, v_curso_id, v_canal_id, p_data_nascimento, 1, 'novo', coalesce(p_data_contato, (now() at time zone 'America/Sao_Paulo')::date), now(), now())
    on conflict (telefone, unidade_id) where telefone is not null and arquivado = false
    do update set
      emusys_lead_id = coalesce(excluded.emusys_lead_id, leads.emusys_lead_id),
      nome = coalesce(nullif(excluded.nome, ''), leads.nome),
      email = coalesce(nullif(excluded.email, ''), leads.email),
      curso_interesse_id = coalesce(excluded.curso_interesse_id, leads.curso_interesse_id),
      canal_origem_id = case
        when leads.gclid is not null and leads.canal_origem_id = 3 then leads.canal_origem_id
        when leads.meta_ctwa_clid is not null and leads.canal_origem_id in (1, 2) then leads.canal_origem_id
        else coalesce(excluded.canal_origem_id, leads.canal_origem_id)
      end,
      data_nascimento = coalesce(excluded.data_nascimento, leads.data_nascimento),
      data_contato = coalesce(excluded.data_contato, leads.data_contato),
      updated_at = now(), data_ultimo_contato = now()
    returning id into v_lead_id;
  elsif p_source_type = 'nocodb' then
    insert into leads (nome, telefone, email, unidade_id, nocodb_lead_id, curso_interesse_id, canal_origem_id, data_nascimento, etapa_pipeline_id, status, data_contato, created_at, updated_at)
    values (p_nome, p_telefone, p_email, p_unidade_id, p_source_id, v_curso_id, v_canal_id, p_data_nascimento, 1, 'novo', coalesce(p_data_contato, (now() at time zone 'America/Sao_Paulo')::date), now(), now())
    on conflict (telefone, unidade_id) where telefone is not null and arquivado = false
    do update set
      nocodb_lead_id = coalesce(excluded.nocodb_lead_id, leads.nocodb_lead_id),
      nome = coalesce(nullif(excluded.nome, ''), leads.nome),
      email = coalesce(nullif(excluded.email, ''), leads.email),
      curso_interesse_id = coalesce(excluded.curso_interesse_id, leads.curso_interesse_id),
      canal_origem_id = case
        when leads.gclid is not null and leads.canal_origem_id = 3 then leads.canal_origem_id
        when leads.meta_ctwa_clid is not null and leads.canal_origem_id in (1, 2) then leads.canal_origem_id
        else coalesce(excluded.canal_origem_id, leads.canal_origem_id)
      end,
      data_nascimento = coalesce(excluded.data_nascimento, leads.data_nascimento),
      data_contato = coalesce(excluded.data_contato, leads.data_contato),
      updated_at = now(), data_ultimo_contato = now()
    returning id into v_lead_id;
  elsif p_source_type = 'campanha' then
    insert into leads (nome, telefone, email, unidade_id, curso_interesse_id, canal_origem_id, data_nascimento, etapa_pipeline_id, status, data_contato, created_at, updated_at)
    values (p_nome, p_telefone, p_email, p_unidade_id, v_curso_id, v_canal_id, p_data_nascimento, 1, 'novo', coalesce(p_data_contato, (now() at time zone 'America/Sao_Paulo')::date), now(), now())
    on conflict (telefone, unidade_id) where telefone is not null and arquivado = false
    do update set
      nome = coalesce(nullif(excluded.nome, ''), leads.nome),
      email = coalesce(nullif(excluded.email, ''), leads.email),
      curso_interesse_id = coalesce(excluded.curso_interesse_id, leads.curso_interesse_id),
      canal_origem_id = case
        when leads.gclid is not null and leads.canal_origem_id = 3 then leads.canal_origem_id
        when leads.meta_ctwa_clid is not null and leads.canal_origem_id in (1, 2) then leads.canal_origem_id
        else coalesce(excluded.canal_origem_id, leads.canal_origem_id)
      end,
      data_nascimento = coalesce(excluded.data_nascimento, leads.data_nascimento),
      data_contato = coalesce(excluded.data_contato, leads.data_contato),
      updated_at = now(), data_ultimo_contato = now()
    returning id into v_lead_id;
  end if;

  v_action := 'inserted';
  insert into leads_automacao_log (lead_nome, lead_id, unidade_nome, evento, acao, detalhes, created_at)
  values (v_log_nome, v_lead_id, p_unidade_id::text, p_source_type, v_action, v_detalhes, now());
  return json_build_object('action', v_action, 'lead_id', v_lead_id);
end;
$function$;
