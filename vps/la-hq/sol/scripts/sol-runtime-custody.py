#!/usr/bin/env python3
"""Manifesto e readback dos artefatos executáveis da Sol na LAHQ."""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shlex
import stat
import subprocess
import sys
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[4]
MANIFEST_PATH = REPO_ROOT / "vps" / "la-hq" / "sol" / "runtime" / "deploy-manifest.json"
ARTIFACTS = (
    (
        "vps/la-hq/sol/runtime/bridge.js",
        "/home/sol/.hermes/hermes-agent/scripts/whatsapp-bridge/bridge.js",
        "bridge",
    ),
    (
        "vps/la-hq/sol/runtime/group-engagement.cjs",
        "/home/sol/.hermes/hermes-agent/scripts/whatsapp-bridge/group-engagement.cjs",
        "bridge-module",
    ),
    (
        "vps/la-hq/sol/runtime/caixa-financeiro.cjs",
        "/home/sol/.hermes/profiles/sol/caixa-ingestao/caixa-financeiro.cjs",
        "caixa-runtime",
    ),
    (
        "vps/la-hq/sol/runtime/caixa-abertura-fechamento.cjs",
        "/home/sol/.hermes/profiles/sol/caixa-ingestao/caixa-abertura-fechamento.cjs",
        "caixa-runtime",
    ),
    (
        "vps/la-hq/sol/scripts/sol-portas-mcp.mjs",
        "/home/sol/.openclaw/workspace/scripts/sol-portas-mcp.mjs",
        "mcp-runtime",
    ),
)
SAFE_PATH = re.compile(r"^[A-Za-z0-9._/-]+$")


class CustodyError(RuntimeError):
    pass


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def build_manifest() -> dict[str, Any]:
    entries = []
    for source_name, target_name, artifact_class in ARTIFACTS:
        source = REPO_ROOT / source_name
        if not source.is_file() or source.is_symlink():
            raise CustodyError(f"artefato ausente ou não regular: {source_name}")
        entries.append(
            {
                "source": source_name,
                "target": target_name,
                "class": artifact_class,
                "sha256": sha256(source),
                "size": source.stat().st_size,
                "mode": f"{stat.S_IMODE(source.stat().st_mode):04o}",
            }
        )
    return {
        "schema_version": 1,
        "artifact_set": "sol-lahq-runtime",
        "source_repository": "LucianoAlf/LAperformanceReport",
        "service": {
            "manager": "user-systemd",
            "name": "hermes-gateway-sol.service",
            "user": "sol",
        },
        "artifacts": entries,
        "excluded": [
            "secrets, environment e config efetiva",
            "logs, sessões, caches, offsets e bancos locais",
            "constituição e skills, custodiadas no sol-openclaw-backup",
            "patches históricos que não são o artefato final carregado",
        ],
    }


def canonical_json(payload: dict[str, Any]) -> str:
    return json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def write_manifest() -> None:
    payload = canonical_json(build_manifest())
    temporary = MANIFEST_PATH.with_suffix(".json.tmp")
    temporary.write_text(payload, encoding="utf-8")
    os.replace(temporary, MANIFEST_PATH)
    print(f"manifest_written files={len(json.loads(payload)['artifacts'])} path={MANIFEST_PATH}")


def load_manifest() -> dict[str, Any]:
    try:
        payload = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise CustodyError(f"manifesto inválido: {exc}") from exc
    if payload.get("schema_version") != 1 or payload.get("artifact_set") != "sol-lahq-runtime":
        raise CustodyError("contrato do manifesto não reconhecido")
    return payload


def verify_local() -> dict[str, Any]:
    manifest = load_manifest()
    expected = {source: (target, artifact_class) for source, target, artifact_class in ARTIFACTS}
    declared: set[str] = set()
    errors: list[str] = []
    for entry in manifest.get("artifacts", []):
        if set(entry) != {"source", "target", "class", "sha256", "size", "mode"}:
            errors.append(f"campos inválidos em {entry.get('source', '<sem-source>')}")
            continue
        source_name = str(entry["source"])
        if source_name in declared:
            errors.append(f"source duplicado: {source_name}")
            continue
        declared.add(source_name)
        if source_name not in expected:
            errors.append(f"source fora da allowlist: {source_name}")
            continue
        target_name, artifact_class = expected[source_name]
        if entry["target"] != target_name or entry["class"] != artifact_class:
            errors.append(f"mapeamento divergente: {source_name}")
        if not SAFE_PATH.fullmatch(source_name) or not SAFE_PATH.fullmatch(str(entry["target"])):
            errors.append(f"path inseguro: {source_name}")
            continue
        source = REPO_ROOT / source_name
        if not source.is_file() or source.is_symlink():
            errors.append(f"artefato ausente ou não regular: {source_name}")
            continue
        actual = {
            "sha256": sha256(source),
            "size": source.stat().st_size,
            "mode": f"{stat.S_IMODE(source.stat().st_mode):04o}",
        }
        for key, value in actual.items():
            if entry.get(key) != value:
                errors.append(f"{key} divergente: {source_name}")
    for source_name in sorted(set(expected) - declared):
        errors.append(f"artefato não declarado: {source_name}")
    if errors:
        raise CustodyError("; ".join(errors))
    return {"ok": True, "files": len(declared)}


REMOTE_PROBE = r"""
import hashlib,json,os,stat,sys
out=[]
for path in sys.argv[1:]:
    item={"target":path,"exists":False}
    try:
        st=os.lstat(path);item["exists"]=True;item["regular"]=stat.S_ISREG(st.st_mode)
        item["mode"]=format(stat.S_IMODE(st.st_mode),"04o");item["size"]=st.st_size
        if item["regular"]:
            h=hashlib.sha256()
            with open(path,"rb") as f:
                for b in iter(lambda:f.read(1048576),b""):h.update(b)
            item["sha256"]=h.hexdigest()
    except OSError as exc:item["error"]=exc.__class__.__name__
    out.append(item)
print(json.dumps(out,separators=(",",":")))
"""


def readback(ssh_host: str, remote_user: str) -> dict[str, Any]:
    local = verify_local()
    entries = load_manifest()["artifacts"]
    targets = [str(entry["target"]) for entry in entries]
    if any(not SAFE_PATH.fullmatch(target) or not target.startswith("/home/sol/") for target in targets):
        raise CustodyError("manifesto contém target remoto inseguro")
    encoded = base64.b64encode(REMOTE_PROBE.encode("utf-8")).decode("ascii")
    bootstrap = f"import base64;exec(base64.b64decode('{encoded}'))"
    remote_command = " ".join(
        shlex.quote(part)
        for part in ["sudo", "-n", "-u", remote_user, "python3", "-c", bootstrap, *targets]
    )
    completed = subprocess.run(
        ["ssh", "-o", "BatchMode=yes", ssh_host, remote_command],
        check=False,
        capture_output=True,
        text=True,
    )
    if completed.returncode != 0:
        raise CustodyError(f"probe remoto falhou rc={completed.returncode}: {completed.stderr.strip()[:300]}")
    try:
        remote = json.loads(completed.stdout)
    except json.JSONDecodeError as exc:
        raise CustodyError("probe remoto devolveu JSON inválido") from exc
    by_target = {item["target"]: item for item in remote}
    drift = []
    for entry in entries:
        item = by_target.get(entry["target"], {"exists": False})
        reasons = []
        if not item.get("exists"):
            reasons.append("missing")
        elif not item.get("regular"):
            reasons.append("not_regular")
        else:
            for key in ("sha256", "size", "mode"):
                if item.get(key) != entry[key]:
                    reasons.append(key)
        if reasons:
            drift.append({"source": entry["source"], "target": entry["target"], "reasons": reasons})
    return {
        "ok": not drift,
        "local": local,
        "remote_files": len(remote),
        "drift_count": len(drift),
        "drift": drift,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("generate-manifest")
    sub.add_parser("verify-local")
    rb = sub.add_parser("readback")
    rb.add_argument("--ssh-host", default="lahq")
    rb.add_argument("--remote-user", default="sol")
    args = parser.parse_args()
    try:
        if args.command == "generate-manifest":
            write_manifest()
            return 0
        if args.command == "verify-local":
            print(canonical_json(verify_local()), end="")
            return 0
        if args.command == "readback":
            result = readback(args.ssh_host, args.remote_user)
            print(canonical_json(result), end="")
            return 0 if result["ok"] else 3
    except CustodyError as exc:
        print(f"custody_error: {exc}", file=sys.stderr)
        return 2
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
