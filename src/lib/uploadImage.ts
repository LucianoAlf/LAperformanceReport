import { supabase } from '@/lib/supabase';

/**
 * Converte uma string base64 em Blob
 */
function base64ToBlob(base64: string, mimeType: string = 'image/jpeg'): Blob {
  const byteString = atob(base64.split(',')[1]);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  
  return new Blob([ab], { type: mimeType });
}

/**
 * Faz upload de uma imagem base64 para o Supabase Storage
 * @param base64Image - String base64 da imagem
 * @param folder - Pasta no storage (ex: 'professores', 'alunos')
 * @param fileName - Nome do arquivo (opcional, será gerado automaticamente se não fornecido)
 * @returns URL pública da imagem ou a própria base64 em caso de erro
 */
export async function uploadImageToStorage(
  base64Image: string,
  folder: string,
  fileName?: string
): Promise<string> {
  try {
    // Gerar nome único se não fornecido
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 15);
    const finalFileName = fileName || `${timestamp}_${randomStr}.jpg`;
    
    // Converter base64 para Blob
    const blob = base64ToBlob(base64Image);
    
    // Caminho completo no storage
    const filePath = `${folder}/${finalFileName}`;
    
    // Tentar upload para o Supabase Storage
    const { data, error } = await supabase.storage
      .from('avatars')
      .upload(filePath, blob, {
        contentType: 'image/jpeg',
        upsert: true
      });
    
    if (error) {
      console.warn('Storage não disponível, salvando base64 diretamente:', error.message);
      // Se o storage não estiver disponível, retornar a base64
      return base64Image;
    }
    
    // Obter URL pública
    const { data: publicUrlData } = supabase.storage
      .from('avatars')
      .getPublicUrl(filePath);
    
    return publicUrlData.publicUrl;
  } catch (error) {
    console.warn('Erro ao processar upload, salvando base64 diretamente:', error);
    // Em caso de erro, retornar a base64 original
    return base64Image;
  }
}

/**
 * Remove uma imagem do Supabase Storage
 * @param imageUrl - URL completa da imagem
 */
export async function deleteImageFromStorage(imageUrl: string): Promise<boolean> {
  try {
    // Extrair o caminho do arquivo da URL
    const url = new URL(imageUrl);
    const pathParts = url.pathname.split('/avatars/');
    if (pathParts.length < 2) return false;
    
    const filePath = pathParts[1];
    
    const { error } = await supabase.storage
      .from('avatars')
      .remove([filePath]);
    
    if (error) {
      console.error('Erro ao deletar imagem:', error);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Erro ao processar deleção da imagem:', error);
    return false;
  }
}
