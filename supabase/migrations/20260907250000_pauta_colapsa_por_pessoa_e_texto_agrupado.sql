-- FATIA 2, passo 4 — colapso por PESSOA e texto que da para ler (07/09/2026).
--
-- 🔴 DOIS DEFEITOS QUE SO APARECERAM AO LER A MENSAGEM DE VERDADE. A pauta ja
--    filtrava vigencia e colapsava por `entidade_id`; o texto gerado para a
--    Barra mostrou que isso nao bastava:
--
--    (1) **Perola Madeira Maturano apareceu DUAS VEZES.** Nao e bug de dedup: e
--        o `alunos` = MATRICULA desta casa. Ela tem duas linhas (Canto 879 e
--        Violao 1141), mesma pessoa (`pessoa_chave = emusys:831`), e avisou uma
--        vez que sai. Colapsar por `entidade_id` mantem as duas. A identidade
--        de pessoa ja existe e e canonica: `fn_pessoa_chave_aluno`, que le
--        `vw_aluno_pessoa_chave`. E a mesma correcao que a anamnese precisou em
--        01/09 — 145 pessoas com 2+ matriculas ativas.
--
--    (2) **A orientacao de R13 se repetiu palavra por palavra 7 vezes** — 40
--        palavras identicas em cada item, num texto de WhatsApp. Quem le a
--        primeira pula as outras seis, e junto com elas pula os NOMES, que sao
--        a unica parte que muda. Lista que se le pela metade e lista que ensina
--        a ser ignorada — o mesmo desfecho do ruido da Daiana, por outra via.
--
-- ⚠️ A chave de pessoa entra com a UNIDADE junto. `emusys_student_id` sozinho
--    NAO identifica pessoa: 91 ids aparecem em 2+ unidades e os 91 tem nomes
--    diferentes (colisao entre bases do Emusys). Sem `unidade_id` no par, duas
--    pessoas distintas virariam uma linha so.
--
-- ⚠️ O texto sai de UMA funcao (`radar_texto_operacional_v1`), nao de um
--    `string_agg` embutido: e o mesmo motivo pelo qual `get_base_conhecimento`
--    e RPC unica — se a Sol reescrever por conta propria, duas redacoes do
--    mesmo fato passam a circular e o preview diverge do enviado.

-- ── 1. o texto operacional, agrupado por assunto ───────────────────────────
create or replace function public.radar_texto_operacional_v1(
  p_itens jsonb, p_na_fila integer default 0
) returns text
language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $function$
declare v_out text := ''; g record;
begin
  if p_itens is null or jsonb_array_length(p_itens) = 0 then
    return null;
  end if;

  v_out := '⚡ *Atenção do dia — ' ||
           to_char(now() at time zone 'America/Sao_Paulo','DD/MM') || '*';

  -- ⚠️ Agrupa por REGRA e escreve a orientacao UMA vez por grupo. A ordem dos
  --    grupos segue a do item mais urgente de cada um, para o topo continuar
  --    sendo o topo.
  for g in
    select i->>'regra' as regra,
           min((i->>'ordem')::int) as pos,
           coalesce(max(r.titulo), i->>'regra') as titulo,
           max(i->>'orientacao') as orientacao,
           jsonb_agg(i->>'contexto' order by (i->>'ordem')::int) as contextos
    from jsonb_array_elements(p_itens) i
    left join radar_regras r on r.codigo = i->>'regra'
    group by i->>'regra'
    order by min((i->>'ordem')::int)
  loop
    v_out := v_out || chr(10) || chr(10) || '*' || g.titulo || '*';
    v_out := v_out || chr(10) ||
             (select string_agg('• ' || c, chr(10))
                from jsonb_array_elements_text(g.contextos) c);
    if coalesce(g.orientacao,'') <> '' then
      v_out := v_out || chr(10) || '→ ' || g.orientacao;
    end if;
  end loop;

  if coalesce(p_na_fila,0) > 0 then
    v_out := v_out || chr(10) || chr(10) || '_+' || p_na_fila::text || ' na fila._';
  end if;
  return v_out;
end; $function$;

comment on function public.radar_texto_operacional_v1(jsonb, integer) is
  'Monta o texto da pauta operacional agrupando por regra, com a orientacao UMA vez por grupo. Existe porque a versao anterior repetia 40 palavras identicas em cada item — quem le a primeira pula as outras, e junto com elas pula os nomes.';

revoke all on function public.radar_texto_operacional_v1(jsonb, integer) from public, anon;
grant execute on function public.radar_texto_operacional_v1(jsonb, integer) to service_role;

-- ── 2. a pauta colapsa por PESSOA e usa o texto novo ───────────────────────
do $pauta$
declare v_def text; n int; velho text; novo text;
begin
  select pg_get_functiondef(oid) into v_def from pg_proc
   where proname='radar_pauta_v1' and pronamespace='public'::regnamespace;

  -- (a) identidade: matricula → pessoa
  velho := 'coalesce(s.entidade_id::text, s.situacao)';
  n := (length(v_def) - length(replace(v_def, velho, ''))) / length(velho);
  if n <> 1 then raise exception 'ANCORA chave de colapso: esperava 1, achei %', n; end if;
  v_def := replace(v_def, velho,
    -- ⚠️ Cast explicito: `radar_sinais.entidade_id` e BIGINT e
    --    `fn_pessoa_chave_aluno` recebe INTEGER — sem o `::int` a funcao
    --    simplesmente nao existe para o resolvedor de tipos.
    -- ⚠️ `unidade_id` junto: emusys_student_id colide entre unidades (91 ids,
    --    91 nomes diferentes). Sem ele, duas pessoas viram uma.
    'coalesce(s.unidade_id::text,'''') || ''|'' ||' || chr(10) ||
    '                              coalesce(case when s.entidade_tipo = ''aluno''' || chr(10) ||
    '                                            then fn_pessoa_chave_aluno(s.entidade_id::int) end,' || chr(10) ||
    '                                       s.entidade_id::text, s.situacao)');

  -- (b) o texto operacional sai da funcao
  velho := '''⚡ *Atenção do dia — ''||to_char(now() at time zone ''America/Sao_Paulo'',''DD/MM'')||''*''||chr(10)||chr(10)||' || chr(10) ||
           '            string_agg(c.contexto||chr(10)||''→ ''||coalesce(c.orientacao,''''), chr(10)||chr(10) order by c.rn2)||' || chr(10) ||
           '            case when max(c.fila2) > count(*)' || chr(10) ||
           '                 then chr(10)||chr(10)||''_+''||(max(c.fila2)-count(*))::text||'' na fila._'' else '''' end';
  n := (length(v_def) - length(replace(v_def, velho, ''))) / greatest(length(velho),1);
  if n <> 1 then raise exception 'ANCORA texto operacional: esperava 1, achei %', n; end if;
  novo := 'radar_texto_operacional_v1(' || chr(10) ||
          '              jsonb_agg(jsonb_build_object(''regra'', c.regra_codigo, ''ordem'', c.rn2,' || chr(10) ||
          '                                          ''contexto'', c.contexto, ''orientacao'', c.orientacao)' || chr(10) ||
          '                        order by c.rn2),' || chr(10) ||
          '              -- ⚠️ `fila2` vem de `count(*) over ()`, que e BIGINT: sem o' || chr(10) ||
          '              --    cast na SAIDA a chamada vira (jsonb, bigint) e nao casa.' || chr(10) ||
          '              greatest(max(c.fila2) - count(*), 0)::int)';
  v_def := replace(v_def, velho, novo);

  execute v_def;
  raise notice 'radar_pauta_v1: colapso por pessoa + texto agrupado';
end $pauta$;

revoke all on function public.radar_pauta_v1(text, boolean) from public, anon;
grant execute on function public.radar_pauta_v1(text, boolean) to service_role;

-- ── prova ──────────────────────────────────────────────────────────────────
do $prova$
declare t_op text; v jsonb; v_msg text; v_perola int; v_orient int;
begin
  select telefone into t_op from governanca.agente_usuarios
   where lower(departamento)='administrativo' and lower(nivel)='colaborador'
     and unidade_id is not null and coalesce(ativo,true) limit 1;

  v := sol_porta_pauta_do_dia_v1(t_op, null, 8);
  if not (v->>'ok')::bool then raise exception 'a porta recusou: %', v; end if;
  v_msg := v->>'mensagem';
  if v_msg is null or length(v_msg) < 50 then
    raise exception 'mensagem vazia ou curta demais — a prova nao exercitou nada';
  end if;

  -- 🔴 pessoa com 2 matriculas nao pode aparecer 2x
  v_perola := (length(v_msg) - length(replace(v_msg, 'Pérola Madeira Maturano', '')))
              / length('Pérola Madeira Maturano');
  if v_perola > 1 then
    raise exception 'Perola aparece % vezes — o colapso por pessoa nao pegou', v_perola;
  end if;

  -- 🔴 a orientacao de R13 nao pode se repetir
  v_orient := (length(v_msg) - length(replace(v_msg, 'Conversa de REVERSÃO', '')))
              / length('Conversa de REVERSÃO');
  if v_orient > 1 then
    raise exception 'a orientacao de R13 aparece % vezes — o agrupamento nao pegou', v_orient;
  end if;

  raise notice 'prova: mensagem com % caracteres · Perola %x · orientacao R13 %x',
               length(v_msg), v_perola, v_orient;
end $prova$;
