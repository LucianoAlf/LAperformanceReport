import { NavLink } from 'react-router-dom';

import { MENU_ADMIN, MENU_HISTORICO, MENU_OPERACIONAL, MENU_PRINCIPAL, type ItemMenu } from '@/lib/menuItems';
import { filtrarVisiveis, type ContextoVisibilidade } from '@/lib/menuVisibilidade';
import { FolhaMobile } from './FolhaMobile';

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
  const principal = filtrarVisiveis(MENU_PRINCIPAL, contexto);
  const operacional = filtrarVisiveis(MENU_OPERACIONAL, contexto);
  const admin = filtrarVisiveis(MENU_ADMIN, contexto);
  // MENU_HISTORICO nao declara `visibilidade` — filtrarVisiveis nao filtra
  // nada aqui, e e' o comportamento certo: no desktop este bloco fica FORA
  // do gate de admin, visivel a todo mundo.
  const historico = filtrarVisiveis(MENU_HISTORICO, contexto);

  // A casca (veu, painel, alca, Esc, area segura) e o movimento vem da
  // `FolhaMobile`. Ate 29/09/2026 estavam copiados aqui, e era por isso que o
  // menu ficaria de fora da subida de 180ms — justamente a folha que mais se
  // abre. O que e' desta folha e' o grid de modulos abaixo.
  return (
    <FolhaMobile
      aberto={aberto}
      onFechar={onFechar}
      titulo="Todos os módulos"
      subtitulo="O que você abre direto fica na barra de baixo"
      rotuloFechar="Fechar menu"
    >
      <Grupo titulo="Principal" itens={principal} onFechar={onFechar} />
      <Grupo titulo="Operacional" itens={operacional} onFechar={onFechar} />
      <Grupo titulo="Administração" itens={admin} onFechar={onFechar} />
      <Grupo titulo="Histórico" itens={historico} onFechar={onFechar} />
    </FolhaMobile>
  );
}

export default MobileMaisSheet;
