import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Search, Users, Check, HelpCircle, X, Music, AlertTriangle, Guitar, LayoutList } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { KPICard } from '@/components/ui/KPICard';
import { cn } from '@/lib/utils';
import { normalizarBusca } from '@/lib/agenda';
import { avaliarElegibilidade, resumirParticipacao, resumirAlocacao } from '@/lib/eventos';
import {
  useAlunosDoEvento,
  definirParticipacao,
  definirParticipacaoEmLote,
  type AlocacaoDoCurso,
  type AlunoElegivel,
  type ParticipacaoStatus,
} from '@/hooks/useEventos';

type FiltroStatus = 'todos' | ParticipacaoStatus;

const FILTROS: { id: FiltroStatus; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'indefinido', label: 'Indefinidos' },
  { id: 'participa', label: 'Participam' },
  { id: 'nao', label: 'Não participam' },
];

/**
 * Tri-state: as tres opcoes sempre a vista, a escolhida preenchida.
 *
 * ⚠️ "Indefinido" e um estado LEGITIMO, nao a ausencia de resposta — e por isso tem botao
 * proprio em vez de ser o "nenhum selecionado". A coordenacao precisa distinguir "ainda
 * nao perguntei" de "perguntei e ele nao vai", que e a diferenca entre ligar e nao ligar.
 */
function SeletorParticipacao({
  valor,
  desabilitado,
  onEscolher,
}: {
  valor: ParticipacaoStatus;
  desabilitado: boolean;
  onEscolher: (s: ParticipacaoStatus) => void;
}) {
  const opcoes: { id: ParticipacaoStatus; icone: typeof Check; titulo: string; ativo: string }[] = [
    { id: 'participa', icone: Check, titulo: 'Participa', ativo: 'bg-emerald-500 text-white' },
    { id: 'indefinido', icone: HelpCircle, titulo: 'Indefinido', ativo: 'bg-amber-500 text-white' },
    { id: 'nao', icone: X, titulo: 'Não participa', ativo: 'bg-rose-500 text-white' },
  ];

  return (
    <div className="flex shrink-0 overflow-hidden rounded-lg border border-slate-700">
      {opcoes.map((o) => {
        const Icone = o.icone;
        const selecionado = valor === o.id;
        return (
          <button
            key={o.id}
            type="button"
            title={o.titulo}
            aria-label={o.titulo}
            aria-pressed={selecionado}
            disabled={desabilitado && o.id === 'participa'}
            onClick={() => onEscolher(o.id)}
            className={cn(
              'flex h-8 w-9 items-center justify-center transition-colors',
              selecionado ? o.ativo : 'text-slate-500 hover:bg-slate-700/60 hover:text-slate-300',
              desabilitado && o.id === 'participa' && 'cursor-not-allowed opacity-30 hover:bg-transparent',
            )}
          >
            <Icone className="h-4 w-4" />
          </button>
        );
      })}
    </div>
  );
}

/** Selo de bloco de UM curso. `null` quando aquele curso ainda nao entrou na grade. */
function SeloBloco({ alocacao }: { alocacao: AlocacaoDoCurso | undefined }) {
  if (!alocacao) {
    return <span className="text-[11px] text-slate-600">· não alocado</span>;
  }
  return (
    <span
      className="rounded bg-violet-500/15 px-1.5 py-px text-[10.5px] font-medium text-violet-300"
      title={alocacao.horario_inicial ? `Início ${alocacao.horario_inicial.slice(0, 5)}` : undefined}
    >
      {alocacao.bloco_nome}
      {alocacao.horario_inicial && ` · ${alocacao.horario_inicial.slice(0, 5)}`}
    </span>
  );
}

function LinhaAluno({
  aluno,
  onEscolher,
}: {
  aluno: AlunoElegivel;
  onEscolher: (s: ParticipacaoStatus) => void;
}) {
  const avaliacao = avaliarElegibilidade(aluno);
  const alocacao = resumirAlocacao(aluno.cursos_no_recital, aluno.cursos_alocados);
  const alocacaoPorCurso = new Map(aluno.alocacoes.map((a) => [a.curso_id, a]));

  return (
    <div
      className={cn(
        'flex items-center gap-3 border-b border-slate-800 px-3 py-2.5 last:border-b-0',
        aluno.status === 'participa' && 'bg-emerald-500/[0.04]',
        aluno.status === 'nao' && 'opacity-60',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate text-[13.5px] font-medium text-white">{aluno.nome}</span>
          {aluno.idade_anos != null && (
            <span className="text-[11.5px] text-slate-500">{aluno.idade_anos} anos</span>
          )}
          {aluno.faz_banda && (
            <Badge variant="outline" className="gap-1 text-[10px]">
              <Guitar className="h-2.5 w-2.5" />
              banda
            </Badge>
          )}
        </div>

        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-slate-400">
          {aluno.cursos.map((c) => (
            <span key={c.curso_id} className="flex items-center gap-1">
              <Music className="h-3 w-3 text-slate-600" />
              {c.curso_nome}
              {c.professor_nome && <span className="text-slate-600">· {c.professor_nome}</span>}
              {/* Selo por curso so quando ALGUMA apresentacao ja existe: enquanto a grade
                  esta vazia, um "nao alocado" em cada curso e ruido em 100% das linhas. */}
              {alocacao.detalharPorCurso && <SeloBloco alocacao={alocacaoPorCurso.get(c.curso_id)} />}
            </span>
          ))}
          {avaliacao.aviso && (
            <span
              className={cn(
                'flex items-center gap-1',
                avaliacao.situacao === 'cadastro_incompleto' ? 'text-amber-400' : 'text-slate-500',
              )}
            >
              <AlertTriangle className="h-3 w-3" />
              {avaliacao.aviso}
            </span>
          )}
        </div>
      </div>

      {aluno.cursos_no_recital > 1 && (
        <span
          className="shrink-0 rounded bg-slate-700/70 px-1.5 py-0.5 text-[10.5px] font-medium tabular-nums text-slate-300"
          title={`${aluno.cursos_no_recital} cursos = ${aluno.cursos_no_recital} apresentações`}
        >
          {aluno.cursos_no_recital}×
        </span>
      )}

      {/* Coluna "Bloco / Horário" do prototipo. Estado unico (`situacao`), nunca condicoes
          soltas: com twMerge a ultima classe conflitante vence, e cartao pintado por flags
          independentes ja contradisse o proprio rotulo no modulo Agenda. */}
      <div className="w-[116px] shrink-0 text-right">
        {alocacao.situacao === 'completa' && aluno.cursos_no_recital === 1 ? (
          <SeloBloco alocacao={aluno.alocacoes[0]} />
        ) : alocacao.rotulo ? (
          <span
            className={cn(
              'text-[11.5px]',
              alocacao.situacao === 'completa' && 'text-violet-300',
              alocacao.situacao === 'parcial' && 'text-amber-400',
              alocacao.situacao === 'nenhuma' && 'text-slate-600',
            )}
          >
            {alocacao.rotulo}
          </span>
        ) : null}
      </div>

      <SeletorParticipacao
        valor={aluno.status}
        desabilitado={!avaliacao.podeParticipar}
        onEscolher={onEscolher}
      />
    </div>
  );
}

export function AlunosTab({ eventoId, unidadeId }: { eventoId: number; unidadeId: string }) {
  const { alunos, loading, erro, recarregar } = useAlunosDoEvento(eventoId, unidadeId);
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<FiltroStatus>('todos');
  const [soSemAlocar, setSoSemAlocar] = useState(false);
  const [gravando, setGravando] = useState<string | null>(null);

  const resumo = useMemo(() => resumirParticipacao(alunos), [alunos]);

  const visiveis = useMemo(() => {
    const termo = normalizarBusca(busca.trim());
    return alunos.filter((a) => {
      if (filtro !== 'todos' && a.status !== filtro) return false;
      // Eixo SEPARADO do status — participacao e alocacao sao perguntas diferentes, e
      // juntar as duas num radio so faria "Participam" e "Sem alocar" se excluirem.
      // Quem nao tem curso nenhum nao entra: ele nao esta esperando ser alocado.
      if (soSemAlocar && (a.cursos_alocados >= a.cursos_no_recital || a.cursos_no_recital === 0)) {
        return false;
      }
      if (!termo) return true;
      const alvo = normalizarBusca(
        `${a.nome} ${a.cursos.map((c) => `${c.curso_nome} ${c.professor_nome ?? ''}`).join(' ')}`,
      );
      return alvo.includes(termo);
    });
  }, [alunos, busca, filtro, soSemAlocar]);

  const escolher = async (aluno: AlunoElegivel, status: ParticipacaoStatus) => {
    setGravando(aluno.pessoa_chave);
    const { error } = await definirParticipacao(eventoId, aluno.aluno_id_referencia, status);
    setGravando(null);
    // Erro de escrita nunca some em silencio: sem isto o clique parece ter funcionado
    // e a decisao da coordenacao se perde entre um recarregamento e outro.
    if (error) toast.error(`Não consegui gravar ${aluno.nome}: ${error.message}`);
    else recarregar();
  };

  // Lote respeita o que esta FILTRADO na tela, nao a base inteira: marcar 400 pessoas
  // quando a coordenacao olhava para 12 e o tipo de surpresa que nao se desfaz num clique.
  const marcarLote = async (status: ParticipacaoStatus) => {
    const alvos = visiveis.filter((a) => avaliarElegibilidade(a).podeParticipar || status !== 'participa');
    if (alvos.length === 0) return;
    setGravando('__lote__');
    const { error } = await definirParticipacaoEmLote(
      eventoId,
      alvos.map((a) => a.aluno_id_referencia),
      status,
    );
    setGravando(null);
    if (error) toast.error(`Não consegui gravar o lote: ${error.message}`);
    else {
      toast.success(`${alvos.length} ${alvos.length === 1 ? 'aluno atualizado' : 'alunos atualizados'}`);
      recarregar();
    }
  };

  if (erro) {
    return (
      <p className="rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-[13px] text-rose-200">
        Não foi possível carregar os alunos: {erro}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KPICard size="sm" label="Elegíveis" value={resumo.total} icon={Users} variant="default" />
        <KPICard size="sm" label="Participam" value={resumo.participam} icon={Check} variant="emerald" />
        <KPICard size="sm" label="Indefinidos" value={resumo.indefinidos} icon={HelpCircle} variant="amber" />
        <KPICard
          size="sm"
          label="Apresentações previstas"
          value={resumo.apresentacoesPrevistas}
          icon={Music}
          variant="violet"
          subvalue={
            resumo.apresentacoesAlocadas > 0
              ? `${resumo.apresentacoesAlocadas} já na grade`
              : '1 por curso de quem participa'
          }
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar aluno, curso ou professor…"
            className="pl-8"
          />
        </div>

        <div className="flex overflow-hidden rounded-lg border border-slate-700">
          {FILTROS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFiltro(f.id)}
              className={cn(
                'px-3 py-1.5 text-[12.5px] transition-colors',
                filtro === f.id
                  ? 'bg-violet-600 text-white'
                  : 'text-slate-400 hover:bg-slate-700/60 hover:text-slate-200',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* So aparece quando ha grade montada: antes disso ele filtraria a lista inteira
            e nao responderia pergunta nenhuma. */}
        {resumo.apresentacoesAlocadas > 0 && (
          <Button
            variant={soSemAlocar ? 'default' : 'outline'}
            size="sm"
            className="gap-1.5"
            onClick={() => setSoSemAlocar((v) => !v)}
          >
            <LayoutList className="h-3.5 w-3.5" />
            Sem alocar
          </Button>
        )}

        <Button
          variant="outline"
          size="sm"
          disabled={gravando === '__lote__' || visiveis.length === 0}
          onClick={() => marcarLote('participa')}
        >
          Marcar os {visiveis.length} visíveis
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-800/40">
        {loading && alunos.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-400">Carregando alunos…</p>
        ) : visiveis.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-400">
            {alunos.length === 0
              ? 'Nenhum aluno ativo nesta unidade.'
              : 'Nenhum aluno com esse filtro.'}
          </p>
        ) : (
          <div className={cn('transition-opacity', gravando && 'opacity-60')}>
            {visiveis.map((a) => (
              <LinhaAluno key={a.pessoa_chave} aluno={a} onEscolher={(s) => escolher(a, s)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
