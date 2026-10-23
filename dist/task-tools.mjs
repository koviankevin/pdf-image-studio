const tasks = {
  all: ['全部工具', '保留所有設定與工具；也可以選一種任務，讓畫面只顯示相關操作。'],
  capture: ['截圖複製', '加入文件 → 點頁面框選 → 複製圖片。解析度與長邊上限沿用左側圖片設定。'],
  organize: ['合併整理', '加入多份文件 → 勾選、拖曳調整頁序 → 預覽並下載新 PDF。'],
  layout: ['排成 A4', '勾選需要的頁面 → 選固定拼版或自由排版 → 預覽並下載 A4 PDF。'],
  text: ['辨識文字', '勾選需要的頁面 → 執行 OCR → 對照原稿校對，再複製文字或下載 PDF。'],
};
export function installTasks(api) {
  const {$} = api, key = 'shijian.task.v1'; let task = 'all';
  document.querySelector('.workspace').insertAdjacentHTML('beforebegin', `<section class="task-panel" aria-labelledby="task-title"><div class="task-heading"><h2 id="task-title">今天想整理什麼？</h2><span>隨時切換，文件與設定都會保留</span></div><div id="task-options" class="task-options" role="group" aria-label="選擇工作任務"></div><p id="task-hint" class="field-hint" aria-live="polite"></p><button id="task-start" class="secondary" hidden></button></section>`);
  // Mark existing controls, including tools installed by other modules. Do not
  // duplicate buttons or change values: every path uses the original handlers.
  const groups = [
    ['#pdf-output', 'organize layout text'], ['#a4-output', 'layout'],
    ['.split-settings,.batch-label-settings,#compare-open,.page-operation-bar', 'organize'],
    ['.ocr-settings,.document-search', 'text'], ['#image-output', 'capture'],
    ['#quick-pdf', 'organize text'], ['#quick-images', 'capture'], ['#quick-a4', 'layout'],
  ];
  const elements = groups.flatMap(([selector, modes]) => [...document.querySelectorAll(selector)].map(el => {el.dataset.tasks = modes; return el;}));
  for (const [id, [name]] of Object.entries(tasks)) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'secondary'; button.dataset.task = id; button.textContent = name;
    button.onclick = () => apply(id); $('task-options').append(button);
  }
  function refresh() {
    for (const button of $('task-options').children) button.disabled = api.isBusy();
    $('task-start').disabled = api.isBusy() || !api.chosen().length;
  }
  function apply(value) {
    task = Object.hasOwn(tasks, value) ? value : 'all';
    for (const el of elements) el.classList.toggle('task-hidden', task !== 'all' && !el.dataset.tasks.split(' ').includes(task));
    for (const button of $('task-options').children) button.setAttribute('aria-pressed', String(button.dataset.task === task));
    $('task-hint').textContent = tasks[task][1];
    $('task-start').hidden = task === 'all';
    $('task-start').textContent = {capture:'框選第一個勾選頁', organize:'預覽合併結果', layout:'開啟 A4 自由排版', text:'辨識勾選頁的文字'}[task] || '';
    if (task === 'text') document.querySelector('.ocr-settings').open = true;
    try {localStorage.setItem(key, task);} catch { /* UI preference is optional. */ }
    refresh();
  }
  $('task-start').onclick = () => {
    if (api.isBusy() || !api.chosen().length) return;
    if (task === 'capture') api.openCrop(api.chosen()[0]);
    else $(task === 'organize' ? 'preview-pdf' : task === 'layout' ? 'free-layout' : 'ocr-start').click();
  };
  try {const saved = localStorage.getItem(key); if (Object.hasOwn(tasks, saved)) task = saved;} catch { /* Use all tools when storage is unavailable. */ }
  apply(task); return {refresh, showAll: () => apply('all'), showText: () => {if(task!=='all')apply('text');document.querySelector('.ocr-settings').open=true;}};
}
