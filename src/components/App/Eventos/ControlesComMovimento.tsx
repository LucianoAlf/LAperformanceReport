import { useId, type ReactNode } from 'react';
import { motion, useReducedMotion, LayoutGroup } from 'framer-motion';

import { cn } from '@/lib/utils';

/**
 * Controles com movimento do módulo Eventos — inspirados em uiarc.dev (pedido do Hugo,
 * 09/10/2026), na paleta do sistema. `useReducedMotion` desliga a animação para quem pediu
 * menos movimento; nenhuma informação depende dela.
 */
export const MOLA_CURTA = { type: 'spring', stiffness: 600, damping: 34, mass: 0.6 } as const;

export function BotaoComMola({
  children,
  onClick,
  desabilitado,
  className,
}: {
  children: ReactNode;
  onClick: () => void;
  desabilitado: boolean;
  className?: string;
}) {
  const reduzir = useReducedMotion();
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={desabilitado}
      whileTap={reduzir || desabilitado ? undefined : { scale: 0.97 }}
      transition={MOLA_CURTA}
      className={cn(
        'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 text-[13px] font-semibold sm:min-h-[36px]',
        'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950',
        'disabled:cursor-not-allowed disabled:opacity-45',
        className,
      )}
    >
      {children}
    </motion.button>
  );
}

/**
 * Controle segmentado com a pílula que desliza até a opção escolhida (padrão das abas do
 * uiarc). O `LayoutGroup` com id próprio isola a pílula: dois segmentados na mesma tela não
 * puxam a pílula um do outro.
 */
export function Segmentado<T extends string | number | null>({
  rotulo,
  opcoes,
  valor,
  onMudar,
  ocultarRotulo = false,
}: {
  rotulo: string;
  /** O rótulo vira só `aria-label` — quando o campo já tem um Label visível em cima. */
  ocultarRotulo?: boolean;
  opcoes: { valor: T; rotulo: string; marcador?: ReactNode }[];
  valor: T;
  onMudar: (v: T) => void;
}) {
  const id = useId();
  const reduzir = useReducedMotion();
  return (
    <div className="flex flex-wrap items-center gap-2">
      {!ocultarRotulo && <span className="text-[12px] text-slate-500 sm:text-[11px]">{rotulo}:</span>}
      <LayoutGroup id={id}>
        <div
          role="radiogroup"
          aria-label={rotulo}
          className="flex max-w-full flex-wrap gap-0.5 rounded-xl border border-slate-700 bg-slate-900/60 p-0.5"
        >
          {opcoes.map((o) => {
            const ativo = o.valor === valor;
            return (
              <button
                key={String(o.valor)}
                type="button"
                role="radio"
                aria-checked={ativo}
                onClick={() => onMudar(o.valor)}
                className={cn(
                  'relative min-h-[40px] rounded-lg px-3 text-[12.5px] transition-colors sm:min-h-[30px] sm:text-[12px]',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/70',
                  ativo ? 'text-amber-100' : 'text-slate-400 hover:text-slate-200',
                )}
              >
                {ativo && (
                  <motion.span
                    layoutId="pilula"
                    transition={reduzir ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 38 }}
                    className="absolute inset-0 rounded-lg bg-amber-500/20 ring-1 ring-amber-500/40"
                  />
                )}
                <span className="relative flex items-center gap-1.5">
                  {o.marcador}
                  {o.rotulo}
                </span>
              </button>
            );
          })}
        </div>
      </LayoutGroup>
    </div>
  );
}
