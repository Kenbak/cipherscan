"""Exercise the release verifier against real temporary Git ancestry."""
import copy
import importlib.util
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

SPEC = importlib.util.spec_from_file_location(
    "verify_deployment", Path(__file__).with_name("verify-deployment.py")
)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class DeploymentTrustTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.previous = Path.cwd()
        os.chdir(self.temp.name)
        self.addCleanup(os.chdir, self.previous)
        self.git("init", "-b", "main")
        self.git("config", "user.email", "test@example.invalid")
        self.git("config", "user.name", "Deployment test")
        self.git("commit", "--allow-empty", "-m", "trusted")
        self.sha = self.git("rev-parse", "HEAD")
        self.git("update-ref", "refs/remotes/origin/main", self.sha)
        self.event = {"workflow_run": {
            "event": "push", "conclusion": "success", "head_branch": "main",
            "head_repository": {"full_name": "owner/repo"}, "head_sha": self.sha,
        }}

    def git(self, *args):
        return subprocess.check_output(["git", *args], stderr=subprocess.DEVNULL, text=True).strip()

    def test_accepts_trusted_main_commit(self):
        self.assertEqual(MODULE.verified_sha(self.event, "owner/repo"), self.sha)

    def test_rejects_untrusted_source_before_checking_git(self):
        for field, value in [
            ("event", "pull_request"), ("event", "workflow_dispatch"),
            ("conclusion", "failure"), ("head_branch", "feature"),
            ("head_repository", {"full_name": "fork/repo"}),
            ("head_repository", None), ("head_sha", "not-a-commit"),
        ]:
            with self.subTest(field=field, value=value):
                event = copy.deepcopy(self.event)
                event["workflow_run"][field] = value
                with self.assertRaises(ValueError):
                    MODULE.verified_sha(event, "owner/repo")

    def test_rejects_missing_payload(self):
        with self.assertRaises(ValueError):
            MODULE.verified_sha({}, "owner/repo")

    def test_rejects_commit_outside_main(self):
        self.git("checkout", "-b", "unmerged")
        self.git("commit", "--allow-empty", "-m", "unmerged")
        self.event["workflow_run"]["head_sha"] = self.git("rev-parse", "HEAD")
        with self.assertRaises(subprocess.CalledProcessError):
            MODULE.verified_sha(self.event, "owner/repo")

    def test_accepts_tested_ancestor_after_main_advances(self):
        self.git("commit", "--allow-empty", "-m", "later main")
        self.git("update-ref", "refs/remotes/origin/main", "HEAD")
        self.assertEqual(MODULE.verified_sha(self.event, "owner/repo"), self.sha)


if __name__ == "__main__":
    unittest.main()

