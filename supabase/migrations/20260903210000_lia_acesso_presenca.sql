-- Cron 'alerta-falta-consecutiva-diario' da Lia falhava há DIAS com
-- "permission denied for table aluno_presenca" — e ninguém via, porque o erro
-- só aparecia num tópico do Telegram que a equipe não lê.
-- Causa: a role lia_acesso_restrito existe mas nunca recebeu grant de presença.
-- Sol, Mila e Fabio têm; a Lia não tinha.
-- ⚠️ Acesso dado à VIEW CANÔNICA além da tabela: aluno_presenca tem uma linha
-- por registro e o Emusys emite cada aula 2x (turma+individual) — 85-91% da
-- grade é duplicada. Ler a tabela crua faria a Lia alertar falta duplicada:
-- ruído com cara de dado.
grant select on public.vw_presenca_slot_canonica_v1 to lia_acesso_restrito;
grant select on public.aluno_presenca to lia_acesso_restrito;
grant select on public.radar_sinais, public.radar_regras, public.radar_padroes,
                public.radar_estrategias, public.radar_padrao_estrategia,
                public.radar_destinatarios to lia_acesso_restrito;
grant execute on function public.radar_ficha_v1(uuid, text, int) to lia_acesso_restrito;
grant execute on function public.radar_pauta_v1(text, boolean) to lia_acesso_restrito;
