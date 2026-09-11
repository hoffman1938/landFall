#!/usr/bin/env bash
#
# LANDFALL — certification evidence runner.
#
#   ./run.sh              run every automated suite
#   ./run.sh --evidence   run the suites AND regenerate the evidence pack
#                         (simulations, statistical reports, config digests)
#
# There is nothing to install. The suite runs on the application workspace's own
# toolchain and against the application's own source — see `vitest.config.ts` for
# why that matters and `docs/01-scope-and-method.md` for what it does and does
# not establish.
#
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE="$(cd "$HERE/../iGaming" && pwd)"
CORE="$WORKSPACE/packages/core"

# The suite resolves its test runner through the application workspace rather
# than carrying a second copy that could drift from the one the product's own
# tests run under. pnpm creates that directory; this link points at it.
if [ ! -e "$HERE/node_modules" ]; then
  ln -s ../iGaming/node_modules "$HERE/node_modules"
fi
if [ ! -d "$WORKSPACE/node_modules" ]; then
  echo "The application workspace is not installed. Run:  (cd $WORKSPACE && pnpm install)" >&2
  exit 1
fi

# `tsx` honours this directory's tsconfig path mappings, which is what makes the
# simulations run against the shipped source rather than a build artefact.
TSX="$WORKSPACE/node_modules/.bin/tsx"

EVIDENCE="$HERE/evidence"
RUN_EVIDENCE=0
for arg in "$@"; do
  [ "$arg" = "--evidence" ] && RUN_EVIDENCE=1
done

echo "==> Automated conformance suites"
(cd "$WORKSPACE" && pnpm exec vitest run --config "$HERE/vitest.config.ts")

echo
echo "==> Application test suites (the product's own)"
(cd "$WORKSPACE" && pnpm -r test)

if [ "$RUN_EVIDENCE" -eq 1 ]; then
  mkdir -p "$EVIDENCE"
  echo
  echo "==> Evidence: economy release gate (1,000,000 rounds)"
  (cd "$CORE" && pnpm exec tsx scripts/simulate.ts) | tee "$EVIDENCE/01-release-gate.txt"

  echo
  echo "==> Evidence: return-to-player convergence, every stake tier"
  (cd "$HERE" && "$TSX" simulations/rtp-convergence.ts) \
    | tee "$EVIDENCE/02-rtp-convergence.txt"

  echo
  echo "==> Evidence: RNG statistical report (GLI-19 §3.2.2 battery)"
  (cd "$HERE" && "$TSX" simulations/rng-evidence.ts) \
    | tee "$EVIDENCE/03-rng-statistics.txt"

  echo
  echo "==> Evidence: per-tier certification simulation reports"
  for tier in skiff schooner flagship galleon leviathan; do
    (cd "$CORE" && pnpm exec tsx scripts/certification-sim.ts \
      --tier="$tier" --rounds=4000 --players=600 --runs=1 --seed=20260911 --save=0) \
      > "$EVIDENCE/04-tier-$tier.txt"
    echo "  $tier -> evidence/04-tier-$tier.txt"
  done

  echo
  echo "==> Evidence: build and configuration identity"
  (cd "$HERE" && "$TSX" simulations/identity.ts) \
    | tee "$EVIDENCE/05-identity.txt"

  echo
  echo "Evidence pack written to $EVIDENCE"
fi

echo
echo "All certification suites passed."
