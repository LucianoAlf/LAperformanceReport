import { ChevronDown } from 'lucide-react';
import { useLocation } from 'react-router-dom';

import { usePageTitle } from '@/contexts/PageTitleContext';
import { MENU_ADMIN, MENU_OPERACIONAL, MENU_PRINCIPAL } from '@/lib/menuItems';
import { tituloDaRota } from './tituloRota';

const TODOS_OS_ITENS = [...MENU_PRINCIPAL, ...MENU_OPERACIONAL, ...MENU_ADMIN];

interface Props {
  unidadeNome: string;
  /**
   * Ausente enquanto a folha de unidades nao existe (etapa 2, LAPE-32+) — o
   * seletor vira texto simples. Nao ha ponto de fazer o usuario tocar num
   * botao que nao faz nada, e a pilula ciano + chevron diz "toque aqui".
   */
  onAbrirUnidades?: () => void;
  iniciais: string;
}

/**
 * Cabecalho compacto (56px). O seletor de unidade fica sempre a vista:
 * sem ele, todo numero na tela e ambiguo entre as tres unidades.
 */
export function MobileHeader({ unidadeNome, onAbrirUnidades, iniciais }: Props) {
  const { pageTitle } = usePageTitle();
  const location = useLocation();
  // PageTitleContext nunca foi alimentado (zero produtores no app) — sem este
  // fallback por rota, o cabecalho diria "LA Report" para sempre em qualquer
  // tela alcancada so pelo "Mais", onde nada na barra de baixo fica ciano.
  const titulo = pageTitle?.titulo || tituloDaRota(location.pathname, TODOS_OS_ITENS);

  return (
    <header className="flex h-14 flex-none items-center gap-2 border-b border-slate-800 bg-slate-900 px-3">
      <h1 className="min-w-0 flex-1 truncate font-grotesk text-base font-bold text-slate-50">
        {titulo}
      </h1>

      {onAbrirUnidades ? (
        <button
          type="button"
          onClick={onAbrirUnidades}
          className="flex flex-none items-center gap-1 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-semibold text-cyan-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
        >
          <span className="max-w-[92px] truncate">{unidadeNome}</span>
          <ChevronDown className="h-3 w-3" aria-hidden="true" />
        </button>
      ) : (
        <span className="flex flex-none items-center rounded-full border border-slate-700 bg-slate-800/60 px-2.5 py-1 text-[11px] font-semibold text-slate-300">
          <span className="max-w-[92px] truncate">{unidadeNome}</span>
        </span>
      )}

      <span
        className="grid h-7 w-7 flex-none place-items-center rounded-full bg-gradient-to-br from-purple-500 to-cyan-400 text-[10px] font-bold text-white"
        aria-hidden="true"
      >
        {iniciais}
      </span>
    </header>
  );
}

export default MobileHeader;
