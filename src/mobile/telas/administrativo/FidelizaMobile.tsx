import { useMemo, useState } from 'react';
import { Trophy } from 'lucide-react';
import {
  duplaDaUnidade,
  formatarMeta,
  formatarValorMetrica,
  lerMetricas,
  ordenarPodio,
  posicaoNaTrilha,
  rotuloExperiencia,
  textoDoQueFalta,
  type ConfigLike,
  type FarmerLike,
  type LeituraMetrica,
} from '@/lib/fidelizaMobile';
import { cn } from '@/lib/utils';

/**
 * O Fideliza+ no celular: a SUA dupla primeiro, a comparação no pódio.
 *
 * 🔴 O que a medição de 25/09/2026 mostrou, e que corrigiu a proposta inicial:
 * o desktop **já bifurca**. `isSuperAdmin = isAdmin && sem unidade` — quem
 * escolhe uma unidade cai numa visão centrada na própria dupla, que a 390px
 * mede **2.751px, sem rolagem lateral e sem nada truncado**. Quem abre no
 * Consolidado cai na MATRIZ métrica × dupla, e é ela que custa **4.198px**,
 * com 1.609px só no Comparativo Detalhado.
 *
 * Ou seja: a inversão de eixo não precisava ser inventada — precisava valer
 * para os dois ramos. Esta tela é a mesma nos dois: o pódio em três linhas e
 * UMA dupla aberta. No Consolidado, como não existe "a minha", quem escolhe é
 * o toque.
 *
 * ⚠️ **Não busca nada e não calcula placar.** Recebe `farmers` e `config` já
 * prontos do `useFidelizaPrograma` (que roda `calcularPontuacao`), e as
 * regras de leitura moram em `@/lib/fidelizaMobile`. Reimplementar pontos
 * daria duas respostas para "quantos pontos a dupla tem".
 *
 * ⚠️ O que a tela pequena diz e a grande não: **quanto falta**. O desktop
 * escreve "Atencao: inadimplencia acima da meta"; aqui a mesma linha diz
 * "faltam 2,0 pontos". É o mesmo tipo de ganho de `colisoesDeSala` na Agenda.
 */

interface Props {
  farmers: FarmerLike[];
  config: ConfigLike & { nota_corte?: number };
  /** A unidade escolhida no shell. `null`/'todos' = Consolidado. */
  unidadeSelecionada?: string | null;
  /** "Q3 - Julho, Agosto e Setembro". */
  periodoLabel: string;
  ano: number;
}

const MEDALHAS = ['🥇', '🥈', '🥉'];

export function FidelizaMobile({
  farmers,
  config,
  unidadeSelecionada,
  periodoLabel,
  ano,
}: Props) {
  const podio = useMemo(() => ordenarPodio(farmers), [farmers]);

  const unidade = unidadeSelecionada && unidadeSelecionada !== 'todos' ? unidadeSelecionada : null;
  const daUnidade = useMemo(() => duplaDaUnidade(podio, unidade), [podio, unidade]);

  // No Consolidado não existe "a minha dupla" — quem escolhe é o toque, e a
  // primeira colocada abre por padrão só porque alguma precisa abrir.
  const [escolhida, setEscolhida] = useState<string | null>(null);
  const aberta =
    daUnidade ?? podio.find((f) => f.unidade_id === escolhida) ?? podio[0] ?? null;

  const notaCorte = config.nota_corte ?? 60;

  if (podio.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-slate-500">
        Nenhuma dupla com dados neste trimestre.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-4">
      <header className="flex flex-col gap-1">
        <h2 className="flex items-center gap-2 text-base font-bold text-white">
          <Trophy className="h-4 w-4 text-yellow-400" />
          Fideliza+ {ano}
        </h2>
        <p className="text-xs text-slate-400">{periodoLabel}</p>
      </header>

      {/* ── O pódio em três linhas ───────────────────────────────────────────
          Substitui os 891px de cards empilhados do desktop. A comparação que
          a matriz fazia em 1.609px cabe aqui, porque comparar três duplas é
          comparar três números.

          🔴 **Só existe com DUAS ou mais duplas na lista.** Com unidade
          escolhida a RPC devolve apenas aquela (medido: Barra sozinha), e uma
          linha única com 🥇 afirmaria que ela é a primeira colocada — a Barra
          tem 52 pontos contra 66 do Recreio. A medalha vem do índice no
          array, então sem as outras não há posição a exibir, e inventar uma é
          pior do que não mostrar. Quem quiser a comparação troca para o
          Consolidado, onde as três chegam. */}
      {podio.length > 1 && (
      <section className="flex flex-col gap-1.5">
        {podio.map((f, i) => {
          const ehAberta = aberta?.unidade_id === f.unidade_id;
          const ehSua = daUnidade?.unidade_id === f.unidade_id;
          const pontos = f.pontuacao?.total ?? 0;
          return (
            <button
              key={f.unidade_id}
              type="button"
              onClick={() => setEscolhida(f.unidade_id)}
              // ⚠️ No Consolidado a linha é o seletor; com unidade escolhida
              // ela é leitura, e trocar de dupla é trocar de unidade no shell.
              disabled={Boolean(daUnidade)}
              className={cn(
                'flex min-h-[44px] items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors',
                ehAberta
                  ? 'border-cyan-500/45 bg-cyan-500/[0.06]'
                  : 'border-slate-800 bg-slate-900',
                !daUnidade && !ehAberta && 'active:bg-slate-800',
              )}
            >
              {/* ⚠️ `w-6`, não `w-5`: medido, o emoji de medalha ocupa 22px e
                  num contêiner de 20px ele corta 2px de um lado. */}
              <span className="w-6 shrink-0 text-center text-base leading-none">
                {MEDALHAS[i] ?? '·'}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-[12.5px] font-semibold text-slate-50">
                    {f.farmers.apelidos}
                  </span>
                  {ehSua && (
                    <span className="shrink-0 rounded-full bg-cyan-500/15 px-1.5 py-px text-[8.5px] font-bold uppercase tracking-wider text-cyan-300">
                      Você
                    </span>
                  )}
                </span>
                <span className="block truncate text-[10.5px] text-slate-400">
                  {f.unidade_nome ?? ''}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-[17px] font-bold leading-none tabular-nums text-slate-50">
                  {pontos}
                </span>
                <span className="block text-[9px] text-slate-500">pts</span>
              </span>
            </button>
          );
        })}
      </section>
      )}

      {aberta && (
        <BlocoDaDupla
          farmer={aberta}
          config={config}
          notaCorte={notaCorte}
          ehSua={Boolean(daUnidade)}
        />
      )}

      {/* ── O que fica no computador ──────────────────────────────────────────
          Dito por escrito, não omitido em silêncio: das três sub-abas, só
          Ranking foi adaptada. Histórico trimestral fica de fora porque
          `programa_fideliza_historico` está VAZIA (medido: 0 linhas nas três
          unidades) — a tabela do desktop mostra quatro linhas de traço e uma
          "média anual" que repete o único trimestre vivo. */}
      <p className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2.5 text-[11.5px] leading-relaxed text-slate-400">
        {podio.length > 1
          ? 'Histórico por trimestre, penalidades e as regras do programa ficam no computador.'
          : 'Só a sua unidade chega aqui — a comparação com as outras duplas fica no Consolidado. Histórico por trimestre, penalidades e as regras do programa ficam no computador.'}
      </p>
    </div>
  );
}

function BlocoDaDupla({
  farmer,
  config,
  notaCorte,
  ehSua,
}: {
  farmer: FarmerLike;
  config: ConfigLike;
  notaCorte: number;
  ehSua: boolean;
}) {
  const leituras = useMemo(() => lerMetricas(farmer, config), [farmer, config]);
  const pontos = farmer.pontuacao?.total ?? 0;
  const bateuCorte = pontos >= notaCorte;
  const experiencia = rotuloExperiencia(farmer.experiencia_tipo);
  const faltando = leituras.filter((l) => !l.bateu).length;

  return (
    <section
      className={cn(
        'rounded-xl border p-3',
        bateuCorte ? 'border-emerald-500/30 bg-emerald-500/[0.05]' : 'border-slate-800 bg-slate-900',
      )}
    >
      <header className="mb-1 flex items-baseline justify-between gap-2">
        <h3 className="truncate text-[13px] font-semibold text-slate-50">
          {ehSua ? `Olá, ${farmer.farmers.apelidos}!` : farmer.farmers.apelidos}
        </h3>
        <span
          className={cn(
            'shrink-0 text-2xl font-bold leading-none tabular-nums',
            bateuCorte ? 'text-emerald-400' : 'text-amber-400',
          )}
        >
          {pontos}
          <span className="ml-1 text-[10px] font-medium text-slate-500">pts</span>
        </span>
      </header>

      {/* A linha que responde "o que falta" de uma vez, antes das cinco. */}
      <p className="mb-2 text-[11px] text-slate-400">
        {faltando === 0
          ? 'As cinco metas batidas.'
          : `${faltando} de 5 metas ainda não batidas · corte em ${notaCorte} pts`}
        {experiencia ? ` · ${experiencia}` : ''}
      </p>

      <div className="flex flex-col">
        {leituras.map((l) => (
          <LinhaMetrica key={l.chave} leitura={l} />
        ))}
      </div>

      {(farmer.pontuacao?.bonus ?? 0) > 0 || (farmer.pontuacao?.penalidades ?? 0) > 0 ? (
        <p className="mt-2 border-t border-slate-800 pt-2 text-[10.5px] text-slate-500">
          {(farmer.pontuacao?.bonus ?? 0) > 0 && `+${farmer.pontuacao?.bonus} de bônus`}
          {(farmer.pontuacao?.bonus ?? 0) > 0 && (farmer.pontuacao?.penalidades ?? 0) > 0 && ' · '}
          {(farmer.pontuacao?.penalidades ?? 0) > 0 &&
            `−${farmer.pontuacao?.penalidades} de penalidades`}
        </p>
      ) : null}
    </section>
  );
}

function LinhaMetrica({ leitura }: { leitura: LeituraMetrica }) {
  const { preenchidoPct, marcaPct } = posicaoNaTrilha(leitura.valor, leitura.meta);
  const falta = textoDoQueFalta(leitura);

  return (
    <div className="border-b border-slate-800 py-2 last:border-b-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate text-[12px] text-slate-200">{leitura.rotulo}</span>
        <span
          className={cn(
            'shrink-0 text-[13px] font-bold tabular-nums',
            leitura.bateu ? 'text-emerald-400' : 'text-amber-400',
          )}
        >
          {formatarValorMetrica(leitura.valor, leitura.formato)}
        </span>
      </div>

      {/* A trilha mostra o VALOR na escala e carrega a marca da meta. Um
          "percentual da meta" mentiria nas métricas de baixar: churn 0% é o
          melhor resultado possível e daria barra vazia. */}
      <div className="relative mt-1.5 h-[5px] overflow-hidden rounded-full bg-slate-800">
        <div
          className={cn(
            'absolute inset-y-0 left-0 rounded-full',
            leitura.bateu ? 'bg-emerald-500' : 'bg-amber-500',
          )}
          style={{ width: `${preenchidoPct}%` }}
        />
        <div
          className="absolute -top-px -bottom-px w-0.5 bg-slate-400"
          style={{ left: `${marcaPct}%` }}
          aria-hidden
        />
      </div>

      <div className="mt-1 flex justify-between gap-2 text-[10px]">
        <span className="text-slate-500">
          Meta {formatarMeta(leitura)}
          {leitura.pontos > 0 ? (
            <span className="ml-1.5 text-emerald-400">+{leitura.pontos} pts</span>
          ) : (
            <span className="ml-1.5 text-slate-600">vale {leitura.pontosPossiveis} pts</span>
          )}
        </span>
        {falta && <span className="shrink-0 text-amber-400/90">{falta}</span>}
      </div>
    </div>
  );
}
