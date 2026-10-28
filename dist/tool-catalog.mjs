export const toolGroups={files:'加入與保存',pages:'頁面整理',edit:'文字編輯與辨識',capture:'圖片與截圖',layout:'A4 排版',support:'說明與檢查'};
export const toolCatalog=[
 {id:'import',probe:'#file-input',label:'加入 PDF／圖片',group:'files',description:'多檔加入、圖片轉 PDF；加密 PDF 會提示輸入密碼。',selector:'#dropzone',tests:['multi-pdf.spec.mjs','tool-coverage.spec.mjs','autosave.spec.mjs']},
 {id:'image-import',probe:'#image-page-size',label:'圖片轉 PDF 設定',group:'files',description:'A4 或原尺寸、方向與留白，套用於接著加入的圖片。',selector:'.image-import-settings',tests:['tool-coverage.spec.mjs']},
 {id:'workspaces',probe:'#project-new',keywords:'專案 匯入 還原 備份',label:'工作區與專案備份',group:'files',description:'新增、切換工作區；下載或匯入專案接續編輯。',selector:'#project-panel',tests:['productivity.spec.mjs','productivity-regression.spec.mjs']},
 {id:'autosave',probe:'#autosave-enabled',label:'自動儲存與草稿',group:'files',description:'查看本機儲存狀態、立即儲存及草稿管理。',selector:'.autosave-panel',tests:['autosave.spec.mjs']},
 {id:'templates',probe:'#template-save',label:'我的工作範本',group:'files',description:'保存常用輸出、頁碼與 A4 版型設定。',selector:'#template-panel',tests:['studio.spec.mjs']},
 {id:'page-order',probe:'.drag-handle',label:'選頁、排序與移動',group:'pages',task:'organize',description:'勾選頁碼、拖曳排序或輸入移動位置。',selector:'#editor-controls',requires:'pages',tests:['multi-pdf.spec.mjs']},
 {id:'undo',probe:'#undo',label:'復原／重做',group:'pages',task:'organize',description:'保留整理、文字與排版操作的復原入口及快捷鍵。',selector:'#undo',alternatives:['#redo'],unavailable:'目前沒有可復原或重做的操作',tests:['productivity.spec.mjs','workflow.spec.mjs','tool-hub.spec.mjs']},
 {id:'duplicate',probe:'#duplicate-pages',label:'複製頁面',group:'pages',task:'organize',description:'在原頁後加入副本，保留頁面編輯。',selector:'#duplicate-pages',requires:'selection',tests:['productivity.spec.mjs']},
 {id:'blank',probe:'#insert-blank',label:'插入空白頁',group:'pages',task:'organize',description:'選 A4 方向，再插入空白頁。',selector:'#insert-blank',tests:['productivity.spec.mjs']},
 {id:'replace-page',probe:'#replace-file',label:'替換單頁',group:'pages',task:'organize',description:'以另一份 PDF 的指定頁或圖片取代勾選單頁。',selector:'#replace-page',requires:'single',tests:['productivity.spec.mjs','productivity-regression.spec.mjs']},
 {id:'crop',probe:'#crop-apply',keywords:'批次裁切',label:'旋轉與裁切',group:'pages',task:'organize',description:'調整單頁方向與可見範圍，也能批次套用。',selector:'#crop-dialog',requires:'selection',action:'crop',tests:['studio.spec.mjs','productivity-regression.spec.mjs','replacement.spec.mjs','safety-performance.spec.mjs']},
 {id:'split',probe:'#split-pdf',label:'拆分 PDF',group:'pages',task:'organize',description:'每頁一份，或依自訂範圍拆成多份。',selector:'.split-settings',requires:'pages',tests:['tool-coverage.spec.mjs']},
 {id:'labels',probe:'#batch-apply',keywords:'批次頁碼',label:'頁碼／頁首頁尾',group:'pages',task:'organize',description:'為勾選頁批次加入頁碼與文字。',selector:'.batch-label-settings',requires:'selection',tests:['productivity.spec.mjs']},
 {id:'compare',probe:'#compare-open',label:'比對兩份 PDF',group:'pages',task:'organize',description:'逐頁比對畫面差異，可掃描全部或停止。',selector:'#compare-open',requires:'sourcesPair',action:'click',tests:['studio.spec.mjs','studio-performance.spec.mjs']},
 {id:'native',probe:'#mark-native-use',keywords:'改字 修改文字 Word 原文',label:'原文編輯',group:'edit',task:'edit',description:'修改 Word 類 PDF 的單行原文區塊；字型可能不同。',selector:'#mark-dialog',requires:'selection',action:'native',tests:['native-text.spec.mjs']},
 {id:'replace-text',probe:'#mark-background',label:'掃描文字替換',group:'edit',task:'edit',description:'框住舊字，以底色與新文字覆蓋外觀。',selector:'#mark-dialog',requires:'selection',action:'replace',tests:['replacement.spec.mjs']},
 {id:'annotations',probe:'highlight',label:'文字／螢光筆／箭頭／方框',group:'edit',task:'edit',description:'加註、移動、刪除與復原標記。',selector:'#mark-dialog',requires:'selection',action:'text',tests:['tool-coverage.spec.mjs','autosave.spec.mjs','workflow.spec.mjs']},
 {id:'ocr',probe:'#ocr-start',label:'中文 OCR／擷取文字',group:'edit',task:'text',description:'自動擷取或強制辨識，支援一般、單欄與雙欄。',selector:'.ocr-settings',requires:'selection',tests:['scanned-ocr.spec.mjs','scan-conditions.spec.mjs','two-column-ocr.spec.mjs']},
 {id:'ocr-review',probe:'#ocr-save',label:'檢視／校對辨識文字',group:'edit',task:'text',description:'辨識完成後校對、複製或加入可搜尋 PDF。',selector:'#ocr-review',action:'click',unavailable:'請先完成文字擷取或 OCR',tests:['scanned-ocr.spec.mjs','two-column-ocr.spec.mjs','tool-hub.spec.mjs']},
 {id:'regional-ocr',probe:'#crop-ocr',label:'框選區域 OCR',group:'edit',task:'text',description:'開啟框選，拖曳後選「辨識框選區域的文字」。',selector:'#crop-dialog',requires:'selection',action:'crop',tests:['safety-performance.spec.mjs','ease.spec.mjs']},
 {id:'search',probe:'#document-query',label:'搜尋文件文字',group:'edit',task:'text',description:'搜尋原文、OCR 與新增文字，點結果定位頁面。',selector:'#document-query',requires:'pages',tests:['productivity.spec.mjs','productivity-regression.spec.mjs','native-text.spec.mjs']},
 {id:'capture',probe:'#crop-copy',label:'框選複製／下載',group:'capture',task:'capture',description:'拖曳選取局部，依 DPI 與長邊設定輸出圖片。',selector:'#crop-dialog',requires:'selection',action:'crop',tests:['tool-coverage.spec.mjs','safety-performance.spec.mjs']},
 {id:'images',probe:'#convert',keywords:'DPI PNG JPG JPEG 品質 長邊 輸出方案 解析度',label:'高解析度圖片',group:'capture',task:'capture',description:'PNG／JPG、DPI、長邊上限與常用方案。',selector:'#image-output',requires:'selection',tests:['multi-pdf.spec.mjs','workflow.spec.mjs']},
 {id:'estimate',probe:'#estimate-size',label:'預估圖片大小',group:'capture',task:'capture',description:'依目前圖片設定估算檔案大小。',selector:'#estimate-size',requires:'selection',tests:['tool-coverage.spec.mjs']},
 {id:'image-download',probe:'#download-all',label:'圖片預覽／全部下載',group:'capture',task:'capture',description:'轉換後預覽、複製圖片或下載 ZIP。',selector:'#image-results',requires:'images',tests:['tool-coverage.spec.mjs','multi-pdf.spec.mjs']},
 {id:'impose',probe:'#impose-pdf',keywords:'二合一 四合一 多頁一張',label:'A4 拼版',group:'layout',task:'layout',description:'多頁拼成一張，調整格數、方向、間距與頁序。',selector:'#impose-pdf',requires:'selection',action:'click',tests:['imposition.spec.mjs']},
 {id:'free-layout',probe:'#free-layout',keywords:'多選 對齊 磁吸 多張 標題 框選',label:'A4 自由排版',group:'layout',task:'layout',description:'多張紙、框選片段、標題、多選對齊與磁吸。',selector:'#free-layout',action:'click',tests:['workflow.spec.mjs','ease.spec.mjs','ease-performance.spec.mjs']},
 {id:'pdf-preview',probe:'#preview-pdf',label:'預覽合併 PDF',group:'files',task:'organize',description:'依目前勾選頁序檢查輸出，再下載新 PDF。',selector:'#preview-pdf',requires:'selection',action:'click',tests:['multi-pdf.spec.mjs','workflow.spec.mjs']},
 {id:'pdf-download',probe:'#export-pdf',label:'下載新 PDF',group:'files',task:'organize',description:'合併目前選取頁與已儲存的裁切、文字和 OCR。',selector:'#export-pdf',requires:'selection',tests:['multi-pdf.spec.mjs','native-text.spec.mjs','replacement.spec.mjs']},
 {id:'help',probe:'#product-help',label:'使用說明與範例',group:'support',selector:'#product-help',action:'click',description:'教師、辦公兩種操作路線與合成示範文件。',tests:['product.spec.mjs']},
 {id:'storage',probe:'#product-data',label:'資料管理',group:'support',selector:'#product-data',action:'click',description:'查看本機工作區、儲存空間與備份狀態。',tests:['product.spec.mjs']},
 {id:'diagnostics',probe:'#product-diagnostic-create',label:'版本與問題診斷',group:'support',selector:'#product-support',action:'click',description:'核對網站版本，預覽不含文件內容的診斷。',tests:['product.spec.mjs']},
];
export function toolAvailability(tool,state,target={exists:true,disabled:false}){
 if(!target.exists)return{ready:false,label:'工具尚未就緒'};
 if(state.busy)return{ready:false,label:state.dialog?'請先完成或關閉工具視窗':'正在處理，請稍候'};
 const requirement=tool.requires;
 if(requirement==='sourcesPair'&&state.sources<2)return{ready:false,label:'請先加入兩份文件'};
 if(requirement==='pages'&&!state.pages)return{ready:false,label:'請先加入文件'};
 if((requirement==='selection'||requirement==='single')&&!state.pages)return{ready:false,label:'請先加入文件'};
 if(requirement==='single'&&state.selected!==1)return{ready:false,label:'請只勾選一頁'};
 if(requirement==='selection'&&!state.selected)return{ready:false,label:'請先勾選頁面'};
 if(requirement==='images'&&!state.images)return{ready:false,label:'請先轉換圖片'};
 if(target.disabled)return{ready:false,label:tool.unavailable||'目前條件尚未齊備'};
 return{ready:true,label:'可開啟'};
}
