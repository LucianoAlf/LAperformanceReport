-- ============================================================
-- MIGRATION 3: Storage bucket para mídia do WhatsApp
-- Painel Conversacional WhatsApp — MVP-B (preparação)
-- Data: 2026-02-13
-- ============================================================

-- Criar bucket para mídia das conversas
-- NOTA: Executar via Dashboard do Supabase > Storage > New Bucket
-- Nome: crm-midia
-- Público: false (acesso via signed URLs)
-- Limite de arquivo: 10MB
-- Tipos permitidos: image/jpeg, image/png, image/webp, audio/ogg, audio/mpeg, 
--                   video/mp4, application/pdf, application/msword,
--                   application/vnd.openxmlformats-officedocument.wordprocessingml.document,
--                   application/vnd.ms-excel,
--                   application/vnd.openxmlformats-officedocument.spreadsheetml.sheet

-- Se preferir criar via SQL:
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'crm-midia',
  'crm-midia',
  false,
  10485760, -- 10MB
  ARRAY[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/wav',
    'video/mp4',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
) ON CONFLICT (id) DO NOTHING;

-- Políticas de acesso ao bucket
CREATE POLICY "crm_midia_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'crm-midia');

CREATE POLICY "crm_midia_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'crm-midia');

CREATE POLICY "crm_midia_update" ON storage.objects
  FOR UPDATE USING (bucket_id = 'crm-midia');

CREATE POLICY "crm_midia_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'crm-midia');
