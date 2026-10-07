import { useState } from 'react';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { AulaAgenda, PresencaEnvelopeAgenda } from '@/hooks/useAgendaDia';
import { adaptarPresencaProfessorCanonica, rotuloPresencaFonte } from '@/lib/presencaCanonica';
import { useProfessorPresenca } from '@/hooks/useProfessorPresenca';

interface Props {
  professorId: number;
  professorNome: string;
  fotoUrl: string | null;
  data: string;
  unidadeId: string;
  aulas: AulaAgenda[];
  primeiraAula: string;
  ultimaAula: string;
  presente: boolean | null;
  presenca: PresencaEnvelopeAgenda;
  onMudou: () => void;
}

/**
 * Card compacto de presenca do professor. A identificacao abre o ajuste fino
 * por aula; Presente e Ausente sao comandos explicitos para o dia inteiro.
 */
export function ProfessorPresencaToggle({
  professorId,
  professorNome,
  fotoUrl,
  data,
  unidadeId,
  aulas,
  primeiraAula,
  ultimaAula,
  presente,
  presenca,
  onMudou,
}: Props) {
  const [modalAberto, setModalAberto] = useState(false);
  // A escrita inteira — trava, reconciliacao do pendente, pedido idempotente e
  // leitura do recibo — mora no hook. Aqui so se desenha.
  const { salvando, salvandoAula, marcarDia, marcarTodasAulas, marcarAula } = useProfessorPresenca({
    professorId,
    professorNome,
    data,
    unidadeId,
    onMudou,
  });

  const totalAulas = aulas.length;
  const decisaoDia = adaptarPresencaProfessorCanonica({
    professorId,
    aulaIds: aulas.flatMap((aula) => aula.aula_ids),
    envelope: presenca,
  });
  const horarioDecisao = decisaoDia.decididoEm
    ? new Date(decisaoDia.decididoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : null;
  const estadoLeitura = decisaoDia.estado === 'dados_desatualizados'
    ? 'Dados de leitura desatualizados'
    : decisaoDia.estado === 'roster_em_revisao'
      ? 'Roster em revisão'
      : decisaoDia.estado === 'indeterminado'
        ? 'Não marcado'
        : null;

  const inicial = professorNome
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <>
      {/* Card compacto com navegacao e comandos independentes. */}
      <div
        className={cn(
          'flex items-center gap-3 rounded-xl border p-3 transition-all',
          presente === true
            ? 'border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/15'
            : presente === false
              ? 'border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/15'
              : 'border-slate-700 bg-slate-800/40 hover:border-slate-600 hover:bg-slate-800/60',
        )}
      >
        <button
          type="button"
          onClick={() => setModalAberto(true)}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          aria-label={`Abrir ajuste por aula de ${professorNome}`}
        >
          {/* Foto */}
          {fotoUrl ? (
            <img
              src={fotoUrl}
              alt=""
              className="h-10 w-10 shrink-0 rounded-full border-2 border-slate-600 object-cover"
            />
          ) : (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-slate-600 bg-slate-700 text-xs font-bold text-slate-300">
              {inicial}
            </span>
          )}

          {/* Nome + grade */}
          <span className="min-w-0 flex-1">
            <span className={cn(
              'block truncate text-sm font-semibold',
              presente === true ? 'text-emerald-200' : presente === false ? 'text-rose-200' : 'text-slate-200',
            )}>
              {professorNome}
            </span>
            <span className="block text-[11px] text-slate-400">
              {primeiraAula} — {ultimaAula} · {totalAulas} {totalAulas === 1 ? 'aula' : 'aulas'}
            </span>
            <span className="mt-0.5 block truncate text-[10px] text-slate-500">
              {estadoLeitura ?? rotuloPresencaFonte(decisaoDia.fonte)}
              {horarioDecisao ? ` · ${horarioDecisao}` : ''}
              {decisaoDia.requestId ? ` · recibo ${decisaoDia.reciboStatus ?? 'recebido'}` : ''}
            </span>
            <span className="block truncate text-[9px] text-slate-600">
              Regra {decisaoDia.regraVersao} · sincronizado {decisaoDia.sincronizadoEm ?? 'sem horário'}
            </span>
          </span>
        </button>

        {/* Ações explícitas do dia — nenhuma leitura ambígua vira toggle. */}
        <div className="flex shrink-0 flex-col gap-1" role="group" aria-label={`Presença de ${professorNome} no dia`}>
          <button
            type="button"
            aria-pressed={presente === true}
            onClick={(e) => { e.stopPropagation(); marcarDia(true); }}
            disabled={salvando}
            className={cn(
              'flex items-center justify-center gap-1 rounded-md border px-2 py-1 text-[10px] font-bold transition-colors',
              presente === true
                ? 'border-emerald-500/50 bg-emerald-500/20 text-emerald-300'
                : 'border-slate-700 bg-slate-800/60 text-slate-400 hover:border-emerald-500/40 hover:text-emerald-300',
              salvando && 'opacity-50',
            )}
          >
            {salvando ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
            Presente
          </button>
          <button
            type="button"
            aria-pressed={presente === false}
            onClick={(e) => { e.stopPropagation(); marcarDia(false); }}
            disabled={salvando}
            className={cn(
              'flex items-center justify-center gap-1 rounded-md border px-2 py-1 text-[10px] font-bold transition-colors',
              presente === false
                ? 'border-rose-500/50 bg-rose-500/20 text-rose-300'
                : 'border-slate-700 bg-slate-800/60 text-slate-400 hover:border-rose-500/40 hover:text-rose-300',
              salvando && 'opacity-50',
            )}
          >
            <XCircle className="h-3 w-3" />
            Ausente
          </button>
        </div>
      </div>

      {/* Modal com ajuste fino por aula */}
      <Dialog open={modalAberto} onOpenChange={setModalAberto}>
        <DialogContent className="z-[110] max-w-none border-slate-700 bg-[#0c1220] p-0 sm:max-w-[480px]">
          <DialogTitle className="sr-only">Presenca de {professorNome}</DialogTitle>
          <div className="flex max-h-[80vh] flex-col">
            {/* Cabecalho do modal */}
            <header className="border-b border-slate-700/50 p-5">
              <div className="flex items-center gap-3">
                {fotoUrl ? (
                  <img
                    src={fotoUrl}
                    alt={professorNome}
                    className="h-12 w-12 rounded-full border-2 border-slate-600 object-cover"
                  />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-slate-600 bg-slate-700 text-sm font-bold text-slate-300">
                    {inicial}
                  </div>
                )}
                <div>
                  <h2 className="text-lg font-semibold text-white">{professorNome}</h2>
                  <p className="text-xs text-slate-400">
                    {primeiraAula} — {ultimaAula} · {totalAulas} {totalAulas === 1 ? 'aula' : 'aulas'}
                  </p>
                </div>
              </div>
            </header>

            {/* Lista de aulas */}
            <div className="flex-1 overflow-y-auto p-5">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Ajuste fino por aula
                </p>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => marcarTodasAulas(true)}
                    disabled={salvando}
                    className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
                  >
                    Todas presentes
                  </button>
                  <button
                    type="button"
                    onClick={() => marcarTodasAulas(false)}
                    disabled={salvando}
                    className="rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-[10px] font-semibold text-rose-300 hover:bg-rose-500/20 disabled:opacity-50"
                  >
                    Todas ausentes
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                {aulas.map((aula) => {
                  const aulaId = aula.aula_ids[0];
                  const decisaoAula = adaptarPresencaProfessorCanonica({
                    professorId,
                    aulaIds: aula.aula_ids,
                    envelope: presenca,
                  });
                  const presenteAula = decisaoAula.estado === 'presente';
                  const ausenteAula = decisaoAula.estado === 'ausente';
                  const horarioAula = decisaoAula.decididoEm
                    ? new Date(decisaoAula.decididoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                    : null;
                  const rotuloEstadoAula = decisaoAula.estado === 'dados_desatualizados'
                    ? 'Dados de leitura desatualizados'
                    : decisaoAula.estado === 'roster_em_revisao'
                      ? 'Roster em revisão'
                      : decisaoAula.estado === 'indeterminado'
                        ? 'Não marcado'
                        : rotuloPresencaFonte(decisaoAula.fonte);
                  return (
                    <div
                      key={aula.chave}
                      className="flex items-center justify-between rounded-lg border border-slate-700/40 bg-slate-800/30 px-3 py-2.5"
                    >
                      <div>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-mono text-slate-400">{aula.hora_inicio}</span>
                          <span className="font-medium text-slate-200">{aula.curso_nome}</span>
                          <span className="text-slate-500">{aula.sala_nome}</span>
                        </div>
                        <p className="mt-0.5 text-[10px] text-slate-500">
                          {rotuloEstadoAula}
                          {horarioAula ? ` · ${horarioAula}` : ''}
                          {decisaoAula.requestId ? ` · recibo ${decisaoAula.reciboStatus ?? 'recebido'}` : ''}
                        </p>
                      </div>
                      <div
                        className="flex items-center gap-1.5"
                        role="group"
                        aria-label={`Presença na aula das ${aula.hora_inicio}`}
                      >
                        <button
                          type="button"
                          aria-pressed={presenteAula}
                          onClick={() => marcarAula(aula, true)}
                          disabled={salvandoAula === aulaId}
                          className={cn(
                            'flex items-center gap-1 rounded-md border px-2 py-1.5 text-[11px] font-semibold transition-colors',
                            presenteAula
                              ? 'border-emerald-500/50 bg-emerald-500/20 text-emerald-300'
                              : 'border-slate-700 bg-slate-800/60 text-slate-400 hover:border-emerald-500/40 hover:text-emerald-300',
                            salvandoAula === aulaId && 'opacity-50',
                          )}
                        >
                          {salvandoAula === aulaId
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <CheckCircle2 className="h-3.5 w-3.5" />}
                          Presente
                        </button>
                        <button
                          type="button"
                          aria-pressed={ausenteAula}
                          onClick={() => marcarAula(aula, false)}
                          disabled={salvandoAula === aulaId}
                          className={cn(
                            'flex items-center gap-1 rounded-md border px-2 py-1.5 text-[11px] font-semibold transition-colors',
                            ausenteAula
                              ? 'border-rose-500/50 bg-rose-500/20 text-rose-300'
                              : 'border-slate-700 bg-slate-800/60 text-slate-400 hover:border-rose-500/40 hover:text-rose-300',
                            salvandoAula === aulaId && 'opacity-50',
                          )}
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          Ausente
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
