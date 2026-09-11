import importlib.util
import json
from pathlib import Path
import unittest
from unittest import mock


MODULE_PATH = Path(__file__).resolve().parents[1] / "vps" / "la-hq" / "sol" / "scripts" / "sol-runtime-custody.py"
SPEC = importlib.util.spec_from_file_location("sol_runtime_custody", MODULE_PATH)
assert SPEC and SPEC.loader
custody = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(custody)


class SolRuntimeCustodyTest(unittest.TestCase):
    def test_manifest_matches_fixed_artifact_set(self):
        result = custody.verify_local()
        self.assertTrue(result["ok"])
        self.assertEqual(result["files"], 5)

    def test_remote_drift_is_fail_closed(self):
        manifest = custody.load_manifest()
        remote = []
        for entry in manifest["artifacts"]:
            remote.append(
                {
                    "target": entry["target"],
                    "exists": True,
                    "regular": True,
                    "sha256": entry["sha256"],
                    "size": entry["size"],
                    "mode": entry["mode"],
                }
            )
        remote[-1]["exists"] = False
        completed = mock.Mock(returncode=0, stdout=json.dumps(remote), stderr="")
        with mock.patch.object(custody.subprocess, "run", return_value=completed):
            result = custody.readback("fixture", "sol")
        self.assertFalse(result["ok"])
        self.assertEqual(result["drift_count"], 1)
        self.assertIn("missing", result["drift"][0]["reasons"])


if __name__ == "__main__":
    unittest.main()
