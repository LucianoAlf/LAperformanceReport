import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { toast } from 'sonner';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

interface UseSpreadsheetDataOptions {
  tableName: string;
  defaultValues?: AnyRecord;
  onSaveSuccess?: (data: AnyRecord) => void;
  onSaveError?: (error: Error) => void;
  debounceMs?: number;
}

interface SpreadsheetRow {
  id?: number;
  isNew?: boolean;
  isDirty?: boolean;
  data: AnyRecord;
}

export function useSpreadsheetData({
  tableName,
  defaultValues = {},
  onSaveSuccess,
  onSaveError,
  debounceMs = 500,
}: UseSpreadsheetDataOptions) {
  const { usuario } = useAuth();
  const [rows, setRows] = useState<SpreadsheetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Buscar dados iniciais
  const fetchData = useCallback(async (filters?: AnyRecord) => {
    setLoading(true);
    try {
      // Usar any para contornar tipagem estrita do Supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query = (supabase as any).from(tableName).select('*');
      
      // Aplicar filtros
      if (filters) {
        Object.entries(filters).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            query = query.eq(key, value);
          }
        });
      }

      // Ordenar por data decrescente e id
      query = query.order('data', { ascending: false }).order('id', { ascending: false });

      const { data, error } = await query;

      if (error) throw error;

      setRows(
        (data || []).map((item: AnyRecord) => ({
          id: item.id,
          isNew: false,
          isDirty: false,
          data: item,
        }))
      );
    } catch (error) {
      console.error('Erro ao buscar dados:', error);
      toast.error('Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  }, [tableName]);

  // Adicionar nova linha
  const addRow = useCallback((initialData?: AnyRecord) => {
    const newRow: SpreadsheetRow = {
      id: undefined,
      isNew: true,
      isDirty: true,
      data: {
        ...defaultValues,
        ...initialData,
        unidade_id: usuario?.unidade_id,
        data: new Date().toISOString().split('T')[0],
      },
    };

    setRows((prev) => [newRow, ...prev]);
    return newRow;
  }, [defaultValues, usuario?.unidade_id]);

  // Atualizar célula
  const updateCell = useCallback((
    rowIndex: number,
    field: string,
    value: unknown
  ) => {
    setRows((prev) => {
      const newRows = [...prev];
      const row = newRows[rowIndex];
      if (row) {
        row.data = { ...row.data, [field]: value };
        row.isDirty = true;
      }
      return newRows;
    });

    // Agendar salvamento com debounce
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      saveRow(rowIndex);
    }, debounceMs);
  }, [debounceMs]);

  // Salvar linha
  const saveRow = useCallback(async (rowIndex: number) => {
    const row = rows[rowIndex];
    if (!row || !row.isDirty) return;

    setSaving(true);
    try {
      const dataToSave: AnyRecord = {
        ...row.data,
        updated_at: new Date().toISOString(),
      };

      if (row.isNew) {
        dataToSave.created_by = usuario?.id;
      }

      // Remover campos undefined
      Object.keys(dataToSave).forEach((key) => {
        if (dataToSave[key] === undefined) {
          delete dataToSave[key];
        }
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabaseAny = supabase as any;
      
      let result;
      if (row.isNew) {
        // Insert
        const { data, error } = await supabaseAny
          .from(tableName)
          .insert(dataToSave)
          .select()
          .single();

        if (error) throw error;
        result = data;

        // Atualizar row com ID retornado
        setRows((prev) => {
          const newRows = [...prev];
          newRows[rowIndex] = {
            id: data.id,
            isNew: false,
            isDirty: false,
            data: data,
          };
          return newRows;
        });
      } else {
        // Update
        const { data, error } = await supabaseAny
          .from(tableName)
          .update(dataToSave)
          .eq('id', row.id)
          .select()
          .single();

        if (error) throw error;
        result = data;

        // Atualizar row
        setRows((prev) => {
          const newRows = [...prev];
          newRows[rowIndex] = {
            ...newRows[rowIndex],
            isDirty: false,
            data: data,
          };
          return newRows;
        });
      }

      onSaveSuccess?.(result);
    } catch (error) {
      console.error('Erro ao salvar:', error);
      toast.error('Erro ao salvar dados');
      onSaveError?.(error as Error);
    } finally {
      setSaving(false);
    }
  }, [rows, tableName, usuario?.id, onSaveSuccess, onSaveError]);

  // Deletar linha
  const deleteRow = useCallback(async (rowIndex: number) => {
    const row = rows[rowIndex];
    if (!row) return;

    // Se é nova linha (não salva), apenas remove do estado
    if (row.isNew) {
      setRows((prev) => prev.filter((_, i) => i !== rowIndex));
      return;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from(tableName)
        .delete()
        .eq('id', row.id);

      if (error) throw error;

      setRows((prev) => prev.filter((_, i) => i !== rowIndex));
      toast.success('Registro removido');
    } catch (error) {
      console.error('Erro ao deletar:', error);
      toast.error('Erro ao remover registro');
    }
  }, [rows, tableName]);

  // Limpar timeout ao desmontar
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  return {
    rows,
    loading,
    saving,
    fetchData,
    addRow,
    updateCell,
    saveRow,
    deleteRow,
    setRows,
  };
}
