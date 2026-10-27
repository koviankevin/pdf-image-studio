// WebKit can defer drawImage from PDF.js scratch canvases until after those
// canvases are reset. A CPU-backed destination snapshots the pixels reliably.
// Keep the normal accelerated destination in Chromium and Firefox.
export function pdfCanvasContext(canvas,options={}){
  const ua=globalThis.navigator?.userAgent||'';
  const webkit=/\bAppleWebKit\//.test(ua)&&!/\b(?:Chrome|Chromium|HeadlessChrome|Edg|OPR)\//.test(ua);
  return canvas.getContext('2d',webkit?{...options,willReadFrequently:true}:options);
}
