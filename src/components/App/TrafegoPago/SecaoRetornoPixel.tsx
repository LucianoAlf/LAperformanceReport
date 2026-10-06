import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AlertTriangle, CheckCircle2, Info, Loader2, Send, Target } from 'lucide-react';
import { supabase } from '@/lib/supabase';

// Bloco "Retorno ao pixel do Meta" (LAPE-62, 06/10/2026), aba Meta do Tráfego Pago.
//
// ⚠️ É PIXEL, não o clique do anúncio: o LA Report devolve ao pixel "LA Music - Site e Matrículas" a
// experimental feita e a matrícula, casando pelo TELEFONE em hash (API de Conversões). O código do clique
// (ctwa_clid) não serve aqui porque os números das Milas não estão na Cloud API do WhatsApp. Por isso o
// Meta só liga a matrícula ao anúncio quando acha a pessoa; o funil abaixo é o NOSSO, com a marca de
// anúncio que cada lead já carrega, e não depende desse casamento.

type PorCampanha = { campanha: string; leads: number; experimentais: number; matriculas: number; valor_estimado: number };
type PorMarca = { marca: string; leads: number; experimentais: number; matriculas: number; valor_estimado: number };

interface RetornoPixel {
  periodo_dias: number | null;
  por_campanha: PorCampanha[];
  por_marca: PorMarca[];
  matriculas_canal_meta_sem_marca: number;
  envio: {
    enviados_experimental: number;
    enviados_matricula: number;
    falhas: number;
    ultimo_envio_em: string | null;
    aguardando_envio: number;
    sem_telefone: number;
  };
  ultima_rodada: {
    em: string; modo: string; desfecho: string | null; enviados: number | null; falhas: number | null; erro: string | null;
  } | null;
}

interface Props {
  /** Período da página: 7, 30, 90 dias ou null (tudo). */
  dias: number | null;
  /** Gasto por nome de campanha (insights da Meta), para o custo por matrícula. */
  gastoPorCampanha: Map<string, number>;
  /** Compras que o próprio Meta atribuiu aos anúncios no período (offline_conversion.purchase). */
  comprasAtribuidasMeta: number;
}

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: v >= 1000 ? 0 : 2 });
const num = (v: number) => v.toLocaleString('pt-BR');

// Se a rotina das 8h ficar mais de ~36h sem rodar, algo parou: o carimbo diz.
const HORAS_SEM_RODADA_ALERTA = 36;

export function SecaoRetornoPixel({ dias, gastoPorCampanha, comprasAtribuidasMeta }: Props) {
  const [dados, setDados] = useState<RetornoPixel | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    (async () => {
      setCarregando(true);
      setErro(null);
      const { data, error } = await supabase.rpc('trafego_meta_retorno_pixel', { p_dias: dias });
      if (!ativo) return;
      if (error) {
        console.error('Erro ao buscar retorno ao pixel:', error);
        setErro(`${error.code ?? ''} ${error.message}`.trim());
        setDados(null);
      } else {
        setDados(data as RetornoPixel);
      }
      setCarregando(false);
    })();
    return () => { ativo = false; };
  }, [dias]);

  const linhas = useMemo(() => {
    return (dados?.por_campanha ?? []).map(c => {
      const gasto = gastoPorCampanha.get(c.campanha) ?? null;
      return { ...c, gasto, custoMatricula: gasto != null && c.matriculas > 0 ? gasto / c.matriculas : null };
    });
  }, [dados, gastoPorCampanha]);

  const totalMatriculasComMarca = linhas.reduce((s, l) => s + l.matriculas, 0);

  if (carregando) {
    return (
      <div className="flex items-center justify-center h-28 bg-slate-800/50 rounded-2xl border border-slate-700/50">
        <Loader2 className="w-6 h-6 text-pink-400 animate-spin" />
      </div>
    );
  }

  if (erro || !dados) {
    return (
      <div className="bg-rose-900/20 border border-rose-700/50 rounded-2xl p-4 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm text-rose-300">Não consegui carregar o retorno ao pixel do Meta.</p>
          <p className="text-xs text-rose-400/80 mt-1">{erro ?? 'resposta vazia'}</p>
        </div>
      </div>
    );
  }

  const { envio, ultima_rodada: rodada } = dados;
  const horasDesdeRodada = rodada ? (Date.now() - new Date(rodada.em).getTime()) / 3600_000 : null;
  const rodadaAtrasada = horasDesdeRodada != null && horasDesdeRodada > HORAS_SEM_RODADA_ALERTA;
  const rodadaRuim = !!rodada && rodada.desfecho !== 'ok';
  const envioComProblema = envio.falhas > 0 || rodadaRuim || rodadaAtrasada || !rodada;
  const fmtData = (iso: string) => format(new Date(iso), "dd/MM 'às' HH:mm", { locale: ptBR });

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-medium text-slate-300 flex items-center gap-2">
            <Target className="w-4 h-4" /> Do anúncio à matrícula
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-pink-900/40 border border-pink-700/60 text-pink-300">
              Retorno ao pixel do Meta
            </span>
          </h3>
          <p className="text-xs text-slate-500 mt-1 max-w-3xl">
            O LA Report devolve ao <span className="text-slate-300">pixel "LA Music – Site e Matrículas"</span> a experimental
            feita e a matrícula, ligando a pessoa pelo <span className="text-slate-300">telefone</span> (API de Conversões), não
            pelo clique do anúncio. A tabela abaixo é o funil <span className="text-slate-300">do LA Report</span>, pela marca
            de anúncio de cada lead — não depende de o Meta achar a pessoa.
          </p>
        </div>
      </div>

      {/* Funil por campanha */}
      <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700 text-xs text-slate-400">
                <th className="text-left px-5 py-3 font-medium">Campanha</th>
                <th className="text-right px-4 py-3 font-medium">Gasto</th>
                <th className="text-right px-4 py-3 font-medium">Leads</th>
                <th className="text-right px-4 py-3 font-medium">Experimentais</th>
                <th className="text-right px-4 py-3 font-medium">Matrículas</th>
                <th className="text-right px-4 py-3 font-medium" title="Passaporte + 12 mensalidades: estimativa do contrato, não o valor já pago">
                  Valor estimado
                </th>
                <th className="text-right px-5 py-3 font-medium">Custo / matrícula</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {linhas.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-6 text-center text-sm text-slate-500">
                    Nenhum lead com marca de anúncio neste período.
                  </td>
                </tr>
              )}
              {linhas.map(l => (
                <tr key={l.campanha} className="hover:bg-slate-700/30 transition-colors">
                  <td className="px-5 py-3 text-sm text-white">{l.campanha}</td>
                  <td className="px-4 py-3 text-sm text-right text-white">{l.gasto != null ? brl(l.gasto) : '—'}</td>
                  <td className="px-4 py-3 text-sm text-right text-slate-300">{num(l.leads)}</td>
                  <td className="px-4 py-3 text-sm text-right text-slate-300">{num(l.experimentais)}</td>
                  <td className="px-4 py-3 text-sm text-right text-emerald-400 font-semibold">{num(l.matriculas)}</td>
                  <td className="px-4 py-3 text-sm text-right text-slate-300">{l.valor_estimado > 0 ? brl(l.valor_estimado) : '—'}</td>
                  <td className="px-5 py-3 text-sm text-right text-amber-400">
                    {l.custoMatricula != null ? brl(l.custoMatricula) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3 border-t border-slate-700/60 text-[11px] text-slate-500 space-y-1">
          <p>
            <Info className="inline w-3 h-3 mr-1 -mt-0.5" />
            Cada coluna conta pela própria data (lead pela data do contato, experimental pela da aula, matrícula pela da
            matrícula): a matrícula do período pode ser de um lead mais antigo. O custo por matrícula é um <span className="text-slate-400">teto</span>:
            só conta matrícula com marca de anúncio, e o gasto é da campanha inteira.
          </p>
          {dados.matriculas_canal_meta_sem_marca > 0 && (
            <p>
              Mais <span className="text-slate-300 font-semibold">{num(dados.matriculas_canal_meta_sem_marca)}</span>{' '}
              {dados.matriculas_canal_meta_sem_marca === 1 ? 'matrícula veio' : 'matrículas vieram'} de canal do Meta
              (Instagram, Facebook ou Status do WhatsApp) <span className="text-slate-400">sem marca de anúncio</span>:
              sabemos que são do Meta, não de qual campanha.
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Kids x School */}
        <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-5">
          <h4 className="text-sm font-medium text-slate-400 mb-3">Kids × School (leads com marca de anúncio)</h4>
          <div className="grid grid-cols-3 gap-2">
            {dados.por_marca.map(m => (
              <div key={m.marca} className="bg-slate-900/50 rounded-xl border border-slate-700/50 p-3">
                <p className="text-xs text-slate-400 mb-1">{m.marca}</p>
                <p className="text-lg font-bold text-emerald-400">{num(m.matriculas)} <span className="text-[11px] font-normal text-slate-500">matr.</span></p>
                <p className="text-[11px] text-slate-500">{num(m.experimentais)} exp. · {num(m.leads)} leads</p>
              </div>
            ))}
            {dados.por_marca.length === 0 && <p className="text-xs text-slate-500 col-span-3">Sem dados no período.</p>}
          </div>
          <p className="text-[11px] text-slate-500 mt-3">
            "Sem classificação" é o lead que ainda não teve a faixa etária preenchida no atendimento; a matrícula já
            vem classificada. Por isso o Kids/School dos leads cresce com o tempo.
          </p>
        </div>

        {/* O que o Meta viu */}
        <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-5">
          <h4 className="text-sm font-medium text-slate-400 mb-3">O que o Meta ligou aos anúncios</h4>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-slate-900/50 rounded-xl border border-slate-700/50 p-3">
              <p className="text-xs text-slate-400 mb-1">Compras atribuídas pelo Meta</p>
              <p className="text-lg font-bold text-white">{num(comprasAtribuidasMeta)}</p>
            </div>
            <div className="bg-slate-900/50 rounded-xl border border-slate-700/50 p-3">
              <p className="text-xs text-slate-400 mb-1">Matrículas nossas com marca</p>
              <p className="text-lg font-bold text-white">{num(totalMatriculasComMarca)}</p>
            </div>
          </div>
          <p className="text-[11px] text-slate-500 mt-3">
            O Meta só atribui a compra ao anúncio quando acha a pessoa que o viu ou clicou. A diferença entre as duas
            caixas mostra o quanto o casamento por telefone está pegando. O Meta pode levar até 30 minutos para contar.
          </p>
        </div>
      </div>

      {/* Saúde do envio */}
      <div className={`rounded-2xl border p-4 ${
        envioComProblema ? 'bg-rose-900/15 border-rose-700/50' : 'bg-slate-800/50 border-slate-700/50'
      }`}>
        <div className="flex items-center gap-2 mb-2">
          {envioComProblema
            ? <AlertTriangle className="w-4 h-4 text-rose-400" />
            : <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
          <h4 className="text-sm font-medium text-slate-300 flex items-center gap-2"><Send className="w-3.5 h-3.5" /> Envio ao pixel</h4>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-400">
          <span>Enviados: <b className="text-white">{num(envio.enviados_experimental)}</b> experimentais · <b className="text-white">{num(envio.enviados_matricula)}</b> matrículas</span>
          <span>Falhas: <b className={envio.falhas > 0 ? 'text-rose-400' : 'text-white'}>{num(envio.falhas)}</b></span>
          <span>Aguardando: <b className="text-white">{num(envio.aguardando_envio)}</b>{envio.sem_telefone > 0 && <span className="text-slate-500"> (+{envio.sem_telefone} sem telefone)</span>}</span>
          <span>
            Última rodada:{' '}
            {rodada
              ? <b className={rodadaRuim || rodadaAtrasada ? 'text-rose-400' : 'text-white'}>
                  {fmtData(rodada.em)} — {rodada.desfecho ?? 'sem desfecho'}, {num(rodada.enviados ?? 0)} enviados
                </b>
              : <b className="text-rose-400">nenhuma ainda</b>}
          </span>
          <span className="text-slate-500">Próxima: todo dia às 8h</span>
        </div>
        {(rodadaAtrasada || rodadaRuim) && (
          <p className="text-xs text-rose-300 mt-2">
            {rodadaRuim
              ? `A última rodada terminou com problema${rodada?.erro ? `: ${rodada.erro}` : '.'}`
              : `Faz mais de ${HORAS_SEM_RODADA_ALERTA}h que a rotina de envio não roda.`}
          </p>
        )}
      </div>
    </div>
  );
}
