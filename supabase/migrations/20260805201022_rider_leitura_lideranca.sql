-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Rider: liderança passa a ler, com escopo de unidade.
-- Admin le tudo. Perfil 'unidade' (gerencia/coordenacao/ADM) le so a propria unidade.
-- Perfil 'professor' continua sem acesso. Escrita continua so do dono.

DROP POLICY IF EXISTS rider_dono_ou_admin ON public.colaborador_rider;

CREATE POLICY rider_leitura ON public.colaborador_rider
  FOR SELECT TO authenticated
  USING (
    colaborador_id IN (SELECT c.id FROM public.colaboradores c WHERE c.usuario_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.usuarios u
               WHERE u.auth_user_id = auth.uid() AND u.perfil = 'admin')
    OR EXISTS (SELECT 1 FROM public.usuarios u
               JOIN public.colaboradores c ON c.id = colaborador_rider.colaborador_id
               WHERE u.auth_user_id = auth.uid()
                 AND u.perfil = 'unidade'
                 AND u.unidade_id = c.unidade_id)
  );

CREATE POLICY rider_escrita_dono ON public.colaborador_rider
  FOR ALL TO authenticated
  USING (
    colaborador_id IN (SELECT c.id FROM public.colaboradores c WHERE c.usuario_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.usuarios u
               WHERE u.auth_user_id = auth.uid() AND u.perfil = 'admin')
  )
  WITH CHECK (
    colaborador_id IN (SELECT c.id FROM public.colaboradores c WHERE c.usuario_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.usuarios u
               WHERE u.auth_user_id = auth.uid() AND u.perfil = 'admin')
  );

COMMENT ON POLICY rider_leitura ON public.colaborador_rider IS
  'Leitura: proprio dono, admin (todas unidades) e perfil unidade (so a sua). Professor nao le.';
