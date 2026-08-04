import { useEffect, useState } from 'react';
import { CheckCircle2, ClipboardPlus, Loader2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/useToast';
import type {
  PesquisaEvasaoAcaoTipo,
  PesquisaEvasaoClassificacaoDados,
  PesquisaEvasaoDesfecho,
} from './pesquisaEvasao.types';

type ResultadoComando = Promise<
  | { ok: true; data: unknown }
  | { ok: false; erro: { message: string; code?: string } }
>;

interface Props {
  dados: PesquisaEvasaoClassificacaoDados;
  criarAcao: (entrada: {
    classificacaoId: string;
    tipo: PesquisaEvasaoAcaoTipo;
    descricao: string;
    prazoEm: string | null;
    professorId: number | null;
  }) => ResultadoComando;
  concluirAcao: (
    acaoId: string,
    estado: 'realizada' | 'cancelada',
    observacao: string,
  ) => ResultadoComando;
  registrarDesfecho: (
    classificacaoId: string,
    desfecho: PesquisaEvasaoDesfecho,
    observacao: string,
  ) => ResultadoComando;
  onAlteracao?: () => void;
}

const tiposAcao: Array<{ value: PesquisaEvasaoAcaoTipo; label: string }> = [
  { value: 'retorno_familia', label: 'Criar ação de retorno' },
  { value: 'encaminhar_coordenacao', label: 'Encaminhar para coordenação' },
  { value: 'encaminhar_financeiro', label: 'Encaminhar para financeiro' },
  { value: 'vincular_professor', label: 'Vincular ao professor' },
  { value: 'tentativa_retencao', label: 'Marcar tentativa de retenção' },
  { value: 'solucao_oferecida', label: 'Registrar solução oferecida' },
  { value: 'outro', label: 'Outra ação' },
];

const desfechos: Array<{ value: PesquisaEvasaoDesfecho; label: string }> = [
  { value: 'recuperou', label: 'Recuperou' },
  { value: 'prometeu_voltar', label: 'Prometeu voltar' },
  { value: 'confirmou_saida', label: 'Confirmou a saída' },
];

export function AcoesPesquisaEvasao({
  dados,
  criarAcao,
  concluirAcao,
  registrarDesfecho,
  onAlteracao,
}: Props) {
  const { error: mostrarErro, success: mostrarSucesso } = useToast();
  const [tipo, setTipo] = useState<PesquisaEvasaoAcaoTipo>('retorno_familia');
  const [descricao, setDescricao] = useState('');
  const [prazoEm, setPrazoEm] = useState('');
  const [professorId, setProfessorId] = useState('');
  const [professores, setProfessores] = useState<Array<{ id: number; nome: string }>>([]);
  const [desfecho, setDesfecho] = useState<PesquisaEvasaoDesfecho>('confirmou_saida');
  const [observacaoDesfecho, setObservacaoDesfecho] = useState('');
  const [processando, setProcessando] = useState(false);

  const vigente = Boolean(dados.classificacao_atual && !dados.classificacao_desatualizada);

  useEffect(() => {
    if (tipo !== 'vincular_professor' || professores.length > 0) return;
    void supabase
      .from('professores')
      .select('id, nome')
      .eq('ativo', true)
      .order('nome')
      .then(({ data, error }) => {
        if (error) {
          mostrarErro('Não foi possível carregar os professores');
          return;
        }
        setProfessores((data ?? []) as Array<{ id: number; nome: string }>);
      });
  }, [mostrarErro, professores.length, tipo]);

  const adicionarAcao = async () => {
    const classificacaoId = dados.classificacao_atual?.id;
    if (!classificacaoId || !vigente || !descricao.trim()) return;
    setProcessando(true);
    const resultado = await criarAcao({
      classificacaoId,
      tipo,
      descricao: descricao.trim(),
      prazoEm: prazoEm ? new Date(prazoEm).toISOString() : null,
      professorId: tipo === 'vincular_professor' && professorId ? Number(professorId) : null,
    });
    setProcessando(false);
    if (!resultado.ok) {
      mostrarErro(resultado.erro.message || 'Não foi possível criar a ação');
      return;
    }
    setDescricao('');
    setPrazoEm('');
    setProfessorId('');
    mostrarSucesso('Ação criada');
    onAlteracao?.();
  };

  const encerrarAcao = async (acaoId: string, estado: 'realizada' | 'cancelada') => {
    const verbo = estado === 'realizada' ? 'concluir' : 'cancelar';
    if (!window.confirm(`Confirma ${verbo} esta ação?`)) return;
    const observacao = window.prompt('Observação da conclusão (opcional):', '') ?? '';
    setProcessando(true);
    const resultado = await concluirAcao(acaoId, estado, observacao);
    setProcessando(false);
    if (!resultado.ok) {
      mostrarErro(resultado.erro.message || 'Não foi possível encerrar a ação');
      return;
    }
    mostrarSucesso(estado === 'realizada' ? 'Ação concluída' : 'Ação cancelada');
    onAlteracao?.();
  };

  const salvarDesfecho = async () => {
    const classificacaoId = dados.classificacao_atual?.id;
    if (!classificacaoId || !vigente) return;
    setProcessando(true);
    const resultado = await registrarDesfecho(
      classificacaoId,
      desfecho,
      observacaoDesfecho.trim(),
    );
    setProcessando(false);
    if (!resultado.ok) {
      mostrarErro(resultado.erro.message || 'Não foi possível registrar o desfecho');
      return;
    }
    setObservacaoDesfecho('');
    mostrarSucesso('Desfecho registrado sem apagar o anterior');
    onAlteracao?.();
  };

  return (
    <div className="space-y-4 border-t border-slate-700/60 pt-4">
      <div>
        <h4 className="flex items-center gap-2 text-sm font-semibold text-white">
          <ClipboardPlus className="h-4 w-4 text-blue-300" />
          Ações e resultado
        </h4>
        {!vigente && (
          <p className="mt-1 text-xs text-amber-300">
            Reclassifique a resposta mais recente antes de criar ações ou desfechos.
          </p>
        )}
      </div>

      {dados.acoes.length > 0 && (
        <div className="space-y-2">
          {dados.acoes.map((acao) => (
            <div key={acao.id} className="rounded-lg border border-slate-700/60 bg-slate-950/35 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-slate-100">{acao.descricao}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {tiposAcao.find((item) => item.value === acao.tipo)?.label ?? acao.tipo}
                    {' · '}{acao.realizado_por_nome}
                  </p>
                </div>
                <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300">
                  {acao.estado}
                </span>
              </div>
              {acao.estado === 'pendente' && (
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => encerrarAcao(acao.id, 'realizada')} disabled={processando}>
                    <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Concluir
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => encerrarAcao(acao.id, 'cancelada')} disabled={processando}>
                    <XCircle className="mr-1.5 h-3.5 w-3.5" /> Cancelar
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-3 rounded-lg border border-slate-700/60 bg-slate-900/40 p-3 md:grid-cols-2">
        <label className="space-y-1.5 text-sm text-slate-200">
          <span>Tipo de ação</span>
          <select value={tipo} onChange={(event) => setTipo(event.target.value as PesquisaEvasaoAcaoTipo)} disabled={!vigente || processando} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2">
            {tiposAcao.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        <label className="space-y-1.5 text-sm text-slate-200">
          <span>Prazo (opcional)</span>
          <input type="datetime-local" value={prazoEm} onChange={(event) => setPrazoEm(event.target.value)} disabled={!vigente || processando} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2" />
        </label>
        {tipo === 'vincular_professor' && (
          <label className="space-y-1.5 text-sm text-slate-200 md:col-span-2">
            <span>Professor</span>
            <select value={professorId} onChange={(event) => setProfessorId(event.target.value)} disabled={!vigente || processando} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2">
              <option value="">Selecione…</option>
              {professores.map((professor) => <option key={professor.id} value={professor.id}>{professor.nome}</option>)}
            </select>
          </label>
        )}
        <label className="space-y-1.5 text-sm text-slate-200 md:col-span-2">
          <span>Descrição</span>
          <Textarea value={descricao} onChange={(event) => setDescricao(event.target.value)} maxLength={1000} disabled={!vigente || processando} className="border-slate-700 bg-slate-950 text-slate-100" />
        </label>
        <Button onClick={adicionarAcao} disabled={!vigente || processando || !descricao.trim() || (tipo === 'vincular_professor' && !professorId)} className="md:w-fit">
          {processando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Criar ação
        </Button>
      </div>

      <div className="grid gap-3 rounded-lg border border-slate-700/60 bg-slate-900/40 p-3 md:grid-cols-2">
        <label className="space-y-1.5 text-sm text-slate-200">
          <span>Desfecho</span>
          <select value={desfecho} onChange={(event) => setDesfecho(event.target.value as PesquisaEvasaoDesfecho)} disabled={!vigente || processando} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2">
            {desfechos.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        <label className="space-y-1.5 text-sm text-slate-200">
          <span>Observação (opcional)</span>
          <input value={observacaoDesfecho} onChange={(event) => setObservacaoDesfecho(event.target.value)} maxLength={1000} disabled={!vigente || processando} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2" />
        </label>
        <Button onClick={salvarDesfecho} disabled={!vigente || processando} variant="outline" className="md:w-fit">
          Registrar desfecho
        </Button>
        {dados.desfecho_atual && (
          <p className="self-center text-xs text-slate-400">
            Atual: {desfechos.find((item) => item.value === dados.desfecho_atual?.desfecho)?.label}
          </p>
        )}
      </div>
    </div>
  );
}
