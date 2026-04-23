"""
Script para alinhar leads do NocoDB com o Supabase.
Cria leads que existem no NocoDB mas não no Supabase, usando a data_contato original.
NÃO modifica leads existentes no Supabase.
"""
import requests
import json
import time

NOCODB_URL = "https://nocola.latecnology.com.br"
NOCODB_TABLE = "m1e7k051jr4czww"
NOCODB_TOKEN = "xc-auth-token"  # placeholder - usar o real

SUPABASE_URL = "https://ouqwbbermlzqqvtqwlul.supabase.co"
SUPABASE_KEY = ""  # service_role_key - preencher

UNIDADE_MAP = {
    "CG": "2ec861f6-023f-4d7b-9927-3960ad8c2a92",
    "Barra": "368d47f5-2d88-4475-bc14-ba084a9a348e",
    "Recreio": "95553e96-971b-4590-a6eb-0201d013c14d",
}

CURSO_MAP = {
    "TECLADO": 16, "PIANO": 18, "VIOLAO": 10, "VIOLÃO": 10,
    "GUITARRA": 14, "CANTO": 6, "VOZ": 6, "BATERIA": 27,
    "MUSICALIZACAO": 4, "MUSICALIZAÇÃO": 4, "MUSICALIZAÇÃO INFANTIL": 4,
    "UKULELE": 8, "UKULELÊ": 8, "VIOLINO": 12, "FLAUTA DOCE": 20,
    "CONTRABAIXO": 21, "SAX": 31, "CAVAQUINHO": 35,
    "FLAUTA TRANSVERSA": 37, "MUSICA": 4,
    "MUSICALIZAÇÃO PARA BEBÊS": 2, "MUSICALIZACAO BEBES": 2,
}

CANAL_MAP = {
    "INSTAGRAM": 1, "GOOGLE": 2, "FACEBOOK": 3, "SITE": 4,
    "INDICAÇÃO": 5, "EX-ALUNO": 6, "VISITA/PLACA": 7,
    "LIGAÇÃO": 8, "CONVÊNIOS": 9,
}

def normalizar_telefone(tel):
    if not tel:
        return None
    import re
    t = re.sub(r'\D', '', str(tel))
    if t.startswith('55'):
        return t
    elif len(t) >= 10:
        return '55' + t
    return None

def resolver_curso(curso_str):
    if not curso_str:
        return None
    import unicodedata
    norm = unicodedata.normalize('NFD', curso_str.upper().strip())
    norm = ''.join(c for c in norm if unicodedata.category(c) != 'Mn')
    return CURSO_MAP.get(norm)

def resolver_canal(canal_str):
    if not canal_str:
        return None
    return CANAL_MAP.get(canal_str.upper().strip())

def fetch_all_nocodb():
    """Busca todos os leads do NocoDB com paginação"""
    all_records = []
    page = 1
    page_size = 200

    while True:
        url = f"{NOCODB_URL}/api/v3/data/pyhap3besob1yjr/{NOCODB_TABLE}/records"
        params = {
            "pageSize": page_size,
            "page": page,
            "fields": "Id,Nome,Telefone,Data de entrada,Unidade,Origem do Lead,Curso,Estagio"
        }
        headers = {"xc-token": NOCODB_TOKEN}

        resp = requests.get(url, params=params, headers=headers)
        data = resp.json()
        records = data.get("records", [])
        all_records.extend(records)

        print(f"  Página {page}: {len(records)} registros (total: {len(all_records)})")

        if not data.get("next") or len(records) < page_size:
            break
        page += 1
        time.sleep(0.1)

    return all_records

def main():
    print("=== Sync NocoDB → Supabase ===\n")

    # 1. Buscar todos os leads do NocoDB
    print("1. Buscando leads do NocoDB...")
    nocodb_leads = fetch_all_nocodb()
    print(f"   Total: {len(nocodb_leads)}\n")

    # 2. Buscar IDs existentes no Supabase
    print("2. Buscando nocodb_lead_ids existentes no Supabase...")
    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/leads?select=nocodb_lead_id&nocodb_lead_id=not.is.null",
        headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
        }
    )
    existing_ids = {r["nocodb_lead_id"] for r in resp.json()}
    print(f"   Existentes: {len(existing_ids)}\n")

    # 3. Filtrar leads que não existem no Supabase
    novos = []
    for record in nocodb_leads:
        nid = record["id"]
        fields = record.get("fields", {})

        if nid in existing_ids:
            continue

        unidade = fields.get("Unidade", "")
        unidade_id = UNIDADE_MAP.get(unidade)
        if not unidade_id:
            continue

        data_entrada = fields.get("Data de entrada")
        if not data_entrada:
            continue

        novos.append({
            "nocodb_lead_id": nid,
            "nome": fields.get("Nome") or None,
            "telefone": normalizar_telefone(fields.get("Telefone")),
            "data_contato": data_entrada,
            "unidade_id": unidade_id,
            "curso_interesse_id": resolver_curso(fields.get("Curso")),
            "canal_origem_id": resolver_canal(fields.get("Origem do Lead")),
            "status": "novo",
            "etapa_pipeline_id": 1,
            "quantidade": 1,
            "arquivado": False,
        })

    print(f"3. Leads para importar: {len(novos)}")

    # 4. Resumo por unidade e mês
    from collections import Counter
    por_unidade = Counter()
    por_mes = Counter()
    for lead in novos:
        uid = lead["unidade_id"]
        for nome, uid_val in UNIDADE_MAP.items():
            if uid_val == uid:
                por_unidade[nome] += 1
        mes = lead["data_contato"][:7]
        por_mes[mes] += 1

    print("\n   Por unidade:")
    for u, c in por_unidade.most_common():
        print(f"     {u}: {c}")

    print("\n   Por mês (top 10):")
    for m, c in sorted(por_mes.items())[-10:]:
        print(f"     {m}: {c}")

    # 5. Salvar JSON para revisão
    with open("scripts/nocodb_sync_preview.json", "w", encoding="utf-8") as f:
        json.dump({
            "total_nocodb": len(nocodb_leads),
            "existentes_supabase": len(existing_ids),
            "novos_para_importar": len(novos),
            "por_unidade": dict(por_unidade),
            "por_mes": dict(sorted(por_mes.items())),
            "amostra": novos[:5],
        }, f, ensure_ascii=False, indent=2)

    print(f"\n   Preview salvo em scripts/nocodb_sync_preview.json")
    print("\n=== SIMULAÇÃO COMPLETA (nada foi inserido) ===")

if __name__ == "__main__":
    main()
