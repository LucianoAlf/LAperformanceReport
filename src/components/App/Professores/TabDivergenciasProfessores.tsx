import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, CalendarClock, Check, Link2, Loader2, RefreshCw, Search, ShieldQuestion, UserPlus,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  buscarProfessoresParecidos,
  useProfessoresDivergencias,
  type DivergenciaProfessor,
  type ProfessorParecido,
} from '@/hooks/useProfessoresDivergencias';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

/**
 * Fila de divergências de identidade de professor (nosso cadastro × Emusys).
 *
 * Existe porque essa fila rodava todo dia às 07:00 e NINGUÉM VIA: o caso do Jonathan
 * (professor ativo na Barra, 10 aulas futuras, sem vínculo nenhum) ficou aberto por dias
 * porque só aparecia para quem fosse consultar o banco.
 */

interface Props {
  unidadeAtual?: string | null;
}

const ROTULO_TIPO: Record<string, string> = {
  so_no_emusys: 'Existe só no Emusys',
  so_no_la: 'Existe só no LA Report',
  conflito_unidade: 'Conflito de unidade',
  sem_vinculo_la: 'Sem vínculo no LA Report',
};

const EXPLICACAO_TIPO: Record<string, string> = {
  so_no_emusys:
    'O Emusys tem esse professor e nós não temos vínculo com ele. Costuma ser transferência de unidade — os ids do Emusys são por unidade, então mudar de unidade gera id novo.',
  so_no_la:
    'Temos o cadastro, mas o Emusys não devolve mais esse id na unidade. Costuma ser saída, ou transferência para outra unidade.',
  conflito_unidade:
    'O cadastro existe dos dois lados, mas com estados incompatíveis. Exige decisão humana — o sync recusa reativar sozinho de propósito.',
  sem_vinculo_la:
    'Temos o professor mas ele não tem id do Emusys nessa unidade. Pode ser que não atue ali.',
};

/** Decisões que espelham o vocabulário já usado na tabela. */
const DECISOES = [
  { valor: 'vinculo_confirmado', rotulo: 'Vincular — é a mesma pessoa' },
  { valor: 'ignorado_professor_inativo', rotulo: 'Não trabalha mais aqui' },
  { valor: 'ignorado_nao_atua_na_unidade', rotulo: 'Não atua nesta unidade' },
  { valor: 'ignorado_nao_e_professor', rotulo: 'Não é professor (coordenação/admin)' },
  { valor: 'ignorado_duplicidade_unidade', rotulo: 'Cadastro duplicado' },
];

function corDaSeveridade(severidade: string) {
  if (severidade === 'alta') return 'bg-rose-500/20 text-rose-300 border-rose-500/40';
  if (severidade === 'media') return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
  return 'bg-slate-500/20 text-slate-300 border-slate-500/40';
}

const ROTULO_PARECIDO: Record<string, string> = {
  exato: 'mesmo nome',
  parecido: 'nome parecido',
  contem: 'contém o nome',
};

/**
 * "Existe só no Emusys": o sync já vinculou/criou sozinho tudo o que era seguro. O que chega
 * aqui é dúvida (nome parecido, homônimo, inativo…) — então a ação é escolher o professor, e
 * ela grava o id de verdade. Os candidatos vêm da mesma régua que o sync usou.
 */
function PainelVincular({
  divergencia,
  decidindo,
  onVincular,
}: {
  divergencia: DivergenciaProfessor;
  decidindo: boolean;
  onVincular: (professorId: number | null) => void;
}) {
  const nomeEmusys = divergencia.nome_emusys ?? '';
  const [busca, setBusca] = useState(nomeEmusys);
  const [candidatos, setCandidatos] = useState<ProfessorParecido[]>([]);
  const [buscando, setBuscando] = useState(false);

  useEffect(() => {
    let cancelado = false;
    const timer = setTimeout(async () => {
      setBuscando(true);
      try {
        const lista = await buscarProfessoresParecidos(busca);
        if (!cancelado) setCandidatos(lista);
      } catch {
        if (!cancelado) setCandidatos([]);
      } finally {
        if (!cancelado) setBuscando(false);
      }
    }, 300);
    return () => {
      cancelado = true;
      clearTimeout(timer);
    };
  }, [busca]);

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-400">
        Vincular o id {divergencia.emusys_professor_id} do Emusys a um professor do LA Report:
      </p>
      <div className="relative">
        <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar professor pelo nome"
          className="pl-8 h-8 text-sm"
        />
      </div>
      <div className="space-y-1 max-h-56 overflow-y-auto">
        {buscando && (
          <p className="text-xs text-slate-500 flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" /> Buscando…
          </p>
        )}
        {!buscando && candidatos.length === 0 && (
          <p className="text-xs text-slate-500">Nenhum professor com nome parecido.</p>
        )}
        {candidatos.map((c) => (
          <div
            key={c.professor_id}
            className="flex items-center justify-between gap-2 rounded bg-slate-900/50 px-3 py-1.5"
          >
            <div className="min-w-0">
              <p className="text-sm text-slate-200 truncate">{c.nome}</p>
              <p className="text-[11px] text-slate-500">
                {ROTULO_PARECIDO[c.tipo] ?? c.tipo}
                {c.unidades.length > 0 && ` · ${c.unidades.join(', ')}`}
                {!c.ativo && ' · inativo'}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={decidindo || !c.ativo}
              title={c.ativo ? undefined : 'Reative o cadastro antes de vincular'}
              onClick={() => onVincular(c.professor_id)}
            >
              <Link2 className="h-3 w-3 mr-1" /> Vincular
            </Button>
          </div>
        ))}
      </div>
      <div className="flex justify-end pt-1">
        <Button size="sm" disabled={decidindo || !nomeEmusys} onClick={() => onVincular(null)}>
          {decidindo ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <UserPlus className="h-3 w-3 mr-1" />}
          Criar professor novo “{nomeEmusys}”
        </Button>
      </div>
    </div>
  );
}

function CartaoDivergencia({
  divergencia,
  decidindo,
  onDecidir,
  onVincular,
}: {
  divergencia: DivergenciaProfessor;
  decidindo: boolean;
  onDecidir: (decisao: string, observacao: string) => void;
  onVincular: (professorId: number | null) => void;
}) {
  const vinculavel = divergencia.tipo_divergencia === 'so_no_emusys' && divergencia.emusys_professor_id != null;
  const [aberto, setAberto] = useState(false);
  const [decisao, setDecisao] = useState('');
  const [observacao, setObservacao] = useState('');

  const urgente = divergencia.aulas_futuras_do_emusys > 0;

  return (
    <div
      className={cn(
        'rounded-lg border p-4 space-y-3 transition-colors',
        urgente
          ? 'border-rose-500/50 bg-rose-500/5'
          : 'border-slate-700/60 bg-slate-800/40',
      )}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="font-medium text-slate-100 truncate">
            {divergencia.professor_nome || 'Professor sem nome'}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">
            {divergencia.unidade_codigo}
            {divergencia.emusys_professor_id != null && ` · Emusys ${divergencia.emusys_professor_id}`}
            {divergencia.professor_id != null && ` · LA ${divergencia.professor_id}`}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={cn('text-xs px-2 py-0.5 rounded-full border', corDaSeveridade(divergencia.severidade))}>
            {divergencia.severidade}
          </span>
          <Badge variant="outline" className="text-xs">
            {ROTULO_TIPO[divergencia.tipo_divergencia] ?? divergencia.tipo_divergencia}
          </Badge>
        </div>
      </div>

      {/* O sinal que importa: divergência com aula futura é gente dando aula agora sem vínculo. */}
      {urgente && (
        <div className="flex items-start gap-2 text-sm text-rose-300 bg-rose-500/10 rounded px-3 py-2">
          <CalendarClock className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            <strong>{divergencia.aulas_futuras_do_emusys}</strong>{' '}
            {divergencia.aulas_futuras_do_emusys === 1 ? 'aula futura sem professor vinculado' : 'aulas futuras sem professor vinculado'}
            {' '}— alguém está dando aula e o registro não chega em ninguém.
          </span>
        </div>
      )}

      <p className="text-sm text-slate-400">
        {EXPLICACAO_TIPO[divergencia.tipo_divergencia] ?? 'Divergência entre o nosso cadastro e o Emusys.'}
      </p>

      {(divergencia.nome_la || divergencia.nome_emusys) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          <div className="rounded bg-slate-900/50 px-3 py-2">
            <p className="text-slate-500 mb-0.5">Nome no LA Report</p>
            <p className="text-slate-200">{divergencia.nome_la || '—'}</p>
          </div>
          <div className="rounded bg-slate-900/50 px-3 py-2">
            <p className="text-slate-500 mb-0.5">Nome no Emusys</p>
            <p className="text-slate-200">{divergencia.nome_emusys || '—'}</p>
          </div>
        </div>
      )}

      {divergencia.sugestao_texto && (
        <p className="text-xs text-slate-400 italic border-l-2 border-slate-600 pl-3">
          {divergencia.sugestao_texto}
        </p>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
        <span className="text-xs text-slate-500">
          Detectada há {divergencia.dias_em_aberto} {divergencia.dias_em_aberto === 1 ? 'dia' : 'dias'}
        </span>

        {divergencia.resolvido ? (
          <span className="text-xs text-emerald-400 flex items-center gap-1">
            <Check className="h-3 w-3" />
            {divergencia.decisao} · {divergencia.decidido_por}
          </span>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setAberto((v) => !v)}>
            {aberto ? 'Cancelar' : 'Decidir'}
          </Button>
        )}
      </div>

      {aberto && !divergencia.resolvido && (
        <div className="space-y-2 pt-2 border-t border-slate-700/60">
          {vinculavel && (
            <>
              <PainelVincular divergencia={divergencia} decidindo={decidindo} onVincular={onVincular} />
              <p className="text-xs text-slate-500 pt-2 border-t border-slate-700/40">
                Ou, se não é para vincular:
              </p>
            </>
          )}
          <div className="flex flex-wrap gap-2">
            {DECISOES.filter((opcao) => !(vinculavel && opcao.valor === 'vinculo_confirmado')).map((opcao) => (
              <button
                key={opcao.valor}
                type="button"
                onClick={() => setDecisao(opcao.valor)}
                className={cn(
                  'text-xs px-3 py-1.5 rounded-full border transition-colors',
                  decisao === opcao.valor
                    ? 'border-sky-400 bg-sky-500/20 text-sky-200'
                    : 'border-slate-600 text-slate-300 hover:border-slate-500',
                )}
              >
                {opcao.rotulo}
              </button>
            ))}
          </div>

          <Textarea
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder="Por que essa decisão? (fica registrado junto)"
            rows={2}
            className="text-sm"
          />

          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              disabled={!decisao || decidindo}
              onClick={() => onDecidir(decisao, observacao)}
            >
              {decidindo ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Check className="h-3 w-3 mr-1" />}
              Registrar decisão
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function TabDivergenciasProfessores({ unidadeAtual }: Props) {
  const [incluirResolvidas, setIncluirResolvidas] = useState(false);
  const { divergencias, resumo, carregando, erro, decidindoId, recarregar, decidir, vincular } =
    useProfessoresDivergencias({
      incluirResolvidas,
      unidadeId: unidadeAtual && unidadeAtual !== 'todos' ? unidadeAtual : null,
    });

  const ordenadas = useMemo(
    () => [...divergencias].sort((a, b) => b.aulas_futuras_do_emusys - a.aulas_futuras_do_emusys),
    [divergencias],
  );

  async function handleDecidir(id: number, decisao: string, observacao: string) {
    try {
      await decidir(id, decisao, observacao);
      toast.success('Decisão registrada');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível registrar a decisão');
    }
  }

  async function handleVincular(id: number, professorId: number | null) {
    try {
      const resultado = await vincular(id, professorId);
      const aulas = resultado?.aulas_corrigidas ?? 0;
      toast.success(
        professorId == null ? 'Professor criado e vinculado' : 'Professor vinculado',
        { description: aulas > 0 ? `${aulas} aulas passaram a apontar para ele.` : undefined },
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível vincular');
    }
  }

  if (carregando) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-400">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Carregando divergências…
      </div>
    );
  }

  if (erro) {
    return (
      <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-300">
        Não foi possível carregar a fila: {erro}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
            <ShieldQuestion className="h-5 w-5 text-sky-400" />
            Divergências de cadastro
          </h2>
          <p className="text-sm text-slate-400 mt-1 max-w-2xl">
            Diferenças entre o nosso cadastro de professor e o do Emusys, detectadas
            diariamente. Quando uma fica em aberto, as aulas do professor podem deixar de
            ser atribuídas a alguém.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={incluirResolvidas ? 'default' : 'outline'}
            onClick={() => setIncluirResolvidas((v) => !v)}
          >
            {incluirResolvidas ? 'Ocultar resolvidas' : 'Ver resolvidas'}
          </Button>
          <Button size="sm" variant="outline" onClick={() => void recarregar()}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {resumo.comAulaFutura > 0 && (
        <div className="rounded-lg border border-rose-500/50 bg-rose-500/10 p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="text-rose-200 font-medium">
              {resumo.comAulaFutura} {resumo.comAulaFutura === 1 ? 'divergência afeta aula já marcada' : 'divergências afetam aulas já marcadas'}
            </p>
            <p className="text-rose-300/80 mt-0.5">
              São {resumo.aulasFuturasAfetadas} aulas futuras sem professor vinculado. Elas
              não contam para ninguém — nem na carteira, nem no score.
            </p>
          </div>
        </div>
      )}

      {ordenadas.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-slate-700/50 rounded-lg">
          <Check className="h-8 w-8 text-emerald-400 mx-auto mb-2" />
          <p className="text-slate-300">Nenhuma divergência em aberto</p>
          <p className="text-sm text-slate-500 mt-1">
            A verificação roda todo dia às 07h42 e já vincula ou cadastra sozinha o professor novo
            quando o nome não deixa dúvida.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {ordenadas.map((d) => (
            <CartaoDivergencia
              key={d.id}
              divergencia={d}
              decidindo={decidindoId === d.id}
              onDecidir={(decisao, observacao) => void handleDecidir(d.id, decisao, observacao)}
              onVincular={(professorId) => void handleVincular(d.id, professorId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
