-- BUMERANGUE AUTOMÁTICO: a retomada nasce da CONVERSA, não só do que a
-- consultora conta.
--
-- A agenda de retomada (migration 20260905150000) só enchia quando a consultora
-- lembrava de contar à Mila. Isso dá o padrão certo e não dá escala: quem tem
-- 200 leads não para para registrar. O extrator semântico
-- (`extrair-sinais-conversa`) já lê conversa de LEAD — 389 sinais em 8 regras —
-- então o caminho é ele reconhecer "me chama em janeiro" e gravar.
--
-- 🔴 UMA REGRA, DOIS CAMINHOS DE ESCRITA. A consultora e o extrator gravam a
--    MESMA coisa, e por isso a lógica mora em `fn_upsert_retomada` — chamada
--    pelas duas. Duas fontes de escrita com regras próprias para o mesmo campo
--    foi a causa-raiz das duplicatas de renovação neste projeto; não repetir.
--
-- ⚠️ O EXTRATOR NÃO SOBRESCREVE O QUE A CONSULTORA REGISTROU. Se há retomada
--    viva de origem `consultora`, o que o LLM achar na conversa é ignorado: a
--    pessoa que falou com o cliente sabe mais que o modelo lendo depois. O
--    inverso vale — registro humano sempre substitui o do modelo.

-- ── o núcleo, compartilhado ─────────────────────────────────────────────────
create or replace function public.fn_upsert_retomada(
  p_lead_id bigint, p_frase text, p_prazo_texto text, p_motivo text,
  p_origem text, p_criado_por text, p_conversation_id bigint default null
) returns jsonb
language plpgsql security definer set search_path to 'public' as $function$
declare l record; v_data date; v_id uuid; v_antes record;
begin
  if coalesce(trim(p_frase), '') = '' then
    return jsonb_build_object('ok', false, 'motivo', 'frase_vazia');
  end if;
  if p_origem not in ('consultora', 'llm_conversa') then
    return jsonb_build_object('ok', false, 'motivo', 'origem_invalida');
  end if;

  select id, nome, unidade_id into l from leads where id = p_lead_id;
  if l.id is null then return jsonb_build_object('ok', false, 'motivo', 'lead_nao_encontrado'); end if;

  select * into v_antes from lead_retomada where lead_id = p_lead_id and status = 'aguardando';

  -- ⚠️ O modelo nao passa por cima de decisao humana. Quem falou com o cliente
  -- sabe mais que o LLM lendo a conversa depois.
  if v_antes.id is not null and p_origem = 'llm_conversa' and v_antes.origem = 'consultora' then
    return jsonb_build_object('ok', false, 'motivo', 'ja_registrado_por_humano',
      'retomada_id', v_antes.id);
  end if;

  v_data := public.fn_resolver_prazo_retomada(p_prazo_texto);

  if v_antes.id is not null then
    update lead_retomada set status = 'descartado', atualizado_em = now(),
           desfecho_nota = 'substituida por combinado mais novo (' || p_origem || ')'
     where id = v_antes.id;
  end if;

  insert into lead_retomada (lead_id, unidade_id, prometido_em, prazo_texto, retomar_em,
                             frase, motivo, origem, conversation_id, criado_por)
  values (l.id, l.unidade_id, (now() at time zone 'America/Sao_Paulo')::date,
          nullif(trim(coalesce(p_prazo_texto,'')), ''), v_data,
          trim(p_frase), nullif(trim(coalesce(p_motivo,'')), ''), p_origem,
          p_conversation_id, p_criado_por)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'retomada_id', v_id, 'lead', l.nome,
    'retomar_em', v_data, 'sem_data', v_data is null,
    'substituiu_anterior', v_antes.id is not null, 'origem', p_origem);
end $function$;

-- ── a consultora (agora delega ao núcleo) ───────────────────────────────────
create or replace function public.mila_registrar_retomada_v1(
  p_solicitante_telefone text, p_lead_id bigint, p_frase text,
  p_prazo_texto text default null, p_motivo text default null
) returns jsonb
language plpgsql security definer set search_path to 'public', 'governanca' as $function$
declare q record; v_ok boolean; r jsonb;
begin
  select * into q from governanca.quem_eh(p_solicitante_telefone) limit 1;
  if q.nome is null then return jsonb_build_object('ok', false, 'motivo', 'nao_autorizado'); end if;
  if coalesce(trim(p_frase), '') = '' then
    return jsonb_build_object('ok', false, 'motivo', 'frase_vazia',
      'nota', 'preciso do que a pessoa DISSE. Sem a frase o lembrete vira ruido e ela ignora.');
  end if;

  -- escopo: consultora so alcanca a unidade dela
  select true into v_ok from leads
   where id = p_lead_id and (q.unidade_id is null or unidade_id = q.unidade_id);
  if v_ok is not true then
    return jsonb_build_object('ok', false, 'motivo', 'lead_nao_encontrado_no_seu_escopo');
  end if;

  r := public.fn_upsert_retomada(p_lead_id, p_frase, p_prazo_texto, p_motivo,
                                 'consultora', q.nome, null);
  if (r->>'ok')::boolean is not true then return r; end if;

  return r || jsonb_build_object('prazo_texto', p_prazo_texto,
    'nota', case when (r->>'sem_data')::boolean
      then 'guardei SEM data — "' || coalesce(p_prazo_texto,'(sem prazo)') || '" nao da para virar dia. Pergunte a ela quando lembrar, ou deixe no balde sem data.'
      else 'guardado. Eu te lembro no dia, com a frase dele junto.' end);
end $function$;

-- ── o extrator semântico ────────────────────────────────────────────────────
-- ⚠️ `service_role` apenas: quem chama e a edge, nunca gente.
create or replace function public.registrar_retomada_de_conversa_v1(
  p_lead_id bigint, p_frase text, p_prazo_texto text,
  p_conversation_id bigint, p_motivo text default null
) returns jsonb
language plpgsql security definer set search_path to 'public' as $function$
begin
  return public.fn_upsert_retomada(p_lead_id, p_frase, p_prazo_texto, p_motivo,
                                   'llm_conversa', 'extrator de conversa', p_conversation_id);
end $function$;

revoke all on function public.fn_upsert_retomada(bigint,text,text,text,text,text,bigint)      from public, anon, authenticated;
revoke all on function public.registrar_retomada_de_conversa_v1(bigint,text,text,bigint,text) from public, anon, authenticated;
grant execute on function public.fn_upsert_retomada(bigint,text,text,text,text,text,bigint)      to service_role;
grant execute on function public.registrar_retomada_de_conversa_v1(bigint,text,text,bigint,text) to service_role;

-- ── 2️⃣ o que a agenda já ensina (para o padrão futuro) ─────────────────────
-- Ainda sem amostra; existe para o dia em que houver. NÃO é para ser citada
-- como verdade enquanto `amostra_n` for pequena — `mila_padroes_v1` devolve
-- `confianca` e a SKILL manda dizer.
create or replace view public.vw_retomada_eficacia_v1 as
select
  count(*) filter (where status = 'retomado')                                       retomadas_fechadas,
  count(*) filter (where desfecho = 'matriculou')                                   matriculou,
  count(*) filter (where desfecho = 'matriculou'
                     and desfecho_em::date <= retomar_em + 3)                       matriculou_no_prazo,
  count(*) filter (where status = 'retomado' and desfecho_em::date <= retomar_em + 3) fechadas_no_prazo,
  count(*) filter (where status = 'aguardando')                                     aguardando,
  count(*) filter (where status = 'aguardando' and retomar_em is null)              sem_data,
  count(*) filter (where origem = 'llm_conversa')                                   veio_da_conversa,
  count(*) filter (where origem = 'consultora')                                     veio_da_consultora
from public.lead_retomada;

revoke all on public.vw_retomada_eficacia_v1 from public, anon, authenticated;
grant select on public.vw_retomada_eficacia_v1 to service_role, mila_acesso_restrito;
