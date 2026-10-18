# Cross-browser smoke validation — 2026-10-18

## Evidence and scope

Initial CI run: https://github.com/koviankevin/pdf-image-studio/actions/runs/39089391967

- Base: `f39b1406ced767755b3f0ef1f717fb0246cbc112` (PR #9).
- Initial test commit: `b0ba46b57b312cdded78bbde0dcb217bd3f02ffa`.
- Tested PR merge SHA: `595c956d6bbf2fabc9b1c6362092f25c1381dac2`.
- Playwright 1.58.2, Node 22, Ubuntu 24.04 GitHub-hosted runners.

| Browser | Result | Playwright suite duration | Engine build |
| --- | --- | --- | --- |
| Firefox | 6 / 6 passed | 33.3 s | Firefox 146.0.1, Playwright revision 1509 |
| Playwright WebKit | 6 / 6 passed | 40.7 s | WebKit 26.0, Playwright revision 2248 |
| Chromium (existing full regression) | 25 / 25 passed | 2.8 min | Existing pinned Playwright browser |
| Real Safari on macOS / iOS | Not run | — | No device/version coverage claimed |

Durations exclude dependency/browser installation and artifact upload; these are
observations from one CI run, not performance thresholds. Both jobs use one worker,
zero retries and a five-minute suite limit. The existing Chromium regression remains
separate; all 60 deployment-contract and 14 unit tests also passed. The final PR check run is authoritative for subsequent test-tag/documentation
changes; this report records the initial execution rather than claiming an untested SHA.

## What the six cases establish

1. Two synthetic PDFs import together, reorder, preview multiple A4 sheets and
   download a real PDF with the expected dimensions and source text order.
2. Repeated delete/import cycles release unreachable source rows and native PDF
   workers; a failed import retains undo, and clearing the workspace terminates all
   remaining source workers. This observes resource ownership, not process RSS/GC.
3. Cancelling a delayed first OCR module import unlocks immediately. The delayed
   module response starts no stale worker; a subsequent request completes real OCR.
4. Importing a shorter PDF after a longer one does not break the longer source's
   page 3 crop preview or downloaded image.
5. Obsolete A4 builds cancel; close/reopen cannot resurrect them or run concurrent
   builds. Only a scheduling wait is injected; actual PDF assembly/rendering runs.
6. The real Tesseract engine, WASM and English language data initialize. Cancelling
   at the first recognition dispatch terminates that worker. A fresh worker then
   recognizes both image-only synthetic pages, reuses the same engine across pages,
   produces nonempty editable text and previews, and terminates on completion.

All six cases also assert no document CSP violation and no unhandled page error.
The shipped CSP remains enabled. OCR text is not a CER oracle, and the suite does
not triple the full Chinese/English accuracy, two-column or degraded-scan matrix.
Only the first OCR `recognize` message is held before native Worker dispatch to
make cancellation deterministic; no result is mocked. Arbitrary interruption during
WASM computation is outside this case's claim.

## Findings and limits

No application compatibility defect or third-party incompatibility was reproduced
in these cases. Production files and vendored libraries are unchanged. This is not
proof of all functionality in either browser, nor all Safari versions: Linux
Playwright WebKit does not reproduce Safari's macOS/iOS integration, permissions,
clipboard, download UI or older engine versions. Physical scan coverage is unchanged.

Local browser execution was unavailable in the constrained authoring environment
(Firefox startup did not complete; WebKit system dependencies could not be installed).
The table above is based on actual GitHub Actions browser execution, not local mocks.

Artifacts `compatibility-firefox-1` and `compatibility-webkit-1` preserve HTML results,
browser-version/CSP/error JSON attachments and the synthetic PDF for seven days.
Failed runs additionally retain Playwright traces/screenshots. The source fixture
regenerates the same non-personal test content for later reproduction.

## CI integration

The original Node/Chromium job name, full 25-case browser suite, OCR accuracy output,
immutable checkout and stale-main deployment guard remain. Deployment now also waits
for both compatibility matrix entries; failure, cancellation or skipping blocks
publication. The workflow contract suite verifies these gates and read-only test
permissions. PR execution never publishes Pages; real deployment awaits merge.
