import React, { useEffect, useMemo, useState } from 'react';
import {
  useContratosVencendo,
  type JanelaDias,
  type CriterioVencimento,
} from '@/hooks/useContratosVencendo';
import { useCoberturaRenovacao } from '@/hooks/useCoberturaRenovacao';
import {
  SortableHeader,
  alternarOrdenacao,
  compararParaOrdenacao,
  type SortConfig,
} from '@/components/ui/SortableHeader';

const JANELAS: JanelaDias[] = [30, 60, 90];

// "Este mês" não é uma janela de dias — é a competência do seletor do topo. Os dois
// recortes convivem porque respondem perguntas diferentes: as janelas são rolantes
// ("o que vem pela frente"), a competência é fechada ("quem tinha que renovar em agosto")
// e é a única que fecha com o card Cobertura de Renovação do Resumo.
type Recorte = JanelaDias | 'mes';

// Espelha o alternador da tela "Renovacao de Matriculas" do Emusys. Os dois criterios
// devolvem listas diferentes: o contrato acaba as aulas e a fatura num mes, e as
// parcelas noutro, em 78% dos casos.
const CRITERIOS: Array<{ valor: CriterioVencimento; rotulo: string; ajuda: string }> = [
  { valor: 'aula', rotulo: 'Última aula', ajuda: 'Contratos cujas AULAS terminam na janela' },
  { valor: 'fatura', rotulo: 'Última fatura', ajuda: 'Contratos cuja última PARCELA vence na janela' },
];

function formatarData(iso: string | null): string {
  if (!iso) return '—';
  // Data pura (date, ex: venc_ultima_fatura): "YYYY-MM-DD" sem hora, os 10
  // primeiros chars já são o dia em BRT — não precisa (e não pode) converter
  // fuso, senão vira Date UTC e desloca o dia.
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [ano, mes, dia] = iso.split('-');
    return `${dia}/${mes}/${ano}`;
  }
  // timestamptz (ex: data_ultima_aula, ultima_sincronizacao_emusys): o
  // PostgREST serializa em UTC, então os 10 primeiros chars podem ser o dia
  // seguinte em BRT (ex: cron às 02:00 UTC = 23h BRT do dia anterior).
  // Converter pro fuso de negócio antes de extrair a data.
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function formatarMoeda(valor: number | null): string {
  if (valor == null) return '—';
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Coluna "Faturas" da tela de Renovação de Matrículas do Emusys: nº de faturas em
// aberto e VENCIDAS, com semáforo verde 0 / âmbar 1 / vermelho 2+.
//
// ⚠️ A cor sai de `inadimplente` (booleano do contrato, sempre correto) e não da
// contagem: `emusys_faturas` só cobre de jun/2026 em diante, e 2 dos 41 inadimplentes
// não têm nenhuma fatura vencida no espelho — decidir pela contagem os pintaria de
// verde. Pela mesma razão o número aparece como "≥N": é piso, não valor exato.
function situacaoFaturas(c: { inadimplente: boolean | null; faturas_vencidas_abertas?: number }) {
  const vencidas = c.faturas_vencidas_abertas ?? 0;
  const pendente = c.inadimplente === true || vencidas > 0;

  if (!pendente) {
    // inadimplente === null é "não sabemos" — não afirmar "em dia".
    if (c.inadimplente == null) return { rotulo: '—', classe: 'text-gray-500', titulo: 'Sem dado de inadimplência para esta matrícula' };
    return { rotulo: '0', classe: 'bg-emerald-500/15 text-emerald-300', titulo: 'Nenhuma fatura vencida em aberto' };
  }

  const n = Math.max(vencidas, 1);
  return {
    rotulo: `≥${n}`,
    classe: n >= 2 ? 'bg-rose-500/15 text-rose-300' : 'bg-amber-500/15 text-amber-300',
    titulo: vencidas > 0
      ? `${vencidas} fatura(s) vencida(s) e não paga(s) no espelho local (desde jun/2026). O Emusys pode mostrar mais, se houver atraso anterior.`
      : 'Contrato marcado como inadimplente no Emusys, mas a fatura vencida é anterior a jun/2026 e não está no espelho local.',
  };
}

// Valor de cada coluna para efeito de ordenação. Datas usam a string ISO crua
// (YYYY-MM-DD... ordena igual cronologicamente, sem custo de parse); números vêm
// como número para não cair na comparação textual (onde "9" > "10").
const VALOR_ORDENACAO: Record<string, (c: any) => string | number | null> = {
  aluno: (c) => c.aluno_nome,
  curso: (c) => c.curso_nome,
  professor: (c) => c.professor_nome,
  matricula: (c) => c.data_matricula,
  ultima_aula: (c) => c.data_ultima_aula,
  venc_fatura: (c) => c.venc_ultima_fatura,
  aulas_restantes: (c) => c.nr_aulas_futuras,
  valor: (c) => c.valor_parcela,
  // Ordena pelo nº de vencidas, mas com o inadimplente sem fatura no espelho valendo
  // 1 — senão ele cairia junto de quem está em dia, que é o oposto do que interessa.
  faturas: (c) => (c.inadimplente === true ? Math.max(c.faturas_vencidas_abertas ?? 0, 1) : c.faturas_vencidas_abertas ?? 0),
};

export function TabContratosVencendo({
  unidadeId,
  ano,
  mes,
  recorteInicial = 30,
}: { unidadeId: string; ano: number; mes: number; recorteInicial?: Recorte }) {
  const [recorte, setRecorte] = useState<Recorte>(recorteInicial);

  // Quem chega pelo link do card "N sem renovação registrada" tem que cair na MESMA
  // base do card — senão o número da lista discorda do que estava escrito no botão.
  // Só reage quando a prop muda, para não desfazer a escolha manual do usuário.
  useEffect(() => { setRecorte(recorteInicial); }, [recorteInicial]);
  const [criterio, setCriterio] = useState<CriterioVencimento>('aula');
  const [busca, setBusca] = useState('');
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);

  const porJanela = recorte !== 'mes';

  // Os dois hooks ficam montados; o inativo não busca porque recebe janela 0.
  // Trocar a origem do dado sem desmontar evita o flash de tabela vazia ao alternar.
  const janela = useContratosVencendo({
    unidadeId,
    janelaDias: porJanela ? (recorte as JanelaDias) : 30,
    criterio,
    ativo: porJanela,
  });
  // Sempre ativo, mesmo nas janelas de dias: é dele que sai o contador no botão
  // "Este mês". Sem isso, quem abre a aba no padrão de 30 dias não tem nenhuma pista
  // de que existe uma leitura por competência — e o recorte fica escondido.
  const competencia = useCoberturaRenovacao({ unidadeId, ano, mes, criterio });

  // No recorte de competência a lista é de quem AINDA não renovou — quem já renovou
  // vira numerador, não trabalho a fazer.
  const contratos = porJanela ? janela.contratos : competencia.pendentes;
  const loading = porJanela ? janela.loading : competencia.loading;
  const erro = porJanela ? janela.erro : competencia.erro;
  const ultimoSync = porJanela ? janela.ultimoSync : competencia.ultimoSync;

  const termo = busca.trim().toLowerCase();
  const filtrados = termo
    ? contratos.filter((c) => (c.aluno_nome ?? '').toLowerCase().includes(termo))
    : contratos;

  // Sem ordenação escolhida, preserva a ordem do hook (vencimento mais próximo primeiro),
  // que é a leitura natural da tela.
  const visiveis = useMemo(() => {
    if (!sortConfig) return filtrados;
    const extrair = VALOR_ORDENACAO[sortConfig.key];
    if (!extrair) return filtrados;
    return [...filtrados].sort((a, b) =>
      compararParaOrdenacao(extrair(a), extrair(b), sortConfig.direction),
    );
  }, [filtrados, sortConfig]);

  const ordenarPor = (key: string) => setSortConfig((atual) => alternarOrdenacao(atual, key));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-xl border border-slate-700/50 bg-slate-800/50 p-1">
          {CRITERIOS.map((c) => (
            <button
              key={c.valor}
              onClick={() => setCriterio(c.valor)}
              title={c.ajuda}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                criterio === c.valor
                  ? 'bg-cyan-500 text-white'
                  : 'text-gray-300 hover:bg-slate-700/50'
              }`}
            >
              {c.rotulo}
            </button>
          ))}
        </div>
        <button
          onClick={() => setRecorte('mes')}
          title="Contratos que terminam na competência selecionada no topo, ainda sem renovação registrada"
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 ${
            recorte === 'mes'
              ? 'bg-amber-500 text-slate-900'
              : 'bg-slate-800/50 text-gray-300 hover:bg-slate-700/50'
          }`}
        >
          Este mês
          {/* contador de pendentes da competência: é a única pista de que este recorte
              existe para quem abre a aba no padrão de 30 dias */}
          {competencia.faltam > 0 && (
            <span
              className={`rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums ${
                recorte === 'mes' ? 'bg-slate-900/25 text-slate-900' : 'bg-amber-500/20 text-amber-300'
              }`}
            >
              {competencia.faltam}
            </span>
          )}
        </button>
        {JANELAS.map((dias) => (
          <button
            key={dias}
            onClick={() => setRecorte(dias)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              recorte === dias
                ? 'bg-cyan-500 text-white'
                : 'bg-slate-800/50 text-gray-300 hover:bg-slate-700/50'
            }`}
          >
            {dias} dias
          </button>
        ))}
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar aluno…"
          className="rounded-xl border border-slate-700/50 bg-slate-800/50 px-3 py-2 text-sm text-gray-200 placeholder:text-gray-500"
        />
        <span className="rounded-lg bg-slate-800/50 px-2.5 py-1 text-xs font-medium text-cyan-300">
          {visiveis.length} {visiveis.length === 1 ? 'registro encontrado' : 'registros encontrados'}
        </span>
        {ultimoSync && (
          <span className="ml-auto text-xs text-gray-400">
            Dados do Emusys sincronizados em {formatarData(ultimoSync)}
          </span>
        )}
      </div>

      {/* No recorte de competência a lista sozinha esconde metade da história: quem já
          renovou some dela. A faixa devolve o denominador e explica o sumiço. */}
      {!porJanela && !competencia.loading && competencia.base > 0 && (
        <div className="flex flex-wrap items-center gap-5 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
          <span className="text-2xl font-bold tabular-nums text-amber-400">
            {competencia.renovados}
            <span className="text-sm font-normal text-gray-400"> de {competencia.base}</span>
          </span>
          <span className="max-w-[52ch] text-xs text-gray-300">
            <b className="font-semibold text-gray-100">Cobertura da competência.</b>{' '}
            {competencia.faltam === 0
              ? 'Todos os contratos que terminam neste mês já têm ciclo novo.'
              : `${competencia.faltam} ${competencia.faltam === 1 ? 'contrato termina' : 'contratos terminam'} neste mês e ainda não ${competencia.faltam === 1 ? 'tem' : 'têm'} ciclo novo. Os outros ${competencia.renovados} já renovaram e saíram da lista.`}
          </span>
        </div>
      )}

      {erro && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
          Erro ao carregar: {erro}
        </div>
      )}

      {loading ? (
        <p className="text-gray-400">Carregando…</p>
      ) : visiveis.length === 0 ? (
        <p className="text-gray-400">
          {termo
            ? `Nenhum aluno encontrado para "${busca}".`
            : !porJanela
              ? 'Nenhum contrato termina nesta competência sem renovação registrada.'
              : criterio === 'aula'
                ? `Nenhuma matrícula com AULAS acabando nos próximos ${recorte} dias.`
                : `Nenhuma matrícula com a última FATURA vencendo nos próximos ${recorte} dias.`}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-700/50">
          <table className="w-full text-sm">
            <thead className="bg-slate-800/50 text-gray-300">
              <tr>
                <SortableHeader label="Aluno" sortKey="aluno" sortConfig={sortConfig} onSort={ordenarPor} className="text-left" />
                <SortableHeader label="Curso" sortKey="curso" sortConfig={sortConfig} onSort={ordenarPor} className="text-left" />
                <SortableHeader label="Professor" sortKey="professor" sortConfig={sortConfig} onSort={ordenarPor} className="text-left" />
                <SortableHeader label="Matrícula" sortKey="matricula" sortConfig={sortConfig} onSort={ordenarPor} className="text-left" />
                <SortableHeader label="Última aula" sortKey="ultima_aula" sortConfig={sortConfig} onSort={ordenarPor} className="text-left" />
                <SortableHeader label="Venc. últ. fatura" sortKey="venc_fatura" sortConfig={sortConfig} onSort={ordenarPor} className="text-left" />
                <SortableHeader label="Aulas restantes" sortKey="aulas_restantes" sortConfig={sortConfig} onSort={ordenarPor} className="text-right" />
                <SortableHeader label="Valor" sortKey="valor" sortConfig={sortConfig} onSort={ordenarPor} className="text-right" />
                <SortableHeader label="Faturas" sortKey="faturas" sortConfig={sortConfig} onSort={ordenarPor} className="text-center" />
              </tr>
            </thead>
            <tbody>
              {visiveis.map((c) => (
                <tr
                  key={`${c.unidade_id}-${c.emusys_matricula_disciplina_id}`}
                  className="border-t border-slate-700/40 text-gray-200"
                >
                  <td className="px-4 py-3">
                    {c.aluno_nome ?? <span className="text-gray-500">— (sem cadastro local)</span>}
                    {unidadeId === 'todos' && (
                      <span className="ml-2 text-xs text-gray-400">{c.unidade_nome}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">{c.curso_nome ?? '—'}</td>
                  <td className="px-4 py-3">{c.professor_nome ?? '—'}</td>
                  <td className="px-4 py-3">{formatarData(c.data_matricula)}</td>
                  <td className="px-4 py-3">{formatarData(c.data_ultima_aula)}</td>
                  <td className="px-4 py-3">{formatarData(c.venc_ultima_fatura)}</td>
                  <td className="px-4 py-3 text-right">{c.nr_aulas_futuras ?? '—'}</td>
                  <td
                    className="px-4 py-3 text-right"
                    title="Valor como está na API do Emusys; pode estar bruto. Confira na Conciliação."
                  >
                    {formatarMoeda(c.valor_parcela)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {(() => {
                      const s = situacaoFaturas(c);
                      return (
                        <span
                          title={s.titulo}
                          className={`inline-block min-w-[2.25rem] rounded-lg px-2 py-1 text-xs font-semibold tabular-nums ${s.classe}`}
                        >
                          {s.rotulo}
                        </span>
                      );
                    })()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default TabContratosVencendo;
