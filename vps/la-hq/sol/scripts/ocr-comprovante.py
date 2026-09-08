#!/usr/bin/env python3
"""OCR de comprovante no padrão da Maria (08/09/2026).

🔴 POR QUE EXISTE. Ordem do Luciano: *"ela tem que ler o OCR porque a Maria lê.
   A Maria não erra nunca. Então tem que ver qual ferramenta que está lá na
   Maria... está tratando de dinheiro."*

   Fui ver. **Não é outra ferramenta** — é o MESMO tesseract, muito melhor
   usado, mais uma coisa que a Sol não faz. Comparado lado a lado
   (`/home/maria/.openclaw/workspace/repos/maria-backup/workspace/private-mcp/
   maria-media-tools.py`):

     · pré-processamento : Maria faz upscale 3x + cinza + sharpen + binarização;
                           a Sol jogava a imagem CRUA no tesseract.
     · escolha de PSM    : Maria roda 6 e 4 e escolhe por SCORE (tamanho do
                           texto + confiança); a Sol escolhia por heurística de
                           "parece útil".
     · confiança         : Maria MEDE e marca `needs_human_confirmation < 80`;
                           a Sol não media — não sabia quando desconfiar de si.
     · QR code           : Maria lê com zbarimg. Comprovante PIX brasileiro tem
                           QR, e o payload `000201...` é EXATO — não é OCR, não
                           tem como ler errado. A Sol ignorava.
     · PDF               : Maria renderiza 3 páginas a 220dpi e passa cada uma
                           pelo mesmo pré-processamento; a Sol renderizava 1
                           página a 200dpi e mandava crua.
     · timeout           : Maria 120s; a Sol 45s (e 50 dos 242 OCR morreram por
                           timeout — 1 em cada 5).

⚠️ CONFIANÇA É A PARTE QUE MAIS IMPORTA no dinheiro, e não é sobre acertar mais:
   é sobre SABER que não leu. Sem ela o runtime trata leitura ruim como leitura
   boa e monta card com valor errado. Com ela, a Sol pergunta.

⚠️ `pytesseract` não está instalado na la-hq e NÃO é necessário: a confiança sai
   do próprio tesseract com `-c tessedit_create_tsv=1`, que devolve a coluna
   `conf` por palavra. Menos dependência, mesmo número.

⚠️ Sem `zbarimg` o script NÃO falha — devolve `qr: []` e segue pelo texto. QR é
   ganho, não requisito; quebrar tudo por falta dele seria trocar um problema
   por outro maior.

Uso:  ocr-comprovante.py <arquivo>   → JSON em stdout
"""
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

TIMEOUT = int(os.environ.get("OCR_TIMEOUT_S", "120"))


def run(cmd, timeout=TIMEOUT):
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        return p.returncode, p.stdout or "", p.stderr or ""
    except subprocess.TimeoutExpired:
        return 124, "", "timeout"
    except Exception as e:  # binário ausente é caso normal, não erro fatal
        return 127, "", str(e)


def preprocessar(path):
    """Upscale + cinza + sharpen + binarização — o passo que a Sol não tinha.

    ⚠️ Foto de tela de celular chega pequena e com ruído de compressão; o
       tesseract erra nisso e ACERTA depois do upscale. É a diferença medida
       entre a Maria e a Sol.
    """
    try:
        from PIL import Image, ImageOps, ImageFilter
        img = Image.open(path).convert("RGB")
        escala = 3 if max(img.size) < 1800 else 2
        img = img.resize((img.width * escala, img.height * escala))
        cinza = ImageOps.grayscale(img).filter(ImageFilter.SHARPEN)
        bw = cinza.point(lambda x: 0 if x < 180 else 255, "1")
        saida = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
        bw.save(saida.name)
        return saida.name
    except Exception:
        return None  # sem PIL, segue com a imagem crua


def tesseract_com_confianca(path, psm):
    """Texto + confiança média, sem pytesseract.

    ⚠️ A confiança sai do TSV do próprio tesseract (`conf` por palavra). Palavra
       com conf -1 é separador e fica de fora — incluí-la derrubaria a média e
       faria tudo parecer duvidoso.
    """
    with tempfile.TemporaryDirectory() as td:
        base = str(Path(td) / "out")
        cod, _, err = run(["tesseract", str(path), base, "-l", "por+eng",
                           "--psm", str(psm), "-c", "tessedit_create_tsv=1", "tsv"])
        texto, confs = "", []
        tsv = Path(base + ".tsv")
        if tsv.exists():
            for linha in tsv.read_text(errors="ignore").splitlines()[1:]:
                col = linha.split("\t")
                if len(col) < 12:
                    continue
                try:
                    c = float(col[10])
                except ValueError:
                    continue
                palavra = col[11].strip()
                if c >= 0 and palavra:
                    confs.append(c)
                    texto += palavra + " "
        conf = round(sum(confs) / len(confs), 2) if confs else 0.0
        return texto.strip(), conf, cod, err


def ler_qr(path):
    """QR do comprovante PIX: payload exato, sem OCR no meio.

    ⚠️ Isto é o que 'não erra': `000201...` é o BR Code, lido byte a byte. Onde
       houver QR, ele vale mais que qualquer leitura de pixel.
    """
    cod, out, _ = run(["zbarimg", "--quiet", "--raw", str(path)], timeout=60)
    if cod == 127:
        return []          # zbarimg ausente — ganho opcional, não requisito
    return [x.strip() for x in out.splitlines() if x.strip()]


def ocr_imagem(path):
    pre = preprocessar(path)
    alvo = pre or path
    melhor = {"texto": "", "conf": 0.0}
    for psm in (6, 4):
        texto, conf, _, _ = tesseract_com_confianca(alvo, psm)
        # score da Maria: tamanho do texto sem espaços + confiança
        score = len(re.sub(r"\s+", "", texto)) + conf
        melhor_score = len(re.sub(r"\s+", "", melhor["texto"])) + melhor["conf"]
        if score > melhor_score:
            melhor = {"texto": texto, "conf": conf}
    if pre:
        try:
            os.unlink(pre)
        except OSError:
            pass
    qr = ler_qr(path)
    return {
        "ok": True, "text": melhor["texto"], "ocr_confidence": melhor["conf"],
        # 🔴 o campo que muda o comportamento: abaixo de 80 a Sol PERGUNTA
        "needs_human_confirmation": melhor["conf"] < 80,
        "qr": qr, "pix_payloads": [c for c in qr if c.startswith("000201")],
        "engine": "tesseract+preproc",
    }


def ocr_pdf(path):
    # texto embutido primeiro: é exato e custa milissegundos
    cod, out, _ = run(["pdftotext", "-layout", str(path), "-"])
    texto = out.strip() if cod == 0 else ""
    if len(texto) >= 40:
        return {"ok": True, "text": texto, "ocr_confidence": 100.0,
                "needs_human_confirmation": False, "qr": [], "pix_payloads": [],
                "engine": "pdftotext"}
    # ⚠️ 3 páginas a 220dpi, como a Maria — a Sol fazia 1 a 200dpi e sem
    #    pré-processamento, que é onde o comprovante da Mayra morreu hoje.
    paginas = []
    with tempfile.TemporaryDirectory() as td:
        prefixo = str(Path(td) / "pag")
        run(["pdftoppm", "-png", "-r", "220", "-f", "1", "-l", "3", str(path), prefixo])
        for img in sorted(Path(td).glob("pag-*.png")):
            r = ocr_imagem(str(img))
            if r.get("text"):
                paginas.append(r)
    if not paginas:
        return {"ok": False, "text": texto, "ocr_confidence": 0.0,
                "needs_human_confirmation": True, "qr": [], "pix_payloads": [],
                "engine": "pdf_sem_texto"}
    return {
        "ok": True,
        "text": "\n\n".join(p["text"] for p in paginas).strip(),
        "ocr_confidence": round(sum(p["ocr_confidence"] for p in paginas) / len(paginas), 2),
        "needs_human_confirmation": all(p["needs_human_confirmation"] for p in paginas),
        "qr": [c for p in paginas for c in p["qr"]],
        "pix_payloads": [c for p in paginas for c in p["pix_payloads"]],
        "engine": "pdftoppm+tesseract+preproc", "paginas": len(paginas),
    }


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"ok": False, "error": "falta o arquivo"}))
        return 2
    caminho = sys.argv[1]
    if not Path(caminho).exists():
        print(json.dumps({"ok": False, "error": "arquivo_inexistente"}))
        return 1
    r = ocr_pdf(caminho) if caminho.lower().endswith(".pdf") else ocr_imagem(caminho)
    print(json.dumps(r, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
