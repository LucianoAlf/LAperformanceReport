-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Bucket público para vídeos dos professores (max 200MB, apenas MP4)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('professor-videos', 'professor-videos', true, 209715200, ARRAY['video/mp4']);

-- Storage policies
CREATE POLICY "professor_videos_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'professor-videos');
CREATE POLICY "professor_videos_auth_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'professor-videos' AND auth.role() = 'authenticated');
CREATE POLICY "professor_videos_auth_update" ON storage.objects
  FOR UPDATE USING (bucket_id = 'professor-videos' AND auth.role() = 'authenticated');
CREATE POLICY "professor_videos_auth_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'professor-videos' AND auth.role() = 'authenticated');

-- Tabela: 1 vídeo por professor + curso + tipo (experimental/matricula)
CREATE TABLE professor_videos (
  id SERIAL PRIMARY KEY,
  professor_id INTEGER NOT NULL REFERENCES professores(id) ON DELETE CASCADE,
  curso_id INTEGER NOT NULL REFERENCES cursos(id) ON DELETE CASCADE,
  tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('experimental', 'matricula')),
  storage_path TEXT NOT NULL,
  url TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (professor_id, curso_id, tipo)
);

CREATE INDEX idx_professor_videos_professor ON professor_videos(professor_id);
CREATE INDEX idx_professor_videos_curso ON professor_videos(curso_id);

-- RLS
ALTER TABLE professor_videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "professor_videos_select" ON professor_videos
  FOR SELECT USING (true);
CREATE POLICY "professor_videos_modify" ON professor_videos
  FOR ALL USING (auth.role() = 'authenticated');
