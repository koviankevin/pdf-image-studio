export const outputPresets = {
  slides: {label: '簡報 PNG', dpi: 300, format: 'png', maxEdge: 2560, quality: .95},
  sharp: {label: '600 DPI 清晰截圖', dpi: 600, format: 'png', maxEdge: 0, quality: .95},
  small: {label: '小檔 JPG', dpi: 150, format: 'jpeg', maxEdge: 1600, quality: .8},
};

export function validSettings(value) {
  return value && [150, 300, 450, 600].includes(value.dpi) && ['png', 'jpeg'].includes(value.format)
    && Number.isInteger(value.maxEdge) && (value.maxEdge === 0 || value.maxEdge >= 64 && value.maxEdge <= 16384)
    && Number.isFinite(value.quality) && value.quality >= .3 && value.quality <= 1;
}

export function readPreferences(text) {
  try {
    const value = JSON.parse(text);
    if (value?.version !== 1) return null;
    if (value.remember === false) return {version: 1, remember: false};
    if (!validSettings(value.settings)) return null;
    const {dpi, format, maxEdge, quality} = value.settings;
    return {version: 1, remember: true, settings: {dpi, format, maxEdge, quality}};
  } catch { return null; }
}

export function matchingPreset(settings) {
  return Object.entries(outputPresets).find(([, p]) => ['dpi', 'format', 'maxEdge', 'quality']
    .every(key => key === 'quality' && settings.format === 'png' || p[key] === settings[key]))?.[0] || 'custom';
}

// Export receipts stay in memory. A receipt for a subset never clears other pages.
export function createExportReceipts() {
  const receipts = new Map(), content = new WeakMap();
  const signature = (page, index, count) => {
    if (!content.has(page)) content.set(page, JSON.stringify({sourceId: page.sourceId, sourceIndex: page.index,
      rotation: page.rotation || 0, crop: page.crop || null, annotations: page.annotations || [], ocr: page.ocr || null}));
    return `${index}/${count}/${content.get(page)}`;
  };
  return {
    mark(records, current) {
      for (const page of records) {
        const index = current.findIndex(p => p.id === page.id);
        if (index >= 0 && signature(page, index, current.length) === signature(current[index], index, current.length)) receipts.set(page.id, signature(page, index, current.length));
      }
    },
    pending(current) { return current.some((page, index) => receipts.get(page.id) !== signature(page, index, current.length)); },
    clear() { receipts.clear(); },
  };
}
