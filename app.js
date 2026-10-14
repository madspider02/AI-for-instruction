/* AI 教材教具設計工作室 - 學生端（GitHub Pages，無需後端套件） */
(() => {
  'use strict';
  const CONFIG = window.APP_CONFIG || {};
  const STORE_KEY = 'se-aid-studio-v1';
  const ACCESS_KEY = 'se-aid-session-code';
  const PHOTO_SLOTS = ['exterior', 'exploded', 'operation', 'steps', 'prototype'];
  const SLOT_LABELS = {exterior:'完整外觀圖', exploded:'結構分解圖', operation:'學生操作圖', steps:'製作步驟圖', prototype:'實作照片'};
  const SLOT_URL_IDS = {exterior:'imageUrlExterior',exploded:'imageUrlExploded',operation:'imageUrlOperation',steps:'imageUrlSteps',prototype:'imageUrlPrototype'};
  const STEP_NAMES = ['','需求分析','AI 創意發想','四張設計圖','製作與教學','試作與修正','思辨與反思'];
  const THOUGHTS = {
    1:['需求不等於診斷','請寫下具體、可觀察的學生能力、學習情境與需要的支持。不要只用障礙類別推測學生能力。'],
    2:['別讓 AI 替你選答案','三種構想真正差在哪裡？哪一個部分是你依據學生能力與教學需求作的判斷？'],
    3:['畫得出來，不等於做得出來','請核對四張圖的尺寸、材料、固定方式與操作過程，並留下你發現的矛盾。'],
    4:['可製作、可使用、可評量','漂亮的教具不是終點。想想學生是否能參與、是否會受傷、如何逐漸撤除提示。'],
    5:['拿證據挑戰設計','把「實際觀察」與「合理推測」區分開來。記錄發現的問題，說明你為何修改。'],
    6:['保留你的專業判斷','哪些 AI 建議你接受、拒絕或修改？如果換一位學生，你會如何重新調整？']
  };
  const REQUIRED = [
    [1,'courseClass','班級／組別'],[1,'studentCode','學號／作品代碼'],[1,'studentName','填寫者姓名'],[1,'targetStage','教育階段'],
    [1,'learnerProfile','學生特徵'],[1,'strengths','學生優勢'],[1,'needs','需要的支持'],[1,'topic','教學主題'],[1,'goal','學習目標'],
    [2,'aiPlatform','使用的 AI 工具'],[2,'aiIdeaText','AI 的三種構想'],[2,'ideaCompare','三種方案比較'],[2,'chosenConcept','選定的教具方案'],
    [2,'chooseWhy','選擇理由'],[2,'aiDoubts','AI 建議的疑慮'],[2,'note2','第二階段思考紀錄'],
    [3,'designSpecification','設計規格'],[3,'visualReview','圖像檢核與修正'],[3,'note3','第三階段思考紀錄'],
    [4,'materials','材料清單'],[4,'budget','總預算'],[4,'dimensions','尺寸與結構'],[4,'buildSteps','製作步驟'],
    [4,'constructionSafety','安全檢核'],[4,'teachingPlan','教學與支持'],[4,'assessmentPlan','觀察評量'],
    [5,'tryoutType','試作方式'],[5,'trialMethod','測試流程'],[5,'trialFindings','測試觀察'],[5,'modifications','實作修正'],[5,'note5','第五階段思考紀錄'],
    [6,'aiAccepted','採用的 AI 建議'],[6,'aiRejected','拒絕或修正 AI 的理由'],[6,'generalization','類化運用'],
    [6,'learningReflection','最終學習反思'],[6,'note6','第六階段思考紀錄']
  ];
  const FIELD_IDS = Array.from(document.querySelectorAll('[data-field]')).map(el => el.id);
  const $ = (id) => document.getElementById(id);
  const query = (selector) => document.querySelector(selector);
  const encoded = (v) => encodeURIComponent(v);
  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  const newId = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : (Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)+'-'+Math.random().toString(36).slice(2)));
  const safeString = (v) => String(v ?? '').trim();
  let currentStep = 1;
  let state = {workId: newId(), fields:{}, images:{}, currentStep:1,updatedAt:'',lastConfirmed:null};
  let toastTimer, storeTimer, busy = false;

  function hasEndpoint() {
    return typeof CONFIG.scriptUrl === 'string' && /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec(?:\?.*)?$/.test(CONFIG.scriptUrl.trim());
  }
  function showToast(message, error = false) {
    const el = $('toast');
    el.textContent = message;
    el.classList.toggle('error', Boolean(error));
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3800);
  }
  function initialLoad() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && parsed.fields && parsed.images) {
          state = {
            workId: /^[a-z\d-]{10,}$/i.test(parsed.workId || '') ? parsed.workId : newId(),
            fields: parsed.fields, images: parsed.images,
            currentStep: Number(parsed.currentStep) || 1,
            updatedAt: parsed.updatedAt || '',lastConfirmed:parsed.lastConfirmed || null
          };
        }
      }
      $('classCode').value = sessionStorage.getItem(ACCESS_KEY) || '';
    } catch (e) { console.warn('無法讀取本機草稿', e); }
    FIELD_IDS.forEach(id => { const el = $(id); if (el) el.value = typeof state.fields[id] === 'string' ? state.fields[id] : ''; });
    PHOTO_SLOTS.forEach(renderImage);
    setStep(Math.min(6,Math.max(1,state.currentStep)),false);
    if (state.updatedAt) $('localSaveLabel').textContent = '本機草稿已保留';
    if (state.lastConfirmed?.at) {
      const stamp = new Date(state.lastConfirmed.at);
      if (!Number.isNaN(stamp.getTime())) setFeedback(`上次 Google Sheets 已確認${state.lastConfirmed.mode || '存檔'}：${stamp.toLocaleString('zh-TW')}。後續修改需再次同步。`);
    }
    const pill = $('connectionPill');
    pill.textContent = hasEndpoint() ? '已設定後台網址' : '尚未串接後台';
    pill.className = hasEndpoint() ? 'pill pill-ok' : 'pill pill-muted';
    $('syncSupportText').textContent = hasEndpoint()
      ? '同步完成後，畫面會等待 Google Sheets 的回收確認；單靠「送出請求」不算成功。'
      : '目前是展示／離線模式：可填寫、複製 Prompt、上傳本機圖片與匯出備份；老師須先設定 Apps Script 網址才能雲端同步。';
  }
  function snapshot() {
    FIELD_IDS.forEach(id => { const el = $(id); state.fields[id] = el ? safeString(el.value) : ''; });
    state.currentStep = currentStep;
    state.updatedAt = new Date().toISOString();
    return state;
  }
  function persist() {
    snapshot();
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
      $('localSaveLabel').textContent = '本機草稿已保留';
    } catch (e) {
      try {
        const textOnly = {...state, images:{}};
        localStorage.setItem(STORE_KEY, JSON.stringify(textOnly));
        $('localSaveLabel').textContent = '文字已暫存；圖片請儘速同步';
      } catch (_) { $('localSaveLabel').textContent = '暫存空間不足，請匯出備份'; }
    }
    refreshProgress();
  }
  function debouncePersist() { clearTimeout(storeTimer); storeTimer = setTimeout(persist,500); }
  function setStep(n, shouldScroll = true) {
    currentStep = n;
    document.querySelectorAll('.step-panel').forEach(panel => { panel.hidden = Number(panel.dataset.step) !== n; });
    document.querySelectorAll('[data-nav]').forEach(btn => {
      const number = Number(btn.dataset.nav);
      btn.classList.toggle('active', number === n);
      btn.setAttribute('aria-current', number === n ? 'step' : 'false');
    });
    $('stepHeading').textContent = `第 ${n} 階段｜${STEP_NAMES[n]}`;
    $('thinkingTitle').textContent = THOUGHTS[n][0];
    $('thinkingText').textContent = THOUGHTS[n][1];
    $('prevBtn').disabled = n === 1;
    $('nextBtn').hidden = n === 6;
    refreshProgress();
    debouncePersist();
    if (shouldScroll) query('.dashboard').scrollIntoView({behavior:'smooth',block:'start'});
  }
  function imageProvided(slot) {
    const image = state.images[slot] || {};
    return Boolean(image.dataUrl || image.uploaded || safeString($(SLOT_URL_IDS[slot])?.value));
  }
  function progressInfo() {
    const total = REQUIRED.length + 4;
    let count = REQUIRED.filter(([,id]) => safeString($(id)?.value).length > 0).length;
    count += PHOTO_SLOTS.slice(0,4).filter(imageProvided).length;
    return {count,total,percent:Math.round(count * 100 / total)};
  }
  function refreshProgress() {
    const {percent} = progressInfo();
    $('progressText').textContent = `${percent}%`;
    $('progressFill').style.width = `${percent}%`;
    $('progressTrack').setAttribute('aria-valuenow',String(percent));
    for (let n = 1; n <= 6; n++) {
      const reqs = REQUIRED.filter(row => row[0] === n);
      const textDone = reqs.every(([,id]) => safeString($(id)?.value));
      const imageDone = n !== 3 || PHOTO_SLOTS.slice(0,4).every(imageProvided);
      query(`[data-nav="${n}"]`).classList.toggle('done',Boolean(textDone && imageDone));
    }
  }
  function renderImage(slot) {
    const target = $(`preview-${slot}`);
    if (!target) return;
    target.replaceChildren();
    const entry = state.images[slot] || {};
    if (typeof entry.dataUrl === 'string' && /^data:image\/(?:jpeg|png|webp);base64,/.test(entry.dataUrl)) {
      const img = document.createElement('img');
      img.alt = `${SLOT_LABELS[slot]}預覽`;
      img.src = entry.dataUrl;
      target.append(img);
    } else if (entry.uploaded) {
      const box = document.createElement('div');
      box.className = 'saved-image';
      const bold = document.createElement('strong');
      bold.textContent = '✓ 已收錄於老師後台';
      const small = document.createElement('small');
      small.textContent = entry.fileName || SLOT_LABELS[slot];
      box.append(bold,small); target.append(box);
    } else {
      const p = document.createElement('span');
      p.textContent = safeString($(SLOT_URL_IDS[slot])?.value) ? '已填圖片連結（請確認老師可開啟）' : '尚未上傳圖片';
      target.append(p);
    }
  }
  async function resizeImage(file) {
    if (!['image/jpeg','image/png','image/webp'].includes(file.type)) throw Error('請上傳 PNG、JPG 或 WebP 圖檔。');
    if (file.size > 25 * 1024 * 1024) throw Error('原始圖檔超過 25 MB，請先縮小圖片。');
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      await new Promise((resolve,reject) => { img.onload = resolve; img.onerror = reject; img.src = url; });
      if (img.width * img.height > 80000000) throw Error('圖片像素過高，請先縮圖。');
      let scale = Math.min(1,1500/Math.max(img.width,img.height));
      let output = '';
      for (let pass = 0; pass < 7; pass++) {
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1,Math.round(img.width * scale));
        canvas.height = Math.max(1,Math.round(img.height * scale));
        const context = canvas.getContext('2d');
        context.fillStyle = '#fff'; context.fillRect(0,0,canvas.width,canvas.height);
        context.drawImage(img,0,0,canvas.width,canvas.height);
        output = canvas.toDataURL('image/jpeg',0.78 - Math.min(pass,3)*0.065);
        if ((output.length - output.indexOf(',') - 1) * 0.75 < 350 * 1024) break;
        scale *= .84;
      }
      if ((output.length - output.indexOf(',') - 1) * 0.75 >= 420 * 1024) throw Error('圖片壓縮後仍過大，請改用較小的圖檔。');
      return output;
    } finally { URL.revokeObjectURL(url); }
  }
  async function handleImageChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const slot = event.target.dataset.image;
    try {
      const dataUrl = await resizeImage(file);
      state.images[slot] = {dataUrl,uploaded:false,fileName:file.name.slice(0,90)};
      renderImage(slot);
      persist();
      showToast(`${SLOT_LABELS[slot]}已加入草稿；同步時會傳到老師後台。`);
    } catch (error) { showToast(error.message || '圖片處理失敗',true); }
  }
  function contextualBase() {
    const v = (key) => safeString($(key)?.value) || '〔請依實際情況補充〕';
    return [
      `教育階段：${v('targetStage')}`,
      `學生學習特徵（去識別化）：${v('learnerProfile')}`,
      `學生已具備能力：${v('strengths')}`,
      `需要的支持：${v('needs')}`,
      `教學主題：${v('topic')}`,
      `具體目標：${v('goal')}`,
      `教學情境：${v('setting')}`,
      `安全與參與注意：${v('safetyFocus')}`
    ].join('\n');
  }
  function chosenBase() {
    const v = key => safeString($(key)?.value) || '〔尚未填寫，請先在網站補齊〕';
    return `教具名稱：${v('chosenConcept')}\n設計規格：${v('designSpecification')}\n學習目標：${v('goal')}\n學生需要的支持：${v('needs')}\n預期使用環境：${v('setting')}\n安全要點：${v('safetyFocus')}`;
  }
  const imageMessages = {
    exterior:'一張完整外觀圖。請使用 45 度立體視角，完整呈現實體教具、材料質感、主體尺寸比例、重要操作區及底座。',
    exploded:'一張結構分解圖。請把主要板件、支架、固定零件、連接位置分開呈現，標註零件名稱與約略尺寸；不要創造無法買到的特殊接頭。',
    operation:'一張教學操作示意圖。請在去識別化或虛構的特教教學情境中，呈現學生如何在適當姿勢支持下完成操作、教師提供哪種提示，以及操作前中後的三至四個動作。',
    steps:'一張四到六格的製作步驟圖。清楚示意量測、裁切（由成人操作）、組裝、固定、安全測試等步驟，零件與前述分解圖保持一致。'
  };
  function getPrompt(type) {
    const intro = '你是熟悉中重度障礙學生、功能性課程、合理調整、無障礙操作與低成本實體教材設計的特殊教育教具顧問。請以繁體中文（臺灣用語）回覆。不要根據障礙類別自行推定學生能力，也不要把 AI 圖像當成已驗證的工程圖。';
    if (type === 'ideas') return `${intro}\n\n我正在做師資培育課程作業，請根據下列資訊提出三種「操作機制真正不同」的實體教材教具，不要只是改顏色或換裝飾：\n\n${contextualBase()}\n\n要求：\n1. 三種構想都要有名稱、學生如何操作、可觀察的教學目標、主要材料、預估成本、需要的支持與可能風險。\n2. 優先使用文具店、五金行或生活用品店常見材料，原則上每種材料費控制在新臺幣 500 元內。\n3. 不要只設計圖卡或學習單，應讓學生有實際參與和操作機會，且不因年齡不符而幼兒化。\n4. 以表格比較三個方案的適切性、操作難度、安全性、耐用性及可製作性。\n5. 請提出值得由學生自行判斷的兩個問題；不要直接替我選出最終作品。\n6. 如果資訊不足，明確標示假設，不要編造學生能力。`;
    if (imageMessages[type]) return `${intro}\n\n請協助我生成「${SLOT_LABELS[type]}」，如果你可以產生圖片，請直接生成一張橫式、清楚、可供手作教具設計參考的圖片；如果不支援圖像生成，請改寫為詳盡的圖像提示詞。\n\n以下是同一項教具，請務必保持每張圖的尺寸、結構、材料與零件一致：\n${chosenBase()}\n\n本張圖的要求：${imageMessages[type]}\n\n固定限制：適合個別化調整的中重度障礙學生教學情境；材料常見、無銳角、尺寸合理、無需超過新臺幣 500 元的特殊裝置；避免只有外觀漂亮卻不可製作。簡潔繁體中文標示，橫式構圖。\n\n請在圖片之後，列出這張圖有哪些需要使用者再次實地驗證的尺寸、結構或安全風險。`;
    if (type === 'build') return `${intro}\n\n請將以下教具構想改寫為可以由師資生實作的製作方案：\n${chosenBase()}\n\n請依序提供：\n（一）材料清單：名稱、數量、規格、每項預估費用與價格不確定性，目標不超過新臺幣 500 元。\n（二）具體尺寸與結構設計，說明連接及固定方式。\n（三）可依序執行的 4 到 8 個製作步驟，標示需要成人使用工具的工序。\n（四）安全性、穩定性、清潔與維修檢核。\n（五）教學示範：高、中、低支持下，學生如何操作。\n（六）如何從身體協助逐漸轉向示範、手勢、口語、環境提示或自主操作（依學生需要，不強迫撤除必要支持）。\n（七）可量化的學習紀錄方式。\n\n請特別指出你不確定的材料價格、承重、尺寸與人體工學問題，提醒我自己實測；不要將推測寫成已測試事實。`;
    if (type === 'review') return `${intro}\n\n現在不要讚美我的教具，請用具體、可被驗證的問題協助我找出設計盲點，保留由我自己判斷的空間。\n\n作品與學習情境：\n${chosenBase()}\n製作步驟：${safeString($('buildSteps').value)||'〔尚未填寫〕'}\n安全設計：${safeString($('constructionSafety').value)||'〔尚未填寫〕'}\n試作發現：${safeString($('trialFindings').value)||'〔尚未填寫〕'}\n\n請列出：\n1. 最有可能失敗的五個地方，各提出容易實測的檢查方法。\n2. 對不同動作、感官或溝通支持需求，教具可能排除誰參與？\n3. AI 圖像與可買到的材料、尺寸及組裝方式可能有哪些矛盾？\n4. 這項教具能否真正促進原訂學習目標，如何避免只測到投中率？\n5. 三個我應優先驗證的修改方向。\n\n請不要代寫我的個人反思，也不要聲稱已驗證真實教學效果。`;
    return '';
  }
  function openPrompt(type) {
    $('promptDialogTitle').textContent = ({ideas:'三種不同教具構想',exterior:'圖 1｜完整外觀圖',exploded:'圖 2｜結構分解圖',operation:'圖 3｜學生操作圖',steps:'圖 4｜製作步驟圖',build:'材料與製作可行性',review:'挑戰與檢核教具'})[type] || 'AI Prompt';
    $('promptText').value = getPrompt(type);
    $('promptDialog').showModal();
  }
  async function copyPrompt() {
    const text = $('promptText').value;
    try { await navigator.clipboard.writeText(text); showToast('已複製 Prompt，可貼到任何生成式 AI。'); }
    catch (_) { $('promptText').focus(); $('promptText').select(); showToast('請按 Ctrl+C 或 ⌘C 複製已選取的文字。'); }
  }
  function exportBackup() {
    const data = snapshot();
    const blob = new Blob([JSON.stringify({...data,exportedAt:new Date().toISOString()},null,2)],{type:'application/json;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const code = safeString($('studentCode').value).replace(/[^A-Za-z0-9_-]/g,'').slice(0,25) || 'draft';
    a.download = `教具設計備份_${code}_${new Date().toISOString().slice(0,10)}.json`;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url),1500);
    showToast('已匯出草稿備份檔。');
  }
  async function importBackup(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const imported = JSON.parse(await file.text());
      if (!imported || !imported.fields || !imported.images || typeof imported.fields !== 'object') throw Error('這不是本站的有效備份格式。');
      state = {workId: /^[a-z\d-]{10,}$/i.test(imported.workId || '') ? imported.workId : newId(),fields:{},images:{},currentStep:1,updatedAt:'',lastConfirmed:null};
      FIELD_IDS.forEach(id => { state.fields[id] = String(imported.fields[id] ?? '').slice(0,15000); $(id).value = state.fields[id]; });
      PHOTO_SLOTS.forEach(slot => {
        const source = imported.images[slot] || {};
        state.images[slot] = {fileName:String(source.fileName || '').slice(0,90), uploaded:Boolean(source.uploaded),dataUrl:(typeof source.dataUrl === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(source.dataUrl))?source.dataUrl:''};
        renderImage(slot);
      });
      setStep(Math.max(1,Math.min(6,Number(imported.currentStep) || 1)),false);
      persist(); showToast('已匯入備份，請確認內容與圖片。');
    } catch (error) { showToast(error.message || '匯入失敗',true); }
    finally { event.target.value = ''; }
  }
  function requiredForFinal() {
    for (const [step,id,label] of REQUIRED) if (!safeString($(id)?.value)) return {step,label};
    for (const slot of PHOTO_SLOTS.slice(0,4)) if (!imageProvided(slot)) return {step:3,label:SLOT_LABELS[slot]};
    const budget = Number($('budget').value);
    if (!Number.isFinite(budget) || budget < 0) return {step:4,label:'有效的預估總預算'};
    return null;
  }
  function getUploads() {
    const items = {};
    PHOTO_SLOTS.forEach(slot => {
      const img = state.images[slot];
      if (img && img.dataUrl && !img.uploaded) {
        items[slot] = {dataUrl:img.dataUrl, fileName:img.fileName || `${slot}.jpg`};
      }
    });
    return items;
  }
  // ContentService 在瀏覽器跨來源 POST 後往往無法讀取回應，所以改用唯讀 JSONP 票據確認。
  // JSONP 只回傳是否確實落表及一般錯誤碼，不提供學生資料。
  function getReceipt(requestId) {
    return new Promise((resolve,reject) => {
      const cbName = `__seAidCb_${Date.now()}_${Math.floor(Math.random()*100000)}`;
      const script = document.createElement('script');
      let finished = false;
      const cleanup = () => { delete window[cbName]; script.remove(); clearTimeout(timer); };
      window[cbName] = (data) => { if (finished) return; finished=true; cleanup(); resolve(data); };
      const timer = setTimeout(() => { if (finished) return; finished=true; cleanup(); reject(Error('票據查詢逾時')); },8000);
      script.onerror = () => { if (finished) return; finished=true; cleanup(); reject(Error('票據查詢失敗')); };
      const base = CONFIG.scriptUrl.trim();
      script.src = `${base}${base.includes('?')?'&':'?'}action=receipt&requestId=${encoded(requestId)}&callback=${encoded(cbName)}&_=${Date.now()}`;
      document.head.append(script);
    });
  }
  function setFeedback(text,isError=false) {
    $('syncFeedback').textContent = text;
    $('syncFeedback').style.color = isError ? '#a13d39' : '#2f686b';
  }
  async function submitWork(isFinal) {
    if (busy) return;
    persist();
    if (!hasEndpoint()) { showToast('尚未設定 Google Apps Script 後台，請先匯出備份或請老師設定。',true);return; }
    const code = safeString($('classCode').value);
    if (!code) { $('classCode').focus(); showToast('請先輸入老師提供的課程提交碼。',true);return; }
    for (const [id,label] of [['courseClass','班級／組別'],['studentCode','學號／作品代碼'],['studentName','填寫者姓名']]) {
      if (!safeString($(id).value)) { setStep(1); $(id).focus({preventScroll:true}); showToast(`請先填寫${label}。`,true);return; }
    }
    if (isFinal) {
      const missing = requiredForFinal();
      if (missing) { setStep(missing.step); const input = $(REQUIRED.find(([,id,label]) => label === missing.label)?.[1]); input?.focus({preventScroll:true}); showToast(`正式繳交前，請補上：${missing.label}`,true);return; }
    }
    const requestId = `r_${newId()}`;
    const uploads = getUploads();
    const payload = {
      version:1, requestId, workId:state.workId, classCode:code,
      stage:currentStep, progress:progressInfo().percent,
      submissionType:isFinal?'final':'draft',
      fields:{...state.fields}, uploads,
      studentTimestamp:new Date().toISOString()
    };
    sessionStorage.setItem(ACCESS_KEY,code);
    busy = true;
    for (const id of ['syncBtn','finalSubmitBtn']) $(id).disabled=true;
    setFeedback('正向後台查詢回收狀態；只有 Google Sheets 確認後才會標示成功。');
    let found = false;
    try {
      // text/plain 與 no-cors 避免跨來源預檢；不將 opaque response 視為成功。
      await fetch(CONFIG.scriptUrl.trim(),{
        method:'POST',mode:'no-cors',headers:{'Content-Type':'text/plain;charset=UTF-8'},
        body:JSON.stringify(payload),redirect:'follow',cache:'no-store'
      });
      for (const wait of [900,1300,1800,2500,3700]) {
        await delay(wait);
        let receipt;
        try { receipt = await getReceipt(requestId); } catch (_) { continue; }
        if (receipt?.found) {
          found = true;
          if (receipt.ok) {
            for (const slot of (receipt.uploadedSlots || [])) {
              if (state.images[slot]) { state.images[slot].dataUrl=''; state.images[slot].uploaded=true; renderImage(slot); }
            }
            state.lastConfirmed={at:new Date().toISOString(),mode:isFinal?'正式繳交':'階段存檔',stage:currentStep,requestId};
            persist();
            setFeedback(`✓ Google Sheets 已確認${isFinal?'正式繳交':'階段存檔'}。確認編號：${requestId.slice(0,20)}…`);
            showToast(isFinal?'已完成正式繳交，老師後台已確認收件。':'已存入老師後台，學習歷程同步完成。');
          } else {
            const messages = {invalid_code:'課程提交碼不正確。',invalid_id:'作品編號格式有誤。',too_large:'資料過大，請縮小圖片再傳。',bad_request:'資料格式有誤，請匯出備份後請老師檢查。',config_error:'老師的 Apps Script 尚未完成設定。',server_error:'Google 後台發生錯誤，請老師檢查 Apps Script 執行紀錄。'};
            const why = messages[receipt.code] || '後台未接受本次紀錄。';
            setFeedback(`✕ ${why}`,true); showToast(why,true);
          }
          break;
        }
      }
      if (!found) {
        setFeedback(`未能確認這筆資料是否寫入 Google Sheets。請保留草稿、請老師查詢，確認後再重試；本次編號 ${requestId}`,true);
        showToast('尚未取得後台收件確認，草稿仍保留於此裝置。',true);
      }
    } catch (error) {
      setFeedback(`網路傳送異常：${error.message || '請確認連線'}。請保留本機備份。`,true);
      showToast('無法完成傳送；本機草稿仍在。',true);
    } finally { busy=false;$('syncBtn').disabled=false;$('finalSubmitBtn').disabled=false; }
  }
  function wire() {
    FIELD_IDS.forEach(id => { const el=$(id);el.addEventListener('input',() => { debouncePersist();refreshProgress();if(SLOT_LABELS[Object.keys(SLOT_URL_IDS).find(key => SLOT_URL_IDS[key]===id)]) renderImage(Object.keys(SLOT_URL_IDS).find(key => SLOT_URL_IDS[key]===id)); });el.addEventListener('change',debouncePersist); });
    document.querySelectorAll('[data-image]').forEach(el => el.addEventListener('change',handleImageChange));
    document.querySelectorAll('[data-nav]').forEach(el => el.addEventListener('click',() => setStep(Number(el.dataset.nav))));
    document.querySelectorAll('[data-prompt]').forEach(el => el.addEventListener('click',() => openPrompt(el.dataset.prompt)));
    $('prevBtn').addEventListener('click',()=>setStep(Math.max(1,currentStep-1)));
    $('nextBtn').addEventListener('click',()=>setStep(Math.min(6,currentStep+1)));
    $('copyPrompt').addEventListener('click',copyPrompt);
    $('closePrompt').addEventListener('click',()=>$('promptDialog').close());
    $('closePromptBottom').addEventListener('click',()=>$('promptDialog').close());
    $('exportBtn').addEventListener('click',exportBackup);
    $('importBtn').addEventListener('click',()=>$('importFile').click());
    $('importFile').addEventListener('change',importBackup);
    $('clearBtn').addEventListener('click',()=>$('clearDialog').showModal());
    $('cancelClear').addEventListener('click',()=>$('clearDialog').close());
    $('confirmClear').addEventListener('click',() => { localStorage.removeItem(STORE_KEY);sessionStorage.removeItem(ACCESS_KEY);state={workId:newId(),fields:{},images:{},currentStep:1,updatedAt:'',lastConfirmed:null};FIELD_IDS.forEach(id=>$(id).value='');PHOTO_SLOTS.forEach(renderImage);$('classCode').value='';$('clearDialog').close();setStep(1,false);persist();showToast('此裝置上的草稿已清除。'); });
    $('syncBtn').addEventListener('click',()=>submitWork(false));
    $('finalSubmitBtn').addEventListener('click',()=>submitWork(true));
    $('classCode').addEventListener('input',() => sessionStorage.setItem(ACCESS_KEY,$('classCode').value));
    $('studioForm').addEventListener('submit',event=>event.preventDefault());
    window.addEventListener('beforeunload',persist);
  }
  wire(); initialLoad();
})();
