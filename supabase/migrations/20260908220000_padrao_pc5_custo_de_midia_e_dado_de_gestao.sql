-- Custo de midia vazava para a consultora pela porta dos PADROES (08/09/2026).
--
-- 🔴 ACHADO DA BATERIA DE CONVERSA (cenario `trafego-negado-dai`). A Daiana —
--    consultora do Recreio, que NAO ve trafego (o gate `veTudo()` exige nivel
--    lider/diretoria, e a bateria deterministica confirmou: 31 tools visiveis,
--    `trafego=false`) — perguntou *"qual criativo ta convertendo melhor?"* e a
--    Mila respondeu com valores de midia:
--
--      "[VIDEO] Kids banda ensaio ... R$ 143 por matricula"
--      "[VIDEO] Kids bateria ganhou em conversa (272 conversas a R$ 4,49)"
--
--    Ela nao burlou o gate. Usou `o_que_aprendemos` (`mila_padroes_v1`), que
--    TODA consultora enxerga — e o padrao **PC5** carrega, no texto do
--    aprendizado, gasto por anuncio, custo por conversa e custo por matricula.
--
-- 🔴 O GATE PROTEGIA A TOOL, NAO O DADO. Fechar a porta da frente nao adianta
--    se o mesmo numero esta escrito num material que entra por outra. Vale como
--    regra geral: **ao criar um gate de visibilidade, procurar o dado em TODAS
--    as tools, nao so na obvia.**
--
-- ⚠️ Medido: PC5 e o UNICO dos 12 padroes que cita dinheiro no aprendizado, e
--    era o unico com valor de midia marcado como `rede`. O P7, que compara
--    unidades, ja estava `gestao` — a coluna existia e funcionava; so faltou
--    aplica-la aqui.
--
-- ⚠️ NAO viro isso em regra automatica do tipo "padrao com R$ vira gestao":
--    ticket medio da unidade tambem tem R$ e e assunto DELA. O que e de
--    diretoria e **custo de midia**, nao dinheiro em geral. A deteccao fica
--    como prova aqui e como predicado na bateria, nunca como trava cega.
--
-- ⚠️ Aplicada via MCP no mesmo dia; este arquivo e o espelho versionado.

update radar_padroes
   set visibilidade = 'gestao'
 where codigo = 'PC5'
   and visibilidade <> 'gestao';

comment on column radar_padroes.visibilidade is
  'Quem enxerga o padrao. `rede` = todo o time; `gestao` = so quem lidera (mesma regua do gate de trafego). ⚠️ Custo de MIDIA (gasto por anuncio, custo por conversa, custo por matricula de campanha) e `gestao` — foi por aqui que o valor de criativo chegou a uma consultora em 08/09, driblando o gate de `trafego_por_criativo` sem burlar nada: o gate protegia a TOOL, e o mesmo numero estava escrito no PADRAO. Ticket medio da unidade NAO e midia e continua `rede`.';

-- ── prova ──────────────────────────────────────────────────────────────────
do $prova$
declare
  DAI constant text := '5521968060404';   -- consultora, sem acesso a trafego
  KRI constant text := '5521966875271';   -- lider de rede, ve tudo
  v_dai jsonb; v_kri jsonb; v_tem_pc5_dai bool; v_tem_pc5_kri bool; v_com_dinheiro int;
begin
  v_dai := mila_padroes_v1(DAI);
  v_kri := mila_padroes_v1(KRI);

  select exists (select 1 from jsonb_array_elements(v_dai->'padroes') p where p->>'codigo' = 'PC5')
    into v_tem_pc5_dai;
  select exists (select 1 from jsonb_array_elements(v_kri->'padroes') p where p->>'codigo' = 'PC5')
    into v_tem_pc5_kri;

  if v_tem_pc5_dai then
    raise exception 'a consultora AINDA recebe o PC5 (custo de midia por criativo)';
  end if;
  if not v_tem_pc5_kri then
    raise exception 'quem lidera a rede PERDEU o PC5 — o conserto passou do ponto';
  end if;

  select count(*) into v_com_dinheiro
    from radar_padroes
   where ativo and visibilidade = 'rede'
     and (aprendizado ~* '(custo por (conversa|clique|lead|matricula)|gasto|anuncio|criativo).{0,80}R\$'
       or aprendizado ~* 'R\$.{0,80}(por conversa|por clique|por anuncio|de midia)');
  if v_com_dinheiro > 0 then
    raise exception 'ainda ha % padrao(oes) `rede` citando custo de midia', v_com_dinheiro;
  end if;

  raise notice 'prova ok: PC5 fora da consultora, dentro da lideranca, e nenhum padrao `rede` cita custo de midia';
end $prova$;
