import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Uma linha da fila do que falta fechar.
 *
 * E uma LINHA, nao um cartao — a mesma licao que a Agenda mobile pagou em
 * 21/09: a moldura do cartao (borda + padding lateral + raio) come ~70px de
 * largura util num telefone de 390px, e era isso que truncava o nome do
 * professor, nao o nome ser longo.
 *
 * ⚠️ O par de botoes tem 44px de altura. O desktop usa 25px, que funciona com
 * mouse; aqui quem mira esta de pe na recepcao, com o polegar.
 */

interface Props {
  /** Linha de cima: o que precisa de decisao (nome do professor, curso). */
  titulo: string;
  /** Linha de baixo: onde/quando — horario, sala, quantas aulas. */
  detalhe: string;
  /** Marca a esquerda; a cor carrega a excecao, nunca a decoracao. */
  tom: 'professor' | 'aula';
  salvando: boolean;
  onPresente: () => void;
  onAusente: () => void;
  /** Rotulos dos dois comandos — "Faltou" para professor, "Falta" para aluno. */
  rotuloAusente?: string;
  /**
   * Quando a aula tem mais de um aluno, o par de botoes nao resolve: cada um
   * tem um destino. A linha entao oferece isto no lugar deles.
   */
  acaoComposta?: ReactNode;
}

const TOM = {
  professor: 'border-l-violet-400',
  aula: 'border-l-sky-400',
} as const;

export function LinhaPendencia({
  titulo,
  detalhe,
  tom,
  salvando,
  onPresente,
  onAusente,
  rotuloAusente = 'Faltou',
  acaoComposta,
}: Props) {
  return (
    <div
      className={cn(
        'flex flex-col gap-2 border-b border-l-[3px] border-b-slate-800/70 py-2.5 pl-2.5 pr-1',
        TOM[tom],
      )}
    >
      <div className="min-w-0">
        {/* ⚠️ `truncate` e nao `line-clamp`: o nome do professor e a chave da
            linha, e duas linhas de nome empurrariam os botoes para fora da
            primeira tela. Quem precisa do nome inteiro abre a aula. */}
        <p className="truncate text-[13px] font-medium leading-tight text-slate-100">{titulo}</p>
        <p className="truncate text-[11px] leading-tight text-slate-400">{detalhe}</p>
      </div>

      {acaoComposta ?? (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onPresente}
            disabled={salvando}
            className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-[13px] font-semibold text-emerald-300 active:bg-emerald-500/25 disabled:opacity-50"
          >
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Presente
          </button>
          <button
            type="button"
            onClick={onAusente}
            disabled={salvando}
            className="flex min-h-[44px] flex-1 items-center justify-center rounded-lg border border-rose-500/40 bg-rose-500/10 text-[13px] font-semibold text-rose-300 active:bg-rose-500/25 disabled:opacity-50"
          >
            {rotuloAusente}
          </button>
        </div>
      )}
    </div>
  );
}

export default LinhaPendencia;
