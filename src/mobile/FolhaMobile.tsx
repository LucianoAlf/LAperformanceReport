import { useEffect, type ReactNode } from 'react';

/**
 * A casca da folha de baixo — o gesto padrão do celular neste aplicativo.
 *
 * Existe porque o mesmo desenho já aparecia em três lugares (unidades,
 * período, seções da ficha) e cada aba portada acrescentaria mais um. O que
 * se repetia era só a CASCA: véu, painel colado embaixo, alça, `Esc`, respiro
 * da área segura. O conteúdo é de quem chama.
 *
 * ⚠️ `FolhaUnidades` NÃO foi migrada para cá. Ela é do shell, está travada por
 * teste, e trocar a casca dela agora misturaria "criar o vocabulário" com
 * "mexer no que já funciona" no mesmo commit.
 */

interface Props {
  aberto: boolean;
  onFechar: () => void;
  titulo: string;
  /** Linha discreta sob o título — de quem é esta folha. */
  subtitulo?: string;
  children: ReactNode;
}

export function FolhaMobile({ aberto, onFechar, titulo, subtitulo, children }: Props) {
  useEffect(() => {
    if (!aberto) return undefined;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFechar();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [aberto, onFechar]);

  if (!aberto) return null;

  return (
    <>
      <button
        type="button"
        aria-label={`Fechar ${titulo}`}
        onClick={onFechar}
        className="fixed inset-0 z-50 bg-slate-950/70"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className="fixed inset-x-0 bottom-0 z-50 max-h-[84%] overflow-y-auto rounded-t-2xl border-t border-slate-800 bg-slate-900 px-3 pt-2"
        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
      >
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-slate-700" aria-hidden="true" />
        <div className="mb-3 px-1">
          <h2 className="font-grotesk text-sm font-bold text-slate-50">{titulo}</h2>
          {subtitulo && <p className="mt-0.5 truncate text-[12px] text-slate-400">{subtitulo}</p>}
        </div>
        {children}
      </div>
    </>
  );
}

export default FolhaMobile;
