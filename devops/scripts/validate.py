#!/usr/bin/env python3
"""Preflight validation for the DevOps pack — v4 (extended).

Preserved behaviour (v3, still first):
  * every JSON file parses
  * every workflow / YAML file parses
  * no obvious real secret is committed

Added in v4 — the checks that would have caught the DevOps blockers found by the
readiness audit:
  * workflows live at the repository root (.github/workflows), and the superseded
    copy under devops/.github/workflows is flagged so it cannot linger as a second
    live pipeline
  * every `npm run <script>` invoked by a workflow resolves to a script that
    actually exists in the owning package.json (honouring working-directory and
    job-level defaults)
  * the Firebase Hosting public path matches Vite's build.outDir, and no workflow
    still scans the Create-React-App path build/static/js
  * the admin panel's env prefix in CI matches what the source reads
    (import.meta.env.VITE_*), so a build cannot silently fall back to demo mode
  * the Cloud Functions codebase name used by workflows matches firebase.json
  * firebase.json predeploy scripts exist in functions/package.json
  * the `/healthz` endpoint path used by smoke tests matches the exported function
  * jobs that call `npm run test:rules` actually have the rules-test harness

Exits non-zero on any failure so it can gate CI. Warnings are printed but do not
fail the run.
"""
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))          # devops/scripts
PACK_ROOT = os.path.dirname(HERE)                          # devops/


def _resolve_repo_root():
    """Find the MONOREPO root, not the devops pack itself.

    Inside the assembled repo that is the parent of devops/, because the root
    owns firebase.json + functions/package.json. Run against the devops pack on
    its own (firebase.json exists there too, functions/ does not), the pack is
    the best available root and the cross-file checks degrade to warnings.
    """
    outer = os.path.dirname(PACK_ROOT)
    for candidate in (outer, PACK_ROOT):
        if (os.path.isfile(os.path.join(candidate, "firebase.json"))
                and os.path.isfile(os.path.join(candidate, "functions", "package.json"))):
            return candidate
    return outer if os.path.isfile(os.path.join(outer, "firebase.json")) else PACK_ROOT


REPO_ROOT = _resolve_repo_root()

SECRET_PATTERNS = [
    re.compile(r"AIzaSy[A-Za-z0-9_\-]{25,}"),          # Google API key
    re.compile(r"-----BEGIN (RSA )?PRIVATE KEY-----"),  # private key block
    re.compile(r"sk_live_[A-Za-z0-9]{10,}"),            # Stripe live key
    re.compile(r"r8_[A-Za-z0-9]{20,}"),                 # Replicate token
]

errors = []
warnings = []
checked_json = []
checked_yaml = []
checked_workflows = []
checked_scripts = []
checked_paths = []


def rel(path):
    try:
        return os.path.relpath(path, REPO_ROOT)
    except ValueError:  # pragma: no cover - different drives on Windows
        return path


def read(path):
    with open(path, encoding="utf-8", errors="ignore") as fh:
        return fh.read()


def load_json(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def pkg_scripts(directory):
    path = os.path.join(REPO_ROOT, directory, "package.json") if directory else os.path.join(REPO_ROOT, "package.json")
    if not os.path.isfile(path):
        return None
    try:
        return set((load_json(path).get("scripts") or {}).keys())
    except Exception:
        return None


try:
    import yaml  # type: ignore
except ImportError:
    yaml = None


# --------------------------------------------------------------------------
# 1. Original pass: JSON / YAML parse + secret scan
# --------------------------------------------------------------------------
for dirpath, dirnames, filenames in os.walk(REPO_ROOT):
    dirnames[:] = [d for d in dirnames if d not in (".git", "node_modules", "lib", "dist")]
    for name in filenames:
        path = os.path.join(dirpath, name)
        r = rel(path)

        if name.endswith(".json"):
            try:
                load_json(path)
                checked_json.append(r)
            except Exception as exc:  # noqa: BLE001
                errors.append(f"JSON parse failed: {r}: {exc}")

        if name.endswith((".yml", ".yaml")):
            if yaml is None:
                checked_yaml.append(r + " (not parsed: pyyaml missing)")
                continue
            try:
                list(yaml.safe_load_all(read(path)))
                checked_yaml.append(r)
            except Exception as exc:  # noqa: BLE001
                errors.append(f"YAML parse failed: {r}: {exc}")

        if name.endswith((".env.example", ".md", ".json", ".yml")):
            body = read(path)
            for pat in SECRET_PATTERNS:
                if pat.search(body):
                    errors.append(f"possible real secret in {r}: {pat.pattern}")


# --------------------------------------------------------------------------
# 2. Workflow location
# --------------------------------------------------------------------------
ROOT_WF = os.path.join(REPO_ROOT, ".github", "workflows")
LEGACY_WF = os.path.join(REPO_ROOT, "devops", ".github", "workflows")

root_wf_files = sorted(f for f in os.listdir(ROOT_WF)) if os.path.isdir(ROOT_WF) else []
if not root_wf_files:
    warnings.append("no workflows at .github/workflows — CI will not run from the repository root")
else:
    checked_paths.append(f".github/workflows ({len(root_wf_files)} files)")

if os.path.isdir(LEGACY_WF):
    warnings.append(
        "devops/.github/workflows still exists — it is superseded by the root workflows; "
        "delete that folder after merging so only one pipeline tree can run"
    )


# --------------------------------------------------------------------------
# 3. Workflow-level checks
# --------------------------------------------------------------------------
def iter_steps(doc, filename):
    """Yield (job_name, working_directory, run_script) for every run step."""
    for job_name, job in (doc.get("jobs") or {}).items():
        if not isinstance(job, dict):
            continue
        base = (((job.get("defaults") or {}).get("run") or {}).get("working-directory")) or ""
        for step in job.get("steps") or []:
            if not isinstance(step, dict):
                continue
            run = step.get("run")
            if not run:
                continue
            wd = step.get("working-directory") or base or ""
            yield filename, job_name, wd.rstrip("/"), run


workflow_docs = {}
if yaml is not None and os.path.isdir(ROOT_WF):
    for name in root_wf_files:
        if not name.endswith((".yml", ".yaml")):
            continue
        path = os.path.join(ROOT_WF, name)
        try:
            doc = yaml.safe_load(read(path)) or {}
        except Exception as exc:  # noqa: BLE001
            errors.append(f"workflow load failed: {name}: {exc}")
            continue
        workflow_docs[name] = doc

        # 3a. every `npm run <script>` / `npm test` must resolve
        for _f, job, wd, run in iter_steps(doc, name):
            for match in re.finditer(r"npm\s+run\s+([A-Za-z0-9:_\-]+)", run):
                script = match.group(1)
                scripts = pkg_scripts(wd)
                if scripts is None:
                    warnings.append(
                        f"{name} [{job}]: `npm run {script}` in '{wd or '.'}' but that package.json is missing"
                    )
                elif script not in scripts:
                    errors.append(
                        f"{name} [{job}]: `npm run {script}` does not exist in '{wd or '.'}/package.json'"
                    )
                else:
                    checked_scripts.append(f"{name}:{script}@{wd or '.'}")
            if re.search(r"\bnpm\s+test\b", run):
                scripts = pkg_scripts(wd)
                if scripts is not None and not ({"test", "test:ci", "test:unit"} & scripts):
                    errors.append(f"{name} [{job}]: `npm test` used in '{wd or '.'}' but no test script is defined")
                elif scripts is not None:
                    checked_scripts.append(f"{name}:test@{wd or '.'}")

        # 3b/3c. Path and env-prefix drift. Both tokens legitimately appear inside
        # guard messages and comments, where they describe what must NOT be used.
        # Only a non-comment, non-guard line counts as a real violation.
        def offending_lines(token):
            hits = []
            for lineno, line in enumerate(read(path).splitlines(), 1):
                if token not in line:
                    continue
                stripped = line.strip()
                if stripped.startswith("#") or "::error::" in line:
                    continue
                hits.append((lineno, stripped))
            return hits

        for lineno, line in offending_lines("build/static/js"):
            errors.append(
                f"{name}:{lineno}: uses the Create-React-App path build/static/js — "
                f"the admin panel is a Vite build (build/assets)"
            )
        for lineno, line in offending_lines("REACT_APP_"):
            errors.append(
                f"{name}:{lineno}: sets REACT_APP_* env vars but the admin panel reads import.meta.env.VITE_*"
            )

        # 3d. health endpoint path
        body = read(path)
        for bad in re.findall(r"cloudfunctions\.net/(health)\b", body):
            errors.append(f"{name}: probes /{bad} — the backend exports /healthz")
        if re.search(r"cloudfunctions\.net/healthz", body):
            checked_paths.append(f"{name}:/healthz")

        # 3e. functions codebase name
        if re.search(r"functions:default\b", body):
            errors.append(f"{name}: deploys functions:default but firebase.json declares a different codebase")

        # 3f. rules-test harness present when requested
        if "test:rules" in body:
            harness = [
                os.path.join(REPO_ROOT, "functions", "test", "jest.config.rules.js"),
                os.path.join(REPO_ROOT, "functions", "test", "rules", "firestore.rules.test.ts"),
                os.path.join(REPO_ROOT, "functions", "test", "rules", "storage.rules.test.ts"),
            ]
            missing = [rel(h) for h in harness if not os.path.isfile(h)]
            if missing:
                errors.append(f"{name}: runs test:rules but harness files are missing: {', '.join(missing)}")
            else:
                checked_paths.append(f"{name}:rules-harness")


# --------------------------------------------------------------------------
# 4. firebase.json <-> Vite output, env prefix, functions codebase, predeploy
# --------------------------------------------------------------------------
firebase_json_path = os.path.join(REPO_ROOT, "firebase.json")
hosting_public = None
if os.path.isfile(firebase_json_path):
    try:
        cfg = load_json(firebase_json_path)
    except Exception as exc:  # noqa: BLE001
        cfg = None
        errors.append(f"firebase.json unreadable: {exc}")
    if isinstance(cfg, dict):
        hosting = cfg.get("hosting")
        if isinstance(hosting, list):
            hosting = hosting[0] if hosting else {}
        if isinstance(hosting, dict):
            hosting_public = hosting.get("public")
            if not hosting.get("target"):
                warnings.append(
                    "firebase.json hosting has no 'target' — CI deploys hosting:$HOSTING_TARGET and needs a target name"
                )
        funcs = cfg.get("functions")
        codebase = None
        if isinstance(funcs, list) and funcs:
            codebase = funcs[0].get("codebase")
            predeploy = funcs[0].get("predeploy") or []
            fscripts = pkg_scripts("functions")
            if fscripts is None:
                warnings.append("firebase.json declares predeploy scripts but functions/package.json is missing")
                fscripts = set()
            for cmd in predeploy:
                for m in re.finditer(r"npm\s+--prefix\s+\"?\$RESOURCE_DIR\"?\s+run\s+([A-Za-z0-9:_\-]+)", cmd):
                    if m.group(1) not in fscripts:
                        errors.append(
                            f"firebase.json predeploy runs '{m.group(1)}' but functions/package.json has no such script"
                        )
                    else:
                        checked_scripts.append(f"predeploy:{m.group(1)}")
            if codebase:
                checked_paths.append(f"functions codebase = {codebase}")
                for name in workflow_docs:
                    body = read(os.path.join(ROOT_WF, name))
                    # Only a workflow that actually deploys functions needs the codebase name.
                    if "--only functions" in body and codebase not in body:
                        warnings.append(
                            f"{name}: deploys functions but never names the codebase '{codebase}' — "
                            f"check the functions deploy step"
                        )

        firebaserc = os.path.join(REPO_ROOT, ".firebaserc")
        if os.path.isfile(firebaserc):
            try:
                targets = (load_json(firebaserc).get("targets") or {})
                if not targets:
                    warnings.append(".firebaserc has no hosting targets — `--only hosting:<target>` will fail")
            except Exception as exc:  # noqa: BLE001
                errors.append(f".firebaserc unreadable: {exc}")

# Vite outDir vs hosting public
vite_cfg = os.path.join(REPO_ROOT, "admin-panel", "vite.config.js")
if os.path.isfile(vite_cfg) and hosting_public:
    body = read(vite_cfg)
    m = re.search(r"outDir:\s*['\"]([^'\"]+)['\"]", body)
    vite_out = m.group(1) if m else "dist"
    expected = os.path.normpath(os.path.join("admin-panel", vite_out))
    if os.path.normpath(hosting_public) != expected:
        errors.append(
            f"hosting.public is '{hosting_public}' but Vite writes to '{expected}' — deploys would publish an empty site"
        )
    else:
        checked_paths.append(f"hosting.public == Vite outDir ({expected})")
    if not os.path.isdir(os.path.join(REPO_ROOT, expected)):
        warnings.append(f"{expected}/ is not present — build the admin panel before deploying hosting")

# env prefix consistency
admin_src = os.path.join(REPO_ROOT, "admin-panel", "src", "services", "firebase.js")
if os.path.isfile(admin_src):
    prefixes = set(re.findall(r"import\.meta\.env\.([A-Z0-9]+)_[A-Z0-9_]+", read(admin_src)))
    for prefix in prefixes:
        checked_paths.append(f"admin env prefix = {prefix}_")
        if prefix == "VITE":
            if "REACT_APP_" in read(admin_src):
                errors.append("admin-panel/src/services/firebase.js mixes VITE_* and REACT_APP_* lookups")
            def declares_react_app(env_path):
                """True only for a real REACT_APP_* ASSIGNMENT (comments/prose excluded)."""
                if not os.path.isfile(env_path):
                    return False
                return bool(re.search(r"^\s*REACT_APP_[A-Z0-9_]+=", read(env_path), re.MULTILINE))

            for label, env_path in (
                ("admin-panel/.env.example", os.path.join(REPO_ROOT, "admin-panel", ".env.example")),
                ("devops/admin-panel/.env.example", os.path.join(REPO_ROOT, "devops", "admin-panel", ".env.example")),
            ):
                if declares_react_app(env_path):
                    errors.append(f"{label} declares REACT_APP_* assignments while the source reads VITE_*")
                elif os.path.isfile(env_path) and "VITE_" in read(env_path):
                    checked_paths.append(f"{label}: VITE_* prefix")

# --------------------------------------------------------------------------
# Report
# --------------------------------------------------------------------------
print("== Repo root ==")
print("  scanning:", REPO_ROOT)
print("== JSON files validated ==")
for item in checked_json:
    print("  ok:", item)
print("== YAML files validated ==")
for item in checked_yaml:
    print("  ok:", item)
print("== Workflows validated ==")
for name in workflow_docs:
    print("  ok:", os.path.join(".github", "workflows", name))
print("== Cross-file references verified ==")
for item in sorted(set(checked_scripts + checked_paths)):
    print("  ok:", item)

if warnings:
    print("\n== WARNINGS (non-fatal) ==")
    for warning in warnings:
        print("  ~", warning)

if errors:
    print("\n== FAILURES ==")
    for err in errors:
        print("  !!", err)
    sys.exit(1)

print("\nALL CHECKS PASSED" if not warnings else "\nALL CHECKS PASSED (with warnings)")