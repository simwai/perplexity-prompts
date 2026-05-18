#!/usr/bin/env bash
# pre-commit-check.sh
# Analyzes the repo for scripts and runs format, test, and quality checks.
# Works on Linux and macOS. Run directly or via .pre-commit-config.yaml.

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
ERRORS=0

log()  { echo "[pre-commit] $*"; }
fail() { echo "[pre-commit] FAIL: $*" >&2; ERRORS=$((ERRORS + 1)); }
pass() { echo "[pre-commit] PASS: $*"; }

# ── 1. Detect package manager ────────────────────────────────────────────────
log "Detecting package manager..."
PKG_MANAGER=""
if   [ -f "$ROOT/package.json" ] && command -v pnpm &>/dev/null && [ -f "$ROOT/pnpm-lock.yaml" ]; then PKG_MANAGER="pnpm"
elif [ -f "$ROOT/package.json" ] && command -v yarn &>/dev/null && [ -f "$ROOT/yarn.lock" ];     then PKG_MANAGER="yarn"
elif [ -f "$ROOT/package.json" ] && command -v npm  &>/dev/null;                                  then PKG_MANAGER="npm"
elif [ -f "$ROOT/pyproject.toml" ] || [ -f "$ROOT/setup.py" ] || [ -f "$ROOT/setup.cfg" ];       then PKG_MANAGER="python"
fi

if [ -z "$PKG_MANAGER" ]; then
  log "No recognisable package manager found — skipping npm/python script checks."
else
  log "Package manager: $PKG_MANAGER"
fi

# ── 2. Run package.json scripts: format, lint, test ─────────────────────────
run_npm_script() {
  local SCRIPT="$1"
  if [ -z "$PKG_MANAGER" ] || [ ! -f "$ROOT/package.json" ]; then return; fi
  if node -e "const p=require('./package.json'); process.exit(p.scripts&&p.scripts['$SCRIPT']?0:1)" 2>/dev/null; then
    log "Running: $PKG_MANAGER run $SCRIPT"
    if (cd "$ROOT" && $PKG_MANAGER run "$SCRIPT"); then
      pass "$SCRIPT"
    else
      fail "$SCRIPT failed"
    fi
  else
    log "Script '$SCRIPT' not found in package.json — skipping."
  fi
}

for SCRIPT in format lint typecheck test build; do
  run_npm_script "$SCRIPT"
done

# ── 3. Run Python checks if applicable ───────────────────────────────────────
if [ "$PKG_MANAGER" = "python" ]; then
  VENV="$ROOT/.venv"
  PYTHON="${VENV}/bin/python"
  [ -x "$PYTHON" ] || PYTHON="$(command -v python3 || command -v python)"

  for TOOL in ruff mypy pytest; do
    TOOL_BIN="${VENV}/bin/$TOOL"
    [ -x "$TOOL_BIN" ] || TOOL_BIN="$(command -v $TOOL 2>/dev/null || echo '')"
    if [ -n "$TOOL_BIN" ]; then
      log "Running: $TOOL"
      case "$TOOL" in
        ruff)  (cd "$ROOT" && "$TOOL_BIN" check .) && pass "ruff"  || fail "ruff check failed" ;;
        mypy)  (cd "$ROOT" && "$TOOL_BIN" .)       && pass "mypy"  || fail "mypy failed" ;;
        pytest)(cd "$ROOT" && "$TOOL_BIN" .)       && pass "pytest"|| fail "pytest failed" ;;
      esac
    else
      log "$TOOL not found — skipping."
    fi
  done
fi

# ── 4. Find and run all .sh scripts (excluding this one) ─────────────────────
log "Scanning for .sh scripts..."
SELF="$(realpath "$0")"
while IFS= read -r SCRIPT_FILE; do
  ABS="$(realpath "$SCRIPT_FILE")"
  [ "$ABS" = "$SELF" ] && continue
  BASENAME="$(basename "$SCRIPT_FILE")"
  # Only run scripts that declare a pre-commit intent in their first 5 lines
  if head -5 "$SCRIPT_FILE" | grep -qi 'pre.commit\|format\|lint\|test\|quality'; then
    log "Running shell script: $SCRIPT_FILE"
    if bash "$SCRIPT_FILE"; then
      pass "$BASENAME"
    else
      fail "$BASENAME exited non-zero"
    fi
  else
    log "Skipping (no pre-commit marker): $SCRIPT_FILE"
  fi
done < <(find "$ROOT" -name '*.sh' -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/.venv/*')

# ── 5. Find and run all .ps1 scripts via pwsh if available ───────────────────
if command -v pwsh &>/dev/null; then
  log "Scanning for .ps1 scripts..."
  while IFS= read -r SCRIPT_FILE; do
    BASENAME="$(basename "$SCRIPT_FILE")"
    if head -5 "$SCRIPT_FILE" | grep -qi 'pre.commit\|format\|lint\|test\|quality'; then
      log "Running PowerShell script: $SCRIPT_FILE"
      if pwsh -NonInteractive -File "$SCRIPT_FILE"; then
        pass "$BASENAME"
      else
        fail "$BASENAME exited non-zero"
      fi
    else
      log "Skipping (no pre-commit marker): $SCRIPT_FILE"
    fi
  done < <(find "$ROOT" -name '*.ps1' -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/.venv/*')
else
  log "pwsh not found — skipping .ps1 scripts."
fi

# ── 6. Summary ───────────────────────────────────────────────────────────────
echo ""
if [ "$ERRORS" -eq 0 ]; then
  log "All checks passed. ✓"
  exit 0
else
  echo "[pre-commit] $ERRORS check(s) failed. Commit blocked." >&2
  exit 1
fi
