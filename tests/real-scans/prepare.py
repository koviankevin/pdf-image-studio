"""Opt-in, public-domain scan preparation. Never called by normal CI.
Requires: python -m pip install PyMuPDF==1.26.6
Raw PDFs, raster pages and source metadata remain in ignored .cache/real-scans.
"""
import hashlib
import json
from pathlib import Path
import urllib.request
import fitz

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / '.cache' / 'real-scans'
MANIFEST = json.loads((Path(__file__).parent / 'manifest.json').read_text())

def sha(data):
    return hashlib.sha256(data).hexdigest()

def main():
    if fitz.VersionBind != '1.26.6':
        raise RuntimeError('Use PyMuPDF==1.26.6 for reproducible raster preparation')
    CACHE.mkdir(parents=True, exist_ok=True)
    sources = {}
    for source in MANIFEST['sources']:
        path = CACHE / source['file']
        if not path.exists():
            request = urllib.request.Request(source['url'], headers={'User-Agent': 'ClearPDF-real-scan-validation/1.0'})
            with urllib.request.urlopen(request, timeout=90) as response:
                data = response.read()
            if sha(data) != source['sha256']:
                raise RuntimeError(f"Source changed: {source['id']}")
            path.write_bytes(data)
        if sha(path.read_bytes()) != source['sha256']:
            raise RuntimeError(f"Checksum mismatch: {path}")
        sources[source['id']] = fitz.open(path)
    records = []
    for sample in MANIFEST['pages']:
        page = sources[sample['source']][sample['page'] - 1]
        # Discard legacy OCR by rasterizing the actual scanned page. No text is
        # redrawn, deskewed, enhanced or synthesized. The optional, explicit
        # body-only crop is a paired derivative, never a new physical sample.
        clip = fitz.Rect(sample.get('crop', page.rect))
        scale = min(300 / 72, 3500 / max(clip.width, clip.height))
        pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale), clip=clip, alpha=False)
        data = pix.tobytes('png')
        (CACHE / f"{sample['id']}.png").write_bytes(data)
        records.append({'id': sample['id'], 'width': clip.width, 'height': clip.height,
                        'crop': list(clip),
                        'rasterWidth': pix.width, 'rasterHeight': pix.height,
                        'pngSha256': sha(data), 'rasterizer': f'PyMuPDF {fitz.VersionBind}',
                        'sourceSha256': next(s['sha256'] for s in MANIFEST['sources'] if s['id'] == sample['source'])})
    (CACHE / 'prepared.json').write_text(json.dumps(records, indent=2) + '\n')
    print(json.dumps(records, indent=2))

if __name__ == '__main__':
    main()
