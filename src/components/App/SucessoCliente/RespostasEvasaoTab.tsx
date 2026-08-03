import { useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AlertTriangle, Loader2, Mic, MessageSquare, TriangleAlert } from 'lucide-react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import type { UnidadeId } from '@/components/ui/UnidadeFilter';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/useToast';
import {
  agregarDivergencia,
  ehTemaValido,
  MIN_RESPOSTAS_PAINEL,
  nivelDeConfianca,
  respostaConfirmaMotivo,
  resumirRespostas,
  rotuloTema,
  separarBlocosResposta,
  temaDoMotivoRegistrado,
  TEMAS_EVASAO,
  type TemaEvasao,
} from '@/lib/pesquisaEvasao';
import { useRespostasEvasao, type RespostaEvasaoLinha } from './hooks/useRespostasEvasao';

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

// Cor por tema. `professor_metodo` em rose de propósito: é o único que aponta
// para dentro da escola, e o catálogo de motivos não tem categoria para ele.
const COR_TEMA: Record<TemaEvasao, string> = {
  financeiro: 'bg-amber-400',
  horario: 'bg-cyan-400',
  professor_metodo: 'bg-rose-400',
  mudanca: 'bg-sky-400',
  saude: 'bg-teal-400',
  sem_motivo_claro: 'bg-slate-500',
  outro: 'bg-slate-500',
};

interface Props {
  unidadeAtual: UnidadeId;
}

export function RespostasEvasaoTab({ unidadeAtual }: Props) {
  const toast = useToast();
  const hoje = new Date();
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes, setMes] = useState<number | null>(null);

  const { respostas, carregando, erro, classificar } = useRespostasEvasao(unidadeAtual, ano, mes);

  const resumo = useMemo(() => resumirRespostas(respostas), [respostas]);
  const divergencia = useMemo(() => agregarDivergencia(respostas), [respostas]);
  const confianca = nivelDeConfianca(resumo.classificadas);

  async function marcar(pesquisaId: string, tema: TemaEvasao, jaMarcado: boolean) {
    const r = await classificar(pesquisaId, jaMarcado ? null : tema);
    if (!r.ok) toast.error('Não foi possível salvar o tema', r.erro);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={mes === null ? 'todos' : String(mes)} onValueChange={(v) => setMes(v === 'todos' ? null : Number(v))}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Ano inteiro</SelectItem>
            {MESES.map((m, i) => (
              <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
          <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="2025">2025</SelectItem>
            <SelectItem value="2026">2026</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-slate-500">
          Período por <strong>data da saída</strong> — a resposta costuma chegar semanas depois.
        </p>
      </div>

      {erro && (
        <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">
          Não foi possível carregar as respostas: {erro}
        </p>
      )}

      {carregando ? (
        <p className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando respostas…
        </p>
      ) : respostas.length === 0 ? (
        <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 p-8 text-center">
          <p className="text-sm text-slate-300">Nenhuma resposta de evasão no período.</p>
          <p className="mt-1 text-xs text-slate-500">
            As respostas aparecem aqui assim que alguém responde a pesquisa enviada na aba Evasão.
            Envios em modo teste nunca entram nesta análise.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-slate-700/60 bg-slate-700/60 sm:grid-cols-4">
            <Kpi rotulo="Respostas" valor={String(resumo.total)} rodape={`${resumo.classificadas} com tema marcado`} />
            <Kpi
              rotulo="Motivo confirmado"
              valor={resumo.percentualConfirmado === null ? '—' : `${resumo.percentualConfirmado}%`}
              destaque="text-violet-300"
              rodape={
                resumo.comparaveis === 0
                  ? 'nada comparável ainda'
                  : `${resumo.confirmadas} de ${resumo.comparaveis} comparáveis`
              }
            />
            <Kpi
              rotulo="Divergentes"
              valor={String(resumo.divergentes)}
              destaque="text-amber-300"
              rodape="disseram outro motivo"
            />
            <Kpi
              rotulo="Citam professor"
              valor={String(resumo.citamProfessor)}
              destaque={resumo.citamProfessorNaoRegistrado > 0 ? 'text-rose-300' : undefined}
              rodape={
                resumo.citamProfessorNaoRegistrado > 0
                  ? `${resumo.citamProfessorNaoRegistrado} não registrada assim`
                  : 'nenhuma fora do registrado'
              }
            />
          </div>

          {/* O painel some abaixo de 5 — com 3 respostas, uma classificação
              trocada moveria o percentual em 33 pontos. */}
          {confianca !== 'insuficiente' && divergencia.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-slate-700/60 bg-slate-800/40">
              <div className="flex flex-wrap items-baseline gap-2 border-b border-slate-700/60 px-4 py-3">
                <h3 className="text-sm font-semibold text-white">Motivo registrado × motivo declarado</h3>
                <span className="text-xs text-slate-500">o que a pessoa respondeu quando perguntamos por quê</span>
              </div>
              <div className="space-y-2.5 px-4 py-3.5">
                {divergencia.map((linha) => (
                  <div key={linha.motivo} className="grid grid-cols-[minmax(0,160px)_1fr] items-center gap-3">
                    <div className="text-right text-[12.5px] leading-tight">
                      <span className="block truncate font-medium text-slate-200">{linha.motivo}</span>
                      <span className="text-[10.5px] tabular-nums text-slate-500">
                        {linha.total} {linha.total === 1 ? 'resposta' : 'respostas'}
                      </span>
                    </div>
                    <div className="flex h-6 overflow-hidden rounded bg-slate-900">
                      {linha.temas.map((t) => (
                        <span
                          key={t.tema}
                          title={`${t.qtd} × ${rotuloTema(t.tema)}${t.confirma ? ' (confirma o registrado)' : ''}`}
                          style={{ width: `${(t.qtd / linha.total) * 100}%` }}
                          className={cn(
                            'grid place-items-center overflow-hidden whitespace-nowrap px-1 text-[10.5px] font-semibold text-slate-950',
                            t.confirma ? 'bg-emerald-400' : COR_TEMA[t.tema],
                          )}
                        >
                          {t.qtd}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
                <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-[10.5px] text-slate-500">
                  <Verbete cor="bg-emerald-400">confirma o registrado</Verbete>
                  <Verbete cor="bg-rose-400">professor / método</Verbete>
                  <Verbete cor="bg-amber-400">financeiro</Verbete>
                  <Verbete cor="bg-cyan-400">horário</Verbete>
                  <Verbete cor="bg-slate-500">outro</Verbete>
                </div>
              </div>
            </div>
          )}

          {confianca === 'indicativo' && (
            <Aviso>
              <strong>{resumo.classificadas} respostas classificadas — leitura indicativa, não estatística.</strong>{' '}
              Abaixo de 30, cada resposta pesa mais de 3 pontos percentuais. As respostas na íntegra,
              abaixo, continuam sendo a leitura principal.
            </Aviso>
          )}
          {confianca === 'insuficiente' && (
            <Aviso>
              <strong>
                {resumo.classificadas === 0
                  ? 'Nenhuma resposta classificada ainda.'
                  : `${resumo.classificadas} de ${MIN_RESPOSTAS_PAINEL} respostas classificadas.`}
              </strong>{' '}
              O painel de motivo registrado × declarado aparece a partir de {MIN_RESPOSTAS_PAINEL}.
              Por enquanto, leia as respostas e marque o tema de cada uma.
            </Aviso>
          )}

          <div className="space-y-3">
            {respostas.map((r) => (
              <CartaoResposta key={r.pesquisa_id} resposta={r} onMarcar={marcar} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function CartaoResposta({
  resposta,
  onMarcar,
}: {
  resposta: RespostaEvasaoLinha;
  onMarcar: (id: string, tema: TemaEvasao, jaMarcado: boolean) => void;
}) {
  const blocos = separarBlocosResposta(resposta.resposta_texto);
  const confirma = respostaConfirmaMotivo(resposta);
  const temaEsperado = temaDoMotivoRegistrado(resposta.motivo_cadastrado);
  const marcado = ehTemaValido(resposta.categoria_resposta) ? resposta.categoria_resposta : null;

  const contexto = [
    resposta.aluno_curso,
    resposta.aluno_professor,
    resposta.unidade_nome,
    resposta.tempo_permanencia_meses != null ? `${resposta.tempo_permanencia_meses} meses de casa` : null,
    `saiu em ${format(parseISO(resposta.data_evasao), 'dd/MM', { locale: ptBR })}`,
  ].filter(Boolean).join(' · ');

  return (
    <div className="space-y-3 rounded-xl border border-slate-700/60 bg-slate-800/40 p-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-white">{resposta.aluno_nome}</p>
          <p className="text-[11.5px] text-slate-500">{contexto}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Etiqueta tom="neutro">
            registrado: {resposta.motivo_cadastrado || '—'}
            {resposta.motivo_conta_score && ' ⚑'}
          </Etiqueta>
          {marcado === null ? (
            <Etiqueta tom="violeta">a classificar</Etiqueta>
          ) : confirma === null ? (
            <Etiqueta tom="neutro">declarado: {rotuloTema(marcado)}</Etiqueta>
          ) : confirma ? (
            <Etiqueta tom="verde">declarado: {rotuloTema(marcado)}</Etiqueta>
          ) : (
            <Etiqueta tom="ambar">declarado: {rotuloTema(marcado)}</Etiqueta>
          )}
        </div>
      </div>

      {/* ⚑ = o motivo registrado penaliza o professor no score. Se ele estiver
          errado, o score está errado junto — por isso a divergência importa. */}
      {resposta.motivo_conta_score && confirma === false && (
        <p className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-200">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          O motivo registrado penaliza o professor no score, e a pessoa declarou outra coisa.
        </p>
      )}
      {marcado === 'professor_metodo' && temaEsperado !== 'professor_metodo' && (
        <p className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-200">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Apontou professor / método, mas a saída não foi registrada assim.
        </p>
      )}

      <div className="space-y-2 border-l-2 border-violet-500/60 pl-3">
        {blocos.map((b, i) => (
          <div key={i}>
            <p className="whitespace-pre-wrap text-[13px] text-slate-200">{b.texto}</p>
            {(b.quando || b.tipo) && (
              <p className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-slate-500">
                {b.tipo === 'audio' ? <Mic className="h-3 w-3" /> : <MessageSquare className="h-3 w-3" />}
                {b.tipo === 'audio' ? 'áudio transcrito' : 'texto'}
                {b.quando && ` · ${formatarQuando(b.quando)}`}
              </p>
            )}
          </div>
        ))}
        {!resposta.revisada && (
          <p className="text-[10.5px] text-slate-500">
            Ainda não passou pela fila de revisão — texto como chegou.
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-700/60 pt-3">
        <span className="mr-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          Tema declarado
        </span>
        {TEMAS_EVASAO.map((tema) => (
          <button
            key={tema}
            type="button"
            aria-pressed={marcado === tema}
            onClick={() => onMarcar(resposta.pesquisa_id, tema, marcado === tema)}
            className={cn(
              'rounded-full border px-3 py-1 text-[11.5px] transition-colors',
              marcado === tema
                ? 'border-violet-500 bg-violet-500 font-semibold text-white'
                : 'border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-500 hover:text-white',
            )}
          >
            {rotuloTema(tema)}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Data do bloco vem ISO em UTC; exibir cru mostraria `2026-08-03T14:41:28.000Z`. */
function formatarQuando(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return format(d, "dd/MM 'às' HH:mm", { locale: ptBR });
}

function Kpi({ rotulo, valor, destaque, rodape }: {
  rotulo: string; valor: string; destaque?: string; rodape?: string;
}) {
  return (
    <div className="bg-slate-900 px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">{rotulo}</p>
      <p className={cn('text-2xl font-semibold leading-tight tabular-nums', destaque)}>{valor}</p>
      {rodape && <p className="text-[10.5px] text-slate-500">{rodape}</p>}
    </div>
  );
}

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2.5 rounded-lg border border-amber-500/35 bg-amber-500/10 px-3.5 py-2.5 text-[12.5px] text-amber-100">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
      <span>{children}</span>
    </p>
  );
}

function Verbete({ cor, children }: { cor: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className={cn('h-2.5 w-2.5 rounded-sm', cor)} />
      {children}
    </span>
  );
}

function Etiqueta({ tom, children }: {
  tom: 'neutro' | 'verde' | 'ambar' | 'violeta';
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'rounded border px-2 py-0.5 text-[10.5px] font-semibold',
        tom === 'neutro' && 'border-slate-600 bg-slate-900 text-slate-300',
        tom === 'verde' && 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300',
        tom === 'ambar' && 'border-amber-500/50 bg-amber-500/10 text-amber-300',
        tom === 'violeta' && 'border-violet-500/50 bg-violet-500/10 text-violet-300',
      )}
    >
      {children}
    </span>
  );
}
