import { useState } from 'react';
import { toast } from 'sonner';
import { Link2, CheckCircle, Check, X, Users, Clock, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertBanner } from '@/components/ui/AlertBanner';
import { ModalConfirmacao } from '@/components/ui/ModalConfirmacao';
import {
  confirmarBanda, descartarBanda,
  type ConciliacaoItem, type TurmaAConfirmar,
} from '@/hooks/useBandas';

// A RPC foi re-ancorada no roster vivo do Emusys (28/08/2026) e só devolve um problema.
const PROBLEMA_LABEL: Record<ConciliacaoItem['problema'], string> = {
  'fora do Emusys (adicionado manualmente ou saiu do Emusys)': 'Fora do Emusys',
};

const PROBLEMA_VARIANT: Record<ConciliacaoItem['problema'], 'error' | 'warning'> = {
  'fora do Emusys (adicionado manualmente ou saiu do Emusys)': 'warning',
};

interface ConciliacaoTabProps {
  unidadeAtual: string;
  /** Seção A — turmas do Emusys ainda não batizadas (acionável). */
  turmas: TurmaAConfirmar[];
  /** Seção B — integrantes fora do roster do Emusys (informativo). */
  itens: ConciliacaoItem[];
  onTurmaResolvida: () => void;
}

function horarioLegivel(dia: string | null, horario: string | null) {
  const hora = horario ? horario.slice(0, 5) : null;
  if (dia && hora) return `${dia} · ${hora}`;
  return dia || hora || 'Horário não definido';
}

/**
 * Aba Conciliação — duas seções com propósitos diferentes:
 *
 * A) FILA DE BATISMO (principal, acionável): turmas de banda que o Emusys criou e que
 *    ainda não foram confirmadas. Até alguém batizar, elas NÃO aparecem na aba Bandas —
 *    por isso a fila fica aqui, e não escondida no banco como esteve até 28/08/2026.
 * B) INTEGRANTES FORA DO EMUSYS (informativo): quem está numa banda sem constar no roster
 *    da turma. Sem ação: quem entrou à mão é legítimo (ver selo "fora do Emusys" na ficha),
 *    e quem saiu do Emusys se resolve no Emusys.
 */
export function ConciliacaoTab({ unidadeAtual, turmas, itens, onTurmaResolvida }: ConciliacaoTabProps) {
  const [batizando, setBatizando] = useState<number | null>(null);
  const [nomeNovo, setNomeNovo] = useState('');
  const [turmaDescartando, setTurmaDescartando] = useState<TurmaAConfirmar | null>(null);
  const [processando, setProcessando] = useState(false);

  const escopo = unidadeAtual === 'todos' ? 'na rede' : 'nesta unidade';

  function abrirBatismo(turma: TurmaAConfirmar) {
    setBatizando(turma.banda_id);
    // O nome da turma é só o ponto de partida — quem batiza troca pelo nome da banda.
    setNomeNovo(turma.turma_nome || '');
  }

  function fecharBatismo() {
    setBatizando(null);
    setNomeNovo('');
  }

  async function salvarBatismo(turma: TurmaAConfirmar) {
    const nome = nomeNovo.trim();
    if (!nome) {
      toast.error('Dê um nome à banda antes de confirmar.');
      return;
    }
    setProcessando(true);
    const { error } = await confirmarBanda(turma.banda_id, nome);
    setProcessando(false);
    if (error) {
      toast.error('Erro ao confirmar banda', { description: error.message });
      return;
    }
    toast.success('Banda confirmada', { description: `${nome} já aparece na aba Bandas.` });
    fecharBatismo();
    onTurmaResolvida();
  }

  async function confirmarDescarte() {
    if (!turmaDescartando) return;
    setProcessando(true);
    const { error } = await descartarBanda(turmaDescartando.banda_id);
    setProcessando(false);
    if (error) {
      toast.error('Erro ao descartar turma', { description: error.message });
      return;
    }
    toast.success('Turma descartada', { description: turmaDescartando.turma_nome });
    setTurmaDescartando(null);
    onTurmaResolvida();
  }

  return (
    <div className="space-y-6">
      {/* ================= A) Fila de confirmar / batizar ================= */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-violet-400" />
            Turmas a confirmar
            {turmas.length > 0 && (
              <Badge variant="warning" className="ml-1">{turmas.length}</Badge>
            )}
          </h3>
          <span className="text-xs text-slate-500">Só entram na aba Bandas depois de batizadas</span>
        </div>

        {turmas.length === 0 ? (
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-10 text-center">
            <CheckCircle className="w-10 h-10 text-emerald-500/60 mx-auto mb-3" />
            <p className="text-slate-300 font-medium">Nenhuma turma pendente de confirmação</p>
            <p className="text-slate-500 text-sm mt-1">
              Toda turma de banda do Emusys {escopo} já foi batizada ou descartada.
            </p>
          </div>
        ) : (
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl divide-y divide-slate-700/50">
            {turmas.map((turma) => {
              const emBatismo = batizando === turma.banda_id;
              return (
                <div key={turma.banda_id} className="px-4 py-3">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-white">{turma.turma_nome}</p>
                        {unidadeAtual === 'todos' && turma.unidade_nome && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">
                            {turma.unidade_nome}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 flex items-center gap-3 mt-0.5 flex-wrap">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {horarioLegivel(turma.dia_semana, turma.horario)}
                        </span>
                        {turma.produtor_nome && <span>{turma.produtor_nome}</span>}
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {turma.integrantes} {turma.integrantes === 1 ? 'integrante' : 'integrantes'}
                        </span>
                      </p>
                      {turma.roster && (
                        <p className="text-xs text-slate-500 mt-1 truncate" title={turma.roster}>
                          {turma.roster}
                        </p>
                      )}
                    </div>

                    {!emBatismo && (
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() => abrirBatismo(turma)}
                        >
                          <Check className="w-3.5 h-3.5 mr-1" />
                          Confirmar
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs text-rose-400 hover:text-rose-300"
                          onClick={() => setTurmaDescartando(turma)}
                        >
                          <X className="w-3.5 h-3.5 mr-1" />
                          Não é banda
                        </Button>
                      </div>
                    )}
                  </div>

                  {emBatismo && (
                    <div className="mt-3 flex flex-col sm:flex-row gap-2 sm:items-center bg-slate-900/40 border border-slate-700/40 rounded-xl p-3">
                      <div className="flex-1 space-y-1">
                        <span className="text-xs text-slate-400">Nome da banda</span>
                        <Input
                          autoFocus
                          value={nomeNovo}
                          onChange={(e) => setNomeNovo(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') salvarBatismo(turma);
                            if (e.key === 'Escape') fecharBatismo();
                          }}
                          placeholder="Ex.: Captain Kid"
                        />
                      </div>
                      <div className="flex items-center gap-2 sm:pt-5">
                        <Button
                          size="sm"
                          className="h-9 text-xs"
                          onClick={() => salvarBatismo(turma)}
                          disabled={processando}
                        >
                          <Check className="w-3.5 h-3.5 mr-1" />
                          Confirmar
                        </Button>
                        <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={fecharBatismo}>
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ============= B) Integrantes fora do Emusys (só leitura) ============= */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Link2 className="w-4 h-4 text-cyan-400" />
            Integrantes fora do Emusys
            {itens.length > 0 && (
              <Badge variant="secondary" className="ml-1">{itens.length}</Badge>
            )}
          </h3>
          <span className="text-xs text-slate-500">Só visibilidade — sem ação aqui</span>
        </div>

        {itens.length > 0 && (
          <AlertBanner
            type="info"
            title="Nem todo mundo aqui é problema"
            message="Quem foi adicionado à mão toca na banda sem estar matriculado naquela turma — é legítimo e aparece com o selo “fora do Emusys” na ficha da banda. Já quem saiu do Emusys se resolve lá, não por aqui."
            dismissible
          />
        )}

        {itens.length === 0 ? (
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-10 text-center">
            <CheckCircle className="w-10 h-10 text-emerald-500/60 mx-auto mb-3" />
            <p className="text-slate-300 font-medium">Nenhum integrante fora do Emusys</p>
            <p className="text-slate-500 text-sm mt-1">
              Todo integrante {escopo} consta no roster da própria turma.
            </p>
          </div>
        ) : (
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl divide-y divide-slate-700/50 mt-3">
            {itens.map((item) => (
              <div key={`${item.banda_id}-${item.aluno_id}`} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white truncate">
                    {item.aluno_nome || `Aluno #${item.aluno_id}`}
                  </p>
                  <p className="text-xs text-slate-400 flex items-center gap-1">
                    <Link2 className="w-3 h-3" />
                    {item.banda_nome}
                  </p>
                </div>
                <Badge variant={PROBLEMA_VARIANT[item.problema]} className="shrink-0">
                  {PROBLEMA_LABEL[item.problema]}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </section>

      <ModalConfirmacao
        aberto={!!turmaDescartando}
        onClose={() => setTurmaDescartando(null)}
        onConfirmar={confirmarDescarte}
        titulo="Marcar como “não é banda”"
        mensagem={`Descartar a turma "${turmaDescartando?.turma_nome}"? Ela some desta fila e não vira banda. Use quando for uma turma comum que o Emusys classificou como curso de banda.`}
        tipo="warning"
        textoConfirmar="Não é banda"
        carregando={processando}
      />
    </div>
  );
}
