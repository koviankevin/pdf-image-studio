// Geometry in displayed millimetres. Only the active sheet (at most 30 items)
// participates; source PDF records remain immutable and shared.
export function selectionBounds(items) {
  if (!items.length) return null;
  const x = Math.min(...items.map(i => i.x)), y = Math.min(...items.map(i => i.y));
  return {x, y, width: Math.max(...items.map(i => i.x + i.width)) - x,
    height: Math.max(...items.map(i => i.y + i.height)) - y};
}
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
export function moveSelection(items, dx, dy, size) {
  const box = selectionBounds(items); if (!box) return [];
  dx = clamp(dx, -box.x, size.width - box.x - box.width);
  dy = clamp(dy, -box.y, size.height - box.y - box.height);
  return items.map(item => ({...item, x: item.x + dx, y: item.y + dy}));
}
export function scaleSelection(items, scale, size) {
  const box = selectionBounds(items); if (!box) return [];
  if (!Number.isFinite(scale) || scale <= 0) throw Error('請輸入有效的縮放尺寸。');
  const min = Math.max(...items.map(i => Math.max(1 / i.width, 1 / i.height, i.type === 'text' ? 6 / i.fontSize : 0)));
  const max = Math.min((size.width - box.x) / box.width, (size.height - box.y) / box.height,
    ...items.filter(i => i.type === 'text').map(i => 72 / i.fontSize));
  if (scale < min - 1e-8 || scale > max + 1e-8) throw Error('縮放後須位於 A4 內，每個項目至少 1 mm，標題字級須為 6 至 72 pt。');
  return items.map(item => ({...item, x: box.x + (item.x - box.x) * scale, y: box.y + (item.y - box.y) * scale,
    width: item.width * scale, height: item.height * scale, ...(item.type === 'text' ? {fontSize: item.fontSize * scale} : {})}));
}
export function alignSelection(items, action, size) {
  const box = selectionBounds(items); if (!box) return [];
  // Preserve the original single-item sheet/margin alignment.
  const reference = items.length === 1 ? {x: 10, y: 10, width: size.width - 20, height: size.height - 20} : box;
  if (!['left', 'center', 'right', 'top', 'middle', 'bottom'].includes(action)) throw Error('不支援的對齊方式。');
  return items.map(item => {
    const next = {...item};
    if (action === 'left') next.x = reference.x;
    if (action === 'center') next.x = reference.x + (reference.width - item.width) / 2;
    if (action === 'right') next.x = reference.x + reference.width - item.width;
    if (action === 'top') next.y = reference.y;
    if (action === 'middle') next.y = reference.y + (reference.height - item.height) / 2;
    if (action === 'bottom') next.y = reference.y + reference.height - item.height;
    next.x = clamp(next.x, 0, size.width - next.width); next.y = clamp(next.y, 0, size.height - next.height);
    return next;
  });
}
export function distributeSelection(items, axis) {
  if (items.length < 3) throw Error('請選取至少 3 個項目，才能平均分配間距。');
  if (!['x', 'y'].includes(axis)) throw Error('不支援的排列方向。');
  const extent = axis === 'x' ? 'width' : 'height', sorted = [...items].sort((a,b) => a[axis] - b[axis]);
  const first = sorted[0], last = sorted.at(-1), span = last[axis] + last[extent] - first[axis];
  const gap = (span - sorted.reduce((n,item) => n + item[extent], 0)) / (items.length - 1);
  if (gap < -1e-8) throw Error('選取項目重疊過多，請先拉開兩端或縮小項目，再平均分配間距。');
  const positions = new Map(); let cursor = first[axis];
  for (const item of sorted) { positions.set(item.id, cursor); cursor += item[extent] + Math.max(0, gap); }
  return items.map(item => ({...item, [axis]: positions.get(item.id)}));
}
export function snapSelection(items, others, dx, dy, size, threshold = 2) {
  const moved = moveSelection(items, dx, dy, size), box = selectionBounds(moved), guides = [];
  if (!box) return {items: moved, guides};
  const offsets = {x: 0, y: 0};
  for (const axis of ['x', 'y']) {
    const extent = axis === 'x' ? 'width' : 'height', limit = size[extent];
    const targets = [0, 10, limit / 2, limit - 10, limit, ...others.flatMap(i => [i[axis], i[axis] + i[extent] / 2, i[axis] + i[extent]])];
    let best = threshold + 1e-9, guide;
    for (const anchor of [box[axis], box[axis] + box[extent] / 2, box[axis] + box[extent]]) for (const target of targets) {
      const delta = target - anchor, start = box[axis] + delta;
      if (Math.abs(delta) < best && start >= -1e-8 && start + box[extent] <= limit + 1e-8) { best = Math.abs(delta); offsets[axis] = delta; guide = target; }
    }
    if (guide !== undefined) guides.push({axis, value: guide});
  }
  return {items: moveSelection(moved, offsets.x, offsets.y, size), guides};
}
