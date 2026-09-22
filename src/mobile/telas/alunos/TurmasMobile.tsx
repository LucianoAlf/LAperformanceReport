import { useMemo, useState, type ReactNode } from 'react';
import { DoorOpen, Loader2, Plus, Search, Trash2, UserMinus, UserPlus, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { normalizarBusca } from '@/lib/agenda';
import {
  DIAS_SEMANA_TURMAS,
  agruparTurmasPorDia,
  filtrarTurmas,
  formatarHorarioTurma,
  nivelOcupacaoTurma,
  textoOcupacaoTurma,
} from '@/lib/turmas';
import { vincularSalaNaTurma } from '@/lib/turmaSala';
import { FolhaMobile } from '@/mobile/FolhaMobile';
import type { Turma } from '@/components/App/Alunos/AlunosPage';

import { LinhaTurma } from './LinhaTurma';

/**
 * A aba Turmas em tela de telefone.
 *
 * A tela do computador é uma parede de cartões agrupados por dia — 301 alvos
 * tocáveis a 390px, dos quais 283 abaixo de 44px e o menor com 20px. O cartão
 * não é o problema em si: é ele multiplicado por 150 turmas num aparelho onde
 * cada moldura come ~70px de largura útil.
 *
 * Aqui a grade vira uma lista por dia, lida em ordem de horário, e tudo que
 * era botãozinho no canto do cartão passa para a folha de baixo.
 *
 * ⚠️ Recorte, agrupamento e a régua de ocupação moram em `@/lib/turmas`; a
 * escrita da sala, em `@/lib/turmaSala`. Nada disso nasce aqui.
 */

const OCUPACOES = [
  { id: '', label: 'Todas' },
  { id: '1', label: 'Sozinhas' },
  { id: '2', label: 'Duplas' },
  { id: '3+', label: '3 ou mais' },
  { id: '0', label: 'Vazias' },
] as const;

interface Props {
  turmas: Turma[];
  salas: Array<{ id: number; nome: string; capacidade_maxima: number }>;
  onRecarregar: () => void;
  onNovaTurma?: () => void;
  onEditarTurma?: (turma: Turma) => void;
  onExcluirTurma?: (turmaId: number) => void;
  onAdicionarAlunoTurma?: (turma: Turma) => void;
  onRemoverAlunoTurma?: (turma: Turma, alunoId: number, alunoNome: string) => void;
}

export function TurmasMobile({
  turmas,
  salas,
  onRecarregar,
  onNovaTurma,
  onEditarTurma,
  onExcluirTurma,
  onAdicionarAlunoTurma,
  onRemoverAlunoTurma,
}: Props) {
  const [dia, setDia] = useState('');
  const [ocupacao, setOcupacao] = useState<string>('');
  const [busca, setBusca] = useState('');
  const [naFolha, setNaFolha] = useState<Turma | null>(null);

  const porDia = useMemo(() => {
    const termo = normalizarBusca(busca);
    const recortadas = filtrarTurmas(turmas, { dia, ocupacao }).filter((t) => {
      if (!termo) return true;
      // Professor, curso, sala e os alunos na mesma caixa: quem procura "ana"
      // tanto pode querer a professora quanto a aluna, e dois campos de busca
      // não cabem numa faixa de 390px.
      const alvo = normalizarBusca(
        [t.professor_nome, t.curso_nome, t.sala_nome, ...(t.nomes_alunos || [])].filter(Boolean).join(' '),
      );
      return alvo.includes(termo);
    });
    return agruparTurmasPorDia(recortadas);
  }, [turmas, dia, ocupacao, busca]);

  const diasComConteudo = DIAS_SEMANA_TURMAS.filter((d) => (porDia[d.valor] ?? []).length > 0);
  const total = Object.values(porDia).reduce((soma, lista) => soma + lista.length, 0);
  const sozinhas = Object.values(porDia)
    .flat()
    .filter((t) => nivelOcupacaoTurma(t.total_alunos, t.capacidade_maxima) === 'sozinho').length;

  const turmaDaFolha = naFolha
    ? turmas.find(
        (t) =>
          t.professor_id === naFolha.professor_id &&
          t.dia_semana === naFolha.dia_semana &&
          t.horario_inicio === naFolha.horario_inicio,
      ) ?? naFolha
    : null;

  return (
    <div className="space-y-3 p-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
            aria-hidden="true"
          />
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Professor, curso, sala ou aluno"
            aria-label="Buscar turma"
            className="min-h-[44px] w-full rounded-lg border border-slate-700 bg-slate-900/70 pl-9 pr-9 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none"
          />
          {busca && (
            <button
              type="button"
              onClick={() => setBusca('')}
              aria-label="Limpar busca"
              className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 active:bg-slate-800"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {onNovaTurma && (
          <button
            type="button"
            onClick={onNovaTurma}
            aria-label="Nova turma"
            className="flex min-h-[44px] w-11 flex-none items-center justify-center rounded-lg bg-cyan-600 text-white active:bg-cyan-700"
          >
            <Plus className="h-5 w-5" />
          </button>
        )}
      </div>

      <Trilho rotulo="Dia da semana">
        <Chip ativo={dia === ''} onClick={() => setDia('')}>
          Semana toda
        </Chip>
        {DIAS_SEMANA_TURMAS.map((d) => (
          <Chip key={d.valor} ativo={dia === d.valor} onClick={() => setDia(d.valor)}>
            {d.curto}
          </Chip>
        ))}
      </Trilho>

      <Trilho rotulo="Ocupação">
        {OCUPACOES.map((o) => (
          <Chip key={o.id || 'todas'} ativo={ocupacao === o.id} onClick={() => setOcupacao(o.id)}>
            {o.label}
          </Chip>
        ))}
      </Trilho>

      <p className="px-1 text-[11px] text-slate-500">
        {total === 0 ? 'Nenhuma turma neste recorte' : `${total} ${total === 1 ? 'turma' : 'turmas'}`}
        {sozinhas > 0 && (
          <span className="text-red-400"> · {sozinhas} com um aluno só</span>
        )}
      </p>

      {diasComConteudo.map((d) => (
        <section key={d.valor}>
          {/* O cabeçalho do dia gruda no topo: numa lista da semana inteira,
              rolar sem ele faz perder de vista em que dia se está. */}
          <h3 className="sticky top-0 z-10 -mx-3 bg-slate-950/95 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400 backdrop-blur before:absolute before:inset-x-0 before:bottom-full before:h-3 before:bg-slate-950/95">
            {d.nome}
            <span className="ml-1.5 font-normal normal-case text-slate-600">
              {porDia[d.valor].length} {porDia[d.valor].length === 1 ? 'turma' : 'turmas'}
            </span>
          </h3>
          {porDia[d.valor].map((t) => (
            <LinhaTurma key={`${t.professor_id}-${t.dia_semana}-${t.horario_inicio}`} turma={t} onAbrir={setNaFolha} />
          ))}
        </section>
      ))}

      {turmaDaFolha && (
        <FolhaTurma
          turma={turmaDaFolha}
          salas={salas}
          onFechar={() => setNaFolha(null)}
          onRecarregar={onRecarregar}
          onEditarTurma={onEditarTurma}
          onExcluirTurma={onExcluirTurma}
          onAdicionarAlunoTurma={onAdicionarAlunoTurma}
          onRemoverAlunoTurma={onRemoverAlunoTurma}
        />
      )}
    </div>
  );
}

function Trilho({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div
      role="group"
      aria-label={rotulo}
      className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-0.5 scrollbar-hide [mask-image:linear-gradient(to_right,black_calc(100%-20px),transparent)]"
    >
      {children}
    </div>
  );
}

function Chip({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={cn(
        'min-h-[36px] flex-none whitespace-nowrap rounded-full border px-3 text-[12.5px] font-medium',
        ativo
          ? 'border-cyan-500/40 bg-cyan-500/15 text-cyan-200'
          : 'border-slate-700 bg-slate-800/50 text-slate-400',
      )}
    >
      {children}
    </button>
  );
}

/** Quem está na turma e o que dá para fazer com ela. */
function FolhaTurma({
  turma,
  salas,
  onFechar,
  onRecarregar,
  onEditarTurma,
  onExcluirTurma,
  onAdicionarAlunoTurma,
  onRemoverAlunoTurma,
}: {
  turma: Turma;
  salas: Props['salas'];
  onFechar: () => void;
  onRecarregar: () => void;
  onEditarTurma?: Props['onEditarTurma'];
  onExcluirTurma?: Props['onExcluirTurma'];
  onAdicionarAlunoTurma?: Props['onAdicionarAlunoTurma'];
  onRemoverAlunoTurma?: Props['onRemoverAlunoTurma'];
}) {
  const [trocandoSala, setTrocandoSala] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const nivel = nivelOcupacaoTurma(turma.total_alunos, turma.capacidade_maxima);
  const resumo = [
    `${turma.dia_semana} ${formatarHorarioTurma(turma.horario_inicio)}`,
    turma.sala_nome || 'sem sala',
    textoOcupacaoTurma(turma.total_alunos, turma.capacidade_maxima),
  ].join(' · ');

  async function escolherSala(salaId: number) {
    setSalvando(true);
    setErro(null);
    const resultado = await vincularSalaNaTurma(turma, salaId, salas);
    setSalvando(false);
    if (!resultado.ok) {
      // ⚠️ A mensagem carrega a turma e o motivo do banco. O desktop mostra
      // "Erro ao vincular sala. Tente novamente." e joga a causa no console.
      setErro(resultado.erro ?? 'Não consegui vincular a sala.');
      return;
    }
    setTrocandoSala(false);
    onRecarregar();
    onFechar();
  }

  return (
    <FolhaMobile
      aberto
      onFechar={onFechar}
      titulo={[turma.curso_nome, turma.professor_nome].filter(Boolean).join(' · ')}
      subtitulo={resumo}
    >
      <div className="flex flex-col gap-2">
        {nivel === 'sozinho' && (
          <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-[12px] text-red-200">
            Turma com um aluno só — é o caso que o indicador SOZINHOS conta.
          </p>
        )}

        <p className="px-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">
          Alunos ({turma.total_alunos})
        </p>

        {turma.nomes_alunos?.length ? (
          <div className="flex flex-col gap-1">
            {turma.nomes_alunos.map((nome, i) => (
              <div
                key={`${nome}-${i}`}
                className="flex min-h-[44px] items-center justify-between gap-2 rounded-lg bg-slate-800/40 px-3"
              >
                <span className="min-w-0 truncate text-sm text-slate-200">{nome}</span>
                {onRemoverAlunoTurma && turma.ids_alunos?.[i] != null && (
                  <button
                    type="button"
                    onClick={() => onRemoverAlunoTurma(turma, turma.ids_alunos[i], nome)}
                    aria-label={`Remover ${nome} da turma`}
                    className="flex h-11 w-11 flex-none items-center justify-center rounded-md text-slate-500 active:bg-slate-800"
                  >
                    <UserMinus className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="px-1 text-[12px] text-slate-500">Nenhum aluno vinculado a esta turma.</p>
        )}

        {onAdicionarAlunoTurma && (
          <button
            type="button"
            onClick={() => {
              onAdicionarAlunoTurma(turma);
              onFechar();
            }}
            className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/10 text-sm font-semibold text-cyan-200 active:bg-cyan-500/20"
          >
            <UserPlus className="h-4 w-4" />
            Adicionar aluno
          </button>
        )}

        <div className="mt-2 border-t border-slate-800 pt-2">
          {trocandoSala ? (
            <>
              <p className="px-1 pb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">Sala</p>
              <div className="flex flex-col gap-1">
                {salas.length === 0 && (
                  <p className="px-1 text-[12px] text-slate-500">Nenhuma sala ativa nesta unidade.</p>
                )}
                {salas.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    disabled={salvando}
                    onClick={() => escolherSala(s.id)}
                    className={cn(
                      'flex min-h-[44px] items-center justify-between rounded-lg px-3 text-left text-sm disabled:opacity-60',
                      turma.sala_id === s.id ? 'bg-slate-800 font-bold text-cyan-400' : 'font-medium text-slate-300',
                    )}
                  >
                    <span className="min-w-0 truncate">{s.nome}</span>
                    <span className="flex-none text-[11px] text-slate-500">até {s.capacidade_maxima}</span>
                  </button>
                ))}
              </div>
              {salvando && (
                <p className="flex items-center gap-1.5 px-1 pt-1 text-[12px] text-slate-400">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> gravando…
                </p>
              )}
            </>
          ) : (
            <button
              type="button"
              onClick={() => setTrocandoSala(true)}
              className="flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-lg border border-slate-700 text-sm font-semibold text-slate-300 active:bg-slate-800"
            >
              <DoorOpen className="h-4 w-4" />
              {turma.sala_nome ? 'Trocar a sala' : 'Vincular uma sala'}
            </button>
          )}

          {erro && (
            <p className="mt-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-200">
              {erro}
            </p>
          )}
        </div>

        {(onEditarTurma || onExcluirTurma) && turma.id != null && (
          <div className="mt-1 flex gap-2">
            {onEditarTurma && (
              <button
                type="button"
                onClick={() => {
                  onEditarTurma(turma);
                  onFechar();
                }}
                className="min-h-[44px] flex-1 rounded-lg border border-slate-700 text-sm font-semibold text-slate-300"
              >
                Editar turma
              </button>
            )}
            {onExcluirTurma && (
              <button
                type="button"
                onClick={() => {
                  // A confirmação é do desktop: o modal de exclusão vive lá e é
                  // quem pergunta. Duplicá-la aqui daria duas perguntas.
                  onExcluirTurma(turma.id as number);
                  onFechar();
                }}
                aria-label="Excluir turma"
                className="flex min-h-[44px] w-14 flex-none items-center justify-center rounded-lg border border-rose-500/30 text-rose-300"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </div>
    </FolhaMobile>
  );
}

export default TurmasMobile;
