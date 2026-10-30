#!/usr/bin/env bash
set +x
set -euo pipefail

if [[ ! -t 0 ]]; then
  printf 'Run this setup in an interactive terminal. Do not pipe a credential into it.\n' >&2
  exit 1
fi
if [[ -e .env || -L .env ]]; then
  printf 'A private .env already exists. Setup will not overwrite it.\n' >&2
  exit 1
fi
printf 'Local Copilot access check only: no recipes or model generations.\n'
printf 'Use a fine-grained personal token with only Copilot Requests permission.\n'
read -r -p 'Expected GitHub username (not email): ' COPILOT_EXPECTED_LOGIN
read -r -s -p 'Paste token here (hidden), then press Enter: ' COPILOT_GITHUB_TOKEN
printf '\n'
if [[ ! "$COPILOT_GITHUB_TOKEN" =~ ^github_pat_[A-Za-z0-9_]+$ ]]; then
  printf 'Expected a fine-grained personal access token. Nothing was saved.\n' >&2
  exit 1
fi
export COPILOT_EXPECTED_LOGIN COPILOT_GITHUB_TOKEN
exec node dist/configure.js
