import { useEffect } from 'react';
import { Check } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { OpcaoUnidade } from './unidadeLabel';

interface Props {
  aberto: boolean;
  onFechar: () => void;
  opcoes: readonly OpcaoUnidade[];
  /** `null` = Consolidado, o mesmo valor que vai para as RPCs. */
  selecionada: string | null;
  onEscolher: (unidadeId: string | null) => void;
  /** Mensagem do banco quando a lista nao carregou. */
  erro?: string | null;
}

/**
 * Troca de unidade no celular.
 *
 * Mesmo gesto do periodo e das secoes da ficha: pilula no cabecalho + folha de
 * baixo. A faixa deslizante que o desktop usa (um `Select` de 224px) nao cabe
 * em 375px, e um `<select>` nativo abriria a roleta do sistema, que e o unico
 * lugar do aplicativo onde a escolha nao se parece com o resto.
 *
 * ⚠️ A folha NAO decide o que pode ser oferecido — ela desenha o que
 * `opcoesDeUnidade` devolveu. "Consolidado" e escopo de admin, e essa regra
 * mora numa funcao pura, testada, longe do JSX.
 */
export function FolhaUnidades({
  aberto,
  onFechar,
  opcoes,
  selecionada,
  onEscolher,
  erro = null,
}: Props) {
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
        aria-label="Fechar unidades"
        onClick={onFechar}
        className="fixed inset-0 z-50 bg-slate-950/70"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Unidade"
        className="fixed inset-x-0 bottom-0 z-50 max-h-[84%] overflow-y-auto rounded-t-2xl border-t border-slate-800 bg-slate-900 px-3 pt-2"
        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
      >
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-slate-700" aria-hidden="true" />
        <h2 className="mb-3 px-1 font-grotesk text-sm font-bold text-slate-50">Unidade</h2>

        {erro !== null && (
          <p className="mb-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-[12.5px] text-rose-200">
            Não consegui carregar as unidades: {erro}
          </p>
        )}

        <div className="flex flex-col gap-1">
          {opcoes.map((opcao) => {
            const ativa = opcao.id === selecionada;
            return (
              <button
                key={opcao.id ?? 'consolidado'}
                type="button"
                aria-current={ativa ? 'true' : undefined}
                onClick={() => {
                  onEscolher(opcao.id);
                  onFechar();
                }}
                className={cn(
                  'flex min-h-[44px] items-center justify-between gap-2 rounded-lg px-3 text-left text-sm',
                  ativa ? 'bg-slate-800 font-bold text-cyan-400' : 'font-semibold text-slate-300',
                )}
              >
                <span className="min-w-0 truncate">{opcao.nome}</span>
                {ativa && <Check className="h-4 w-4 flex-none" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

export default FolhaUnidades;
