"""Reject untrusted CI completions before deployment secrets or artifacts are used."""
import json
import os
import re
import subprocess
from pathlib import Path


def verified_sha(event, repository):
    run = event.get("workflow_run", {})
    if not repository or (
        run.get("conclusion") != "success"
        or run.get("event") != "push"
        or run.get("head_branch") != "main"
        or (run.get("head_repository") or {}).get("full_name") != repository
    ):
        raise ValueError("Deployment requires a successful same-repository push to main")
    sha = run.get("head_sha", "")
    if not isinstance(sha, str) or not re.fullmatch(r"[0-9a-f]{40}", sha):
        raise ValueError("Invalid deployment commit")
    subprocess.run(
        ["git", "merge-base", "--is-ancestor", sha, "origin/main"], check=True
    )
    return sha


def main():
    event = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text())
    sha = verified_sha(event, os.environ["GITHUB_REPOSITORY"])
    subprocess.run(["git", "checkout", "--detach", sha], check=True)
    print(f"Verified trusted main release {sha}")


if __name__ == "__main__":
    main()

