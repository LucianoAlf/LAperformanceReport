import { useEffect, type MouseEventHandler, type ReactNode } from 'react';

import { CLASSE_PAINEL, CLASSE_VEU, dataEntrou, useFolhaAnimada } from './useFolhaAnimada';

/**
 * A casca da folha de baixo — o gesto padrão do celular neste aplicativo.
 *
 * Existe porque o mesmo desenho já aparecia em três lugares (unidades,
 * período, seções da ficha) e cada aba portada acrescentaria mais um. O que
 * se repetia era só a CASCA: véu, painel colado embaixo, alça, `Esc`, respiro
 * da área segura. O conteúdo é de quem chama.
 *
 * ⚠️ Em 29/09/2026 a conta era SEIS cópias, não três — `FolhaUnidades`,
 * `MobileMaisSheet`, `SeletorPeriodoMobile`, `SeletorSecaoMobile` e a variante
 * `folha` do `AgendaDrawer` tinham a casca escrita de novo. Só a `FolhaMobile`
 * ganharia a subida de 180ms, e o menu — a folha que mais se abre — seria a
 * única a aparecer de uma vez. As quatro primeiras passaram a usar esta casca;
 * o `AgendaDrawer` divide o MOVIMENTO (`useFolhaAnimada`) e não a casca,
 * porque a altura e o respiro dele são outros e ele também serve o desktop.
 *
 * O movimento mora em `useFolhaAnimada` — não escrever `transition` aqui.
 */

interface Props {
  aberto: boolean;
  onFechar: () => void;
  titulo: string;
  /** Linha discreta sob o título — de quem é esta folha. */
  subtitulo?: string;
  /** À direita do título, na mesma linha (o período diz ali o range vigente). */
  acessorioTitulo?: ReactNode;
  /** Sobrescreve o rótulo do véu quando "Fechar <título>" não é a frase certa. */
  rotuloFechar?: string;
  /**
   * Delegação de clique no painel. A folha de seções fecha quando alguém toca
   * numa aba, e quem monta as abas é o chamador — sem delegação, cada item
   * teria de lembrar de fechar a folha.
   */
  onClickPainel?: MouseEventHandler<HTMLDivElement>;
  children: ReactNode;
}

export function FolhaMobile({
  aberto,
  onFechar,
  titulo,
  subtitulo,
  acessorioTitulo,
  rotuloFechar,
  onClickPainel,
  children,
}: Props) {
  const { montada, entrou } = useFolhaAnimada(aberto);

  useEffect(() => {
    if (!aberto) return undefined;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFechar();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [aberto, onFechar]);

  if (!montada) return null;

  return (
    <>
      <button
        type="button"
        aria-label={rotuloFechar ?? `Fechar ${titulo}`}
        onClick={onFechar}
        {...dataEntrou(entrou)}
        className={`fixed inset-0 z-50 bg-slate-950/70 ${CLASSE_VEU}`}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        onClick={onClickPainel}
        {...dataEntrou(entrou)}
        className={`fixed inset-x-0 bottom-0 z-50 max-h-[84%] overflow-y-auto rounded-t-2xl border-t border-slate-800 bg-slate-900 px-3 pt-2 ${CLASSE_PAINEL}`}
        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
      >
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-slate-700" aria-hidden="true" />
        <div className="mb-3 flex items-baseline justify-between gap-2 px-1">
          <div className="min-w-0">
            <h2 className="font-grotesk text-sm font-bold text-slate-50">{titulo}</h2>
            {subtitulo && <p className="mt-0.5 truncate text-[12px] text-slate-400">{subtitulo}</p>}
          </div>
          {acessorioTitulo}
        </div>
        {children}
      </div>
    </>
  );
}

export default FolhaMobile;
