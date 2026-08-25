import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Guitar, Plus, Trash2, UserPlus } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { TimePicker24h } from '@/components/ui/time-picker-24h';
import { AutocompleteAlunoBanda } from './AutocompleteAlunoBanda';
import { supabase } from '@/lib/supabase';
import { iniciaisDoNome } from '@/lib/agenda';
import { cn } from '@/lib/utils';
import {
  criarBanda, atualizarBandaAvulsa, upsertIntegranteBanda, fetchProfessoresBanda,
  DIAS_SEMANA, FREQUENCIAS, MODELOS_FINANCEIRO,
  type BandaDetalhe, type ModeloFinanceiro, type FrequenciaBanda,
  type ProfessorBanda, type AlunoBanda,
} from '@/hooks/useBandas';

export const MODELO_FINANCEIRO_LABEL: Record<ModeloFinanceiro, string> = {
  percentual: '% da receita',
  fixo_ensaio: 'Valor fixo por ensaio',
  fixo_mensal: 'Valor fixo mensal',
};

export const FREQUENCIA_LABEL: Record<FrequenciaBanda, string> = {
  semanal: 'Semanal',
  quinzenal: 'Quinzenal',
  mensal: 'Mensal',
};

interface Sala {
  id: number;
  nome: string;
  unidade_id: string;
}

interface IntegranteForm {
  aluno: AlunoBanda;
  instrumento: string;
  funcao: string;
}

interface ModalBandaAvulsaProps {
  aberto: boolean;
  /** null = criar; preenchido = editar (só banda avulsa) */
  banda: BandaDetalhe | null;
  unidadeAtual: string;
  onClose: () => void;
  onSalvo: () => void;
}

function horarioParaInput(horario: string | null | undefined): string {
  return horario ? horario.slice(0, 5) : '';
}

function parseValor(txt: string): number | null | 'invalido' {
  if (!txt.trim()) return null;
  const n = Number(txt.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : 'invalido';
}

export function ModalBandaAvulsa({ aberto, banda, unidadeAtual, onClose, onSalvo }: ModalBandaAvulsaProps) {
  const isEdicao = !!banda;

  // Dados
  const [unidadeId, setUnidadeId] = useState('');
  const [nome, setNome] = useState('');
  const [produtorId, setProdutorId] = useState('');
  const [genero, setGenero] = useState('');
  const [descricao, setDescricao] = useState('');

  // Ensaios
  const [diaSemana, setDiaSemana] = useState('');
  const [salaId, setSalaId] = useState('');
  const [horaInicio, setHoraInicio] = useState('');
  const [horaFim, setHoraFim] = useState('');
  const [frequencia, setFrequencia] = useState('');

  // Financeiro (opcional — não bloqueia o submit)
  const [modelo, setModelo] = useState<ModeloFinanceiro | ''>('');
  const [valorMensalAluno, setValorMensalAluno] = useState('');
  const [valorRepasse, setValorRepasse] = useState('');

  // Integrantes (só na criação; na edição o detalhe da banda gerencia o roster)
  const [integrantes, setIntegrantes] = useState<IntegranteForm[]>([]);
  const [buscaAluno, setBuscaAluno] = useState('');
  const [alunoSelecionado, setAlunoSelecionado] = useState<AlunoBanda | null>(null);
  const [instrumento, setInstrumento] = useState('');
  const [funcao, setFuncao] = useState('');

  const [professores, setProfessores] = useState<ProfessorBanda[]>([]);
  const [salas, setSalas] = useState<Sala[]>([]);
  const [unidades, setUnidades] = useState<{ id: string; nome: string }[]>([]);
  const [salvando, setSalvando] = useState(false);

  // Salas e unidades (mesmas fontes canônicas do resto do app)
  useEffect(() => {
    if (!aberto) return;
    supabase.from('salas').select('id, nome, unidade_id').eq('ativo', true).order('nome')
      .then(({ data }) => setSalas((data as Sala[]) || []));
    supabase.from('unidades').select('id, nome').eq('ativo', true).order('nome')
      .then(({ data }) => setUnidades(data || []));
  }, [aberto]);

  // Produtores escopados pela unidade do form (RPC banda_professores_da_unidade).
  // Sem unidade → select vazio/desabilitado; unidade mudou → recarrega e limpa escolha.
  useEffect(() => {
    if (!aberto) return;
    if (!unidadeId) {
      setProfessores([]);
      return;
    }
    fetchProfessoresBanda(unidadeId).then(setProfessores);
  }, [aberto, unidadeId]);

  function trocarUnidade(novaUnidade: string) {
    setUnidadeId(novaUnidade);
    setProdutorId('');
    setSalaId('');
    setBuscaAluno('');
    setAlunoSelecionado(null);
    setIntegrantes([]);
  }

  // Preencher formulário (edição) ou limpar (criação)
  useEffect(() => {
    if (!aberto) return;
    setUnidadeId(isEdicao ? banda.unidade_id : (unidadeAtual !== 'todos' ? unidadeAtual : ''));
    setNome(banda?.nome || '');
    setProdutorId(banda?.produtor_professor_id ? String(banda.produtor_professor_id) : '');
    setGenero(banda?.genero || '');
    setDescricao(banda?.descricao || '');
    setDiaSemana(banda?.dia_semana || '');
    setSalaId(banda?.sala_id ? String(banda.sala_id) : '');
    setHoraInicio(horarioParaInput(banda?.horario));
    setHoraFim(horarioParaInput(banda?.horario_fim));
    setFrequencia(banda?.frequencia || '');
    setModelo(banda?.modelo_financeiro || '');
    setValorMensalAluno(banda?.valor_mensal_aluno != null ? String(banda.valor_mensal_aluno).replace('.', ',') : '');
    setValorRepasse(banda?.valor_repasse != null ? String(banda.valor_repasse).replace('.', ',') : '');
    setIntegrantes([]);
    setBuscaAluno('');
    setAlunoSelecionado(null);
    setInstrumento('');
    setFuncao('');
  }, [aberto, banda, isEdicao, unidadeAtual]);

  function adicionarIntegrante() {
    if (!alunoSelecionado) {
      toast.error('Escolha um aluno da lista para adicionar.');
      return;
    }
    if (integrantes.some((i) => i.aluno.aluno_id === alunoSelecionado.aluno_id)) {
      toast.error('Este aluno já está na lista.');
      return;
    }
    setIntegrantes((prev) => [...prev, { aluno: alunoSelecionado, instrumento: instrumento.trim(), funcao: funcao.trim() }]);
    setBuscaAluno('');
    setAlunoSelecionado(null);
    setInstrumento('');
    setFuncao('');
  }

  async function handleSalvar() {
    if (!nome.trim()) {
      toast.error('Informe o nome da banda.');
      return;
    }
    if (!unidadeId) {
      toast.error('Selecione a unidade da banda.');
      return;
    }
    const mensalNum = parseValor(valorMensalAluno);
    const repasseNum = parseValor(valorRepasse);
    if (mensalNum === 'invalido' || repasseNum === 'invalido') {
      toast.error('Valor financeiro inválido', { description: 'Use um número maior ou igual a zero.' });
      return;
    }

    const dados = {
      nome: nome.trim(),
      produtorProfessorId: produtorId ? Number(produtorId) : null,
      genero: genero.trim() || null,
      descricao: descricao.trim() || null,
      diaSemana: diaSemana || null,
      horario: horaInicio || null,
      horarioFim: horaFim || null,
      frequencia: frequencia || null,
      salaId: salaId ? Number(salaId) : null,
      modeloFinanceiro: (modelo || null) as ModeloFinanceiro | null,
      valorMensalAluno: mensalNum,
      valorRepasse: repasseNum,
    };

    setSalvando(true);

    if (isEdicao && banda) {
      const { error } = await atualizarBandaAvulsa(banda.banda_id, dados);
      setSalvando(false);
      if (error) {
        toast.error('Erro ao atualizar banda', { description: error.message });
        return;
      }
      toast.success('Banda atualizada', { description: dados.nome });
      onSalvo();
      return;
    }

    const { data: bandaId, error } = await criarBanda(unidadeId, dados);
    if (error || bandaId == null) {
      setSalvando(false);
      toast.error('Erro ao criar banda', { description: error?.message });
      return;
    }

    // Roster inicial: um upsert por integrante escolhido
    let falhas = 0;
    for (const int of integrantes) {
      const { error: erroInt } = await upsertIntegranteBanda({
        bandaId: Number(bandaId),
        alunoId: int.aluno.aluno_id,
        instrumento: int.instrumento || null,
        funcao: int.funcao || null,
      });
      if (erroInt) {
        falhas += 1;
        console.error('Erro ao adicionar integrante:', erroInt);
      }
    }
    setSalvando(false);
    if (falhas > 0) {
      toast.warning(`Banda criada, mas ${falhas} integrante(s) falharam`, {
        description: 'Abra o detalhe da banda para tentar de novo.',
      });
    } else {
      toast.success('Banda criada', { description: dados.nome });
    }
    onSalvo();
  }

  return (
    <Dialog open={aberto} onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdicao ? 'Editar banda' : 'Nova banda'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Dados */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Guitar className="w-4 h-4 text-violet-400" />
              Dados
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="banda-nome">Nome da banda *</Label>
                <Input
                  id="banda-nome"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Ex.: Os Trovões, Sunset Trio..."
                />
              </div>
              {!isEdicao && (
                <div className="space-y-2">
                  <Label>Unidade *</Label>
                  <Select value={unidadeId} onValueChange={trocarUnidade}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {unidades.map((u) => (
                        <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-2">
                <Label>Professor responsável (produtor)</Label>
                <Select value={produtorId} onValueChange={setProdutorId} disabled={!unidadeId}>
                  <SelectTrigger>
                    <SelectValue placeholder={unidadeId ? 'Selecione' : 'Escolha a unidade primeiro'} />
                  </SelectTrigger>
                  <SelectContent>
                    {professores.map((p) => (
                      <SelectItem key={p.professor_id} value={String(p.professor_id)}>{p.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="banda-genero">Gênero musical</Label>
                <Input
                  id="banda-genero"
                  value={genero}
                  onChange={(e) => setGenero(e.target.value)}
                  placeholder="Ex.: Rock, Pop, MPB..."
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="banda-descricao">Descrição / objetivo</Label>
              <Textarea
                id="banda-descricao"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Ex.: banda montada para o show de fim de ano..."
                rows={2}
              />
            </div>
          </section>

          {/* Ensaios */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-white">Ensaios</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Dia fixo</Label>
                <Select value={diaSemana} onValueChange={setDiaSemana}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {DIAS_SEMANA.map((d) => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Horário início</Label>
                <TimePicker24h value={horaInicio} onChange={setHoraInicio} placeholder="Início" />
              </div>
              <div className="space-y-2">
                <Label>Horário fim</Label>
                <TimePicker24h value={horaFim} onChange={setHoraFim} placeholder="Fim" />
              </div>
              <div className="space-y-2">
                <Label>Sala</Label>
                <Select value={salaId} onValueChange={setSalaId}>
                  <SelectTrigger><SelectValue placeholder="Sem sala" /></SelectTrigger>
                  <SelectContent>
                    {salas
                      .filter((s) => !unidadeId || s.unidade_id === unidadeId)
                      .map((s) => (
                        <SelectItem key={s.id} value={String(s.id)}>{s.nome}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Frequência</Label>
                <Select value={frequencia} onValueChange={setFrequencia}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {FREQUENCIAS.map((f) => (
                      <SelectItem key={f} value={f}>{FREQUENCIA_LABEL[f]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          {/* Financeiro (opcional) */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-white">
              Financeiro <span className="text-xs font-normal text-slate-500">(opcional)</span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {MODELOS_FINANCEIRO.map((m) => (
                <label
                  key={m}
                  className={cn(
                    'flex items-center justify-center p-3 rounded-xl border cursor-pointer transition-all text-sm',
                    modelo === m
                      ? 'border-violet-500 bg-violet-500/20 text-white'
                      : 'border-slate-700 text-slate-400 hover:border-slate-600',
                  )}
                >
                  <input
                    type="radio"
                    name="modelo-financeiro"
                    value={m}
                    checked={modelo === m}
                    onChange={() => setModelo(m)}
                    className="sr-only"
                  />
                  {MODELO_FINANCEIRO_LABEL[m]}
                </label>
              ))}
            </div>
            {modelo && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="banda-valor-mensal">Valor mensal por aluno (R$)</Label>
                  <Input
                    id="banda-valor-mensal"
                    value={valorMensalAluno}
                    onChange={(e) => setValorMensalAluno(e.target.value.replace(/[^\d.,]/g, ''))}
                    inputMode="decimal"
                    placeholder="Ex.: 120,00"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="banda-valor-repasse">
                    {modelo === 'percentual' ? 'Repasse (%)' : 'Valor do repasse (R$)'}
                  </Label>
                  <Input
                    id="banda-valor-repasse"
                    value={valorRepasse}
                    onChange={(e) => setValorRepasse(e.target.value.replace(/[^\d.,]/g, ''))}
                    inputMode="decimal"
                    placeholder={modelo === 'percentual' ? 'Ex.: 30' : 'Ex.: 150,00'}
                  />
                </div>
              </div>
            )}
          </section>

          {/* Integrantes — só na criação (na edição, o detalhe da banda gerencia) */}
          {!isEdicao && (
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-cyan-400" />
                Integrantes
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_130px_130px_auto] gap-2 items-end">
                <div className="space-y-2">
                  <Label>Aluno</Label>
                  <AutocompleteAlunoBanda
                    value={buscaAluno}
                    onChange={(nomeAluno, aluno) => {
                      setBuscaAluno(nomeAluno);
                      setAlunoSelecionado(aluno || null);
                    }}
                    unidadeId={unidadeId || null}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="int-instrumento">Instrumento</Label>
                  <Input
                    id="int-instrumento"
                    value={instrumento}
                    onChange={(e) => setInstrumento(e.target.value)}
                    placeholder="Ex.: Guitarra"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="int-funcao">Função</Label>
                  <Input
                    id="int-funcao"
                    value={funcao}
                    onChange={(e) => setFuncao(e.target.value)}
                    placeholder="Opcional"
                  />
                </div>
                <Button type="button" variant="outline" onClick={adicionarIntegrante}>
                  <Plus className="w-4 h-4 mr-1" />
                  Adicionar
                </Button>
              </div>

              {integrantes.length > 0 && (
                <div className="space-y-2">
                  {integrantes.map((int) => (
                    <div
                      key={int.aluno.aluno_id}
                      className="flex items-center gap-3 bg-slate-800/40 border border-slate-700/40 rounded-xl px-3 py-2"
                    >
                      {int.aluno.foto_url ? (
                        <img
                          src={int.aluno.foto_url}
                          alt={int.aluno.nome}
                          className="h-8 w-8 shrink-0 rounded-full object-cover"
                        />
                      ) : (
                        <div
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-cyan-500 text-xs font-bold text-white"
                          aria-hidden="true"
                        >
                          {iniciaisDoNome(int.aluno.nome)}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-white truncate">{int.aluno.nome}</p>
                        <p className="text-xs text-slate-400">
                          {int.instrumento || 'Instrumento não definido'}
                          {int.funcao ? ` · ${int.funcao}` : ''}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-rose-400 hover:text-rose-300"
                        onClick={() => setIntegrantes((prev) => prev.filter((i) => i.aluno.aluno_id !== int.aluno.aluno_id))}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-slate-500">
                Banda avulsa não tem mínimo de integrantes — dá para criar agora e completar depois.
              </p>
            </section>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose} disabled={salvando}>
            Cancelar
          </Button>
          <Button onClick={handleSalvar} disabled={salvando}>
            {salvando ? 'Salvando...' : isEdicao ? 'Salvar alterações' : 'Criar banda'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
