begin;

drop function if exists public.sol_porta_caixa_localizar_lancamento_v1(
  text, text, date, date, numeric, text, text, text
);
drop function if exists public.sol_porta_caixa_do_dia_assinado_v1(text, text, date);
drop function if exists public.sol_porta_caixa_contexto_v1(text, text);

do $prova$
begin
  if to_regprocedure('public.sol_porta_caixa_localizar_lancamento_v1(text,text,date,date,numeric,text,text,text)') is not null
     or to_regprocedure('public.sol_porta_caixa_do_dia_assinado_v1(text,text,date)') is not null
     or to_regprocedure('public.sol_porta_caixa_contexto_v1(text,text)') is not null then
    raise exception 'rollback nao removeu todas as portas agent-first do Caixa';
  end if;
end;
$prova$;

commit;
