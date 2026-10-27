// Install before loading modules so dropped files never navigate this page.
window.addEventListener('dragover', event => event.preventDefault());
window.addEventListener('drop', event => event.preventDefault());
let productShell;
import('./product-tools.mjs?v=20261027-replace2').then(module=>{
  productShell=module.installProductShell();
  return import('./workspace.mjs?v=20261027-replace2');
}).catch(() => {
  productShell?.unavailable();
  const status = document.getElementById('status');
  status.hidden = false; status.classList.add('error');
  status.textContent = '轉換程式未能載入，請重新整理頁面，或使用新版 Chrome／Edge 開啟此網址。';
});
