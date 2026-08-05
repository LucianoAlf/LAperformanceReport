-- Corrige a montagem do whatsapp_jid em get_candidatos_pesquisa_primeira_aula.
-- Antes: '55' || digitos(telefone) -- concatenava o pais SEMPRE, produzindo 555521999999999
-- em 316 dos 761 alunos ativos, cujo cadastro ja vem do Emusys com o 55.
-- Agora: reusa normalize_telefone (ja existente no banco, criterio por comprimento:
-- 10/11 digitos -> prefixa 55; 12/13 -> usa como esta) + guarda de sanidade:
-- resultado fora de 12/13 digitos vira NULL, para o aluno aparecer como "sem contato"
-- em vez de disparar para um numero inventado.
--
-- Editado por replace() sobre pg_get_functiondef para NAO transcrever a funcao a mao.
-- Nao altera a prioridade do jid (conversa existente continua vindo antes do cadastro).
do $mig$
declare
  v_def text;
  v_new text;
  s1 text := $s1$'55' || regexp_replace(a.whatsapp, '[^0-9]', '', 'g') || '@s.whatsapp.net'$s1$;
  r1 text := $r1$CASE WHEN length(normalize_telefone(a.whatsapp)) IN (12,13) THEN normalize_telefone(a.whatsapp) || '@s.whatsapp.net' END$r1$;
  s2 text := $s2$'55' || regexp_replace(a.telefone, '[^0-9]', '', 'g') || '@s.whatsapp.net'$s2$;
  r2 text := $r2$CASE WHEN length(normalize_telefone(a.telefone)) IN (12,13) THEN normalize_telefone(a.telefone) || '@s.whatsapp.net' END$r2$;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'get_candidatos_pesquisa_primeira_aula';

  if v_def is null then
    raise exception 'get_candidatos_pesquisa_primeira_aula nao encontrada';
  end if;

  if position(s1 in v_def) = 0 or position(s2 in v_def) = 0 then
    raise exception 'trecho esperado nao encontrado no corpo da funcao — abortando para nao gravar versao transcrita';
  end if;

  v_new := replace(replace(v_def, s1, r1), s2, r2);
  execute v_new;
end
$mig$;

-- Limpeza do dado ja contaminado pelo bug: 2 conversas de admin_conversas nasceram com o
-- jid de 15 digitos (5555...). Como o COALESCE da RPC prefere o jid da conversa, elas
-- continuariam com destino invalido mesmo com a funcao corrigida.
-- Guardas: so corrige quando o resultado bate EXATAMENTE com o cadastro do aluno e
-- quando nao colide com outra conversa do mesmo departamento (UNIQUE whatsapp_jid+departamento).
update admin_conversas c
set whatsapp_jid = substr(regexp_replace(c.whatsapp_jid, '\D', '', 'g'), 3) || '@s.whatsapp.net',
    updated_at = now()
from alunos a
where a.id = c.aluno_id
  and length(regexp_replace(c.whatsapp_jid, '\D', '', 'g')) = 15
  and regexp_replace(c.whatsapp_jid, '\D', '', 'g') like '5555%'
  and substr(regexp_replace(c.whatsapp_jid, '\D', '', 'g'), 3) = regexp_replace(coalesce(nullif(a.whatsapp, ''), a.telefone), '\D', '', 'g')
  and not exists (
    select 1 from admin_conversas o
    where o.id <> c.id
      and o.departamento = c.departamento
      and o.whatsapp_jid = substr(regexp_replace(c.whatsapp_jid, '\D', '', 'g'), 3) || '@s.whatsapp.net'
  );
