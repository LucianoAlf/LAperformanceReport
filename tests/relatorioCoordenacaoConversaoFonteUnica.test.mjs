import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

test('mensal e ciclo compartilham a regra e não uma exceção temporária de setembro', () => {
  const dir = new URL('../supabase/migrations/', import.meta.url);
  const files = readdirSync(dir).filter(n => n.endsWith('_coordenacao_conversao_fonte_unica.sql'));
  assert.equal(files.length, 1, 'a fonte compartilhada ainda não foi implementada');
  const sql = readFileSync(new URL(files[0], dir), 'utf8');
  for (const periodo of ['mensal', 'ciclo']) {
    const wrapper = sql.split(`function public.get_health_score_professor_v3_conversao_${periodo}(`)[1];
    assert.ok(wrapper, periodo);
    assert.match(wrapper.split('$function$;')[0], /get_health_score_professor_v3_conversao_periodo_canonico/);
  }
  assert.doesNotMatch(sql, /date_trunc\('month', current_date\)::date =/);
  assert.match(sql, /conversoes_declaradas_sem_matricula_canonica/);
  assert.match(sql, /revoke all on function public.get_health_score_professor_v3_conversao_periodo_canonico/);
});
