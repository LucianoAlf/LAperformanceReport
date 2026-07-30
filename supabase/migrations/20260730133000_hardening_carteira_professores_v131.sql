-- Fixa o contexto de resolucao da RPC sem alterar seu modo invoker.
alter function public.get_carteira_professores(uuid)
  set search_path = public;
