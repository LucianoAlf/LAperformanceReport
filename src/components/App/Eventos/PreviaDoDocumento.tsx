import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Eye } from 'lucide-react';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

/**
 * Prévia de um documento dentro do sistema, antes de gerar — pedido do Hugo em 09/10/2026
 * ("é bom a gente ver como que é antes de gerar").
 *
 * Mostra o MESMO HTML que vai para a janela de impressão (nada de segunda renderização que
 * pudesse divergir do papel), num iframe isolado, reduzido para caber na largura do diálogo.
 * A barra "Salvar em PDF / Imprimir" do documento some aqui — quem gera é o botão do diálogo.
 *
 * ⚠️ Abrir a prévia NÃO marca nada como emitido: só o botão de gerar faz isso, e depois de a
 * janela de impressão abrir.
 */

/** Largura de uma folha A4 deitada em CSS px (297mm), mais a margem que o documento põe em volta. */
const LARGURA_FOLHA_PX = 297 * (96 / 25.4) + 48;

const ESTILO_DA_PREVIA = `
  .acoes { display: none !important; }
  body { background: #e2e8f0 !important; }
  .cert, .folha { margin-left: auto !important; margin-right: auto !important; }
`;

export function PreviaDoDocumento({
  aberto,
  onFechar,
  titulo,
  descricao,
  html,
  acaoGerar,
}: {
  aberto: boolean;
  onFechar: () => void;
  titulo: string;
  descricao?: string;
  /** O documento inteiro, exatamente como sai para impressão. */
  html: string;
  /** Botão de gerar, renderizado no rodapé. */
  acaoGerar: ReactNode;
}) {
  const quadro = useRef<HTMLDivElement>(null);
  const iframe = useRef<HTMLIFrameElement>(null);
  const [zoom, setZoom] = useState(0.6);

  const ajustarZoom = useCallback(() => {
    const largura = quadro.current?.clientWidth ?? 0;
    if (largura > 0) setZoom(Math.min(1, largura / LARGURA_FOLHA_PX));
  }, []);

  useEffect(() => {
    if (!aberto) return;
    const el = quadro.current;
    if (!el) return;
    ajustarZoom();
    const observador = new ResizeObserver(ajustarZoom);
    observador.observe(el);
    return () => observador.disconnect();
  }, [aberto, ajustarZoom]);

  // O zoom vai no BODY do documento (iframe srcDoc é mesma origem): reduz o desenho sem
  // mudar a medida real da folha, então o que se vê é proporcional ao papel.
  const aplicarNoDocumento = useCallback(() => {
    const doc = iframe.current?.contentDocument;
    if (!doc?.body) return;
    (doc.body.style as CSSStyleDeclaration & { zoom: string }).zoom = String(zoom);
  }, [zoom]);

  useEffect(aplicarNoDocumento, [aplicarNoDocumento]);

  const htmlDaPrevia = html.replace('</head>', `<style>${ESTILO_DA_PREVIA}</style></head>`);

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="flex max-h-[92vh] w-[min(96vw,1100px)] max-w-none flex-col gap-3 border-slate-700 bg-slate-900 p-4 sm:p-5">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Eye className="h-4 w-4 text-amber-400" />
            {titulo}
          </DialogTitle>
          {descricao && <DialogDescription>{descricao}</DialogDescription>}
        </DialogHeader>

        <div
          ref={quadro}
          className="min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-700 bg-slate-200"
        >
          <iframe
            ref={iframe}
            title={titulo}
            srcDoc={htmlDaPrevia}
            onLoad={aplicarNoDocumento}
            // Sem scripts: a prévia só desenha. O botão "Salvar em PDF" do documento é do papel.
            sandbox="allow-same-origin"
            className="h-[62vh] w-full"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[12px] text-slate-500">
            Prévia reduzida. Nada é marcado como emitido até você gerar.
          </p>
          <div className="flex items-center gap-2">
            <BotaoSecundario onClick={onFechar}>Fechar</BotaoSecundario>
            {acaoGerar}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function BotaoSecundario({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  const reduzir = useReducedMotion();
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={reduzir ? undefined : { scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 600, damping: 34, mass: 0.6 }}
      className="inline-flex min-h-[44px] items-center rounded-xl border border-slate-700 px-4 text-[13px] text-slate-300 transition-colors hover:bg-slate-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/70 sm:min-h-[36px]"
    >
      {children}
    </motion.button>
  );
}
