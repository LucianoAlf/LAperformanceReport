-- ⛔ GATE 2 — DESLIGAR de fato o bloco de sinais. NÃO APLICAR sem decisão do Alf.
--
-- 🔴 SEPARADO DE PROPÓSITO, e a observação é do Alfredo (09/09/2026): o arquivo
--    `_PENDENTE_20260909_kill_switch_do_bloco_sinais.sql` **cria o interruptor
--    LIGADO** e ensina a função a consultá-lo. Sozinho ele não desliga nada — e
--    eu tinha apresentado os dois atos como se fossem um. Não são:
--
--      GATE 1 (o outro arquivo) — passa a EXISTIR um interruptor.
--                                 Efeito em produção: nenhum. O bloco continua
--                                 saindo exatamente como sai hoje.
--      GATE 2 (este arquivo)    — o bloco 🔥 SINAIS DO DIA PARA de sair no
--                                 relatório comercial das 20:05.
--
--    Misturar os dois faria a criação do interruptor carregar, de carona, uma
--    mudança de comportamento visível para as três consultoras. Decisão de
--    desligar é do Alf; construir o botão, não.
--
-- ⚠️ ORDEM OBRIGATÓRIA: gate 1 primeiro. Sem ele a chave não existe, este
--    `update` afeta 0 linhas e a função nem consulta o interruptor — o efeito
--    seria zero e o registro diria que foi feito.
--
-- ⚠️ O relatório comercial NÃO para. Só o bloco de sinais some.
--
-- ⚠️ Antes de rodar, vale lembrar por que ele existe: em 09/09 a Vitória (CG) e
--    a Daiana (Recreio) reclamaram, e das 79 linhas auditadas contra o Chatwoot
--    ao vivo, 37 (46%) não deviam estar lá. As correções dos PRs #401-#405
--    derrubaram isso para 21%. Este interruptor é a saída de emergência para
--    se o ruído voltar — não é o conserto, e usá-lo como conserto esconderia
--    sinal real.

do $$
declare
  v_existe boolean;
  v_n int;
begin
  select exists(select 1 from automacoes_config
                 where slug = 'radar_bloco_sinais_comercial')
    into v_existe;
  if not v_existe then
    raise exception
      'GATE 1 nao foi aplicado: a chave radar_bloco_sinais_comercial nao existe. '
      'Aplicar _PENDENTE_20260909_kill_switch_do_bloco_sinais.sql primeiro.';
  end if;

  update automacoes_config
     set ativo = false
   where slug = 'radar_bloco_sinais_comercial';
  get diagnostics v_n = row_count;
  if v_n <> 1 then
    raise exception 'esperava desligar 1 linha, mexeu em % — abortado', v_n;
  end if;

  raise notice 'bloco de sinais DESLIGADO. O relatorio comercial das 20:05 '
               'continua saindo, sem a secao SINAIS DO DIA.';
end $$;

-- ROLLBACK (religar, efeito imediato no próximo relatório):
--   update automacoes_config set ativo = true
--    where slug = 'radar_bloco_sinais_comercial';
