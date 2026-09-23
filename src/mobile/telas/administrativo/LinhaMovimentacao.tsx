import { ChevronRight } from 'lucide-react';
import type { LinhaDaMovimentacao } from '@/lib/administrativoMobile';
import { cn } from '@/lib/utils';

/**
 * Uma movimentação do mês.
 *
 * É uma LINHA, não um cartão, e não é uma tabela encolhida. A do computador
 * tem 11 colunas e 1.320px; aqui o nome do aluno fica inteiro na primeira
 * linha e o que varia por tipo (reajuste, mês de saída, permanência) entra
 * como UM destaque, decidido em `montarLinha`.
 *
 * ⚠️ O nome do aluno NUNCA trunca. Ele é a chave da linha: cortado, a ADM não
 * sabe em quem está tocando — foi o defeito medido na Conciliação (7 nomes
 * cortados) e na Chamada. Curso e professor podem truncar; o nome quebra em
 * duas linhas se precisar.
 *
 * ── O que saiu daqui depois de olhar a tela ──────────────────────────────
 *
 * 🔴 **A barra colorida por tipo.** Ela pintava a borda esquerda de **43 de
 * 43 linhas** com a mesma cor, porque o chip acima já filtrou o tipo: dentro
 * de uma fila, todas as linhas são do mesmo tipo por construção. Era o
 * vocabulário de exceção aplicado ao caso geral — exatamente o que a Agenda
 * mobile corrigiu em 21/09 (*"a barra da linha normal é transparente"*) e que
 * eu repeti aqui. A cor do tipo vive no CHIP, que é onde ela distingue.
 *
 * 🔴 **A data.** Era uma coluna repetida em toda linha: 43 linhas para 16
 * datas. Virou cabeçalho de bloco (`agruparPorDia`).
 *
 * 🔴 **O botão de lápis.** Eram 43 ícones cinzas idênticos numa coluna, e um
 * alvo de 44px dentro de uma linha de 74px que não fazia nada. Hoje a LINHA
 * INTEIRA abre a edição — alvo maior, uma affordance em vez de duas, e a
 * coluna de ruído desaparece.
 */

interface Props {
  linha: LinhaDaMovimentacao;
  /** Abre o modal de edição do computador. Ausente = a linha é só leitura. */
  onEditar?: () => void;
  /** A unidade só entra quando há mais de uma na lista (`precisaMostrarUnidade`). */
  mostrarUnidade?: boolean;
}

export function LinhaMovimentacao({ linha, onEditar, mostrarUnidade = false }: Props) {
  const conteudo = (
    <>
      <div className="min-w-0 flex-1">
        {/* Sem `truncate`: ver o comentário do topo. */}
        <p className="text-[13.5px] font-medium leading-snug text-slate-100">{linha.titulo}</p>

        <p className="mt-0.5 truncate text-[11.5px] leading-tight text-slate-400">
          {linha.contexto || '—'}
        </p>

        {(linha.destaque || linha.detalhe) && (
          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11.5px] leading-tight">
            {linha.destaque && (
              <span className="font-semibold text-slate-200">{linha.destaque}</span>
            )}
            {linha.destaque && linha.detalhe && <span className="text-slate-600">·</span>}
            {linha.detalhe && <span className="text-slate-400">{linha.detalhe}</span>}
          </p>
        )}
      </div>

      {mostrarUnidade && linha.unidade && (
        <span className="mt-0.5 shrink-0 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">
          {linha.unidade}
        </span>
      )}

      {/* A seta diz que a linha abre algo. Ela não é um alvo próprio — quem é
          alvo é a linha inteira. */}
      {onEditar && <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-600" aria-hidden />}
    </>
  );

  const classe = 'flex w-full items-start gap-2 border-b border-slate-800/70 py-2.5 text-left';

  if (!onEditar) {
    return <div className={classe}>{conteudo}</div>;
  }

  return (
    <button
      type="button"
      onClick={onEditar}
      aria-label={`Editar movimentação de ${linha.titulo}`}
      className={cn(classe, 'active:bg-slate-900')}
    >
      {conteudo}
    </button>
  );
}
