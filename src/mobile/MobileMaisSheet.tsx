import { useEffect } from 'react';
import { NavLink } from 'react-router-dom';

import { MENU_ADMIN, MENU_HISTORICO, MENU_OPERACIONAL, MENU_PRINCIPAL, type ItemMenu } from '@/lib/menuItems';
import { filtrarVisiveis, type ContextoVisibilidade } from '@/lib/menuVisibilidade';

interface Props {
  aberto: boolean;
  onFechar: () => void;
  /** as flags vem de quem ja as consulta — a folha nao vai ao banco */
  contexto: ContextoVisibilidade;
}

function Grupo({ titulo, itens, onFechar }: { titulo: string; itens: ItemMenu[]; onFechar: () => void }) {
  if (itens.length === 0) return null;
  return (
    <>
      <h3 className="mb-2 mt-3 text-[9.5px] font-bold uppercase tracking-widest text-slate-500">
        {titulo}
      </h3>
      <div className="grid grid-cols-4 gap-x-1 gap-y-2.5">
        {itens.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.end}
              onClick={onFechar}
              className="flex flex-col items-center gap-1 rounded-lg py-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
            >
              <span className="grid h-10 w-10 place-items-center rounded-xl border border-slate-700 bg-slate-800">
                <Icon className="h-[17px] w-[17px] text-slate-400" aria-hidden="true" />
              </span>
              <span className="max-w-full text-center text-[8.5px] font-medium leading-tight text-slate-400">
                {item.labelCurto ?? item.label}
              </span>
            </NavLink>
          );
        })}
      </div>
    </>
  );
}

export function MobileMaisSheet({ aberto, onFechar, contexto }: Props) {
  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar(); };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [aberto, onFechar]);

  if (!aberto) return null;

  const principal = filtrarVisiveis(MENU_PRINCIPAL, contexto);
  const operacional = filtrarVisiveis(MENU_OPERACIONAL, contexto);
  const admin = filtrarVisiveis(MENU_ADMIN, contexto);
  // MENU_HISTORICO nao declara `visibilidade` — filtrarVisiveis nao filtra
  // nada aqui, e e' o comportamento certo: no desktop este bloco fica FORA
  // do gate de admin, visivel a todo mundo.
  const historico = filtrarVisiveis(MENU_HISTORICO, contexto);

  return (
    <>
      <button
        type="button"
        aria-label="Fechar menu"
        onClick={onFechar}
        className="fixed inset-0 z-40 bg-slate-950/70"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Todos os módulos"
        className="fixed inset-x-0 bottom-0 z-50 max-h-[84%] overflow-y-auto rounded-t-2xl border-t border-slate-800 bg-slate-900 px-3 pt-2"
        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
      >
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-slate-700" aria-hidden="true" />
        <h2 className="font-grotesk text-sm font-bold text-slate-50">Todos os módulos</h2>
        <p className="text-[10.5px] text-slate-500">O que você abre direto fica na barra de baixo</p>

        <Grupo titulo="Principal" itens={principal} onFechar={onFechar} />
        <Grupo titulo="Operacional" itens={operacional} onFechar={onFechar} />
        <Grupo titulo="Administração" itens={admin} onFechar={onFechar} />
        <Grupo titulo="Histórico" itens={historico} onFechar={onFechar} />
      </div>
    </>
  );
}

export default MobileMaisSheet;
