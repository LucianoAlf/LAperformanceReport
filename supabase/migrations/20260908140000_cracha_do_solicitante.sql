-- CRACHÁ: o telefone deixa de ser uma AFIRMAÇÃO do modelo (08/09/2026).
--
-- 🔴 A DÍVIDA QUE ISTO PAGA. As 14 portas resolvem o escopo pelo telefone de
--    quem fala — mas o telefone viajava no ARGUMENTO, informado pelo modelo.
--    O modelo lê `Participante que enviou:` no envelope, e lê também o
--    histórico do grupo: ele PODE informar o número de um colega e ver o
--    escopo dele. Mitigação até aqui era só o registro em `automacao_log`.
--
--    Eu tinha declarado isso bloqueado, com esta justificativa: *"o fix certo é
--    crachá opaco emitido pelo bridge, e o bridge é read-only por desenho"*.
--
-- 🔴 A JUSTIFICATIVA ESTAVA ERRADA, e é o tipo de erro que fecha porta cedo
--    demais: **crachá não precisa de escrita**. Com HMAC, o bridge só
--    CALCULA — lê o segredo de um arquivo (coisa que ele já faz) e assina
--    `telefone|chat|janela`. Nada é gravado. O banco reconfere a assinatura.
--    O `BEGIN READ ONLY` do bridge continua intacto.
--
--    O modelo passa a carregar um valor opaco que ele não sabe produzir para
--    OUTRO telefone, porque não tem o segredo. É a forma do `agentId` da
--    Maria — identidade resolvida antes do modelo — alcançada sem dar caneta
--    a quem não deve ter.
--
-- ⚠️ JANELA DE 30 MINUTOS no crachá. Sem prazo, um crachá visto uma vez no
--    histórico serviria para sempre e a fraude só ficaria mais lenta. Com
--    prazo curto demais (1 min), uma conversa que demora vira recusa no meio.
--    30 min cobre uma conversa inteira e expira antes do próximo turno.
--    ⚠️ A verificação aceita a janela ATUAL e a ANTERIOR: sem isso, quem
--    manda a mensagem às 10:29:59 leva recusa às 10:30:01 — falha de relógio,
--    não de segurança.
--
-- ⚠️ O TELEFONE CRU CONTINUA ACEITO, e isto é deliberado: `service_role` (os
--    ensaios, os crons, as provas destas migrations) não passa por bridge
--    nenhum e não tem como assinar. O que muda é que agora existe um caminho
--    inforjável, e a auditoria passa a DISTINGUIR os dois — `via: cracha` vs
--    `via: telefone_declarado`. Fechar o telefone cru sem antes medir quanto
--    tráfego real já usa crachá seria trocar um risco pequeno por uma quebra
--    grande.

-- ── o segredo ──────────────────────────────────────────────────────────────
-- ⚠️ Vive em `integracao_tokens` (RLS ligada, zero policies: só service_role
--    alcança), o mesmo cofre do token do extrator e da base de conhecimento.
--    Rotacionar = UPDATE aqui + o mesmo valor no arquivo que o bridge lê.
insert into integracao_tokens (nome, token)
select 'sol_cracha_hmac', encode(extensions.gen_random_bytes(32), 'hex')
where not exists (select 1 from integracao_tokens where nome = 'sol_cracha_hmac');

-- ── emitir (o bridge faz o mesmo cálculo em JS) ────────────────────────────
create or replace function public.sol_cracha_emitir_v1(
  p_telefone text, p_chat text default '', p_em timestamptz default null
) returns text
language plpgsql volatile security definer set search_path to 'public', 'extensions', 'pg_temp' as $function$
declare v_seg text; v_tel text; v_janela bigint; v_assin text;
begin
  select token into v_seg from integracao_tokens where nome = 'sol_cracha_hmac';
  if v_seg is null then return null; end if;
  v_tel := regexp_replace(coalesce(p_telefone,''), '\D', '', 'g');
  if v_tel = '' then return null; end if;
  -- janela de 30 min desde a época; o mesmo número tem de sair no JS do bridge
  v_janela := floor(extract(epoch from coalesce(p_em, now())) / 1800)::bigint;
  v_assin := encode(hmac(v_tel || '|' || coalesce(p_chat,'') || '|' || v_janela::text,
                         v_seg, 'sha256'), 'hex');
  -- prefixo `SOL1.` é o que deixa a porta distinguir crachá de telefone sem adivinhar
  return 'SOL1.' || v_tel || '.' || left(v_assin, 32);
end; $function$;

-- ── verificar ──────────────────────────────────────────────────────────────
create or replace function public.sol_cracha_verificar_v1(
  p_cracha text, p_chat text default ''
) returns jsonb
language plpgsql stable security definer set search_path to 'public', 'extensions', 'pg_temp' as $function$
declare v_seg text; v_tel text; v_dado text; v_janela bigint; v_esp text; i int;
begin
  if coalesce(p_cracha,'') !~ '^SOL1\.[0-9]+\.[0-9a-f]{32}$' then
    return jsonb_build_object('ok', false, 'motivo', 'formato_invalido');
  end if;
  select token into v_seg from integracao_tokens where nome = 'sol_cracha_hmac';
  if v_seg is null then return jsonb_build_object('ok', false, 'motivo', 'segredo_ausente'); end if;

  v_tel  := split_part(p_cracha, '.', 2);
  v_dado := split_part(p_cracha, '.', 3);
  v_janela := floor(extract(epoch from now()) / 1800)::bigint;

  -- ⚠️ Aceita a janela atual E a anterior: a mensagem enviada no último segundo
  --    de uma janela chegaria na seguinte e levaria recusa por relógio.
  for i in 0..1 loop
    v_esp := left(encode(hmac(v_tel || '|' || coalesce(p_chat,'') || '|' || (v_janela - i)::text,
                              v_seg, 'sha256'), 'hex'), 32);
    -- comparação em tempo constante: `=` em texto vaza o prefixo pela latência
    if length(v_esp) = length(v_dado)
       and (select bool_and(substr(v_esp,k,1) = substr(v_dado,k,1))
              from generate_series(1, length(v_esp)) k) then
      return jsonb_build_object('ok', true, 'telefone', v_tel, 'janela', v_janela - i);
    end if;
  end loop;
  return jsonb_build_object('ok', false, 'motivo', 'assinatura_invalida');
end; $function$;

revoke all on function public.sol_cracha_emitir_v1(text, text, timestamptz) from public, anon;
revoke all on function public.sol_cracha_verificar_v1(text, text) from public, anon;
grant execute on function public.sol_cracha_emitir_v1(text, text, timestamptz) to service_role;
grant execute on function public.sol_cracha_verificar_v1(text, text) to service_role;
-- ⚠️ Os papéis da Sol NÃO recebem `emitir`: quem assina é o bridge, não o
--    agente. Dar a caneta ao modelo desfaria o ponto inteiro.

-- ── o resolvedor aceita crachá ─────────────────────────────────────────────
do $resolver$
declare v_def text; n int; velho text;
begin
  select pg_get_functiondef(oid) into v_def from pg_proc
   where proname='sol_resolver_escopo_v1' and pronamespace='public'::regnamespace;

  velho := 'declare v_ctx text; v_porta text; v_quem record;';
  n := (length(v_def) - length(replace(v_def, velho, ''))) / greatest(length(velho),1);
  if n <> 1 then raise exception 'ANCORA do declare: esperava 1, achei %', n; end if;
  v_def := replace(v_def, velho,
    'declare v_ctx text; v_porta text; v_quem record; v_cr jsonb; v_tel text; v_via text;');

  velho := '  select * into v_quem' || chr(10) ||
           '  from governanca.quem_eh(regexp_replace(coalesce(p_solicitante_telefone,''''), ''\D'', '''', ''g''));';
  n := (length(v_def) - length(replace(v_def, velho, ''))) / greatest(length(velho),1);
  if n <> 1 then raise exception 'ANCORA do quem_eh: esperava 1, achei %', n; end if;
  v_def := replace(v_def, velho,
    '  -- 🔴 CRACHA vence telefone declarado. O prefixo `SOL1.` distingue os dois' || chr(10) ||
    '  --    sem adivinhacao; assinatura invalida RECUSA, nunca cai para o cru —' || chr(10) ||
    '  --    aceitar o telefone de dentro de um cracha quebrado seria oferecer o' || chr(10) ||
    '  --    caminho de contorno de graca.' || chr(10) ||
    '  if coalesce(p_solicitante_telefone,'''') like ''SOL1.%'' then' || chr(10) ||
    '    v_cr := sol_cracha_verificar_v1(p_solicitante_telefone, '''');' || chr(10) ||
    '    if not coalesce((v_cr->>''ok'')::bool,false) then' || chr(10) ||
    '      return jsonb_build_object(''ok'', false, ''motivo'', ''cracha_invalido'',' || chr(10) ||
    '        ''detalhe'', v_cr->>''motivo'',' || chr(10) ||
    '        ''recado'', ''Esse cracha nao confere — peca para a pessoa falar de novo.'');' || chr(10) ||
    '    end if;' || chr(10) ||
    '    v_tel := v_cr->>''telefone''; v_via := ''cracha'';' || chr(10) ||
    '  else' || chr(10) ||
    '    v_tel := regexp_replace(coalesce(p_solicitante_telefone,''''), ''\D'', '''', ''g'');' || chr(10) ||
    '    v_via := ''telefone_declarado'';' || chr(10) ||
    '  end if;' || chr(10) || chr(10) ||
    '  select * into v_quem from governanca.quem_eh(v_tel);');

  -- a auditoria passa a distinguir os dois caminhos
  velho := '              ''telefone_alegado'', regexp_replace(coalesce(p_solicitante_telefone,''''), ''\D'', '''', ''g''),';
  n := (length(v_def) - length(replace(v_def, velho, ''))) / greatest(length(velho),1);
  if n <> 1 then raise exception 'ANCORA da auditoria: esperava 1, achei %', n; end if;
  v_def := replace(v_def, velho,
    '              ''telefone_alegado'', v_tel,' || chr(10) ||
    '              ''via'', v_via,');

  execute v_def;
  raise notice 'sol_resolver_escopo_v1: aceita cracha, e a auditoria distingue os dois caminhos';
end $resolver$;

revoke all on function public.sol_resolver_escopo_v1(text, text) from public, anon;
grant execute on function public.sol_resolver_escopo_v1(text, text)
  to service_role, sol_operacional, sol_tatico, sol_estrategico;

-- ── prova ──────────────────────────────────────────────────────────────────
do $prova$
declare t text; c text; v jsonb; v_forjado text;
begin
  select telefone into t from governanca.agente_usuarios
   where lower(departamento)='administrativo' and lower(nivel)='colaborador'
     and unidade_id is not null and coalesce(ativo,true) limit 1;

  -- 1. crachá emitido resolve para a pessoa certa
  c := sol_cracha_emitir_v1(t, '');
  if c is null or c !~ '^SOL1\.' then raise exception 'o cracha nao foi emitido: %', c; end if;
  v := sol_resolver_escopo_v1(c, null);
  if not coalesce((v->>'ok')::bool,false) then raise exception 'cracha valido foi recusado: %', v; end if;

  -- 2. 🔴 crachá FORJADO para outro telefone tem de ser recusado
  v_forjado := 'SOL1.5521999998888.' || split_part(c, '.', 3);
  v := sol_resolver_escopo_v1(v_forjado, null);
  if coalesce((v->>'ok')::bool,false) then
    raise exception 'CRACHA FORJADO FOI ACEITO — o ponto inteiro caiu: %', v;
  end if;
  if v->>'motivo' <> 'cracha_invalido' then
    raise exception 'forjado recusado pelo motivo errado (%) — pode ter caido no telefone cru', v->>'motivo';
  end if;

  -- 3. assinatura estragada recusa, e NAO cai para o telefone de dentro
  v := sol_resolver_escopo_v1('SOL1.' || regexp_replace(t,'\D','','g') || '.' || repeat('0',32), null);
  if coalesce((v->>'ok')::bool,false) then
    raise exception 'cracha com assinatura zerada passou: %', v;
  end if;

  -- 4. telefone cru continua funcionando (service_role/ensaios) e fica MARCADO
  v := sol_resolver_escopo_v1(t, null);
  if not coalesce((v->>'ok')::bool,false) then raise exception 'telefone cru quebrou: %', v; end if;

  raise notice 'prova: cracha valido passa · FORJADO recusa · assinatura zerada recusa · telefone cru segue';
end $prova$;
