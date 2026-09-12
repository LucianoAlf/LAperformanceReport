import { MoreHorizontal } from 'lucide-react';
import { NavLink } from 'react-router-dom';

import { MENU_OPERACIONAL, MENU_PRINCIPAL, ROTAS_BARRA_INFERIOR, type ItemMenu } from '@/lib/menuItems';

const TODOS: ItemMenu[] = [...MENU_PRINCIPAL, ...MENU_OPERACIONAL];

/** Os 4 destinos fixos, na ordem declarada na fonte unica. */
const DESTINOS: ItemMenu[] = ROTAS_BARRA_INFERIOR
  .map((path) => TODOS.find((i) => i.path === path))
  .filter((i): i is ItemMenu => Boolean(i));

interface Props {
  onAbrirMais: () => void;
}

export function MobileBottomNav({ onAbrirMais }: Props) {
  return (
    <nav
      className="grid flex-none grid-cols-5 border-t border-slate-800 bg-slate-900 px-1 pt-1.5"
      style={{ paddingBottom: 'calc(0.375rem + env(safe-area-inset-bottom))' }}
      aria-label="Navegação principal"
    >
      {DESTINOS.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.end}
            className={({ isActive }) =>
              `flex min-h-[44px] flex-col items-center justify-center gap-0.5 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400 ${
                isActive ? 'text-cyan-400' : 'text-slate-500'
              }`
            }
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
            <span className="text-[9.5px] font-medium leading-none">
              {item.labelCurto ?? item.label}
            </span>
          </NavLink>
        );
      })}

      <button
        type="button"
        onClick={onAbrirMais}
        className="flex min-h-[44px] flex-col items-center justify-center gap-0.5 rounded-lg text-slate-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
      >
        <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
        <span className="text-[9.5px] font-medium leading-none">Mais</span>
      </button>
    </nav>
  );
}

export default MobileBottomNav;
