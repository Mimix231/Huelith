# Project Fluidity checks

From repository root (with dependencies installed):

- `npm run check` — full TypeScript validation (requires React/MUI deps).
- `npm test` — Node regression suite.
- `python tests/fluidity-cpu-browser.py` — CPU spatial alpha/fidelity and timing.
- `python tests/fluidity-roi-browser.py` — transparent-layer ROI exact parity.
- `python tests/fluidity-detail-browser.py` — sharpen/detail/denoise pixel behavior.
- `python tests/fluidity-box-browser.py` — separable box blur pixel parity.
- `python tests/fluidity-shock-browser.py` — optimized Shock Zoom reference parity.
- `python tests/fluidity-spatial-browser.py` — GPU visual/alpha probe (reports SKIPPED if WebGL2 is unavailable; **must be run on the Windows target**).

Timing results are per test environment and do not establish a universal frame rate.
