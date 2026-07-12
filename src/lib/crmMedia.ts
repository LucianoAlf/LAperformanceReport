import { supabase } from '@/lib/supabase';

const CRM_MEDIA_BUCKET = 'crm-midia';
const SIGNED_URL_TTL_SECONDS = 60 * 60;

type ComMidiaUrl = {
  midia_url?: string | null;
};

export function extrairCaminhoCrmMidia(url: string | null | undefined): string | null {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(
      /\/storage\/v1\/object\/(?:public|sign|authenticated)\/crm-midia\/(.+)$/,
    );
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

export async function assinarUrlCrmMidia(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(CRM_MEDIA_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    throw new Error(error?.message || 'Nao foi possivel assinar a midia do CRM');
  }

  return data.signedUrl;
}

export async function assinarMidiasDasMensagens<T extends ComMidiaUrl>(
  mensagens: T[],
): Promise<T[]> {
  const paths = [...new Set(
    mensagens
      .map((mensagem) => extrairCaminhoCrmMidia(mensagem.midia_url))
      .filter((path): path is string => Boolean(path)),
  )];

  if (paths.length === 0) return mensagens;

  const { data, error } = await supabase.storage
    .from(CRM_MEDIA_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);

  if (error || !data) {
    console.error('[crmMedia] Falha ao renovar URLs assinadas:', error);
    return mensagens;
  }

  const urlsPorPath = new Map(
    data
      .filter((item) => item.signedUrl)
      .map((item) => [item.path, item.signedUrl] as const),
  );

  return mensagens.map((mensagem) => {
    const path = extrairCaminhoCrmMidia(mensagem.midia_url);
    const signedUrl = path ? urlsPorPath.get(path) : null;
    return signedUrl ? { ...mensagem, midia_url: signedUrl } : mensagem;
  });
}
