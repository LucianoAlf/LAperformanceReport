import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import type { ProfessorVideo } from '@/components/App/Professores/types';

export function useProfessorVideos(professorId: number | null) {
  const [videos, setVideos] = useState<ProfessorVideo[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  const fetchVideos = useCallback(async () => {
    if (!professorId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('professor_videos')
        .select(`
          *,
          cursos:curso_id (nome)
        `)
        .eq('professor_id', professorId)
        .order('curso_id')
        .order('tipo');

      if (error) throw error;

      const mapped = (data || []).map((v: any) => ({
        ...v,
        curso_nome: v.cursos?.nome || undefined,
        cursos: undefined,
      }));
      setVideos(mapped);
    } catch (err) {
      console.error('Erro ao buscar vídeos do professor:', err);
    } finally {
      setLoading(false);
    }
  }, [professorId]);

  useEffect(() => {
    fetchVideos();
  }, [fetchVideos]);

  const uploadVideo = useCallback(async (
    file: File,
    cursoId: number,
    tipo: 'experimental' | 'matricula'
  ) => {
    if (!professorId) return;

    // Validar tipo de arquivo
    if (!file.type.startsWith('video/')) {
      toast.error('Apenas arquivos de vídeo são permitidos');
      return;
    }

    // Validar tamanho (200MB)
    if (file.size > 209715200) {
      toast.error('Vídeo muito grande. Máximo: 200MB');
      return;
    }

    setUploading(true);
    try {
      const storagePath = `${professorId}/${cursoId}_${tipo}.mp4`;

      // Upload para o Storage
      const { error: uploadError } = await supabase.storage
        .from('professor-videos')
        .upload(storagePath, file, {
          contentType: file.type,
          upsert: true,
        });

      if (uploadError) throw uploadError;

      // Obter URL pública
      const { data: urlData } = supabase.storage
        .from('professor-videos')
        .getPublicUrl(storagePath);

      const url = urlData.publicUrl;

      // Inserir ou atualizar registro no banco
      // Usando upsert com a constraint UNIQUE (professor_id, curso_id, tipo)
      const { error: dbError } = await supabase
        .from('professor_videos')
        .upsert({
          professor_id: professorId,
          curso_id: cursoId,
          tipo,
          storage_path: storagePath,
          url,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'professor_id,curso_id,tipo',
        });

      if (dbError) throw dbError;

      toast.success('Vídeo enviado com sucesso');
      await fetchVideos();
    } catch (err) {
      console.error('Erro ao enviar vídeo:', err);
      toast.error('Erro ao enviar vídeo');
    } finally {
      setUploading(false);
    }
  }, [professorId, fetchVideos]);

  const deleteVideo = useCallback(async (video: ProfessorVideo) => {
    try {
      // Remover do Storage
      const { error: storageError } = await supabase.storage
        .from('professor-videos')
        .remove([video.storage_path]);

      if (storageError) {
        console.error('Erro ao remover do storage:', storageError);
      }

      // Remover do banco
      const { error: dbError } = await supabase
        .from('professor_videos')
        .delete()
        .eq('id', video.id);

      if (dbError) throw dbError;

      toast.success('Vídeo removido');
      await fetchVideos();
    } catch (err) {
      console.error('Erro ao remover vídeo:', err);
      toast.error('Erro ao remover vídeo');
    }
  }, [fetchVideos]);

  return {
    videos,
    loading,
    uploading,
    uploadVideo,
    deleteVideo,
    refetch: fetchVideos,
  };
}
