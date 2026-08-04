import { useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AlertTriangle, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { UnidadeId } from '@/components/ui/UnidadeFilter';
import { cn } from '@/lib/utils';
import {
  MIN_RESPOSTAS_SEM_AVISO,
  nivelDeConfianca,
  resumirRespostas,
  separarBlocosResposta,
} from '@/lib/pesquisaEvasao';
import type {
  PesquisaEvasaoCategoria,
  PesquisaEvasaoRelacaoMotivo,
} from './pesquisaEvasao.types';
import {
  useRespostasEvasao,
  type PesquisaEvasaoEstadoOperacional,
  type RespostaEvasaoLinha,
} from './hooks/useRespostasEvasao';
import { ConversaPesquisaEvasao } from './ConversaPesquisaEvasao';

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const rotulosCategoria: Record<PesquisaEvasaoCategoria, string> = {
  financeiro: 'Financeiro',
  tempo_horario: 'Tempo / horário',
  saude: 'Saúde',
  desanimo: 'Desânimo',
  pedagogico_professor: 'Pedagógico / professor',
  atendimento_experiencia: 'Atendimento / experiência',
  mudanca_endereco: 'Mudança de endereço',
  familia_estudos_trabalho: 'Família / estudos / trabalho',
  outro: 'Outro',
  inconclusivo: 'Inconclusivo',
  resposta_invalida: 'Resposta inválida',
};

const rotulosRelacao: Record<PesquisaEvasaoRelacaoMotivo, string> = {
  confirmou: 'Confirmou',
  confirmou_parcialmente: 'Confirmou parcialmente',
  complementou: 'Complementou',
  divergiu: 'Divergiu',
  sem_motivo_anterior: 'Não havia motivo anterior',
  inconclusivo: 'Inconclusivo',
  invalido: 'Inválido',
};

const rotulosEstado: Record<PesquisaEvasaoEstadoOperacional, string> = {
  aguardando_revisao_textual: 'Aguardando revisão textual',
  aguardando_classificacao: 'Aguardando classificação',
  acao_pendente: 'Ação pendente',
  em_acompanhamento: 'Em acompanhamento',
  encerrado: 'Encerrado',
};

const estados = Object.keys(rotulosEstado) as PesquisaEvasaoEstadoOperacional[];

interface Props {
  unidadeAtual: UnidadeId;
}

export function RespostasEvasaoTab({ unidadeAtual }: Props) {
  const hoje = new Date();
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes, setMes] = useState<number | null>(null);
  const [estado, setEstado] = useState<'todos' | PesquisaEvasaoEstadoOperacional>('todos');
  const [aberta, setAberta] = useState<string | null>(null);
  const { respostas, carregando, erro, recarregar } = useRespostasEvasao(unidadeAtual, ano, mes);

  const resumo = useMemo(() => resumirRespostas(respostas), [respostas]);
  const filtradas = useMemo(() => estado === 'todos'
    ? respostas
    : respostas.filter((resposta) => resposta.estado_operacional === estado),
  [estado, respostas]);
  const confianca = nivelDeConfianca(resumo.classificadasVigentes);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={mes === null ? 'todos' : String(mes)} onValueChange={(valor) => setMes(valor === 'todos' ? null : Number(valor))}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Ano inteiro</SelectItem>
            {MESES.map((nome, indice) => <SelectItem key={nome} value={String(indice + 1)}>{nome}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={String(ano)} onValueChange={(valor) => setAno(Number(valor))}>
          <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="2025">2025</SelectItem>
            <SelectItem value="2026">2026</SelectItem>
          </SelectContent>
        </Select>
        <Select value={estado} onValueChange={(valor) => setEstado(valor as typeof estado)}>
          <SelectTrigger className="w-[230px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os estados</SelectItem>
            {estados.map((item) => <SelectItem key={item} value={item}>{rotulosEstado[item]}</SelectItem>)}
          </SelectContent>
        </Select>
        <p className="text-xs text-slate-500">
          Período por <strong>data da saída</strong>. Testes não entram.
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
          <p className="text-sm text-slate-300">Nenhuma resposta produtiva no período.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-slate-700/60 bg-slate-700/60 sm:grid-cols-5">
            <Kpi rotulo="Respostas" valor={resumo.total} />
            <Kpi rotulo="Classificadas" valor={resumo.classificadasVigentes} />
            <Kpi rotulo="A classificar" valor={resumo.pendentesClassificacao} />
            <Kpi rotulo="Ação pendente" valor={resumo.acoesPendentes} />
            <Kpi rotulo="Encerradas" valor={resumo.encerradas} />
          </div>

          <Aviso>
            <strong>Amostra: {resumo.classificadasVigentes} classificações vigentes.</strong>{' '}
            {confianca === 'estavel'
              ? 'A leitura já possui base mais estável.'
              : `Até ${MIN_RESPOSTAS_SEM_AVISO - 1}, trate os percentuais como indicativos e leia as respostas.`}
          </Aviso>

          <div className="grid gap-4 lg:grid-cols-2">
            <Distribuicao
              titulo="Causas relatadas"
              subtitulo="Uma resposta pode ter mais de uma causa; os percentuais podem somar mais de 100%."
              linhas={resumo.categorias.map((item) => ({
                chave: item.categoria,
                rotulo: rotulosCategoria[item.categoria],
                total: item.total,
                percentual: item.percentual,
              }))}
              vazio="Ainda não há causas classificadas."
            />
            <Distribuicao
              titulo="Relação com o motivo registrado"
              subtitulo="Compara o registro do atendimento com a resposta revisada da família."
              linhas={resumo.relacoes.map((item) => ({
                chave: item.relacao,
                rotulo: rotulosRelacao[item.relacao],
                total: item.total,
                percentual: item.percentual,
              }))}
              vazio="Ainda não há relações classificadas."
            />
          </div>

          <div className="space-y-3">
            <p className="text-xs text-slate-500">
              {filtradas.length} de {respostas.length} caso(s) no filtro atual.
            </p>
            {filtradas.map((resposta) => (
              <CartaoResposta
                key={resposta.pesquisa_id}
                resposta={resposta}
                aberto={aberta === resposta.pesquisa_id}
                onAlternar={() => setAberta((atual) => atual === resposta.pesquisa_id ? null : resposta.pesquisa_id)}
                onAlteracao={recarregar}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function CartaoResposta({
  resposta,
  aberto,
  onAlternar,
  onAlteracao,
}: {
  resposta: RespostaEvasaoLinha;
  aberto: boolean;
  onAlternar: () => void;
  onAlteracao: () => void;
}) {
  const blocos = separarBlocosResposta(resposta.resposta_texto);
  const contexto = [
    resposta.aluno_curso,
    resposta.aluno_professor,
    resposta.unidade_nome,
    resposta.tempo_permanencia_meses != null ? `${resposta.tempo_permanencia_meses} meses` : null,
    `saiu em ${format(parseISO(resposta.data_evasao), 'dd/MM', { locale: ptBR })}`,
  ].filter(Boolean).join(' · ');

  return (
    <article className="rounded-xl border border-slate-700/60 bg-slate-800/40 p-4">
      <button type="button" onClick={onAlternar} className="flex w-full items-start gap-3 text-left">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-white">{resposta.aluno_nome}</p>
          <p className="text-[11.5px] text-slate-500">{contexto}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Etiqueta>{rotulosEstado[resposta.estado_operacional]}</Etiqueta>
            <Etiqueta>registrado: {resposta.motivo_cadastrado || 'sem motivo'}</Etiqueta>
            {resposta.classificacao_desatualizada && <Etiqueta tom="ambar">conteúdo novo</Etiqueta>}
            {resposta.categorias.map((categoria) => (
              <Etiqueta key={categoria} tom="violeta">{rotulosCategoria[categoria]}</Etiqueta>
            ))}
          </div>
        </div>
        {aberto ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
      </button>

      {!aberto && blocos[0] && (
        <p className="mt-3 line-clamp-2 border-l-2 border-violet-500/60 pl-3 text-sm text-slate-300">
          {blocos[0].texto}
        </p>
      )}

      {aberto && (
        <div className="mt-4 border-t border-slate-700/60 pt-4">
          <ConversaPesquisaEvasao pesquisaId={resposta.pesquisa_id} onAlteracao={onAlteracao} />
        </div>
      )}
    </article>
  );
}

function Distribuicao({ titulo, subtitulo, linhas, vazio }: {
  titulo: string;
  subtitulo: string;
  linhas: Array<{ chave: string; rotulo: string; total: number; percentual: number }>;
  vazio: string;
}) {
  return (
    <section className="rounded-xl border border-slate-700/60 bg-slate-800/40 p-4">
      <h3 className="text-sm font-semibold text-white">{titulo}</h3>
      <p className="mt-1 text-xs text-slate-500">{subtitulo}</p>
      {linhas.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">{vazio}</p>
      ) : (
        <div className="mt-4 space-y-3">
          {linhas.map((linha) => (
            <div key={linha.chave}>
              <div className="mb-1 flex justify-between gap-3 text-xs">
                <span className="text-slate-300">{linha.rotulo}</span>
                <span className="tabular-nums text-slate-500">{linha.total} · {linha.percentual}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-900">
                <div className="h-full rounded-full bg-violet-500" style={{ width: `${Math.min(linha.percentual, 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Kpi({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <div className="bg-slate-900 px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">{rotulo}</p>
      <p className="text-2xl font-semibold tabular-nums text-white">{valor}</p>
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

function Etiqueta({ children, tom = 'neutro' }: {
  children: React.ReactNode;
  tom?: 'neutro' | 'ambar' | 'violeta';
}) {
  return (
    <span className={cn(
      'rounded border px-2 py-0.5 text-[10.5px] font-semibold',
      tom === 'neutro' && 'border-slate-600 bg-slate-900 text-slate-300',
      tom === 'ambar' && 'border-amber-500/50 bg-amber-500/10 text-amber-300',
      tom === 'violeta' && 'border-violet-500/50 bg-violet-500/10 text-violet-300',
    )}>
      {children}
    </span>
  );
}
