import { useMemo, useState } from 'react';
import {
  BookOpen, Plus, Trash2, ChevronUp, ChevronDown, Eye, Save, X, Pencil, Globe, Building2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { UNIDADES } from './unidades';
import {
  useBaseConhecimento,
  type BlocoConhecimento,
  type BlocoRascunho,
} from '../../hooks/useBaseConhecimento';

interface ConhecimentoSectionProps {
  /** Unidade escolhida no topo da aba Configurações. */
  unidadeId: string;
}

const ESCOPO_GLOBAL = 'global';

const RASCUNHO_VAZIO: BlocoRascunho = {
  titulo: '',
  conteudo: '',
  unidade_id: null,
  ativo: true,
};

export function ConhecimentoSection({ unidadeId }: ConhecimentoSectionProps) {
  const {
    blocos, loading, salvando,
    criar, atualizar, alternarAtivo, remover, mover, previewDaMila,
  } = useBaseConhecimento();

  const [editando, setEditando] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState<BlocoRascunho>(RASCUNHO_VAZIO);
  const [criandoNovo, setCriandoNovo] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [carregandoPreview, setCarregandoPreview] = useState(false);

  // O que a Mila desta unidade recebe: os globais + os dela. Bloco de OUTRA
  // unidade continua listado (a equipe precisa enxergar tudo que existe), mas
  // marcado como fora do alcance dela.
  const ordenados = useMemo(
    () => [...blocos].sort((a, b) => a.ordem - b.ordem || a.titulo.localeCompare(b.titulo)),
    [blocos]
  );

  const alcancaUnidade = (b: BlocoConhecimento) =>
    b.unidade_id === null || b.unidade_id === unidadeId;

  const totais = useMemo(() => {
    const naMila = ordenados.filter(b => b.ativo && alcancaUnidade(b));
    const caracteres = naMila.reduce(
      (acc, b) => acc + b.titulo.length + b.conteudo.length + 6,
      '# Base de Conhecimento LA Music'.length
    );
    return { blocosNaMila: naMila.length, caracteres };
  }, [ordenados, unidadeId]);

  const abrirEdicao = (bloco: BlocoConhecimento) => {
    setCriandoNovo(false);
    setEditando(bloco.id);
    setRascunho({
      titulo: bloco.titulo,
      conteudo: bloco.conteudo,
      unidade_id: bloco.unidade_id,
      ativo: bloco.ativo,
    });
  };

  const abrirNovo = () => {
    setEditando(null);
    setCriandoNovo(true);
    setRascunho({ ...RASCUNHO_VAZIO });
  };

  const fecharEditor = () => {
    setEditando(null);
    setCriandoNovo(false);
    setRascunho({ ...RASCUNHO_VAZIO });
  };

  const salvarRascunho = async () => {
    if (!rascunho.titulo.trim() || !rascunho.conteudo.trim()) return;
    const ok = criandoNovo
      ? await criar(rascunho)
      : editando && await atualizar(editando, rascunho);
    if (ok) fecharEditor();
  };

  const verComoAMilaVe = async () => {
    setCarregandoPreview(true);
    try {
      setPreview(await previewDaMila(unidadeId));
    } finally {
      setCarregandoPreview(false);
    }
  };

  const editorAberto = criandoNovo || editando !== null;
  const rascunhoValido = rascunho.titulo.trim().length > 0 && rascunho.conteudo.trim().length > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-cyan-500/20">
            <BookOpen className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Base de Conhecimento</h2>
            <p className="text-sm text-slate-400">
              O que a Mila responde sobre a escola — diferenciais, funcionamento e dúvidas frequentes
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={verComoAMilaVe}
            disabled={carregandoPreview}
            className="border-slate-700 text-slate-300 hover:text-white"
          >
            <Eye className="w-4 h-4 mr-2" />
            {carregandoPreview ? 'Carregando...' : 'Ver como a Mila vê'}
          </Button>
          <Button onClick={abrirNovo} className="bg-cyan-600 hover:bg-cyan-500 text-white">
            <Plus className="w-4 h-4 mr-2" />
            Novo bloco
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-slate-700/50 bg-slate-900/30 px-4 py-2.5 text-xs text-slate-400">
        A Mila de <span className="text-slate-200">{UNIDADES[unidadeId]}</span> recebe{' '}
        <span className="text-slate-200">{totais.blocosNaMila} bloco{totais.blocosNaMila === 1 ? '' : 's'}</span>{' '}
        (~{totais.caracteres.toLocaleString('pt-BR')} caracteres): os globais mais os desta unidade.
      </div>

      {/* Editor */}
      {editorAberto && (
        <div className="rounded-xl border border-cyan-500/30 bg-slate-900/50 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-white">
              {criandoNovo ? 'Novo bloco' : 'Editar bloco'}
            </h3>
            <Button variant="ghost" size="icon" onClick={fecharEditor} className="text-slate-400 hover:text-white">
              <X className="w-4 h-4" />
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5 md:col-span-2">
              <Label className="text-xs text-slate-400">Título</Label>
              <Input
                value={rascunho.titulo}
                onChange={(e) => setRascunho(p => ({ ...p, titulo: e.target.value }))}
                placeholder="Ex: Política de reposição de falta"
                className="bg-slate-800/50 border-slate-700 text-white text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-400">Vale para</Label>
              <Select
                value={rascunho.unidade_id ?? ESCOPO_GLOBAL}
                onValueChange={(v) =>
                  setRascunho(p => ({ ...p, unidade_id: v === ESCOPO_GLOBAL ? null : v }))
                }
              >
                <SelectTrigger className="bg-slate-800/50 border-slate-700 text-white text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ESCOPO_GLOBAL}>Todas as unidades</SelectItem>
                  {Object.entries(UNIDADES).map(([id, nome]) => (
                    <SelectItem key={id} value={id}>Só {nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-slate-400">Conteúdo</Label>
            <Textarea
              value={rascunho.conteudo}
              onChange={(e) => setRascunho(p => ({ ...p, conteudo: e.target.value }))}
              placeholder={'- Um item por linha funciona bem\n- A Mila lê como markdown'}
              className="bg-slate-800/50 border-slate-700 text-white text-sm font-mono"
              rows={10}
            />
            <p className="text-xs text-slate-500">
              Escreva como você explicaria para um lead. A Mila usa isso como fonte — o que não estiver
              aqui, ela não sabe.
            </p>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Switch
                checked={rascunho.ativo}
                onCheckedChange={(v) => setRascunho(p => ({ ...p, ativo: v }))}
              />
              <Label className="text-xs text-slate-400">
                {rascunho.ativo ? 'Ativo — vai para a Mila' : 'Inativo — fica guardado, mas não vai'}
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={fecharEditor} className="text-slate-400 hover:text-white">
                Cancelar
              </Button>
              <Button
                onClick={salvarRascunho}
                disabled={salvando || !rascunhoValido}
                className="bg-cyan-600 hover:bg-cyan-500 text-white"
              >
                <Save className="w-4 h-4 mr-2" />
                {salvando ? 'Salvando...' : 'Salvar bloco'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="text-slate-400 text-sm">Carregando base de conhecimento...</div>
        </div>
      ) : ordenados.length === 0 ? (
        <div className="rounded-xl border border-slate-700/50 bg-slate-900/30 p-8">
          <div className="flex flex-col items-center justify-center gap-3">
            <BookOpen className="w-10 h-10 text-slate-600" />
            <p className="text-slate-400 text-sm">Nenhum bloco cadastrado</p>
            <Button onClick={abrirNovo} className="bg-cyan-600 hover:bg-cyan-500 text-white">
              <Plus className="w-4 h-4 mr-2" />
              Criar o primeiro
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {ordenados.map((bloco, indice) => {
            const noAlcance = alcancaUnidade(bloco);
            const global = bloco.unidade_id === null;

            return (
              <div
                key={bloco.id}
                className={cn(
                  'rounded-xl border p-4',
                  bloco.ativo && noAlcance
                    ? 'border-slate-700/50 bg-slate-900/50'
                    : 'border-slate-800/50 bg-slate-900/20 opacity-60'
                )}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold text-white truncate">{bloco.titulo}</h3>
                      <span
                        className={cn(
                          'text-xs px-2 py-0.5 rounded-full flex items-center gap-1',
                          global
                            ? 'bg-sky-500/20 text-sky-400'
                            : 'bg-violet-500/20 text-violet-400'
                        )}
                      >
                        {global ? <Globe className="w-3 h-3" /> : <Building2 className="w-3 h-3" />}
                        {global ? 'Todas' : UNIDADES[bloco.unidade_id!] ?? 'Unidade'}
                      </span>
                      {!noAlcance && (
                        <span className="text-xs text-slate-500">
                          não vai para a Mila de {UNIDADES[unidadeId]}
                        </span>
                      )}
                    </div>
                    <p className="mt-1.5 text-xs text-slate-400 line-clamp-2 whitespace-pre-line">
                      {bloco.conteudo}
                    </p>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => mover(bloco, 'cima')}
                      disabled={indice === 0}
                      className="p-1 text-slate-500 hover:text-white disabled:opacity-30 disabled:hover:text-slate-500"
                      title="Subir"
                    >
                      <ChevronUp className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => mover(bloco, 'baixo')}
                      disabled={indice === ordenados.length - 1}
                      className="p-1 text-slate-500 hover:text-white disabled:opacity-30 disabled:hover:text-slate-500"
                      title="Descer"
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>
                    <Switch checked={bloco.ativo} onCheckedChange={() => alternarAtivo(bloco)} />
                    <button
                      onClick={() => abrirEdicao(bloco)}
                      className="p-1 text-slate-500 hover:text-cyan-400"
                      title="Editar"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => remover(bloco)}
                      className="p-1 text-slate-500 hover:text-rose-400"
                      title="Remover"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Preview — o texto exato que a Mila recebe, vindo da mesma RPC da edge */}
      {preview !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setPreview(null)}
        >
          <div
            className="w-full max-w-3xl max-h-[80vh] rounded-xl border border-slate-700 bg-slate-900 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-700 px-5 py-3">
              <div>
                <h3 className="text-base font-semibold text-white">
                  O que a Mila de {UNIDADES[unidadeId]} recebe
                </h3>
                <p className="text-xs text-slate-400">
                  Texto exato devolvido pela tool bd_conhecimento
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setPreview(null)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </Button>
            </div>
            <pre className="flex-1 overflow-auto px-5 py-4 text-xs text-slate-300 whitespace-pre-wrap font-mono">
              {preview || '(vazio — nenhum bloco ativo alcança esta unidade)'}
            </pre>
            <div className="border-t border-slate-700 px-5 py-2.5 text-xs text-slate-500">
              {preview.length.toLocaleString('pt-BR')} caracteres
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
