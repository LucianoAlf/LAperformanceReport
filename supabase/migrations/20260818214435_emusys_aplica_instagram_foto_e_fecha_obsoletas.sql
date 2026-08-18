-- Continuação da limpeza "vale o que está no Emusys" (Alf, 2026-08-18).

-- ── 1. INSTAGRAM (3) e FOTO (1) ─────────────────────────────────────────────
-- Ficaram de fora da migration anterior porque eu não tratei esses dois tipos.
-- São o caso mais simples: Emusys tem, nosso está NULL.
-- ⚠️ Este bloco tem um defeito conhecido, corrigido em 20260818214509: quando o MESMO
-- aluno tem duas linhas em `alvo` (foto + instagram), o `update ... from` aplica só
-- UMA delas — o Postgres escolhe arbitrariamente. Aconteceu com Davi Lima Queiroz.
with alvo as (
  select d.id, d.aluno_id, d.tipo_divergencia,
         nullif(btrim(d.valor_emusys->>'instagram'),'') as insta,
         nullif(btrim(d.valor_emusys->>'foto_url'),'')  as foto
  from alunos_emusys_atributos_divergencias d
  where d.tipo_divergencia in ('instagram_ausente','foto_ausente')
    and coalesce(d.resolvido,false) = false
    and not exists (select 1 from matriculas_campos_fixados f
                     where f.aluno_id = d.aluno_id
                       and f.campo = case when d.tipo_divergencia='instagram_ausente' then 'instagram' else 'foto_url' end)
),
aplicado as (
  update alunos a
     set instagram = case when alvo.tipo_divergencia='instagram_ausente' and alvo.insta is not null
                          then alvo.insta else a.instagram end,
         foto_url  = case when alvo.tipo_divergencia='foto_ausente' and alvo.foto is not null
                          then alvo.foto else a.foto_url end,
         updated_at = now()
  from alvo where a.id = alvo.aluno_id
  returning alvo.id
)
update alunos_emusys_atributos_divergencias d
   set resolvido = true, decisao = 'aplicar_emusys',
       decidido_por = 'sistema_emusys_manda_20260818', decidido_em = now(), updated_at = now()
 where d.id in (select id from aplicado);

-- ── 2. FECHA "ausente_nosso_sistema" JÁ RESOLVIDO ───────────────────────────
-- Ester Soares (matrícula 2312) e Julia da Costa (2129) apareciam como "existe no
-- Emusys e não aqui", mas a matrícula JÁ está vinculada a uma linha de `alunos`.
-- É alerta obsoleto: foi detectado em 09/08 e o vínculo aconteceu depois, sem que a
-- limpeza por rodada alcançasse este tipo. Fecha com motivo auditável.
update matriculas_divergencias md
   set resolvido = true, updated_at = now(),
       analise_sol = 'Resolvida automaticamente: a matricula ja esta vinculada a uma linha de alunos.'
 where md.resolvido = false
   and md.tipo_divergencia = 'ausente_nosso_sistema'
   and exists (
     select 1 from alunos a
      where a.unidade_id = md.unidade_id
        and btrim(a.emusys_matricula_id) = btrim(md.valor_api->>'emusys_id')
   );
