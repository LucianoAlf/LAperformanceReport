import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

// =============================================================================
// MÓDULO BANDAS — camada de dados
// Contrato com o backend: acesso SOMENTE via RPC (as tabelas banda_* têm RLS
// fail-closed, sem policy). Nunca usar supabase.from('banda...') aqui.
// =============================================================================

// Enums travados no banco (CHECK constraints) — manter sincronizados
export const BANDA_STATUS = ['ativa', 'inativa'] as const;
export const EVENTO_TIPOS = ['ensaio', 'show'] as const;
export const EVENTO_STATUS = ['agendado', 'realizado', 'cancelado'] as const;
export const REPERTORIO_STATUS = ['ensaiando', 'pronta', 'tocada'] as const;

export type BandaStatus = typeof BANDA_STATUS[number];
export type EventoTipo = typeof EVENTO_TIPOS[number];
export type EventoStatus = typeof EVENTO_STATUS[number];
export type RepertorioStatus = typeof REPERTORIO_STATUS[number];

export interface BandaResumo {
  banda_id: number;
  nome: string;
  unidade_id: string;
  unidade_nome: string | null;
  curso_id: number;
  curso_nome: string | null;
  dia_semana: string | null;
  horario: string | null;
  produtor_nome: string | null;
  integrantes: number;
  precisa_revisar_nome: boolean;
  status: BandaStatus;
  proximo_evento: string | null;
}

export interface BandaDetalhe {
  banda_id: number;
  nome: string;
  unidade_id: string;
  unidade_nome: string | null;
  curso_id: number;
  curso_nome: string | null;
  dia_semana: string | null;
  horario: string | null;
  produtor_nome: string | null;
  genero: string | null;
  descricao: string | null;
  logo_url: string | null;
  status: BandaStatus;
  precisa_revisar_nome: boolean;
  integrantes: number;
  musicas: number;
  proximos_eventos: number;
}

export interface IntegranteBanda {
  aluno_id: number;
  nome: string;
  instrumento: string | null;
  funcao: string | null;
  status_aluno: string;
  tempo_permanencia_meses: number | null;
  saiu_da_escola: boolean;
  responsavel_nome: string | null;
  responsavel_telefone: string | null;
  whatsapp: string | null;
  /** foto_url da tabela alunos, buscada em lote pelo hook (a RPC banda_integrantes ainda não retorna) */
  foto_url: string | null;
}

export interface KpiBandaUnidade {
  unidade_id: string;
  unidade_nome: string;
  total_bandas: number;
  alunos_em_banda: number;
  permanencia_media: number | null;
  bandas_com_vaga: number;
}

export interface BandaGarimpar {
  banda_id: number;
  nome: string;
  unidade_nome: string | null;
  curso_nome: string | null;
  produtor_nome: string | null;
  integrantes: number;
}

export interface EventoBanda {
  evento_id: number;
  titulo: string;
  tipo: EventoTipo;
  data_inicio: string;
  data_fim: string | null;
  local: string | null;
  sala_nome: string | null;
  orcamento: number | null;
  status: EventoStatus;
  /** Nomes das bandas participantes agregados pelo banco (", ") */
  bandas: string | null;
}

export interface ParticipanteEvento {
  banda_id: number;
  nome: string;
  unidade_nome: string | null;
}

export interface RepertorioItem {
  id: number;
  titulo: string;
  artista: string | null;
  tom: string | null;
  bpm: number | null;
  status: RepertorioStatus;
  cifraclub_url: string | null;
  duracao_min: number | null;
  tem_cifra: boolean;
  tem_letra: boolean;
}

export interface ConciliacaoItem {
  banda_id: number;
  banda_nome: string;
  aluno_id: number;
  aluno_nome: string | null;
  problema: 'aluno inexistente' | 'saiu da escola' | 'nao esta mais nesta turma';
}

/** 'todos' vira NULL no banco (todas as unidades) */
function unidadeParam(unidadeId: string | null | undefined): string | null {
  return unidadeId && unidadeId !== 'todos' ? unidadeId : null;
}

// =============================================================================
// LEITURA
// =============================================================================

export function useBandasListar(unidadeId: string, status: BandaStatus | null = 'ativa') {
  const [bandas, setBandas] = useState<BandaResumo[]>([]);
  const [loading, setLoading] = useState(true);

  const recarregar = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('bandas_listar', {
      p_unidade_id: unidadeParam(unidadeId),
      p_status: status,
    });
    if (error) console.error('Erro ao listar bandas:', error);
    setBandas((data as BandaResumo[]) || []);
    setLoading(false);
  }, [unidadeId, status]);

  useEffect(() => { recarregar(); }, [recarregar]);

  return { bandas, loading, recarregar };
}

export function useBandasKpis(unidadeId: string, minIntegrantes = 3) {
  const [kpis, setKpis] = useState<KpiBandaUnidade[]>([]);
  const [loading, setLoading] = useState(true);

  const recarregar = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('bandas_kpis', {
      p_unidade_id: unidadeParam(unidadeId),
      p_min_integrantes: minIntegrantes,
    });
    if (error) console.error('Erro ao carregar KPIs de bandas:', error);
    setKpis((data as KpiBandaUnidade[]) || []);
    setLoading(false);
  }, [unidadeId, minIntegrantes]);

  useEffect(() => { recarregar(); }, [recarregar]);

  return { kpis, loading, recarregar };
}

export function useBandasGarimpar(unidadeId: string, minIntegrantes = 3) {
  const [bandas, setBandas] = useState<BandaGarimpar[]>([]);
  const [loading, setLoading] = useState(true);

  const recarregar = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('bandas_para_garimpar', {
      p_unidade_id: unidadeParam(unidadeId),
      p_min_integrantes: minIntegrantes,
    });
    if (error) console.error('Erro ao listar bandas para garimpar:', error);
    setBandas((data as BandaGarimpar[]) || []);
    setLoading(false);
  }, [unidadeId, minIntegrantes]);

  useEffect(() => { recarregar(); }, [recarregar]);

  return { bandas, loading, recarregar };
}

export function useBandaEventos(unidadeId: string, desde: string | null) {
  const [eventos, setEventos] = useState<EventoBanda[]>([]);
  const [loading, setLoading] = useState(true);

  const recarregar = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('banda_eventos_listar', {
      p_unidade_id: unidadeParam(unidadeId),
      p_desde: desde,
    });
    if (error) console.error('Erro ao listar eventos de banda:', error);
    setEventos((data as EventoBanda[]) || []);
    setLoading(false);
  }, [unidadeId, desde]);

  useEffect(() => { recarregar(); }, [recarregar]);

  return { eventos, loading, recarregar };
}

export function useConciliacaoRoster(unidadeId: string) {
  const [itens, setItens] = useState<ConciliacaoItem[]>([]);
  const [loading, setLoading] = useState(true);

  const recarregar = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('banda_conciliacao_roster', {
      p_unidade_id: unidadeParam(unidadeId),
    });
    if (error) console.error('Erro ao carregar conciliação de roster:', error);
    setItens((data as ConciliacaoItem[]) || []);
    setLoading(false);
  }, [unidadeId]);

  useEffect(() => { recarregar(); }, [recarregar]);

  return { itens, loading, recarregar };
}

/** Detalhe completo da banda: identidade + roster vivo + repertório */
export function useBandaDetalhe(bandaId: number | null) {
  const [detalhe, setDetalhe] = useState<BandaDetalhe | null>(null);
  const [integrantes, setIntegrantes] = useState<IntegranteBanda[]>([]);
  const [repertorio, setRepertorio] = useState<RepertorioItem[]>([]);
  const [loading, setLoading] = useState(false);

  const recarregar = useCallback(async () => {
    if (!bandaId) return;
    setLoading(true);
    const [detRes, intRes, repRes] = await Promise.all([
      supabase.rpc('banda_detalhe', { p_banda_id: bandaId }),
      supabase.rpc('banda_integrantes', { p_banda_id: bandaId }),
      supabase.rpc('banda_repertorio_listar', { p_banda_id: bandaId }),
    ]);
    if (detRes.error) console.error('Erro ao carregar detalhe da banda:', detRes.error);
    if (intRes.error) console.error('Erro ao carregar integrantes:', intRes.error);
    if (repRes.error) console.error('Erro ao carregar repertório:', repRes.error);
    setDetalhe((detRes.data as BandaDetalhe[] | null)?.[0] || null);
    const roster = (intRes.data as Omit<IntegranteBanda, 'foto_url'>[]) || [];

    // Fotos: a RPC banda_integrantes não retorna foto_url ainda — busca em lote
    // na tabela alunos (leitura canônica, mesma fonte da Agenda/Chamada)
    let integrantesComFoto: IntegranteBanda[] = roster.map((i) => ({ ...i, foto_url: null }));
    const ids = roster.map((i) => i.aluno_id);
    if (ids.length > 0) {
      const { data: fotos, error: fotosError } = await supabase
        .from('alunos')
        .select('id, foto_url')
        .in('id', ids);
      if (fotosError) console.error('Erro ao carregar fotos dos integrantes:', fotosError);
      const fotoPorId = new Map((fotos || []).map((f) => [f.id, f.foto_url]));
      integrantesComFoto = roster.map((i) => ({ ...i, foto_url: fotoPorId.get(i.aluno_id) ?? null }));
    }
    setIntegrantes(integrantesComFoto);
    setRepertorio((repRes.data as RepertorioItem[]) || []);
    setLoading(false);
  }, [bandaId]);

  useEffect(() => { recarregar(); }, [recarregar]);

  return { detalhe, integrantes, repertorio, loading, recarregar };
}

export async function fetchParticipantesEvento(eventoId: number): Promise<ParticipanteEvento[]> {
  const { data, error } = await supabase.rpc('banda_evento_participantes', { p_evento_id: eventoId });
  if (error) {
    console.error('Erro ao listar participantes do evento:', error);
    return [];
  }
  return (data as ParticipanteEvento[]) || [];
}

// =============================================================================
// ESCRITA — cada função retorna `error` para o chamador decidir o toast
// =============================================================================

export async function atualizarIdentidadeBanda(params: {
  bandaId: number;
  nome?: string;
  genero?: string | null;
  descricao?: string | null;
  logoUrl?: string | null;
}) {
  return supabase.rpc('banda_atualizar_identidade', {
    p_banda_id: params.bandaId,
    p_nome: params.nome ?? null,
    p_genero: params.genero ?? null,
    p_descricao: params.descricao ?? null,
    p_logo_url: params.logoUrl ?? null,
  });
}

export async function definirStatusBanda(bandaId: number, status: BandaStatus) {
  return supabase.rpc('banda_definir_status', { p_banda_id: bandaId, p_status: status });
}

export async function upsertIntegranteBanda(params: {
  bandaId: number;
  alunoId: number;
  instrumento?: string | null;
  funcao?: string | null;
  dataEntrada?: string | null;
  observacoes?: string | null;
}) {
  return supabase.rpc('banda_integrante_upsert', {
    p_banda_id: params.bandaId,
    p_aluno_id: params.alunoId,
    p_instrumento: params.instrumento ?? null,
    p_funcao: params.funcao ?? null,
    p_data_entrada: params.dataEntrada ?? null,
    p_observacoes: params.observacoes ?? null,
  });
}

export async function desativarIntegranteBanda(bandaId: number, alunoId: number, dataSaida?: string) {
  return supabase.rpc('banda_integrante_desativar', {
    p_banda_id: bandaId,
    p_aluno_id: alunoId,
    p_data_saida: dataSaida ?? null,
  });
}

export async function removerIntegranteBanda(bandaId: number, alunoId: number) {
  return supabase.rpc('banda_integrante_remover', { p_banda_id: bandaId, p_aluno_id: alunoId });
}

export async function adicionarRepertorio(params: {
  bandaId: number;
  titulo: string;
  artista?: string | null;
  tom?: string | null;
  bpm?: number | null;
  status?: RepertorioStatus;
  cifraclubUrl?: string | null;
  duracaoMin?: number | null;
}) {
  return supabase.rpc('banda_repertorio_adicionar', {
    p_banda_id: params.bandaId,
    p_titulo: params.titulo,
    p_artista: params.artista ?? null,
    p_tom: params.tom ?? null,
    p_bpm: params.bpm ?? null,
    p_status: params.status ?? 'ensaiando',
    p_cifraclub_url: params.cifraclubUrl ?? null,
    p_duracao_min: params.duracaoMin ?? null,
  });
}

export async function atualizarRepertorio(params: {
  id: number;
  titulo?: string;
  artista?: string | null;
  tom?: string | null;
  bpm?: number | null;
  status?: RepertorioStatus;
  duracaoMin?: number | null;
  cifraclubUrl?: string | null;
}) {
  return supabase.rpc('banda_repertorio_atualizar', {
    p_id: params.id,
    p_titulo: params.titulo ?? null,
    p_artista: params.artista ?? null,
    p_tom: params.tom ?? null,
    p_bpm: params.bpm ?? null,
    p_status: params.status ?? null,
    p_duracao_min: params.duracaoMin ?? null,
    p_cifraclub_url: params.cifraclubUrl ?? null,
  });
}

export async function removerRepertorio(id: number) {
  return supabase.rpc('banda_repertorio_remover', { p_id: id });
}

export interface EventoFormDados {
  unidadeId: string;
  tipo: EventoTipo;
  titulo: string;
  dataInicio: string; // ISO timestamptz
  dataFim?: string | null;
  local?: string | null;
  salaId?: number | null;
  orcamento?: number | null;
  observacoes?: string | null;
  bandas: number[];
}

export async function criarEventoBanda(dados: EventoFormDados) {
  return supabase.rpc('banda_evento_criar', {
    p_unidade_id: dados.unidadeId,
    p_tipo: dados.tipo,
    p_titulo: dados.titulo,
    p_data_inicio: dados.dataInicio,
    p_data_fim: dados.dataFim ?? null,
    p_local: dados.local ?? null,
    p_sala_id: dados.salaId ?? null,
    p_orcamento: dados.orcamento ?? null,
    p_observacoes: dados.observacoes ?? null,
    p_bandas: dados.bandas,
  });
}

export async function atualizarEventoBanda(eventoId: number, dados: Partial<Omit<EventoFormDados, 'unidadeId' | 'bandas'>>) {
  return supabase.rpc('banda_evento_atualizar', {
    p_evento_id: eventoId,
    p_titulo: dados.titulo ?? null,
    p_tipo: dados.tipo ?? null,
    p_data_inicio: dados.dataInicio ?? null,
    p_data_fim: dados.dataFim ?? null,
    p_local: dados.local ?? null,
    p_sala_id: dados.salaId ?? null,
    p_orcamento: dados.orcamento ?? null,
    p_status: dados.status ?? null,
    p_observacoes: dados.observacoes ?? null,
  });
}

export async function cancelarEventoBanda(eventoId: number) {
  return supabase.rpc('banda_evento_cancelar', { p_evento_id: eventoId });
}

export async function removerEventoBanda(eventoId: number) {
  return supabase.rpc('banda_evento_remover', { p_evento_id: eventoId });
}

export async function definirBandasEvento(eventoId: number, bandas: number[]) {
  return supabase.rpc('banda_evento_definir_bandas', { p_evento_id: eventoId, p_bandas: bandas });
}
