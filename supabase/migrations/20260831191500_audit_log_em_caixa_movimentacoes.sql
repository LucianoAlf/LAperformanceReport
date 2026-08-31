-- DELETE de movimento do caixa passa a deixar RASTRO (achado da auditoria 31/08).
--
-- Em 31/08, dois lançamentos de CG (R$ 633 StarLine e R$ 300 Pareidolia, evento
-- "Bora Gravar") foram confirmados pela Sol ("Lancei ✅", com movimentacao_id na
-- sol_caixa_lancamento_auditoria) e SUMIRAM de caixa_movimentacoes minutos
-- depois — apagados por alguém da equipe pela tela do caixa (o hook
-- useCaixaDiario.excluirMovimento faz DELETE físico com caixa aberto). Não foi
-- possível dizer QUEM apagou nem POR QUÊ: a tabela não tinha trilha nenhuma.
-- É a mesma armadilha da Catarina Petrolongo em movimentacoes_admin (03/08),
-- que motivou o bloqueio de DELETE + lixeira lá.
--
-- Aqui o passo é o NÃO-INTRUSIVO: anexar a fn_audit_log genérica (já usada por
-- 22 tabelas; nunca bloqueia — engole a própria falha com WARNING). A equipe
-- continua podendo excluir com o caixa aberto (fluxo legítimo de correção);
-- a diferença é que o próximo sumiço terá autor, hora e a linha inteira em
-- audit_log.dados_antigos. Bloquear DELETE (padrão movimentacoes_admin) fica
-- como decisão futura do Hugo se o rastro mostrar abuso.

drop trigger if exists trg_audit_caixa_movimentacoes on caixa_movimentacoes;
create trigger trg_audit_caixa_movimentacoes
  after insert or update or delete on caixa_movimentacoes
  for each row execute function fn_audit_log();
