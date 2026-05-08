# test-fixtures/secret-negative

Files in this directory contain **placeholder strings** that must NOT be
flagged by the secret scanner.

They simulate the content of `.env.example` and other whitelisted files
where placeholder / instructional values are intentionally present.

The entire `test-fixtures/secret-negative` path is listed in
`.gitleaks.toml`'s global allowlist.
