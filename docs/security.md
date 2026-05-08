# Secret Scanner — Usage and Configuration

SolSoul uses [gitleaks](https://github.com/gitleaks/gitleaks) to prevent
accidental commits of Solana keypairs, API keys, and private RPC URLs.

---

## Quick start

### Install gitleaks

```bash
# macOS
brew install gitleaks

# Linux (Debian/Ubuntu)
curl -sSL https://github.com/gitleaks/gitleaks/releases/latest/download/gitleaks_linux_x64.tar.gz \
  | tar -xz -C /usr/local/bin gitleaks

# Verify
gitleaks version  # should print 8.x or later
```

### Install the pre-commit hook

The hook runs the scanner on staged files only; untracked files are never
inspected.

```bash
cp scripts/pre-commit.hook .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

After installation, every `git commit` automatically runs
`scripts/scan-secrets.sh` on the staged diff before the commit is created.

---

## Manual scan

### Scan staged files (same as pre-commit)

```bash
bash scripts/scan-secrets.sh
```

### Scan a specific file or directory

```bash
bash scripts/scan-secrets.sh path/to/file
bash scripts/scan-secrets.sh path/to/directory/
```

### Confirm the scanner catches test fixtures

```bash
# Expects exit code 0 — clean repo
bash scripts/scan-secrets.sh

# Expects exit code 1 — fixture contains fake secrets
bash scripts/scan-secrets.sh test-fixtures/secret-positive
```

---

## What is detected

The configuration (`.gitleaks.toml`) enables all built-in gitleaks rules
**plus** the following SolSoul-specific patterns:

| Rule ID | What it catches |
|---|---|
| `solana-base58-private-key` | 87–88-char base58 string in a key-assignment context (`PRIVATE_KEY=…`, `SECRET_KEY=…`, etc.) — indicates a Solana ed25519 private key |
| `solana-keypair-json-array` | JSON array of exactly 64 u8 values — the format written by `solana-keygen` |
| `helius-api-key` | Helius RPC UUID-format API key |
| `triton-rpc-url-with-key` | `*.rpcpool.com/<token>` URL |
| `quicknode-rpc-url-with-key` | `*.quiknode.pro/<token>` URL |
| `rpc-url-private-host` | `NEXT_PUBLIC_RPC` / `RPC_URL` pointing to a non-public host |

---

## Allowlisted paths

The following paths are **never** flagged, even when they contain
pattern-matching strings:

| Path pattern | Rationale |
|---|---|
| `*.env.example`, `*.env.*.example` | Placeholder files; real values must never appear here |
| `test-fixtures/secret-negative/**` | Expected-clean fixture directory |
| `.gitleaks.toml` | Config file itself contains regex patterns |
| `docs/security.md` | This file documents patterns, not real secrets |

---

## Adding a new allowlist exception

If a file legitimately contains a pattern-matching string that is not a
secret (e.g. a documentation example, a test seed, or a computed constant),
add an allowlist entry in `.gitleaks.toml`:

```toml
# Global allowlist — add the file path:
[allowlist]
  paths = [
    ...
    '''(^|/)path/to/safe-file\.txt$''',
  ]

# Or per-rule allowlist — add to the specific [[rules]] block:
[rules.allowlist]
  paths = ['''your/safe/path''']
  regexes = ['''<YOUR_.*>''']  # regex to skip within the file
```

---

## Bypass of last resort

Bypassing the scanner should be exceptional and fully documented.

### Option 1 — Environment variable

```bash
SKIP_SECRET_SCAN=1 git commit -m "chore: ..."
```

The hook checks for `SKIP_SECRET_SCAN=1` and exits cleanly.  Use this when
you are certain the detected string is not a secret (e.g. a false positive
that has been added to the allowlist in a separate commit).

### Option 2 — Git no-verify flag

```bash
git commit --no-verify -m "..."
```

This skips **all** pre-commit hooks, not just the scanner.  Use only as a
last resort (e.g. broken gitleaks installation blocking CI).

### After bypassing

1. Open a follow-up PR immediately to add a proper allowlist entry.
2. Confirm `bash scripts/scan-secrets.sh` exits 0 on the updated tree.
3. If a real secret was committed by mistake, **rotate the credential
   immediately** and rewrite history with `git filter-repo` or contact the
   relevant provider's emergency revocation endpoint.

---

## CI integration (optional)

To run the scanner in CI as a non-blocking lint step:

```yaml
# .github/workflows/lint.yml
- name: Secret scan
  run: |
    gitleaks detect --config .gitleaks.toml --source . --verbose
```

Add `continue-on-error: true` if you want CI to report findings without
blocking merges while the team works through false positives.

---

## Test fixtures

| Path | Purpose |
|---|---|
| `test-fixtures/secret-positive` | Contains fake secrets; scanner must exit 1 |
| `test-fixtures/secret-negative/` | Contains placeholders; scanner must exit 0 |

Run both checks to confirm the scanner is correctly configured:

```bash
bash scripts/scan-secrets.sh test-fixtures/secret-positive  # expect exit 1
bash scripts/scan-secrets.sh test-fixtures/secret-negative  # expect exit 0
```
