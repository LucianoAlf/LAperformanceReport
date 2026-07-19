import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/Tooltip';
import { buscarOcupacoesTurmasProfessorCanonicas } from '@/lib/carteiraProfessorDetalheCanonica';

const STATUS_LABEL: Record<string, string> = {
  trancado: 'Trancados',
  evadido: 'Evadidos',
  inativo: 'Inativos',
  aviso_previo: 'Em aviso prévio',
};
function formatarStatus(s: string): string {
  return STATUS_LABEL[s] || s.charAt(0).toUpperCase() + s.slice(1);
}

interface LinhaAlunoTurma {
  aluno_id: number;
  aluno_nome: string;
  aluno_status: string;
  turma_chave: string;
  turma_nome: string | null;
  curso_nome: string;
  sala_nome: string | null;
  dia_semana: string;
  horario_inicio: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  professorId: number | null;
  professorNome: string;
  unidadeId: string;
  unidadeNome?: string;
  dataInicio?: string;
  dataFim?: string;
  periodoLabel?: string;
  resumoCanonico?: {
    totalTurmas: number;
    carteiraAlunos: number;
    ocupacoesRegulares: number;
    turmasRegulares: number;
    mediaAlunosTurma: number;
  };
}

const POR_PAGINA = 15;

const DIA_ISO: Record<string, number> = {
  'Segunda': 1, 'Segunda-feira': 1,
  'Terça': 2, 'Terça-feira': 2,
  'Quarta': 3, 'Quarta-feira': 3,
  'Quinta': 4, 'Quinta-feira': 4,
  'Sexta': 5, 'Sexta-feira': 5,
  'Sábado': 6, 'Domingo': 7,
};

export function ModalDetalhesTurmas({
  open, onClose, professorId, professorNome, unidadeId, unidadeNome,
  dataInicio, dataFim, periodoLabel, resumoCanonico,
}: Props) {
  const [linhas, setLinhas] = useState<LinhaAlunoTurma[]>([]);
  const [loading, setLoading] = useState(false);
  const [busca, setBusca] = useState('');
  const [filtroTurma, setFiltroTurma] = useState<string>('todos');
  const [filtroStatus, setFiltroStatus] = useState<string>('todos');
  const [pagina, setPagina] = useState(1);
  const hoje = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const periodoIncluiHoje = !dataInicio || !dataFim || (hoje >= dataInicio && hoje <= dataFim);

  useEffect(() => {
    if (!open || !professorId) return;

    if (!periodoIncluiHoje) {
      setLinhas([]);
      setLoading(false);
      setBusca('');
      setFiltroTurma('todos');
      setFiltroStatus('todos');
      setPagina(1);
      return;
    }

    let cancelado = false;

    async function fetchTurmas() {
      setLoading(true);
      setBusca('');
      setFiltroTurma('todos');
      setFiltroStatus('todos');
      setPagina(1);

      const data = await buscarOcupacoesTurmasProfessorCanonicas({
        professorId: professorId!,
        unidadeId,
      });
      if (cancelado) return;

      const lista: LinhaAlunoTurma[] = data.sort((a, b) => {
        const diaA = DIA_ISO[a.dia_semana] ?? 9;
        const diaB = DIA_ISO[b.dia_semana] ?? 9;
        if (diaA !== diaB) return diaA - diaB;
        if (a.horario_inicio !== b.horario_inicio) return a.horario_inicio.localeCompare(b.horario_inicio);
        return a.aluno_nome.localeCompare(b.aluno_nome);
      });

      setLinhas(lista);
      setLoading(false);
    }

    void fetchTurmas();
    return () => { cancelado = true; };
  }, [open, professorId, unidadeId, dataInicio, dataFim, periodoIncluiHoje]);

  // Lista de turmas únicas para o filtro (chave estável + label amigável)
  const turmasUnicas = useMemo(() => {
    const map = new Map<string, string>(); // chave -> label
    linhas.forEach(l => {
      if (!map.has(l.turma_chave)) {
        const label = l.turma_nome
          ? l.turma_nome
          : `${l.curso_nome} (${l.dia_semana} ${l.horario_inicio})`;
        map.set(l.turma_chave, label);
      }
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [linhas]);

  const linhasFiltradas = useMemo(() => {
    let resultado = linhas;
    if (busca) {
      const termo = busca.toLowerCase();
      resultado = resultado.filter(l => l.aluno_nome.toLowerCase().includes(termo));
    }
    if (filtroTurma !== 'todos') {
      resultado = resultado.filter(l => l.turma_chave === filtroTurma);
    }
    if (filtroStatus === 'ativo') {
      resultado = resultado.filter(l => l.aluno_status === 'ativo');
    } else if (filtroStatus === 'outros') {
      resultado = resultado.filter(l => l.aluno_status !== 'ativo');
    }
    return resultado;
  }, [linhas, busca, filtroTurma, filtroStatus]);

  useEffect(() => { setPagina(1); }, [busca, filtroTurma, filtroStatus]);

  const totalPaginas = Math.max(1, Math.ceil(linhasFiltradas.length / POR_PAGINA));
  const linhasPaginadas = linhasFiltradas.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);

  const alunosOutrosUnicos = useMemo(() => {
    const set = new Set<number>();
    linhas.forEach(l => { if (l.aluno_status !== 'ativo') set.add(l.aluno_id); });
    return set.size;
  }, [linhas]);
  // Breakdown de "outros" por status (alunos únicos por status)
  const breakdownOutros = useMemo(() => {
    const porStatus = new Map<string, Set<number>>();
    linhas.forEach(l => {
      if (l.aluno_status !== 'ativo') {
        if (!porStatus.has(l.aluno_status)) porStatus.set(l.aluno_status, new Set());
        porStatus.get(l.aluno_status)!.add(l.aluno_id);
      }
    });
    return Array.from(porStatus.entries())
      .map(([status, set]) => ({ status, count: set.size }))
      .sort((a, b) => b.count - a.count);
  }, [linhas]);
  const totalTurmas = resumoCanonico?.totalTurmas ?? 0;
  const alunosAtivos = resumoCanonico?.carteiraAlunos ?? 0;
  const media = (resumoCanonico?.mediaAlunosTurma ?? 0).toFixed(1);

  if (!professorId) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white">
            Turmas — {professorNome}
          </DialogTitle>
          <p className="text-sm text-slate-400">
            {unidadeNome && <span>{unidadeNome}</span>}
            {unidadeNome && periodoLabel && <span className="mx-1.5 text-slate-600">·</span>}
            {periodoLabel && <span className="capitalize">{periodoLabel}</span>}
          </p>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-violet-400" />
          </div>
        ) : (
          <>
            {/* Resumo */}
            <div className="grid grid-cols-4 gap-2 mb-4">
              <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                <p className="text-xs text-slate-400">Turmas</p>
                <p className="text-lg font-bold text-white">{totalTurmas}</p>
              </div>
              <div className="bg-emerald-500/10 rounded-lg p-3 text-center border border-emerald-500/20">
                <p className="text-xs text-slate-400">Alunos no período</p>
                <p className="text-lg font-bold text-emerald-400">{alunosAtivos}</p>
              </div>
              <Tooltip
                side="top"
                content={
                  <div className="text-xs max-w-[280px]">
                    <p className="font-medium text-slate-200 mb-1">Alunos com outro status na carteira</p>
                    <p className="text-slate-400 mb-2">não contam na média/turma:</p>
                    {breakdownOutros.length > 0 ? (
                      <ul className="space-y-0.5">
                        {breakdownOutros.map(({ status, count }) => (
                          <li key={status} className="flex justify-between gap-3">
                            <span className="text-slate-400">{formatarStatus(status)}</span>
                            <span className="text-white font-medium">{count}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-slate-500 italic">Nenhum</p>
                    )}
                    <p className="text-slate-500 text-[10px] mt-2 pt-1 border-t border-slate-700/50">
                      Exibidos para referência, mas excluídos do cálculo de média/turma.
                    </p>
                  </div>
                }
              >
                <div className="bg-slate-700/30 rounded-lg p-3 text-center border border-slate-600/30 cursor-help">
                  <p className="text-xs text-slate-400">Outros</p>
                  <p className="text-lg font-bold text-slate-300">
                    {periodoIncluiHoje ? alunosOutrosUnicos : '-'}
                  </p>
                </div>
              </Tooltip>
              <div className={cn(
                "rounded-lg p-3 text-center border",
                Number(media) >= 1.5 ? 'bg-emerald-500/10 border-emerald-500/20' :
                Number(media) >= 1.3 ? 'bg-amber-500/10 border-amber-500/20' :
                'bg-rose-500/10 border-rose-500/20'
              )}>
                <p className="text-xs text-slate-400">Média/Turma</p>
                <p className={cn(
                  "text-lg font-bold",
                  Number(media) >= 1.5 ? 'text-emerald-400' :
                  Number(media) >= 1.3 ? 'text-amber-400' : 'text-rose-400'
                )}>{media}</p>
                {resumoCanonico && (
                  <p className="mt-0.5 text-[10px] text-slate-500">
                    {resumoCanonico.ocupacoesRegulares} alunos / {resumoCanonico.turmasRegulares} turmas regulares
                  </p>
                )}
              </div>
            </div>

            {!periodoIncluiHoje ? (
              <div className="rounded-md border border-cyan-500/20 bg-cyan-500/5 px-4 py-3 text-sm text-slate-300">
                A competencia fechada preserva os totais auditados. A lista nominal abaixo so e exibida
                para o periodo atual, porque a API do Emusys nao fornece uma carteira historica retroativa.
              </div>
            ) : (
              <>
            {/* Filtros */}
            <div className="flex items-center gap-2 mb-3">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                <Input
                  value={busca}
                  onChange={e => setBusca(e.target.value)}
                  placeholder="Buscar aluno..."
                  className="pl-8 h-8 text-xs bg-slate-800/50 border-slate-700"
                />
              </div>
              <Select value={filtroTurma} onValueChange={v => setFiltroTurma(v)}>
                <SelectTrigger className="w-[180px] h-8 text-xs bg-slate-800/50 border-slate-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas as turmas</SelectItem>
                  {turmasUnicas.map(([chave, label]) => (
                    <SelectItem key={chave} value={chave}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filtroStatus} onValueChange={v => setFiltroStatus(v)}>
                <SelectTrigger className="w-[130px] h-8 text-xs bg-slate-800/50 border-slate-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos status</SelectItem>
                  <SelectItem value="ativo">Apenas ativos</SelectItem>
                  <SelectItem value="outros">Não ativos</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Tabela */}
            {linhas.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-sm">
                Nenhuma turma encontrada no período
              </div>
            ) : (
              <>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700 text-xs text-slate-400">
                      <th className="text-left py-2 px-2">Aluno</th>
                      <th className="text-center py-2 px-2">Status</th>
                      <th className="text-left py-2 px-2">Curso</th>
                      <th className="text-left py-2 px-2">Turma</th>
                      <th className="text-center py-2 px-2">Dia</th>
                      <th className="text-center py-2 px-2">Horário</th>
                      <th className="text-left py-2 px-2">Sala</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhasPaginadas.map((l, idx) => (
                      <tr key={`${l.aluno_id}-${l.turma_chave}-${idx}`} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                        <td className={cn(
                          "py-2 px-2 text-xs",
                          l.aluno_status === 'ativo' ? "text-white" : "text-slate-400 line-through"
                        )}>
                          {l.aluno_nome}
                        </td>
                        <td className="py-2 px-2 text-center">
                          <span className={cn(
                            'text-xs px-2 py-0.5 rounded-full whitespace-nowrap capitalize',
                            l.aluno_status === 'ativo' ? 'bg-emerald-500/20 text-emerald-400' :
                            l.aluno_status === 'trancado' ? 'bg-amber-500/20 text-amber-400' :
                            'bg-slate-700/50 text-slate-400'
                          )}>
                            {l.aluno_status}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-xs text-slate-300">{l.curso_nome}</td>
                        <td className="py-2 px-2 text-xs text-slate-400 max-w-[200px] truncate" title={l.turma_nome || '—'}>
                          {l.turma_nome || <span className="text-slate-600 italic">—</span>}
                        </td>
                        <td className="py-2 px-2 text-center text-xs text-slate-300">
                          {l.dia_semana}
                        </td>
                        <td className="py-2 px-2 text-center text-xs text-slate-300">
                          {l.horario_inicio}
                        </td>
                        <td className="py-2 px-2 text-xs text-slate-400">
                          {l.sala_nome || <span className="text-slate-600 italic">-</span>}
                        </td>
                      </tr>
                    ))}
                    {linhasPaginadas.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-6 text-center text-slate-500 text-xs">
                          Nenhum registro encontrado com os filtros atuais
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>

                {/* Paginação */}
                {totalPaginas > 1 && (
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-700/50">
                    <span className="text-xs text-slate-500">
                      {linhasFiltradas.length} registro{linhasFiltradas.length !== 1 ? 's' : ''} | Página {pagina} de {totalPaginas}
                    </span>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" disabled={pagina <= 1} onClick={() => setPagina(p => p - 1)}>
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                      {Array.from({ length: totalPaginas }, (_, i) => i + 1)
                        .filter(p => p === 1 || p === totalPaginas || Math.abs(p - pagina) <= 1)
                        .map((p, i, arr) => (
                          <span key={p}>
                            {i > 0 && arr[i - 1] !== p - 1 && <span className="text-slate-600 px-1">...</span>}
                            <Button
                              variant={p === pagina ? 'default' : 'ghost'}
                              size="icon"
                              className={cn('h-7 w-7 text-xs', p === pagina && 'bg-violet-600')}
                              onClick={() => setPagina(p)}
                            >
                              {p}
                            </Button>
                          </span>
                        ))}
                      <Button variant="ghost" size="icon" className="h-7 w-7" disabled={pagina >= totalPaginas} onClick={() => setPagina(p => p + 1)}>
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
              </>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
