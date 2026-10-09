import { useMemo } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileText,
  LayoutList,
  Music,
  Users,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import {
  formatarDuracao,
  idadeHoje,
  resumirRelatorios,
  rotuloIdade,
  type Pendencia,
} from '@/lib/eventos';
import {
  RELATORIO_STATUS_LABEL,
  type EventoComResumo,
  type RelatorioDoProfessor,
} from '@/hooks/useEventos';
import { useRevisaoDoEvento } from './useRevisaoDoEvento';

type AbaDeDestino = 'alunos' | 'grade' | 'documentos';

/**
 * Revisao + resumo — LAPE-39, fase 5.
 *
 * Responde "o que falta para o recital fechar" num lugar so. Os sinais ja existiam espalhados
 * (o contador de quem participa e esta fora dos blocos, o selo vermelho de conflito no bloco);
 * aqui viram uma lista ordenada por gravidade, cada item dizendo ONDE se resolve.
 *
 * Os documentos (programacao, folha de palco, planilha, certificados) sairam daqui para a aba
 * Documentos em 08/10/2026 (reuniao do recital). A montagem dos dados e a mesma das duas abas:
 * `useRevisaoDoEvento`.
 */
export function RevisaoTab({
  evento,
  onIrPara,
}: {
  evento: EventoComResumo;
  onIrPara: (aba: AbaDeDestino) => void;
}) {
  const {
    blocos,
    relatorios,
    pendencias,
    resumo,
    impedimentos,
    carregando,
    carregandoRelatorios,
    erro,
    erroRelatorios,
  } = useRevisaoDoEvento(evento);

  // A idade da lista de relatorios sai da GRADE (quem ja tem apresentacao): o relatorio do
  // professor nao carrega a data de nascimento.
  const nascimentoPorApresentacao = useMemo(
    () =>
      new Map(
        blocos.flatMap((b) => b.apresentacoes.map((a) => [a.id, a.aluno_data_nascimento] as const)),
      ),
    [blocos],
  );

  if (erro) {
    return (
      <p className="rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-[13px] text-rose-200">
        Não foi possível carregar a revisão: {erro}
      </p>
    );
  }

  if (carregando) {
    return <p className="p-8 text-center text-sm text-slate-400">Carregando revisão…</p>;
  }


  return (
    <div className="space-y-4">
      {/* ── resumo ── */}
      <section className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Cartao icone={<Users className="h-4 w-4" />} rotulo="Participantes" valor={resumo.participantes} />
        <Cartao icone={<Music className="h-4 w-4" />} rotulo="Apresentações" valor={resumo.apresentacoes} />
        <Cartao icone={<LayoutList className="h-4 w-4" />} rotulo="Blocos" valor={resumo.blocos} />
        <Cartao
          icone={<Clock className="h-4 w-4" />}
          rotulo="Duração prevista"
          valor={resumo.duracaoTotalSegundos > 0 ? formatarDuracao(resumo.duracaoTotalSegundos) : '—'}
          rodape={
            resumo.inicio && resumo.terminoPrevisto
              ? `${resumo.inicio} às ${resumo.terminoPrevisto}`
              : 'nenhum bloco montado'
          }
        />
      </section>

      {/* ⚠️ A ressalva anda junto do número, nunca num tooltip: hora de término anunciada
          sem dizer de que ela depende vira promessa para os pais na porta do teatro. */}
      {resumo.semDuracaoPropria > 0 && resumo.apresentacoes > 0 && (
        <p className="text-[12px] sm:text-[11.5px] text-slate-500">
          O término é estimativa:{' '}
          <strong className="text-slate-400">
            {resumo.semDuracaoPropria} de {resumo.apresentacoes}
          </strong>{' '}
          {resumo.semDuracaoPropria === 1 ? 'apresentação ainda usa' : 'apresentações ainda usam'} a
          duração padrão de {formatarDuracao(evento.duracao_padrao_segundos)}, em vez de uma
          duração medida.
        </p>
      )}

      {/* ── relatórios do LA Teacher ── */}
      <section className="rounded-xl border border-slate-700 bg-slate-800/40 p-3">
        <h3 className="flex items-center gap-1.5 text-[12px] sm:text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          <ClipboardList className="h-3.5 w-3.5" />
          Relatórios dos professores
        </h3>
        {carregandoRelatorios && relatorios.length === 0 ? (
          <p className="mt-2 text-[12.5px] text-slate-500">Carregando o canal do professor…</p>
        ) : erroRelatorios ? (
          <p className="mt-2 text-[12.5px] text-rose-300">
            Não consegui ler os relatórios do LA Teacher: {erroRelatorios}
          </p>
        ) : relatorios.length === 0 && resumo.apresentacoes === 0 ? (
          <p className="mt-2 text-[12.5px] text-slate-500">
            Nenhum relatório lançado ainda — e nenhum bloco tem apresentação. Os professores lançam
            música e palco no LA Teacher; o que eles escrevem chega aqui na sincronização.
          </p>
        ) : (
          <PainelRelatorios
            relatorios={relatorios}
            apresentacoesNaGrade={resumo.apresentacoes}
            nascimentoPorApresentacao={nascimentoPorApresentacao}
          />
        )}
      </section>

      {/* ── atalho para a aba Documentos ── */}
      <button
        type="button"
        onClick={() => onIrPara('documentos')}
        className="group flex w-full items-center gap-3 rounded-xl border border-slate-700 bg-slate-800/40 p-3 text-left transition-colors hover:border-amber-500/40 hover:bg-slate-800/70"
      >
        <FileText className="h-4 w-4 shrink-0 text-amber-400" />
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-medium text-white">Documentos para imprimir</span>
          <span className="block text-[12px] text-slate-500">
            Programação, folha de palco, planilha e certificados ficam na aba Documentos.
            {impedimentos.length > 0 &&
              ` ${impedimentos.length === 1 ? '1 pendência abaixo sai errada' : `${impedimentos.length} pendências abaixo saem erradas`} no papel.`}
          </span>
        </span>
        <ArrowRight className="h-4 w-4 shrink-0 text-slate-500 transition-transform group-hover:translate-x-0.5" />
      </button>

      {/* ── pendências ── */}
      {pendencias.length === 0 ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
          <p className="flex items-center gap-2 text-[13px] text-emerald-200">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
            Nada a apontar nos blocos.
          </p>
          {/* "Nada a apontar" ≠ "está tudo certo": a revisão só enxerga o que o sistema
              sabe. Dizer o contrário daria uma garantia que ninguém aqui pode dar. */}
          <p className="mt-1 pl-6 text-[12px] sm:text-[11.5px] text-emerald-200/70">
            A revisão confere participação, alocação, música, horário e blocos vazios — não
            substitui conferir o ensaio e o repertório com os professores.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[12px] sm:text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              {pendencias.length} {pendencias.length === 1 ? 'pendência' : 'pendências'}
            </h3>
            {impedimentos.length > 0 && (
              <span className="rounded bg-rose-500/15 px-1.5 py-0.5 text-[12px] sm:text-[11px] text-rose-300">
                {impedimentos.length} {impedimentos.length === 1 ? 'impede' : 'impedem'} a impressão
              </span>
            )}
          </div>

          <div className="space-y-2">
            {pendencias.map((p) => (
              <CartaoPendencia key={p.tipo} pendencia={p} onIrPara={onIrPara} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * O funil do canal professor: quantos relatórios o recital espera (= apresentações na
 * grade), quantos vieram, quantos já têm música lançada e em que pé está a aprovação.
 * Quem lançou para aluno fora da grade vira pendência mais abaixo, com nome.
 */
function PainelRelatorios({
  relatorios,
  apresentacoesNaGrade,
  nascimentoPorApresentacao,
}: {
  relatorios: RelatorioDoProfessor[];
  apresentacoesNaGrade: number;
  /** Data de nascimento por apresentacao da grade — de onde sai a idade da lista. */
  nascimentoPorApresentacao: Map<number, string | null>;
}) {
  const r = resumirRelatorios(relatorios, apresentacoesNaGrade);

  // A fila de trabalho: quem ainda nao foi aprovado, com o que falta. Aprovado sai da
  // lista — o papel dele e parar de ocupar a tela.
  const pendentes = relatorios
    .filter((x) => x.relatorio_status !== 'aprovado')
    .sort((a, b) => (a.aluno_nome ?? '').localeCompare(b.aluno_nome ?? '', 'pt-BR'));

  return (
    <div className="mt-2 space-y-2.5">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]">
        <span className="text-slate-300">
          <strong className="tabular-nums text-white">{r.musica_lancada}</strong> de{' '}
          <strong className="tabular-nums text-white">{r.esperados}</strong> músicas lançadas
        </span>
        <span className="text-slate-300">
          <strong className="tabular-nums text-emerald-300">{r.aprovados}</strong> aprovados
        </span>
        <span className="text-slate-300">
          <strong className="tabular-nums text-sky-300">{r.enviados}</strong> enviados
        </span>
        {r.devolvidos > 0 && (
          <span className="text-slate-300">
            <strong className="tabular-nums text-amber-300">{r.devolvidos}</strong> devolvidos
          </span>
        )}
        {r.sem_apresentacao > 0 && (
          <span className="text-slate-300">
            <strong className="tabular-nums text-rose-300">{r.sem_apresentacao}</strong> fora dos blocos
          </span>
        )}
      </div>

      {pendentes.length > 0 && (
        <ul className="max-h-56 space-y-0.5 overflow-y-auto pr-1">
          {pendentes.map((p) => (
            <li
              key={p.relatorio_id}
              className="flex flex-wrap items-center gap-x-2 text-[12px]"
            >
              <span className="min-w-0 truncate text-slate-200">{p.aluno_nome ?? '—'}</span>
              {p.apresentacao_id !== null &&
                rotuloIdade(idadeHoje(nascimentoPorApresentacao.get(p.apresentacao_id))) && (
                  <span className="text-slate-500">
                    {rotuloIdade(idadeHoje(nascimentoPorApresentacao.get(p.apresentacao_id)))}
                  </span>
                )}
              <span className="text-slate-500">{p.curso}</span>
              {p.professor_nome && (
                <span className="text-slate-600">Prof. {p.professor_nome}</span>
              )}
              <span
                className={cn(
                  'rounded px-1.5 py-px text-[12px] sm:text-[10.5px]',
                  p.apresentacao_id === null
                    ? 'bg-rose-500/15 text-rose-300'
                    : !p.musica_lancada
                      ? 'bg-slate-700/70 text-slate-400'
                      : 'bg-sky-500/15 text-sky-300',
                )}
              >
                {p.apresentacao_id === null
                  ? 'sem apresentação nos blocos'
                  : !p.musica_lancada
                    ? 'sem música lançada'
                    : (RELATORIO_STATUS_LABEL[p.relatorio_status] ?? p.relatorio_status)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Cartao({
  icone,
  rotulo,
  valor,
  rodape,
}: {
  icone: React.ReactNode;
  rotulo: string;
  valor: number | string;
  rodape?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-3">
      <p className="flex items-center gap-1.5 text-[12px] sm:text-[11px] uppercase tracking-wide text-slate-500">
        {icone}
        {rotulo}
      </p>
      <p className="mt-1 text-[20px] font-semibold tabular-nums text-white">{valor}</p>
      {rodape && <p className="text-[12px] sm:text-[11px] text-slate-500">{rodape}</p>}
    </div>
  );
}

function CartaoPendencia({
  pendencia,
  onIrPara,
}: {
  pendencia: Pendencia;
  onIrPara: (aba: AbaDeDestino) => void;
}) {
  const impede = pendencia.gravidade === 'impede';
  // ⚠️ Estado é UM valor derivado da gravidade, não condições soltas: `cn()` usa twMerge e
  // a última classe conflitante vence — já pintou cartão contradizendo o próprio rótulo.
  const LIMITE_VISIVEL = 8;
  const visiveis = pendencia.itens.slice(0, LIMITE_VISIVEL);
  const ocultos = pendencia.itens.length - visiveis.length;

  return (
    <section
      className={cn(
        'rounded-xl border p-3',
        impede ? 'border-rose-500/40 bg-rose-500/5' : 'border-slate-700 bg-slate-800/40',
      )}
    >
      <div className="flex flex-wrap items-start gap-2">
        <AlertTriangle
          className={cn('mt-0.5 h-4 w-4 shrink-0', impede ? 'text-rose-400' : 'text-amber-400')}
        />
        <div className="min-w-0 flex-1">
          <p className={cn('text-[13px] font-medium', impede ? 'text-rose-200' : 'text-white')}>
            {pendencia.titulo}
          </p>
          <p className="mt-0.5 text-[12px] text-slate-400">{pendencia.detalhe}</p>
        </div>
        <button
          type="button"
          onClick={() => onIrPara(pendencia.onde)}
          // Celular: desce para a linha de baixo em largura cheia — ao lado, espremia o título.
          className="order-last flex min-h-[44px] w-full shrink-0 items-center justify-center gap-1 rounded-lg bg-slate-700/60 px-2 py-1 text-[13px] text-slate-200 transition-colors hover:bg-slate-700 sm:order-none sm:min-h-0 sm:w-auto sm:rounded sm:text-[11.5px]"
        >
          Resolver em {pendencia.onde === 'alunos' ? 'Alunos' : 'Blocos'}
          <ArrowRight className="h-3 w-3" />
        </button>
      </div>

      <ul className="mt-2 space-y-0.5 pl-6">
        {visiveis.map((item) => (
          <li key={item} className="text-[12px] text-slate-300">
            {item}
          </li>
        ))}
        {ocultos > 0 && (
          // Corta a lista, mas nunca esconde o TAMANHO dela — o número já está no título.
          <li className="text-[12px] sm:text-[11.5px] italic text-slate-500">
            e mais {ocultos} {ocultos === 1 ? 'caso' : 'casos'}
          </li>
        )}
      </ul>
    </section>
  );
}
