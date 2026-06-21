import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Flag, LockKeyhole, Target } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useComercialResumoV2 } from '../../hooks/useComercialResumoV2';

interface MetaComercial {
  unidade: string;
  meta_leads: number | null;
  meta_experimentais: number | null;
  meta_matriculas: number | null;
  meta_taxa_conversao: number | null;
  meta_ticket_medio: number | null;
}

interface UnidadeMetaRow {
  nome: string;
  cor: string;
  leadsReal: number;
  metaLeads: number;
  metaMatriculas?: number | null;
}

const META_GRUPO_PADRAO: MetaComercial = {
  unidade: 'Grupo',
  meta_leads: 8500,
  meta_experimentais: 1200,
  meta_matriculas: 800,
  meta_taxa_conversao: 10,
  meta_ticket_medio: 430,
};

function toNumber(valor: number | null | undefined): number {
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : 0;
}

function calcularVariacao(real: number, meta: number): string {
  if (real <= 0) {
    return meta > 0 ? 'Sem base v2' : 'Sem meta';
  }

  const diff = ((meta - real) / real) * 100;
  return `${diff >= 0 ? '+' : ''}${diff.toFixed(0)}%`;
}

function calcularAtingimento(real: number, meta: number): string {
  if (meta <= 0) {
    return 'Sem meta';
  }

  return `${((real / meta) * 100).toFixed(0)}%`;
}

function metaPorUnidade(metas: MetaComercial[], unidade: string): MetaComercial | undefined {
  return metas.find((meta) => meta.unidade === unidade);
}

export function ComercialMetas() {
  const [metas, setMetas] = useState<MetaComercial[]>([]);
  const [loadingMetas, setLoadingMetas] = useState(true);
  const [errorMetas, setErrorMetas] = useState<string | null>(null);

  const { resumo: grupo, loading: loadingGrupo, error: errorGrupo } = useComercialResumoV2(2025, 'Consolidado');
  const { resumo: campoGrande, loading: loadingCG, error: errorCG } = useComercialResumoV2(2025, 'Campo Grande');
  const { resumo: recreio, loading: loadingRec, error: errorRec } = useComercialResumoV2(2025, 'Recreio');
  const { resumo: barra, loading: loadingBarra, error: errorBarra } = useComercialResumoV2(2025, 'Barra');

  useEffect(() => {
    async function fetchMetas() {
      setLoadingMetas(true);
      setErrorMetas(null);

      const { data, error } = await supabase
        .from('metas_comerciais')
        .select('unidade, meta_leads, meta_experimentais, meta_matriculas, meta_taxa_conversao, meta_ticket_medio')
        .eq('ano', 2026);

      if (error) {
        setErrorMetas(error.message);
        setMetas([]);
      } else {
        setMetas((data as MetaComercial[] | null) || []);
      }

      setLoadingMetas(false);
    }

    fetchMetas();
  }, []);

  const loading = loadingMetas || loadingGrupo || loadingCG || loadingRec || loadingBarra;
  const error = errorMetas || errorGrupo || errorCG || errorRec || errorBarra;

  const metaGrupo = metaPorUnidade(metas, 'Grupo') || META_GRUPO_PADRAO;

  const unidades = useMemo<UnidadeMetaRow[]>(() => [
    {
      nome: 'Campo Grande',
      cor: 'text-cyan-400',
      leadsReal: campoGrande.leadsEntrantes,
      metaLeads: toNumber(metaPorUnidade(metas, 'Campo Grande')?.meta_leads),
      metaMatriculas: metaPorUnidade(metas, 'Campo Grande')?.meta_matriculas,
    },
    {
      nome: 'Recreio',
      cor: 'text-purple-400',
      leadsReal: recreio.leadsEntrantes,
      metaLeads: toNumber(metaPorUnidade(metas, 'Recreio')?.meta_leads),
      metaMatriculas: metaPorUnidade(metas, 'Recreio')?.meta_matriculas,
    },
    {
      nome: 'Barra',
      cor: 'text-emerald-400',
      leadsReal: barra.leadsEntrantes,
      metaLeads: toNumber(metaPorUnidade(metas, 'Barra')?.meta_leads),
      metaMatriculas: metaPorUnidade(metas, 'Barra')?.meta_matriculas,
    },
  ], [barra.leadsEntrantes, campoGrande.leadsEntrantes, metas, recreio.leadsEntrantes]);

  const blocosBloqueados = [
    {
      titulo: 'Experimentais',
      meta: toNumber(metaGrupo.meta_experimentais).toLocaleString('pt-BR'),
      motivo: 'Aguardando regra canonica de presenca individual + aula Emusys experimental.',
    },
    {
      titulo: 'Matriculas comerciais',
      meta: toNumber(metaGrupo.meta_matriculas).toLocaleString('pt-BR'),
      motivo: 'Aguardando regra canonica por unidade e vinculo lead/aluno.',
    },
    {
      titulo: 'Taxa Lead -> Matricula',
      meta: `${toNumber(metaGrupo.meta_taxa_conversao).toLocaleString('pt-BR')}%`,
      motivo: 'Aguardando regra final de conversao comercial.',
    },
    {
      titulo: 'Ticket medio',
      meta: `R$ ${toNumber(metaGrupo.meta_ticket_medio).toLocaleString('pt-BR')}`,
      motivo: 'Aguardando fonte financeira comercial canonica.',
    },
  ];

  const planoAcao = [
    {
      numero: 1,
      titulo: 'Leads Entrantes',
      descricao: 'Usar a fonte comercial v2 como base de acompanhamento e metas de leads.',
      meta: 'Manter comparacao 2025 -> 2026 por unidade sem snapshot legado.',
      responsavel: 'Comercial',
    },
    {
      numero: 2,
      titulo: 'Reconciliação de experimentais',
      descricao: 'Concluir vinculo lead -> aluno -> presenca antes de publicar taxa Exp -> Mat.',
      meta: 'Liberar apenas indicadores com presenca individual confirmada.',
      responsavel: 'Operacao / Dados',
    },
    {
      numero: 3,
      titulo: 'Matricula comercial',
      descricao: 'Fechar regra de unidade e vinculo comercial para separar matricula academica, passaporte e conversao.',
      meta: 'Evitar metas por unidade baseadas em unidade cadastral ambigua.',
      responsavel: 'Alf / Comercial',
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center text-red-400">
        <div className="text-xl mb-2">Erro ao carregar metas comerciais</div>
        <div className="text-sm">{error}</div>
      </div>
    );
  }

  return (
    <div className="p-8 min-h-screen">
      <div className="mb-8">
        <span className="inline-flex items-center gap-1.5 bg-emerald-500/20 text-emerald-400 text-sm font-medium px-3 py-1 rounded-full mb-4">
          <Target className="w-4 h-4" /> Metas 2026
        </span>
        <h1 className="text-4xl lg:text-5xl font-grotesk font-bold text-white mb-2">
          Objetivos <span className="text-emerald-400">Comerciais</span>
        </h1>
        <p className="text-gray-400">
          Leads com baseline v2. Metas sem regra canonica ficam bloqueadas para progresso oficial.
        </p>
      </div>

      <div className="bg-gradient-to-r from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 rounded-2xl p-6 mb-8">
        <h3 className="text-xl font-semibold text-emerald-400 mb-6 flex items-center gap-2">
          <Flag className="w-5 h-5" />
          Metas do Grupo 2026
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
          <div className="text-center bg-slate-900/30 rounded-xl p-4">
            <div className="text-3xl font-grotesk font-bold text-white">
              {toNumber(metaGrupo.meta_leads).toLocaleString('pt-BR')}
            </div>
            <div className="text-sm text-gray-400">Leads</div>
            <div className="text-xs text-emerald-400 mt-1">
              {calcularVariacao(grupo.leadsEntrantes, toNumber(metaGrupo.meta_leads))}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Base v2 2025: {grupo.leadsEntrantes.toLocaleString('pt-BR')}
            </div>
          </div>

          {blocosBloqueados.map((bloco) => (
            <div key={bloco.titulo} className="text-center bg-slate-900/30 rounded-xl p-4 border border-yellow-500/20">
              <div className="flex justify-center mb-2">
                <LockKeyhole className="w-5 h-5 text-yellow-300" />
              </div>
              <div className="text-2xl font-grotesk font-bold text-white">{bloco.meta}</div>
              <div className="text-sm text-gray-400">{bloco.titulo}</div>
              <div className="text-xs text-yellow-300 mt-2">Progresso bloqueado</div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6 mb-8">
        <h3 className="text-lg font-semibold text-white mb-2">Metas por Unidade</h3>
        <p className="text-sm text-gray-400 mb-6">
          Comparativo oficial nesta tela fica restrito a Leads Entrantes v2. Matriculas por unidade seguem em validacao semantica.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left text-gray-400 text-sm font-medium py-3 px-4">Unidade</th>
                <th className="text-right text-gray-400 text-sm font-medium py-3 px-4">Leads v2 2025</th>
                <th className="text-right text-gray-400 text-sm font-medium py-3 px-4">Meta leads 2026</th>
                <th className="text-right text-gray-400 text-sm font-medium py-3 px-4">Atingimento base</th>
                <th className="text-right text-gray-400 text-sm font-medium py-3 px-4">Matriculas</th>
              </tr>
            </thead>
            <tbody>
              {unidades.map((unidade) => (
                <tr key={unidade.nome} className="border-b border-slate-700/50 hover:bg-slate-700/20">
                  <td className={`py-4 px-4 ${unidade.cor} font-medium`}>{unidade.nome}</td>
                  <td className="text-right text-white py-4 px-4">{unidade.leadsReal.toLocaleString('pt-BR')}</td>
                  <td className="text-right text-white py-4 px-4 font-semibold">
                    {unidade.metaLeads > 0 ? unidade.metaLeads.toLocaleString('pt-BR') : 'Sem meta'}
                  </td>
                  <td className="text-right py-4 px-4">
                    <span className="text-emerald-400 font-semibold">
                      {calcularAtingimento(unidade.leadsReal, unidade.metaLeads)}
                    </span>
                  </td>
                  <td className="text-right py-4 px-4">
                    <span className="text-yellow-300 text-sm">
                      {unidade.metaMatriculas ? `${unidade.metaMatriculas} meta; progresso bloqueado` : 'Bloqueado'}
                    </span>
                  </td>
                </tr>
              ))}
              <tr className="bg-slate-700/20">
                <td className="py-4 px-4 text-yellow-400 font-bold">TOTAL</td>
                <td className="text-right text-white py-4 px-4 font-bold">{grupo.leadsEntrantes.toLocaleString('pt-BR')}</td>
                <td className="text-right text-white py-4 px-4 font-bold">{toNumber(metaGrupo.meta_leads).toLocaleString('pt-BR')}</td>
                <td className="text-right py-4 px-4">
                  <span className="text-emerald-400 font-bold">
                    {calcularAtingimento(grupo.leadsEntrantes, toNumber(metaGrupo.meta_leads))}
                  </span>
                </td>
                <td className="text-right py-4 px-4 text-yellow-300 font-semibold">Bloqueado</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-2xl p-6 mb-8">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-6 h-6 text-yellow-300 mt-1" />
          <div>
            <h3 className="text-lg font-semibold text-yellow-200 mb-2">Controle de regra canonica</h3>
            <p className="text-gray-300 text-sm">
              Esta pagina nao usa dados_comerciais nem useComercialData. Leads usam RPC v2; demais metas continuam cadastradas,
              mas sem progresso oficial ate existir regra canonica de experimentais, matriculas, ticket e unidade comercial.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
        <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
          <Target className="w-5 h-5 text-emerald-400" />
          Plano de Acao Comercial 2026
        </h3>

        <div className="space-y-4">
          {planoAcao.map((acao) => (
            <div key={acao.numero} className="bg-slate-700/30 rounded-xl p-4 hover:bg-slate-700/50 transition-all">
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 font-bold">
                  {acao.numero}
                </div>
                <div className="flex-1">
                  <h4 className="text-white font-semibold mb-1">{acao.titulo}</h4>
                  <p className="text-gray-400 text-sm mb-2">{acao.descricao}</p>
                  <div className="flex flex-wrap gap-4 text-xs">
                    <span className="bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded">
                      Meta: {acao.meta}
                    </span>
                    <span className="bg-blue-500/20 text-blue-400 px-2 py-1 rounded">
                      Responsavel: {acao.responsavel}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default ComercialMetas;
