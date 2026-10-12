# Small real-paper scan validation (opt-in)

Three physical pages from two public-domain historical works, plus one explicitly
labelled body-only crop of the same English page. The Chinese samples contain
handwritten Traditional Chinese in printed teaching material; they are not a
modern typeset Traditional Chinese document benchmark. Source terms, fixed URLs,
SHA-256 checksums, privacy checks, original 1-based PDF page numbers and manual
annotations are in `manifest.json`. No OmniDocBench data is used.

## Reproduce

From the repository root, using Node >=22 and Python with PyMuPDF 1.26.6:

```sh
npm ci
npx playwright install --with-deps chromium
python -m pip install PyMuPDF==1.26.6
python tests/real-scans/prepare.py
node --test tests/real-scans/metrics.test.mjs
npm run test:ocr:real -- --repeat-each=2
node tests/real-scans/summarize.mjs
```

Preparation downloads the two source PDFs (about 21 MB combined) and refuses
changed checksums. The archived source PDFs include legacy OCR; preparation
rasterizes the real paper pages at 300 DPI / 3500 px maximum edge, preserving
paper texture and original dimensions, to prevent taking the native-text path.
It does not synthesize characters, denoise or deskew. The body-only crop removes
the English running title; its fixed rectangle is documented in the manifest.
The Playwright test embeds the prepared PNG as an image-only PDF and proves it
has no text before OCR.

Preparation and real scans are deliberately outside normal CI; the browser run
blocks external requests, uses the actual UI/Tesseract/bundled language files,
and has no retries. Default automatic, single-column PSM 4 and centre-split
PSM 4 are tested without intercepting or rewriting production modules.

All scans, generated input/output PDFs and raw TXT files stay in ignored
`.cache/real-scans/` and `real-scan-results/`. Do not commit them. The report JSON
retains full raw UI text, boxes, PDF extraction observations, selected region
scores, source/image/engine/output hashes and two-run comparisons. The material
is public-domain historical text, not private user documents. Never substitute
an unlicensed source without reviewing and updating its provenance.

## What the metrics mean

- **Selected-region CER:** concatenate only lines that overlap the fixed manual
  annotations, in the application's original output order. Call the existing
  `characterErrorRate` without changes. This is *not whole-page CER*.
- **Spatial region CER:** supplementary weighted CER within each fixed region,
  preserving the relative order of lines assigned to it. Missing regions count
  as deletions. A line spanning multiple annotated regions is not split or
  duplicated: those regions have `cer: null`; scored-character coverage is shown.
  This observes recognition **and detection** independent of between-region
  order; it is not a pure recognition oracle and must not replace primary CER.
- **Reading order:** report the sequence of matched region IDs, merged lines,
  missing regions and pairwise inversions. A missing region is classified as
  incomplete detection, never as successful reading order. For same-row merged
  regions, the IDs imply left-to-right geometry, not a verified text split.
- **Position:** record every original focus rectangle, page bounds, and the
  fraction of each matched box inside its independent annotated rectangle.
  The rectangles are loose human region annotations, not precise character or
  word boxes; no character-level localization accuracy claim is made.
- **PDF/TXT:** exact UI-to-TXT and PDF extracted text preservation (PDF ignores
  whitespace only), invisible text mode 3, unchanged page dimensions and visible
  RGBA pixel hashes. Known independent correction strings are edited through
  the UI, saved/reopened, downloaded, and checked against PDF coordinates. The
  initial full-page batch first repetition used every line; later contexts and
  the paired crop cover first/middle/last plus every matched annotation. Both methods test the same production code; OCR results
  are always captured *before* editing.

A match requires vertical overlap >=50% of the OCR box and horizontal overlap
>=25% of the smaller width. Broad or merged OCR boxes near annotation boundaries
can be omitted or include unrelated text; inspect `rawUiLines`, boxes and the
source before interpreting a small score difference. Keep annotations fixed
rather than tuning them to favour a mode. These diagnostics do not replace a
full manually transcribed dataset or a general reading-order evaluation.

Two independent contexts/workers per condition are pre-planned repeats, not
failure retries. CER is informational and may exceed 1 for many insertions.
The four metric tests cover order-only errors, merged regions, missing regions
and out-of-scope text; run them separately with the command above.

## Browser version

The recorded run used Chromium 153.0.8010.0 and Node 24.19.0; the existing CI
uses Chromium 145.0.7632.6 and Node 22. Default reproduction uses Playwright's
installed browser, so record its actual version and do not assume identical
numbers across releases. To reuse an available matching Chromium binary:

```sh
REAL_SCAN_CHROMIUM_EXECUTABLE=/absolute/path/to/chromium npm run test:ocr:real -- --repeat-each=2
```

This executable override changes only the test launcher, not production code.
The run used the container's existing headless Chromium binary with
`--no-sandbox --disable-dev-shm-usage`; these container flags are not needed on
an ordinary workstation. No platform-specific binary paths are committed.

PDF byte hashes are audit records, not cross-run golden hashes: embedded creation
metadata can differ. The repeat stability comparison uses raw OCR text, boxes
and recomputed metrics; visual preservation uses RGBA pixel hashes within each
run. Source-PDF and prepared-PNG hashes are separately checked.
