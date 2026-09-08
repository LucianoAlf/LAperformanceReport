-- "Frequência 30d: sem aula%" — o % sobrava (08/09/2026).
--
-- ⚠️ Pego no ensaio da pauta de Campo Grande, horas antes de a mensagem
--    estrear no grupo. O texto de R3 é:
--
--      format('... Frequência 30d: %s%%. Risco do modelo: %s%%.',
--             ..., coalesce(al.pct::text, 'sem aula'), ...)
--
--    O `coalesce` cobre o aluno SEM aula nos 30 dias (`pct` nulo), mas o `%%`
--    é literal e fica colado: sai **"Frequência 30d: sem aula%"**.
--
-- ⚠️ É defeito pequeno e é exatamente por isso que importa: a pauta é a
--    primeira coisa que a Sol vai FALAR sozinha ao time, e mensagem com erro
--    de digitação ensina que ninguém conferiu antes de mandar. Quem lê uma
--    dessas passa a ler todas com meio olho.
--
-- ⚠️ A correção move o `%` para DENTRO do valor, em vez de tirar o `%%` do
--    molde: assim o número continua com o símbolo e só o caso nulo perde.

do $r3$
declare v_def text; n int; velho text;
begin
  select pg_get_functiondef(oid) into v_def from pg_proc
   where proname='radar_detectar_sinais_sql_v1' and pronamespace='public'::regnamespace;

  velho := 'format(''%s (%s) renova em %s dias. Frequência 30d: %s%%. Risco do modelo: %s%%.'',';
  n := (length(v_def) - length(replace(v_def, velho, ''))) / greatest(length(velho),1);
  if n <> 1 then raise exception 'ANCORA do texto de R3: esperava 1, achei %', n; end if;
  v_def := replace(v_def, velho,
    'format(''%s (%s) renova em %s dias. Frequência 30d: %s. Risco do modelo: %s%%.'',');

  velho := 'coalesce(al.pct::text,''sem aula''),';
  n := (length(v_def) - length(replace(v_def, velho, ''))) / greatest(length(velho),1);
  if n <> 1 then raise exception 'ANCORA do coalesce: esperava 1, achei %', n; end if;
  v_def := replace(v_def, velho,
    -- ⚠️ o `%` entra no VALOR: número segue com símbolo, "sem aula" fica limpo
    'coalesce(al.pct::text || ''%'', ''sem aula nos 30 dias''),');

  execute v_def;
  raise notice 'R3: "sem aula%%" virou "sem aula nos 30 dias"';
end $r3$;

revoke all on function public.radar_detectar_sinais_sql_v1(date) from public, anon;
grant execute on function public.radar_detectar_sinais_sql_v1(date) to service_role;

-- ── prova ──────────────────────────────────────────────────────────────────
-- ⚠️ Os sinais JÁ criados guardam o texto antigo no `contexto`; regerar exige
--    apagá-los, e apagar sinal aberto para consertar pontuação seria trocar um
--    defeito cosmético por perda de trabalho. O texto novo vale para os
--    próximos — e a rodada de amanhã às 06h reemite R3 com ele.
do $prova$
declare v_def text;
begin
  select pg_get_functiondef(oid) into v_def from pg_proc
   where proname='radar_detectar_sinais_sql_v1' and pronamespace='public'::regnamespace;

  -- 🔴 `strpos`, nunca `LIKE`: em LIKE o `%` e CURINGA, entao o padrao
  --    '%Frequência 30d: %s%%.%' casa com quase tudo e a guarda passa vazia.
  --    Foi o que aconteceu na 1a versao desta prova.
  if strpos(v_def, 'Frequência 30d: %s%%.') > 0 then
    raise exception 'o molde ainda tem o %% colado no valor';
  end if;
  if strpos(v_def, 'sem aula nos 30 dias') = 0 then
    raise exception 'o texto do caso sem aula nao entrou';
  end if;
  if strpos(v_def, 'al.pct::text || ''%''') = 0 then
    raise exception 'o %% nao foi para dentro do valor — o numero perderia o simbolo';
  end if;

  raise notice 'prova: molde sem %% colado · valor com %% quando ha numero · "sem aula nos 30 dias" quando nao ha';
end $prova$;
