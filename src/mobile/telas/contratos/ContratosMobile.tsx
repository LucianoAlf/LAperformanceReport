import { MessageCircle, PhoneOff, Search, AlertTriangle, UserX, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { abreviarNome } from '@/lib/nomeExibicao.mjs';
import {
  agruparPorUrgencia,
  contatoDeRenovacao,
  diasParaVencer,
  rotuloFaturasVencidas,
  sinaisDoContrato,
  type ContratoLike,
  type CriterioVencimento,
  type FaixaUrgencia,
} from '@/lib/contratosMobile';

/**
 * Aba CONTRATOS no celular (LAPE-32).
 *
 * A tabela do computador tem nove colunas e ordenacao livre — ela responde
 * "quais contratos vencem na janela X". No balcao a pergunta e "quem eu chamo
 * para renovar, e em que ordem", entao o eixo aqui e a URGENCIA: blocos da mais
 * alta para a mais baixa, do mesmo jeito que a Agenda usa a hora como ordem.
 *
 * ⚠️ Esta tela nao busca nada. Recebe a lista ja carregada e os controles por
 * props; toda regra testavel mora em `@/lib/contratosMobile`.
 */

type Recorte = 'mes' | 30 | 60 | 90 | 'sem_fatura';

interface Props {
  contratos: readonly ContratoLike[];
  criterio: CriterioVencimento;
  onCriterio: (c: CriterioVencimento) => void;
  recorte: Recorte;
  onRecorte: (r: Recorte) => void;
  faltamNaCompetencia: number;
  busca: string;
  onBusca: (v: string) => void;
  loading: boolean;
  erro: string | null;
  mostrarUnidade: boolean;
}

/** Cor do cabecalho de bloco por urgencia. Vermelho SO no que ja venceu. */
const COR_FAIXA: Record<FaixaUrgencia, string> = {
  vencido: 'text-rose-400',
  esta_semana: 'text-amber-400',
  duas_semanas: 'text-slate-300',
  este_mes: 'text-slate-400',
  depois: 'text-slate-500',
  sem_data: 'text-slate-500',
};

function formatarData(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [ano, mes, dia] = iso.slice(0, 10).split('-');
  return dia && mes ? `${dia}/${mes}` : '—';
}

function LinhaContrato({ c, criterio, mostrarUnidade }: {
  c: ContratoLike;
  criterio: CriterioVencimento;
  mostrarUnidade: boolean;
}) {
  const contato = contatoDeRenovacao(c);
  const sinais = sinaisDoContrato(c);
  const faturas = rotuloFaturasVencidas(c);
  const dias = diasParaVencer(c, criterio);
  const dataVenc = criterio === 'fatura' ? c.venc_ultima_fatura : c.data_ultima_aula;
  const professor = (c.professor_nome ?? '').trim();

  return (
    <div className="flex w-full items-start gap-2 border-b border-slate-800/70 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-[15px] font-semibold leading-tight text-slate-100">
          {c.aluno_nome ?? <span className="text-slate-500">Sem cadastro local</span>}
        </p>
        <p className="truncate text-[12px] text-slate-400">
          {[c.curso_nome, professor ? abreviarNome(professor, 2) : ''].filter(Boolean).join(' · ') || '—'}
        </p>
        {/* ⚠️ A unidade tem linha propria em vez de entrar na de cima: medido a
            390px, curso (80px) + professor (86px) + unidade (51px) nao cabem nos
            257px uteis, e o que era cortado era sempre o fim — a unidade, que no
            Consolidado e justamente quem diz de qual equipe e o aluno. Fora do
            Consolidado ela nao aparece, entao ninguem paga altura por uma
            informacao constante. */}
        {mostrarUnidade && c.unidade_nome && (
          <p className="truncate text-[11px] text-slate-500">{c.unidade_nome}</p>
        )}

        {/* Sinal so acende em quem tem — se acendesse em toda linha viraria fundo. */}
        {(sinais.length > 0 || faturas) && (
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {sinais.includes('inadimplente') && (
              <span className="inline-flex items-center gap-1 rounded-md bg-rose-500/15 px-1.5 py-0.5 text-[10.5px] font-medium text-rose-300">
                <AlertTriangle className="h-3 w-3" />
                {faturas ?? 'Inadimplente'}
              </span>
            )}
            {sinais.includes('sem_cadastro_local') && (
              <span className="inline-flex items-center gap-1 rounded-md bg-slate-700/40 px-1.5 py-0.5 text-[10.5px] font-medium text-slate-300">
                <UserX className="h-3 w-3" />
                Sem cadastro
              </span>
            )}
            {sinais.includes('pagamento_a_vista') && (
              <span className="inline-flex items-center gap-1 rounded-md bg-cyan-500/15 px-1.5 py-0.5 text-[10.5px] font-medium text-cyan-300">
                <Wallet className="h-3 w-3" />
                À vista
              </span>
            )}
          </div>
        )}
      </div>

      <div className="shrink-0 text-right">
        <p className="text-[13px] font-semibold tabular-nums text-slate-200">{formatarData(dataVenc)}</p>
        <p className="text-[11px] tabular-nums text-slate-500">
          {dias !== null && dias >= 0 ? `em ${dias}d` : dias !== null ? `há ${-dias}d` : '—'}
        </p>
        {/* Aulas restantes vai como DADO, sem limiar: quantas contam como poucas
            nao foi medido, e inventar o corte afirmaria urgencia nao apurada. */}
        {typeof c.nr_aulas_futuras === 'number' && (
          <p className="text-[11px] tabular-nums text-slate-500">
            {c.nr_aulas_futuras} {c.nr_aulas_futuras === 1 ? 'aula' : 'aulas'}
          </p>
        )}
      </div>

      {/* 🔴 O que esta tela faz e a do computador nao: `telefone`/`whatsapp` ja
          chegam no tipo e a tabela do desktop descarta os dois. Aqui "quem eu
          chamo" vira um toque. */}
      {contato ? (
        <a
          href={contato.linkWhatsApp}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Falar com ${c.aluno_nome ?? 'o aluno'} no WhatsApp`}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-300 active:bg-emerald-500/25"
        >
          <MessageCircle className="h-5 w-5" />
        </a>
      ) : (
        <span
          title="Sem telefone utilizável no cadastro"
          aria-label="Sem telefone no cadastro"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-600"
        >
          <PhoneOff className="h-4 w-4" />
        </span>
      )}
    </div>
  );
}

export function ContratosMobile({
  contratos,
  criterio,
  onCriterio,
  recorte,
  onRecorte,
  faltamNaCompetencia,
  busca,
  onBusca,
  loading,
  erro,
  mostrarUnidade,
}: Props) {
  const blocos = agruparPorUrgencia(contratos, criterio);
  const semFatura = recorte === 'sem_fatura';

  return (
    <div>
      {/* Cabecalho grudado: numa lista longa, o recorte ativo sai de vista e a
          pessoa perde a referencia do que esta olhando.
          ⚠️ `top-0` gruda no topo do CONTEUDO, nao do padding do <main>; o
          pseudo-elemento cobre os 12px por onde as linhas passariam por cima. */}
      <div className="sticky top-0 z-20 -mx-3 bg-slate-950 px-3 pb-2 before:absolute before:inset-x-0 before:bottom-full before:h-3 before:bg-slate-950">
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide [mask-image:linear-gradient(to_right,black_calc(100%-16px),transparent)]">
          <button
            onClick={() => onRecorte('mes')}
            className={cn(
              'flex min-h-[44px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl px-3 text-[13px] font-medium',
              recorte === 'mes' ? 'bg-amber-500 text-slate-900' : 'bg-slate-800/60 text-slate-300',
            )}
          >
            Este mês
            {faltamNaCompetencia > 0 && (
              <span
                className={cn(
                  'rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums',
                  recorte === 'mes' ? 'bg-slate-900/25' : 'bg-amber-500/20 text-amber-300',
                )}
              >
                {faltamNaCompetencia}
              </span>
            )}
          </button>
          {([30, 60, 90] as const).map((d) => (
            <button
              key={d}
              onClick={() => onRecorte(d)}
              className={cn(
                'min-h-[44px] shrink-0 whitespace-nowrap rounded-xl px-3 text-[13px] font-medium',
                recorte === d ? 'bg-cyan-500 text-white' : 'bg-slate-800/60 text-slate-300',
              )}
            >
              {d} dias
            </button>
          ))}
          <button
            onClick={() => onRecorte('sem_fatura')}
            className={cn(
              'min-h-[44px] shrink-0 whitespace-nowrap rounded-xl px-3 text-[13px] font-medium',
              semFatura ? 'bg-rose-500 text-white' : 'bg-slate-800/60 text-slate-300',
            )}
          >
            Sem fatura
          </button>
        </div>

        {!semFatura && (
          <div className="mt-2 flex items-center gap-2">
            {/* O alternador e sobre QUANDO o contrato vence — os dois criterios
                devolvem listas diferentes de proposito (78% dos contratos tem a
                ultima aula e a ultima fatura em meses distintos). */}
            <div className="flex shrink-0 rounded-xl bg-slate-800/60 p-0.5">
              {(['aula', 'fatura'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => onCriterio(v)}
                  className={cn(
                    'min-h-[44px] rounded-lg px-3 text-[12px] font-medium',
                    criterio === v ? 'bg-cyan-500 text-white' : 'text-slate-300',
                  )}
                >
                  {v === 'aula' ? 'Aula' : 'Fatura'}
                </button>
              ))}
            </div>
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                value={busca}
                onChange={(e) => onBusca(e.target.value)}
                placeholder="Buscar aluno…"
                className="h-11 w-full rounded-xl bg-slate-800/60 pl-8 pr-3 text-[13px] text-slate-200 placeholder:text-slate-500"
              />
            </div>
          </div>
        )}
      </div>

      {erro && (
        <p className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-[13px] text-rose-300">
          Erro ao carregar: {erro}
        </p>
      )}

      {loading ? (
        <p className="mt-6 text-center text-[13px] text-slate-500">Carregando…</p>
      ) : blocos.length === 0 ? (
        <p className="mt-6 text-center text-[13px] text-slate-500">
          {busca
            ? `Nenhum aluno encontrado para "${busca}".`
            : recorte === 'mes'
              ? 'Nenhum contrato termina nesta competência sem renovação registrada.'
              : criterio === 'aula'
                ? `Nenhuma matrícula com AULAS acabando nos próximos ${recorte} dias.`
                : `Nenhuma matrícula com a última FATURA vencendo nos próximos ${recorte} dias.`}
        </p>
      ) : (
        <div className="mt-1">
          {blocos.map((bloco) => (
            <section key={bloco.faixa}>
              <h3
                className={cn(
                  'sticky top-[104px] z-10 -mx-3 bg-slate-950 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide',
                  COR_FAIXA[bloco.faixa],
                )}
              >
                {bloco.rotulo}
                <span className="ml-1.5 font-normal normal-case tracking-normal text-slate-600">
                  {bloco.itens.length === 1 ? '1 contrato' : `${bloco.itens.length} contratos`}
                </span>
              </h3>
              {bloco.itens.map((c) => (
                <LinhaContrato
                  key={`${c.unidade_id}-${c.emusys_matricula_disciplina_id}`}
                  c={c}
                  criterio={criterio}
                  mostrarUnidade={mostrarUnidade}
                />
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

export default ContratosMobile;
