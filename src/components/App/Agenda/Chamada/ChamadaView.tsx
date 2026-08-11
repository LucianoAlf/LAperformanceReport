import { useCallback, useState } from 'react';
import { CalendarDays, List, LayoutGrid } from 'lucide-react';
import type { AulaAgenda, AlunoAgenda } from '@/hooks/useAgendaDia';
import { useChamadaAcoes, type ItemChamada } from './useChamadaAcoes';
import { ChamadaDia } from './ChamadaDia';
import { ChamadaSemana } from './ChamadaSemana';
import { ChamadaLista } from './ChamadaLista';
import { ChamadaDrawer } from './ChamadaDrawer';
import { ModalJustificarFalta } from './ModalJustificarFalta';
import { ModalCancelarAula } from './ModalCancelarAula';
import { ModalReagendarAula } from './ModalReagendarAula';
import { cn } from '@/lib/utils';

type SubVisao = 'dia' | 'semana' | 'lista';

interface Props {
  data: string;
  unidadeId: string | null;
  aulas: AulaAgenda[];
  recarregar: () => void;
  onIrParaDia: (data: string) => void;
  onSubVisaoChange?: (subVisao: SubVisao) => void;
}

/**
 * Orquestra a visao Chamada dentro da AgendaPage. Recebe as aulas do dia
 * atual (ja filtradas pela AgendaPage) e o callback de recarga. As tres
 * sub-visoes (dia/semana/lista) compartilham os mesmos modais e o drawer.
 *
 * `onSubVisaoChange` notifica a AgendaPage quando a sub-visao muda, para
 * que as setas de navegacao e o rotulo do topo se adaptem (semana vs dia).
 */
export function ChamadaView({ data, unidadeId, aulas, recarregar, onIrParaDia, onSubVisaoChange }: Props) {
  const [subVisao, setSubVisao] = useState<SubVisao>('dia');

  const trocarSubVisao = useCallback(
    (nova: SubVisao) => {
      setSubVisao(nova);
      onSubVisaoChange?.(nova);
    },
    [onSubVisaoChange],
  );

  // Estado dos modais — cada um guarda o contexto necessario para confirmar.
  const [alunoJustificar, setAlunoJustificar] = useState<{ aluno: AlunoAgenda; aula: AulaAgenda } | null>(null);
  const [aulaCancelar, setAulaCancelar] = useState<AulaAgenda | null>(null);
  const [aulaReagendar, setAulaReagendar] = useState<AulaAgenda | null>(null);

  // Drawer: na visao semana, a aula pode ser de outro dia, por isso guardamos
  // a data junto. Na dia/lista, e sempre a data atual.
  const [drawerAula, setDrawerAula] = useState<AulaAgenda | null>(null);
  const [drawerData, setDrawerData] = useState<string>(data);

  const { salvando, registrar, cancelarAula } = useChamadaAcoes(recarregar);

  const abrirDrawer = useCallback((aula: AulaAgenda, dia?: string) => {
    setDrawerAula(aula);
    setDrawerData(dia ?? data);
  }, [data]);

  const handleJustificar = useCallback(
    (motivo: string, evidenciaPath?: string) => {
      if (!alunoJustificar?.aluno.aula_emusys_id || !alunoJustificar?.aluno.aluno_id) return;
      const item: ItemChamada = {
        aula_emusys_id: alunoJustificar.aluno.aula_emusys_id,
        aluno_id: alunoJustificar.aluno.aluno_id,
        status: 'falta_justificada',
        motivo,
        evidencia_path: evidenciaPath,
      };
      registrar([item]);
      setAlunoJustificar(null);
    },
    [alunoJustificar, registrar],
  );

  const handleCancelar = useCallback(
    (motivo: string, evidenciaPath: string | undefined, escopo: 'aula' | 'unidade_dia') => {
      if (!aulaCancelar) return;
      const aulaId = aulaCancelar.aula_ids[0];
      if (!aulaId) return;
      cancelarAula({
        aulaEmusysId: aulaId,
        motivo,
        evidenciaPath,
        escopo,
      });
      setAulaCancelar(null);
    },
    [aulaCancelar, cancelarAula],
  );

  const subVisoes: Array<{ valor: SubVisao; rotulo: string; icon: React.ReactNode }> = [
    { valor: 'dia', rotulo: 'Dia', icon: <CalendarDays className="h-3.5 w-3.5" /> },
    { valor: 'semana', rotulo: 'Semana', icon: <LayoutGrid className="h-3.5 w-3.5" /> },
    { valor: 'lista', rotulo: 'Lista', icon: <List className="h-3.5 w-3.5" /> },
  ];

  return (
    <div className="space-y-3">
      {/* Sub-abas Dia/Semana/Lista */}
      <div className="inline-flex gap-0.5 rounded-md border border-slate-700 bg-slate-900 p-0.5">
        {subVisoes.map((v) => (
          <button
            key={v.valor}
            type="button"
            onClick={() => trocarSubVisao(v.valor)}
            aria-pressed={subVisao === v.valor}
            className={cn(
              'flex items-center gap-1.5 rounded px-3 py-1 text-[12.5px] transition-colors',
              subVisao === v.valor ? 'bg-slate-800 font-semibold text-white' : 'text-slate-400 hover:text-slate-200',
            )}
          >
            {v.icon}
            {v.rotulo}
          </button>
        ))}
      </div>

      {subVisao === 'dia' && (
        <ChamadaDia
          data={data}
          aulas={aulas}
          salvando={salvando}
          onRegistrar={registrar}
          onJustificar={(aluno, aula) => setAlunoJustificar({ aluno, aula })}
          onCancelarAula={setAulaCancelar}
          onReagendarAula={setAulaReagendar}
          onAbrirDrawer={(a) => abrirDrawer(a)}
        />
      )}

      {subVisao === 'semana' && (
        <ChamadaSemana
          data={data}
          unidadeId={unidadeId}
          salvando={salvando}
          onRegistrar={registrar}
          onJustificar={(aluno, aula) => setAlunoJustificar({ aluno, aula })}
          onCancelarAula={setAulaCancelar}
          onReagendarAula={setAulaReagendar}
          onAbrirDia={onIrParaDia}
          onAbrirDrawer={(a, dia) => abrirDrawer(a, dia)}
        />
      )}

      {subVisao === 'lista' && (
        <ChamadaLista
          data={data}
          aulas={aulas}
          onAbrirDrawer={(a) => abrirDrawer(a)}
        />
      )}

      {/* Modais */}
      <ModalJustificarFalta
        aberto={alunoJustificar != null}
        onFechar={() => setAlunoJustificar(null)}
        aula={alunoJustificar?.aula ?? null}
        aluno={alunoJustificar?.aluno ?? null}
        salvando={salvando}
        onConfirmar={handleJustificar}
      />

      <ModalCancelarAula
        aberto={aulaCancelar != null}
        onFechar={() => setAulaCancelar(null)}
        aula={aulaCancelar}
        salvando={salvando}
        onConfirmar={handleCancelar}
      />

      <ModalReagendarAula
        aberto={aulaReagendar != null}
        onFechar={() => setAulaReagendar(null)}
        aula={aulaReagendar}
      />

      {/* Drawer lateral */}
      <ChamadaDrawer
        aula={drawerAula}
        data={drawerData}
        salvando={salvando}
        onRegistrar={registrar}
        onJustificar={(aluno, aula) => setAlunoJustificar({ aluno, aula })}
        onCancelarAula={setAulaCancelar}
        onReagendarAula={setAulaReagendar}
        onFechar={() => setDrawerAula(null)}
      />
    </div>
  );
}
