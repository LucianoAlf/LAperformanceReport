-- APLICADA EM PRODUCAO em 03/09/2026 via MCP. NAO REAPLICAR.
--
-- Refinamento de 20260903221704: o gate passa a CHAMAR governanca.quem_eh em vez de
-- reconsultar agente_usuarios por conta propria.
--
-- Motivo: "quem e pessoa reconhecida" estava escrito em dois lugares (aqui e no corpo
-- de quem_eh). Duas definicoes da mesma coisa divergem com o tempo -- foi exatamente
-- assim que agente_canais_diretos e agente_usuarios acabaram discordando (uma tinha
-- linha ativa sem identidade, a outra tinha identidade sem acesso). Agora quem_eh e a
-- UNICA definicao de identidade; esta funcao so acrescenta a politica de QUAIS
-- departamentos falam com a Mila -- e esse filtro e o unico lugar a editar quando a
-- politica mudar.
--
-- O filtro `ativo` nao se repete aqui de proposito: ja vive dentro de quem_eh. Se um
-- dia quem_eh mudar o criterio de identidade, o gate acompanha sozinho.
--
-- Testado apos aplicar (7/7): Vitoria CG, Vitoria Andrade/Recreio, Kailane e Hugo ->
-- true; lead aleatorio, telefone vazio e JID de grupo de 18 digitos -> false.
-- Cobertura: 18 pessoas falam, 5 nao (financeiro, marketing, pedagogico x2, rh).

create or replace function governanca.consultor_permitido(p_telefone text, p_agente text, p_canal text)
returns boolean
language sql
stable
security definer
set search_path to 'governanca', 'pg_temp'
as $$
  select exists (
    select 1
    from governanca.quem_eh(p_telefone) q
    where q.departamento = any (array['comercial', 'administrativo', 'diretoria'])
  );
$$;

comment on function governanca.consultor_permitido(text, text, text) is
  'Modo Consultor: chama governanca.quem_eh (fonte unica de identidade) e aplica a politica de departamentos. p_agente/p_canal ignorados, mantidos para compatibilidade de assinatura.';

revoke execute on function governanca.consultor_permitido(text, text, text) from public;
revoke execute on function governanca.consultor_permitido(text, text, text) from anon, authenticated;
grant execute on function governanca.consultor_permitido(text, text, text) to mila_acesso_restrito;
