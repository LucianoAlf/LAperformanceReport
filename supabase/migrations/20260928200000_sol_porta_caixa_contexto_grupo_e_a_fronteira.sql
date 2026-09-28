-- sol_porta_caixa_contexto_v1: no grupo financeiro oficial, quem está no grupo
-- pode pedir à Sol — a mesma fronteira que a camada que GRAVA já usa (28/09/2026).
--
-- 🔴 DUAS CAMADAS, DUAS RÉGUAS. As RPCs que gravam no caixa (abrir, fechar,
--    lançar, "pode") autorizam por `sol_caixa_unidade_policy.autoriza_qualquer_membro`
--    — ligada nas 3 unidades desde 20/08: qualquer membro do grupo oficial opera.
--    A porta de entrada das FERRAMENTAS do agente, porém, só aceitava diretoria
--    e departamento administrativo. Resultado: Kailane (comercial/Barra) pediu
--    "abre o caixa de novo?" no sábado 26/09 e recebeu `fora_do_publico`; Anne
--    Krissya (líder comercial) e Rose (financeiro) idem. Com as ferramentas
--    ligadas nas 3 unidades (28/09), isso passaria a barrar também "Sol, lança…".
--    Decisão do Luciano: todo mundo do grupo é de confiança e opera a Sol.
--
-- Agora: com a política da unidade LIGADA, o critério é estar no grupo oficial
-- (o crachá prova que aquele telefone falou naquele chat). Pessoa ainda não
-- cadastrada na governança entra como 'Equipe'. Com a política DESLIGADA, volta
-- a régua antiga (diretoria + administrativo, na própria unidade). Um
-- interruptor só para as duas camadas.
--
-- Não muda: aprovação continua exigindo "pode" humano + ledger V3; o crachá
-- continua obrigatório; grupo não oficial continua recusado.

do $mig$
declare
  d text := pg_get_functiondef('public.sol_porta_caixa_contexto_v1(text,text)'::regprocedure);
  n int;
  a1 text := $a$  v_tel text;
begin$a$;
  b1 text := $b$  v_tel text;
  v_qualquer boolean;
begin$b$;
  a2 text := $a$  select * into v_quem from governanca.quem_eh(v_tel);
  if v_quem.nome is null then
    return jsonb_build_object('ok', false, 'motivo', 'solicitante_desconhecido');
  end if;
  v_publico := case$a$;
  b2 text := $b$  select coalesce(autoriza_qualquer_membro, false) into v_qualquer
    from public.sol_caixa_unidade_policy where unidade_id = v_grupo.unidade_id;
  select * into v_quem from governanca.quem_eh(v_tel);
  if coalesce(v_qualquer, false) then
    -- O grupo oficial é a fronteira (mesma régua das RPCs que gravam).
    v_publico := case
      when lower(coalesce(v_quem.nivel, '')) = 'diretoria' then 'estrategico'
      when lower(coalesce(v_quem.nivel, '')) = 'lider' then 'tatico'
      else 'operacional' end;
  elsif v_quem.nome is null then
    return jsonb_build_object('ok', false, 'motivo', 'solicitante_desconhecido');
  else
  v_publico := case$b$;
  a3 text := $a$  if v_publico is null then
    return jsonb_build_object('ok', false, 'motivo', 'fora_do_publico');
  end if;

  if v_publico <> 'estrategico'
     and v_quem.unidade_id is distinct from v_grupo.unidade_id then$a$;
  b3 text := $b$  end if;
  if v_publico is null then
    return jsonb_build_object('ok', false, 'motivo', 'fora_do_publico');
  end if;

  if not coalesce(v_qualquer, false) and v_publico <> 'estrategico'
     and v_quem.unidade_id is distinct from v_grupo.unidade_id then$b$;
  a4 text := $a$    'quem', v_quem.nome,
    'publico', v_publico,$a$;
  b4 text := $b$    'quem', coalesce(v_quem.nome, 'Equipe'),
    'publico', v_publico,$b$;
begin
  if position('v_qualquer' in d) > 0 then raise notice 'ja aplicada'; return; end if;
  n := (length(d) - length(replace(d, a1, ''))) / length(a1); if n <> 1 then raise exception 'a1 %', n; end if;
  n := (length(d) - length(replace(d, a2, ''))) / length(a2); if n <> 1 then raise exception 'a2 %', n; end if;
  n := (length(d) - length(replace(d, a3, ''))) / length(a3); if n <> 1 then raise exception 'a3 %', n; end if;
  n := (length(d) - length(replace(d, a4, ''))) / length(a4); if n <> 1 then raise exception 'a4 %', n; end if;
  execute replace(replace(replace(replace(d, a1, b1), a2, b2), a3, b3), a4, b4);
end
$mig$;
