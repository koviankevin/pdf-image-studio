// Install before loading modules so dropped files never navigate this page.
window.addEventListener('dragover', event => event.preventDefault());
window.addEventListener('drop', event => event.preventDefault());
import('./workspace.mjs?v=20261023-studio1').catch(() => {
  const status = document.getElementById('status');
  status.hidden = false; status.classList.add('error');
  status.textContent = '轉換程式未能載入，請重新整理頁面，或使用新版 Chrome／Edge 開啟此網址。';
});
