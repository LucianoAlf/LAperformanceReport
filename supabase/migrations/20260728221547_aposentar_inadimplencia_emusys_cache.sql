-- Aposenta o cache de inadimplência e seus 9 crons.
--
-- MOTIVO: os crons nunca funcionaram, desde o deploy em 2026-07-15. Eles enviam apenas
-- o header x-sync-token, mas a edge sync-inadimplencia-emusys está com verify_jwt=true
-- (nunca ganhou entrada em supabase/config.toml, ao contrário da irmã
-- sync-professor-disciplinas-emusys). O gateway do Supabase rejeita com
-- 401 UNAUTHORIZED_NO_AUTH_HEADER antes do código da função rodar, então a validação
-- por x-sync-token que existe dentro dela nunca foi alcançada.
--
-- O pg_cron marcava todas as execuções como "succeeded" porque só avalia se o
-- net.http_post foi enfileirado -- o status HTTP da resposta não volta pra ele.
-- Por isso a falha durou 13 dias sem ninguém notar.
--
-- As 682 linhas do cache (Recreio 422, Barra 260, Campo Grande ZERO) são resíduo de
-- cliques manuais no botão "Atualizar agora", que mandava o JWT do usuário.
--
-- SUBSTITUÍDO POR: aluno_jornada_matricula_disciplina.inadimplente_emusys, mesmo campo
-- da mesma API (contrato_atual.inadimplente de GET /matriculas), gravado pelo
-- sync-matriculas-emusys, cujo cron das 02h BRT funciona. Cobre as 3 unidades.
--
-- Renomeia em vez de dropar, seguindo a convenção do projeto para tabela aposentada
-- (renovacoes_legado, dados_comerciais_legado, origem_leads_legado).

select cron.unschedule(jobname)
from cron.job
where jobname like 'sync-inadimplencia-%';

alter table if exists public.inadimplencia_emusys_cache
  rename to inadimplencia_emusys_cache_legado;

comment on table public.inadimplencia_emusys_cache_legado is
  'APOSENTADA 2026-07-28. Cache de inadimplencia por matricula. Os 9 crons nunca funcionaram (401 no gateway: mandavam so x-sync-token contra edge com verify_jwt=true). Dados congelados em 15/07/2026 e Campo Grande sempre vazia. Fonte viva = aluno_jornada_matricula_disciplina.inadimplente_emusys. NAO USAR.';
