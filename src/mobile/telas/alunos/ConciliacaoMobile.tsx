import { useMemo, useState } from 'react';
import { AlertTriangle, ChevronRight, Loader2, Lock } from 'lucide-react';

import { cn } from '@/lib/utils';
import { normalizarBusca } from '@/lib/agenda';
import {
  ATRIBUTO_TIPO_ROTULO,
  EXPLICACAO_SEM_DECISAO,
  chaveAlunoAtributo,
  decisaoDeAtributoNoCelular,
  decisaoDeMatriculaNoCelular,
  descricaoAtributo,
  ladosDaMatricula,
  origemAtributo,
  passoDaDecisao,
  resumirFila,
  type AtributoParaConciliar,
  type Decisao,
  type LadoEscolhido,
  type MatriculaParaConciliar,
} from '@/lib/conciliacao';
import { FolhaMobile } from '@/mobile/FolhaMobile';

/**
 * A Conciliação Emusys em tela de telefone.
 *
 * 🔴 Esta é a ÚNICA aba em que o toque escreve no cadastro do aluno, e a tela
 * do computador mostra por que isso importa aqui: medido a 390px, ela tem
 * **23,8 telas de rolagem**, **61 alvos abaixo de 44px** (o menor com 16px —
 * a caixa de seleção do lote) e rola 1706px para o lado. Entre os 7 textos
 * truncados estavam **nomes de alunos**: "Geovanna Farias Rodrigues Alves"
 * cortado ao lado de um botão que grava na ficha dela.
 *
 * Aprovar uma mudança sem conseguir ler de quem ela é não é uma tela
 * apertada; é uma tela que convida ao erro. Por isso o recorte aqui é de
 * PERMISSÃO, não só de layout:
 *
 * - **Decide no celular** só o que é genuinamente binário — o sync propôs um
 *   valor, os dois lados cabem lado a lado, e um toque escolhe entre eles.
 * - **Tudo o mais é leitura**, com o motivo escrito na linha. O que exige
 *   digitar um valor, escolher numa lista, conferir com a escola ou
 *   desambiguar entre pessoas continua no computador.
 * - **Não há ação em lote.** O desktop tem caixas de seleção e "aplicar todos";
 *   aqui é uma decisão por vez, com o nome inteiro à vista e um segundo toque
 *   para confirmar. O lote é o que transforma um erro em muitos.
 *
 * ⚠️ A régua mora em `@/lib/conciliacao` e o vocabulário também — a tela não
 * decide o que é decidível nem reescreve o que cada divergência significa.
 */

interface Props {
  matriculas: MatriculaParaConciliar[];
  atributos: AtributoParaConciliar[];
  salvandoMatricula: ReadonlySet<number>;
  salvandoAtributo: ReadonlySet<number>;
  onDecidirMatricula: (item: MatriculaParaConciliar, decisao: 'aprovar' | 'manter') => void;
  onDecidirAtributo: (item: AtributoParaConciliar, decisao: 'aplicar_emusys' | 'manter_la') => void;
  /** Código do tipo de matrícula → nome que a escola usa (`BOLSISTA_INT` → "Bolsista integral"). */
  tiposMatricula?: ReadonlyMap<string, string>;
}

type Selecionado =
  | { tipo: 'matricula'; item: MatriculaParaConciliar }
  | { tipo: 'atributo'; item: AtributoParaConciliar };

export function ConciliacaoMobile({
  matriculas,
  atributos,
  salvandoMatricula,
  salvandoAtributo,
  onDecidirMatricula,
  onDecidirAtributo,
  tiposMatricula,
}: Props) {
  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState<Selecionado | null>(null);
  const [confirmando, setConfirmando] = useState<LadoEscolhido | null>(null);

  const termo = normalizarBusca(busca);
  const casa = (nome: string | null | undefined) =>
    !termo || normalizarBusca(nome ?? '').includes(termo);

  const mats = useMemo(() => matriculas.filter((m) => casa(m.aluno_nome)), [matriculas, termo]);
  const atrs = useMemo(() => atributos.filter((a) => casa(a.aluno_nome)), [atributos, termo]);

  const resumo = useMemo(() => {
    const m = resumirFila(matriculas, decisaoDeMatriculaNoCelular);
    const a = resumirFila(atributos, decisaoDeAtributoNoCelular);
    const porMotivo: Record<string, number> = { ...m.porMotivo };
    for (const [k, v] of Object.entries(a.porMotivo)) porMotivo[k] = (porMotivo[k] ?? 0) + v;
    return {
      total: m.total + a.total,
      decidiveis: m.decidiveis + a.decidiveis,
      soLeitura: m.soLeitura + a.soLeitura,
      porMotivo,
    };
  }, [matriculas, atributos]);

  const paraDecidir: Selecionado[] = useMemo(
    () => [
      ...mats.filter((m) => decisaoDeMatriculaNoCelular(m).pode).map((item) => ({ tipo: 'matricula' as const, item })),
      ...atrs.filter((a) => decisaoDeAtributoNoCelular(a).pode).map((item) => ({ tipo: 'atributo' as const, item })),
    ],
    [mats, atrs],
  );

  const soLeitura: Array<Selecionado & { decisao: Decisao }> = useMemo(
    () => [
      ...mats
        .map((item) => ({ tipo: 'matricula' as const, item, decisao: decisaoDeMatriculaNoCelular(item) }))
        .filter((x) => !x.decisao.pode),
      ...atrs
        .map((item) => ({ tipo: 'atributo' as const, item, decisao: decisaoDeAtributoNoCelular(item) }))
        .filter((x) => !x.decisao.pode),
    ],
    [mats, atrs],
  );

  function fechar() {
    setAberto(null);
    setConfirmando(null);
  }

  return (
    <div>
      <div className="border-b border-slate-800 px-3 pb-2 pt-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-[15px] font-semibold text-slate-100">Conciliação</h2>
          <span className="text-[11px] tabular-nums text-slate-500">{resumo.total} pendentes</span>
        </div>

        {/* ⚠️ "6 de 350" e "350" contam histórias diferentes: sem este número,
            quem abre a aba no telefone pensa que tem 350 decisões pela frente. */}
        <p className="mt-1 text-[12px] text-slate-400">
          <span className="font-semibold text-cyan-300">{resumo.decidiveis}</span> dá para resolver
          aqui · <span className="text-slate-300">{resumo.soLeitura}</span> pedem o computador
        </p>

        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar aluno..."
          className="mt-2 min-h-[44px] w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-[14px] text-slate-100 placeholder:text-slate-500 focus:outline focus:outline-2 focus:outline-cyan-400"
        />
      </div>

      <section className="px-3 pt-3">
        <h3 className="pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          Para decidir ({paraDecidir.length})
        </h3>
        {paraDecidir.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-slate-500">
            Nada aqui espera decisão sua no celular.
          </p>
        ) : (
          <ul>
            {paraDecidir.map((s) => (
              <li key={`${s.tipo}:${s.item.id}`}>
                <LinhaDivergencia
                  selecionado={s}
                  tiposMatricula={tiposMatricula}
                  salvando={
                    s.tipo === 'matricula'
                      ? salvandoMatricula.has(s.item.id)
                      : salvandoAtributo.has(s.item.id)
                  }
                  onAbrir={() => {
                    setAberto(s);
                    setConfirmando(null);
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="px-3 pt-4">
        <h3 className="pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          Resolver no computador ({soLeitura.length})
        </h3>
        <ul>
          {soLeitura.slice(0, 40).map((s) => (
            <li key={`ro:${s.tipo}:${s.item.id}`}>
              <LinhaSoLeitura selecionado={s} decisao={s.decisao} />
            </li>
          ))}
        </ul>
        {soLeitura.length > 40 && (
          <p className="py-3 text-center text-[12px] text-slate-500">
            e mais {soLeitura.length - 40} — a lista inteira está na tela do computador.
          </p>
        )}
      </section>

      <FolhaMobile
        aberto={aberto != null}
        onFechar={fechar}
        titulo={aberto ? nomeDoAluno(aberto) : ''}
        subtitulo={aberto ? rotuloDoTipo(aberto) : undefined}
      >
        {aberto && (
          <PainelDecisao
            selecionado={aberto}
            tiposMatricula={tiposMatricula}
            confirmando={confirmando}
            onEvento={(evento) => {
              // 🔴 Quem decide se grava é `passoDaDecisao`, nao o JSX: assim
              // "nenhum caminho vai de nada-escolhido direto a gravar" e um
              // fato provavel por valores, nao uma inspecao de texto.
              const passo = passoDaDecisao(confirmando, evento);
              setConfirmando(passo.confirmando);
              if (!passo.gravar) return;
              if (aberto.tipo === 'matricula') {
                onDecidirMatricula(aberto.item, passo.gravar === 'emusys' ? 'aprovar' : 'manter');
              } else {
                onDecidirAtributo(aberto.item, passo.gravar === 'emusys' ? 'aplicar_emusys' : 'manter_la');
              }
              fechar();
            }}
          />
        )}
      </FolhaMobile>
    </div>
  );
}

function nomeDoAluno(s: Selecionado): string {
  return s.item.aluno_nome || 'Aluno sem nome no cadastro';
}

function rotuloDoTipo(s: Selecionado): string {
  if (s.tipo === 'atributo') {
    return ATRIBUTO_TIPO_ROTULO[s.item.tipo_divergencia]?.label || s.item.tipo_divergencia;
  }
  return s.item.tipo_divergencia.replaceAll('_', ' ');
}

/**
 * ⚠️ O nome do aluno NÃO é truncado aqui, e é a única coisa na tela com essa
 * garantia. Na tela do computador ele é cortado ao lado do botão que grava na
 * ficha dele — aprovar sem conseguir ler de quem é a ficha é o erro que este
 * recorte existe para impedir.
 */
function LinhaDivergencia({
  selecionado,
  salvando,
  onAbrir,
  tiposMatricula,
}: {
  selecionado: Selecionado;
  salvando: boolean;
  onAbrir: () => void;
  tiposMatricula?: ReadonlyMap<string, string>;
}) {
  const lados =
    selecionado.tipo === 'atributo'
      ? descricaoAtributo(selecionado.item)
      : ladosDaMatricula(selecionado.item, tiposMatricula);

  return (
    <button
      type="button"
      onClick={onAbrir}
      disabled={salvando}
      className="flex min-h-[44px] w-full items-start gap-2.5 border-b border-slate-800/70 py-2.5 pr-1 text-left active:bg-slate-800/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400 disabled:opacity-50"
    >
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-medium leading-snug text-slate-100">
          {selecionado.item.aluno_nome || 'Aluno sem nome no cadastro'}
        </p>
        <p className="mt-0.5 text-[11px] leading-tight text-slate-400">{rotuloDoTipo(selecionado)}</p>
        <p className="mt-0.5 truncate text-[11px] leading-tight text-slate-500">
          {lados.nosso} → {lados.emusys}
        </p>
      </div>
      {salvando ? (
        <Loader2 className="mt-1 h-4 w-4 flex-none animate-spin text-cyan-400" aria-hidden="true" />
      ) : (
        <ChevronRight className="mt-1 h-4 w-4 flex-none text-slate-600" aria-hidden="true" />
      )}
    </button>
  );
}

function LinhaSoLeitura({
  selecionado,
  decisao,
}: {
  selecionado: Selecionado & { decisao: Decisao };
  decisao: Decisao;
}) {
  return (
    <div className="flex items-start gap-2.5 border-b border-slate-800/70 py-2.5">
      <Lock className="mt-0.5 h-3.5 w-3.5 flex-none text-slate-600" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] leading-snug text-slate-300">
          {selecionado.item.aluno_nome || 'Aluno sem nome no cadastro'}
        </p>
        <p className="mt-0.5 text-[11px] leading-tight text-slate-500">
          {rotuloDoTipo(selecionado)}
          {decisao.motivo ? ` · ${EXPLICACAO_SEM_DECISAO[decisao.motivo]}` : ''}
        </p>
      </div>
    </div>
  );
}

/**
 * A decisão em DUAS etapas: escolher e confirmar.
 *
 * ⚠️ Um botão que grava no primeiro toque é o desenho errado num aparelho que
 * se usa em pé, no balcão, com uma mão. O segundo toque não é burocracia — é
 * a diferença entre "escolhi" e "encostei".
 */
function PainelDecisao({
  selecionado,
  confirmando,
  onEvento,
  tiposMatricula,
}: {
  selecionado: Selecionado;
  tiposMatricula?: ReadonlyMap<string, string>;
  confirmando: LadoEscolhido | null;
  onEvento: (
    evento: { tipo: 'escolher'; lado: LadoEscolhido } | { tipo: 'confirmar' } | { tipo: 'voltar' },
  ) => void;
}) {
  const lados =
    selecionado.tipo === 'atributo'
      ? descricaoAtributo(selecionado.item)
      : ladosDaMatricula(selecionado.item, tiposMatricula);
  const origem = selecionado.tipo === 'atributo' ? origemAtributo(selecionado.item) : 'Matrícula Emusys';

  return (
    <div className="pb-2">
      <p className="pb-3 text-[11px] text-slate-500">{origem}</p>

      <dl className="space-y-2">
        <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3">
          <dt className="text-[11px] uppercase tracking-wide text-slate-500">No LA Report</dt>
          <dd className="mt-1 break-words text-[14px] text-slate-100">{lados.nosso}</dd>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3">
          <dt className="text-[11px] uppercase tracking-wide text-slate-500">No Emusys</dt>
          <dd className="mt-1 break-words text-[14px] text-slate-100">{lados.emusys}</dd>
        </div>
      </dl>

      {confirmando == null ? (
        <div className="mt-4 space-y-2">
          <button
            type="button"
            onClick={() => onEvento({ tipo: 'escolher', lado: 'emusys' })}
            className="min-h-[48px] w-full rounded-lg border border-cyan-500/50 bg-cyan-500/15 px-3 text-[14px] font-medium text-cyan-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
          >
            Usar o valor do Emusys
          </button>
          <button
            type="button"
            onClick={() => onEvento({ tipo: 'escolher', lado: 'nosso' })}
            className="min-h-[48px] w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-[14px] text-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
          >
            Manter o nosso e travar
          </button>
        </div>
      ) : (
        <div className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-none text-amber-300" aria-hidden="true" />
            <p className="text-[13px] leading-snug text-amber-100">
              {confirmando === 'emusys'
                ? `Gravar "${lados.emusys}" na ficha de ${selecionado.item.aluno_nome || 'este aluno'}?`
                : `Manter "${lados.nosso}" e travar contra o sync?`}
            </p>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => onEvento({ tipo: 'confirmar' })}
              className="min-h-[48px] flex-1 rounded-lg bg-amber-500 px-3 text-[14px] font-semibold text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
            >
              Confirmar
            </button>
            <button
              type="button"
              onClick={() => onEvento({ tipo: 'voltar' })}
              className="min-h-[48px] flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 text-[14px] text-slate-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
            >
              Voltar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export { chaveAlunoAtributo };
export default ConciliacaoMobile;
