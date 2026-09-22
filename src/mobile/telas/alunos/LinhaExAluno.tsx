import { ChevronRight, History } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { RegistroLTV } from '@/hooks/useHistoricoLTV';
import { acoesDoRegistroLtv, formatarMesesLtv, tomDoTempoLtv } from '@/lib/historicoLtv';

/**
 * Uma linha do Histórico LTV no celular.
 *
 * A tabela do desktop tem 7 colunas e mede 821px; num aparelho de 390px
 * sobram 344px, então CINCO colunas ficam fora da tela — e as que somem são
 * Meses, Categoria, Mês Saída, Fonte e Ações, ou seja, tudo que a aba existe
 * para responder. Fica só o nome, que sozinho não responde nada.
 *
 *   Davi Borges da Silva              95,7
 *   Interrompido · Abril/2026        meses
 *
 * O número fica à direita e grande porque a pergunta da aba é "quanto tempo
 * essa pessoa ficou" — é ele que se varre com o olho descendo a lista.
 */

interface Props {
  registro: RegistroLTV;
  onAbrir: (registro: RegistroLTV) => void;
}

export function LinhaExAluno({ registro, onAbrir }: Props) {
  const acoes = acoesDoRegistroLtv(registro);
  const longo = tomDoTempoLtv(registro.tempo_permanencia_meses) === 'longo';
  const abaixo = [registro.categoria_saida, registro.mes_saida].filter(Boolean).join(' · ');

  const conteudo = (
    <>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] font-medium leading-tight text-slate-100">{registro.nome}</p>
        <p className="mt-0.5 flex items-center gap-1.5 truncate text-[11.5px] leading-tight text-slate-400">
          {abaixo || 'sem categoria'}
          {acoes.verPassagens && (
            <span className="inline-flex flex-none items-center gap-0.5 rounded-full bg-violet-500/15 px-1.5 text-[10px] font-medium text-violet-300">
              <History className="h-2.5 w-2.5" aria-hidden="true" />
              {registro.qtd_passagens_pessoa}
            </span>
          )}
        </p>
      </div>

      <div className="flex flex-none items-baseline gap-1">
        <span className={cn('text-[15px] font-semibold tabular-nums', longo ? 'text-cyan-400' : 'text-amber-400')}>
          {formatarMesesLtv(registro.tempo_permanencia_meses)}
        </span>
        <span className="text-[10px] text-slate-500">m</span>
      </div>

      {/* A seta só aparece onde há para onde ir. Desenhá-la sempre prometeria
          um toque que, no registro do sistema sem 2ª passagem, não faz nada. */}
      {acoes.temAlguma ? (
        <ChevronRight className="h-4 w-4 flex-none text-slate-600" aria-hidden="true" />
      ) : (
        <span className="w-4 flex-none" aria-hidden="true" />
      )}
    </>
  );

  const classe = 'flex w-full items-center gap-2.5 border-b border-slate-800/70 py-2.5 pl-1 pr-1 text-left';

  // ⚠️ Sem ação, não é botão. Um `<button>` que não faz nada é pior que texto:
  // ele promete, o leitor de tela o anuncia como comando e o dedo tenta.
  if (!acoes.temAlguma) {
    return <div className={classe}>{conteudo}</div>;
  }

  return (
    <button
      type="button"
      onClick={() => onAbrir(registro)}
      className={cn(classe, 'active:bg-slate-800/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400')}
    >
      {conteudo}
    </button>
  );
}

export default LinhaExAluno;
