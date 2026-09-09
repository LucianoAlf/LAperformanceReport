-- 🔴 O PRIVADO DA CONSULTORA TINHA O MESMO DEFEITO DO GRUPO — e é pior lá.
--
-- Hoje, 09/09/2026 às 08:00, a Daiana recebeu na DM:
--     🔥 AGORA, DAI · Danielli · Weriton · Henrique Supriano
--        "só a Mila respondeu; entra agora e continua dali"
-- **Henrique Supriano (conv 20732) estava `resolved` no Chatwoot.** Às 12:46
-- ela respondeu "Obrigada, irei verificar e entrar em contato" — ia gastar
-- tempo num caso que a própria equipe já tinha encerrado.
--
-- Medido no privado das três consultoras (fonte: Chatwoot ao vivo, deduplicado
-- por id de mensagem — o mesmo telefone tem 3 a 6 contatos e a 1ª contagem saiu
-- inflada 3-6x):
--     Vitória  43 recebidas / 3 respostas   última 08/09
--     Daiana   24 recebidas / 7 respostas   última 09/09 (hoje)
--     Kailane  27 recebidas / 2 respostas   última 04/09
-- Elas NÃO estão ignorando: a Vitória usou o recado ("Pode escrever a mensagem
-- então!"), a Kailane fez pergunta de negócio ("quantos alunos de agosto ainda
-- não assinaram contrato?") e a Daiana age no mesmo dia. O canal está vivo — e
-- é exatamente por isso que o ruído tem de sair agora.
--
-- Os quatro consumidores abaixo liam `radar_sinais` CRU, como o bloco do grupo
-- lia até hoje de manhã. Passam a ler a vigência e a descartar `sanou`.
-- ⚠️ `sem_rodada` FICA: detector atrasado é alarme, e a direção da falha aqui
--    é fail-OPEN.
-- ⚠️ A idempotência da cutucada é por DIA (`mila_cutucada|tel|dia|sinal`), então
--    sinal que continua aberto volta TODA MANHÃ. É de propósito enquanto ele
--    for verdadeiro — e é o que tornava o defeito diário em vez de pontual
--    (Weriton, Henrique e Robson foram cutucados dois dias seguidos).
do $$
declare
  v_def text; v_n int; v_i int;
  v_alvos text[][] := array[
    array['mila_cutucada_v1(text,integer)',
          'from radar_sinais r',
          'from vw_radar_sinal_vigencia_v1 r',
          'where r.unidade_id = v_un and r.status = ''aberto''',
          'where r.unidade_id = v_un and r.status = ''aberto'' and r.vigencia <> ''sanou'''],
    array['mila_briefing_manha_v1(text,date,uuid)',
          'from (select * from radar_sinais',
          'from (select * from vw_radar_sinal_vigencia_v1',
          'where unidade_id = v_un and status = ''aberto'' and regra_codigo = ''R18''',
          'where unidade_id = v_un and status = ''aberto'' and vigencia <> ''sanou'' and regra_codigo = ''R18'''],
    array['radar_ficha_v1(uuid,text,integer)',
          'from radar_sinais s',
          'from vw_radar_sinal_vigencia_v1 s',
          'where s.status in (''aberto'',''triado'') and s.canonico',
          'where s.status in (''aberto'',''triado'') and s.vigencia <> ''sanou'' and s.canonico'],
    array['get_situacao_lead_v1(text,text,text,integer)',
          'from public.radar_sinais s where s.entidade_tipo = ''lead''',
          'from public.vw_radar_sinal_vigencia_v1 s where s.entidade_tipo = ''lead''',
          'and s.status in (''aberto'',''triado'')), ''[]''::jsonb)',
          'and s.status in (''aberto'',''triado'') and s.vigencia <> ''sanou''), ''[]''::jsonb)']
  ];
begin
  for v_i in 1 .. array_length(v_alvos, 1) loop
    v_def := pg_get_functiondef(v_alvos[v_i][1]::regprocedure);

    -- guarda de ancora, uma para cada troca. Declarar o esperado, nunca supor.
    v_n := (length(v_def) - length(replace(v_def, v_alvos[v_i][2], ''))) / length(v_alvos[v_i][2]);
    if v_n <> 1 then
      raise exception '% : ancora FROM apareceu % vezes, esperava 1', v_alvos[v_i][1], v_n;
    end if;
    v_n := (length(v_def) - length(replace(v_def, v_alvos[v_i][4], ''))) / length(v_alvos[v_i][4]);
    if v_n <> 1 then
      raise exception '% : ancora WHERE apareceu % vezes, esperava 1', v_alvos[v_i][1], v_n;
    end if;

    v_def := replace(v_def, v_alvos[v_i][2], v_alvos[v_i][3]);
    v_def := replace(v_def, v_alvos[v_i][4], v_alvos[v_i][5]);
    execute v_def;
  end loop;
end $$;

-- ⚠️ recriar funcao reabre EXECUTE para anon (ALTER DEFAULT PRIVILEGES).
--    `mila_acesso_restrito` e o papel do MCP da Mila e precisa continuar.
do $$
declare f text;
begin
  foreach f in array array['mila_cutucada_v1(text,integer)',
                           'mila_briefing_manha_v1(text,date,uuid)',
                           'radar_ficha_v1(uuid,text,integer)',
                           'get_situacao_lead_v1(text,text,text,integer)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role, mila_acesso_restrito', f);
  end loop;
end $$;

comment on function public.mila_cutucada_v1(text, integer) is
  'Cutucada de hora em hora na DM da consultora (R18/R21/R7 comercial). Le a '
  'VIGENCIA, nunca radar_sinais cru: em 09/09 a Daiana foi mandada "entrar '
  'agora" numa conversa que a equipe ja tinha resolvido no Chatwoot.';
