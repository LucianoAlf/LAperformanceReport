import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/useToast';
import { useClassificacaoEvasao } from './hooks/useClassificacaoEvasao';
import {
  PESQUISA_EVASAO_CATEGORIAS,
  type PesquisaEvasaoCategoria,
  type PesquisaEvasaoRelacaoMotivo,
} from './pesquisaEvasao.types';
import { AcoesPesquisaEvasao } from './AcoesPesquisaEvasao';

interface Props {
  pesquisaId: string;
  onAlteracao?: () => void;
}

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

const relacoes: Array<{ value: PesquisaEvasaoRelacaoMotivo; label: string }> = [
  { value: 'confirmou', label: 'Confirmou o motivo registrado' },
  { value: 'confirmou_parcialmente', label: 'Confirmou parcialmente' },
  { value: 'complementou', label: 'Complementou o motivo' },
  { value: 'divergiu', label: 'Divergiu do motivo registrado' },
  { value: 'sem_motivo_anterior', label: 'Não havia motivo anterior' },
  { value: 'inconclusivo', label: 'Inconclusivo' },
  { value: 'invalido', label: 'Resposta inválida' },
];

export function ClassificacaoPesquisaEvasao({ pesquisaId, onAlteracao }: Props) {
  const { error: mostrarErro, success: mostrarSucesso } = useToast();
  const classificacao = useClassificacaoEvasao(pesquisaId, true);
  const [categorias, setCategorias] = useState<PesquisaEvasaoCategoria[]>([]);
  const [relacao, setRelacao] = useState<PesquisaEvasaoRelacaoMotivo>('confirmou');
  const [justificativa, setJustificativa] = useState('');
  const [salvando, setSalvando] = useState(false);

  const atual = classificacao.dados?.classificacao_atual;
  useEffect(() => {
    setCategorias(atual?.categorias ?? []);
    setRelacao(atual?.relacao_motivo ?? 'confirmou');
    setJustificativa(atual?.justificativa ?? '');
  }, [atual?.id]);

  const analiseRevisada = classificacao.dados?.analise_atual?.status === 'revisada';
  const bloqueado = useMemo(() => (
    !analiseRevisada
    || categorias.length === 0
    || (categorias.includes('outro') && !justificativa.trim())
    || salvando
  ), [analiseRevisada, categorias, justificativa, salvando]);

  const alternarCategoria = (categoria: PesquisaEvasaoCategoria) => {
    const exclusiva = categoria === 'inconclusivo' || categoria === 'resposta_invalida';
    setCategorias((atuais) => {
      if (atuais.includes(categoria)) return atuais.filter((item) => item !== categoria);
      if (exclusiva) return [categoria];
      return [
        ...atuais.filter((item) => item !== 'inconclusivo' && item !== 'resposta_invalida'),
        categoria,
      ];
    });
  };

  const salvar = async () => {
    const analiseId = classificacao.dados?.analise_atual?.id;
    if (!analiseId || bloqueado) return;
    setSalvando(true);
    const resultado = await classificacao.classificar({
      analiseId,
      categorias,
      relacao,
      justificativa,
    });
    setSalvando(false);
    if (!resultado.ok) {
      if (resultado.erro.code === '40001' || resultado.erro.message.includes('CONVERSA_ATUALIZADA')) {
        await classificacao.carregar();
        mostrarErro('Chegou conteúdo novo; confira a conversa antes de classificar novamente.');
      } else {
        mostrarErro(resultado.erro.message || 'Não foi possível salvar a classificação');
      }
      return;
    }
    mostrarSucesso('Classificação registrada com histórico preservado');
    onAlteracao?.();
  };

  if (classificacao.carregando && !classificacao.dados) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-slate-700/60 p-4 text-sm text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando classificação…
      </div>
    );
  }

  if (!classificacao.dados) {
    return classificacao.erro ? (
      <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
        {classificacao.erro}
      </p>
    ) : null;
  }

  return (
    <section className="space-y-4 rounded-xl border border-violet-400/25 bg-violet-500/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 font-semibold text-white">
            <BarChart3 className="h-4 w-4 text-violet-300" />
            Transformar resposta em dado
          </h3>
          <p className="mt-1 text-xs text-slate-400">
            A resposta original e o motivo do atendimento ficam preservados.
          </p>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
          classificacao.dados.classificacao_desatualizada
            ? 'border-amber-400/30 bg-amber-400/10 text-amber-200'
            : atual
              ? 'border-green-400/30 bg-green-400/10 text-green-300'
              : 'border-slate-600 bg-slate-800 text-slate-300'
        }`}>
          {classificacao.dados.classificacao_desatualizada
            ? 'Conteúdo novo — reclassificar'
            : atual
              ? `Classificada · versão ${atual.versao}`
              : 'A classificar'}
        </span>
      </div>

      <div className="rounded-lg border border-slate-700/60 bg-slate-950/35 p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Motivo registrado
        </p>
        <p className="mt-1 text-sm text-slate-100">
          {classificacao.dados.motivo_cadastrado || 'Não havia motivo anterior'}
        </p>
      </div>

      {!analiseRevisada && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-200">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Revise a rodada mais recente antes de classificar.
        </div>
      )}

      <fieldset disabled={!analiseRevisada || salvando}>
        <legend className="mb-2 text-sm font-medium text-slate-200">
          Causas relatadas — selecione todas que se aplicam
        </legend>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {PESQUISA_EVASAO_CATEGORIAS.map((categoria) => (
            <label
              key={categoria}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-700/60 bg-slate-900/50 px-3 py-2 text-sm text-slate-200"
            >
              <input
                type="checkbox"
                checked={categorias.includes(categoria)}
                onChange={() => alternarCategoria(categoria)}
                className="h-4 w-4 accent-violet-500"
              />
              {rotulosCategoria[categoria]}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="block space-y-1.5 text-sm text-slate-200">
        <span>Relação com o motivo registrado</span>
        <select
          value={relacao}
          onChange={(event) => setRelacao(event.target.value as PesquisaEvasaoRelacaoMotivo)}
          disabled={!analiseRevisada || salvando}
          className="w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-slate-100"
        >
          {relacoes.map((item) => (
            <option key={item.value} value={item.value}>{item.label}</option>
          ))}
        </select>
      </label>

      <label className="block space-y-1.5 text-sm text-slate-200">
        <span>Justificativa {categorias.includes('outro') ? '(obrigatória)' : '(opcional)'}</span>
        <Textarea
          value={justificativa}
          onChange={(event) => setJustificativa(event.target.value)}
          maxLength={1000}
          disabled={!analiseRevisada || salvando}
          className="border-slate-700 bg-slate-950/60 text-slate-100"
        />
      </label>

      <Button onClick={salvar} disabled={bloqueado} className="bg-violet-600 hover:bg-violet-500">
        {salvando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
        Registrar classificação
      </Button>

      {classificacao.dados.historico_classificacoes.length > 1 && (
        <details className="rounded-lg border border-slate-700/60 bg-slate-950/30 p-3">
          <summary className="cursor-pointer text-sm font-medium text-slate-300">
            Versões anteriores
          </summary>
          <div className="mt-3 space-y-2">
            {classificacao.dados.historico_classificacoes.slice(1).map((versao) => (
              <div key={versao.id} className="text-xs text-slate-400">
                Versão {versao.versao} · {versao.categorias.map((item) => rotulosCategoria[item]).join(', ')} · {versao.revisor_nome}
              </div>
            ))}
          </div>
        </details>
      )}

      <AcoesPesquisaEvasao
        dados={classificacao.dados}
        criarAcao={classificacao.criarAcao}
        concluirAcao={classificacao.concluirAcao}
        registrarDesfecho={classificacao.registrarDesfecho}
        onAlteracao={onAlteracao}
      />
    </section>
  );
}
