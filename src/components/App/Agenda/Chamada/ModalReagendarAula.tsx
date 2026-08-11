import { RotateCcw } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { AulaAgenda } from '@/hooks/useAgendaDia';

interface Props {
  aberto: boolean;
  onFechar: () => void;
  aula: AulaAgenda | null;
}

/**
 * Reagendamento = reposicao (spec D4). Fase 1: o reagendamento continua sendo
 * FEITO NO EMUSYS (a operacao ja trabalha assim) — este modal orienta e explica
 * o que acontece depois: o sync detecta a aula reagendada e o motor consome os
 * creditos de reposicao abertos automaticamente (elo direto).
 * Fase 2 (futura): este modal chama PATCH /aulas/reagendar do Emusys daqui.
 */
export function ModalReagendarAula({ aberto, onFechar, aula }: Props) {
  const comCredito = aula?.alunos.filter((a) => (a.reposicoes_pendentes ?? 0) > 0) ?? [];

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="z-[120] border-sky-500/30 bg-[#0c1220] sm:max-w-md" overlayClassName="z-[120]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <RotateCcw className="h-4 w-4 text-sky-400" />
            Reagendar aula — {aula?.hora_inicio} · {aula?.curso_nome}
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            {aula?.professor_nome} · {aula?.sala_nome} · {aula?.unidade_nome}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm text-slate-300">
          <p>
            O reagendamento é feito no <b>Emusys</b> (menu da aula → <i>Mover Agendamento</i>), como a
            operação já faz hoje. A aula <b>move de data mantendo o lugar no pacote</b> — não desconta
            nem duplica.
          </p>
          <div className="rounded-xl border border-sky-500/25 bg-sky-500/5 px-3 py-2.5 text-xs text-slate-400">
            Quando a aula reagendada chegar pelo sync (até 15 min), o motor de reposições
            <b className="text-sky-300"> consome automaticamente os créditos abertos</b> dos alunos
            desta aula — o elo é direto, pela própria aula.
          </div>
          {comCredito.length > 0 && (
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Alunos com reposição pendente nesta aula
              </p>
              <ul className="space-y-1">
                {comCredito.map((a) => (
                  <li key={a.aluno_id} className="flex items-center gap-2 text-xs text-slate-300">
                    <RotateCcw className="h-3 w-3 text-amber-400" />
                    {a.nome}
                    <span className="text-slate-500">({a.reposicoes_pendentes} pendente(s))</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" onClick={onFechar} className="bg-sky-600 font-bold text-white hover:bg-sky-500">
            Entendi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
