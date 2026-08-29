import { useMemo } from 'react';
import { Clock, Users, AlertTriangle, Guitar, CalendarClock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { AlertBanner } from '@/components/ui/AlertBanner';
import type { BandaResumo, EventoBanda } from '@/hooks/useBandas';
import { agruparEnsaiosPorDiaDaSemana, bandasSemHorarioDeEnsaio } from './ensaiosBandas.mjs';

interface GradeEnsaiosBandasProps {
  bandas: BandaResumo[];
  /** Ensaios PONTUAIS (banda_evento tipo='ensaio'), que não estão na grade fixa. */
  ensaiosPontuais: EventoBanda[];
  unidadeAtual: string;
  onAbrirBanda: (bandaId: number) => void;
  onAbrirEvento: (evento: EventoBanda) => void;
}

type DiaDaGrade = {
  indice: number;
  nome: string;
  bandas: (BandaResumo & { horario_curto: string })[];
};

/**
 * Grade SEMANAL de ensaios. O ensaio da banda é recorrente e já está cadastrado
 * (`banda.dia_semana` + `banda.horario`, vindos da grade do Emusys) — por isso a visão
 * padrão é a semana, e não uma lista cronológica: o que a equipe pergunta é
 * "quem ensaia na terça às 18h", não "qual é o próximo ensaio".
 */
export function GradeEnsaiosBandas({
  bandas, ensaiosPontuais, unidadeAtual, onAbrirBanda, onAbrirEvento,
}: GradeEnsaiosBandasProps) {
  const grade = useMemo(() => agruparEnsaiosPorDiaDaSemana(bandas) as DiaDaGrade[], [bandas]);
  const semHorario = useMemo(() => bandasSemHorarioDeEnsaio(bandas) as BandaResumo[], [bandas]);

  const hoje = new Date().getDay();
  const escopo = unidadeAtual === 'todos' ? 'da rede' : 'da unidade';

  if (grade.length === 0 && ensaiosPontuais.length === 0) {
    return (
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-10 text-center">
        <CalendarClock className="w-10 h-10 text-slate-600 mx-auto mb-3" />
        <p className="text-slate-300 font-medium">Nenhum ensaio na grade</p>
        <p className="text-slate-500 text-sm mt-1">
          As bandas {escopo} ainda não têm dia e horário definidos.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {semHorario.length > 0 && (
        <AlertBanner
          type="warning"
          title={`${semHorario.length} ${semHorario.length === 1 ? 'banda fica' : 'bandas ficam'} fora da grade`}
          message={`Sem dia ou horário definido: ${semHorario.map((b) => b.nome).join(', ')}. Defina na ficha da banda para o ensaio aparecer aqui e no calendário.`}
          dismissible
        />
      )}

      <div className="space-y-3">
        {grade.map((dia) => (
          <section
            key={dia.indice}
            className={cn(
              'bg-slate-800/50 border rounded-2xl overflow-hidden',
              dia.indice === hoje ? 'border-violet-500/40' : 'border-slate-700/50',
            )}
          >
            <header className="flex items-center justify-between px-4 py-2 bg-slate-800/60">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                {dia.nome}
                {dia.indice === hoje && (
                  <Badge variant="default" className="text-[10px] px-1.5 py-0">hoje</Badge>
                )}
              </h3>
              <span className="text-xs text-slate-500">
                {dia.bandas.length} {dia.bandas.length === 1 ? 'ensaio' : 'ensaios'}
              </span>
            </header>

            <div className="divide-y divide-slate-700/50">
              {dia.bandas.map((banda) => (
                <button
                  key={banda.banda_id}
                  type="button"
                  onClick={() => onAbrirBanda(banda.banda_id)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-700/20 transition-colors"
                >
                  <span className="flex items-center gap-1 text-sm font-medium text-cyan-300 tabular-nums shrink-0">
                    <Clock className="w-3.5 h-3.5" />
                    {banda.horario_curto}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-white truncate">{banda.nome}</span>
                    <span className="block text-xs text-slate-400 truncate">
                      {banda.produtor_nome || 'Sem produtor'}
                      {unidadeAtual === 'todos' && banda.unidade_nome ? ` · ${banda.unidade_nome}` : ''}
                    </span>
                  </span>
                  <span className="flex items-center gap-1 text-xs text-slate-400 shrink-0">
                    <Users className="w-3.5 h-3.5" />
                    {banda.integrantes}
                  </span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>

      {ensaiosPontuais.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-2">
            <Guitar className="w-4 h-4 text-violet-400" />
            Ensaios extras
            <Badge variant="secondary">{ensaiosPontuais.length}</Badge>
          </h3>
          <p className="text-xs text-slate-500 mb-2">
            Marcados fora do horário fixo — estes sim podem ser editados ou cancelados.
          </p>
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl divide-y divide-slate-700/50">
            {ensaiosPontuais.map((evento) => (
              <button
                key={evento.evento_id}
                type="button"
                onClick={() => onAbrirEvento(evento)}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-700/20 transition-colors"
              >
                <span className="text-sm font-medium text-cyan-300 tabular-nums shrink-0">
                  {new Date(evento.data_inicio).toLocaleDateString('pt-BR', {
                    day: '2-digit', month: '2-digit',
                  })}
                  {' · '}
                  {new Date(evento.data_inicio).toLocaleTimeString('pt-BR', {
                    hour: '2-digit', minute: '2-digit',
                  })}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-white truncate">{evento.titulo}</span>
                  {evento.bandas && (
                    <span className="block text-xs text-slate-400 truncate">{evento.bandas}</span>
                  )}
                </span>
                {evento.status === 'cancelado' && (
                  <Badge variant="error" className="shrink-0">Cancelado</Badge>
                )}
              </button>
            ))}
          </div>
        </section>
      )}

      {grade.length > 0 && (
        <p className="text-xs text-slate-500 flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          O ensaio fixo vem da grade do Emusys — para mudar dia ou horário, altere na ficha da banda.
        </p>
      )}
    </div>
  );
}
