// ລະບົບບໍລິຫານ ຮ້ານຂາຍຜັກສົດ (Fresh Vegetable POS)
const STORAGE_KEY = 'phaksod_fresh_pos_v2';

const DEFAULT_PRODUCTS = [];
const DEFAULT_MACHINES = [];
const DEFAULT_BILLS = [];
const DEFAULT_EXPENSES = [];
const DEFAULT_PURCHASE_PLAN = [];

const DEFAULT_RECEIPT_SETTINGS = {
  shopPhone: '',
  qrImageData: '',
  showQrAlways: false,
  thankYouText: 'ຂອບໃຈລູກຄ້າທຸກທ່ານທີ່ມາອຸດໜູນ ຜັກສົດສະອາດ ຄຸນນະພາບດີ 🙏\nຮ້ານຂາຍຜັກສົດ'
};

const DEFAULT_CATEGORIES = [
  { id: 'veggie', name: 'ຜັກສົດ', icon: '🥬' },
  { id: 'fruit', name: 'ໝາກໄມ້', icon: '🍎' },
  { id: 'meat', name: 'ຊີ້ນໝູ-ໄກ່-ງົວ', icon: '🥩' },
  { id: 'fish', name: 'ປາ & ທະເລ', icon: '🐟' },
  { id: 'egg', name: 'ໄຂ່ & ເຕົ້າຫູ້', icon: '🥚' },
  { id: 'dry', name: 'ອາຫານແຫ້ງ', icon: '🌾' },
  { id: 'seasoning', name: 'ເຄື່ອງປຸງ-ເຂົ້າສານ-ລູກຊີ້ນ', icon: '🧂' },
  { id: 'general', name: 'ສິນຄ້າທົ່ວໄປ', icon: '📦' }
];

let state = {
  products: [],
  categories: [],
  machines: [],
  bills: [],
  expenses: [],
  purchasePlan: [],
  heldBills: [],
  receiptSettings: { ...DEFAULT_RECEIPT_SETTINGS },
  checklist: {}
};

let cart = [];
let selectedCategory = 'veggie';
let posViewMode = 'grid';
let selectedPaymentMethod = 'cash';
let currentReceiptBill = null;
let quickUploadTargetProductId = null;
let editingMachineId = null;

// Format LAK Currency
function formatLAK(amount) {
  return Number(amount || 0).toLocaleString('en-US') + ' ກີບ';
}

function getCategoryLabel(catId) {
  const cats = (state.categories && state.categories.length > 0) ? state.categories : DEFAULT_CATEGORIES;
  const found = cats.find(c => c.id === catId);
  if (found) {
    return `${found.icon ? found.icon + ' ' : ''}${found.name}`;
  }
  return catId;
}

function formatProductStock(p) {
  if (!p) return '0';
  const val = Number(p.stock || 0);
  if (!p.hasSubUnit || !p.subUnit || Number(p.subRatio) <= 1) {
    return `${val} ${p.unit}`;
  }
  const ratio = Number(p.subRatio);
  const mainQty = Math.floor(val);
  const remainder = Math.max(0, val - mainQty);
  const subQty = Math.round(remainder * ratio);

  if (mainQty > 0 && subQty > 0) {
    return `${mainQty} ${p.unit} ${subQty} ${p.subUnit}`;
  }
  if (mainQty > 0 && subQty === 0) {
    return `${mainQty} ${p.unit}`;
  }
  if (mainQty === 0 && subQty > 0) {
    return `${subQty} ${p.subUnit}`;
  }
  return `0 ${p.unit}`;
}

function getPaymentLabel(method) {
  const map = {
    cash: '💵 ເງິນສົດ',
    bcel: '<img src="bcel-logo.png" alt="BCEL One" style="width:16px;height:16px;object-fit:contain;vertical-align:middle;margin-right:4px;" />BCEL One QR',
    credit: '📝 ຕິດໜີ້'
  };
  return map[method] || method;
}

// ==========================================================================
// MASTER DATA & APP UPDATE PROTECTION HELPERS
// ==========================================================================
const APP_CODE_VERSION = '2026.11.15.v10';
const APP_VERSION_KEY = 'donluang_app_code_version';
const MEDIA_CACHE_KEY = 'donluang_media_cache_v1';
const LEGACY_STORAGE_KEYS = ['donluang_photo_pos_v1', 'donluang_pos_v1', 'donluang_state', 'donluang_photo_pos'];

let initialCloudSyncCompleted = false;
let pendingCloudPushAfterInit = false;
let isAppJustUpdated = false;

// ກວດສອບວ່າຂໍ້ມູນໃນເຄື່ອງເປັນພຽງຂໍ້ມູນຕົວຢ່າງເລີ່ມຕົ້ນ (Default Demo Template) ຫຼືບໍ່
function isUneditedDefaultData(st) {
  if (!st) return true;
  if (st._isDefaultState === true) return true;
  const bills = Array.isArray(st.bills) ? st.bills : [];
  const expenses = Array.isArray(st.expenses) ? st.expenses : [];
  const purchasePlan = Array.isArray(st.purchasePlan) ? st.purchasePlan : [];
  const heldBills = Array.isArray(st.heldBills) ? st.heldBills : [];
  const prods = Array.isArray(st.products) ? st.products : [];
  const machs = Array.isArray(st.machines) ? st.machines : [];
  return prods.length === 0 && machs.length === 0 && bills.length === 0 && expenses.length === 0 && purchasePlan.length === 0 && heldBills.length === 0;
}

// ບັນທຶກຮູບພາບໄວ້ໃນ Local Cache ເພື່ອບໍ່ໃຫ້ຮູບເສຍເວລາຊິ້ງຂໍ້ມູນຂະໜາດໃຫຍ່
function saveMediaToLocalCache(st) {
  if (!st) return;
  try {
    const rawCache = localStorage.getItem(MEDIA_CACHE_KEY);
    const cache = rawCache ? JSON.parse(rawCache) : { products: {}, machines: {}, users: {}, qrImageData: '' };
    if (!cache.products) cache.products = {};
    if (!cache.machines) cache.machines = {};
    if (!cache.users) cache.users = {};

    (st.products || []).forEach(p => {
      if (p && p.id && p.image) cache.products[p.id] = p.image;
    });
    (st.machines || []).forEach(m => {
      if (m && m.id && m.image) cache.machines[m.id] = m.image;
    });
    (st.users || []).forEach(u => {
      const img = u?.avatar || u?.image;
      if (u && u.id && img) cache.users[u.id] = img;
    });
    if (st.receiptSettings && st.receiptSettings.qrImageData) {
      cache.qrImageData = st.receiptSettings.qrImageData;
    }
    localStorage.setItem(MEDIA_CACHE_KEY, JSON.stringify(cache));
  } catch (e) {}
}

// ດຶງຮູບພາບຈາກ Local Cache ກັບມາໃສ່ລາຍການສິນຄ້າ/ອຸປະກອນ/ສະມາຊິກ ຖ້າໃນ Cloud ບໍ່ມີຮູບ ແລະ ຄືນຄ່າວ່າມີຮູບໃນເຄື່ອງທີ່ຍັງບໍ່ທັນຂຶ້ນ Cloud ຫຼືບໍ່
function restoreMediaFromLocalCache(st, fallbackState = null) {
  let restoredMissingCloudMedia = false;
  if (!st) return false;
  try {
    const rawCache = localStorage.getItem(MEDIA_CACHE_KEY);
    const cache = rawCache ? JSON.parse(rawCache) : { products: {}, machines: {}, users: {}, qrImageData: '' };

    const fbProds = {};
    const fbMachs = {};
    const fbUsers = {};
    if (fallbackState) {
      (fallbackState.products || []).forEach(p => { if (p && p.id && p.image) fbProds[p.id] = p.image; });
      (fallbackState.machines || []).forEach(m => { if (m && m.id && m.image) fbMachs[m.id] = m.image; });
      (fallbackState.users || []).forEach(u => {
        const img = u?.avatar || u?.image;
        if (u && u.id && img) fbUsers[u.id] = img;
      });
    }

    if (Array.isArray(st.products)) {
      st.products.forEach(p => {
        if (p && !p.image) {
          const localImg = (cache.products && cache.products[p.id]) || fbProds[p.id] || '';
          if (localImg) {
            p.image = localImg;
            restoredMissingCloudMedia = true;
          }
        }
      });
    }
    if (Array.isArray(st.machines)) {
      st.machines.forEach(m => {
        if (m && !m.image) {
          const localImg = (cache.machines && cache.machines[m.id]) || fbMachs[m.id] || '';
          if (localImg) {
            m.image = localImg;
            restoredMissingCloudMedia = true;
          }
        }
      });
    }
    if (Array.isArray(st.users)) {
      st.users.forEach(u => {
        if (u && !u.avatar && !u.image) {
          const savedImg = (cache.users && cache.users[u.id]) || fbUsers[u.id] || '';
          if (savedImg) {
            u.avatar = savedImg;
            restoredMissingCloudMedia = true;
          }
        }
      });
    }
    if (st.receiptSettings && !st.receiptSettings.qrImageData) {
      const savedQr = cache.qrImageData || fallbackState?.receiptSettings?.qrImageData || '';
      if (savedQr) {
        st.receiptSettings.qrImageData = savedQr;
        restoredMissingCloudMedia = true;
      }
    }
  } catch (e) {}
  return restoredMissingCloudMedia;
}

// ຫຍໍ້ຂະໜາດຮູບພາບ Base64 ໃຫ້ກະທັດຮັດ ເພື່ອໃຫ້ສາມາດສົ່ງຮູບພາບທຸກລາຍການຂ້າມເຄື່ອງຜ່ານ Google Sheets / Google Drive ໄດ້ 100%
function recompressDataUrl(dataUrl, maxSize = 110, quality = 0.55) {
  return new Promise((resolve) => {
    if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image')) {
      resolve(dataUrl || '');
      return;
    }
    const img = new Image();
    img.onload = () => {
      try {
        let w = img.width || maxSize;
        let h = img.height || maxSize;
        if (w > h && w > maxSize) {
          h = Math.max(1, Math.round((h * maxSize) / w));
          w = maxSize;
        } else if (h >= w && h > maxSize) {
          w = Math.max(1, Math.round((w * maxSize) / h));
          h = maxSize;
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        const compressed = canvas.toDataURL('image/jpeg', quality);
        resolve(compressed.length < dataUrl.length ? compressed : dataUrl);
      } catch (e) {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

// ກຽມຂໍ້ມູນສຳລັບສົ່ງຂຶ້ນ Cloud ໂດຍຮັກສາຮູບພາບສິນຄ້າ, ອຸປະກອນ ແລະ ສະມາຊິກທຸກຮູບໄວ້ 100% (ຫຍໍ້ຂະໜາດອັດຕະໂນມັດແທນການລຶບຮູບ)
async function buildCloudSafeStateAsync(st) {
  const copy = JSON.parse(JSON.stringify(st));
  delete copy.currentUser;
  const MAX_SHEET_CELL_CHARS = 44500;

  // ຮອບທີ 1: ຫຍໍ້ຮູບທີ່ໃຫຍ່ເກີນ 3,200 ຕົວອັກສອນ ໃຫ້ເປັນ Thumbnail ຄົມຊັດ (115px) ເພື່ອຊິ້ງໄວ ແລະ ສະແດງໃນທຸກເຄື່ອງ
  const compressPass = async (targetSize, targetQuality, thresholdChars) => {
    if (Array.isArray(copy.products)) {
      for (const p of copy.products) {
        if (p && p.image && String(p.image).startsWith('data:image') && String(p.image).length > thresholdChars) {
          p.image = await recompressDataUrl(p.image, targetSize, targetQuality);
        }
      }
    }
    if (Array.isArray(copy.machines)) {
      for (const m of copy.machines) {
        if (m && m.image && String(m.image).startsWith('data:image') && String(m.image).length > thresholdChars) {
          m.image = await recompressDataUrl(m.image, targetSize, targetQuality);
        }
      }
    }
    if (Array.isArray(copy.users)) {
      for (const u of copy.users) {
        if (u && u.avatar && String(u.avatar).startsWith('data:image') && String(u.avatar).length > thresholdChars) {
          u.avatar = await recompressDataUrl(u.avatar, targetSize, targetQuality);
        }
        if (u && u.image && String(u.image).startsWith('data:image') && String(u.image).length > thresholdChars) {
          u.image = await recompressDataUrl(u.image, targetSize, targetQuality);
        }
      }
    }
  };

  await compressPass(115, 0.58, 3200);
  if (JSON.stringify(copy).length <= MAX_SHEET_CELL_CHARS) {
    return copy;
  }

  // ຮອບທີ 2: ຖ້າຮູບມີຈຳນວນຫຼາຍ ໃຫ້ຫຍໍ້ລົງເປັນ 84px ເພື່ອເກັບຮູບທຸກລາຍການໄວ້ຄົບຖ້ວນ ໂດຍບໍ່ລຶບຮູບໃດໆອອກ
  await compressPass(84, 0.50, 1400);
  if ( copy.receiptSettings && copy.receiptSettings.qrImageData && String(copy.receiptSettings.qrImageData).length > 5000) {
    copy.receiptSettings.qrImageData = await recompressDataUrl(copy.receiptSettings.qrImageData, 180, 0.60);
  }
  if (JSON.stringify(copy).length <= MAX_SHEET_CELL_CHARS) {
    return copy;
  }

  // ຮອບທີ 3: ກໍລະນີມີຮູບຫຼາຍກວ່າ 30+ ຮູບ ຫຍໍ້ເປັນ 64px ເພື່ອໃຫ້ທຸກເຄື່ອງຍັງເຫັນຮູບຄົບ 100%
  await compressPass(64, 0.45, 800);
  return copy;
}

// Load & Save State
function loadState() {
  try {
    const prevVersion = localStorage.getItem(APP_VERSION_KEY);
    if (prevVersion !== APP_CODE_VERSION) {
      isAppJustUpdated = true;
      localStorage.setItem(APP_VERSION_KEY, APP_CODE_VERSION);
    }

    let raw = localStorage.getItem(STORAGE_KEY);
    // ກວດສອບ Key ເກົ່າໆ ຖ້າມີການອັບເດດເວັບແອັບ
    if (!raw) {
      for (const k of LEGACY_STORAGE_KEYS) {
        const candidate = localStorage.getItem(k);
        if (candidate) {
          raw = candidate;
          localStorage.setItem(STORAGE_KEY, candidate);
          break;
        }
      }
    }

    if (raw) {
      const parsed = JSON.parse(raw);
      state.categories = (parsed.categories && parsed.categories.length > 0) ? parsed.categories : [...DEFAULT_CATEGORIES];
      // Filter out any old legacy mock/demo products from photo shop
      const rawProds = Array.isArray(parsed.products) ? parsed.products : [];
      state.products = rawProds.filter(p => !p.code?.startsWith('SV-') && p.category !== 'service' && p.category !== 'paper' && p.category !== 'ink');

      const rawMachs = Array.isArray(parsed.machines) ? parsed.machines : [];
      state.machines = rawMachs.filter(m => !m.name?.includes('Fuji Xerox') && !m.name?.includes('Epson EcoTank') && !m.name?.includes('Canon LBP'));

      const rawBills = Array.isArray(parsed.bills) ? parsed.bills : [];
      state.bills = rawBills.filter(b => !b.id?.startsWith('DL-261104'));

      const rawExp = Array.isArray(parsed.expenses) ? parsed.expenses : [];
      state.expenses = rawExp.filter(e => !e.title?.includes('ກັອບປີ້') && !e.title?.includes('ແກນໝຶກ'));

      const rawPP = Array.isArray(parsed.purchasePlan) ? parsed.purchasePlan : [];
      state.purchasePlan = rawPP.filter(item => !item.name?.includes('Double A') && !item.name?.includes('Epson 003'));

      state.heldBills = Array.isArray(parsed.heldBills) ? parsed.heldBills : [];
      state.receiptSettings = {
        ...DEFAULT_RECEIPT_SETTINGS,
        ...(parsed.receiptSettings || {})
      };
      state.checklist = parsed.checklist || state.checklist;
      state.users = (parsed && parsed.users) || (typeof getStoredUsers === 'function' ? getStoredUsers() : []);
      state.lastModified = Number(parsed.lastModified || 0);
      state._isDefaultState = Boolean(parsed._isDefaultState) || isUneditedDefaultData(parsed);

      if (state._isDefaultState) {
        try {
          localStorage.removeItem('donluang_has_unsynced_changes');
        } catch (e) {}
      }

      restoreMediaFromLocalCache(state);
      saveMediaToLocalCache(state);
      syncPurchasedPlanItemsWithExpenses();
    } else {
      // ຖ້າຫາກຍັງບໍ່ທັນມີຂໍ້ມູນໃນ localStorage ເຄື່ອງນີ້ (ຫຼື ເຄື່ອງເປີດໃໝ່)
      state.categories = [...DEFAULT_CATEGORIES];
      state.products = [...DEFAULT_PRODUCTS];
      state.machines = [...DEFAULT_MACHINES];
      state.bills = [];
      state.expenses = [];
      state.purchasePlan = [];
      state.heldBills = [];
      state.receiptSettings = { ...DEFAULT_RECEIPT_SETTINGS };
      state.users = typeof getStoredUsers === 'function' ? getStoredUsers() : [];
      state.lastModified = 0;
      state._isDefaultState = true; // ໝາຍໄວ້ວ່າເປັນ demo template ເບື້ອງຕົ້ນ ຫ້າມບໍ່ໃຫ້ອັບໂຫຼດທັບ Google Drive
      try {
        localStorage.removeItem('donluang_has_unsynced_changes');
      } catch (e) {}
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  } catch (e) {
    state.categories = [...DEFAULT_CATEGORIES];
    state.products = [...DEFAULT_PRODUCTS];
    state.machines = [...DEFAULT_MACHINES];
    state.bills = [];
    state.expenses = [];
    state.purchasePlan = [];
    state.heldBills = [];
    state.receiptSettings = { ...DEFAULT_RECEIPT_SETTINGS };
    state.users = typeof getStoredUsers === 'function' ? getStoredUsers() : [];
    state.lastModified = 0;
    state._isDefaultState = true;
  }
}

function syncPurchasedPlanItemsWithExpenses() {
  if (!state.purchasePlan || !state.expenses) return;
  let hasChange = false;
  state.purchasePlan.forEach(item => {
    if (item.purchased) {
      const alreadyHasExpense = state.expenses.some(e => e.purchasePlanItemId === item.id || (item.linkedExpenseId && e.id === item.linkedExpenseId));
      if (!alreadyHasExpense) {
        const qtyToAdd = Math.max(1, Number(item.qty || 1));
        const newCost = Math.max(0, Number(item.price || 0));
        const lineTotal = newCost * qtyToAdd;
        const now = item.purchasedAt || new Date().toISOString();
        const expenseId = item.linkedExpenseId || `EX-P-${Date.now()}_${item.id}`;
        item.linkedExpenseId = expenseId;
        const purchaseExpense = {
          id: expenseId,
          date: now.slice(0, 10),
          category: 'stock_purchase',
          title: `ຊື້ສິນຄ້າເຂົ້າຮ້ານ: ${item.name}`,
          qty: qtyToAdd,
          unit: item.unit || 'ອັນ',
          cost: newCost,
          amount: lineTotal,
          paymentMethod: 'cash',
          status: 'paid',
          purchasePlanItemId: item.id,
          note: `ຊື້ຈາກແຜນຈັດຊື້ (${qtyToAdd} ${item.unit || 'ອັນ'} × ${formatLAK(newCost)})`
        };
        state.expenses.unshift(purchaseExpense);
        hasChange = true;
      }
    }
  });
  if (hasChange) {
    // ບັນທຶກສະເພາະໃນ Local ໂດຍບໍ່ປ່ຽນ lastModified ເພື່ອບໍ່ໃຫ້ໄປທັບຂໍ້ມູນ Google Drive ຕອນເປີດແອັບ
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
}

function showToast(message, type = 'info') {
  let toastContainer = document.getElementById('appToastContainer');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'appToastContainer';
    toastContainer.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:99999;display:flex;flex-direction:column;gap:10px;pointer-events:none;';
    document.body.appendChild(toastContainer);
  }
  const toast = document.createElement('div');
  const bgMap = {
    success: 'linear-gradient(135deg, #059669, #10b981)',
    warning: 'linear-gradient(135deg, #d97706, #f59e0b)',
    danger: 'linear-gradient(135deg, #dc2626, #ef4444)',
    info: 'linear-gradient(135deg, #2563eb, #3b82f6)'
  };
  const bg = bgMap[type] || bgMap.info;
  toast.style.cssText = `background:${bg};color:#ffffff;padding:12px 20px;border-radius:10px;box-shadow:0 8px 20px rgba(0,0,0,0.25);font-size:0.95rem;font-weight:700;display:flex;align-items:center;gap:10px;max-width:380px;pointer-events:auto;opacity:0;transform:translateY(15px);transition:all 0.3s ease;`;
  toast.textContent = message;
  toastContainer.appendChild(toast);
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
  });
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(15px)';
    setTimeout(() => {
      if (toast && toast.parentNode) toast.parentNode.removeChild(toast);
    }, 300);
  }, 3500);
}

const syncChannel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('donluang_sync_channel') : null;
if (syncChannel) {
  syncChannel.onmessage = (event) => {
    if (event.data && event.data.type === 'STATE_UPDATED') {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          state = JSON.parse(raw);
          reRenderAllUI();
        }
      } catch (e) {}
    }
  };
}

// Fallback to storage event for browsers without BroadcastChannel
window.addEventListener('storage', (event) => {
  if (event.key === STORAGE_KEY && event.newValue) {
    try {
      state = JSON.parse(event.newValue);
      reRenderAllUI();
    } catch (e) {}
  }
});

function notifyOtherTabs() {
  if (syncChannel) {
    try {
      syncChannel.postMessage({ type: 'STATE_UPDATED', timestamp: Date.now() });
    } catch (e) {}
  }
}

function reRenderAllUI() {
  if (typeof renderAllCategorySelects === 'function') renderAllCategorySelects();
  renderPOSProducts();
  renderCart();
  renderCatalogTable();
  renderMachines();
  renderSalesHistory();
  renderSummaryPage();
  renderPurchasePlanPage();
  updateBadges();
  if (typeof updateHeaderUserUI === 'function') updateHeaderUserUI();
  if (typeof applyUserPermissions === 'function') applyUserPermissions();
}

function saveState(skipCloud = false, isUserEdit = true) {
  if (isUserEdit) {
    state.lastModified = Date.now();
    state._isDefaultState = false;
    try {
      localStorage.setItem('donluang_has_unsynced_changes', 'true');
    } catch (e) {}
  }
  saveMediaToLocalCache(state);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  updateBadges();
  notifyOtherTabs();
  if (!skipCloud) {
    const url = getGSheetUrl();
    if (url && !initialCloudSyncCompleted) {
      // ຖ້າຍັງດຶງຂໍ້ມູນຫຼັກຈາກ Google Drive ຕອນເປີດແອັບບໍ່ທັນສຳເລັດ ຫ້າມສົ່ງຂໍ້ມູນຂຶ້ນທັບເດັດຂາດ
      pendingCloudPushAfterInit = true;
      return;
    }
    syncToGSheetBackground();
  }
}

function updateBadges() {
  const lowStockCount = state.products.filter(p => p.trackStock && p.stock <= p.minStock).length;
  const lowBadge = document.getElementById('lowStockBadge');
  if (lowBadge) {
    lowBadge.textContent = lowStockCount;
    lowBadge.style.display = lowStockCount > 0 ? 'inline-block' : 'none';
  }

  const maintCount = state.machines.filter(m => m.status !== 'normal').length;
  const machBadge = document.getElementById('machineAlertBadge');
  if (machBadge) {
    machBadge.textContent = maintCount;
    machBadge.style.display = maintCount > 0 ? 'inline-block' : 'none';
  }

  const unpaidCount = state.bills.filter(b => b.status === 'unpaid').length;
  const debtBadge = document.getElementById('unpaidBillBadge');
  if (debtBadge) {
    debtBadge.textContent = unpaidCount;
    debtBadge.style.display = unpaidCount > 0 ? 'inline-block' : 'none';
  }

  const storeBadge = document.getElementById('storeInfoBadge');
  const totalStoreAlerts = lowStockCount + maintCount + unpaidCount;
  if (storeBadge) {
    storeBadge.textContent = totalStoreAlerts;
    storeBadge.style.display = totalStoreAlerts > 0 ? 'inline-block' : 'none';
  }

  const heldCount = (state.heldBills || []).length;
  const heldBadge = document.getElementById('heldBillsCountBadge');
  if (heldBadge) {
    heldBadge.textContent = heldCount;
  }

  // Sidebar badges
  const sideLow = document.getElementById('sideLowStockBadge');
  if (sideLow) {
    sideLow.textContent = lowStockCount;
    sideLow.style.display = lowStockCount > 0 ? 'inline-block' : 'none';
  }

  const sideMach = document.getElementById('sideMachineAlertBadge');
  if (sideMach) {
    sideMach.textContent = maintCount;
    sideMach.style.display = maintCount > 0 ? 'inline-block' : 'none';
  }

  const sideUnpaid = document.getElementById('sideUnpaidBadge');
  if (sideUnpaid) {
    sideUnpaid.textContent = unpaidCount;
    sideUnpaid.style.display = unpaidCount > 0 ? 'inline-block' : 'none';
  }

  const sidePos = document.getElementById('sidePosBadge');
  if (sidePos) {
    sidePos.textContent = heldCount;
    sidePos.style.display = heldCount > 0 ? 'inline-block' : 'none';
  }
}

// ==========================================================================
// SIDEBAR DRAWER NAVIGATION CONTROLLER (ເມນູຂ້າງເບື້ອງຊ້າຍ ☰)
// ==========================================================================

const ACTIVE_TAB_KEY = 'donluang_active_tab';
let currentCatalogSectionMode = 'products'; // 'products' (ສິນຄ້າ) or 'services' (ບໍລິການ)
let currentActiveTab = localStorage.getItem(ACTIVE_TAB_KEY) || 'pos';

const PAGE_TITLES = {
  pos: '🛒 ອອກບິນ',
  history: '📊 ລາຍການບິນ',
  products: '📦 ສິນຄ້າ',
  services: '📸 ບໍລິການ',
  catalog: '📦 ສິນຄ້າ',
  machines: '🏢 ຊັບສິນຮ້ານ',
  summary: '💰 ສະຫຼຸບ',
  purchase: '📝 ແຜນຈັດຊື້'
};

function updateActivePageHeaderTitle(tabId) {
  const titleEl = document.getElementById('activePageHeaderTitle');
  if (titleEl) {
    titleEl.textContent = PAGE_TITLES[tabId] || '🛒 ອອກບິນ';
  }
}

function toggleSidebarDrawer() {
  const drawer = document.getElementById('sidebarDrawer');
  const backdrop = document.getElementById('sidebarDrawerBackdrop');
  if (!drawer) return;
  const isOpen = drawer.classList.contains('open');
  if (isOpen) {
    closeSidebarDrawer();
  } else {
    drawer.classList.add('open');
    if (backdrop) backdrop.classList.add('open');
    document.body.classList.add('sidebar-open');
    updateBadges();
  }
}

function closeSidebarDrawer() {
  const drawer = document.getElementById('sidebarDrawer');
  const backdrop = document.getElementById('sidebarDrawerBackdrop');
  if (drawer) drawer.classList.remove('open');
  if (backdrop) backdrop.classList.remove('open');
  document.body.classList.remove('sidebar-open');
}

function navigateTo(tabId) {
  closeSidebarDrawer();
  switchTab(tabId);
}

// Close drawer on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeSidebarDrawer();
  }
});

function switchTab(tabId) {
  if (tabId === 'catalog') tabId = 'products';

  if (typeof canAccessTab === 'function' && !canAccessTab(tabId)) {
    if (typeof showToast === 'function') {
      showToast('⚠️ ທ່ານບໍ່ມີສິດເຂົ້າເຖິງເມນູນີ້! (ສະເພາະເຈົ້າຂອງຮ້ານ ຫຼື ຜູ້ທີ່ໄດ້ຮັບອະນຸຍາດ)', 'warning');
    }
    tabId = 'pos';
  }

  currentActiveTab = tabId;
  try {
    localStorage.setItem(ACTIVE_TAB_KEY, tabId);
  } catch (e) {}
  const panelTabId = (tabId === 'products' || tabId === 'services') ? 'catalog' : tabId;

  if (tabId === 'products') {
    currentCatalogSectionMode = 'products';
  } else if (tabId === 'services') {
    currentCatalogSectionMode = 'services';
  }

  // Update header title
  updateActivePageHeaderTitle(tabId);

  // Update sidebar active states
  document.querySelectorAll('.sidebar-nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.tab === tabId);
  });

  // Switch tab-panel
  document.querySelectorAll('.tab-panel').forEach(panel => {
    const isTarget = panel.id === `tab-${panelTabId}`;
    if (isTarget) {
      if (panel.classList.contains('active')) {
        panel.classList.remove('active');
        void panel.offsetWidth;
      }
      panel.classList.add('active');
    } else {
      panel.classList.remove('active');
    }
  });

  if (tabId !== 'pos' && typeof stopPosTicketCamera === 'function') {
    stopPosTicketCamera();
  }

  if (tabId === 'pos') {
    renderPOSProducts();
    if (typeof startPosTicketCamera === 'function') {
      startPosTicketCamera(true);
    }
  }
  if (panelTabId === 'catalog') {
    updateCatalogFilterOptions();
    renderCatalogTable();
  }
  if (tabId === 'machines') {
    editingMachineId = null;
    renderMachines();
  }
  if (tabId === 'history') renderSalesHistory();
  if (tabId === 'summary') renderSummaryPage();
  if (tabId === 'purchase') renderPurchasePlanPage();
}

function updateCatalogFilterOptions() {
  const catFilter = document.getElementById('catalogCategoryFilter');
  const cardTitle = document.getElementById('catalogSectionTitle');
  const addBtn = document.getElementById('catalogAddProductBtn');
  const barcodeBtn = document.getElementById('catalogBarcodeStudioBtn');
  const cats = (state.categories && state.categories.length > 0) ? state.categories : DEFAULT_CATEGORIES;

  if (currentCatalogSectionMode === 'services') {
    if (cardTitle) cardTitle.innerHTML = '📸 ບໍລິການ';
    if (addBtn) addBtn.innerHTML = 'ເພີ່ມບໍລິການ';
    if (barcodeBtn) barcodeBtn.style.display = 'none';

    if (catFilter) {
      catFilter.innerHTML = `<option value="service">📸 ບໍລິການ</option>`;
      catFilter.value = 'service';
    }
  } else {
    if (cardTitle) cardTitle.innerHTML = '📦 ສິນຄ້າ';
    if (addBtn) addBtn.innerHTML = 'ເພີ່ມສິນຄ້າ';
    if (barcodeBtn) barcodeBtn.style.display = 'inline-flex';

    if (catFilter) {
      const physicalCats = cats.filter(c => c.id !== 'service');
      const curVal = (catFilter.value && catFilter.value !== 'service') ? catFilter.value : 'all';
      catFilter.innerHTML = `<option value="all">ທຸກໝວດສິນຄ້າ</option>` +
        physicalCats.map(c => `<option value="${c.id}">${c.icon ? c.icon + ' ' : ''}${c.name}</option>`).join('');
      catFilter.value = curVal;
    }
  }
}

// ==========================================
// 1. POS & BILLING MODULE (ORANGE PHOTO CATALOG)
// ==========================================
function getProductDefaultSvg(p) {
  const code = String(p.code || '').toUpperCase();
  const name = String(p.name || '');
  const cat = String(p.category || '');
  let emoji = '📦';
  let bg1 = '#ecfdf5';
  let bg2 = '#a7f3d0';
  let accent = '#059669';

  if (cat === 'veggie' || name.includes('ຜັກ') || name.includes('ກະລ່ຳ') || name.includes('ໝາກເຜັດ') || name.includes('ໝາກເລັ່ນ')) {
    emoji = '🥬'; bg1 = '#ecfdf5'; bg2 = '#a7f3d0'; accent = '#047857';
  } else if (cat === 'fruit' || name.includes('ໝາກ') || name.includes('ກ້ວຍ') || name.includes('ໝາກໂມ')) {
    emoji = '🍎'; bg1 = '#fef2f2'; bg2 = '#fecaca'; accent = '#dc2626';
  } else if (cat === 'meat' || name.includes('ຊີ້ນ') || name.includes('ໝູ') || name.includes('ໄກ່') || name.includes('ງົວ')) {
    emoji = '🥩'; bg1 = '#fff1f2'; bg2 = '#fecdd3'; accent = '#e11d48';
  } else if (cat === 'fish' || name.includes('ປາ') || name.includes('ກຸ້ງ') || name.includes('ໝຶກ')) {
    emoji = '🐟'; bg1 = '#eff6ff'; bg2 = '#bfdbfe'; accent = '#2563eb';
  } else if (cat === 'egg' || name.includes('ໄຂ່') || name.includes('ເຕົ້າຫູ້')) {
    emoji = '🥚'; bg1 = '#fffbeb'; bg2 = '#fde68a'; accent = '#d97706';
  } else if (cat === 'dry' || name.includes('ແຫ້ງ') || name.includes('ໝີ່') || name.includes('ມາໝ່າ') || name.includes('ກະປ໋ອງ')) {
    emoji = '🌾'; bg1 = '#fefce8'; bg2 = '#fef08a'; accent = '#ca8a04';
  } else if (cat === 'seasoning' || name.includes('ນ້ຳປາ') || name.includes('ນ້ຳມັນ') || name.includes('ເຂົ້າສານ') || name.includes('ລູກຊີ້ນ') || name.includes('ແປ້ງນົວ')) {
    emoji = '🧂'; bg1 = '#f8fafc'; bg2 = '#cbd5e1'; accent = '#475569';
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240">
    <defs>
      <linearGradient id="g_${cat}_${code.replace(/[^A-Za-z0-9]/g, '_')}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${bg1}"/>
        <stop offset="100%" stop-color="${bg2}"/>
      </linearGradient>
    </defs>
    <rect width="240" height="240" fill="url(#g_${cat}_${code.replace(/[^A-Za-z0-9]/g, '_')})"/>
    <circle cx="120" cy="92" r="50" fill="rgba(255,255,255,0.85)" stroke="${accent}" stroke-width="2" stroke-opacity="0.3"/>
    <text x="120" y="110" font-size="54" text-anchor="middle">${emoji}</text>
  </svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

function getProductImageSrc(p) {
  if (p && p.image && String(p.image).trim() !== '') {
    return p.image;
  }
  return getProductDefaultSvg(p || {});
}

function compressImageFile(file, maxSize = 180, quality = 0.68, callback = null) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        let w = img.width;
        let h = img.height;
        if (w > h && w > maxSize) {
          h = Math.round((h * maxSize) / w);
          w = maxSize;
        } else if (h >= w && h > maxSize) {
          w = Math.round((w * maxSize) / h);
          h = maxSize;
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        if (typeof callback === 'function') {
          callback(dataUrl);
        }
        resolve(dataUrl);
      };
      img.onerror = err => {
        if (typeof callback === 'function') callback(null, err);
        reject(err);
      };
      img.src = e.target.result;
    };
    reader.onerror = err => {
      if (typeof callback === 'function') callback(null, err);
      reject(err);
    };
    reader.readAsDataURL(file);
  });
}

function triggerQuickImageUpload(event, productId) {
  if (event) event.stopPropagation();
  quickUploadTargetProductId = productId;
  const input = document.getElementById('quickProductImageInput');
  if (input) {
    input.value = '';
    input.click();
  }
}

async function handleQuickProductImageUpload(event) {
  const file = event.target.files?.[0];
  if (!file || !quickUploadTargetProductId) return;
  const prod = state.products.find(p => p.id === quickUploadTargetProductId);
  if (!prod) return;
  try {
    const dataUrl = await compressImageFile(file, 160, 0.65);
    prod.image = dataUrl;
    saveState();
    renderPOSProducts();
    renderCatalogTable();
    const actionModalImg = document.getElementById('prodActionMenuImg');
    if (actionModalImg && selectedActionProductId === prod.id) {
      actionModalImg.src = dataUrl;
    }
    if (typeof showToast === 'function') {
      showToast(`✅ ອັບເດດຮູບພາບ "${prod.name}" ແລະ ຊິ້ງໄປທຸກເຄື່ອງແລ້ວ!`, 'success');
    }
  } catch (err) {
    alert('ບໍ່ສາມາດອັບໂຫຼດຮູບພາບໄດ້!');
  }
}

function setPOSCategory(cat) {
  selectedCategory = cat;
  document.querySelectorAll('.pos-cat-tab, .cat-pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.cat === cat);
  });
  renderPOSProducts();
}

function compareProductCode(a, b) {
  return String(a.code || '').localeCompare(String(b.code || ''), undefined, {
    numeric: true,
    sensitivity: 'base'
  });
}

function renderPOSProducts() {
  const cats = (state.categories && state.categories.length > 0) ? state.categories : DEFAULT_CATEGORIES;
  document.querySelectorAll('.pos-cat-tab').forEach(btn => {
    const catId = btn.dataset.cat;
    const foundCat = cats.find(c => c.id === catId);
    if (foundCat) {
      const count = (state.products || []).filter(p => p.category === catId).length;
      btn.textContent = `${foundCat.icon ? foundCat.icon + ' ' : ''}${foundCat.name} (${count})`;
    }
  });

  const query = (document.getElementById('posSearchInput')?.value || '').trim().toLowerCase();
  const grid = document.getElementById('posProductGrid');
  if (!grid) return;

  const filtered = state.products
    .filter(p => {
      const matchCat = p.category === selectedCategory;
      const matchQuery = !query || p.name.toLowerCase().includes(query) || p.code.toLowerCase().includes(query);
      return matchCat && matchQuery;
    })
    .sort(compareProductCode);

  if (filtered.length === 0) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:3rem;color:#64748b;">ບໍ່ພົບລາຍການສິນຄ້າ ຫຼື ບໍລິການໃນໝວດນີ້</div>`;
    return;
  }

  grid.innerHTML = filtered.map(p => {
    const isLow = p.trackStock && p.stock <= p.minStock;
    const isOut = p.trackStock && p.stock <= 0;
    const imgSrc = getProductImageSrc(p);
    const hasTier = p.hasTieredPricing && Array.isArray(p.priceTiers) && p.priceTiers.length > 0;
    return `
      <div class="pos-photo-tile ${isOut ? 'out-of-stock' : ''}" onclick="addToCart('${p.id}')">
        <img class="pos-tile-img" src="${imgSrc}" alt="${p.name}" loading="lazy" />
        <div class="pos-tile-top-price">
          ${Number(p.price).toLocaleString()} ກີບ / ${p.unit}
          ${p.hasSubUnit && p.subUnit ? `<div style="font-size:0.68rem;opacity:0.95;color:#fef08a;">(ຍ່ອຍ: ${Number(p.subPrice || 0).toLocaleString()} / ${p.subUnit})</div>` : ''}
        </div>
        ${p.hasSubUnit && p.subUnit ? `
          <span style="position:absolute;top:6px;left:6px;background:rgba(2,132,199,0.92);color:white;font-size:0.66rem;font-weight:800;padding:2px 6px;border-radius:4px;backdrop-filter:blur(2px);box-shadow:0 1px 3px rgba(0,0,0,0.2);">
            📦 1 ${p.unit} = ${p.subRatio} ${p.subUnit}
          </span>
        ` : ''}
        ${hasTier ? `
          <span style="position:absolute;bottom:36px;left:6px;background:rgba(22,163,74,0.92);color:white;font-size:0.64rem;font-weight:800;padding:2px 6px;border-radius:4px;backdrop-filter:blur(2px);box-shadow:0 1px 3px rgba(0,0,0,0.2);">
            🏷️ ຂາຍສົ່ງ ≥${p.priceTiers[0].minQty}
          </span>
        ` : ''}
        ${p.trackStock ? `
          <span class="pos-tile-stock-badge ${isLow ? 'low' : ''}">
            📦 ${formatProductStock(p)}
          </span>
        ` : ''}
        <div class="pos-tile-overlay">
          <div class="pos-tile-name">${p.name}</div>
        </div>
      </div>
    `;
  }).join('');
}

function addToCart(productId, unitType = null) {
  const product = state.products.find(p => p.id === productId);
  if (!product) return;

  // If product has sub-units configured and no unitType was chosen yet, show selection modal!
  if (!unitType && product.hasSubUnit && product.subUnit && Number(product.subRatio) > 1) {
    openUnitSelectionModal(productId);
    return;
  }

  const isSub = (unitType === 'sub');
  const cartItemId = isSub ? `${product.id}__sub` : product.id;
  const unitLabel = isSub ? product.subUnit : product.unit;
  const unitPrice = isSub ? Number(product.subPrice || Math.round(product.price / product.subRatio)) : Number(product.price);
  const itemName = isSub ? `${product.name} [${product.subUnit}]` : product.name;
  const deductPerQty = isSub ? (1 / Number(product.subRatio)) : 1;

  if (product.trackStock && product.stock <= 0) {
    alert(`ສິນຄ້າ "${product.name}" ໝົດສາງແລ້ວ! ກະລຸນາເຕີມສະຕັອກກ່ອນ.`);
    return;
  }

  // Calculate current stock committed in cart for this product
  if (product.trackStock) {
    let currentCommitted = 0;
    cart.forEach(it => {
      if (it.baseProductId === product.id || it.id === product.id) {
        currentCommitted += (it.deductPerQty !== undefined ? it.deductPerQty : 1) * it.qty;
      }
    });
    if (currentCommitted + deductPerQty > product.stock) {
      alert(`ຈຳນວນສິນຄ້າໃນສາງບໍ່ພໍຂາຍ! (ຄົງເຫຼືອ: ${formatProductStock(product)})`);
      return;
    }
  }

  const existing = cart.find(item => item.id === cartItemId);
  if (existing) {
    existing.qty += 1;
    applyTieredPriceToCartItem(existing, product);
  } else {
    const newItem = {
      id: cartItemId,
      baseProductId: product.id,
      code: product.code,
      name: itemName,
      price: unitPrice,
      unit: unitLabel,
      unitType: isSub ? 'sub' : 'main',
      deductPerQty: deductPerQty,
      qty: 1
    };
    applyTieredPriceToCartItem(newItem, product);
    cart.push(newItem);
  }
  renderCart();
}

let scannerMediaStream = null;
let scannerDetectInterval = null;
let scanFeedbackTimer = null;

// Barcode scanner cooldown & live camera state in bill
let lastScannedBarcode = null;
let lastScannedBarcodeTime = 0;
const BARCODE_COOLDOWN_MS = 2000; // 2 seconds cooldown for same item
let posCamStream = null;
let posCamInterval = null;

function playScanBeep(isWarning = false) {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    if (isWarning) {
      // Warning sound for unrecognized barcode
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(400, ctx.currentTime);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.18);
    } else {
      // Crisp POS supermarket retail beep (high chime)
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1850, ctx.currentTime);
      osc.frequency.setValueAtTime(2450, ctx.currentTime + 0.04);
      gain.gain.setValueAtTime(0.35, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.005, ctx.currentTime + 0.11);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.11);
    }
  } catch (e) {
    console.warn('Audio play error:', e);
  }
}

// Map Lao / Thai keyboard layout characters back to physical US-QWERTY ASCII barcode characters
const LAO_THAI_TO_QWERTY_MAP = {
  // Lao top number row (unshifted & shifted)
  'ຢ': '1', 'ຟ': '2', 'ໂ': '3', 'ຖ': '4', 'ຸ': '5', 'ູ': '6', 'ຄ': '7', 'ຕ': '8', 'ຈ': '9', 'ຂ': '0', 'ຊ': '-', 'ໍ': '=',
  '໌': '5', 'ຼ': '6',
  // Lao QWERTY row
  'ົ': 'Q', 'ໄ': 'W', 'ຳ': 'E', 'ພ': 'R', 'ະ': 'T', 'ິ': 'Y', 'ີ': 'U', 'ຮ': 'I', 'ຣ': 'I', 'ນ': 'O', 'ໜ': 'O', 'ຍ': 'P', 'ຽ': 'P', 'ບ': '[', 'ລ': ']',
  // Lao ASDF row
  'ັ': 'A', 'ຫ': 'S', 'ກ': 'D', 'ດ': 'F', 'ເ': 'G', '້': 'H', '໊': 'H', '່': 'J', '๋': 'J', 'າ': 'K', 'ສ': 'L', 'ວ': ';', 'ງ': "'",
  // Lao ZXCV row
  'ຜ': 'Z', 'ປ': 'X', 'ແ': 'C', 'ອ': 'V', 'ຶ': 'B', 'ື': 'N', 'ທ': 'M', 'ໆ': 'M', 'ມ': ',', 'ໃ': '.', 'ຝ': '/',
  // Lao numerals
  '໐': '0', '໑': '1', '໒': '2', '໓': '3', '໔': '4', '໕': '5', '໖': '6', '໗': '7', '໘': '8', '໙': '9',
  // Thai Kedmanee top number row & common keys
  'ๅ': '1', '/': '2', '_': '-', 'ภ': '4', 'ถ': '5', 'ุ': '6', 'ึ': '7', 'ค': '8', 'ต': '9', 'จ': '0', 'ข': '-', 'ช': '=',
  'ๆ': 'Q', 'ไ': 'W', 'ำ': 'E', 'พ': 'R', 'ะ': 'T', 'ั': 'Y', 'ี': 'U', 'ร': 'I', 'น': 'O', 'ย': 'P', 'บ': '[', 'ล': ']',
  'ฟ': 'A', 'ห': 'S', 'ก': 'D', 'ด': 'F', 'เ': 'G', '้': 'H', '่': 'J', 'า': 'K', 'ส': 'L', 'ว': ';', 'ง': "'",
  'ผ': 'Z', 'ป': 'X', 'แ': 'C', 'อ': 'V', 'ิ': 'B', 'ื': 'N', 'ท': 'M', 'ม': ',', 'ใ': '.', 'ฝ': '/'
};

function translateLaoThaiKeyToAscii(input) {
  const s = String(input || '');
  if (!s) return '';
  // Only translate if there are non-ASCII characters
  if (/^[\x20-\x7E]+$/.test(s)) return s;
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (LAO_THAI_TO_QWERTY_MAP[ch] !== undefined) {
      out += LAO_THAI_TO_QWERTY_MAP[ch];
    } else if (ch >= '\x20' && ch <= '\x7E') {
      out += ch;
    }
  }
  return out || s;
}

function getAsciiFromKeyboardEvent(e) {
  if (!e) return '';
  const code = String(e.code || '');
  if (/^Digit([0-9])$/.test(code)) {
    return RegExp.$1;
  }
  if (/^Numpad([0-9])$/.test(code)) {
    return RegExp.$1;
  }
  if (/^Key([A-Z])$/.test(code)) {
    return RegExp.$1;
  }
  if (code === 'Minus' || code === 'NumpadSubtract') {
    return e.shiftKey ? '_' : '-';
  }
  if (code === 'Slash' || code === 'NumpadDivide') {
    return '/';
  }
  if (code === 'Period' || code === 'NumpadDecimal') {
    return '.';
  }
  if (code === 'Space') {
    return ' ';
  }
  if (e.key && e.key !== 'Dead' && e.key !== 'Unidentified' && e.key.length <= 2 && !['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab', 'Enter', 'Escape', 'Backspace'].includes(e.key)) {
    return translateLaoThaiKeyToAscii(e.key);
  }
  return '';
}

function handleProdCodeInputNormalize(inputEl) {
  if (!inputEl) return;
  const val = inputEl.value || '';
  if (/[^\x20-\x7E]/.test(val)) {
    const converted = translateLaoThaiKeyToAscii(val);
    if (converted && converted !== val) {
      inputEl.value = converted;
    }
  }
}

let bgCamMissCode = '';
let bgCamMissCount = 0;

function handleDetectedBarcode(rawCode, fromBackgroundCamera = false) {
  const cleanedRaw = String(rawCode || '').replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/g, '').trim();
  if (!cleanedRaw) return;

  const asciiCode = translateLaoThaiKeyToAscii(cleanedRaw).trim();
  const code = asciiCode || cleanedRaw;

  const now = Date.now();
  // Cooldown: prevent scanning the same barcode multiple times within 2 seconds
  if (code === lastScannedBarcode && (now - lastScannedBarcodeTime) < BARCODE_COOLDOWN_MS) {
    return;
  }

  const matched = findProductByScannedCode(cleanedRaw) || (asciiCode !== cleanedRaw ? findProductByScannedCode(asciiCode) : null);
  if (matched) {
    lastScannedBarcode = code;
    lastScannedBarcodeTime = now;
    bgCamMissCode = '';
    bgCamMissCount = 0;

    addToCart(matched.id);
    playScanBeep(false); // Play success scanner beep!
    if (navigator.vibrate) {
      try { navigator.vibrate(80); } catch (e) {}
    }
    showPosScanFeedback(`✅ ສະແກນສຳເລັດ: [${matched.code || 'CODE'}] ${matched.name} (+1)`);
    flashCameraScanSuccess();
  } else {
    // If from background camera, require 3 consecutive identical reads before warning so blurry/background frames don't false-alarm
    if (fromBackgroundCamera) {
      if (bgCamMissCode === code) {
        bgCamMissCount += 1;
      } else {
        bgCamMissCode = code;
        bgCamMissCount = 1;
      }
      if (bgCamMissCount < 3) {
        return;
      }
      bgCamMissCount = 0;
    }
    lastScannedBarcode = code;
    lastScannedBarcodeTime = now;
    playScanBeep(true); // Warning beep
    showPosScanFeedback(`⚠️ ບໍ່ພົບສິນຄ້າລະຫັດ: "${code}"`, true);
  }
}

function flashCameraScanSuccess() {
  const box = document.getElementById('posTicketCameraBox');
  if (box) {
    box.classList.add('scan-success-flash');
    setTimeout(() => {
      box.classList.remove('scan-success-flash');
    }, 350);
  }
}

async function startPosTicketCamera(silent = true) {
  const video = document.getElementById('posTicketVideo');

  if (posCamStream) {
    return;
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    return;
  }

  try {
    posCamStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'environment',
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    });

    if (video) {
      video.srcObject = posCamStream;
      await video.play();
    }

    startPosBarcodeDetection(video);

  } catch (err) {
    console.warn('Background camera scanner error:', err);
    stopPosTicketCamera();
  }
}

async function togglePosTicketCamera(event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  if (posCamStream) {
    stopPosTicketCamera();
    return;
  }
  await startPosTicketCamera(true);
}

function stopPosTicketCamera() {
  if (posCamInterval) {
    clearInterval(posCamInterval);
    posCamInterval = null;
  }
  if (posCamStream) {
    try {
      posCamStream.getTracks().forEach(t => t.stop());
    } catch (e) {}
    posCamStream = null;
  }
  const video = document.getElementById('posTicketVideo');
  if (video) {
    try { video.srcObject = null; } catch (e) {}
  }
}

function startPosBarcodeDetection(video) {
  if (posCamInterval) clearInterval(posCamInterval);

  // 1. Native BarcodeDetector (Android/Chrome/Edge/Safari 17+)
  if ('BarcodeDetector' in window) {
    let detector;
    try {
      detector = new window.BarcodeDetector({
        formats: ['code_128', 'code_39', 'code_93', 'ean_13', 'ean_8', 'qr_code', 'upc_a', 'upc_e', 'itf']
      });
    } catch (e) {
      try { detector = new window.BarcodeDetector(); } catch (e2) {}
    }

    if (detector) {
      posCamInterval = setInterval(async () => {
        if (!video || video.readyState < 2 || !posCamStream) return;
        try {
          const barcodes = await detector.detect(video);
          if (barcodes && barcodes.length > 0) {
            for (const b of barcodes) {
              if (b && b.rawValue) {
                handleDetectedBarcode(b.rawValue, true);
                break;
              }
            }
          }
        } catch (e) {}
      }, 350);
      return;
    }
  }

  // 2. ZXing Library Fallback
  if (typeof ZXing !== 'undefined' && ZXing.BrowserMultiFormatReader) {
    try {
      const codeReader = new ZXing.BrowserMultiFormatReader();
      posCamInterval = setInterval(async () => {
        if (!video || video.readyState < 2 || !posCamStream) return;
        try {
          const result = await codeReader.decodeFromVideoElement(video);
          if (result && result.text) {
            handleDetectedBarcode(result.text, true);
          }
        } catch (e) {}
      }, 400);
      return;
    } catch (e) {}
  }
}

function normalizeCodeVariants(str) {
  const raw = String(str || '').replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/g, '').trim();
  if (!raw) return { lower: '', ascii: '', alnum: '', prefixNum: '', numNoZero: '' };
  const lower = raw.toLowerCase();
  const ascii = translateLaoThaiKeyToAscii(raw).trim().toLowerCase();
  const base = ascii || lower;
  const alnum = base.replace(/[^a-z0-9]/g, '');

  // Normalize prefix + number like "pa-01", "pa001", "pa-1" -> "pa#1"
  let prefixNum = '';
  const pm = base.match(/^([a-z]+)[-_.\s]*0*(\d+)$/);
  if (pm) {
    prefixNum = `${pm[1]}#${parseInt(pm[2], 10)}`;
  }

  // Normalize pure numeric barcode (EAN-13 / UPC-A leading zeros) like "0885123" -> "885123"
  let numNoZero = '';
  if (/^\d+$/.test(alnum)) {
    numNoZero = alnum.replace(/^0+/, '') || '0';
  }

  return { lower, ascii, alnum, prefixNum, numNoZero };
}

function getProductCodeList(p) {
  if (!p) return [];
  const list = [];
  if (p.code) list.push(String(p.code));
  if (p.barcode) list.push(String(p.barcode));
  if (p.id) list.push(String(p.id));
  if (Array.isArray(p.altCodes)) {
    p.altCodes.forEach(c => {
      if (c) list.push(String(c));
    });
  }
  return list;
}

function findProductByScannedCode(raw) {
  const products = Array.isArray(state.products) ? state.products : [];
  if (products.length === 0) return null;

  const qVar = normalizeCodeVariants(raw);
  if (!qVar.lower && !qVar.ascii) return null;

  // 1. Exact match on code, barcode, id, or altCodes (raw or Lao/Thai-to-ASCII normalized)
  for (const p of products) {
    const codes = getProductCodeList(p);
    for (const c of codes) {
      const cVar = normalizeCodeVariants(c);
      if (
        (qVar.lower && (cVar.lower === qVar.lower || cVar.ascii === qVar.lower)) ||
        (qVar.ascii && (cVar.lower === qVar.ascii || cVar.ascii === qVar.ascii))
      ) {
        return p;
      }
    }
  }

  // 2. Alphanumeric match (ignoring hyphens, spaces, punctuation: e.g. "PA-01" === "PA01")
  if (qVar.alnum) {
    for (const p of products) {
      const codes = getProductCodeList(p);
      for (const c of codes) {
        const cVar = normalizeCodeVariants(c);
        if (cVar.alnum && cVar.alnum === qVar.alnum) {
          return p;
        }
      }
    }
  }

  // 3. Prefix + integer match (e.g. "PA-01" === "PA-001" === "PA-1", "BC-0001" === "BC-1")
  if (qVar.prefixNum) {
    for (const p of products) {
      const codes = getProductCodeList(p);
      for (const c of codes) {
        const cVar = normalizeCodeVariants(c);
        if (cVar.prefixNum && cVar.prefixNum === qVar.prefixNum) {
          return p;
        }
      }
    }
  }

  // 4. Numeric leading-zero match (e.g. UPC-A vs EAN-13 "0885..." === "885...", or numeric suffix match if unique)
  if (qVar.numNoZero) {
    for (const p of products) {
      const codes = getProductCodeList(p);
      for (const c of codes) {
        const cVar = normalizeCodeVariants(c);
        if (cVar.numNoZero && cVar.numNoZero === qVar.numNoZero) {
          return p;
        }
      }
    }
    // If user scanned a pure number (like "0001") and only one product has that number in BC-0001 / DL-01
    const numVal = parseInt(qVar.numNoZero, 10);
    if (!isNaN(numVal)) {
      const numMatches = products.filter(p => {
        const cVar = normalizeCodeVariants(p.code);
        if (cVar.prefixNum) {
          const pNum = parseInt(cVar.prefixNum.split('#')[1], 10);
          return pNum === numVal;
        }
        return false;
      });
      if (numMatches.length === 1) {
        return numMatches[0];
      }
    }
  }

  // 5. Token / Substring / Name match (e.g. QR payload "DONLUANG|PA-01|..." or product name)
  for (const p of products) {
    const cVar = normalizeCodeVariants(p.code);
    if (cVar.alnum && cVar.alnum.length >= 3 && qVar.alnum.includes(cVar.alnum)) {
      return p;
    }
  }

  return (
    products.find(p => {
      const pName = String(p.name || '').toLowerCase();
      return (qVar.lower.length >= 2 && pName.includes(qVar.lower)) || (qVar.ascii.length >= 2 && pName.includes(qVar.ascii));
    }) || null
  );
}

function showPosScanFeedback(message, isError = false) {
  const el = document.getElementById('posScanFeedback');
  if (!el) return;
  el.textContent = message;
  el.style.display = 'block';
  el.style.background = isError ? '#fee2e2' : '#dcfce7';
  el.style.color = isError ? '#991b1b' : '#166534';
  el.style.borderColor = isError ? '#fca5a5' : '#86efac';
  if (scanFeedbackTimer) clearTimeout(scanFeedbackTimer);
  scanFeedbackTimer = setTimeout(() => {
    el.style.display = 'none';
  }, 3000);
}

function handleBarcodeScanKey(event) {
  if (event.key === 'Enter') {
    event.preventDefault();
    submitBarcodeScan();
  }
}

function handleScanButtonClick() {
  togglePosTicketCamera();
}

function submitBarcodeScan() {
  const input = document.getElementById('posBarcodeInput');
  const raw = (input?.value || '').trim();
  if (!raw) {
    togglePosTicketCamera();
    return;
  }

  handleDetectedBarcode(raw);
  if (input) {
    input.value = '';
    input.focus();
  }
}

// Hardware Barcode Scanner Listener (USB / Bluetooth Laser Scanners) & Background Auto-Start
(function initHardwareBarcodeScannerListener() {
  let barcodeBuffer = '';
  let lastKeyTime = 0;
  let rapidKeyCount = 0;
  let burstTimer = null;

  function flushScannerBuffer() {
    if (burstTimer) {
      clearTimeout(burstTimer);
      burstTimer = null;
    }
    const scanned = barcodeBuffer.trim();
    barcodeBuffer = '';
    rapidKeyCount = 0;
    if (scanned.length >= 2) {
      handleDetectedBarcode(scanned, false);
    }
  }

  window.addEventListener('keydown', (e) => {
    // Only capture on POS tab when no modal dialog is open
    const posTab = document.getElementById('tab-pos');
    if (!posTab || !posTab.classList.contains('active')) return;
    if (document.querySelector('.modal-backdrop.open')) return;
    const bcStudio = document.getElementById('barcodeStudioModal');
    if (bcStudio && bcStudio.style.display === 'flex') return;

    // Ignore pure modifier keys (Shift, Control, Alt, CapsLock) so Shift+Key doesn't reset timing
    if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(e.key)) {
      return;
    }

    const activeEl = document.activeElement;
    const isInputFocused = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable);
    const isCartInput = isInputFocused && (activeEl.classList.contains('qty-input') || activeEl.classList.contains('cart-right-price-input'));

    // If user is typing in a normal text input (other than cart qty/price), don't intercept
    if (isInputFocused && !isCartInput) {
      return;
    }

    const now = Date.now();
    const delta = now - lastKeyTime;
    if (delta > 300) {
      barcodeBuffer = '';
      rapidKeyCount = 0;
    }
    lastKeyTime = now;

    if (e.key === 'Enter' || e.key === 'Tab') {
      if (barcodeBuffer.trim().length >= 2) {
        if (!isCartInput || rapidKeyCount >= 2) {
          e.preventDefault();
          e.stopPropagation();
          if (isCartInput && activeEl) activeEl.blur();
          flushScannerBuffer();
        } else {
          barcodeBuffer = '';
          rapidKeyCount = 0;
        }
      }
      return;
    }

    const ch = getAsciiFromKeyboardEvent(e);
    if (ch) {
      if (delta < 75) {
        rapidKeyCount += 1;
      }
      barcodeBuffer += ch;

      // If a cart input was focused but keys are arriving at barcode-scanner speed, prevent corrupting the input
      if (isCartInput && rapidKeyCount >= 2) {
        e.preventDefault();
        e.stopPropagation();
      }

      // Auto-complete burst for scanners that do not send an Enter suffix
      if (burstTimer) clearTimeout(burstTimer);
      if (rapidKeyCount >= 3 && barcodeBuffer.trim().length >= 4) {
        burstTimer = setTimeout(() => {
          const candidate = barcodeBuffer.trim();
          if (candidate.length >= 4 && findProductByScannedCode(candidate)) {
            if (isCartInput && activeEl) activeEl.blur();
            flushScannerBuffer();
          }
        }, 140);
      }
    }
  }, true);

  // Ensure background camera scanner starts if browser required a first user gesture
  let triedGestureCamStart = false;
  window.addEventListener('pointerdown', () => {
    if (triedGestureCamStart || posCamStream) return;
    const posTab = document.getElementById('tab-pos');
    if (posTab && posTab.classList.contains('active')) {
      triedGestureCamStart = true;
      startPosTicketCamera(true);
    }
  }, { passive: true });
})();

function renderScannerQuickCodeList() {
  const container = document.getElementById('scannerQuickCodeList');
  if (!container) return;
  const sorted = [...state.products].sort(compareProductCode);
  container.innerHTML = sorted.map(p => `
    <button type="button" class="scanner-code-chip" onclick="quickScanCode('${p.code}')">
      <div style="display:flex;justify-content:space-between;align-items:center;width:100%;">
        <strong style="color:#ea580c;font-size:0.8rem;">🔫 ${p.code}</strong>
        <span style="font-size:0.74rem;font-weight:700;color:#15803d;">${Number(p.price).toLocaleString()} ກີບ</span>
      </div>
      <div style="font-size:0.76rem;font-weight:600;color:#334155;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;width:100%;">
        ${p.name}
      </div>
    </button>
  `).join('');
}

function openBarcodeScannerModal() {
  const modal = document.getElementById('barcodeScannerModal');
  if (!modal) return;
  renderScannerQuickCodeList();
  const statusEl = document.getElementById('modalScanStatus');
  if (statusEl) statusEl.style.display = 'none';
  modal.classList.add('open');
  const modalInput = document.getElementById('modalBarcodeInput');
  if (modalInput) {
    modalInput.value = '';
    setTimeout(() => modalInput.focus(), 80);
  }
}

function closeBarcodeScannerModal() {
  stopCameraBarcodeScanner();
  document.getElementById('barcodeScannerModal')?.classList.remove('open');
}

function quickScanCode(code) {
  const matched = findProductByScannedCode(code);
  if (!matched) return;
  addToCart(matched.id);
  playScanBeep();
  const statusEl = document.getElementById('modalScanStatus');
  if (statusEl) {
    statusEl.textContent = `✅ ເພີ່ມເຂົ້າໃບບິນແລ້ວ: [${matched.code}] ${matched.name} (+1)`;
    statusEl.style.display = 'block';
  }
  showPosScanFeedback(`✅ ສະແກນສຳເລັດ: [${matched.code}] ${matched.name} (+1)`);
}

function submitModalBarcodeScan() {
  const input = document.getElementById('modalBarcodeInput');
  if (!input) return;
  const raw = input.value.trim();
  if (!raw) return;
  const matched = findProductByScannedCode(raw);
  const statusEl = document.getElementById('modalScanStatus');
  if (matched) {
    addToCart(matched.id);
    playScanBeep();
    if (statusEl) {
      statusEl.style.background = '#dcfce7';
      statusEl.style.color = '#15803d';
      statusEl.textContent = `✅ ສະແກນສຳເລັດ: [${matched.code}] ${matched.name} (+1)`;
      statusEl.style.display = 'block';
    }
    showPosScanFeedback(`✅ ສະແກນສຳເລັດ: [${matched.code}] ${matched.name} (+1)`);
    input.value = '';
    input.focus();
  } else {
    if (statusEl) {
      statusEl.style.background = '#fee2e2';
      statusEl.style.color = '#991b1b';
      statusEl.textContent = `⚠️ ບໍ່ພົບສິນຄ້າທີ່ກົງກັບລະຫັດ: "${raw}"`;
      statusEl.style.display = 'block';
    }
    input.select();
  }
}

async function toggleCameraBarcodeScanner() {
  const camBox = document.getElementById('scannerCameraContainer');
  const btn = document.getElementById('toggleCameraScanBtn');
  if (scannerMediaStream) {
    stopCameraBarcodeScanner();
    return;
  }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    alert('ອຸປະກອນ ຫຼື ບຣາວເຊີນີ້ບໍ່ຮອງຮັບການເປີດກ້ອງສະແກນ (ສາມາດໃຊ້ເຄື່ອງຍິງບາໂຄ້ດ ຫຼື ພິມລະຫັດສິນຄ້າແທນໄດ້).');
    return;
  }
  try {
    scannerMediaStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' }
    });
    const video = document.getElementById('barcodeScannerVideo');
    if (video) {
      video.srcObject = scannerMediaStream;
      await video.play();
    }
    if (camBox) camBox.style.display = 'block';
    if (btn) btn.textContent = '⏹️ ປິດກ້ອງສະແກນ';

    if ('BarcodeDetector' in window) {
      const detector = new window.BarcodeDetector();
      scannerDetectInterval = setInterval(async () => {
        if (!video || video.readyState < 2) return;
        try {
          const barcodes = await detector.detect(video);
          if (barcodes && barcodes.length > 0) {
            const codeVal = barcodes[0].rawValue;
            if (codeVal) {
              const matched = findProductByScannedCode(codeVal);
              if (matched) {
                quickScanCode(matched.code);
              }
            }
          }
        } catch (e) {}
      }, 650);
    }
  } catch (err) {
    alert('ບໍ່ສາມາດເປີດກ້ອງໄດ້ (ກະລຸນາອະນຸຍາດສິດການໃຊ້ກ້ອງ ຫຼື ໃຊ້ເຄື່ອງຍິງບາໂຄ້ດ).');
  }
}

function stopCameraBarcodeScanner() {
  if (scannerDetectInterval) {
    clearInterval(scannerDetectInterval);
    scannerDetectInterval = null;
  }
  if (scannerMediaStream) {
    scannerMediaStream.getTracks().forEach(t => t.stop());
    scannerMediaStream = null;
  }
  const camBox = document.getElementById('scannerCameraContainer');
  const btn = document.getElementById('toggleCameraScanBtn');
  if (camBox) camBox.style.display = 'none';
  if (btn) btn.textContent = '📷 ເປີດກ້ອງສະແກນບາໂຄ້ດ';
}

function updateCartQty(productId, deltaOrVal, isDirect = false) {
  const item = cart.find(i => i.id === productId);
  if (!item) return;
  const prodId = item.baseProductId || item.id;
  const product = state.products.find(p => p.id === prodId);

  let newQty = isDirect ? parseInt(deltaOrVal, 10) : item.qty + deltaOrVal;
  if (isNaN(newQty) || newQty <= 0) {
    cart = cart.filter(i => i.id !== productId);
  } else {
    if (product && product.trackStock) {
      const deductPerQty = item.deductPerQty !== undefined ? item.deductPerQty : 1;
      let otherDeduct = 0;
      cart.forEach(it => {
        if (it !== item && (it.baseProductId === product.id || it.id === product.id)) {
          otherDeduct += (it.deductPerQty !== undefined ? it.deductPerQty : 1) * it.qty;
        }
      });
      if (otherDeduct + (newQty * deductPerQty) > product.stock) {
        alert(`ຈຳນວນສິນຄ້າໃນສາງບໍ່ພໍຂາຍ! (ຄົງເຫຼືອ: ${formatProductStock(product)})`);
        return;
      }
    }
    item.qty = newQty;
    applyTieredPriceToCartItem(item, product);
  }
  renderCart();
}

function removeFromCart(productId) {
  cart = cart.filter(i => i.id !== productId);
  renderCart();
}

function focusCartPriceInput(productId) {
  const inputEl = document.getElementById(`cartLinePriceInput_${productId}`);
  if (inputEl) {
    inputEl.focus();
  }
}

function handleCartPriceFocus(productId, inputEl) {
  const item = cart.find(i => i.id === productId);
  if (!item || !inputEl) return;
  inputEl.value = Math.round(Number(item.price || 0) * Number(item.qty || 1));
  setTimeout(() => inputEl.select(), 0);
}

function handleCartPriceBlur(productId, inputEl) {
  const item = cart.find(i => i.id === productId);
  if (!item || !inputEl) return;
  inputEl.value = Math.round(Number(item.price || 0) * Number(item.qty || 1)).toLocaleString();
}

function updateCartItemPrice(productId, rawLineVal) {
  const item = cart.find(i => i.id === productId);
  if (!item) return;
  const cleaned = String(rawLineVal || '').replace(/[^0-9.]/g, '');
  const lineTotal = Math.max(0, Number(cleaned || 0));
  const qty = Math.max(1, Number(item.qty || 1));
  item.price = lineTotal / qty;

  const { subtotal, total } = getCartTotals();
  const subEl = document.getElementById('posSubtotalText');
  const totEl = document.getElementById('posTotalText');
  const bcelQrTotEl = document.getElementById('bcelQrModalTotalText');
  if (subEl) subEl.textContent = formatLAK(subtotal);
  if (totEl) totEl.textContent = formatLAK(total);
  if (bcelQrTotEl) bcelQrTotEl.textContent = formatLAK(total);
}

function clearCart() {
  cart = [];
  const nameEl = document.getElementById('posCustomerName');
  const phoneEl = document.getElementById('posCustomerPhone');
  const discEl = document.getElementById('posDiscountInput');
  if (nameEl) nameEl.value = '';
  if (phoneEl) phoneEl.value = '';
  if (discEl) discEl.value = '0';
  renderCart();
}

function holdCurrentBill() {
  if (cart.length === 0) {
    alert('ຍັງບໍ່ມີລາຍການສິນຄ້າໃນໃບບິນເພື່ອພັກບິນ!');
    return;
  }
  if (!state.heldBills) state.heldBills = [];

  const customerName = document.getElementById('posCustomerName')?.value.trim() || 'ລູກຄ້າທົ່ວໄປ';
  const customerPhone = document.getElementById('posCustomerPhone')?.value.trim() || '-';
  const { total } = getCartTotals();

  const heldEntry = {
    id: 'HOLD-' + Date.now(),
    date: new Date().toISOString(),
    customer: customerName,
    phone: customerPhone,
    paymentMethod: selectedPaymentMethod,
    items: cart.map(i => ({ ...i })),
    total
  };

  state.heldBills.unshift(heldEntry);
  saveState();
  clearCart();
  showPosScanFeedback(`⏸️ ພັກບິນຂອງ "${customerName}" (${formatLAK(total)}) ໄວ້ໃນລາຍການພັກບິນແລ້ວ`);
}

function openHeldBillsModal() {
  renderHeldBillsModal();
  document.getElementById('heldBillsModal')?.classList.add('open');
}

function closeHeldBillsModal() {
  document.getElementById('heldBillsModal')?.classList.remove('open');
}

function renderHeldBillsModal() {
  const tbody = document.getElementById('heldBillsTableBody');
  if (!tbody) return;
  const list = state.heldBills || [];

  if (list.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align:center;padding:2.2rem;color:var(--text-muted);">
          ຍັງບໍ່ມີລາຍການບິນທີ່ພັກໄວ້ໃນຂະນະນີ້
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = list.map((h, idx) => {
    const timeStr = new Date(h.date).toLocaleString('lo-LA', {
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
    });
    const fullItemsHtml = (h.items || []).map((i, itemIdx) => `
      <div style="display:flex;justify-content:space-between;gap:0.75rem;padding:0.2rem 0;border-bottom:1px dashed #fed7aa;">
        <span><strong>${itemIdx + 1}.</strong> ${i.name} <span style="color:var(--text-secondary);">(${Number(i.price || 0).toLocaleString()} × ${i.qty})</span></span>
        <strong style="color:#ea580c;white-space:nowrap;">${(Number(i.price || 0) * Number(i.qty || 1)).toLocaleString()} ກີບ</strong>
      </div>
    `).join('');
    return `
      <tr>
        <td style="text-align:center;font-weight:800;color:#ea580c;">${idx + 1}</td>
        <td style="text-align:center;white-space:nowrap;">
          <div style="display:flex;gap:0.4rem;justify-content:center;">
            <button type="button" class="btn btn-primary btn-sm" onclick="resumeHeldBill('${h.id}')">
              ▶️ ດຶງມາຂາຍຕໍ່
            </button>
            <button type="button" class="btn btn-danger btn-sm" onclick="deleteHeldBill('${h.id}')">
              🗑️ ລຶບ
            </button>
          </div>
        </td>
        <td style="white-space:nowrap;font-size:0.84rem;">🕒 ${timeStr}</td>
        <td>
          <div style="font-weight:700;color:var(--text-primary);">${h.customer}</div>
          <div style="font-size:0.8rem;color:var(--text-secondary);">${h.phone !== '-' ? `📞 ${h.phone}` : 'ບໍ່ໄດ້ລະບຸເບີໂທ'}</div>
        </td>
        <td style="min-width:290px;">
          <div style="display:flex;flex-direction:column;font-size:0.85rem;">
            ${fullItemsHtml}
          </div>
        </td>
        <td style="white-space:nowrap;font-size:0.84rem;">${getPaymentLabel(h.paymentMethod || 'cash')}</td>
        <td style="text-align:right;font-weight:900;font-size:0.98rem;color:#ea580c;font-variant-numeric:tabular-nums;white-space:nowrap;">
          ${formatLAK(h.total)}
        </td>
      </tr>
    `;
  }).join('');
}

function resumeHeldBill(heldId) {
  const idx = (state.heldBills || []).findIndex(h => h.id === heldId);
  if (idx === -1) return;

  if (cart.length > 0) {
    if (!confirm('ໃນໃບບິນປັດຈຸບັນມີລາຍການຄ້າງຢູ່ ຕ້ອງການແທນທີ່ດ້ວຍບິນທີ່ພັກໄວ້ແທ້ບໍ່?')) {
      return;
    }
  }

  const held = state.heldBills[idx];
  cart = (held.items || []).map(i => ({ ...i }));
  const nameEl = document.getElementById('posCustomerName');
  const phoneEl = document.getElementById('posCustomerPhone');
  if (nameEl) nameEl.value = held.customer === 'ລູກຄ້າທົ່ວໄປ' ? '' : (held.customer || '');
  if (phoneEl) phoneEl.value = held.phone === '-' ? '' : (held.phone || '');
  if (held.paymentMethod) selectPaymentMethod(held.paymentMethod);

  state.heldBills.splice(idx, 1);
  saveState();
  renderCart();
  closeHeldBillsModal();
  showPosScanFeedback(`▶️ ດຶງບິນຂອງ "${held.customer}" ກັບມາໃສ່ໜ້າໃບບິນແລ້ວ`);
}

function deleteHeldBill(heldId) {
  const held = (state.heldBills || []).find(h => h.id === heldId);
  if (!held) return;
  if (confirm(`ຕ້ອງການລຶບບິນທີ່ພັກໄວ້ຂອງ "${held.customer}" (${formatLAK(held.total)}) ແທ້ບໍ່?`)) {
    state.heldBills = state.heldBills.filter(h => h.id !== heldId);
    saveState();
    renderHeldBillsModal();
  }
}

function selectPaymentMethod(method, openQrPopup = false) {
  selectedPaymentMethod = method;
  document.querySelectorAll('.pay-method-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.method === method);
  });
  if (method === 'bcel' && openQrPopup) {
    openBcelQrPayModal();
  }
}

function openBcelQrPayModal() {
  const modal = document.getElementById('bcelQrPayModal');
  if (!modal) return;
  const { total } = getCartTotals();
  const totalEl = document.getElementById('bcelQrModalTotalText');
  if (totalEl) totalEl.textContent = formatLAK(total);

  const rcpt = {
    ...DEFAULT_RECEIPT_SETTINGS,
    ...(state.receiptSettings || {})
  };
  const qrImgEl = document.getElementById('bcelQrModalImg');
  if (qrImgEl) {
    qrImgEl.src = rcpt.qrImageData
      ? rcpt.qrImageData
      : `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(`DONLUANG_PHOTO|BCEL_ONE|${total}|LAK`)}`;
  }
  modal.classList.add('open');
}

function closeBcelQrPayModal() {
  document.getElementById('bcelQrPayModal')?.classList.remove('open');
}

async function handleQuickBcelQrUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const dataUrl = await compressImageFile(file, 450, 0.9);
    if (!state.receiptSettings) {
      state.receiptSettings = { ...DEFAULT_RECEIPT_SETTINGS };
    }
    state.receiptSettings.qrImageData = dataUrl;
    state.receiptSettings.showQrAlways = true;
    saveState();
    const qrImgEl = document.getElementById('bcelQrModalImg');
    if (qrImgEl) qrImgEl.src = dataUrl;
    updateReceiptQrPreview(dataUrl);
  } catch (err) {
    alert('ບໍ່ສາມາດອັບໂຫຼດຮູບ QR ໄດ້, ກະລຸນາລອງໃໝ່');
  }
  event.target.value = '';
}

function getCartTotals() {
  const subtotal = cart.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.qty || 0), 0);
  const discount = Math.max(0, Number(document.getElementById('posDiscountInput')?.value || 0));
  const total = Math.max(0, subtotal - discount);
  return { subtotal, discount, total };
}

function renderCart() {
  const container = document.getElementById('posCartItems');
  if (!container) return;

  const totalItemsCount = cart.reduce((s, item) => s + Number(item.qty || 0), 0);
  const countBadge = document.getElementById('posTicketCountBadge');
  if (countBadge) countBadge.textContent = `${totalItemsCount} ລາຍການ`;

  if (cart.length === 0) {
    container.innerHTML = `
      <div class="cart-empty">
        <div style="font-size:2.2rem;margin-bottom:0.35rem;opacity:0.65;">🧾</div>
        <div style="font-weight:700;color:#475569;font-size:0.88rem;margin-bottom:0.2rem;">ຍັງບໍ່ມີລາຍການໃນບິນ</div>
        <small style="color:#94a3b8;font-size:0.76rem;">ສະແກນບາໂຄ້ດ ຫຼື ເລືອກສິນຄ້າທາງຊ້າຍ</small>
      </div>
    `;
  } else {
    container.innerHTML = cart.map((item, idx) => `
      <div class="cart-item">
        <div class="cart-item-index">${idx + 1}.</div>
        <div class="cart-item-info">
          <div class="cart-item-title">${item.name}</div>
          ${item.activeTier ? `
            <div style="font-size:0.75rem;color:#16a34a;font-weight:700;display:flex;align-items:center;gap:0.25rem;margin-top:2px;">
              <span>🏷️ ລາຄາຂາຍສົ່ງ (≥${item.activeTier.minQty} ${item.unit || 'ອັນ'}: ${formatLAK(item.price)})</span>
            </div>
          ` : `
            <div style="font-size:0.74rem;color:#64748b;margin-top:1px;">
              ${formatLAK(item.price)} / ${item.unit || 'ອັນ'}
            </div>
          `}
        </div>
        <div class="qty-controls">
          <input type="number" class="qty-input" value="${item.qty}" min="1" step="1" onchange="updateCartQty('${item.id}', this.value, true)">
        </div>
        <div id="cartLineTotal_${item.id}" class="cart-right-price-wrap" onclick="focusCartPriceInput('${item.id}')" title="ຄລິກເພື່ອແກ້ໄຂລາຄາ">
          <input
            type="text"
            inputmode="numeric"
            id="cartLinePriceInput_${item.id}"
            class="cart-right-price-input"
            value="${Math.round(item.price * item.qty).toLocaleString()}"
            onfocus="handleCartPriceFocus('${item.id}', this)"
            onblur="handleCartPriceBlur('${item.id}', this)"
            oninput="updateCartItemPrice('${item.id}', this.value)"
            onkeydown="if(event.key==='Enter') this.blur()"
          />
          <span class="cart-right-currency">ກີບ</span>
        </div>
        <button class="cart-remove" onclick="removeFromCart('${item.id}')" title="ລຶບ">✕</button>
      </div>
    `).join('');
  }

  const { subtotal, total } = getCartTotals();
  const subEl = document.getElementById('posSubtotalText');
  const totEl = document.getElementById('posTotalText');
  const bcelQrTotEl = document.getElementById('bcelQrModalTotalText');
  if (subEl) subEl.textContent = formatLAK(subtotal);
  if (totEl) totEl.textContent = formatLAK(total);
  if (bcelQrTotEl) bcelQrTotEl.textContent = formatLAK(total);

  // Mobile Floating Cart Bar update
  const mobBar = document.getElementById('posMobileCartBar');
  const mobCount = document.getElementById('posMobileCartCount');
  const mobTot = document.getElementById('posMobileCartTotal');
  if (mobCount) mobCount.textContent = `${totalItemsCount} ລາຍການ`;
  if (mobTot) mobTot.textContent = formatLAK(total);
  if (mobBar) {
    mobBar.classList.toggle('has-items', totalItemsCount > 0);
  }
}

function scrollToPosTicket() {
  const el = document.getElementById('posTicketPanel');
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

let pendingCustomerPopupOptions = { print: true };

function openCustomerPopupModal(options = { print: true }) {
  if (cart.length === 0) {
    alert('ກະລຸນາເລືອກສິນຄ້າ ຫຼື ບໍລິການໃສ່ບິນກ່ອນ!');
    return;
  }
  pendingCustomerPopupOptions = options;
  const modal = document.getElementById('printCustomerPopupModal');
  const nameInput = document.getElementById('popupCustomerNameInput');
  const phoneInput = document.getElementById('popupCustomerPhoneInput');
  const confirmBtn = document.getElementById('popupCustomerConfirmBtn');

  const curName = document.getElementById('posCustomerName')?.value.trim() || '';
  const curPhone = document.getElementById('posCustomerPhone')?.value.trim() || '';

  if (nameInput) nameInput.value = curName;
  if (phoneInput) phoneInput.value = curPhone;
  if (confirmBtn) {
    confirmBtn.innerHTML = options.print ? '🖨️ ພິມບິນ' : '✅ ຢືນຢັນອອກບິນ';
  }

  if (modal) {
    modal.classList.add('open');
    setTimeout(() => {
      if (nameInput) nameInput.focus();
    }, 80);
  }
}

function closeCustomerPopupModal() {
  document.getElementById('printCustomerPopupModal')?.classList.remove('open');
}

function confirmCustomerPopupAndCheckout(event) {
  if (event) event.preventDefault();
  const nameInput = document.getElementById('popupCustomerNameInput');
  const phoneInput = document.getElementById('popupCustomerPhoneInput');
  const enteredName = nameInput?.value.trim() || '';
  const enteredPhone = phoneInput?.value.trim() || '';

  if (selectedPaymentMethod === 'credit' && !enteredName) {
    alert('ກໍລະນີ "ຕິດໜີ້" ກະລຸນາລະບຸຊື່ລູກຄ້າ ຫຼື ຊື່ຫ້ອງການ/ພະແນກການ ກ່ອນອອກບິນ!');
    if (nameInput) nameInput.focus();
    return;
  }

  const posNameEl = document.getElementById('posCustomerName');
  const posPhoneEl = document.getElementById('posCustomerPhone');
  if (posNameEl) posNameEl.value = enteredName;
  if (posPhoneEl) posPhoneEl.value = enteredPhone;

  closeCustomerPopupModal();
  processCheckout(pendingCustomerPopupOptions);
}

function processCheckout(options = { print: false }) {
  if (cart.length === 0) {
    alert('ກະລຸນາເລືອກສິນຄ້າ ຫຼື ບໍລິການໃສ່ບິນກ່ອນ!');
    return null;
  }

  const customerName = document.getElementById('posCustomerName')?.value.trim() || 'ລູກຄ້າທົ່ວໄປ';
  const customerPhone = document.getElementById('posCustomerPhone')?.value.trim() || '-';

  if (selectedPaymentMethod === 'credit' && customerName === 'ລູກຄ້າທົ່ວໄປ') {
    openCustomerPopupModal(options);
    return null;
  }

  const { subtotal, discount, total } = getCartTotals();
  const now = new Date();
  const datePart = now.toISOString().slice(2, 10).replace(/-/g, '');
  const seq = String(state.bills.length + 1).padStart(3, '0');
  const billId = `DL-${datePart}-${seq}`;

  // Deduct stock for tracked items
  cart.forEach(item => {
    const prodId = item.baseProductId || item.id;
    const prod = state.products.find(p => p.id === prodId);
    if (prod && prod.trackStock) {
      const deductAmt = (item.deductPerQty !== undefined ? item.deductPerQty : 1) * item.qty;
      prod.stock = Math.max(0, Math.round((prod.stock - deductAmt) * 100) / 100);
    }
  });

  const newBill = {
    id: billId,
    date: now.toISOString(),
    customer: customerName,
    phone: customerPhone,
    items: cart.map(i => ({ ...i })),
    subtotal,
    discount,
    total,
    paymentMethod: selectedPaymentMethod,
    status: selectedPaymentMethod === 'credit' ? 'unpaid' : 'paid'
  };

  state.bills.unshift(newBill);
  saveState();
  renderPOSProducts();
  renderSalesHistory();
  renderSummaryPage();
  clearCart();

  if (options.print) {
    openReceiptModal(newBill);
  } else {
    showPosScanFeedback(`✅ ຮັບເງິນ ແລະ ບັນທຶກບິນ "${newBill.id}" (${formatLAK(total)}) ສຳເລັດແລ້ວ!`);
  }

  return newBill;
}

function checkoutReceiveOnly() {
  processCheckout({ print: false });
}

function checkoutAndPrint() {
  openCustomerPopupModal({ print: true });
}

function openReceiptModal(bill) {
  currentReceiptBill = bill;
  const rcpt = {
    ...DEFAULT_RECEIPT_SETTINGS,
    ...(state.receiptSettings || {})
  };

  const dateStr = new Date(bill.date).toLocaleString('lo-LA', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  });

  const shouldShowQr = Boolean(rcpt.qrImageData) || Boolean(rcpt.showQrAlways) || bill.paymentMethod === 'bcel' || bill.paymentMethod === 'credit';
  const qrImgSrc = rcpt.qrImageData
    ? rcpt.qrImageData
    : `https://api.qrserver.com/v1/create-qr-code/?size=130x130&data=${encodeURIComponent(`DONLUANG_PHOTO|${bill.id}|${bill.total}|LAK`)}`;

  const qrSection = shouldShowQr ? `
    <div class="receipt-qr-box">
      <div style="font-weight:700;font-size:0.78rem;margin-bottom:0.25rem;color:#dc2626;">BCEL One QR ຊຳລະເງິນ</div>
      <img src="${qrImgSrc}" alt="BCEL QR" style="width:120px;height:120px;object-fit:contain;margin:0 auto;display:block;" />
      <div style="font-size:0.72rem;margin-top:0.2rem;">ຮ້ານຂາຍຜັກສົດ • ຍອດ ${formatLAK(bill.total)}</div>
    </div>
  ` : '';

  const thankYouHtml = String(rcpt.thankYouText || DEFAULT_RECEIPT_SETTINGS.thankYouText)
    .split('\n')
    .map(line => line.trim())
    .join('<br>');

  const html = `
    <div class="receipt-center">
      <div style="font-size:1.8rem;margin-bottom:0.15rem;">🥬</div>
      <div class="receipt-shop-name">ຮ້ານຂາຍຜັກສົດ</div>
      <div>ຜັກສົດ • ຊີ້ນ • ປາ • ໄຂ່ • ອາຫານແຫ້ງ</div>
      <div style="font-size:0.75rem;">ໂທ / WhatsApp: ${rcpt.shopPhone || DEFAULT_RECEIPT_SETTINGS.shopPhone}</div>
    </div>
    <div class="receipt-divider"></div>
    <div><strong>ວັນທີ:</strong> ${dateStr}</div>
    <div><strong>ລູກຄ້າ:</strong> ${bill.customer} ${bill.phone !== '-' ? `(${bill.phone})` : ''}</div>
    <div><strong>ຊຳລະຜ່ານ:</strong> ${getPaymentLabel(bill.paymentMethod)}</div>
    <div class="receipt-divider"></div>
    <div>
      ${bill.items.map((item, idx) => `
        <div class="receipt-item-row" style="align-items:flex-start;padding:0.28rem 0;border-bottom:1px dashed #cbd5e1;">
          <div style="flex:1;min-width:0;padding-right:0.4rem;">
            <div style="font-weight:700;color:#000000;line-height:1.35;font-size:0.86rem;">
              <span style="display:inline-block;min-width:18px;font-weight:900;color:#000000;">${idx + 1}.</span>
              <span>${item.name}</span>
            </div>
            <div style="font-size:0.75rem;color:#475569;margin-left:1.15rem;margin-top:0.1rem;">
              ${item.qty} ${item.unit || ''} × ${Number(item.price || 0).toLocaleString()} ກີບ
            </div>
          </div>
          <strong style="font-size:0.95rem;font-weight:800;color:#000000;font-variant-numeric:tabular-nums;white-space:nowrap;padding-top:0.05rem;">
            ${(item.price * item.qty).toLocaleString()}
          </strong>
        </div>
      `).join('')}
    </div>
    <div class="receipt-divider"></div>
    <div class="receipt-item-row">
      <span>ລວມເປັນເງິນ:</span>
      <span>${formatLAK(bill.subtotal)}</span>
    </div>
    ${bill.discount > 0 ? `
      <div class="receipt-item-row">
        <span>ສ່ວນຫຼຸດ:</span>
        <span>-${formatLAK(bill.discount)}</span>
      </div>
    ` : ''}
    <div class="receipt-item-row" style="font-size:1rem;font-weight:800;margin-top:0.25rem;">
      <span>ຍອດສຸດທິ:</span>
      <span>${formatLAK(bill.total)}</span>
    </div>
    ${qrSection}
    <div class="receipt-divider"></div>
    <div class="receipt-center" style="font-size:0.75rem;">
      ${thankYouHtml}
    </div>
  `;

  document.getElementById('receiptContent').innerHTML = html;
  document.getElementById('receiptModal').classList.add('open');
}

function closeReceiptModal() {
  document.getElementById('receiptModal').classList.remove('open');
}

function updateReceiptQrPreview(dataUrl) {
  const imgEl = document.getElementById('rcptQrPreviewImg');
  const placeEl = document.getElementById('rcptQrPlaceholder');
  const hiddenEl = document.getElementById('rcptQrDataInput');
  if (hiddenEl) hiddenEl.value = dataUrl || '';
  if (dataUrl) {
    if (imgEl) {
      imgEl.src = dataUrl;
      imgEl.style.display = 'block';
    }
    if (placeEl) placeEl.style.display = 'none';
  } else {
    if (imgEl) {
      imgEl.src = '';
      imgEl.style.display = 'none';
    }
    if (placeEl) placeEl.style.display = 'block';
  }
}

function openReceiptSettingsModal() {
  const rcpt = {
    ...DEFAULT_RECEIPT_SETTINGS,
    ...(state.receiptSettings || {})
  };
  const phoneEl = document.getElementById('rcptPhoneInput');
  const thankEl = document.getElementById('rcptThankYouInput');
  const alwaysEl = document.getElementById('rcptShowQrAlwaysInput');
  if (phoneEl) phoneEl.value = rcpt.shopPhone || DEFAULT_RECEIPT_SETTINGS.shopPhone;
  if (thankEl) thankEl.value = rcpt.thankYouText || DEFAULT_RECEIPT_SETTINGS.thankYouText;
  if (alwaysEl) alwaysEl.checked = Boolean(rcpt.showQrAlways);
  updateReceiptQrPreview(rcpt.qrImageData || '');
  document.getElementById('receiptSettingsModal')?.classList.add('open');
}

function closeReceiptSettingsModal() {
  document.getElementById('receiptSettingsModal')?.classList.remove('open');
}

async function handleReceiptQrImageUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const dataUrl = await compressImageFile(file, 400, 0.9);
    updateReceiptQrPreview(dataUrl);
    const alwaysEl = document.getElementById('rcptShowQrAlwaysInput');
    if (alwaysEl) alwaysEl.checked = true;
  } catch (err) {
    console.error('Failed to load QR code image:', err);
    alert('ເກີດຂໍ້ຜິດພາດໃນການອັບໂຫຼດຮູບ QR Code, ກະລຸນາລອງໃໝ່');
  }
  event.target.value = '';
}

function clearReceiptQrImage() {
  updateReceiptQrPreview('');
}

function saveReceiptSettingsForm(e) {
  e.preventDefault();
  const shopPhone = (document.getElementById('rcptPhoneInput')?.value || '').trim() || DEFAULT_RECEIPT_SETTINGS.shopPhone;
  const qrImageData = document.getElementById('rcptQrDataInput')?.value || '';
  const showQrAlways = Boolean(document.getElementById('rcptShowQrAlwaysInput')?.checked);
  const thankYouText = (document.getElementById('rcptThankYouInput')?.value || '').trim() || DEFAULT_RECEIPT_SETTINGS.thankYouText;

  state.receiptSettings = {
    shopPhone,
    qrImageData,
    showQrAlways,
    thankYouText
  };
  saveState();
  closeReceiptSettingsModal();
  if (currentReceiptBill) {
    openReceiptModal(currentReceiptBill);
  }
}

// ==========================================
// 2. PRODUCT & SERVICE CATALOG MODULE
// ==========================================
function renderCatalogTable() {
  const query = (document.getElementById('catalogSearchInput')?.value || '').trim().toLowerCase();
  const catFilter = document.getElementById('catalogCategoryFilter')?.value || 'all';
  const tbody = document.getElementById('catalogTableBody');
  if (!tbody) return;

  const filtered = state.products
    .filter(p => {
      if (currentCatalogSectionMode === 'services') {
        if (p.category !== 'service') return false;
      } else if (currentCatalogSectionMode === 'products') {
        if (p.category === 'service') return false;
      }

      const matchCat = catFilter === 'all' || p.category === catFilter;
      const matchQuery = !query || p.name.toLowerCase().includes(query) || p.code.toLowerCase().includes(query);
      return matchCat && matchQuery;
    })
    // ຈັດລຽງສິນຄ້າທີ່ມີຍອດສະຕັອກເຫຼືອໜ້ອຍໃຫ້ຂຶ້ນເທິງກ່ອນ, ສ່ວນສິນຄ້າເຫຼືອຫຼາຍ ແລະ ບໍລິການຢູ່ລຸ່ມ
    .sort((a, b) => {
      const aTrack = a.trackStock !== false;
      const bTrack = b.trackStock !== false;
      // 1. ສິນຄ້າທີ່ມີການຕິດຕາມສະຕັອກ: ຍອດເຫຼືອໜ້ອຍຂຶ້ນກ່ອນ (Ascending)
      if (aTrack && bTrack) {
        const stockDiff = Number(a.stock || 0) - Number(b.stock || 0);
        if (stockDiff !== 0) return stockDiff;
        return compareProductCode(a, b);
      }
      // 2. ສິນຄ້າທີ່ມີສະຕັອກໃຫ້ສະແດງກ່ອນບໍລິການທີ່ບໍ່ຕັດສາງ
      if (aTrack && !bTrack) return -1;
      if (!aTrack && bTrack) return 1;
      // 3. ງານບໍລິການທີ່ບໍ່ຕັດສາງທັງຄູ່: ຈັດລຽງຕາມລະຫັດສິນຄ້າ
      return compareProductCode(a, b);
    });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:2rem;color:var(--text-muted);">ບໍ່ພົບລາຍການສິນຄ້າໃນໝວດທີ່ເລືອກ</td></tr>`;
  } else {
    tbody.innerHTML = filtered.map(p => {
      const profit = p.price - p.cost;
      const isLow = p.trackStock && p.stock <= p.minStock;
      const imgSrc = getProductImageSrc(p);
      return `
        <tr
          class="catalog-row-item"
          onclick="handleProductRowClick('${p.id}', event)"
          oncontextmenu="event.preventDefault(); openProductActionMenu('${p.id}', event);"
        >
          <td style="text-align:center;width:60px;">
            <div style="position:relative;width:46px;height:46px;margin:0 auto;cursor:pointer;" onclick="triggerQuickImageUpload(event, '${p.id}')" title="ກົດເພື່ອປ່ຽນຮູບສິນຄ້າ">
              <img src="${imgSrc}" alt="${escapeHtml(p.name)}" style="width:46px;height:46px;object-fit:cover;border-radius:8px;border:1.5px solid #fdba74;" />
              <span style="position:absolute;bottom:-3px;right:-3px;background:#f97316;color:#fff;font-size:0.6rem;padding:1px 3px;border-radius:4px;">📷</span>
            </div>
          </td>
          <td class="win-only-col"><strong>${escapeHtml(p.code)}</strong></td>
          <td>
            <div style="font-weight:700;cursor:pointer;" onclick="openProductActionMenu('${p.id}', event)">${escapeHtml(p.name)}</div>
            ${p.hasSubUnit && p.subUnit ? `
              <div style="font-size:0.76rem;color:#0284c7;font-weight:700;margin-top:2px;">
                📦 1 ${escapeHtml(p.unit)} = ${p.subRatio} ${escapeHtml(p.subUnit)} (ຂາຍຍ່ອຍ: ${formatLAK(p.subPrice || Math.round(p.price / p.subRatio))}/${escapeHtml(p.subUnit)})
              </div>
            ` : ''}
            ${p.isUnpaid ? `
              <div style="margin-top:3px;display:flex;align-items:center;gap:0.3rem;flex-wrap:wrap;">
                <span style="background:#fee2e2;color:#b91c1c;padding:0.12rem 0.5rem;border-radius:999px;font-size:0.72rem;font-weight:800;border:1px solid #fca5a5;" title="ສິນຄ້າຊື້ເຂົ້າຍັງຄ້າງຈ່າຍ">
                  ⏳ ຄ້າງຈ່າຍ: ${formatLAK(p.unpaidAmount || (p.cost * (p.trackStock ? Math.max(1, p.stock) : 1)))}
                </span>
                ${p.supplier ? `<span style="font-size:0.72rem;color:#7f1d1d;font-weight:600;">(${escapeHtml(p.supplier)})</span>` : ''}
              </div>
            ` : ''}
          </td>
          <td class="win-only-col"><span class="cat-tag">${getCategoryLabel(p.category)}</span></td>
          <td class="win-only-col" style="font-variant-numeric:tabular-nums;">${formatLAK(p.cost)}</td>
          <td style="text-align:right;font-variant-numeric:tabular-nums;font-weight:700;color:var(--primary);white-space:nowrap;">
            ${formatLAK(p.price)}
            ${p.hasTieredPricing && Array.isArray(p.priceTiers) && p.priceTiers.length > 0 ? `
              <div style="font-size:0.73rem;color:#16a34a;font-weight:700;margin-top:3px;line-height:1.3;" title="ລາຄາຂາຍສົ່ງຕາມຈຳນວນ">
                🏷️ ${p.priceTiers.map(t => `≥${t.minQty}: ${formatLAK(t.price)}`).join(' | ')}
              </div>
            ` : ''}
          </td>
          <td class="win-only-col" style="font-variant-numeric:tabular-nums;color:var(--success);font-weight:600;">+${formatLAK(profit)}</td>
          <td style="text-align:center;">
            ${p.trackStock ? `
              <span class="status-pill ${isLow ? 'status-broken' : 'status-normal'}">
                ${isLow ? '⚠️ ' : '📦 '}${formatProductStock(p)}
              </span>
            ` : `<span style="color:var(--text-muted);font-size:0.8rem;">ບໍລິການ</span>`}
          </td>
          <td class="win-only-col" style="text-align:center;white-space:nowrap;" onclick="event.stopPropagation()">
            <div style="display:flex;gap:0.35rem;flex-wrap:wrap;justify-content:center;">
              <button type="button" class="btn btn-sm btn-outline" style="border-color:#6366f1;color:#4338ca;background:#eef2ff;font-weight:700;" onclick="openBarcodeStudioModal('${p.id}')" title="ສ້າງ ແລະ ພິມບາໂຄ້ດ">🏷️ ບາໂຄ້ດ</button>
              ${p.trackStock ? `<button type="button" class="btn btn-sm" style="background:#ea580c;color:#ffffff;border:none;font-weight:700;box-shadow:0 1px 3px rgba(234,88,12,0.3);white-space:nowrap;" onclick="openReorderModal('${p.id}')" title="ສັ່ງເພີ່ມສິນຄ້າເຂົ້າແຜນຈັດຊື້">📦 ສັ່ງເພີ່ມ</button>` : ''}
              <button type="button" class="btn btn-outline btn-sm" onclick="openProductModal('${p.id}')">✏️ ແກ້ໄຂ</button>
              <button type="button" class="btn btn-danger btn-sm" onclick="deleteProduct('${p.id}')">🗑️ ລຶບ</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  const totalCost = filtered.reduce((sum, p) => sum + Number(p.cost || 0), 0);
  const totalPrice = filtered.reduce((sum, p) => sum + Number(p.price || 0), 0);
  const totalProfit = totalPrice - totalCost;

  const summaryCostEl = document.getElementById('catalogSummaryCost');
  const summaryPriceEl = document.getElementById('catalogSummaryPrice');
  const summaryProfitEl = document.getElementById('catalogSummaryProfit');
  const summaryCountEl = document.getElementById('catalogSummaryItemCount');

  const costStr = formatLAK(totalCost);
  const priceStr = formatLAK(totalPrice);
  const profitStr = `${totalProfit >= 0 ? '+' : ''}${formatLAK(totalProfit)}`;
  const countStr = `${filtered.length} ລາຍການ`;

  const headerBadge = document.getElementById('catalogCountBadge');
  if (headerBadge) headerBadge.textContent = countStr;

  if (summaryCostEl) summaryCostEl.textContent = costStr;
  if (summaryPriceEl) summaryPriceEl.textContent = priceStr;
  if (summaryProfitEl) summaryProfitEl.textContent = profitStr;
  if (summaryCountEl) summaryCountEl.textContent = countStr;

  updateCatalogCategoryOptionCounts();
}

function updateCatalogCategoryOptionCounts() {
  const sel = document.getElementById('catalogCategoryFilter');
  if (!sel) return;
  const labels = {
    all: `ທຸກໝວດສິນຄ້າ`,
    service: `📸 ບໍລິການ`,
    paper: `📄 ເຈ້ຍ A4 & ເຈ້ຍໂຟໂຕ້`,
    ink: `🖨️ ໝຶກ & ແກນໝຶກ`,
    stationery: `📎 ເຄື່ອງຂຽນ`,
  };
  Array.from(sel.options).forEach(opt => {
    if (labels[opt.value]) opt.textContent = labels[opt.value];
  });
}

async function handleModalProductImageChange(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const dataUrl = await compressImageFile(file);
    const hidden = document.getElementById('prodImageDataInput');
    const preview = document.getElementById('prodModalImagePreview');
    const removeBtn = document.getElementById('btnRemoveProdImg');
    if (hidden) hidden.value = dataUrl;
    if (preview) {
      preview.src = dataUrl;
      preview.style.display = 'block';
    }
    if (removeBtn) removeBtn.style.display = 'block';
  } catch (err) {
    alert('ບໍ່ສາມາດອ່ານໄຟລ໌ຮູບພາບໄດ້!');
  }
}

function clearModalProductImage() {
  const hidden = document.getElementById('prodImageDataInput');
  const preview = document.getElementById('prodModalImagePreview');
  const fileInput = document.getElementById('prodImageFileInput');
  const removeBtn = document.getElementById('btnRemoveProdImg');
  if (hidden) hidden.value = '';
  if (fileInput) fileInput.value = '';
  if (preview) {
    preview.src = '';
    preview.style.display = 'none';
  }
  if (removeBtn) removeBtn.style.display = 'none';
}

function openReorderModal(productId) {
  const p = state.products.find(x => x.id === productId);
  if (!p) return;

  const modal = document.getElementById('reorderModal');
  if (!modal) return;

  document.getElementById('reorderProductId').value = p.id;
  const imgEl = document.getElementById('reorderProductImg');
  if (imgEl) imgEl.src = getProductImageSrc(p);

  const nameEl = document.getElementById('reorderProductName');
  if (nameEl) nameEl.textContent = p.name;

  const codeEl = document.getElementById('reorderProductCode');
  if (codeEl) codeEl.textContent = p.code;

  const stockEl = document.getElementById('reorderProductStock');
  if (stockEl) stockEl.textContent = formatProductStock(p);

  const unitEl = document.getElementById('reorderUnitLabel');
  if (unitEl) unitEl.textContent = p.unit || 'ໜ່ວຍ';

  const defaultQty = p.minStock ? Math.max(1, p.minStock * 2) : 10;
  const qtyInput = document.getElementById('reorderQtyInput');
  if (qtyInput) qtyInput.value = defaultQty;

  const costInput = document.getElementById('reorderCostInput');
  if (costInput) costInput.value = p.cost || 0;

  const oldCostEl = document.getElementById('reorderOldCostLabel');
  if (oldCostEl) oldCostEl.textContent = formatLAK(p.cost || 0);

  const priceInput = document.getElementById('reorderPriceInput');
  if (priceInput) priceInput.value = p.price || 0;

  const oldPriceEl = document.getElementById('reorderOldPriceLabel');
  if (oldPriceEl) oldPriceEl.textContent = formatLAK(p.price || 0);

  updateReorderModalPreviewTotal();
  modal.classList.add('open');
}

function closeReorderModal() {
  document.getElementById('reorderModal')?.classList.remove('open');
}

function updateReorderModalPreviewTotal() {
  const qty = Math.max(1, Number(document.getElementById('reorderQtyInput')?.value || 1));
  const cost = Math.max(0, Number(document.getElementById('reorderCostInput')?.value || 0));
  const totalEl = document.getElementById('reorderTotalPreview');
  if (totalEl) totalEl.textContent = formatLAK(qty * cost);
}

function saveReorderModalForm(event) {
  event.preventDefault();
  const prodId = document.getElementById('reorderProductId').value;
  const p = state.products.find(x => x.id === prodId);
  if (!p) return;

  const qty = Math.max(1, parseInt(document.getElementById('reorderQtyInput').value || '1', 10));
  const newCost = Math.max(0, Number(document.getElementById('reorderCostInput').value || 0));
  const newPrice = Math.max(0, Number(document.getElementById('reorderPriceInput').value || 0));

  if (!state.purchasePlan) state.purchasePlan = [];
  state.purchasePlan.push({
    id: 'PP-' + Date.now(),
    productId: p.id,
    code: p.code,
    name: p.name,
    unit: p.unit || '',
    price: newCost,
    sellingPrice: newPrice,
    qty: qty,
    purchased: false,
    createdAt: new Date().toISOString()
  });

  saveState();
  closeReorderModal();
  renderPurchasePlanPage();
}

function quickRestock(productId) {
  const prod = state.products.find(p => p.id === productId);
  if (!prod) return;
  const qtyStr = prompt(`ເຕີມສະຕັອກ "${prod.name}" (ປັດຈຸບັນມີ ${prod.stock} ${prod.unit})\nກະລຸນາໃສ່ຈຳນວນທີ່ຕ້ອງການເພີ່ມ:`, '10');
  if (qtyStr === null) return;
  const addQty = parseInt(qtyStr, 10);
  if (!isNaN(addQty) && addQty > 0) {
    prod.stock += addQty;
    saveState();
    renderCatalogTable();
    renderPOSProducts();
  }
}

function generateAutoProductCode() {
  const existingCodes = new Set((state.products || []).map(p => String(p.code || '').trim()));
  let maxNum = 1000;
  (state.products || []).forEach(p => {
    const raw = String(p.code || '').trim();
    const num = parseInt(raw.replace(/\D/g, ''), 10);
    if (!isNaN(num) && num >= 1000 && num < 100000000) {
      if (num > maxNum) maxNum = num;
    }
  });
  let nextNum = maxNum + 1;
  while (existingCodes.has(String(nextNum))) {
    nextNum++;
  }
  return String(nextNum);
}

function openProductModal(productId = null) {
  const modal = document.getElementById('productModal');
  const title = document.getElementById('productModalTitle');
  const hiddenImg = document.getElementById('prodImageDataInput');
  const previewImg = document.getElementById('prodModalImagePreview');
  const removeImgBtn = document.getElementById('btnRemoveProdImg');
  const fileInput = document.getElementById('prodImageFileInput');
  const codeGroup = document.getElementById('prodCodeFormGroup');
  const catGroup = document.getElementById('prodCategoryFormGroup');
  if (fileInput) fileInput.value = '';

  renderAllCategorySelects();

  if (productId) {
    const p = state.products.find(x => x.id === productId);
    if (!p) return;
    if (title) title.textContent = 'ແກ້ໄຂສິນຄ້າ';
    if (codeGroup) codeGroup.style.display = 'block';
    if (catGroup) catGroup.classList.remove('full');

    document.getElementById('prodIdInput').value = p.id;
    document.getElementById('prodCodeInput').value = p.code;
    document.getElementById('prodNameInput').value = p.name;
    document.getElementById('prodCategoryInput').value = p.category;
    document.getElementById('prodCostInput').value = p.cost;
    document.getElementById('prodPriceInput').value = p.price;
    document.getElementById('prodUnitInput').value = p.unit;
    document.getElementById('prodTrackStockInput').checked = p.trackStock;
    document.getElementById('prodStockInput').value = p.stock;
    document.getElementById('prodMinStockInput').value = p.minStock;

    const hasSubChk = document.getElementById('prodHasSubUnitInput');
    if (hasSubChk) hasSubChk.checked = !!p.hasSubUnit;
    document.getElementById('prodSubUnitInput').value = p.subUnit || '';
    document.getElementById('prodSubRatioInput').value = p.subRatio || '';
    document.getElementById('prodSubPriceInput').value = p.subPrice || '';
    document.getElementById('prodSubCostInput').value = p.subCost || '';
    toggleSubUnitFields();

    const unpaidChk = document.getElementById('prodIsUnpaidInput');
    if (unpaidChk) unpaidChk.checked = !!p.isUnpaid;
    const unpaidAmt = document.getElementById('prodUnpaidAmountInput');
    if (unpaidAmt) unpaidAmt.value = (p.unpaidAmount !== undefined && p.unpaidAmount !== null && p.unpaidAmount > 0) ? p.unpaidAmount : '';
    const supplierInput = document.getElementById('prodSupplierInput');
    if (supplierInput) supplierInput.value = p.supplier || '';
    toggleProdUnpaidFields();

    const tieredChk = document.getElementById('prodHasTieredPriceInput');
    if (tieredChk) tieredChk.checked = !!p.hasTieredPricing;
    renderPriceTierRows(p.priceTiers || []);
    toggleTieredPriceFields();
    updateTieredPriceBaseHelper();

    if (hiddenImg) hiddenImg.value = p.image || '';
    if (previewImg) {
      if (p.image && p.image.trim()) {
        previewImg.src = p.image;
        previewImg.style.display = 'block';
        if (removeImgBtn) removeImgBtn.style.display = 'block';
      } else {
        previewImg.src = '';
        previewImg.style.display = 'none';
        if (removeImgBtn) removeImgBtn.style.display = 'none';
      }
    }
  } else {
    if (title) title.textContent = 'ເພີ່ມສິນຄ້າ';
    if (codeGroup) codeGroup.style.display = 'none';
    if (catGroup) catGroup.classList.add('full');

    document.getElementById('prodIdInput').value = '';
    document.getElementById('prodCodeInput').value = generateAutoProductCode();
    document.getElementById('prodNameInput').value = '';

    const defaultProdCat = (state.categories || []).find(c => c.id !== 'service')?.id || (state.categories && state.categories[0]?.id) || 'veggie';
    document.getElementById('prodCategoryInput').value = defaultProdCat;
    document.getElementById('prodTrackStockInput').checked = true;

    document.getElementById('prodCostInput').value = '';
    document.getElementById('prodPriceInput').value = '';
    document.getElementById('prodUnitInput').value = 'ມັດ';
    document.getElementById('prodStockInput').value = '10';
    document.getElementById('prodMinStockInput').value = '5';

    const hasSubChk = document.getElementById('prodHasSubUnitInput');
    if (hasSubChk) hasSubChk.checked = false;
    document.getElementById('prodSubUnitInput').value = '';
    document.getElementById('prodSubRatioInput').value = '';
    document.getElementById('prodSubPriceInput').value = '';
    document.getElementById('prodSubCostInput').value = '';
    toggleSubUnitFields();

    const unpaidChk = document.getElementById('prodIsUnpaidInput');
    if (unpaidChk) unpaidChk.checked = false;
    const unpaidAmt = document.getElementById('prodUnpaidAmountInput');
    if (unpaidAmt) unpaidAmt.value = '';
    const supplierInput = document.getElementById('prodSupplierInput');
    if (supplierInput) supplierInput.value = '';
    toggleProdUnpaidFields();

    const tieredChk = document.getElementById('prodHasTieredPriceInput');
    if (tieredChk) tieredChk.checked = false;
    renderPriceTierRows([]);
    toggleTieredPriceFields();
    updateTieredPriceBaseHelper();

    if (hiddenImg) hiddenImg.value = '';
    if (previewImg) {
      previewImg.src = '';
      previewImg.style.display = 'none';
    }
    if (removeImgBtn) removeImgBtn.style.display = 'none';
  }
  modal.classList.add('open');
}

function closeProductModal() {
  document.getElementById('productModal').classList.remove('open');
}

function saveProductForm(e) {
  e.preventDefault();
  const id = document.getElementById('prodIdInput').value;
  const imageVal = document.getElementById('prodImageDataInput')?.value || '';

  const hasSub = document.getElementById('prodHasSubUnitInput')?.checked || false;
  const subUnit = (document.getElementById('prodSubUnitInput')?.value || '').trim();
  const subRatio = Number(document.getElementById('prodSubRatioInput')?.value || 0);
  const subPrice = Number(document.getElementById('prodSubPriceInput')?.value || 0);
  const subCost = Number(document.getElementById('prodSubCostInput')?.value || 0);

  const isUnpaid = document.getElementById('prodIsUnpaidInput')?.checked || false;
  const unpaidAmtVal = document.getElementById('prodUnpaidAmountInput')?.value;
  const supplierVal = (document.getElementById('prodSupplierInput')?.value || '').trim();

  const hasTiered = document.getElementById('prodHasTieredPriceInput')?.checked || false;
  const priceTiers = [];
  if (hasTiered) {
    const tierRows = document.querySelectorAll('#priceTiersListContainer .price-tier-row');
    tierRows.forEach(row => {
      const qInput = row.querySelector('.tier-qty');
      const pInput = row.querySelector('.tier-price');
      const minQty = parseInt(qInput?.value, 10);
      const price = Number(pInput?.value || 0);
      if (!isNaN(minQty) && minQty > 1 && price > 0) {
        priceTiers.push({ minQty, price });
      }
    });
    priceTiers.sort((a, b) => a.minQty - b.minQty);
  }

  const cost = Number(document.getElementById('prodCostInput').value || 0);
  const stock = Number(document.getElementById('prodStockInput').value || 0);
  const defaultUnpaid = cost * (stock > 0 ? stock : 1);
  const finalUnpaidAmount = isUnpaid
    ? (unpaidAmtVal !== '' && unpaidAmtVal !== null && !isNaN(Number(unpaidAmtVal)) && Number(unpaidAmtVal) > 0 ? Number(unpaidAmtVal) : defaultUnpaid)
    : 0;

  const rawProdCode = (document.getElementById('prodCodeInput')?.value || '').trim() || generateAutoProductCode();
  const normalizedProdCode = translateLaoThaiKeyToAscii(rawProdCode).trim() || rawProdCode;
  const existingProd = id ? state.products.find(p => p.id === id) : null;
  const altCodes = Array.isArray(existingProd?.altCodes) ? [...existingProd.altCodes] : [];
  if (existingProd && existingProd.code && existingProd.code !== normalizedProdCode && !altCodes.includes(existingProd.code)) {
    altCodes.push(existingProd.code);
  }
  if (rawProdCode && rawProdCode !== normalizedProdCode && !altCodes.includes(rawProdCode)) {
    altCodes.push(rawProdCode);
  }

  const itemData = {
    id: id || 'P' + Date.now(),
    code: normalizedProdCode,
    altCodes: altCodes,
    name: document.getElementById('prodNameInput').value.trim(),
    category: document.getElementById('prodCategoryInput').value,
    cost: cost,
    price: Number(document.getElementById('prodPriceInput').value || 0),
    unit: document.getElementById('prodUnitInput').value.trim() || 'ອັນ',
    hasTieredPricing: hasTiered && priceTiers.length > 0,
    priceTiers: hasTiered ? priceTiers : [],
    hasSubUnit: hasSub && subUnit !== '' && subRatio > 1,
    subUnit: hasSub ? subUnit : '',
    subRatio: hasSub ? subRatio : 0,
    subPrice: hasSub ? subPrice : 0,
    subCost: hasSub ? subCost : 0,
    trackStock: document.getElementById('prodTrackStockInput').checked,
    stock: stock,
    minStock: Number(document.getElementById('prodMinStockInput').value || 0),
    isUnpaid: isUnpaid,
    unpaidAmount: finalUnpaidAmount,
    supplier: supplierVal,
    image: imageVal
  };

  if (id) {
    const idx = state.products.findIndex(p => p.id === id);
    if (idx !== -1) state.products[idx] = itemData;
  } else {
    state.products.push(itemData);
  }
  state.products.sort(compareProductCode);

  saveState();
  closeProductModal();
  renderCatalogTable();
  renderPOSProducts();
  if (typeof renderSummaryPage === 'function') renderSummaryPage();
}

// ==========================================
// SUB-UNIT HELPER & SELECTION MODAL FUNCTIONS
// ==========================================
function toggleSubUnitFields() {
  const chk = document.getElementById('prodHasSubUnitInput');
  const container = document.getElementById('subUnitFieldsContainer');
  if (chk && container) {
    container.style.display = chk.checked ? 'block' : 'none';
    if (chk.checked) {
      updateSubUnitHelperText();
    }
  }
}

function toggleProdUnpaidFields() {
  const chk = document.getElementById('prodIsUnpaidInput');
  const container = document.getElementById('prodUnpaidFieldsContainer');
  if (container) {
    container.style.display = (chk && chk.checked) ? 'block' : 'none';
  }
}

function autoCalculateSubPrices() {
  const ratio = Number(document.getElementById('prodSubRatioInput')?.value || 0);
  if (ratio > 1) {
    const mainPrice = Number(document.getElementById('prodPriceInput')?.value || 0);
    const mainCost = Number(document.getElementById('prodCostInput')?.value || 0);
    const subPriceInput = document.getElementById('prodSubPriceInput');
    const subCostInput = document.getElementById('prodSubCostInput');
    if (subPriceInput && (!subPriceInput.value || subPriceInput.value === '0') && mainPrice > 0) {
      subPriceInput.value = Math.round(mainPrice / ratio);
    }
    if (subCostInput && (!subCostInput.value || subCostInput.value === '0') && mainCost > 0) {
      subCostInput.value = Math.round(mainCost / ratio);
    }
  }
  updateSubUnitHelperText();
}

function updateSubUnitHelperText() {
  const helpEl = document.getElementById('subUnitHelpText');
  if (!helpEl) return;
  const mainUnit = document.getElementById('prodUnitInput')?.value.trim() || 'ແກັດ';
  const subUnit = document.getElementById('prodSubUnitInput')?.value.trim() || 'ຕັບ';
  const ratio = document.getElementById('prodSubRatioInput')?.value || '5';
  const subPrice = document.getElementById('prodSubPriceInput')?.value;
  const priceFormatted = subPrice ? formatLAK(subPrice) : '... ກີບ';
  helpEl.innerHTML = `💡 <strong>ສະຫຼຸບ:</strong> 1 ${mainUnit} = ${ratio} ${subUnit} | ລາຄາຂາຍຍ່ອຍ: ${priceFormatted} / ${subUnit}`;
}

// ==========================================
// TIERED / WHOLESALE PRICING FUNCTIONS
// ==========================================
function toggleTieredPriceFields() {
  const chk = document.getElementById('prodHasTieredPriceInput');
  const container = document.getElementById('tieredPriceFieldsContainer');
  const addBtn = document.getElementById('btnAddTierRow');
  const isChecked = !!(chk && chk.checked);
  if (container) container.style.display = isChecked ? 'block' : 'none';
  if (addBtn) addBtn.style.display = isChecked ? 'inline-flex' : 'none';
  if (isChecked) {
    updateTieredPriceBaseHelper();
    const list = document.getElementById('priceTiersListContainer');
    if (list && list.children.length === 0) {
      addPriceTierRow(2, '');
    }
  }
}

function updateTieredPriceBaseHelper() {
  const normEl = document.getElementById('normalPriceDisplay');
  const priceInput = document.getElementById('prodPriceInput');
  const unitInput = document.getElementById('prodUnitInput');
  if (normEl && priceInput) {
    const pVal = Number(priceInput.value || 0);
    const uVal = unitInput?.value?.trim() || 'ອັນ';
    normEl.textContent = `${formatLAK(pVal)} / ${uVal}`;
  }
}

function renderPriceTierRows(tiers = []) {
  const container = document.getElementById('priceTiersListContainer');
  if (!container) return;
  container.innerHTML = '';
  if (Array.isArray(tiers) && tiers.length > 0) {
    tiers.forEach(t => addPriceTierRow(t.minQty, t.price));
  }
}

function addPriceTierRow(minQty = '', price = '') {
  const container = document.getElementById('priceTiersListContainer');
  if (!container) return;
  const unitName = document.getElementById('prodUnitInput')?.value.trim() || 'ອັນ';
  const row = document.createElement('div');
  row.className = 'price-tier-row';
  row.style.cssText = 'display:flex;align-items:center;gap:0.45rem;background:#ffffff;padding:0.4rem 0.6rem;border-radius:8px;border:1px solid #cbd5e1;flex-wrap:wrap;';
  row.innerHTML = `
    <span style="font-size:0.82rem;font-weight:700;color:#1e293b;white-space:nowrap;">ຊື້ຄົບ ≥</span>
    <input type="number" class="input tier-qty" min="2" step="1" placeholder="2" value="${minQty !== null && minQty !== undefined ? minQty : ''}" style="width:72px;padding:0.28rem 0.45rem;font-size:0.86rem;" required />
    <span style="font-size:0.82rem;font-weight:700;color:#1e293b;white-space:nowrap;">${unitName}, ລາຄາ:</span>
    <input type="number" class="input tier-price" min="0" step="100" placeholder="ລາຄາຕໍ່${unitName}" value="${price !== null && price !== undefined ? price : ''}" style="flex:1;min-width:110px;padding:0.28rem 0.45rem;font-size:0.86rem;" required />
    <span style="font-size:0.82rem;color:#64748b;white-space:nowrap;">ກີບ / ${unitName}</span>
    <button type="button" class="btn btn-outline btn-sm" style="padding:0.25rem 0.5rem;color:#dc2626;border-color:#fca5a5;background:#fff;" onclick="removePriceTierRow(this)" title="ລຶບຂັ້ນລາຄານີ້">🗑️</button>
  `;
  container.appendChild(row);
}

function removePriceTierRow(btn) {
  const row = btn.closest('.price-tier-row');
  if (row) row.remove();
}

function getProductUnitPrice(product, qty = 1) {
  if (!product) return 0;
  const basePrice = Number(product.price || 0);
  if (!product.hasTieredPricing || !Array.isArray(product.priceTiers) || product.priceTiers.length === 0) {
    return basePrice;
  }
  const sortedTiers = [...product.priceTiers]
    .filter(t => Number(t.minQty) > 1 && Number(t.price) > 0)
    .sort((a, b) => Number(b.minQty) - Number(a.minQty));

  const numQty = Number(qty || 1);
  const matchingTier = sortedTiers.find(t => numQty >= Number(t.minQty));
  if (matchingTier) {
    return Number(matchingTier.price);
  }
  return basePrice;
}

function getProductActiveTier(product, qty = 1) {
  if (!product || !product.hasTieredPricing || !Array.isArray(product.priceTiers) || product.priceTiers.length === 0) {
    return null;
  }
  const sortedTiers = [...product.priceTiers]
    .filter(t => Number(t.minQty) > 1 && Number(t.price) > 0)
    .sort((a, b) => Number(b.minQty) - Number(a.minQty));

  const numQty = Number(qty || 1);
  return sortedTiers.find(t => numQty >= Number(t.minQty)) || null;
}

function applyTieredPriceToCartItem(item, product) {
  if (!item || !product) return;
  if (item.unitType === 'sub') return; // Sub-units use their own fixed subPrice
  if (product.hasTieredPricing && Array.isArray(product.priceTiers) && product.priceTiers.length > 0) {
    const activeTier = getProductActiveTier(product, item.qty);
    item.price = activeTier ? Number(activeTier.price) : Number(product.price || 0);
    item.activeTier = activeTier;
  } else {
    item.price = Number(product.price || 0);
    item.activeTier = null;
  }
}

let pendingUnitSelectProductId = null;

function openUnitSelectionModal(productId) {
  const product = state.products.find(p => p.id === productId);
  if (!product) return;
  pendingUnitSelectProductId = productId;

  const modal = document.getElementById('unitSelectionModal');
  if (!modal) return;

  const imgEl = document.getElementById('unitModalProdImg');
  const codeEl = document.getElementById('unitModalProdCode');
  const nameEl = document.getElementById('unitModalProdName');
  const ratioEl = document.getElementById('unitModalProdRatio');

  if (imgEl) imgEl.src = getProductImageSrc(product);
  if (codeEl) codeEl.textContent = `ລະຫັດ: ${product.code}`;
  if (nameEl) nameEl.textContent = product.name;
  if (ratioEl) ratioEl.textContent = `📦 1 ${product.unit} = ${product.subRatio} ${product.subUnit}`;

  // Main unit choice card
  const mainName = document.getElementById('unitChoiceMainName');
  const mainPrice = document.getElementById('unitChoiceMainPrice');
  const mainStock = document.getElementById('unitChoiceMainStock');
  const mainBtn = document.getElementById('unitBtnMainLabel');
  if (mainName) mainName.textContent = product.unit;
  if (mainPrice) mainPrice.textContent = formatLAK(product.price);
  if (mainStock) mainStock.textContent = product.trackStock ? `ເຫຼືອ: ${formatProductStock(product)}` : 'ພ້ອມຂາຍ';
  if (mainBtn) mainBtn.textContent = product.unit;

  // Sub unit choice card
  const subName = document.getElementById('unitChoiceSubName');
  const subPrice = document.getElementById('unitChoiceSubPrice');
  const subStock = document.getElementById('unitChoiceSubStock');
  const subBtn = document.getElementById('unitBtnSubLabel');
  const effectiveSubPrice = product.subPrice || Math.round(product.price / product.subRatio);
  if (subName) subName.textContent = product.subUnit;
  if (subPrice) subPrice.textContent = formatLAK(effectiveSubPrice);
  if (subStock) subStock.textContent = `(1 ${product.unit} ມີ ${product.subRatio} ${product.subUnit})`;
  if (subBtn) subBtn.textContent = product.subUnit;

  modal.classList.add('open');
}

function closeUnitSelectionModal() {
  const modal = document.getElementById('unitSelectionModal');
  if (modal) modal.classList.remove('open');
  pendingUnitSelectProductId = null;
}

function selectUnitForSale(unitType) {
  const pid = pendingUnitSelectProductId;
  closeUnitSelectionModal();
  if (pid) {
    addToCart(pid, unitType);
  }
}

// ==========================================
// CATEGORY MANAGER FUNCTIONS (CRUD)
// ==========================================
function renderAllCategorySelects() {
  const cats = (state.categories && state.categories.length > 0) ? state.categories : DEFAULT_CATEGORIES;

  // 1. POS category tabs
  const posTabs = document.getElementById('posCategoryTabs');
  if (posTabs) {
    const validSelected = cats.some(c => c.id === selectedCategory);
    if (!validSelected && cats.length > 0) {
      selectedCategory = cats[0].id;
    }
    posTabs.innerHTML = cats.map(c => `
      <button class="pos-cat-tab ${selectedCategory === c.id ? 'active' : ''}" data-cat="${c.id}" onclick="setPOSCategory('${c.id}')">
        ${c.icon ? c.icon + ' ' : ''}${c.name}
      </button>
    `).join('');
  }

  // 2. Catalog Category Filter
  const catFilter = document.getElementById('catalogCategoryFilter');
  if (catFilter) {
    const curVal = catFilter.value || 'all';
    catFilter.innerHTML = `<option value="all">ທຸກໝວດໝູ່</option>` +
      cats.map(c => `<option value="${c.id}">${c.icon ? c.icon + ' ' : ''}${c.name}</option>`).join('');
    if (curVal) catFilter.value = curVal;
  }

  // 3. Product Modal Category Input
  const prodCatInput = document.getElementById('prodCategoryInput');
  if (prodCatInput) {
    const curVal = prodCatInput.value;
    prodCatInput.innerHTML = cats.map(c => `<option value="${c.id}">${c.icon ? c.icon + ' ' : ''}${c.name}</option>`).join('');
    if (curVal) prodCatInput.value = curVal;
  }

  // 4. Summary Income Category Filter
  const incFilter = document.getElementById('incomeCategoryFilter');
  if (incFilter) {
    const curVal = incFilter.value || 'all';
    incFilter.innerHTML = `<option value="all">ທຸກໝວດລາຍຮັບ</option>` +
      cats.map(c => `<option value="${c.id}">${c.icon ? c.icon + ' ' : ''}${c.name}</option>`).join('') +
      `<option value="other">📦 ອື່ນໆ</option>`;
    if (curVal) incFilter.value = curVal;
  }

  // 5. Income Modal Category Input (#incCategoryInput)
  const incCatInput = document.getElementById('incCategoryInput');
  if (incCatInput) {
    const curVal = incCatInput.value || 'other';
    incCatInput.innerHTML = cats.map(c => `<option value="${c.id}">${c.icon ? c.icon + ' ' : ''}${c.name}</option>`).join('') +
      `<option value="other">📦 ລາຍຮັບອື່ນໆ (ນອກເໜືອສິນຄ້າ/ບໍລິການ)</option>`;
    if (curVal) incCatInput.value = curVal;
  }
}

function openCategoryManagerModal() {
  const modal = document.getElementById('categoryManagerModal');
  if (!modal) return;
  resetCategoryForm();
  renderCategoryManagerTable();
  modal.classList.add('open');
}

function closeCategoryManagerModal() {
  const modal = document.getElementById('categoryManagerModal');
  if (modal) modal.classList.remove('open');
}

function resetCategoryForm() {
  const idInput = document.getElementById('catEditIdInput');
  const iconInput = document.getElementById('catIconInput');
  const nameInput = document.getElementById('catNameInput');
  const titleEl = document.getElementById('catFormTitle');
  const btnEl = document.getElementById('catSubmitBtn');
  const cancelBtn = document.getElementById('catCancelEditBtn');

  if (idInput) idInput.value = '';
  if (iconInput) iconInput.value = '🏷️';
  if (nameInput) nameInput.value = '';
  if (titleEl) titleEl.textContent = '+ ເພີ່ມໝວດໝູ່ໃໝ່:';
  if (btnEl) btnEl.textContent = '+ ບັນທຶກ';
  if (cancelBtn) cancelBtn.style.display = 'none';
}

function renderCategoryManagerTable() {
  const tbody = document.getElementById('categoryManagerTableBody');
  if (!tbody) return;
  const cats = (state.categories && state.categories.length > 0) ? state.categories : DEFAULT_CATEGORIES;

  tbody.innerHTML = cats.map(c => {
    const prodCount = state.products.filter(p => p.category === c.id).length;
    return `
      <tr>
        <td style="text-align:center;font-size:1.25rem;">${c.icon || '🏷️'}</td>
        <td><strong>${c.name}</strong></td>
        <td style="text-align:center;">
          <span class="status-pill status-normal" style="font-size:0.78rem;padding:0.2rem 0.6rem;">
            ${prodCount} ລາຍການ
          </span>
        </td>
        <td style="text-align:center;white-space:nowrap;">
          <div style="display:flex;gap:0.35rem;justify-content:center;">
            <button type="button" class="btn btn-outline btn-sm" onclick="editCategory('${c.id}')" title="ແກ້ໄຂໝວດໝູ່">
              ✏️
            </button>
            <button type="button" class="btn btn-danger btn-sm" onclick="deleteCategory('${c.id}')" title="ລຶບໝວດໝູ່">
              🗑️
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function handleSaveCategory(e) {
  e.preventDefault();
  const idInput = document.getElementById('catEditIdInput');
  const iconInput = document.getElementById('catIconInput');
  const nameInput = document.getElementById('catNameInput');

  const id = idInput ? idInput.value.trim() : '';
  const icon = iconInput ? (iconInput.value.trim() || '🏷️') : '🏷️';
  const name = nameInput ? nameInput.value.trim() : '';

  if (!name) {
    alert('ກະລຸນາປ້ອນຊື່ໝວດໝູ່!');
    return;
  }

  if (!state.categories || state.categories.length === 0) state.categories = [...DEFAULT_CATEGORIES];

  if (id) {
    const idx = state.categories.findIndex(c => c.id === id);
    if (idx !== -1) {
      state.categories[idx].name = name;
      state.categories[idx].icon = icon;
    }
  } else {
    const newId = 'cat_' + Date.now();
    state.categories.push({ id: newId, name, icon });
  }

  saveState();
  resetCategoryForm();
  renderCategoryManagerTable();
  renderAllCategorySelects();
  renderPOSProducts();
  renderCatalogTable();
  if (typeof renderSummaryPage === 'function') renderSummaryPage();
}

function editCategory(catId) {
  const cats = (state.categories && state.categories.length > 0) ? state.categories : DEFAULT_CATEGORIES;
  const cat = cats.find(c => c.id === catId);
  if (!cat) return;

  const idInput = document.getElementById('catEditIdInput');
  const iconInput = document.getElementById('catIconInput');
  const nameInput = document.getElementById('catNameInput');
  const titleEl = document.getElementById('catFormTitle');
  const btnEl = document.getElementById('catSubmitBtn');
  const cancelBtn = document.getElementById('catCancelEditBtn');

  if (idInput) idInput.value = cat.id;
  if (iconInput) iconInput.value = cat.icon || '🏷️';
  if (nameInput) nameInput.value = cat.name;
  if (titleEl) titleEl.textContent = `✏️ ແກ້ໄຂໝວດໝູ່: "${cat.name}"`;
  if (btnEl) btnEl.textContent = '💾 ບັນທຶກການແກ້ໄຂ';
  if (cancelBtn) cancelBtn.style.display = 'inline-block';
  nameInput?.focus();
}

function deleteCategory(catId) {
  const cats = (state.categories && state.categories.length > 0) ? state.categories : DEFAULT_CATEGORIES;
  const cat = cats.find(c => c.id === catId);
  if (!cat) return;

  if (cats.length <= 1) {
    alert('ບໍ່ສາມາດລຶບໄດ້! ຕ້ອງມີໝວດໝູ່ສິນຄ້າຢ່າງໜ້ອຍ 1 ໝວດ.');
    return;
  }

  const prodsWithCat = state.products.filter(p => p.category === catId);
  const count = prodsWithCat.length;

  if (count > 0) {
    const targetCat = cats.find(c => c.id !== catId);
    if (!confirm(`ໝວດໝູ່ "${cat.name}" ມີສິນຄ້າຢູ່ ${count} ລາຍການ!\nຫາກລຶບ, ສິນຄ້າເຫຼົ່ານີ້ຈະຖືກຍ້າຍໄປໃສ່ໝວດໝູ່ "${targetCat.name}".\n\nທ່ານຕ້ອງການລຶບແທ້ບໍ່?`)) {
      return;
    }
    prodsWithCat.forEach(p => { p.category = targetCat.id; });
  } else {
    if (!confirm(`ຕ້ອງການລຶບໝວດໝູ່ "${cat.name}" ແທ້ບໍ່?`)) {
      return;
    }
  }

  state.categories = cats.filter(c => c.id !== catId);
  if (selectedCategory === catId) {
    selectedCategory = state.categories[0].id;
  }

  saveState();
  renderCategoryManagerTable();
  renderAllCategorySelects();
  renderPOSProducts();
  renderCatalogTable();
  if (typeof renderSummaryPage === 'function') renderSummaryPage();
}

function deleteProduct(productId) {
  const prod = state.products.find(p => p.id === productId);
  if (!prod) return;
  if (confirm(`ຕ້ອງການລຶບ "${prod.name}" ອອກຈາກບັນຊີສິນຄ້າແທ້ບໍ່?`)) {
    state.products = state.products.filter(p => p.id !== productId);
    saveState();
    renderCatalogTable();
    renderPOSProducts();
  }
}

// ==========================================
// 3. MACHINERY & ASSET TRACKER MODULE
// ==========================================
function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function getMachineDefaultSvg(m) {
  const name = String(m?.name || '').toLowerCase();
  const cat = String(m?.category || '').toLowerCase();
  let emoji = '🏪';
  let bg1 = '#f0fdf4';
  let bg2 = '#bbf7d0';
  let accent = '#16a34a';

  if (name.includes('ຕູ້ແຊ່ເຢັນ') || cat.includes('ແຊ່ເຢັນ') || name.includes('ຕູ້ເຢັນ')) {
    emoji = '🧊'; bg1 = '#eff6ff'; bg2 = '#bfdbfe'; accent = '#2563eb';
  } else if (name.includes('ຕູ້ແຊ່ແຂງ') || cat.includes('ແຊ່ແຂງ')) {
    emoji = '❄️'; bg1 = '#f0f9ff'; bg2 = '#bae6fd'; accent = '#0284c7';
  } else if (name.includes('ຊັ່ງ') || name.includes('ຊີລ') || cat.includes('ຊັ່ງ')) {
    emoji = '⚖️'; bg1 = '#fffbeb'; bg2 = '#fde68a'; accent = '#d97706';
  } else if (name.includes('ໂຕະ') || name.includes('ຊັ້ນວາງ') || name.includes('ກະຕ່າ')) {
    emoji = '🧺'; bg1 = '#fdf4ff'; bg2 = '#f5d0fe'; accent = '#a855f7';
  } else if (name.includes('ໂຄງສ້າງ') || name.includes('ກັນສາດ') || name.includes('ປ້າຍ')) {
    emoji = '🏪'; bg1 = '#fff7ed'; bg2 = '#fed7aa'; accent = '#ea580c';
  } else if (name.includes('ຄ່າເຊົ່າ') || name.includes('ມັດຈຳ') || cat.includes('ເຊົ່າ')) {
    emoji = '🏢'; bg1 = '#f8fafc'; bg2 = '#cbd5e1'; accent = '#475569';
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">
    <defs>
      <linearGradient id="gm_${name.length}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${bg1}"/>
        <stop offset="100%" stop-color="${bg2}"/>
      </linearGradient>
    </defs>
    <rect width="120" height="120" rx="14" fill="url(#gm_${name.length})"/>
    <circle cx="60" cy="55" r="32" fill="rgba(255,255,255,0.85)" stroke="${accent}" stroke-width="2" stroke-opacity="0.3"/>
    <text x="60" y="67" font-size="34" text-anchor="middle">${emoji}</text>
  </svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

function getMachineImageSrc(m) {
  if (m && m.image && String(m.image).trim() !== '') {
    return m.image;
  }
  return getMachineDefaultSvg(m);
}

let quickUploadTargetMachineId = null;

function triggerQuickMachineImageUpload(event, machineId) {
  if (event) event.stopPropagation();
  quickUploadTargetMachineId = machineId;
  let fileInput = document.getElementById('quickMachineImageInput');
  if (!fileInput) {
    fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.id = 'quickMachineImageInput';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    fileInput.onchange = (e) => {
      if (quickUploadTargetMachineId) {
        handleMachineImageUpload(quickUploadTargetMachineId, e);
      }
    };
    document.body.appendChild(fileInput);
  }
  fileInput.value = '';
  fileInput.click();
}

function triggerMachineImageUpload(machineId) {
  triggerQuickMachineImageUpload(null, machineId);
}

async function handleMachineImageUpload(machineId, event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const dataUrl = await compressImageFile(file, 160, 0.65);
    const m = state.machines.find(x => x.id === machineId);
    if (m) {
      m.image = dataUrl;
      saveState();
      renderMachines();
      const actionModalImg = document.getElementById('machActionMenuImg');
      if (actionModalImg && selectedActionMachineId === m.id) {
        actionModalImg.src = dataUrl;
      }
      if (typeof showToast === 'function') {
        showToast(`✅ ອັບເດດຮູບອຸປະກອນ "${m.name}" ແລະ ຊິ້ງໄປທຸກເຄື່ອງແລ້ວ!`, 'success');
      }
    }
  } catch (err) {
    console.error('Failed to upload machine image:', err);
  }
  event.target.value = '';
}

function getStatusBadge(status) {
  if (status === 'normal') return `<span class="status-pill status-normal">🟢 ປົກກະຕິ</span>`;
  if (status === 'maintenance') return `<span class="status-pill status-maintenance">🟡 ບຳລຸງຮັກສາ</span>`;
  return `<span class="status-pill status-broken">🔴 ຊຳລຸດ</span>`;
}

let selectedActionMachineId = null;
let machineRowPressTimer = null;
let machineRowLongPressTriggered = false;

function handleMachineRowPressStart(machineId, event) {
  if (event && event.type === 'mousedown' && event.button !== 0) return;
  machineRowLongPressTriggered = false;
  clearTimeout(machineRowPressTimer);
  machineRowPressTimer = setTimeout(() => {
    machineRowLongPressTriggered = true;
    openMachineActionMenu(machineId);
  }, 450);
}

function handleMachineRowPressEnd() {
  clearTimeout(machineRowPressTimer);
  machineRowPressTimer = null;
}

function openMachineActionMenu(machineId, event) {
  if (event) {
    event.stopPropagation();
  }
  const m = state.machines.find(x => x.id === machineId);
  if (!m) return;
  selectedActionMachineId = m.id;

  const modal = document.getElementById('machineActionMenuModal');
  const imgEl = document.getElementById('machActionMenuImg');
  const nameEl = document.getElementById('machActionMenuName');
  const subEl = document.getElementById('machActionMenuSub');

  const mQty = Number(m.qty) || 1;
  const mPrice = Number(m.price || 0);
  const mTotal = mPrice * mQty;

  if (imgEl) imgEl.src = getMachineImageSrc(m);
  if (nameEl) nameEl.textContent = m.name || '';
  if (subEl) subEl.textContent = `ມູນຄ່າ: ${formatLAK(mTotal)}`;

  if (modal) {
    modal.classList.add('open');
  }
}

function closeMachineActionMenu() {
  document.getElementById('machineActionMenuModal')?.classList.remove('open');
}

function handleMachineActionEdit() {
  const id = selectedActionMachineId;
  closeMachineActionMenu();
  if (id) {
    openMachineModal(id);
  }
}

function handleMachineActionDelete() {
  const id = selectedActionMachineId;
  closeMachineActionMenu();
  if (id) {
    deleteMachine(id);
  }
}

function renderMachines() {
  const grid = document.getElementById('machineGrid');
  if (!grid) return;

  const countBadge = document.getElementById('machineCountBadge');
  if (countBadge) countBadge.textContent = `${state.machines.length} ລາຍການ`;

  const totalValue = state.machines.reduce((sum, m) => sum + (Number(m.price || 0) * (Number(m.qty) || 1)), 0);
  const totalEl = document.getElementById('machineTotalValueText');
  if (totalEl) totalEl.textContent = formatLAK(totalValue);

  if (state.machines.length === 0) {
    grid.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:2rem;color:var(--text-muted);">ຍັງບໍ່ມີລາຍການອຸປະກອນໃນບັນຊີ</td></tr>`;
    return;
  }

  // ຈັດລຽງອຸປະກອນທີ່ມີມູນຄ່າລວມສູງ (ລາຄາແພງ) ໃຫ້ຂຶ້ນເທິງ ແລະ ລາຄາຕ່ຳລົງມາຕາມລຳດັບ
  const sortedMachines = [...state.machines].sort((a, b) => {
    const totalA = Number(a.price || 0) * (Number(a.qty) || 1);
    const totalB = Number(b.price || 0) * (Number(b.qty) || 1);
    return totalB - totalA;
  });

  grid.innerHTML = sortedMachines.map(m => {
    const mQty = Number(m.qty) || 1;
    const mPrice = Number(m.price || 0);
    const mTotal = mPrice * mQty;

    return `
      <tr
        class="machine-row-item"
        onclick="handleMachineRowClick('${m.id}', event)"
        onmousedown="handleMachineRowPressStart('${m.id}', event)"
        onmouseup="handleMachineRowPressEnd()"
        onmouseleave="handleMachineRowPressEnd()"
        ontouchstart="handleMachineRowPressStart('${m.id}', event)"
        ontouchend="handleMachineRowPressEnd()"
        ontouchmove="handleMachineRowPressEnd()"
        ontouchcancel="handleMachineRowPressEnd()"
        oncontextmenu="event.preventDefault(); openMachineActionMenu('${m.id}', event);"
      >
        <td style="text-align:center;width:68px;">
          <div class="machine-photo-wrap static" style="position:relative;cursor:pointer;" onclick="triggerQuickMachineImageUpload(event, '${m.id}')" title="ກົດເພື່ອໃສ່ຮູບ / ປ່ຽນຮູບອຸປະກອນ">
            <img src="${getMachineImageSrc(m)}" alt="${escapeHtml(m.name)}" class="machine-thumb-img" />
            <span style="position:absolute;bottom:-3px;right:-3px;background:#f97316;color:#fff;font-size:0.6rem;padding:1px 3px;border-radius:4px;line-height:1;">📷</span>
          </div>
        </td>
        <td>
          <div class="machine-name-trigger" onclick="openMachineActionMenu('${m.id}', event)" title="ກົດໃສ່ຊື່ ຫຼື ກົດຄ້າງໃສ່ແຖວ ເພື່ອແກ້ໄຂ ຫຼື ລຶບ">
            ${escapeHtml(m.name)}
          </div>
        </td>
        <td style="text-align:right;font-weight:900;font-size:0.95rem;color:#ea580c;font-variant-numeric:tabular-nums;white-space:nowrap;">
          ${formatLAK(mTotal)}
        </td>
        <td style="text-align:center;white-space:nowrap;">
          <div>${getStatusBadge(m.status)}</div>
        </td>
        <td class="win-only-col" style="text-align:center;white-space:nowrap;" onclick="event.stopPropagation()">
          <div style="display:flex;gap:0.35rem;justify-content:center;">
            <button type="button" class="btn btn-outline btn-sm" onclick="openMachineModal('${m.id}')">✏️ ແກ້ໄຂ</button>
            <button type="button" class="btn btn-danger btn-sm" onclick="deleteMachine('${m.id}')">🗑️ ລຶບ</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function startEditMachine(machineId) {
  editingMachineId = machineId;
  renderMachines();
  setTimeout(() => {
    const nameInput = document.getElementById(`mach_name_${machineId}`);
    if (nameInput) {
      nameInput.focus();
      nameInput.select();
    }
  }, 40);
}

function cancelEditMachine() {
  editingMachineId = null;
  renderMachines();
}

function saveInlineMachine(machineId) {
  const m = state.machines.find(x => x.id === machineId);
  if (!m) return;

  const nameVal = document.getElementById(`mach_name_${machineId}`)?.value.trim();
  const qtyVal = parseInt(document.getElementById(`mach_qty_${machineId}`)?.value, 10) || 1;
  const priceVal = Number(document.getElementById(`mach_price_${machineId}`)?.value || 0);
  const noteVal = document.getElementById(`mach_note_${machineId}`)?.value.trim();
  const statusVal = document.getElementById(`mach_status_${machineId}`)?.value;

  if (!nameVal) {
    alert('ກະລຸນາໃສ່ຊື່ອຸປະກອນ / ເຄື່ອງຈັກ!');
    document.getElementById(`mach_name_${machineId}`)?.focus();
    return;
  }

  m.name = nameVal;
  m.qty = Math.max(1, qtyVal);
  m.price = Math.max(0, priceVal);
  m.note = noteVal || 'ໃຊ້ງານປົກກະຕິ';
  if (statusVal) m.status = statusVal;

  editingMachineId = null;
  saveState();
  renderMachines();
  if (typeof renderSummaryPage === 'function') renderSummaryPage();
}

function updateMachinePriceLive(machineId) {
  const priceInput = document.getElementById(`mach_price_${machineId}`);
  const qtyInput = document.getElementById(`mach_qty_${machineId}`);
  const m = state.machines.find(x => x.id === machineId);
  if (m) {
    if (priceInput) m.price = Math.max(0, Number(priceInput.value || 0));
    if (qtyInput) m.qty = Math.max(1, parseInt(qtyInput.value, 10) || 1);
    const lineTotalEl = document.getElementById(`mach_total_${machineId}`);
    if (lineTotalEl) lineTotalEl.textContent = formatLAK(Number(m.price || 0) * (Number(m.qty) || 1));
    const totalValue = state.machines.reduce((sum, item) => sum + (Number(item.price || 0) * (Number(item.qty) || 1)), 0);
    const totalEl = document.getElementById('machineTotalValueText');
    if (totalEl) totalEl.textContent = formatLAK(totalValue);
  }
}

async function handleMachineModalImgUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const dataUrl = await compressImageFile(file, 400, 0.85);
    const preview = document.getElementById('machImgPreview');
    const input = document.getElementById('machImgDataInput');
    if (preview) {
      preview.src = dataUrl;
      preview.style.display = 'block';
    }
    if (input) input.value = dataUrl;
  } catch (err) {
    console.error('Failed to upload modal machine image:', err);
  }
  event.target.value = '';
}

function clearMachineModalImg() {
  const preview = document.getElementById('machImgPreview');
  const input = document.getElementById('machImgDataInput');
  if (preview) {
    preview.src = '';
    preview.style.display = 'none';
  }
  if (input) input.value = '';
}

function calcMachModalTotal() {
  const qty = Math.max(1, parseInt(document.getElementById('machQtyInput')?.value, 10) || 1);
  const price = Math.max(0, Number(document.getElementById('machPriceInput')?.value || 0));
  const unit = (document.getElementById('machUnitInput')?.value || '').trim() || 'ເຄື່ອງ';
  const total = qty * price;
  const disp = document.getElementById('machModalTotalDisplay');
  if (disp) {
    disp.textContent = `${formatLAK(total)} (${qty} ${unit} × ${formatLAK(price)})`;
  }
}

function openMachineModal(machineId = null) {
  const modalEl = document.getElementById('machineModal');
  const titleEl = document.getElementById('machineModalTitle');
  const idInput = document.getElementById('machIdInput');
  const nameInput = document.getElementById('machNameInput');
  const qtyInput = document.getElementById('machQtyInput');
  const unitInput = document.getElementById('machUnitInput');
  const priceInput = document.getElementById('machPriceInput');
  const statusInput = document.getElementById('machStatusInput');
  const noteInput = document.getElementById('machNoteInput');

  clearMachineModalImg();

  if (machineId) {
    const m = state.machines.find(x => x.id === machineId);
    if (!m) return;
    if (titleEl) titleEl.textContent = '✏️ ແກ້ໄຂຊັບສິນ';
    if (idInput) idInput.value = m.id;
    if (nameInput) nameInput.value = m.name || '';
    if (qtyInput) qtyInput.value = m.qty || 1;
    if (unitInput) unitInput.value = m.unit || 'ເຄື່ອງ';
    if (priceInput) priceInput.value = m.price || 0;
    if (statusInput) statusInput.value = m.status || 'normal';
    if (noteInput) noteInput.value = m.note || '';
    if (m.image) {
      const preview = document.getElementById('machImgPreview');
      const hidden = document.getElementById('machImgDataInput');
      if (preview) {
        preview.src = m.image;
        preview.style.display = 'block';
      }
      if (hidden) hidden.value = m.image;
    }
  } else {
    if (titleEl) titleEl.textContent = 'ເພີ່ມຊັບສິນ';
    if (idInput) idInput.value = '';
    if (nameInput) nameInput.value = '';
    if (qtyInput) qtyInput.value = 1;
    if (unitInput) unitInput.value = 'ເຄື່ອງ';
    if (priceInput) priceInput.value = '';
    if (statusInput) statusInput.value = 'normal';
    if (noteInput) noteInput.value = 'ໃຊ້ງານປົກກະຕິ';
  }
  calcMachModalTotal();
  if (modalEl) {
    modalEl.classList.add('open');
    setTimeout(() => nameInput?.focus(), 60);
  }
}

function closeMachineModal() {
  document.getElementById('machineModal')?.classList.remove('open');
}

function saveMachineForm(e) {
  e.preventDefault();
  const editId = document.getElementById('machIdInput')?.value;
  const name = (document.getElementById('machNameInput')?.value || '').trim();
  const qty = Math.max(1, parseInt(document.getElementById('machQtyInput')?.value, 10) || 1);
  const unit = (document.getElementById('machUnitInput')?.value || '').trim() || 'ເຄື່ອງ';
  const price = Math.max(0, Number(document.getElementById('machPriceInput')?.value || 0));
  const status = document.getElementById('machStatusInput')?.value || 'normal';
  const note = (document.getElementById('machNoteInput')?.value || '').trim() || 'ໃຊ້ງານປົກກະຕິ';
  const image = document.getElementById('machImgDataInput')?.value || '';

  if (!name) return;

  if (editId) {
    const m = state.machines.find(x => x.id === editId);
    if (m) {
      m.name = name;
      m.qty = qty;
      m.unit = unit;
      m.price = price;
      m.status = status;
      m.note = note;
      m.image = image;
    }
  } else {
    const nextNum = state.machines.length + 1;
    const newMach = {
      id: 'M' + String(nextNum).padStart(3, '0'),
      name,
      category: 'ອຸປະກອນໃນຮ້ານ',
      qty,
      unit,
      price,
      image,
      installDate: new Date().toISOString().slice(0, 10),
      lastMaintenance: new Date().toISOString().slice(0, 10),
      status,
      note
    };
    state.machines.push(newMach);
  }
  saveState();
  closeMachineModal();
  renderMachines();
  if (typeof renderSummaryPage === 'function') renderSummaryPage();
}

function deleteMachine(machineId) {
  const m = state.machines.find(x => x.id === machineId);
  if (!m) return;
  if (confirm(`ຕ້ອງການລຶບອຸປະກອນ "${m.name}" ແທ້ບໍ່?`)) {
    state.machines = state.machines.filter(x => x.id !== machineId);
    saveState();
    renderMachines();
    if (typeof renderSummaryPage === 'function') renderSummaryPage();
  }
}

// ==========================================
// 4. SALES HISTORY, DEBT & BACKUP MODULE
// ==========================================
function populateHistoryPeriodOptions() {
  const mSelect = document.getElementById('historyMonthPicker');
  const ySelect = document.getElementById('historyYearPicker');
  if (!mSelect || !ySelect) return;

  const monthsSet = new Set();
  const yearsSet = new Set();
  const now = new Date();
  const nowMonth = now.toISOString().slice(0, 7);
  const nowYear = String(now.getFullYear());
  monthsSet.add(nowMonth);
  yearsSet.add(nowYear);

  state.bills.forEach(b => {
    if (b.date && b.date.length >= 7) {
      monthsSet.add(b.date.slice(0, 7));
      yearsSet.add(b.date.slice(0, 4));
    }
  });

  const curM = mSelect.value || nowMonth;
  const curY = ySelect.value || nowYear;

  const sortedMonths = Array.from(monthsSet).sort().reverse();
  mSelect.innerHTML = sortedMonths.map(ym => {
    const [y, m] = ym.split('-');
    return `<option value="${ym}">📅 ເດືອນ ${m}/${y}</option>`;
  }).join('');
  if (sortedMonths.includes(curM)) mSelect.value = curM;

  const sortedYears = Array.from(yearsSet).sort().reverse();
  ySelect.innerHTML = sortedYears.map(y => {
    return `<option value="${y}">🏛️ ປີ ${y}</option>`;
  }).join('');
  if (sortedYears.includes(curY)) ySelect.value = curY;
}

function onHistoryPeriodTypeChange() {
  const pType = document.getElementById('historyPeriodType')?.value || 'all';
  const dayPicker = document.getElementById('historyDayPicker');
  const monthPicker = document.getElementById('historyMonthPicker');
  const yearPicker = document.getElementById('historyYearPicker');

  if (dayPicker) dayPicker.style.display = pType === 'day' ? 'inline-block' : 'none';
  if (monthPicker) monthPicker.style.display = pType === 'month' ? 'inline-block' : 'none';
  if (yearPicker) yearPicker.style.display = pType === 'year' ? 'inline-block' : 'none';

  if (pType === 'day' && dayPicker && !dayPicker.value) {
    const curMonth = monthPicker?.value;
    const nowStr = new Date().toISOString().slice(0, 10);
    if (curMonth && nowStr.startsWith(curMonth)) {
      dayPicker.value = nowStr;
    } else if (curMonth) {
      dayPicker.value = `${curMonth}-01`;
    } else {
      dayPicker.value = nowStr;
    }
  }

  renderSalesHistory();
}

function renderSalesHistory() {
  populateHistoryPeriodOptions();

  const pType = document.getElementById('historyPeriodType')?.value || 'all';
  const dayPicker = document.getElementById('historyDayPicker');
  const monthPicker = document.getElementById('historyMonthPicker');
  const yearPicker = document.getElementById('historyYearPicker');

  if (dayPicker) dayPicker.style.display = pType === 'day' ? 'inline-block' : 'none';
  if (monthPicker) monthPicker.style.display = pType === 'month' ? 'inline-block' : 'none';
  if (yearPicker) yearPicker.style.display = pType === 'year' ? 'inline-block' : 'none';

  const filterDay = dayPicker?.value || '';
  const filterMonth = monthPicker?.value || '';
  const filterYear = yearPicker?.value || '';
  const filterStatus = document.getElementById('historyStatusFilter')?.value || 'all';
  const query = (document.getElementById('historySearchInput')?.value || '').trim().toLowerCase();

  const todayStr = new Date().toISOString().slice(0, 10);

  // Filter bills by the unified period selector
  let periodLabel = 'ທຸກເວລາ';
  const periodBills = state.bills.filter(b => {
    const bDate = b.date || '';
    if (pType === 'today') {
      periodLabel = 'ມື້ນີ້';
      return bDate.slice(0, 10) === todayStr;
    }
    if (pType === 'day') {
      const targetDay = filterDay || todayStr;
      const [y, m, d] = targetDay.split('-');
      periodLabel = `ວັນທີ ${d}/${m}/${y}`;
      return bDate.slice(0, 10) === targetDay;
    }
    if (pType === 'month') {
      const targetMonth = filterMonth || todayStr.slice(0, 7);
      const [y, m] = targetMonth.split('-');
      periodLabel = `ເດືອນ ${m}/${y}`;
      return bDate.slice(0, 7) === targetMonth;
    }
    if (pType === 'year') {
      const targetYear = filterYear || todayStr.slice(0, 4);
      periodLabel = `ປີ ${targetYear}`;
      return bDate.slice(0, 4) === targetYear;
    }
    // 'all'
    periodLabel = 'ທັງໝົດ';
    return true;
  });

  const cashRevenue = periodBills
    .filter(b => b.status === 'paid' && b.paymentMethod === 'cash')
    .reduce((s, b) => s + Number(b.total || 0), 0);

  const transferRevenue = periodBills
    .filter(b => b.status === 'paid' && b.paymentMethod === 'bcel')
    .reduce((s, b) => s + Number(b.total || 0), 0);

  const totalRevenue = periodBills
    .filter(b => b.status === 'paid')
    .reduce((s, b) => s + Number(b.total || 0), 0);

  const totalUnpaid = periodBills
    .filter(b => b.status === 'unpaid')
    .reduce((s, b) => s + Number(b.total || 0), 0);

  const totalAllSales = totalRevenue + totalUnpaid;

  const filtered = periodBills.filter(b => {
    const matchStatus = filterStatus === 'all' || b.status === filterStatus;
    const matchQuery = !query || b.id.toLowerCase().includes(query) || b.customer.toLowerCase().includes(query);
    return matchStatus && matchQuery;
  }).sort((a, b) => new Date(b.date) - new Date(a.date));

  const singlePillEl = document.getElementById('historySingleSummaryPill');
  const singleLabelEl = document.getElementById('historySingleSummaryLabel');
  const singleValueEl = document.getElementById('historySingleSummaryValue');
  const billsEl = document.getElementById('kpiTotalBills');

  const filteredTotal = filtered.reduce((s, b) => s + Number(b.total || 0), 0);

  if (singlePillEl && singleLabelEl && singleValueEl) {
    if (filterStatus === 'paid') {
      singlePillEl.style.background = '#ecfdf5';
      singlePillEl.style.borderColor = '#6ee7b7';
      singleLabelEl.style.color = '#065f46';
      singleLabelEl.textContent = '✅ ຊຳລະເງິນແລ້ວ:';
      singleValueEl.style.color = '#047857';
      singleValueEl.textContent = formatLAK(filteredTotal);
    } else if (filterStatus === 'unpaid') {
      singlePillEl.style.background = '#fef2f2';
      singlePillEl.style.borderColor = '#fca5a5';
      singleLabelEl.style.color = '#991b1b';
      singleLabelEl.textContent = '⏳ ລວມຕິດໜີ້:';
      singleValueEl.style.color = '#dc2626';
      singleValueEl.textContent = formatLAK(filteredTotal);
    } else {
      singlePillEl.style.background = '#eff6ff';
      singlePillEl.style.borderColor = '#93c5fd';
      singleLabelEl.style.color = '#1e40af';
      singleLabelEl.textContent = '📊 ຍອດຂາຍທັງໝົດ:';
      singleValueEl.style.color = '#1d4ed8';
      singleValueEl.textContent = formatLAK(filteredTotal);
    }
  }

  if (billsEl) {
    billsEl.textContent = `${filtered.length} ໃບບິນ`;
    if (filterStatus === 'paid') {
      billsEl.style.background = '#ecfdf5';
      billsEl.style.color = '#047857';
      billsEl.style.borderColor = '#6ee7b7';
    } else if (filterStatus === 'unpaid') {
      billsEl.style.background = '#fef2f2';
      billsEl.style.color = '#dc2626';
      billsEl.style.borderColor = '#fca5a5';
    } else {
      billsEl.style.background = 'var(--primary-light)';
      billsEl.style.color = 'var(--primary)';
      billsEl.style.borderColor = '#93c5fd';
    }
  }

  const tbody = document.getElementById('historyTableBody');
  if (!tbody) return;

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:2.5rem;color:var(--text-muted);font-size:0.95rem;">ບໍ່ພົບລາຍການໃບບິນ</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(b => {
    const ef = b.editedFields || {};

    const dateStr = new Date(b.date).toLocaleDateString('lo-LA', {
      year: 'numeric', month: '2-digit', day: '2-digit'
    });
    const itemSummary = (b.items || []).map(i => `${i.name} (x${i.qty})`).join(', ') || (b.title || 'ລາຍການຂາຍ');
    const customerName = b.customer || 'ລູກຄ້າທົ່ວໄປ';

    const dateCell = ef.date
      ? `<span style="color:#dc2626;font-weight:700;">${dateStr}</span>`
      : `<span>${dateStr}</span>`;

    const customerCell = ef.customer
      ? `<span style="color:#dc2626;font-weight:700;">${escapeHtml(customerName)}</span>`
      : `<span style="font-weight:700;color:#1e293b;">${escapeHtml(customerName)}</span>`;

    const paymentCell = ef.paymentMethod
      ? `<span style="color:#dc2626;font-weight:700;">${getPaymentLabel(b.paymentMethod)}</span>`
      : `<span>${getPaymentLabel(b.paymentMethod)}</span>`;

    const totalCell = ef.total
      ? `<span style="font-weight:800;color:#dc2626;font-variant-numeric:tabular-nums;">${formatLAK(b.total)}</span>`
      : `<span style="font-weight:800;color:var(--primary);font-variant-numeric:tabular-nums;">${formatLAK(b.total)}</span>`;

    const statusCell = b.status === 'paid'
      ? (ef.status
          ? `<span class="status-pill" style="background:#fee2e2;color:#dc2626;border:1px solid #fca5a5;">✅ ຊຳລະແລ້ວ</span>`
          : `<span class="status-pill status-normal">✅ ຊຳລະແລ້ວ</span>`)
      : (ef.status
          ? `<span class="status-pill" style="background:#fee2e2;color:#dc2626;border:1px solid #fca5a5;">⏳ ຄ້າງຊຳລະ</span>`
          : `<span class="status-pill status-broken">⏳ ຄ້າງຊຳລະ</span>`);

    return `
      <tr
        class="history-row-item"
        onclick="handleBillRowClick('${b.id}', event)"
        onmousedown="handleBillRowPressStart('${b.id}', event)"
        onmouseup="handleBillRowPressEnd()"
        onmouseleave="handleBillRowPressEnd()"
        ontouchstart="handleBillRowPressStart('${b.id}', event)"
        ontouchend="handleBillRowPressEnd()"
        ontouchmove="handleBillRowPressEnd()"
        ontouchcancel="handleBillRowPressEnd()"
        oncontextmenu="event.preventDefault(); openBillActionMenu('${b.id}', event);"
      >
        <td class="win-only-col" style="white-space:nowrap;">${dateCell}</td>
        <td class="win-only-col" style="white-space:nowrap;">${customerCell}</td>
        <td style="max-width:340px;">
          <div class="history-item-trigger" onclick="openBillActionMenu('${b.id}', event)" style="overflow:hidden;text-overflow:ellipsis;cursor:pointer;font-weight:700;" title="ກົດໃສ່ລາຍການ ເພື່ອຈັດການໃບບິນ: ${escapeHtml(itemSummary)}">
            ${escapeHtml(itemSummary)}
          </div>
        </td>
        <td class="win-only-col" style="white-space:nowrap;">${paymentCell}</td>
        <td style="text-align:right;white-space:nowrap;">${totalCell}</td>
        <td style="text-align:center;white-space:nowrap;">${statusCell}</td>
        <td class="win-only-col" style="text-align:center;white-space:nowrap;" onclick="event.stopPropagation()">
          <div style="display:flex;gap:0.35rem;justify-content:center;flex-wrap:wrap;">
            <button type="button" class="btn btn-outline btn-sm" style="border-color:#9333ea;color:#7e22ce;background:#faf5ff;font-weight:700;" onclick="openEditBillModal('${b.id}')" title="ແກ້ໄຂໃບບິນ">✏️ ແກ້ໄຂ</button>
            <button type="button" class="btn btn-primary btn-sm" style="background:#2563eb;border:none;font-weight:700;" onclick="viewBillById('${b.id}')" title="ສັ່ງພິມໃບບິນ">🖨️ ພິມບິນ</button>
            ${b.status === 'unpaid'
              ? `<button type="button" class="btn btn-success btn-sm" style="font-weight:700;" onclick="markBillPaid('${b.id}')" title="ຮັບຊຳລະໜີ້">💵 ຮັບຊຳລະ</button>`
              : `<button type="button" class="btn btn-outline btn-sm" style="opacity:0.55;cursor:default;" onclick="showToast('ໃບບິນນີ້ຊຳລະເງິນແລ້ວ', 'info')" title="ຊຳລະແລ້ວ">💵 ຮັບຊຳລະ</button>`
            }
            <button type="button" class="btn btn-danger btn-sm" style="font-weight:700;" onclick="deleteBill('${b.id}')" title="ລຶບໃບບິນ">🗑️ ລຶບ</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

let selectedActionBillId = null;
let billRowPressTimer = null;

function handleBillRowClick(billId, event) {
  if (isAndroidOrMobileMode()) {
    openBillActionMenu(billId, event);
  }
}

function handleBillRowPressStart(billId, event) {
  if (event && event.type === 'mousedown' && event.button !== 0) return;
  clearTimeout(billRowPressTimer);
  billRowPressTimer = setTimeout(() => {
    openBillActionMenu(billId);
  }, 450);
}

function handleBillRowPressEnd() {
  clearTimeout(billRowPressTimer);
  billRowPressTimer = null;
}

function openBillActionMenu(billId, event) {
  if (event) {
    event.stopPropagation();
  }
  const bill = state.bills.find(b => b.id === billId);
  if (!bill) return;
  selectedActionBillId = bill.id;

  const modal = document.getElementById('billActionMenuModal');
  const titleEl = document.getElementById('billActionMenuTitle');
  const subEl = document.getElementById('billActionMenuSub');
  const metaEl = document.getElementById('billActionMenuMeta');
  const payDebtBtn = document.getElementById('billActionPayDebtBtn');

  const dateStr = bill.date ? new Date(bill.date).toLocaleDateString('lo-LA', {
    year: 'numeric', month: '2-digit', day: '2-digit'
  }) : '-';
  const itemSummary = (bill.items || []).map(i => `${i.name} (x${i.qty})`).join(', ') || (bill.title || 'ລາຍການຂາຍ');

  if (titleEl) {
    titleEl.textContent = `${bill.id}${bill.customer && bill.customer !== 'ລູກຄ້າທົ່ວໄປ' ? ` • ${bill.customer}` : ''}`;
  }
  if (subEl) {
    subEl.textContent = `ຍອດສຸດທິ: ${formatLAK(bill.total)}`;
  }
  if (metaEl) {
    metaEl.style.display = 'block';
    metaEl.innerHTML = `
      <div><strong>📅 ວັນທີ:</strong> ${escapeHtml(dateStr)}</div>
      <div><strong>👤 ລູກຄ້າ:</strong> ${escapeHtml(bill.customer || 'ລູກຄ້າທົ່ວໄປ')}</div>
      <div><strong>💳 ວິທີຊຳລະ:</strong> ${getPaymentLabel(bill.paymentMethod)}</div>
      <div><strong>📦 ສິນຄ້າ:</strong> ${escapeHtml(itemSummary)}</div>
    `;
  }
  if (payDebtBtn) {
    payDebtBtn.style.display = bill.status === 'unpaid' ? 'inline-flex' : 'none';
  }

  if (modal) {
    modal.classList.add('open');
  }
}

function closeBillActionMenu() {
  document.getElementById('billActionMenuModal')?.classList.remove('open');
}

function handleBillActionPrint() {
  const id = selectedActionBillId;
  closeBillActionMenu();
  if (id) {
    viewBillById(id);
  }
}

function handleBillActionEdit() {
  const id = selectedActionBillId;
  closeBillActionMenu();
  if (id) {
    openEditBillModal(id);
  }
}

function handleBillActionDelete() {
  const id = selectedActionBillId;
  closeBillActionMenu();
  if (id) {
    deleteBill(id);
  }
}

function handleBillActionPayDebt() {
  const id = selectedActionBillId;
  closeBillActionMenu();
  if (!id) return;
  const bill = state.bills.find(b => b.id === id);
  if (!bill) return;
  if (bill.status === 'paid') {
    showToast('ໃບບິນນີ້ຊຳລະເງິນແລ້ວ', 'info');
    return;
  }
  markBillPaid(id);
}

function viewBillById(billId) {
  const bill = state.bills.find(b => b.id === billId);
  if (bill) openReceiptModal(bill);
}

function openEditBillModal(billId) {
  const bill = state.bills.find(b => b.id === billId);
  if (!bill) return;

  const idInput = document.getElementById('editBillIdInput');
  const badge = document.getElementById('editBillModalIdBadge');
  const dateInput = document.getElementById('editBillDateInput');
  const customerInput = document.getElementById('editBillCustomerInput');
  const phoneInput = document.getElementById('editBillPhoneInput');
  const paymentInput = document.getElementById('editBillPaymentInput');
  const statusInput = document.getElementById('editBillStatusInput');
  const totalInput = document.getElementById('editBillTotalInput');

  if (idInput) idInput.value = bill.id;
  if (badge) badge.textContent = bill.id;

  if (dateInput) {
    try {
      const d = new Date(bill.date);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      const localVal = `${year}-${month}-${day}T${hours}:${minutes}`;
      dateInput.value = localVal;
      dateInput.dataset.original = localVal;
    } catch (e) {
      dateInput.value = '';
      dateInput.dataset.original = '';
    }
  }

  if (customerInput) {
    customerInput.value = bill.customer || '';
    customerInput.dataset.original = bill.customer || '';
  }
  if (phoneInput) {
    phoneInput.value = bill.phone || '';
    phoneInput.dataset.original = bill.phone || '';
  }
  if (paymentInput) {
    paymentInput.value = bill.paymentMethod || 'cash';
    paymentInput.dataset.original = bill.paymentMethod || 'cash';
  }
  if (statusInput) {
    statusInput.value = bill.status || 'paid';
    statusInput.dataset.original = bill.status || 'paid';
  }
  if (totalInput) {
    totalInput.value = Number(bill.total || 0);
    totalInput.dataset.original = String(Number(bill.total || 0));
  }

  document.getElementById('editBillModal')?.classList.add('open');
}

function closeEditBillModal() {
  document.getElementById('editBillModal')?.classList.remove('open');
}

function saveEditBillForm(e) {
  if (e && e.preventDefault) e.preventDefault();
  const billId = document.getElementById('editBillIdInput')?.value;
  const bill = state.bills.find(b => b.id === billId);
  if (!bill) return;

  const dateInput = document.getElementById('editBillDateInput');
  const customerInput = document.getElementById('editBillCustomerInput');
  const phoneInput = document.getElementById('editBillPhoneInput');
  const paymentInput = document.getElementById('editBillPaymentInput');
  const statusInput = document.getElementById('editBillStatusInput');
  const totalInput = document.getElementById('editBillTotalInput');

  const newDateVal = dateInput?.value || '';
  const newCustomer = (customerInput?.value || '').trim();
  const newPhone = (phoneInput?.value || '').trim();
  const newPayment = paymentInput?.value || 'cash';
  const newStatus = statusInput?.value || 'paid';
  const newTotal = Number(totalInput?.value || 0);

  if (!newCustomer) {
    showToast('ກະລຸນາປ້ອນຊື່ລູກຄ້າ', 'warning');
    return;
  }
  if (isNaN(newTotal) || newTotal < 0) {
    showToast('ກະລຸນາປ້ອນຍອດເງິນທີ່ຖືກຕ້ອງ', 'warning');
    return;
  }

  if (!bill.editedFields) bill.editedFields = {};

  let hasAnyChange = false;

  if (newDateVal && newDateVal !== dateInput?.dataset.original) {
    bill.edited = true;
    bill.editedFields.date = true;
    bill.date = new Date(newDateVal).toISOString();
    hasAnyChange = true;
  }

  if (newCustomer !== (customerInput?.dataset.original || '').trim()) {
    bill.edited = true;
    bill.editedFields.customer = true;
    bill.customer = newCustomer;
    hasAnyChange = true;
  }

  if (newPhone !== (phoneInput?.dataset.original || '').trim()) {
    bill.edited = true;
    bill.editedFields.phone = true;
    bill.phone = newPhone;
    hasAnyChange = true;
  }

  if (newPayment !== paymentInput?.dataset.original) {
    bill.edited = true;
    bill.editedFields.paymentMethod = true;
    bill.paymentMethod = newPayment;
    hasAnyChange = true;
  }

  if (newStatus !== statusInput?.dataset.original) {
    bill.edited = true;
    bill.editedFields.status = true;
    bill.status = newStatus;
    hasAnyChange = true;
  }

  if (Math.round(newTotal) !== Math.round(Number(totalInput?.dataset.original || 0))) {
    bill.edited = true;
    bill.editedFields.total = true;
    bill.total = newTotal;
    bill.subtotal = newTotal + Number(bill.discount || 0);
    hasAnyChange = true;
  }

  saveState();
  renderSalesHistory();
  if (typeof renderSummaryPage === 'function') renderSummaryPage();
  closeEditBillModal();

  if (hasAnyChange) {
    showToast(`ບັນທຶກການແກ້ໄຂໃບບິນ "${bill.id}" ສຳເລັດແລ້ວ`, 'success');
  } else {
    showToast('ບໍ່ມີການປ່ຽນແປງຂໍ້ມູນ', 'info');
  }
}

function markBillPaid(billId) {
  const bill = state.bills.find(b => b.id === billId);
  if (!bill) return;
  const choice = prompt(
    `ຢືນຢັນການຮັບຊຳລະໜີ້ຈາກ "${bill.customer}" (${formatLAK(bill.total)})\nເລືອກວິທີຮັບເງິນ: ພິມ 1 = ເງິນສົດ | ພິມ 2 = ເງິນໂອນ (BCEL One)`,
    '1'
  );
  if (choice === null) return;
  bill.status = 'paid';
  bill.paymentMethod = choice.trim() === '2' ? 'bcel' : 'cash';
  saveState();
  renderSalesHistory();
  renderSummaryPage();
}

function deleteBill(billId) {
  const bill = state.bills.find(b => b.id === billId);
  if (!bill) return;
  if (confirm(`ຕ້ອງການລຶບໃບບິນ "${bill.id}" (${bill.customer} - ${formatLAK(bill.total)}) ແທ້ບໍ່?`)) {
    state.bills = state.bills.filter(b => b.id !== billId);
    saveState();
    renderSalesHistory();
    renderSummaryPage();
  }
}

function syncBillsToGSheet() {
  const url = getGSheetUrl();
  if (!url) {
    openGSheetModal();
    return;
  }
  syncToGSheetBackground(true);
}

function exportBackupData() {
  const dataStr = JSON.stringify(state, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const today = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `donluang_photo_backup_${today}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importBackupData(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const imported = JSON.parse(e.target.result);
      if (imported.products && imported.machines && imported.bills) {
        state = imported;
        saveState();
        renderPOSProducts();
        renderCatalogTable();
        renderMachines();
        renderSalesHistory();
        renderSummaryPage();
        alert('ນຳເຂົ້າຂໍ້ມູນສຳຮອງສຳເລັດແລ້ວ!');
      } else {
        alert('ໄຟລ໌ຂໍ້ມູນບໍ່ຖືກຕ້ອງ!');
      }
    } catch (err) {
      alert('ບໍ່ສາມາດອ່ານໄຟລ໌ JSON ໄດ້!');
    }
  };
  reader.readAsText(file);
}

// ==========================================
// 5. FINANCIAL SUMMARY (INCOME, EXPENSE, P&L)
// ==========================================
const UTILITY_KEYS = new Set(['electricity', 'water', 'internet', 'garbage', 'utilities']);

const UTILITY_SUB_CATEGORIES = {
  electricity: { key: 'electricity', label: 'ຄ່າໄຟຟ້າ', shortLabel: 'ໄຟຟ້າ', icon: '⚡', color: '#c2410c', bg: '#fff7ed', border: '#fdba74' },
  water: { key: 'water', label: 'ຄ່ານ້ຳປະປາ', shortLabel: 'ນ້ຳປະປາ', icon: '💧', color: '#0369a1', bg: '#f0f9ff', border: '#bae6fd' },
  internet: { key: 'internet', label: 'ຄ່າອິນເຕີເນັດ', shortLabel: 'ອິນເຕີເນັດ', icon: '🌐', color: '#4338ca', bg: '#eef2ff', border: '#c7d2fe' },
  garbage: { key: 'garbage', label: 'ຄ່າຂີ້ເຫຍື້ອ', shortLabel: 'ຂີ້ເຫຍື້ອ', icon: '🗑️', color: '#475569', bg: '#f8fafc', border: '#cbd5e1' }
};

function getUtilitySubLabel(key) {
  return UTILITY_SUB_CATEGORIES[key]?.shortLabel || UTILITY_SUB_CATEGORIES[key]?.label || key;
}

let selectedUtilitySubFilter = 'all'; // 'all' | 'electricity' | 'water' | 'internet' | 'garbage'

function setUtilitySubFilter(subKey) {
  selectedUtilitySubFilter = subKey;
  expandedExpenseCategories.add('utilities');
  renderSummaryPage();
}

const EXPENSE_CATEGORIES = [
  { key: 'salary', label: 'ເງິນເດືອນ', icon: '👨‍💼', bg: '#fee2e2', border: '#fca5a5', color: '#b91c1c' },
  { key: 'utilities', label: 'ຄ່ານ້ຳ-ໄຟ-ເນັດ-ຂີ້ເຫຍື້ອ', icon: '⚡💧', bg: '#ffedd5', border: '#fed7aa', color: '#c2410c', isUtility: true },
  { key: 'maintenance', label: 'ຄ່າສ້ອມແປງ', icon: '🛠️', bg: '#fef9c3', border: '#fde047', color: '#854d0e' },
  { key: 'stock_purchase', label: 'ຊື້ສິນຄ້າເຂົ້າຮ້ານ', icon: '🛒', bg: '#ffedd5', border: '#fed7aa', color: '#9a3412' },
  { key: 'other', label: 'ອື່ນໆ', icon: '📦', bg: '#f3f4f6', border: '#d1d5db', color: '#6b7280' }
];

const CATEGORY_PALETTES = [
  { bg: '#ecfdf5', border: '#a7f3d0', color: '#047857' }, // Emerald / Green
  { bg: '#f0f9ff', border: '#bae6fd', color: '#0284c7' }, // Sky / Blue
  { bg: '#f5f3ff', border: '#ddd6fe', color: '#7c3aed' }, // Purple
  { bg: '#fff7ed', border: '#fed7aa', color: '#c2410c' }, // Orange
  { bg: '#fef2f2', border: '#fecaca', color: '#dc2626' }, // Rose / Red
  { bg: '#fdf4ff', border: '#f5d0fe', color: '#a21caf' }, // Fuchsia
  { bg: '#ecfeff', border: '#a5f3fc', color: '#0e7490' }, // Cyan
  { bg: '#fefce8', border: '#fef08a', color: '#a16207' }  // Amber
];

function getActiveIncomeCategories() {
  const cats = (state.categories && state.categories.length > 0) ? state.categories : DEFAULT_CATEGORIES;
  const list = cats.map((c, idx) => {
    const palette = CATEGORY_PALETTES[idx % CATEGORY_PALETTES.length];
    return {
      key: c.id,
      label: c.name,
      icon: c.icon || '🏷️',
      bg: palette.bg,
      border: palette.border,
      color: palette.color
    };
  });
  list.push({
    key: 'other',
    label: 'ລາຍຮັບອື່ນໆ',
    icon: '📦',
    bg: '#f8fafc',
    border: '#e2e8f0',
    color: '#475569'
  });
  return list;
}

const expandedExpenseCategories = new Set();
const expandedIncomeCategories = new Set();

// Drilldown state for summary stat cards (Customer Debt vs Payable Debt)
let activeFinancialDrilldown = null; // null | 'customerDebt' | 'payableDebt'

function toggleCustomerDebtDetail() {
  activeFinancialDrilldown = (activeFinancialDrilldown === 'customerDebt') ? null : 'customerDebt';
  renderSummaryPage();
  if (activeFinancialDrilldown) {
    setTimeout(() => {
      document.getElementById('financialDrilldownContainer')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 50);
  }
}

function togglePayableDebtDetail() {
  activeFinancialDrilldown = (activeFinancialDrilldown === 'payableDebt') ? null : 'payableDebt';
  renderSummaryPage();
  if (activeFinancialDrilldown) {
    setTimeout(() => {
      document.getElementById('financialDrilldownContainer')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 50);
  }
}

function closeFinancialDrilldown() {
  activeFinancialDrilldown = null;
  renderSummaryPage();
}

function markProductPaid(productId) {
  const prod = state.products.find(p => p.id === productId);
  if (!prod) return;
  if (!confirm(`ຢືນຢັນການຊຳລະໜີ້/ປົດໜີ້ສິນຄ້າ "${prod.name}" ແມ່ນບໍ່?`)) return;
  prod.isUnpaid = false;
  prod.unpaidAmount = 0;
  saveState();
  renderSummaryPage();
  if (typeof renderCatalog === 'function') renderCatalog();
  showToast(`ປົດໜີ້ສິນຄ້າ "${prod.name}" ສຳເລັດແລ້ວ`, 'success');
}

function markExpensePaid(expenseId) {
  const exp = state.expenses.find(e => e.id === expenseId);
  if (!exp) return;
  if (!confirm(`ຢືນຢັນການປົດໜີ້/ຊຳລະລາຍຈ່າຍ "${exp.title}" ແມ່ນບໍ່?`)) return;
  exp.status = 'paid';
  exp.isUnpaid = false;
  saveState();
  renderSummaryPage();
  showToast(`ປົດໜີ້ລາຍຈ່າຍ "${exp.title}" ສຳເລັດແລ້ວ`, 'success');
}

function renderCustomerDebtDrilldownHtml(unpaidBills, totalCustomerDebt) {
  const rows = (unpaidBills && unpaidBills.length > 0)
    ? unpaidBills.map(b => {
        const dStr = new Date(b.date).toLocaleDateString('lo-LA', {
          year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
        });
        const itemSummary = (b.items || []).map(i => `${i.name} (x${i.qty})`).join(', ');
        return `
          <tr>
            <td style="font-weight:700;color:var(--text-main);white-space:nowrap;">${escapeHtml(b.id)}</td>
            <td style="white-space:nowrap;font-size:0.85rem;color:var(--text-muted);">${dStr}</td>
            <td>
              <div style="font-weight:700;color:var(--text-main);">${escapeHtml(b.customer || '-')}</div>
              <div style="font-size:0.75rem;color:var(--text-muted);">${escapeHtml(b.phone || '-')}</div>
            </td>
            <td style="max-width:280px;">
              <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:0.85rem;" title="${escapeHtml(itemSummary)}">
                ${escapeHtml(itemSummary) || '-'}
              </div>
            </td>
            <td style="text-align:right;font-weight:900;color:#dc2626;font-variant-numeric:tabular-nums;font-size:0.95rem;">
              ${formatLAK(b.total)}
            </td>
            <td style="text-align:center;">
              <div style="display:flex;gap:0.35rem;justify-content:center;flex-wrap:wrap;">
                <button class="btn btn-success btn-sm" onclick="markBillPaid('${b.id}')" title="ຮັບຊຳລະເງິນ ແລະ ປ່ຽນສະຖານະເປັນຊຳລະແລ້ວ">
                  💵 ຮັບຊຳລະ
                </button>
                <button class="btn btn-outline btn-sm" onclick="viewBillById('${b.id}')" title="ເບິ່ງ / ພິມໃບບິນ">
                  🖨️ ບິນ
                </button>
                <button class="btn btn-outline btn-sm" style="border-color:#fca5a5;color:#b91c1c;background:#fef2f2;" onclick="openEditBillModal('${b.id}')" title="ແກ້ໄຂຂໍ້ມູນໃບບິນ">
                  ✏️ ແກ້ໄຂ
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join('')
    : `<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--text-muted);font-size:0.9rem;">🎉 ຍອດຢ້ຽມ! ບໍ່ມີໃບບິນທີ່ລູກຄ້າຕິດໜີ້ (ໜີ້ຄ້າງຮັບ = 0)</td></tr>`;

  return `
    <div style="background:#ffffff;border:1.5px solid #fca5a5;border-radius:12px;padding:1.1rem;box-shadow:0 4px 14px rgba(220,38,38,0.08);animation:fadeIn 0.2s ease;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.85rem;padding-bottom:0.65rem;border-bottom:1.5px dashed #fee2e2;">
        <div style="display:flex;align-items:center;gap:0.6rem;">
          <span style="font-size:1.4rem;">⏳</span>
          <div>
            <div style="font-size:1.05rem;font-weight:900;color:#991b1b;">
              ລາຍການໃບບິນທີ່ລູກຄ້າຕິດໜີ້ (ໜີ້ຄ້າງຮັບ)
            </div>
            <div style="font-size:0.8rem;color:#b91c1c;">
              ທັງໝົດ <strong>${unpaidBills.length}</strong> ໃບບິນ | ມູນຄ່າລວມ: <strong style="font-size:0.95rem;font-variant-numeric:tabular-nums;">${formatLAK(totalCustomerDebt)}</strong>
            </div>
          </div>
        </div>
        <button class="btn btn-outline btn-sm" onclick="closeFinancialDrilldown()" style="border-color:#cbd5e1;color:#64748b;font-weight:700;">
          ✕ ປິດ
        </button>
      </div>

      <div style="overflow-x:auto;">
        <table class="data-table" style="width:100%;font-size:0.85rem;">
          <thead>
            <tr style="background:#fef2f2;color:#991b1b;">
              <th style="width:110px;">ເລກທີບິນ</th>
              <th style="width:130px;">ວັນທີ & ເວລາ</th>
              <th>ຊື່ລູກຄ້າ & ເບີໂທ</th>
              <th>ລາຍການສິນຄ້າ / ບໍລິການ</th>
              <th style="text-align:right;width:130px;">ຍອດຄ້າງຊຳລະ</th>
              <th style="text-align:center;width:190px;">ຈັດການ</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderPayableDebtDrilldownHtml(unpaidProducts, unpaidExpenses, payableDebt) {
  const prodRows = (unpaidProducts || []).map(p => {
    const amt = (p.unpaidAmount !== undefined && p.unpaidAmount !== null && p.unpaidAmount > 0)
      ? Number(p.unpaidAmount)
      : (Number(p.cost || 0) * (p.trackStock ? Math.max(1, Number(p.stock || 0)) : 1));
    return `
      <tr>
        <td style="font-weight:700;color:#7c3aed;white-space:nowrap;">
          📦 ${escapeHtml(p.code || p.id)}
        </td>
        <td>
          <div style="font-weight:700;color:var(--text-main);">${escapeHtml(p.name)}</div>
          <div style="font-size:0.75rem;color:var(--text-muted);">${escapeHtml(p.category || 'ສິນຄ້າ')}</div>
        </td>
        <td>
          <span style="font-weight:600;color:#475569;">${escapeHtml(p.supplier || '-')}</span>
        </td>
        <td style="font-size:0.85rem;color:var(--text-muted);">
          ${p.trackStock ? `${formatProductStock(p)} (${p.unit || 'ອັນ'})` : 'ບໍ່ນັບສະຕັອກ'}
          <div style="font-size:0.75rem;color:#64748b;">ຕົ້ນທຶນ: ${formatLAK(p.cost)}/${p.unit || 'ອັນ'}</div>
        </td>
        <td style="text-align:right;font-weight:900;color:#9333ea;font-variant-numeric:tabular-nums;font-size:0.95rem;">
          ${formatLAK(amt)}
        </td>
        <td style="text-align:center;">
          <div style="display:flex;gap:0.35rem;justify-content:center;flex-wrap:wrap;">
            <button class="btn btn-success btn-sm" onclick="markProductPaid('${p.id}')" title="ປົດໜີ້ / ຊຳລະຄ່າສິນຄ້ານີ້ແລ້ວ">
              💵 ປົດໜີ້ແລ້ວ
            </button>
            <button class="btn btn-outline btn-sm" style="border-color:#d8b4fe;color:#7c3aed;background:#faf5ff;" onclick="openProductModal('${p.id}')" title="ແກ້ໄຂຂໍ້ມູນສິນຄ້າ / ປັບຍອດຄ້າງຈ່າຍ">
              ✏️ ແກ້ໄຂ
            </button>
          </div>
        </td>
      </tr>
    `;
  });

  const expRows = (unpaidExpenses || []).map(e => {
    return `
      <tr>
        <td style="font-weight:700;color:#b91c1c;white-space:nowrap;">
          💸 ${escapeHtml(e.id)}
        </td>
        <td>
          <div style="font-weight:700;color:var(--text-main);">${escapeHtml(e.title || 'ລາຍຈ່າຍ')}</div>
          <div style="font-size:0.75rem;color:var(--text-muted);">${escapeHtml(e.note || '')}</div>
        </td>
        <td>
          <span class="status-pill" style="background:#fee2e2;color:#b91c1c;font-size:0.75rem;">${escapeHtml(e.category || 'ລາຍຈ່າຍ')}</span>
        </td>
        <td style="font-size:0.85rem;color:var(--text-muted);">
          ${escapeHtml(e.date || '-')}
        </td>
        <td style="text-align:right;font-weight:900;color:#dc2626;font-variant-numeric:tabular-nums;font-size:0.95rem;">
          ${formatLAK(e.amount)}
        </td>
        <td style="text-align:center;">
          <div style="display:flex;gap:0.35rem;justify-content:center;flex-wrap:wrap;">
            <button class="btn btn-success btn-sm" onclick="markExpensePaid('${e.id}')" title="ປົດໜີ້ / ຊຳລະລາຍຈ່າຍນີ້ແລ້ວ">
              💵 ປົດໜີ້ແລ້ວ
            </button>
            <button class="btn btn-outline btn-sm" style="border-color:#fca5a5;color:#b91c1c;background:#fef2f2;" onclick="openExpenseModal('${e.id}')" title="ແກ້ໄຂລາຍຈ່າຍ">
              ✏️ ແກ້ໄຂ
            </button>
          </div>
        </td>
      </tr>
    `;
  });

  const allRows = [...prodRows, ...expRows];
  const totalCount = (unpaidProducts ? unpaidProducts.length : 0) + (unpaidExpenses ? unpaidExpenses.length : 0);

  const tableBody = allRows.length > 0
    ? allRows.join('')
    : `<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--text-muted);font-size:0.9rem;">🎉 ຍອດຢ້ຽມ! ບໍ່ມີສິນຄ້າ ຫຼື ບິນຄ້າງຈ່າຍ (ໜີ້ຕ້ອງສົ່ງ = 0)</td></tr>`;

  return `
    <div style="background:#ffffff;border:1.5px solid #d8b4fe;border-radius:12px;padding:1.1rem;box-shadow:0 4px 14px rgba(147,51,234,0.08);animation:fadeIn 0.2s ease;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.85rem;padding-bottom:0.65rem;border-bottom:1.5px dashed #f3e8ff;">
        <div style="display:flex;align-items:center;gap:0.6rem;">
          <span style="font-size:1.4rem;">📝</span>
          <div>
            <div style="font-size:1.05rem;font-weight:900;color:#6b21a8;">
              ລາຍການຊື້ເຄື່ອງເຂົ້າຮ້ານ / ບິນທີ່ຍັງຄ້າງຈ່າຍ (ໜີ້ຕ້ອງສົ່ງ)
            </div>
            <div style="font-size:0.8rem;color:#7e22ce;">
              ທັງໝົດ <strong>${totalCount}</strong> ລາຍການ | ມູນຄ່າລວມ: <strong style="font-size:0.95rem;font-variant-numeric:tabular-nums;">${formatLAK(payableDebt)}</strong>
            </div>
          </div>
        </div>
        <button class="btn btn-outline btn-sm" onclick="closeFinancialDrilldown()" style="border-color:#cbd5e1;color:#64748b;font-weight:700;">
          ✕ ປິດ
        </button>
      </div>

      <div style="overflow-x:auto;">
        <table class="data-table" style="width:100%;font-size:0.85rem;">
          <thead>
            <tr style="background:#faf5ff;color:#6b21a8;">
              <th style="width:120px;">ລະຫັດ / ປະເພດ</th>
              <th>ລາຍການສິນຄ້າ / ລາຍຈ່າຍ</th>
              <th>ໝວດໝູ່ / ຜູ້ສະໜອງ</th>
              <th>ຈຳນວນ & ຕົ້ນທຶນ</th>
              <th style="text-align:right;width:130px;">ມູນຄ່າໜີ້ຄ້າງຈ່າຍ</th>
              <th style="text-align:center;width:190px;">ຈັດການ</th>
            </tr>
          </thead>
          <tbody>
            ${tableBody}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function toggleExpenseCategoryAccordion(catKey) {
  if (expandedExpenseCategories.has(catKey)) {
    expandedExpenseCategories.delete(catKey);
  } else {
    expandedExpenseCategories.add(catKey);
  }
  renderSummaryPage();
}

function toggleIncomeCategoryAccordion(catKey) {
  if (expandedIncomeCategories.has(catKey)) {
    expandedIncomeCategories.delete(catKey);
  } else {
    expandedIncomeCategories.add(catKey);
  }
  renderSummaryPage();
}

function getExpenseCategoryMeta(catKey) {
  if (UTILITY_SUB_CATEGORIES[catKey]) {
    const sub = UTILITY_SUB_CATEGORIES[catKey];
    return { key: catKey, label: sub.label, icon: sub.icon, color: sub.color, bg: sub.bg, border: sub.border };
  }
  return EXPENSE_CATEGORIES.find(c => c.key === catKey) || EXPENSE_CATEGORIES[EXPENSE_CATEGORIES.length - 1];
}

function populateSummaryPeriodOptions() {
  const mSelect = document.getElementById('summaryMonthPicker');
  const ySelect = document.getElementById('summaryYearPicker');
  if (!mSelect || !ySelect) return;

  const monthsSet = new Set();
  const yearsSet = new Set();
  const now = new Date();
  const nowMonth = now.toISOString().slice(0, 7);
  const nowYear = String(now.getFullYear());
  monthsSet.add(nowMonth);
  yearsSet.add(nowYear);

  (state.bills || []).forEach(b => {
    if (b.date && b.date.length >= 7) {
      monthsSet.add(b.date.slice(0, 7));
      yearsSet.add(b.date.slice(0, 4));
    }
  });
  (state.expenses || []).forEach(e => {
    if (e.date && e.date.length >= 7) {
      monthsSet.add(e.date.slice(0, 7));
      yearsSet.add(e.date.slice(0, 4));
    }
  });

  const curM = mSelect.value || nowMonth;
  const curY = ySelect.value || nowYear;

  const sortedMonths = Array.from(monthsSet).sort().reverse();
  mSelect.innerHTML = sortedMonths.map(ym => {
    const [y, m] = ym.split('-');
    return `<option value="${ym}">📅 ເດືອນ ${m}/${y}</option>`;
  }).join('');
  if (sortedMonths.includes(curM)) mSelect.value = curM;

  const sortedYears = Array.from(yearsSet).sort().reverse();
  ySelect.innerHTML = sortedYears.map(y => {
    return `<option value="${y}">🏛️ ປີ ${y}</option>`;
  }).join('');
  if (sortedYears.includes(curY)) ySelect.value = curY;
}

function onSummaryPeriodTypeChange() {
  const pType = document.getElementById('summaryPeriodType')?.value || 'all';
  const dayPicker = document.getElementById('summaryDayPicker');
  const monthPicker = document.getElementById('summaryMonthPicker');
  const yearPicker = document.getElementById('summaryYearPicker');

  if (dayPicker) dayPicker.style.display = pType === 'day' ? 'inline-block' : 'none';
  if (monthPicker) monthPicker.style.display = pType === 'month' ? 'inline-block' : 'none';
  if (yearPicker) yearPicker.style.display = pType === 'year' ? 'inline-block' : 'none';

  if (pType === 'day' && dayPicker && !dayPicker.value) {
    const curMonth = monthPicker?.value;
    const nowStr = new Date().toISOString().slice(0, 10);
    if (curMonth && nowStr.startsWith(curMonth)) {
      dayPicker.value = nowStr;
    } else if (curMonth) {
      dayPicker.value = `${curMonth}-01`;
    } else {
      dayPicker.value = nowStr;
    }
  }

  renderSummaryPage();
}

function focusSummaryDetail(targetKey) {
  const map = {
    expense: 'detailSectionExpense',
    cost: 'detailSectionCost',
    income: 'detailSectionIncome',
    profit: 'detailSectionProfit'
  };
  const el = document.getElementById(map[targetKey]);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  el.classList.add('detail-highlight-flash');
  setTimeout(() => {
    el.classList.remove('detail-highlight-flash');
  }, 1800);
}

function renderSummaryPage() {
  if (!Array.isArray(state.expenses)) state.expenses = [];

  populateSummaryPeriodOptions();

  const pType = document.getElementById('summaryPeriodType')?.value || 'all';
  const dayPicker = document.getElementById('summaryDayPicker');
  const monthPicker = document.getElementById('summaryMonthPicker');
  const yearPicker = document.getElementById('summaryYearPicker');

  if (dayPicker) dayPicker.style.display = pType === 'day' ? 'inline-block' : 'none';
  if (monthPicker) monthPicker.style.display = pType === 'month' ? 'inline-block' : 'none';
  if (yearPicker) yearPicker.style.display = pType === 'year' ? 'inline-block' : 'none';

  const filterDay = dayPicker?.value || '';
  const filterMonth = monthPicker?.value || '';
  const filterYear = yearPicker?.value || '';

  const todayStr = new Date().toISOString().slice(0, 10);
  const targetDay = filterDay || todayStr;
  const targetMonth = filterMonth || todayStr.slice(0, 7);
  const targetYear = filterYear || todayStr.slice(0, 4);

  // Compute period label for headers & KPIs
  let periodLabel = 'ທຸກເວລາ';
  if (pType === 'today') {
    periodLabel = 'ມື້ນີ້';
  } else if (pType === 'day') {
    const [y, m, d] = targetDay.split('-');
    periodLabel = `ວັນທີ ${d}/${m}/${y}`;
  } else if (pType === 'month') {
    const [y, m] = targetMonth.split('-');
    periodLabel = `ເດືອນ ${m}/${y}`;
  } else if (pType === 'year') {
    periodLabel = `ປີ ${targetYear}`;
  }

  const periodTagEl = document.getElementById('summaryReportPeriodTag');
  if (periodTagEl) periodTagEl.textContent = `ໄລຍະ: ${periodLabel}`;
  const currentPeriodBadge = document.getElementById('summaryCurrentPeriodBadge');
  if (currentPeriodBadge) currentPeriodBadge.textContent = `ສະຫຼຸບຂໍ້ມູນ: ${periodLabel}`;

  const isItemInPeriod = (dateStr) => {
    if (!dateStr) return false;
    const d = dateStr.slice(0, 10);
    if (pType === 'today') return d === todayStr;
    if (pType === 'day') return d === targetDay;
    if (pType === 'month') return d.slice(0, 7) === targetMonth;
    if (pType === 'year') return d.slice(0, 4) === targetYear;
    return true; // 'all'
  };

  const monthBills = state.bills.filter(b => isItemInPeriod(b.date));
  const monthExpenses = state.expenses.filter(e => isItemInPeriod(e.date));

  // ========================================================
  // 0. Compute 8 Executive Financial Statistics
  // ========================================================
  // 1. ຕົ້ນທຶນສິນຄ້າໃນສາງ
  const totalShopInventoryCost = (state.products || []).reduce((sum, p) => {
    const qty = p.trackStock ? Math.max(0, Number(p.stock || 0)) : 1;
    return sum + (Number(p.cost || 0) * qty);
  }, 0);
  const totalShopInventoryCount = (state.products || []).length;

  // 2. ມູນຄ່າອຸປະກອນ & ຈັກ
  const totalMachineValue = (state.machines || []).reduce((sum, m) => sum + (Number(m.price || 0) * (Number(m.qty) || 1)), 0);
  const totalMachineCount = (state.machines || []).reduce((sum, m) => sum + (Number(m.qty) || 1), 0);

  // 3. ເງິນສົດຢູ່ໃນຮ້ານ
  const cashIn = (state.bills || []).filter(b => b.status === 'paid' && b.paymentMethod === 'cash').reduce((s, b) => s + Number(b.total || 0), 0);
  const cashOut = (state.expenses || []).filter(e => e.status !== 'unpaid' && !e.isUnpaid && (!e.paymentMethod || e.paymentMethod === 'cash')).reduce((s, e) => s + Number(e.amount || 0), 0);
  const cashInStore = Math.max(0, cashIn - cashOut);

  // 4. ຍອດຍົກມາ (ກຳໄລສະສົມກ່ອນໜ້າໄລຍະເວລານີ້)
  let broughtForward = 0;
  if (pType !== 'all') {
    const isPrior = (dateStr) => {
      if (!dateStr) return false;
      const d = dateStr.slice(0, 10);
      if (pType === 'today') return d < todayStr;
      if (pType === 'day') return d < targetDay;
      if (pType === 'month') return d.slice(0, 7) < targetMonth;
      if (pType === 'year') return d.slice(0, 4) < targetYear;
      return false;
    };

    const priorBills = (state.bills || []).filter(b => isPrior(b.date));
    const priorIncome = priorBills.reduce((s, b) => s + Number(b.total || 0), 0);
    let priorProdCost = 0;
    priorBills.forEach(b => {
      (b.items || []).forEach(it => {
        const p = state.products.find(x => x.id === it.id);
        priorProdCost += (p ? Number(p.cost || 0) : 0) * Number(it.qty || 0);
      });
    });
    const priorExpenses = (state.expenses || []).filter(e => isPrior(e.date)).reduce((s, e) => s + Number(e.amount || 0), 0);
    broughtForward = priorIncome - (priorProdCost + priorExpenses);
  }

  // 5. ໜີ້ຄ້າງຮັບ (ລູກຄ້າຕິດໜີ້)
  const unpaidBills = (state.bills || []).filter(b => b.status === 'unpaid');
  const totalCustomerDebt = unpaidBills.reduce((s, b) => s + Number(b.total || 0), 0);
  const customerDebtCount = unpaidBills.length;

  // 6. ໜີ້ຕ້ອງສົ່ງ / ຄ້າງຈ່າຍ (ສິນຄ້າທີ່ຊື້ແລ້ວຍັງບໍ່ທັນໄດ້ຈ່າຍເງິນ)
  const unpaidProducts = (state.products || []).filter(p => p.isUnpaid);
  const unpaidProductsDebt = unpaidProducts.reduce((sum, p) => {
    const amt = (p.unpaidAmount !== undefined && p.unpaidAmount !== null && p.unpaidAmount > 0)
      ? Number(p.unpaidAmount)
      : (Number(p.cost || 0) * (p.trackStock ? Math.max(1, Number(p.stock || 0)) : 1));
    return sum + amt;
  }, 0);
  const unpaidExpenses = (state.expenses || []).filter(e => e.status === 'unpaid' || !!e.isUnpaid);
  const unpaidExpenseDebt = unpaidExpenses.reduce((s, e) => s + Number(e.amount || 0), 0);
  const payableDebt = unpaidProductsDebt + unpaidExpenseDebt;
  const payableCount = unpaidProducts.length + unpaidExpenses.length;

  // 7. ແຜນທີ່ຈະຈັດຊື້ (ສິນຄ້າຍັງບໍ່ໄດ້ຊື້)
  const pendingPlanItems = (state.purchasePlan || []).filter(it => !it.purchased);
  const pendingPlanTotal = pendingPlanItems.reduce((s, it) => s + (Number(it.price || 0) * Number(it.qty || 0)), 0);
  const pendingPlanCount = pendingPlanItems.length;

  // 8. ເງິນທີ່ຊື້ສິນຄ້າແລ້ວໃນແຜນ
  const purchasedPlanItems = (state.purchasePlan || []).filter(it => it.purchased);
  const purchasedPlanTotal = purchasedPlanItems.reduce((s, it) => s + (Number(it.price || 0) * Number(it.qty || 0)), 0);
  const purchasedPlanCount = purchasedPlanItems.length;

  // Render to DOM elements
  const totalCombinedAssetCost = totalShopInventoryCost + totalMachineValue;
  const elCombined = document.getElementById('finStatCombinedAssetCost');
  if (elCombined) elCombined.textContent = formatLAK(totalCombinedAssetCost);

  const elShopCost = document.getElementById('finStatShopInventoryCost');
  const elShopCount = document.getElementById('finStatShopInventoryCount');
  if (elShopCost) elShopCost.textContent = formatLAK(totalShopInventoryCost);
  if (elShopCount) elShopCount.textContent = '';

  const elMachVal = document.getElementById('finStatMachineValue');
  const elMachCount = document.getElementById('finStatMachineCount');
  if (elMachVal) elMachVal.textContent = formatLAK(totalMachineValue);
  if (elMachCount) elMachCount.textContent = '';

  const elCash = document.getElementById('finStatCashInStore');
  const elCashSub = document.getElementById('finStatCashSub');
  if (elCash) elCash.textContent = formatLAK(cashInStore);
  if (elCashSub) elCashSub.textContent = `ເງິນສົດຕົວຈິງ (ຮັບ ${formatLAK(cashIn)} - ຈ່າຍ ${formatLAK(cashOut)})`;

  const elBrought = document.getElementById('finStatBroughtForward');
  const elBroughtSub = document.getElementById('finStatBroughtSub');
  if (elBrought) elBrought.textContent = `${broughtForward >= 0 ? '+' : '-'}${formatLAK(Math.abs(broughtForward))}`;
  if (elBroughtSub) {
    if (pType === 'all') {
      elBroughtSub.textContent = 'ສະຫຼຸບທຸກເວລາ (ເລີ່ມຕົ້ນ)';
    } else {
      elBroughtSub.textContent = `ກຳໄລສະສົມກ່ອນ ${periodLabel}`;
    }
  }

  const elDebt = document.getElementById('finStatCustomerDebt');
  const elDebtCount = document.getElementById('finStatCustomerDebtCount');
  if (elDebt) elDebt.textContent = formatLAK(totalCustomerDebt);
  if (elDebtCount) elDebtCount.textContent = `${customerDebtCount} ໃບບິນຄ້າງຊຳລະ`;

  const elPayable = document.getElementById('finStatPayableDebt');
  const elPayableCount = document.getElementById('finStatPayableDebtCount');
  if (elPayable) elPayable.textContent = formatLAK(payableDebt);
  if (elPayableCount) {
    if (payableDebt > 0) {
      elPayableCount.textContent = `${payableCount} ລາຍການສິນຄ້າຄ້າງຈ່າຍ`;
    } else {
      elPayableCount.textContent = 'ບໍ່ມີສິນຄ້າຄ້າງຈ່າຍ';
    }
  }

  const elPlan = document.getElementById('finStatPendingPlan');
  const elPlanCount = document.getElementById('finStatPendingPlanCount');
  if (elPlan) elPlan.textContent = formatLAK(pendingPlanTotal);
  if (elPlanCount) elPlanCount.textContent = `${pendingPlanCount} ລາຍການລໍຖ້າຊື້`;

  const elBought = document.getElementById('finStatPurchasedPlan');
  const elBoughtCount = document.getElementById('finStatPurchasedPlanCount');
  if (elBought) elBought.textContent = formatLAK(purchasedPlanTotal);
  if (elBoughtCount) elBoughtCount.textContent = `${purchasedPlanCount} ລາຍການຊື້ແລ້ວ`;

  // Update Drilldown Container & Card Active states
  const cDebtCard = document.getElementById('finCardCustomerDebt');
  const pDebtCard = document.getElementById('finCardPayableDebt');
  if (cDebtCard) cDebtCard.classList.toggle('is-active', activeFinancialDrilldown === 'customerDebt');
  if (pDebtCard) pDebtCard.classList.toggle('is-active', activeFinancialDrilldown === 'payableDebt');

  const drilldownEl = document.getElementById('financialDrilldownContainer');
  if (drilldownEl) {
    if (!activeFinancialDrilldown) {
      drilldownEl.style.display = 'none';
      drilldownEl.innerHTML = '';
    } else if (activeFinancialDrilldown === 'customerDebt') {
      drilldownEl.style.display = 'block';
      drilldownEl.innerHTML = renderCustomerDebtDrilldownHtml(unpaidBills, totalCustomerDebt);
    } else if (activeFinancialDrilldown === 'payableDebt') {
      drilldownEl.style.display = 'block';
      drilldownEl.innerHTML = renderPayableDebtDrilldownHtml(unpaidProducts, unpaidExpenses, payableDebt);
    }
  }

  // Calculate total metrics for the selected period (month or all)
  const periodIncome = monthBills.reduce((s, b) => s + Number(b.total || 0), 0);
  let periodProdCost = 0;
  monthBills.forEach(b => {
    (b.items || []).forEach(it => {
      const p = state.products.find(x => x.id === it.id);
      periodProdCost += (p ? Number(p.cost || 0) : 0) * Number(it.qty || 0);
    });
  });
  const periodOpExp = monthExpenses.reduce((s, e) => s + Number(e.amount || 0), 0);
  const periodAllCost = periodProdCost + periodOpExp;
  const periodNet = periodIncome - periodAllCost;
  const periodMarginPct = periodIncome > 0
    ? ((periodNet / periodIncome) * 100).toFixed(1) + '%'
    : '0%';

  // Update Hero KPI Overview Cards
  const kpiInc = document.getElementById('kpiHeroIncome');
  const kpiIncCount = document.getElementById('kpiHeroIncomeCount');
  if (kpiInc) kpiInc.textContent = formatLAK(periodIncome);
  if (kpiIncCount) kpiIncCount.textContent = `${monthBills.length} ລາຍການຂາຍ (${periodLabel})`;

  const kpiCost = document.getElementById('kpiHeroCost');
  const kpiCostSub = document.getElementById('kpiHeroCostBreakdown');
  if (kpiCost) kpiCost.textContent = formatLAK(periodAllCost);
  if (kpiCostSub) kpiCostSub.textContent = `ຕົ້ນທຶນ: ${formatLAK(periodProdCost)} | ລາຍຈ່າຍ: ${formatLAK(periodOpExp)}`;

  const kpiNet = document.getElementById('kpiHeroNet');
  const kpiNetCard = document.getElementById('kpiHeroNetCard');
  const kpiNetStatus = document.getElementById('kpiHeroNetStatus');
  if (kpiNet) kpiNet.textContent = `${periodNet >= 0 ? '+' : '-'}${formatLAK(Math.abs(periodNet))}`;
  if (kpiNetCard) {
    kpiNetCard.classList.toggle('is-profit', periodNet >= 0);
    kpiNetCard.classList.toggle('is-loss', periodNet < 0);
  }
  if (kpiNetStatus) {
    kpiNetStatus.innerHTML = periodNet >= 0
      ? `<span style="color:#047857;font-weight:800;">🟢 ກຳໄລສຸດທິ (ອັດຕາ: +${periodMarginPct}) - ${periodLabel}</span>`
      : `<span style="color:#b91c1c;font-weight:800;">🔴 ຂາດທຶນ (ອັດຕາ: ${periodMarginPct}) - ${periodLabel}</span>`;
  }

  // Update Formula Flow Bar
  const fInc = document.getElementById('formulaIncome');
  const fCost = document.getElementById('formulaProdCost');
  const fExp = document.getElementById('formulaOpExp');
  const fNet = document.getElementById('formulaNet');
  const fBox = document.getElementById('formulaResultBox');
  if (fInc) fInc.textContent = `+${formatLAK(periodIncome)}`;
  if (fCost) fCost.textContent = `-${formatLAK(periodProdCost)}`;
  if (fExp) fExp.textContent = `-${formatLAK(periodOpExp)}`;
  if (fNet) fNet.textContent = `${periodNet >= 0 ? '+' : '-'}${formatLAK(Math.abs(periodNet))}`;
  if (fBox) {
    fBox.classList.toggle('is-profit', periodNet >= 0);
    fBox.classList.toggle('is-loss', periodNet < 0);
  }

  // 1. Profit Breakdown Table was removed as requested (displayed in top KPI cards)

  // ========================================================
  // 2. Render Expense Category Accordion List (LEFT WINDOW)
  // ========================================================
  const expAccordionListEl = document.getElementById('expenseCategoryAccordionList');
  
  let grandTotalExpense = periodOpExp;

  if (expAccordionListEl) {
    const expenseDataMap = {};
    
    EXPENSE_CATEGORIES.forEach(cat => {
      expenseDataMap[cat.key] = {
        meta: cat,
        items: [],
        total: 0
      };
    });

    // 2.1 Populate regular operational expenses from monthExpenses
    monthExpenses.forEach(e => {
      let key = e.category;
      let subKey = null;

      if (UTILITY_KEYS.has(key)) {
        subKey = (key === 'utilities') ? 'electricity' : key;
        key = 'utilities';
      } else if (key === 'purchase' || key === 'stock') {
        key = 'stock_purchase';
      } else if (!expenseDataMap[key]) {
        key = 'other';
      }

      const isFromPlan = !!e.purchasePlanItemId;
      expenseDataMap[key].items.push({
        id: e.id,
        date: e.date,
        title: e.title,
        note: e.note || '',
        amount: Number(e.amount || 0),
        qty: e.qty,
        cost: e.cost,
        unit: e.unit,
        category: e.category,
        subKey: subKey,
        isStockFromPlan: isFromPlan,
        status: e.status,
        isUnpaid: !!e.isUnpaid,
        creditor: e.creditor
      });
      expenseDataMap[key].total += Number(e.amount || 0);
    });

    // Calculate grand total from categorized items to ensure 100% exact match
    let computedTotal = 0;
    EXPENSE_CATEGORIES.forEach(cat => {
      computedTotal += expenseDataMap[cat.key].total;
    });
    grandTotalExpense = computedTotal;

    // 2.4 Render Category Accordion Items
    expAccordionListEl.innerHTML = EXPENSE_CATEGORIES.map(cat => {
      const data = expenseDataMap[cat.key];
      const isOpen = expandedExpenseCategories.has(cat.key);
      const itemCount = data.items.length;
      const catTotal = data.total;

      let detailHtml = '';
      if (isOpen) {
        if (cat.key === 'utilities') {
          const utilItems = data.items;
          const counts = {
            all: utilItems.length,
            electricity: utilItems.filter(x => x.subKey === 'electricity').length,
            water: utilItems.filter(x => x.subKey === 'water').length,
            internet: utilItems.filter(x => x.subKey === 'internet').length,
            garbage: utilItems.filter(x => x.subKey === 'garbage').length
          };

          const subTotals = {
            all: data.total,
            electricity: utilItems.filter(x => x.subKey === 'electricity').reduce((s, x) => s + x.amount, 0),
            water: utilItems.filter(x => x.subKey === 'water').reduce((s, x) => s + x.amount, 0),
            internet: utilItems.filter(x => x.subKey === 'internet').reduce((s, x) => s + x.amount, 0),
            garbage: utilItems.filter(x => x.subKey === 'garbage').reduce((s, x) => s + x.amount, 0)
          };

          const filteredUtilItems = selectedUtilitySubFilter === 'all'
            ? utilItems
            : utilItems.filter(x => x.subKey === selectedUtilitySubFilter);

          const currentFilteredTotal = selectedUtilitySubFilter === 'all'
            ? subTotals.all
            : (subTotals[selectedUtilitySubFilter] || 0);

          detailHtml = `
            <div class="cat-accordion-body">
              <div class="utility-filter-toolbar">
                <div style="display:flex;align-items:center;flex-wrap:wrap;gap:0.35rem;">
                  <span style="font-size:0.82rem;font-weight:700;color:#9a3412;margin-right:0.25rem;">⚡ ເລືອກປະເພດ:</span>
                  <button type="button" class="utility-sub-pill ${selectedUtilitySubFilter === 'all' ? 'active' : ''}" onclick="setUtilitySubFilter('all')">
                    ທັງໝົດ (${counts.all})
                  </button>
                  <button type="button" class="utility-sub-pill ${selectedUtilitySubFilter === 'electricity' ? 'active' : ''}" onclick="setUtilitySubFilter('electricity')">
                    ⚡ ໄຟຟ້າ (${counts.electricity})
                  </button>
                  <button type="button" class="utility-sub-pill ${selectedUtilitySubFilter === 'water' ? 'active' : ''}" onclick="setUtilitySubFilter('water')">
                    💧 ນ້ຳປະປາ (${counts.water})
                  </button>
                  <button type="button" class="utility-sub-pill ${selectedUtilitySubFilter === 'internet' ? 'active' : ''}" onclick="setUtilitySubFilter('internet')">
                    🌐 ອິນເຕີເນັດ (${counts.internet})
                  </button>
                  <button type="button" class="utility-sub-pill ${selectedUtilitySubFilter === 'garbage' ? 'active' : ''}" onclick="setUtilitySubFilter('garbage')">
                    🗑️ ຂີ້ເຫຍື້ອ (${counts.garbage})
                  </button>
                </div>
                <div>
                  <button type="button" class="btn btn-sm" onclick="openExpenseModal(null, '${selectedUtilitySubFilter !== 'all' ? selectedUtilitySubFilter : 'electricity'}')" style="background:#ea580c;color:#ffffff;font-size:0.8rem;padding:0.3rem 0.75rem;font-weight:700;border:none;border-radius:6px;display:flex;align-items:center;gap:0.35rem;cursor:pointer;">
                    <span>+ ເພີ່ມລາຍຈ່າຍ</span>
                    ${selectedUtilitySubFilter !== 'all' ? `<span>(${getUtilitySubLabel(selectedUtilitySubFilter)})</span>` : ''}
                  </button>
                </div>
              </div>
          `;

          if (filteredUtilItems.length === 0) {
            detailHtml += `
              <div style="text-align:center;padding:1.2rem;color:var(--text-muted);font-size:0.88rem;background:#ffffff;border-radius:6px;border:1px dashed #cbd5e1;">
                ຍັງບໍ່ມີລາຍການຈ່າຍ${selectedUtilitySubFilter !== 'all' ? ' ໃນໝວດ ' + getUtilitySubLabel(selectedUtilitySubFilter) : ''} (${periodLabel})
              </div>
            </div>
            `;
          } else {
            detailHtml += `
              <div class="cat-subtable-wrap">
                <table class="cat-subtable">
                  <thead>
                    <tr style="background:#fff7ed;color:#9a3412;">
                      <th class="win-only-col" style="width:75px;">ລະຫັດ</th>
                      <th class="win-only-col" style="width:90px;">ວັນທີ</th>
                      <th class="win-only-col" style="width:115px;text-align:center;">ປະເພດ</th>
                      <th>ລາຍລະອຽດ</th>
                      <th style="text-align:right;width:120px;">ຈຳນວນເງິນ</th>
                      <th class="win-only-col" style="text-align:center;width:95px;">ຈັດການ</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${filteredUtilItems.map(e => {
                      const subMeta = UTILITY_SUB_CATEGORIES[e.subKey] || UTILITY_SUB_CATEGORIES.electricity;
                      return `
                        <tr onclick="handleExpenseRowClick('${e.id}', event)" style="cursor:pointer;">
                          <td class="win-only-col"><strong>${e.id}</strong></td>
                          <td class="win-only-col" style="white-space:nowrap;font-size:0.83rem;">📅 ${e.date}</td>
                          <td class="win-only-col" style="text-align:center;white-space:nowrap;">
                            <span style="display:inline-block;padding:0.18rem 0.55rem;border-radius:999px;font-size:0.75rem;font-weight:700;background:${subMeta.bg};color:${subMeta.color};border:1px solid ${subMeta.border};">
                              ${subMeta.icon} ${subMeta.shortLabel}
                            </span>
                          </td>
                          <td>
                            <div style="display:flex;align-items:center;gap:0.4rem;flex-wrap:wrap;">
                              <span style="font-weight:700;color:#0f172a;">${escapeHtml(e.title)}</span>
                              ${(e.status === 'unpaid' || e.isUnpaid) ? '<span class="status-pill status-broken" style="font-size:0.7rem;padding:0.1rem 0.45rem;">⏳ ຄ້າງຈ່າຍ</span>' : ''}
                            </div>
                            ${e.creditor ? `<div style="font-size:0.74rem;color:#b91c1c;font-weight:600;">👤 ເຈົ້າໜີ້: ${escapeHtml(e.creditor)}</div>` : ''}
                            ${e.note ? `<div style="font-size:0.74rem;color:#64748b;">${escapeHtml(e.note)}</div>` : ''}
                          </td>
                          <td style="text-align:right;font-weight:800;color:#dc2626;font-variant-numeric:tabular-nums;">
                            -${formatLAK(e.amount)}
                          </td>
                          <td class="win-only-col" style="text-align:center;white-space:nowrap;" onclick="event.stopPropagation()">
                            <div style="display:flex;gap:0.3rem;justify-content:center;">
                              <button type="button" class="btn btn-outline btn-sm" onclick="openExpenseModal('${e.id}')">ແກ້ໄຂ</button>
                              <button type="button" class="btn btn-danger btn-sm" onclick="deleteExpense('${e.id}')">ລຶບ</button>
                            </div>
                          </td>
                        </tr>
                      `;
                    }).join('')}
                  </tbody>
                  <tfoot>
                    <tr style="background:#ffedd5;font-weight:900;border-top:1.5px solid #fed7aa;">
                      <td class="win-only-col"></td>
                      <td class="win-only-col"></td>
                      <td class="win-only-col"></td>
                      <td style="text-align:right;color:#9a3412;">
                        ລວມ${selectedUtilitySubFilter === 'all' ? 'ຄ່ານ້ຳ-ໄຟ-ເນັດ-ຂີ້ເຫຍື້ອທັງໝົດ' : 'ໝວດ ' + getUtilitySubLabel(selectedUtilitySubFilter)}:
                      </td>
                      <td style="text-align:right;color:#dc2626;font-variant-numeric:tabular-nums;">-${formatLAK(currentFilteredTotal)}</td>
                      <td class="win-only-col"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
            `;
          }
        } else if (itemCount === 0) {
          detailHtml = `
            <div class="cat-accordion-body">
              <div style="text-align:center;padding:1.2rem;color:var(--text-muted);font-size:0.88rem;background:#ffffff;border-radius:6px;border:1px dashed #cbd5e1;">
                ຍັງບໍ່ມີລາຍການຈ່າຍໃນໝວດ ${cat.icon} ${cat.label} (${periodLabel})
              </div>
            </div>
          `;
        } else if (cat.key === 'stock_purchase') {
          // Stock Purchase detail table
          detailHtml = `
            <div class="cat-accordion-body">
              <div class="cat-subtable-wrap">
                <table class="cat-subtable">
                  <thead>
                    <tr style="background:#fff7ed;color:#9a3412;">
                      <th class="win-only-col" style="width:90px;">ວັນທີ</th>
                      <th>ລາຍການສິນຄ້າ</th>
                      <th style="text-align:center;width:75px;">ຈຳນວນ</th>
                      <th class="win-only-col" style="text-align:right;width:105px;">ລາຄາຕົ້ນທຶນ</th>
                      <th style="text-align:right;width:115px;">ລວມເງິນ</th>
                      <th class="win-only-col" style="text-align:center;width:100px;">ແຫຼ່ງຂໍ້ມູນ</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${data.items.map(it => `
                      <tr onclick="if(!${it.isStockFromPlan ? 'true' : 'false'}) handleExpenseRowClick('${it.id}', event)" style="cursor:${it.isStockFromPlan ? 'default' : 'pointer'};">
                        <td class="win-only-col" style="white-space:nowrap;font-size:0.83rem;">📅 ${it.date ? new Date(it.date).toLocaleDateString('lo-LA') : '-'}</td>
                        <td>
                          <strong style="color:#0f172a;">${it.title}</strong>
                          ${it.sellingPrice ? `<div style="font-size:0.75rem;color:#059669;">ລາຄາຂາຍ: ${formatLAK(it.sellingPrice)}</div>` : ''}
                        </td>
                        <td style="text-align:center;font-weight:700;">${it.qty ? `${it.qty} ${it.unit || ''}` : '1'}</td>
                        <td class="win-only-col" style="text-align:right;font-variant-numeric:tabular-nums;">${formatLAK(it.cost || it.amount)}</td>
                        <td style="text-align:right;font-weight:800;color:#dc2626;font-variant-numeric:tabular-nums;">-${formatLAK(it.amount)}</td>
                        <td class="win-only-col" style="text-align:center;white-space:nowrap;" onclick="event.stopPropagation()">
                          ${it.isStockFromPlan
                            ? `<span style="background:#e0f2fe;color:#0369a1;padding:0.18rem 0.5rem;border-radius:999px;font-size:0.75rem;font-weight:700;">📦 ແຜນຊື້ສິນຄ້າ</span>`
                            : `<div style="display:flex;gap:0.3rem;justify-content:center;">
                                 <button type="button" class="btn btn-outline btn-sm" onclick="openExpenseModal('${it.id}')">ແກ້ໄຂ</button>
                                 <button type="button" class="btn btn-danger btn-sm" onclick="deleteExpense('${it.id}')">ລຶບ</button>
                               </div>`
                          }
                        </td>
                      </tr>
                    `).join('')}
                  </tbody>
                  <tfoot>
                    <tr style="background:#ffedd5;font-weight:900;border-top:1.5px solid #fed7aa;">
                      <td class="win-only-col"></td>
                      <td colspan="2" style="text-align:right;color:#9a3412;">ລວມໝວດຊື້ສິນຄ້າ:</td>
                      <td class="win-only-col"></td>
                      <td style="text-align:right;color:#dc2626;font-variant-numeric:tabular-nums;">-${formatLAK(catTotal)}</td>
                      <td class="win-only-col"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          `;
        } else {
          // Standard Expense Detail Table
          detailHtml = `
            <div class="cat-accordion-body">
              <div class="cat-subtable-wrap">
                <table class="cat-subtable">
                  <thead>
                    <tr style="background:#fef2f2;color:#991b1b;">
                      <th class="win-only-col" style="width:75px;">ລະຫັດ</th>
                      <th class="win-only-col" style="width:90px;">ວັນທີ</th>
                      <th>ລາຍລະອຽດ</th>
                      <th style="text-align:right;width:120px;">ຈຳນວນເງິນ</th>
                      <th class="win-only-col" style="text-align:center;width:95px;">ຈັດການ</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${data.items.map(e => `
                      <tr onclick="handleExpenseRowClick('${e.id}', event)" style="cursor:pointer;">
                        <td class="win-only-col"><strong>${e.id}</strong></td>
                        <td class="win-only-col" style="white-space:nowrap;font-size:0.83rem;">📅 ${e.date}</td>
                        <td>
                          <div style="display:flex;align-items:center;gap:0.4rem;flex-wrap:wrap;">
                            <span style="font-weight:700;color:#0f172a;">${escapeHtml(e.title)}</span>
                            ${(e.status === 'unpaid' || e.isUnpaid) ? '<span class="status-pill status-broken" style="font-size:0.7rem;padding:0.1rem 0.45rem;">⏳ ຄ້າງຈ່າຍ</span>' : ''}
                          </div>
                          ${e.creditor ? `<div style="font-size:0.74rem;color:#b91c1c;font-weight:600;">👤 ເຈົ້າໜີ້: ${escapeHtml(e.creditor)}</div>` : ''}
                          ${e.note ? `<div style="font-size:0.74rem;color:#64748b;">${escapeHtml(e.note)}</div>` : ''}
                        </td>
                        <td style="text-align:right;font-weight:800;color:#dc2626;font-variant-numeric:tabular-nums;">
                          -${formatLAK(e.amount)}
                        </td>
                        <td class="win-only-col" style="text-align:center;white-space:nowrap;" onclick="event.stopPropagation()">
                          <div style="display:flex;gap:0.3rem;justify-content:center;">
                            <button type="button" class="btn btn-outline btn-sm" onclick="openExpenseModal('${e.id}')">ແກ້ໄຂ</button>
                            <button type="button" class="btn btn-danger btn-sm" onclick="deleteExpense('${e.id}')">ລຶບ</button>
                          </div>
                        </td>
                      </tr>
                    `).join('')}
                  </tbody>
                  <tfoot>
                    <tr style="background:#fee2e2;font-weight:900;border-top:1.5px solid #fecaca;">
                      <td class="win-only-col"></td>
                      <td class="win-only-col"></td>
                      <td style="text-align:right;color:#991b1b;">ລວມໝວດ ${cat.label}:</td>
                      <td style="text-align:right;color:#dc2626;font-variant-numeric:tabular-nums;">-${formatLAK(catTotal)}</td>
                      <td class="win-only-col"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          `;
        }
      }

      return `
        <div class="cat-accordion-item ${isOpen ? 'is-open' : ''}">
          <div class="cat-accordion-header" onclick="toggleExpenseCategoryAccordion('${cat.key}')" title="ຄລິກເພື່ອເບິ່ງ / ເຊື່ອງລາຍລະອຽດ ${cat.label}">
            <div class="cat-header-left">
              <span class="cat-toggle-arrow">${isOpen ? '▼' : '▶'}</span>
              <span class="cat-icon-badge">${cat.icon}</span>
              <span class="cat-name">${cat.label}</span>
            </div>
            <div class="cat-header-right">
              <span class="cat-count-pill" style="background:${itemCount > 0 ? '#fee2e2' : '#f1f5f9'};color:${itemCount > 0 ? '#991b1b' : '#64748b'};">
                ${itemCount} ລາຍການ
              </span>
              <span class="cat-amount-val" style="color:${catTotal > 0 ? '#dc2626' : '#94a3b8'};">
                -${formatLAK(catTotal)}
              </span>
            </div>
          </div>
          ${detailHtml}
        </div>
      `;
    }).join('');
  }

  const expTotalBadge = document.getElementById('summaryExpenseTotalBadge');
  if (expTotalBadge) expTotalBadge.textContent = formatLAK(grandTotalExpense);

  // ========================================================
  // 3. Render Income Category Accordion List (RIGHT WINDOW)
  // ========================================================
  const incAccordionListEl = document.getElementById('incomeCategoryAccordionList');
  let grandTotalIncome = 0;

  if (incAccordionListEl) {
    const activeIncomeCategories = getActiveIncomeCategories();
    const incomeDataMap = {};
    activeIncomeCategories.forEach(cat => {
      incomeDataMap[cat.key] = {
        meta: cat,
        items: [],
        total: 0
      };
    });

    // Populate income categories from monthBills
    monthBills.forEach(b => {
      const bDateStr = b.date ? new Date(b.date).toLocaleDateString('lo-LA') : '-';
      const bCust = b.customer || 'ລູກຄ້າທົ່ວໄປ';

      if (b.items && b.items.length > 0) {
        // Group items in this bill by category
        const billCatTotals = {};
        const billCatItems = {};

        b.items.forEach(it => {
          const prodId = it.baseProductId || it.id;
          const p = state.products.find(x => x.id === prodId || x.id === it.id);
          let itemCat = (p && p.category) || it.category || b.category || 'other';
          if (!incomeDataMap[itemCat]) itemCat = 'other';

          const lineTotal = Number(it.price || 0) * Number(it.qty || 0);
          billCatTotals[itemCat] = (billCatTotals[itemCat] || 0) + lineTotal;
          if (!billCatItems[itemCat]) billCatItems[itemCat] = [];
          billCatItems[itemCat].push(`${it.name} (x${it.qty || 1})`);
        });

        // Add bill entry into each category that has items
        Object.keys(billCatTotals).forEach(catKey => {
          const amount = billCatTotals[catKey];
          incomeDataMap[catKey].items.push({
            billId: b.id,
            date: bDateStr,
            customer: bCust,
            itemDesc: billCatItems[catKey].join(', '),
            amount: amount,
            billTotal: b.total
          });
          incomeDataMap[catKey].total += amount;
        });
      } else {
        // Manual income bill without line items
        let bCat = b.category || 'other';
        if (!incomeDataMap[bCat]) bCat = 'other';
        const amount = Number(b.total || 0);
        incomeDataMap[bCat].items.push({
          billId: b.id,
          date: bDateStr,
          customer: bCust,
          itemDesc: b.title || 'ລາຍຮັບ',
          amount: amount,
          billTotal: amount
        });
        incomeDataMap[bCat].total += amount;
      }
    });

    // Calculate grand total income across all categories
    activeIncomeCategories.forEach(cat => {
      grandTotalIncome += incomeDataMap[cat.key].total;
    });

    // Render Income Accordion Items
    incAccordionListEl.innerHTML = activeIncomeCategories.map(cat => {
      const data = incomeDataMap[cat.key];
      const isOpen = expandedIncomeCategories.has(cat.key);
      const itemCount = data.items.length;
      const catTotal = data.total;

      let detailHtml = '';
      if (isOpen) {
        if (itemCount === 0) {
          detailHtml = `
            <div class="cat-accordion-body">
              <div style="text-align:center;padding:1.2rem;color:var(--text-muted);font-size:0.88rem;background:#ffffff;border-radius:6px;border:1px dashed #cbd5e1;">
                ຍັງບໍ່ມີລາຍການລາຍຮັບໃນໝວດ ${cat.icon} ${cat.label} (${periodLabel})
              </div>
            </div>
          `;
        } else {
          detailHtml = `
            <div class="cat-accordion-body">
              <div class="cat-subtable-wrap">
                <table class="cat-subtable">
                  <thead>
                    <tr style="background:#ecfdf5;color:#065f46;">
                      <th class="win-only-col" style="width:85px;">ເລກບິນ</th>
                      <th class="win-only-col" style="width:90px;">ວັນທີ</th>
                      <th class="win-only-col">ລູກຄ້າ</th>
                      <th>ລາຍການຂາຍ</th>
                      <th style="text-align:right;width:120px;">ຈຳນວນເງິນ</th>
                      <th class="win-only-col" style="text-align:center;width:95px;">ຈັດການ</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${data.items.map(b => `
                      <tr onclick="handleBillRowClick('${b.billId}', event)" style="cursor:pointer;">
                        <td class="win-only-col"><strong>${b.billId}</strong></td>
                        <td class="win-only-col" style="white-space:nowrap;font-size:0.83rem;">📅 ${b.date}</td>
                        <td class="win-only-col" style="white-space:nowrap;font-weight:700;">${b.customer}</td>
                        <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:700;" title="${b.itemDesc}">
                          ${b.itemDesc}
                        </td>
                        <td style="text-align:right;font-weight:800;color:#059669;font-variant-numeric:tabular-nums;">
                          +${formatLAK(b.amount)}
                        </td>
                        <td class="win-only-col" style="text-align:center;white-space:nowrap;" onclick="event.stopPropagation()">
                          <div style="display:flex;gap:0.3rem;justify-content:center;">
                            <button type="button" class="btn btn-outline btn-sm" onclick="viewBillById('${b.billId}')" title="ເບິ່ງ / ພິມໃບບິນ">🖨️ ບິນ</button>
                            <button type="button" class="btn btn-danger btn-sm" onclick="deleteBill('${b.billId}')" title="ລຶບບິນນີ້">ລຶບ</button>
                          </div>
                        </td>
                      </tr>
                    `).join('')}
                  </tbody>
                  <tfoot>
                    <tr style="background:#d1fae5;font-weight:900;border-top:1.5px solid #a7f3d0;">
                      <td class="win-only-col"></td>
                      <td class="win-only-col"></td>
                      <td class="win-only-col"></td>
                      <td style="text-align:right;color:#065f46;">ລວມໝວດ ${cat.label}:</td>
                      <td style="text-align:right;color:#059669;font-variant-numeric:tabular-nums;">+${formatLAK(catTotal)}</td>
                      <td class="win-only-col"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          `;
        }
      }

      return `
        <div class="cat-accordion-item ${isOpen ? 'is-open' : ''}">
          <div class="cat-accordion-header" onclick="toggleIncomeCategoryAccordion('${cat.key}')" title="ຄລິກເພື່ອເບິ່ງ / ເຊື່ອງລາຍລະອຽດ ${cat.label}">
            <div class="cat-header-left">
              <span class="cat-toggle-arrow">${isOpen ? '▼' : '▶'}</span>
              <span class="cat-icon-badge">${cat.icon}</span>
              <span class="cat-name">${cat.label}</span>
            </div>
            <div class="cat-header-right">
              <span class="cat-count-pill" style="background:${itemCount > 0 ? '#d1fae5' : '#f1f5f9'};color:${itemCount > 0 ? '#065f46' : '#64748b'};">
                ${itemCount} ລາຍການ
              </span>
              <span class="cat-amount-val" style="color:${catTotal > 0 ? '#059669' : '#94a3b8'};">
                +${formatLAK(catTotal)}
              </span>
            </div>
          </div>
          ${detailHtml}
        </div>
      `;
    }).join('');
  }

  const incTotalBadge = document.getElementById('summaryIncomeTotalBadge');
  if (incTotalBadge) incTotalBadge.textContent = formatLAK(grandTotalIncome);
}

function openExpenseModal(expenseId = null, presetCategory = 'salary') {
  const modal = document.getElementById('expenseModal');
  const titleEl = document.getElementById('expenseModalTitle');
  if (!modal) return;

  const unpaidChk = document.getElementById('expIsUnpaidInput');
  const creditorInput = document.getElementById('expCreditorInput');

  if (expenseId) {
    const exp = state.expenses.find(x => x.id === expenseId);
    if (!exp) return;
    titleEl.textContent = '✏️ ແກ້ໄຂລາຍຈ່າຍ';
    document.getElementById('expIdInput').value = exp.id;
    document.getElementById('expDateInput').value = exp.date;
    document.getElementById('expCategoryInput').value = exp.category;
    document.getElementById('expTitleInput').value = exp.title;
    document.getElementById('expAmountInput').value = exp.amount;
    document.getElementById('expNoteInput').value = exp.note || '';
    if (unpaidChk) unpaidChk.checked = (exp.status === 'unpaid' || !!exp.isUnpaid);
    if (creditorInput) creditorInput.value = exp.creditor || '';
  } else {
    let effectiveCategory = presetCategory;
    if (effectiveCategory === 'utilities') effectiveCategory = 'electricity';
    titleEl.textContent = '💸 ເພີ່ມລາຍຈ່າຍ';
    document.getElementById('expIdInput').value = '';
    document.getElementById('expDateInput').value = new Date().toISOString().slice(0, 10);
    document.getElementById('expCategoryInput').value = effectiveCategory;
    document.getElementById('expTitleInput').value = '';
    document.getElementById('expAmountInput').value = '';
    document.getElementById('expNoteInput').value = '';
    if (unpaidChk) unpaidChk.checked = false;
    if (creditorInput) creditorInput.value = '';
  }

  toggleExpUnpaidFields();
  modal.classList.add('open');
}

function toggleExpUnpaidFields() {
  const isUnpaid = document.getElementById('expIsUnpaidInput')?.checked || false;
  const container = document.getElementById('expUnpaidFieldsContainer');
  if (container) container.style.display = isUnpaid ? 'block' : 'none';
}

function closeExpenseModal() {
  document.getElementById('expenseModal')?.classList.remove('open');
}

function saveExpenseForm(e) {
  e.preventDefault();
  const id = document.getElementById('expIdInput').value;
  const isUnpaid = document.getElementById('expIsUnpaidInput')?.checked || false;
  const creditor = (document.getElementById('expCreditorInput')?.value || '').trim();

  const expData = {
    id: id || `EX-${String(state.expenses.length + 1).padStart(3, '0')}`,
    date: document.getElementById('expDateInput').value,
    category: document.getElementById('expCategoryInput').value,
    title: document.getElementById('expTitleInput').value.trim(),
    amount: Number(document.getElementById('expAmountInput').value || 0),
    note: document.getElementById('expNoteInput').value.trim(),
    status: isUnpaid ? 'unpaid' : 'paid',
    isUnpaid: isUnpaid,
    creditor: creditor
  };

  if (id) {
    const idx = state.expenses.findIndex(x => x.id === id);
    if (idx !== -1) {
      state.expenses[idx] = { ...state.expenses[idx], ...expData };
    }
  } else {
    state.expenses.unshift(expData);
  }

  saveState();
  closeExpenseModal();
  renderSummaryPage();
}

function deleteExpense(expenseId) {
  const exp = state.expenses.find(x => x.id === expenseId);
  if (!exp) return;
  if (confirm(`ຕ້ອງການລຶບລາຍຈ່າຍ "${exp.title}" (${formatLAK(exp.amount)}) ແທ້ບໍ່?`)) {
    state.expenses = state.expenses.filter(x => x.id !== expenseId);
    saveState();
    renderSummaryPage();
  }
}

// ==========================================
// INCOME MODAL & CREATION FUNCTIONS
// ==========================================
function openIncomeModal() {
  const modal = document.getElementById('incomeModal');
  if (!modal) return;
  renderAllCategorySelects();
  const dateInput = document.getElementById('incDateInput');
  if (dateInput) dateInput.value = new Date().toISOString().slice(0, 10);
  const titleInput = document.getElementById('incTitleInput');
  if (titleInput) titleInput.value = '';
  const custInput = document.getElementById('incCustomerInput');
  if (custInput) custInput.value = 'ລູກຄ້າທົ່ວໄປ';
  const amountInput = document.getElementById('incAmountInput');
  if (amountInput) amountInput.value = '';
  const catInput = document.getElementById('incCategoryInput');
  if (catInput) catInput.value = 'other';
  const payInput = document.getElementById('incPaymentInput');
  if (payInput) payInput.value = 'cash';
  modal.classList.add('open');
  setTimeout(() => titleInput?.focus(), 60);
}

function closeIncomeModal() {
  document.getElementById('incomeModal')?.classList.remove('open');
}

function goToPosTabFromModal() {
  closeIncomeModal();
  switchTab('pos');
}

function saveIncomeForm(e) {
  e.preventDefault();
  const date = document.getElementById('incDateInput').value;
  const category = document.getElementById('incCategoryInput').value;
  const title = document.getElementById('incTitleInput').value.trim();
  const customer = document.getElementById('incCustomerInput').value.trim() || 'ລູກຄ້າທົ່ວໄປ';
  const paymentMethod = document.getElementById('incPaymentInput').value;
  const amount = Number(document.getElementById('incAmountInput').value || 0);

  if (!title) {
    alert('ກະລຸນາປ້ອນລາຍລະອຽດລາຍຮັບ!');
    return;
  }
  if (amount <= 0) {
    alert('ກະລຸນາປ້ອນຈຳນວນເງິນລາຍຮັບທີ່ຖືກຕ້ອງ!');
    return;
  }

  const now = new Date();
  const datePart = (date ? new Date(date) : now).toISOString().slice(2, 10).replace(/-/g, '');
  const seq = String(state.bills.length + 1).padStart(3, '0');
  const billId = `DL-${datePart}-${seq}`;

  const newBill = {
    id: billId,
    date: date ? `${date}T${now.toTimeString().slice(0, 8)}` : now.toISOString(),
    customer: customer,
    phone: '',
    items: [
      {
        id: 'INC-' + Date.now(),
        name: title,
        category: category,
        price: amount,
        cost: 0,
        qty: 1,
        unit: 'ລາຍການ'
      }
    ],
    category: category,
    subtotal: amount,
    discount: 0,
    total: amount,
    paymentMethod: paymentMethod,
    status: paymentMethod === 'credit' ? 'unpaid' : 'paid'
  };

  state.bills.unshift(newBill);
  saveState();
  closeIncomeModal();
  renderSummaryPage();
  renderSalesHistory();
}

// ==========================================
// 6. PURCHASE PLAN MODULE (ແຜນຊື້ສິນຄ້າເຂົ້າຮ້ານ)
// ==========================================
function getItemMonth(item, isPurchased = false) {
  if (isPurchased && item.purchasedAt && item.purchasedAt.length >= 7) {
    return item.purchasedAt.slice(0, 7);
  }
  if (item.createdAt && item.createdAt.length >= 7) {
    return item.createdAt.slice(0, 7);
  }
  if (item.date && item.date.length >= 7) {
    return item.date.slice(0, 7);
  }
  if (item.id && item.id.startsWith('PP-')) {
    const ts = Number(item.id.replace('PP-', ''));
    if (!isNaN(ts) && ts > 1600000000000) {
      return new Date(ts).toISOString().slice(0, 7);
    }
  }
  return new Date().toISOString().slice(0, 7);
}

function populatePurchaseMonthOptions() {
  const select = document.getElementById('purchaseMonthFilter');
  if (!select) return;
  const currentVal = select.value || 'all';

  const monthsSet = new Set();
  const nowMonth = new Date().toISOString().slice(0, 7);
  monthsSet.add(nowMonth);

  (state.purchasePlan || []).forEach(it => {
    monthsSet.add(getItemMonth(it, it.purchased));
    if (it.purchasedAt && it.purchasedAt.length >= 7) {
      monthsSet.add(it.purchasedAt.slice(0, 7));
    }
    if (it.createdAt && it.createdAt.length >= 7) {
      monthsSet.add(it.createdAt.slice(0, 7));
    }
  });

  const sortedMonths = Array.from(monthsSet).sort().reverse();
  select.innerHTML = `<option value="all">📅 ທຸກເດືອນ</option>` +
    sortedMonths.map(ym => {
      const [y, m] = ym.split('-');
      return `<option value="${ym}">📅 ເດືອນ ${m}/${y}</option>`;
    }).join('');

  if (sortedMonths.includes(currentVal) || currentVal === 'all') {
    select.value = currentVal;
  }
}

function renderPurchasePlanPage() {
  if (!Array.isArray(state.purchasePlan)) state.purchasePlan = [];

  populatePurchaseMonthOptions();
  const filterMonth = document.getElementById('purchaseMonthFilter')?.value || 'all';

  const tbody = document.getElementById('purchaseTableBody');
  const countBadge = document.getElementById('purchaseCountBadge');
  const sumCountEl = document.getElementById('purchaseSummaryCountText');
  const sumQtyEl = document.getElementById('purchaseSummaryQtyText');
  const grandTotalEl = document.getElementById('purchaseGrandTotalText');

  const purchasedTbody = document.getElementById('purchasedTableBody');
  const purchasedCountBadge = document.getElementById('purchasedCountBadge');
  const purchasedSumCountEl = document.getElementById('purchasedSummaryCountText');
  const purchasedSumQtyEl = document.getElementById('purchasedSummaryQtyText');
  const purchasedGrandTotalEl = document.getElementById('purchasedGrandTotalText');

  const allItems = state.purchasePlan;
  const pendingItems = allItems.filter(it => {
    if (it.purchased) return false;
    if (filterMonth === 'all') return true;
    return getItemMonth(it, false) === filterMonth;
  });

  const purchasedItems = allItems.filter(it => {
    if (!it.purchased) return false;
    if (filterMonth === 'all') return true;
    return getItemMonth(it, true) === filterMonth;
  });

  // 1. Pending Items Summary
  const pendingCount = pendingItems.length;
  const pendingQty = pendingItems.reduce((s, it) => s + Number(it.qty || 0), 0);
  const pendingTotal = pendingItems.reduce((s, it) => s + Number(it.price || 0) * Number(it.qty || 0), 0);

  if (countBadge) countBadge.textContent = `${pendingCount} ລາຍການ`;
  if (sumCountEl) sumCountEl.textContent = pendingCount;
  if (sumQtyEl) sumQtyEl.textContent = pendingQty.toLocaleString('en-US');
  if (grandTotalEl) grandTotalEl.textContent = formatLAK(pendingTotal);

  // 1.1 Render Pending Items Table
  if (tbody) {
    if (pendingItems.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align:center;padding:2.5rem;color:var(--text-muted);">
            ${filterMonth !== 'all' ? '🎉 ບໍ່ມີລາຍການຄ້າງຊື້ໃນເດືອນທີ່ເລືອກ' : '🎉 ບໍ່ມີລາຍການຄ້າງຊື້! (ທຸກລາຍການຖືກຊື້ໝົດແລ້ວ ຫຼື ຍັງບໍ່ໄດ້ເພີ່ມລາຍການໃໝ່)'}
          </td>
        </tr>
      `;
    } else {
      tbody.innerHTML = pendingItems.map((item, idx) => {
        const lineTotal = Number(item.price || 0) * Number(item.qty || 0);
        return `
          <tr
            class="purchase-row-item"
            onclick="handlePurchaseRowClick('${item.id}', event)"
            oncontextmenu="event.preventDefault(); openPurchaseActionMenu('${item.id}', event);"
          >
            <td class="win-only-col" style="text-align:center;font-weight:800;color:var(--text-secondary);">
              ${idx + 1}
            </td>
            <td>
              <div style="font-weight:700;font-size:0.95rem;cursor:pointer;" onclick="openPurchaseActionMenu('${item.id}', event)">${escapeHtml(item.name)}</div>
              ${item.code || item.sellingPrice || item.createdAt ? `
                <div style="font-size:0.75rem;color:#64748b;margin-top:2px;display:flex;gap:0.6rem;flex-wrap:wrap;">
                  ${item.code ? `<span>ລະຫັດ: <strong style="color:#0f172a;">${escapeHtml(item.code)}</strong></span>` : ''}
                  ${item.sellingPrice ? `<span>ລາຄາຂາຍ: <strong style="color:#ea580c;">${formatLAK(item.sellingPrice)}</strong></span>` : ''}
                  ${item.createdAt ? `<span>📅 ເພີ່ມ: <strong>${new Date(item.createdAt).toLocaleDateString('lo-LA')}</strong></span>` : ''}
                </div>
              ` : ''}
            </td>
            <td class="win-only-col" style="text-align:right;font-weight:700;font-variant-numeric:tabular-nums;">
              ${formatLAK(item.price)}
            </td>
            <td style="text-align:center;" onclick="event.stopPropagation()">
              <div class="qty-controls" style="justify-content:center;">
                <button type="button" class="qty-btn" onclick="updatePurchaseItemQty('${item.id}', -1)">-</button>
                <input
                  type="number"
                  class="qty-input"
                  value="${item.qty}"
                  min="1"
                  onchange="updatePurchaseItemQty('${item.id}', this.value, true)"
                />
                <button type="button" class="qty-btn" onclick="updatePurchaseItemQty('${item.id}', 1)">+</button>
              </div>
            </td>
            <td style="text-align:right;font-weight:800;color:#ea580c;font-variant-numeric:tabular-nums;white-space:nowrap;">
              ${formatLAK(lineTotal)}
            </td>
            <td class="win-only-col" style="text-align:center;white-space:nowrap;" onclick="event.stopPropagation()">
              <div style="display:flex;gap:0.35rem;justify-content:center;">
                <button type="button" class="btn btn-sm" style="background:#059669;color:#ffffff;font-weight:800;border:none;box-shadow:0 1px 3px rgba(5,150,105,0.3);" onclick="markPurchaseItemPurchased('${item.id}')" title="ໝາຍວ່າຊື້ແລ້ວ ແລະ ຍ້າຍໄປລຸ່ມ">
                  ✅ ຊື້ແລ້ວ
                </button>
                <button type="button" class="btn btn-outline btn-sm" onclick="openPurchaseModal('${item.id}')">✏️ ແກ້ໄຂ</button>
                <button type="button" class="btn btn-danger btn-sm" onclick="deletePurchaseItem('${item.id}')">🗑️ ລຶບ</button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }
  }

  // 2. Purchased Items Summary
  const purchasedCount = purchasedItems.length;
  const purchasedQty = purchasedItems.reduce((s, it) => s + Number(it.qty || 0), 0);
  const purchasedTotal = purchasedItems.reduce((s, it) => s + Number(it.price || 0) * Number(it.qty || 0), 0);

  if (purchasedCountBadge) purchasedCountBadge.textContent = `${purchasedCount} ລາຍການ`;
  if (purchasedSumCountEl) purchasedSumCountEl.textContent = purchasedCount;
  if (purchasedSumQtyEl) purchasedSumQtyEl.textContent = purchasedQty.toLocaleString('en-US');
  if (purchasedGrandTotalEl) purchasedGrandTotalEl.textContent = formatLAK(purchasedTotal);

  // 2.1 Render Purchased Items Table
  if (purchasedTbody) {
    if (purchasedItems.length === 0) {
      purchasedTbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align:center;padding:2rem;color:var(--text-muted);">
            ${filterMonth !== 'all' ? 'ຍັງບໍ່ມີລາຍການທີ່ຊື້ແລ້ວໃນເດືອນທີ່ເລືອກ' : 'ຍັງບໍ່ມີລາຍການທີ່ຊື້ແລ້ວ (ເມື່ອກົດປຸ່ມ "✅ ຊື້ແລ້ວ" ຢູ່ຕາຕະລາງດ້ານເທິງ ລາຍການຈະຍ້າຍມາສະແດງຢູ່ນີ້)'}
          </td>
        </tr>
      `;
    } else {
      purchasedTbody.innerHTML = purchasedItems.map((item, idx) => {
        const lineTotal = Number(item.price || 0) * Number(item.qty || 0);
        return `
          <tr
            class="purchase-row-item"
            style="background:#fcfdfd;"
            onclick="handlePurchaseRowClick('${item.id}', event)"
            oncontextmenu="event.preventDefault(); openPurchaseActionMenu('${item.id}', event);"
          >
            <td class="win-only-col" style="text-align:center;font-weight:800;color:#059669;">
              ${idx + 1}
            </td>
            <td>
              <div style="font-weight:700;font-size:0.95rem;color:#334155;cursor:pointer;" onclick="openPurchaseActionMenu('${item.id}', event)">
                <span style="color:#059669;margin-right:0.3rem;">✓</span>${escapeHtml(item.name)}
              </div>
              ${item.code || item.sellingPrice || item.purchasedAt ? `
                <div style="font-size:0.75rem;color:#64748b;margin-top:2px;display:flex;gap:0.6rem;flex-wrap:wrap;">
                  ${item.code ? `<span>ລະຫັດ: <strong style="color:#0f172a;">${escapeHtml(item.code)}</strong></span>` : ''}
                  ${item.sellingPrice ? `<span>ລາຄາຂາຍ: <strong style="color:#059669;">${formatLAK(item.sellingPrice)}</strong></span>` : ''}
                  ${item.purchasedAt ? `<span>🕒 ຊື້: <strong>${new Date(item.purchasedAt).toLocaleDateString('lo-LA')}</strong></span>` : ''}
                </div>
              ` : ''}
            </td>
            <td class="win-only-col" style="text-align:right;font-weight:700;font-variant-numeric:tabular-nums;color:#475569;">
              ${formatLAK(item.price)}
            </td>
            <td style="text-align:center;font-weight:800;color:#0f172a;">
              ${item.qty}
            </td>
            <td style="text-align:right;font-weight:800;color:#059669;font-variant-numeric:tabular-nums;white-space:nowrap;">
              ${formatLAK(lineTotal)}
            </td>
            <td class="win-only-col" style="text-align:center;white-space:nowrap;" onclick="event.stopPropagation()">
              <div style="display:flex;gap:0.35rem;justify-content:center;">
                <button type="button" class="btn btn-outline btn-sm" style="border-color:#3b82f6;color:#1d4ed8;" onclick="unmarkPurchaseItem('${item.id}')" title="ຍ້າຍກັບຄືນໄປສິນຄ້າຍັງບໍ່ໄດ້ຊື້">
                  🔄 ຍົກເລີກ
                </button>
                <button type="button" class="btn btn-danger btn-sm" onclick="deletePurchaseItem('${item.id}')" title="ລຶບລາຍການນີ້">
                  🗑️ ລຶບ
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }
  }
}

function markPurchaseItemPurchased(itemId) {
  const item = (state.purchasePlan || []).find(x => x.id === itemId);
  if (!item) return;

  const qtyToAdd = Math.max(1, Number(item.qty || 1));
  const newCost = Math.max(0, Number(item.price || 0));
  const newPrice = item.sellingPrice ? Math.max(0, Number(item.sellingPrice)) : null;
  const lineTotal = newCost * qtyToAdd;

  const confirmMsg = `ຢືນຢັນການຊື້ສິນຄ້າ: "${item.name}"\n` +
    `ຈຳນວນ: ${qtyToAdd} ${item.unit || 'ອັນ'}\n` +
    `ລາຄາລວມ: ${formatLAK(lineTotal)}\n\n` +
    `* ລະບົບຈະ:\n` +
    `1. ຕັດເງິນສົດໃນຮ້ານ ແລະ ເພີ່ມໃສ່ລາຍຈ່າຍຮ້ານ: ${formatLAK(lineTotal)}\n` +
    `2. ເພີ່ມສະຕັອກສິນຄ້າເຂົ້າສາງ: +${qtyToAdd} ${item.unit || 'ອັນ'}`;

  if (!confirm(confirmMsg)) return;

  item.purchased = true;
  const now = new Date();
  item.purchasedAt = now.toISOString();

  // 1. ຕັດເງິນສົດຢູ່ໃນຮ້ານ: ສ້າງລາຍການລາຍຈ່າຍເງິນສົດ (Cash Out) ໃນ state.expenses
  const expenseId = `EX-P-${Date.now()}`;
  const purchaseExpense = {
    id: expenseId,
    date: now.toISOString().slice(0, 10),
    category: 'stock_purchase',
    title: `ຊື້ສິນຄ້າເຂົ້າຮ້ານ: ${item.name}`,
    qty: qtyToAdd,
    unit: item.unit || 'ອັນ',
    cost: newCost,
    amount: lineTotal,
    paymentMethod: 'cash',
    status: 'paid',
    purchasePlanItemId: item.id,
    note: `ຊື້ຈາກແຜນຈັດຊື້ (${qtyToAdd} ${item.unit || 'ອັນ'} × ${formatLAK(newCost)})`
  };
  if (!state.expenses) state.expenses = [];
  state.expenses.unshift(purchaseExpense);
  item.linkedExpenseId = expenseId;

  // 2. Find product in catalog by productId or by exact name match
  let prod = null;
  if (item.productId) {
    prod = state.products.find(p => p.id === item.productId);
  }
  if (!prod && item.name) {
    prod = state.products.find(p => p.name.trim().toLowerCase() === item.name.trim().toLowerCase());
  }

  if (prod) {
    // Record audit snapshot on item for revert/undo
    item.appliedProductId = prod.id;
    item.appliedStockQty = qtyToAdd;
    item.previousCost = prod.cost;
    item.previousPrice = prod.price;

    // Update stock and cost
    if (prod.trackStock !== false) {
      prod.trackStock = true;
      prod.stock = (Number(prod.stock) || 0) + qtyToAdd;
    }
    if (newCost > 0) {
      prod.cost = newCost;
    }
    if (newPrice && newPrice > 0) {
      prod.price = newPrice;
    }
  } else {
    // If not found in catalog, add new product into state.products
    const nextNum = state.products.length + 1;
    const newProd = {
      id: 'prod_' + Date.now(),
      code: item.code || ('P' + String(nextNum).padStart(3, '0')),
      name: item.name,
      category: 'paper',
      cost: newCost,
      price: newPrice && newPrice > 0 ? newPrice : (newCost > 0 ? Math.round(newCost * 1.3) : 0),
      stock: qtyToAdd,
      minStock: 2,
      unit: item.unit || 'ອັນ',
      trackStock: true,
      hasSubUnit: false,
      imageData: ''
    };
    state.products.push(newProd);
    item.appliedProductId = newProd.id;
    item.appliedStockQty = qtyToAdd;
    prod = newProd;
  }

  saveState();
  renderPurchasePlanPage();
  renderCatalogTable();
  renderPOSProducts();
  if (typeof renderSummaryPage === 'function') renderSummaryPage();
  showToast(`✅ ຊື້ສິນຄ້າສຳເລັດ! ຕັດເງິນສົດ ແລະ ລົງລາຍຈ່າຍ ${formatLAK(lineTotal)}`, 'success');
}

function unmarkPurchaseItem(itemId) {
  const item = (state.purchasePlan || []).find(x => x.id === itemId);
  if (!item) return;

  if (!confirm(`ຕ້ອງການຍົກເລີກສະຖານະ "ຊື້ແລ້ວ" ຂອງ "${item.name}" ແທ້ບໍ່?\nລະບົບຈະຄືນເງິນສົດ (ລຶບລາຍຈ່າຍ) ແລະ ຫັກສະຕັອກຄືນ.`)) return;

  if (item.appliedProductId && item.appliedStockQty) {
    const prod = state.products.find(p => p.id === item.appliedProductId);
    if (prod) {
      prod.stock = Math.max(0, (Number(prod.stock) || 0) - Number(item.appliedStockQty));
      if (item.previousCost !== undefined) prod.cost = item.previousCost;
      if (item.previousPrice !== undefined) prod.price = item.previousPrice;
    }
    delete item.appliedProductId;
    delete item.appliedStockQty;
    delete item.previousCost;
    delete item.previousPrice;
  }

  // ລຶບລາຍຈ່າຍເງິນສົດທີ່ເຄີຍຕັດອອກ
  if (item.linkedExpenseId) {
    state.expenses = (state.expenses || []).filter(e => e.id !== item.linkedExpenseId);
    delete item.linkedExpenseId;
  } else {
    state.expenses = (state.expenses || []).filter(e => e.purchasePlanItemId !== item.id);
  }

  item.purchased = false;
  delete item.purchasedAt;
  saveState();
  renderPurchasePlanPage();
  renderCatalogTable();
  renderPOSProducts();
  if (typeof renderSummaryPage === 'function') renderSummaryPage();
  showToast(`↩️ ຍົກເລີກການຊື້ແລ້ວ, ຄືນເງິນສົດ ແລະ ປັບສະຕັອກຄືນຮຽບຮ້ອຍ.`, 'info');
}

function clearAllPurchasedItems() {
  const filterMonth = document.getElementById('purchaseMonthFilter')?.value || 'all';
  const targetPurchased = (state.purchasePlan || []).filter(it => {
    if (!it.purchased) return false;
    if (filterMonth === 'all') return true;
    return getItemMonth(it, true) === filterMonth;
  });

  const count = targetPurchased.length;
  if (count === 0) {
    alert('ຍັງບໍ່ມີລາຍການທີ່ຊື້ແລ້ວໃຫ້ລຶບ.');
    return;
  }
  const monthLabel = filterMonth !== 'all' ? `ໃນເດືອນ ${filterMonth.split('-')[1]}/${filterMonth.split('-')[0]}` : 'ທັງໝົດ';
  if (confirm(`ຕ້ອງການລຶບລາຍການທີ່ຊື້ແລ້ວ ${monthLabel} (${count} ລາຍການ) ແທ້ບໍ່?\nໝາຍເຫດ: ລະບົບຈະລຶບລາຍການລາຍຈ່າຍທີ່ຕິດພັນອອກຈາກບັນຊີລາຍຈ່າຍດ້ວຍ.`)) {
    const targetIds = new Set(targetPurchased.map(x => x.id));
    const targetExpenseIds = new Set(targetPurchased.map(x => x.linkedExpenseId).filter(Boolean));
    if (targetExpenseIds.size > 0 || targetIds.size > 0) {
      state.expenses = (state.expenses || []).filter(e => !targetExpenseIds.has(e.id) && !targetIds.has(e.purchasePlanItemId));
    }
    state.purchasePlan = (state.purchasePlan || []).filter(it => !targetIds.has(it.id));
    saveState();
    renderPurchasePlanPage();
    if (typeof renderSummaryPage === 'function') renderSummaryPage();
    showToast(`🗑️ ລຶບລາຍການທີ່ຊື້ແລ້ວ ${count} ລາຍການຮຽບຮ້ອຍ.`, 'success');
  }
}

function saveInlinePurchaseItem(event) {
  event.preventDefault();
  const nameInput = document.getElementById('inlinePurchaseName');
  const priceInput = document.getElementById('inlinePurchasePrice');
  const qtyInput = document.getElementById('inlinePurchaseQty');

  const name = (nameInput?.value || '').trim();
  const price = Math.max(0, Number(priceInput?.value || 0));
  const qty = Math.max(1, parseInt(qtyInput?.value || '1', 10));
  if (!name) return;

  if (!state.purchasePlan) state.purchasePlan = [];
  state.purchasePlan.push({
    id: 'PP-' + Date.now(),
    name,
    price,
    qty
  });

  if (nameInput) nameInput.value = '';
  if (priceInput) priceInput.value = '';
  if (qtyInput) qtyInput.value = '1';

  saveState();
  renderPurchasePlanPage();
}

function updatePurchaseItemQty(itemId, deltaOrVal, isDirect = false) {
  const item = (state.purchasePlan || []).find(x => x.id === itemId);
  if (!item) return;
  let newQty = isDirect ? parseInt(deltaOrVal, 10) : Number(item.qty || 1) + Number(deltaOrVal);
  if (isNaN(newQty) || newQty < 1) newQty = 1;
  item.qty = newQty;
  saveState();
  renderPurchasePlanPage();
}

function openPurchaseModal(itemId = null) {
  const modal = document.getElementById('purchaseModal');
  const titleEl = document.getElementById('purchaseModalTitle');
  if (!modal) return;

  if (itemId) {
    const item = (state.purchasePlan || []).find(x => x.id === itemId);
    if (!item) return;
    if (titleEl) titleEl.textContent = '✏️ ແກ້ໄຂລາຍການແຜນຊື້ສິນຄ້າ';
    document.getElementById('purchaseIdInput').value = item.id;
    document.getElementById('purchaseNameInput').value = item.name;
    document.getElementById('purchasePriceInput').value = item.price;
    document.getElementById('purchaseQtyInput').value = item.qty;
  } else {
    if (titleEl) titleEl.textContent = '📝 ເພີ່ມລາຍການແຜນຊື້ສິນຄ້າ';
    document.getElementById('purchaseIdInput').value = '';
    document.getElementById('purchaseNameInput').value = '';
    document.getElementById('purchasePriceInput').value = '';
    document.getElementById('purchaseQtyInput').value = '1';
  }
  updatePurchaseModalPreviewTotal();
  modal.classList.add('open');
}

function closePurchaseModal() {
  document.getElementById('purchaseModal')?.classList.remove('open');
}

function updatePurchaseModalPreviewTotal() {
  const price = Math.max(0, Number(document.getElementById('purchasePriceInput')?.value || 0));
  const qty = Math.max(1, Number(document.getElementById('purchaseQtyInput')?.value || 1));
  const previewEl = document.getElementById('purchaseModalTotalPreview');
  if (previewEl) {
    previewEl.textContent = formatLAK(price * qty);
  }
}

function savePurchaseModalForm(event) {
  event.preventDefault();
  const id = document.getElementById('purchaseIdInput').value;
  const name = document.getElementById('purchaseNameInput').value.trim();
  const price = Math.max(0, Number(document.getElementById('purchasePriceInput').value || 0));
  const qty = Math.max(1, parseInt(document.getElementById('purchaseQtyInput').value || '1', 10));
  if (!name) return;

  if (!state.purchasePlan) state.purchasePlan = [];
  if (id) {
    const idx = state.purchasePlan.findIndex(x => x.id === id);
    if (idx !== -1) {
      const existing = state.purchasePlan[idx];
      state.purchasePlan[idx] = { ...existing, name, price, qty };
    }
  } else {
    state.purchasePlan.push({
      id: 'PP-' + Date.now(),
      name,
      price,
      qty,
      purchased: false,
      createdAt: new Date().toISOString()
    });
  }

  saveState();
  closePurchaseModal();
  renderPurchasePlanPage();
}

function deletePurchaseItem(itemId) {
  const item = (state.purchasePlan || []).find(x => x.id === itemId);
  if (!item) return;
  if (confirm(`ຕ້ອງການລຶບລາຍການ "${item.name}" ອອກຈາກແຜນຊື້ສິນຄ້າແທ້ບໍ່?`)) {
    if (item.linkedExpenseId) {
      state.expenses = (state.expenses || []).filter(e => e.id !== item.linkedExpenseId);
    } else if (item.purchased) {
      state.expenses = (state.expenses || []).filter(e => e.purchasePlanItemId !== item.id);
    }
    state.purchasePlan = state.purchasePlan.filter(x => x.id !== itemId);
    saveState();
    renderPurchasePlanPage();
    if (typeof renderSummaryPage === 'function') renderSummaryPage();
  }
}

function importLowStockToPurchasePlan() {
  const lowProducts = state.products.filter(p => p.trackStock && p.stock <= p.minStock);
  if (lowProducts.length === 0) {
    alert('✅ ສິນຄ້າໃນສາງທຸກລາຍການຍັງມີພຽງພໍ (ບໍ່ມີລາຍການໃກ້ໝົດສາງ).');
    return;
  }
  if (!state.purchasePlan) state.purchasePlan = [];
  let added = 0;
  lowProducts.forEach(p => {
    const exists = state.purchasePlan.some(item => item.name === p.name);
    if (!exists) {
      const suggestQty = Math.max(5, (p.minStock || 5) * 2);
      state.purchasePlan.push({
        id: 'PP-' + Date.now() + '-' + added,
        name: p.name,
        price: Number(p.cost || p.price || 0),
        qty: suggestQty
      });
      added++;
    }
  });
  saveState();
  renderPurchasePlanPage();
  alert(added > 0 ? `✅ ດຶງສິນຄ້າໃກ້ໝົດສາງເຂົ້າແຜນຊື້ສຳເລັດ ${added} ລາຍການ!` : 'ℹ️ ລາຍການສິນຄ້າໃກ້ໝົດສາງມີຢູ່ໃນແຜນຊື້ແລ້ວ.');
}

// ==========================================================================
// 6. GOOGLE DRIVE & GOOGLE SHEETS CLOUD SYNC & CROSS-DEVICE ENGINE
// ==========================================================================
const GSHEET_URL_KEY = 'donluang_gsheet_webapp_url';
const GDRIVE_FOLDER_URL_KEY = 'donluang_gdrive_folder_url';

let isSyncingFromCloud = false;
let autoSyncInterval = null;
let lastCloudSyncTime = null;

function getGSheetUrl() {
  // 1. ກວດສອບຈາກ URL Query Parameter (ເຊັ່ນ: ?sync=https://script.google.com/...)
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const syncParam = urlParams.get('sync');
    if (syncParam) {
      const decoded = decodeURIComponent(syncParam).trim();
      if (decoded.startsWith('http')) {
        localStorage.setItem(GSHEET_URL_KEY, decoded);
        return decoded;
      }
    }
  } catch (e) {}

  // 2. ກວດສອບຈາກໄຟລ໌ config.js (window.DONLUANG_CONFIG.cloudSyncUrl)
  if (window.DONLUANG_CONFIG && typeof window.DONLUANG_CONFIG.cloudSyncUrl === 'string' && window.DONLUANG_CONFIG.cloudSyncUrl.trim()) {
    const cfgUrl = window.DONLUANG_CONFIG.cloudSyncUrl.trim();
    if (!localStorage.getItem(GSHEET_URL_KEY)) {
      try { localStorage.setItem(GSHEET_URL_KEY, cfgUrl); } catch (e) {}
    }
    return cfgUrl;
  }

  // 3. ກວດສອບຈາກ localStorage ຂອງເຄື່ອງ
  return (localStorage.getItem(GSHEET_URL_KEY) || '').trim();
}

function getGDriveFolderUrl() {
  return (localStorage.getItem(GDRIVE_FOLDER_URL_KEY) || '').trim();
}

function updateGSheetIndicator(status = 'idle') {
  const dot = document.getElementById('gsheetStatusDot');
  const text = document.getElementById('gsheetSyncStatusText');
  const driveBtn = document.getElementById('openGDriveFolderBtn');
  const url = getGSheetUrl();
  const folderUrl = getGDriveFolderUrl();

  if (driveBtn) {
    driveBtn.style.display = folderUrl ? 'inline-flex' : 'none';
  }

  if (!url) {
    if (dot) dot.textContent = '⚪';
    if (text) text.textContent = 'ສະຖານະ: ຍັງບໍ່ທັນໄດ້ຕັ້ງຄ່າລິ້ງ Cloud (ໃຊ້ສະເພາະ Offline ໃນເຄື່ອງນີ້)';
    return;
  }

  if (status === 'syncing') {
    if (dot) dot.textContent = '🟡';
    if (text) text.textContent = '⏳ ກຳລັງຊິ້ງຂໍ້ມູນກັບ Cloud (ທຸກເຄື່ອງ)...';
  } else if (status === 'ok') {
    if (dot) dot.textContent = '🟢';
    const timeStr = lastCloudSyncTime ? lastCloudSyncTime.toLocaleTimeString('lo-LA') : new Date().toLocaleTimeString('lo-LA');
    if (text) text.textContent = `🟢 ເຊື່ອມຕໍ່ Cloud ແລ້ວ • ທຸກເຄື່ອງຊິ້ງກັນອັດຕະໂນມັດ (ອັບເດດລ່າສຸດ: ${timeStr})`;
  } else if (status === 'error') {
    if (dot) dot.textContent = '🔴';
    if (text) text.textContent = '⚠️ ບໍ່ສາມາດເຊື່ອມຕໍ່ໄດ້ (ກວດເຊັກອິນເຕີເນັດ ຫຼື Web App URL)';
  } else {
    if (dot) dot.textContent = '🟢';
    if (text) text.textContent = '🟢 ພ້ອມເຊື່ອມຕໍ່ Cloud ທຸກເຄື່ອງຕະຫຼອດ 24/7';
  }
}

function openGSheetModal() {
  const input = document.getElementById('gsheetUrlInput');
  const currentUrl = getGSheetUrl();
  if (input) input.value = currentUrl;
  updateGSheetIndicator();

  // ສ້າງ QR Code ແລະ ລິ້ງສຳລັບເປີດໃນມືຖື
  const mobileBox = document.getElementById('mobileSyncBox');
  const qrImg = document.getElementById('syncQrCodeImg');
  const linkInput = document.getElementById('mobileSyncLinkInput');

  if (currentUrl) {
    const origin = window.location.origin + window.location.pathname;
    const shareUrl = `${origin}?sync=${encodeURIComponent(currentUrl)}`;
    if (linkInput) linkInput.value = shareUrl;
    if (qrImg) {
      qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(shareUrl)}`;
    }
  }

  if (typeof applyUserPermissions === 'function') {
    applyUserPermissions();
  }

  document.getElementById('gsheetModal')?.classList.add('open');
}

function toggleQrSyncBox() {
  const mobileBox = document.getElementById('mobileSyncBox');
  if (!mobileBox) return;
  const isHidden = mobileBox.style.display === 'none' || !mobileBox.style.display;
  mobileBox.style.display = isHidden ? 'flex' : 'none';
  if (isHidden) {
    mobileBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function closeGSheetModal() {
  document.getElementById('gsheetModal')?.classList.remove('open');
}

function copyMobileSyncLink() {
  const input = document.getElementById('mobileSyncLinkInput');
  if (!input || !input.value) return;
  const linkText = input.value;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(linkText).then(() => {
      if (typeof showToast === 'function') {
        showToast('📋 ກ໊ອບປີ້ລິ້ງສຳລັບສົ່ງໃຫ້ມືຖືສຳເລັດແລ້ວ!', 'success');
      }
    }).catch(() => {
      input.select();
      document.execCommand('copy');
      if (typeof showToast === 'function') {
        showToast('📋 ກ໊ອບປີ້ລິ້ງສຳເລັດ!', 'success');
      }
    });
  } else {
    input.select();
    document.execCommand('copy');
    if (typeof showToast === 'function') {
      showToast('📋 ກ໊ອບປີ້ລິ້ງສຳເລັດ!', 'success');
    }
  }
}

async function syncToGSheetBackground(showAlert = false, allowInitialInit = false) {
  const url = getGSheetUrl();
  if (!url) return;

  // ຖ້າຍັງດຶງຂໍ້ມູນຫຼັກຈາກ Google Drive ຕອນເປີດແອັບບໍ່ທັນສຳເລັດ ຫ້າມສົ່ງຂໍ້ມູນອັດຕະໂນມັດຂຶ້ນທັບເດັດຂາດ
  if (!allowInitialInit && !showAlert && !initialCloudSyncCompleted) {
    pendingCloudPushAfterInit = true;
    return;
  }

  // ລະບົບປ້ອງກັນຂໍ້ມູນ: ຖ້າຫາກຍັງເປັນພຽງ Demo Default Template ຫ້າມບໍ່ໃຫ້ອັບໂຫຼດທັບ Google Drive ເດັດຂາດ
  if (!allowInitialInit && (state._isDefaultState || isUneditedDefaultData(state))) {
    console.warn('⚠️ ລະບົບປ້ອງກັນຂໍ້ມູນ: ຂໍ້ມູນຍັງເປັນ Demo Default Template ບໍ່ອະນຸຍາດໃຫ້ຂຽນທັບ Google Drive');
    if (showAlert) {
      // ຖ້າຜູ້ໃຊ້ກົດປຸ່ມສຳຮອງຂຶ້ນ Google Drive ໃນຂະນະທີ່ເຄື່ອງຍັງເປັນຂໍ້ມູນຕົວຢ່າງ ໃຫ້ດຶງຂໍ້ມູນຫຼັກຈາກ Google Drive ມາກ່ອນ
      await autoSyncFromCloud(false, true, true);
    }
    return;
  }

  updateGSheetIndicator('syncing');
  try {
    saveMediaToLocalCache(state);
    const safeCloudState = await buildCloudSafeStateAsync(state);
    const payload = {
      state: safeCloudState,
      timestamp: new Date().toISOString(),
      lastModified: state.lastModified || Date.now()
    };

    await fetch(url, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });

    try {
      localStorage.removeItem('donluang_has_unsynced_changes');
    } catch (e) {}
    lastCloudSyncTime = new Date();
    updateGSheetIndicator('ok');

    if (showAlert) {
      if (typeof showToast === 'function') {
        showToast('☁️ ສຳຮອງຂໍ້ມູນຂຶ້ນ Google Drive & Sheet ສຳເລັດ!', 'success');
      }
      alert('✅ ສົ່ງ ແລະ ສຳຮອງຂໍ້ມູນທັງໝົດຂຶ້ນ Cloud ສຳເລັດແລ້ວ! ທຸກເຄື່ອງຈະໄດ້ຮັບຂໍ້ມູນລ່າສຸດນີ້ທັນທີ.');
    }
  } catch (err) {
    updateGSheetIndicator('error');
    if (showAlert) {
      alert('⚠️ ເກີດຂໍ້ຜິດພາດໃນການສົ່ງຂໍ້ມູນ. ກະລຸນາກວດເຊັກອິນເຕີເນັດ ຫຼື Web App URL.');
    }
  }
}

async function saveGSheetUrlAndSync() {
  const input = document.getElementById('gsheetUrlInput');
  const url = (input?.value || '').trim();
  if (!url) {
    localStorage.removeItem(GSHEET_URL_KEY);
    localStorage.removeItem(GDRIVE_FOLDER_URL_KEY);
    updateGSheetIndicator();
    alert('ລຶບລິ້ງເຊື່ອມຕໍ່ອອກແລ້ວ (ໃຊ້ສະເພາະການບັນທຶກໃນເຄື່ອງ).');
    openGSheetModal();
    return;
  }
  localStorage.setItem(GSHEET_URL_KEY, url);
  openGSheetModal();
  // ເມື່ອບັນທຶກລິ້ງ Google Drive ໃໝ່ ຫຼື ຫຼັງອັບເດດເວັບແອັບ ໃຫ້ດຶງຂໍ້ມູນຫຼັກຈາກ Google Drive ມາກ່ອນສະເໝີ (ຫ້າມເອົາຂໍ້ມູນໃໝ່ໄປທັບຂໍ້ມູນເກົ່າໃນ Google Drive)
  await autoSyncFromCloud(false, true, true);
}

// ລວມລາຍການຂໍ້ມູນໂດຍຖືເອົາຂໍ້ມູນຈາກ Google Drive ເປັນຫຼັກ (Master Data) ແລະ ຮັກສາຮູບພາບ/ລາຍການທີ່ສ້າງໃໝ່ໃນເຄື່ອງ
function mergeMasterListById(cloudList, localList, allowLocalAppend = false) {
  const localMap = new Map();
  if (Array.isArray(localList)) {
    localList.forEach(item => {
      if (item && item.id) localMap.set(item.id, item);
    });
  }

  const base = Array.isArray(cloudList)
    ? cloudList.map(cloudItem => {
        if (!cloudItem || !cloudItem.id) return cloudItem;
        const localItem = localMap.get(cloudItem.id);
        if (!localItem) return cloudItem;
        const merged = { ...cloudItem };
        // ຖ້າໃນ Cloud ຍັງບໍ່ມີຮູບ ແຕ່ໃນເຄື່ອງນີ້ມີຮູບ (ຫຼື ເຄື່ອງນີ້ຫາກໍອັບເດດຮູບໃໝ່) ໃຫ້ຮັກສາຮູບໄວ້
        if ((!merged.image && localItem.image) || (allowLocalAppend && localItem.image)) {
          merged.image = localItem.image;
        }
        if ((!merged.avatar && localItem.avatar) || (allowLocalAppend && localItem.avatar)) {
          merged.avatar = localItem.avatar;
        }
        return merged;
      })
    : [];

  if (!allowLocalAppend || !Array.isArray(localList) || localList.length === 0) {
    return base;
  }
  const existingIds = new Set(base.map(item => item && item.id).filter(Boolean));
  localList.forEach(item => {
    if (item && item.id && !existingIds.has(item.id)) {
      base.push(item);
      existingIds.add(item.id);
    }
  });
  return base;
}

// ດຶງຂໍ້ມູນລ່າສຸດຈາກ Cloud ອັດຕະໂນມັດ ແລະ ໃຫ້ Google Drive ເປັນແຫຼ່ງຂໍ້ມູນຫຼັກ (Master Data)
async function autoSyncFromCloud(silent = true, forcePull = false, isStartupOrUpdate = false) {
  const url = getGSheetUrl();
  if (!url) {
    initialCloudSyncCompleted = true;
    return;
  }
  if (isSyncingFromCloud) return;

  isSyncingFromCloud = true;
  if (!silent) updateGSheetIndicator('syncing');

  try {
    const fetchUrl = url + (url.includes('?') ? '&' : '?') + '_t=' + Date.now();
    const res = await fetch(fetchUrl);
    const data = await res.json();

    if (data && data.ok && data.state) {
      if (data.driveFolderUrl) {
        localStorage.setItem(GDRIVE_FOLDER_URL_KEY, data.driveFolderUrl);
      }

      const cloudState = data.state;
      const cloudTime = Number(cloudState.lastModified || 0) || (data.updatedAt ? new Date(data.updatedAt).getTime() : 0);
      const localTime = Number(state.lastModified || 0);

      const hasCloudData =
        (Array.isArray(cloudState.bills) && cloudState.bills.length > 0) ||
        (Array.isArray(cloudState.products) && cloudState.products.length > 0) ||
        (Array.isArray(cloudState.machines) && cloudState.machines.length > 0) ||
        (Array.isArray(cloudState.expenses) && cloudState.expenses.length > 0) ||
        (Array.isArray(cloudState.purchasePlan) && cloudState.purchasePlan.length > 0);

      const localIsDefault = Boolean(state._isDefaultState) || isUneditedDefaultData(state);
      const hasLocalUnsynced = !localIsDefault && localStorage.getItem('donluang_has_unsynced_changes') === 'true';

      // ປ້ອງກັນກໍລະນີເຄື່ອງນີ້ບໍ່ມີບິນເລີຍ ແຕ່ໃນ Google Drive ມີບິນຢູ່ແລ້ວ -> ຕ້ອງເອົາຂໍ້ມູນຈາກ Google Drive ສະເໝີ
      const cloudHasBillsButLocalEmpty =
        Array.isArray(cloudState.bills) && cloudState.bills.length > 0 &&
        (!Array.isArray(state.bills) || state.bills.length === 0);

      // ຫຼັກການສຳຄັນ: Google Drive ແມ່ນຂໍ້ມູນພື້ນຖານ / ຂໍ້ມູນຫຼັກ (Master Data)
      // ທຸກຄັ້ງທີ່ເປີດແອັບ ຫຼື ມີການອັບເດດເວັບແອັບ (isStartupOrUpdate / isAppJustUpdated / forcePull)
      // ໃຫ້ດຶງຂໍ້ມູນເກົ່າທີ່ບັນທຶກໄວ້ໃນ Google Drive ມາສະແດງສະເໝີ
      const shouldAdoptCloud =
        forcePull ||
        isStartupOrUpdate ||
        isAppJustUpdated ||
        localIsDefault ||
        localTime === 0 ||
        cloudHasBillsButLocalEmpty ||
        (cloudTime >= localTime && hasCloudData) ||
        (!hasLocalUnsynced && hasCloudData);

      if (shouldAdoptCloud && hasCloudData) {
        const previousLocalState = state;
        const preserveGenuineLocalAdditions = isStartupOrUpdate && hasLocalUnsynced && !localIsDefault && !forcePull;

        const mergedBills = mergeMasterListById(
          Array.isArray(cloudState.bills) ? cloudState.bills : [],
          previousLocalState.bills,
          preserveGenuineLocalAdditions
        );
        const mergedProducts = Array.isArray(cloudState.products)
          ? mergeMasterListById(cloudState.products, previousLocalState.products, preserveGenuineLocalAdditions)
          : (previousLocalState.products || [...DEFAULT_PRODUCTS]);
        const mergedMachines = Array.isArray(cloudState.machines)
          ? mergeMasterListById(cloudState.machines, previousLocalState.machines, preserveGenuineLocalAdditions)
          : (previousLocalState.machines || [...DEFAULT_MACHINES]);
        const mergedExpenses = Array.isArray(cloudState.expenses)
          ? mergeMasterListById(cloudState.expenses, previousLocalState.expenses, preserveGenuineLocalAdditions)
          : (previousLocalState.expenses || []);
        const mergedPurchasePlan = Array.isArray(cloudState.purchasePlan)
          ? mergeMasterListById(cloudState.purchasePlan, previousLocalState.purchasePlan, preserveGenuineLocalAdditions)
          : (previousLocalState.purchasePlan || []);

        const adoptedUsers = (Array.isArray(cloudState.users) && cloudState.users.length > 0)
          ? cloudState.users
          : (previousLocalState.users || (typeof getStoredUsers === 'function' ? getStoredUsers() : []));

        const nextState = {
          categories: (Array.isArray(cloudState.categories) && cloudState.categories.length > 0)
            ? cloudState.categories
            : (previousLocalState.categories || [...DEFAULT_CATEGORIES]),
          products: mergedProducts,
          machines: mergedMachines,
          bills: mergedBills,
          expenses: mergedExpenses,
          purchasePlan: mergedPurchasePlan,
          heldBills: Array.isArray(cloudState.heldBills) ? cloudState.heldBills : (previousLocalState.heldBills || []),
          receiptSettings: {
            ...DEFAULT_RECEIPT_SETTINGS,
            ...(previousLocalState.receiptSettings || {}),
            ...(cloudState.receiptSettings || {})
          },
          checklist: cloudState.checklist || previousLocalState.checklist,
          users: adoptedUsers,
          currentUser: previousLocalState.currentUser || null,
          deviceMode: previousLocalState.deviceMode || detectSystemDeviceMode(),
          lastModified: cloudTime > 0 ? cloudTime : Date.now(),
          _isDefaultState: false
        };

        // ກູ້ຄືນຮູບພາບຈາກ Local Cache ຖ້າໃນ Cloud ຍັງບໍ່ທັນມີຮູບນັ້ນ
        const didRestoreMissingMedia = restoreMediaFromLocalCache(nextState, previousLocalState);
        saveMediaToLocalCache(nextState);

        // ອັບເດດຂໍ້ມູນຜູ້ໃຊ້ປັດຈຸບັນໃຫ້ກົງກັບຂໍ້ມູນຫຼັກ
        if (nextState.currentUser && Array.isArray(nextState.users)) {
          const matchedUser = nextState.users.find(
            u => u.id === nextState.currentUser.id || u.username?.toLowerCase() === nextState.currentUser.username?.toLowerCase()
          );
          if (matchedUser) {
            nextState.currentUser = matchedUser;
            localStorage.setItem('donluang_auth_user', JSON.stringify(matchedUser));
          }
        }

        state = nextState;
        syncPurchasedPlanItemsWithExpenses();

        if (Array.isArray(state.users) && state.users.length > 0) {
          localStorage.setItem('donluang_system_users', JSON.stringify(state.users));
        }

        try {
          localStorage.removeItem('donluang_has_unsynced_changes');
        } catch (e) {}

        isAppJustUpdated = false;
        initialCloudSyncCompleted = true;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        reRenderAllUI();
        lastCloudSyncTime = new Date();
        updateGSheetIndicator('ok');

        // ຖ້າມີລາຍການໃໝ່ ຫຼື ມີຮູບພາບໃນເຄື່ອງທີ່ຍັງບໍ່ທັນຂຶ້ນ Cloud ໃຫ້ສົ່ງຂຶ້ນ Cloud ອັດຕະໂນມັດ ເພື່ອໃຫ້ເຄື່ອງອື່ນເຫັນຮູບຄືກັນ
        if (preserveGenuineLocalAdditions || pendingCloudPushAfterInit || didRestoreMissingMedia) {
          pendingCloudPushAfterInit = false;
          syncToGSheetBackground(false);
        }

        if (!silent) {
          if (typeof showToast === 'function') {
            showToast('✅ ດຶງຂໍ້ມູນຫຼັກຈາກ Google Drive ສຳເລັດ!', 'success');
          }
          alert('✅ ດຶງຂໍ້ມູນຫຼັກຈາກ Google Drive ລົງມາໃສ່ເຄື່ອງສຳເລັດແລ້ວ! ຂໍ້ມູນທຸກໜ້າຖືກອັບເດດແລ້ວ.');
        }
      } else if (hasLocalUnsynced && localTime > cloudTime && !localIsDefault) {
        initialCloudSyncCompleted = true;
        pendingCloudPushAfterInit = false;
        // ມີການບັນທຶກໃໝ່ທີ່ເກີດຂຶ້ນໃນເຄື່ອງນີ້ແທ້ໆ ທີ່ຍັງບໍ່ທັນຂຶ້ນ Google Drive -> ສົ່ງຂຶ້ນ Cloud
        syncToGSheetBackground(false);
      } else {
        initialCloudSyncCompleted = true;
        lastCloudSyncTime = new Date();
        updateGSheetIndicator('ok');
        if (!silent) {
          if (typeof showToast === 'function') {
            showToast('✅ ຂໍ້ມູນໃນເຄື່ອງກົງກັບ Google Drive ແລ້ວ', 'info');
          }
        }
      }
    } else {
      initialCloudSyncCompleted = true;
      // ຖ້າໃນ Google Drive ຍັງບໍ່ເຄີຍມີຂໍ້ມູນສຳຮອງມາກ່ອນເລີຍ (Sheet ໃໝ່เอี่ยม) ແລະ ຜູ້ໃຊ້ກົດບັນທຶກລິ້ງ
      if (!silent) {
        if (!state._isDefaultState && !isUneditedDefaultData(state)) {
          await syncToGSheetBackground(true, true);
        } else {
          alert('ℹ️ ຍັງບໍ່ພົບຂໍ້ມູນສຳຮອງໃນ Google Drive (ກະລຸນາກວດສອບລິ້ງ ຫຼື ບັນທຶກຂໍ້ມູນໃໝ່ເພື່ອເລີ່ມສຳຮອງ).');
        }
      }
    }
  } catch (err) {
    initialCloudSyncCompleted = true;
    if (!silent) {
      updateGSheetIndicator('error');
      alert('⚠️ ບໍ່ສາມາດດຶງຂໍ້ມູນໄດ້. ກະລຸນາກວດສອບສິດ Who has access: Anyone.');
    }
  } finally {
    isSyncingFromCloud = false;
  }
}

async function pullFromGSheet() {
  const url = getGSheetUrl();
  if (!url) {
    alert('ກະລຸນາວາງລິ້ງ Google Apps Script Web App URL ກ່ອນ!');
    return;
  }
  await autoSyncFromCloud(false, true, true); // forcePull = true
}

// ດາວໂຫຼດໄຟລ໌ສຳຮອງ JSON ເກັບໄວ້ໃນ Google Drive / ຄອມພິວເຕີ
function exportDriveBackupFile() {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const fileName = `Donluang_Backup_${dateStr}.json`;
  const jsonStr = JSON.stringify(state, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 500);

  if (typeof showToast === 'function') {
    showToast('💾 ດາວໂຫຼດໄຟລ໌ສຳຮອງສຳເລັດ! ທ່ານສາມາດເກັບໄວ້ໃນ Google Drive ໄດ້', 'success');
  }
}

// ເປີດຕົວເລືອກໄຟລ໌ສຳຮອງເພື່ອກູ້ຄືນ
function triggerImportDriveBackup() {
  document.getElementById('driveBackupFileInput')?.click();
}

// ປະມວນຜົນກູ້ຄືນຂໍ້ມູນຈາກໄຟລ໌ JSON ທີ່ດາວໂຫຼດມາ
function handleDriveBackupUpload(event) {
  const file = event.target?.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const parsed = JSON.parse(e.target.result);
      if (!parsed || (!parsed.bills && !parsed.products && !parsed.expenses)) {
        alert('⚠️ ໄຟລ໌ນີ້ບໍ່ແມ່ນໄຟລ໌ສຳຮອງຂອງລະບົບຮ້ານຂາຍຜັກສົດ.');
        return;
      }

      if (!confirm('ຢືນຢັນການກູ້ຄືນຂໍ້ມູນຈາກໄຟລ໌ສຳຮອງນີ້ແທ້ບໍ່?\n(ຂໍ້ມູນປັດຈຸບັນຈະຖືກປ່ຽນແທນດ້ວຍຂໍ້ມູນໃນໄຟລ໌)')) {
        event.target.value = '';
        return;
      }

      state = {
        categories: Array.isArray(parsed.categories) && parsed.categories.length > 0 ? parsed.categories : (state.categories || DEFAULT_CATEGORIES),
        products: Array.isArray(parsed.products) ? parsed.products : (state.products || []),
        machines: Array.isArray(parsed.machines) ? parsed.machines : (state.machines || []),
        bills: Array.isArray(parsed.bills) ? parsed.bills : [],
        expenses: Array.isArray(parsed.expenses) ? parsed.expenses : [],
        purchasePlan: Array.isArray(parsed.purchasePlan) ? parsed.purchasePlan : [],
        heldBills: Array.isArray(parsed.heldBills) ? parsed.heldBills : [],
        receiptSettings: { ...DEFAULT_RECEIPT_SETTINGS, ...(parsed.receiptSettings || {}) },
        checklist: parsed.checklist || state.checklist,
        users: Array.isArray(parsed.users) && parsed.users.length > 0 ? parsed.users : (state.users || getStoredUsers()),
        currentUser: state.currentUser || null,
        deviceMode: state.deviceMode || detectSystemDeviceMode(),
        lastModified: Date.now(),
        _isDefaultState: false
      };

      if (Array.isArray(state.users) && state.users.length > 0) {
        localStorage.setItem('donluang_system_users', JSON.stringify(state.users));
      }

      saveState();
      reRenderAllUI();

      if (typeof showToast === 'function') {
        showToast('✅ ກູ້ຄືນຂໍ້ມູນທັງໝົດສຳເລັດແລ້ວ!', 'success');
      }
      alert('✅ ກູ້ຄືນຂໍ້ມູນຈາກໄຟລ໌ສຳຮອງສຳເລັດຮຽບຮ້ອຍ! ຂໍ້ມູນໄດ້ຖືກສົ່ງຂຶ້ນ Cloud ແລ້ວ.');
    } catch (err) {
      alert('⚠️ ເກີດຂໍ້ຜິດພາດໃນການອ່ານໄຟລ໌: ' + err.message);
    }
    event.target.value = '';
  };
  reader.readAsText(file);
}

// ເປີດ Google Drive ຂອງຜູ້ໃຊ້
function openMyGoogleDrive() {
  const folderUrl = getGDriveFolderUrl();
  if (folderUrl) {
    window.open(folderUrl, '_blank');
  } else {
    window.open('https://drive.google.com/drive/my-drive', '_blank');
  }
}

// ເລີ່ມລະບົບ Auto-Sync Polling ທຸກໆ 15 ວິນາທີ
function startAutoSyncPolling() {
  if (autoSyncInterval) clearInterval(autoSyncInterval);
  autoSyncInterval = setInterval(() => {
    if (document.visibilityState === 'visible') {
      autoSyncFromCloud(true);
    }
  }, 15000); // ກວດສອບ Cloud ທຸກໆ 15 ວິນາທີ
}

// ==========================================================================
// USER AUTHENTICATION, RBAC PERMISSIONS & DEVICE MODE SELECTION
// ==========================================================================
const DEFAULT_SYSTEM_USERS = [
  {
    id: 'user_admin',
    username: 'admin',
    password: '1234',
    name: 'ເຈົ້າຂອງຮ້ານ',
    role: 'owner',
    permissions: {
      pos: true,
      catalog: true,
      machines: true,
      history: true,
      summary: true,
      purchase: true,
      settings: true
    }
  },
  {
    id: 'user_cashier',
    username: 'cashier',
    password: '1234',
    name: 'ພະນັກງານຂາຍ',
    role: 'cashier',
    permissions: {
      pos: true,
      catalog: false,
      machines: false,
      history: false,
      summary: false,
      purchase: false,
      settings: false
    }
  }
];

function cleanUserDisplayName(name) {
  if (!name) return '';
  return String(name)
    .replace(/\s*\(owner\)/gi, '')
    .replace(/\s*\(cashier\)/gi, '')
    .replace(/\s*\(admin\)/gi, '')
    .replace(/\s*\(staff\)/gi, '')
    .trim();
}

function getStoredUsers() {
  const raw = localStorage.getItem('donluang_system_users');
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        parsed.forEach(u => {
          if (u && u.name) u.name = cleanUserDisplayName(u.name);
        });
        return parsed;
      }
    } catch (e) {}
  }
  localStorage.setItem('donluang_system_users', JSON.stringify(DEFAULT_SYSTEM_USERS));
  return DEFAULT_SYSTEM_USERS;
}

function saveStoredUsers(users) {
  state.users = users;
  localStorage.setItem('donluang_system_users', JSON.stringify(users));
  saveState();
}

function initSystemUsers() {
  state.users = getStoredUsers();
}

function canAccessTab(tabId) {
  if (!state.currentUser) return true;
  if (state.currentUser.role === 'owner' || state.currentUser.role === 'admin') return true;
  const perms = state.currentUser.permissions;
  if (!perms) {
    return tabId === 'pos';
  }
  const permKey = (tabId === 'products' || tabId === 'services') ? 'catalog' : tabId;
  return !!perms[permKey];
}

function applyUserPermissions() {
  const user = state.currentUser;
  const isOwner = !user || user.role === 'owner' || user.role === 'admin';
  const perms = user?.permissions || (isOwner ? {
    pos: true, catalog: true, machines: true, history: true, summary: true, purchase: true, settings: true
  } : {
    pos: true, catalog: false, machines: false, history: false, summary: false, purchase: false, settings: false
  });

  // Sidebar navigation items: hide or show
  document.querySelectorAll('.sidebar-nav-item').forEach(item => {
    const tabId = item.dataset.tab;
    const permKey = (tabId === 'products' || tabId === 'services') ? 'catalog' : tabId;
    const allowed = isOwner || !!perms[permKey];
    item.style.display = allowed ? 'flex' : 'none';
  });

  // User profile inside sidebar drawer
  const sideNameEl = document.getElementById('sideUsername');
  if (sideNameEl && user) {
    sideNameEl.textContent = cleanUserDisplayName(user.name) || user.username || 'ເຈົ້າຂອງຮ້ານ';
  }
  updateUserAvatarElements(user);

  // If currently active tab is forbidden, auto redirect to pos
  const activeTabPanel = document.querySelector('.tab-panel.active');
  if (activeTabPanel) {
    const activeTabId = activeTabPanel.id.replace('tab-', '');
    if (!canAccessTab(activeTabId)) {
      switchTab('pos');
    }
  }

  // Settings: Cloud section & Manage members button
  const cloudSec = document.getElementById('settingsCloudSection');
  if (cloudSec) {
    cloudSec.style.display = (isOwner || perms.settings) ? 'flex' : 'none';
  }

  const mgmtBtn = document.getElementById('manageUsersBtn');
  if (mgmtBtn) {
    mgmtBtn.style.display = isOwner ? 'inline-flex' : 'none';
  }

  // Update User info in settings header
  const nameEl = document.getElementById('headerUsername');
  if (nameEl && user) {
    nameEl.textContent = cleanUserDisplayName(user.name) || user.username || 'ເຈົ້າຂອງຮ້ານ';
  }
}

// ກວດສອບລະບົບອັດຕະໂນມັດທຸກຄັ້ງທີ່ເປີດຂຶ້ນ (Windows = ລວງນອນ/tablet, Android ມືຖື & ແທັບເລັດ = ລວງຕັ້ງ/mobile)
function detectSystemDeviceMode() {
  const ua = String(navigator.userAgent || '');
  const platform = String(navigator.platform || '');
  const isAndroid = /Android/i.test(ua);
  const isIOS = /iPhone|iPad|iPod/i.test(ua) || (platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isMobileUA = /webOS|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua);
  const isWindows = /Windows/i.test(ua) || /Win32|Win64|WOW64/i.test(platform);

  // ຖ້າເປັນ Android (ທັງມືຖື ແລະ ແທັບເລັດ) ຫຼື iOS ໃຫ້ໃຊ້ໂໝດລວງຕັ້ງ ('mobile') ສະເໝີ
  if (isAndroid || isIOS || isMobileUA) {
    return 'mobile';
  }
  // ຖ້າເປັນລະບົບ Windows ໃຫ້ໃຊ້ໂໝດລວງນອນເຕັມຮູບແບບ ('tablet')
  if (isWindows && window.innerWidth > 768) {
    return 'tablet';
  }
  return window.innerWidth <= 960 ? 'mobile' : 'tablet';
}

function isAndroidOrMobileMode() {
  return document.body.getAttribute('data-device-mode') === 'mobile' || state.deviceMode === 'mobile';
}

function handleMachineRowClick(machineId, event) {
  if (isAndroidOrMobileMode()) {
    openMachineActionMenu(machineId, event);
  }
}

let selectedActionProductId = null;

function handleProductRowClick(productId, event) {
  if (isAndroidOrMobileMode()) {
    openProductActionMenu(productId, event);
  }
}

function openProductActionMenu(productId, event) {
  if (event) event.stopPropagation();
  const p = (state.products || []).find(x => x.id === productId);
  if (!p) return;
  selectedActionProductId = p.id;

  const modal = document.getElementById('productActionMenuModal');
  const imgEl = document.getElementById('prodActionMenuImg');
  const nameEl = document.getElementById('prodActionMenuName');
  const subEl = document.getElementById('prodActionMenuSub');
  const metaEl = document.getElementById('prodActionMenuMeta');
  const reorderBtn = document.getElementById('prodActionReorderBtn');
  const barcodeBtn = document.getElementById('prodActionBarcodeBtn');

  if (imgEl) imgEl.src = getProductImageSrc(p);
  if (nameEl) nameEl.textContent = p.name || '';
  if (subEl) subEl.textContent = `ລາຄາຂາຍ: ${formatLAK(p.price)} / ${p.unit || 'ອັນ'}`;
  if (metaEl) {
    const profit = Number(p.price || 0) - Number(p.cost || 0);
    metaEl.innerHTML = `
      <div><strong>🏷️ ລະຫັດ:</strong> ${escapeHtml(p.code || '-')} • <strong>ປະເພດ:</strong> ${getCategoryLabel(p.category)}</div>
      <div><strong>📉 ຕົ້ນທຶນ:</strong> ${formatLAK(p.cost)} • <strong>📈 ກຳໄລ:</strong> +${formatLAK(profit)}</div>
      <div><strong>📦 ສະຕັອກ:</strong> ${p.trackStock ? formatProductStock(p) : 'ບໍລິການ (ບໍ່ຕັດສາງ)'}</div>
    `;
  }
  if (reorderBtn) {
    reorderBtn.style.display = p.trackStock ? 'inline-flex' : 'none';
  }
  if (barcodeBtn) {
    barcodeBtn.style.display = p.category === 'service' ? 'none' : 'inline-flex';
  }

  if (modal) modal.classList.add('open');
}

function closeProductActionMenu() {
  document.getElementById('productActionMenuModal')?.classList.remove('open');
}

function handleProductActionEdit() {
  const id = selectedActionProductId;
  closeProductActionMenu();
  if (id) openProductModal(id);
}

function handleProductActionBarcode() {
  const id = selectedActionProductId;
  closeProductActionMenu();
  if (id) openBarcodeStudioModal(id);
}

function handleProductActionReorder() {
  const id = selectedActionProductId;
  closeProductActionMenu();
  if (id) openReorderModal(id);
}

function handleProductActionDelete() {
  const id = selectedActionProductId;
  closeProductActionMenu();
  if (id) deleteProduct(id);
}

let selectedActionPurchaseId = null;

function handlePurchaseRowClick(itemId, event) {
  if (isAndroidOrMobileMode()) {
    openPurchaseActionMenu(itemId, event);
  }
}

function openPurchaseActionMenu(itemId, event) {
  if (event) event.stopPropagation();
  const item = (state.purchasePlan || []).find(x => x.id === itemId);
  if (!item) return;
  selectedActionPurchaseId = item.id;

  const modal = document.getElementById('purchaseActionMenuModal');
  const nameEl = document.getElementById('purchActionMenuName');
  const subEl = document.getElementById('purchActionMenuSub');
  const markBtn = document.getElementById('purchActionMarkBtn');
  const editBtn = document.getElementById('purchActionEditBtn');

  const lineTotal = Number(item.price || 0) * Number(item.qty || 0);
  if (nameEl) nameEl.textContent = item.name || '';
  if (subEl) subEl.textContent = `ຈຳນວນ: ${item.qty} × ${formatLAK(item.price)} = ${formatLAK(lineTotal)}`;

  if (markBtn) {
    if (item.purchased) {
      markBtn.textContent = '🔄 ຍ້າຍກັບຄືນໄປລໍຖ້າຊື້';
      markBtn.style.background = '#2563eb';
    } else {
      markBtn.textContent = '✅ ຊື້ແລ້ວ';
      markBtn.style.background = '#059669';
    }
  }
  if (editBtn) {
    editBtn.style.display = item.purchased ? 'none' : 'inline-flex';
  }

  if (modal) modal.classList.add('open');
}

function closePurchaseActionMenu() {
  document.getElementById('purchaseActionMenuModal')?.classList.remove('open');
}

function handlePurchaseActionToggleStatus() {
  const id = selectedActionPurchaseId;
  closePurchaseActionMenu();
  if (!id) return;
  const item = (state.purchasePlan || []).find(x => x.id === id);
  if (!item) return;
  if (item.purchased) {
    unmarkPurchaseItem(id);
  } else {
    markPurchaseItemPurchased(id);
  }
}

function handlePurchaseActionEdit() {
  const id = selectedActionPurchaseId;
  closePurchaseActionMenu();
  if (id) openPurchaseModal(id);
}

function handlePurchaseActionDelete() {
  const id = selectedActionPurchaseId;
  closePurchaseActionMenu();
  if (id) deletePurchaseItem(id);
}

let selectedActionExpenseId = null;

function handleExpenseRowClick(expenseId, event) {
  if (isAndroidOrMobileMode()) {
    openExpenseActionMenu(expenseId, event);
  }
}

function openExpenseActionMenu(expenseId, event) {
  if (event) event.stopPropagation();
  const exp = (state.expenses || []).find(x => x.id === expenseId);
  if (!exp) return;
  selectedActionExpenseId = exp.id;

  const modal = document.getElementById('expenseActionMenuModal');
  const titleEl = document.getElementById('expActionMenuTitle');
  const subEl = document.getElementById('expActionMenuSub');

  if (titleEl) titleEl.textContent = exp.title || 'ລາຍຈ່າຍ';
  if (subEl) subEl.textContent = `📅 ${exp.date || '-'} • ຈຳນວນ: -${formatLAK(exp.amount)}`;

  if (modal) modal.classList.add('open');
}

function closeExpenseActionMenu() {
  document.getElementById('expenseActionMenuModal')?.classList.remove('open');
}

function handleExpenseActionEdit() {
  const id = selectedActionExpenseId;
  closeExpenseActionMenu();
  if (id) openExpenseModal(id);
}

function handleExpenseActionDelete() {
  const id = selectedActionExpenseId;
  closeExpenseActionMenu();
  if (id) deleteExpense(id);
}

function initAuthAndDeviceMode() {
  initSystemUsers();
  // ກວດສອບອຸປະກອນອັດຕະໂນມັດທຸກຄັ້ງທີ່ເປີດຂຶ້ນ (Windows vs Android)
  const autoMode = detectSystemDeviceMode();
  localStorage.setItem('donluang_device_mode', autoMode);

  const savedUserStr = localStorage.getItem('donluang_auth_user');

  if (savedUserStr) {
    try {
      const parsed = JSON.parse(savedUserStr);
      const users = getStoredUsers();
      const current = users.find(u => u.username.toLowerCase() === parsed.username?.toLowerCase() || u.id === parsed.id) || parsed;
      if (current && current.name) current.name = cleanUserDisplayName(current.name);
      state.currentUser = current;
      updateHeaderUserUI();
      applyUserPermissions();
      applyDeviceMode(autoMode, false);
    } catch (e) {
      localStorage.removeItem('donluang_auth_user');
      applyDeviceMode(autoMode, false);
      openLoginModal();
    }
  } else {
    applyDeviceMode(autoMode, false);
    openLoginModal();
  }
}

function openLoginModal() {
  const modal = document.getElementById('loginModal');
  if (!modal) return;
  modal.style.display = 'flex';
  const err = document.getElementById('loginErrorMessage');
  if (err) err.style.display = 'none';
  const uInput = document.getElementById('loginUsernameInput');
  const pInput = document.getElementById('loginPasswordInput');
  if (uInput && !uInput.value) uInput.value = 'admin';
  if (pInput && !pInput.value) pInput.value = '1234';
  setTimeout(() => {
    if (uInput) uInput.focus();
  }, 100);
}

function closeLoginModal() {
  const modal = document.getElementById('loginModal');
  if (modal) modal.style.display = 'none';
}

function setQuickLoginAccount(username, password) {
  const uInput = document.getElementById('loginUsernameInput');
  const pInput = document.getElementById('loginPasswordInput');
  if (uInput) uInput.value = username;
  if (pInput) pInput.value = password;
  const err = document.getElementById('loginErrorMessage');
  if (err) err.style.display = 'none';
}

function handleLoginSubmit(event) {
  event.preventDefault();
  const uInput = document.getElementById('loginUsernameInput');
  const pInput = document.getElementById('loginPasswordInput');
  const err = document.getElementById('loginErrorMessage');

  const username = (uInput?.value || '').trim();
  const password = (pInput?.value || '').trim();

  if (!username) {
    if (err) {
      err.textContent = '⚠️ ກະລຸນາປ້ອນຊື່ຜູ້ໃຊ້ງານ!';
      err.style.display = 'block';
    }
    return;
  }

  const users = getStoredUsers();
  const matched = users.find(
    u => u.username.toLowerCase() === username.toLowerCase() && u.password === password
  );

  if (!matched) {
    if (err) {
      err.textContent = '⚠️ ຊື່ຜູ້ໃຊ້ ຫຼື ລະຫັດຜ່ານບໍ່ຖືກຕ້ອງ! (ລະຫັດເລີ່ມຕົ້ນແມ່ນ: 1234)';
      err.style.display = 'block';
    }
    return;
  }

  state.currentUser = matched;
  localStorage.setItem('donluang_auth_user', JSON.stringify(matched));
  updateHeaderUserUI();
  applyUserPermissions();
  closeLoginModal();

  // ປັບຮູບແບບໜ້າຈໍໃຫ້ເຂົ້າກັບລະບົບອັດຕະໂນມັດ (Windows ລວງນອນ / Android ລວງຕັ້ງ)
  const autoMode = detectSystemDeviceMode();
  localStorage.setItem('donluang_device_mode', autoMode);
  applyDeviceMode(autoMode);

  if (typeof showToast === 'function') {
    showToast(`👋 ຍິນດີຕ້ອນຮັບ, ${matched.name || matched.username}!`, 'info');
  }
}

function updateUserAvatarElements(user) {
  const isOwner = !user || user.role === 'owner' || user.role === 'admin';
  const avatarSrc = user?.avatar || user?.image || '';
  const sideWrap = document.getElementById('sideUserAvatarWrap');
  const headerWrap = document.getElementById('headerUserAvatarWrap');

  if (sideWrap) {
    if (avatarSrc) {
      sideWrap.innerHTML = `<img src="${avatarSrc}" alt="Avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;" />`;
    } else {
      sideWrap.textContent = isOwner ? '👑' : '👤';
    }
  }
  if (headerWrap) {
    if (avatarSrc) {
      headerWrap.innerHTML = `<img src="${avatarSrc}" alt="Avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;" />`;
    } else {
      headerWrap.textContent = isOwner ? '👑' : '👤';
    }
  }
}

function updateHeaderUserUI() {
  const nameEl = document.getElementById('headerUsername');
  if (nameEl && state.currentUser) {
    nameEl.textContent = cleanUserDisplayName(state.currentUser.name) || state.currentUser.username || 'ເຈົ້າຂອງຮ້ານ';
  }
  const sideNameEl = document.getElementById('sideUsername');
  if (sideNameEl && state.currentUser) {
    sideNameEl.textContent = cleanUserDisplayName(state.currentUser.name) || state.currentUser.username || 'ເຈົ້າຂອງຮ້ານ';
  }
  updateUserAvatarElements(state.currentUser);
}

// ປ່ຽນໂໝດທັນທີເມື່ອກົດປຸ່ມ (Instant Toggle Mode)
function toggleDeviceMode() {
  const curMode = state.deviceMode || localStorage.getItem('donluang_device_mode') || 'tablet';
  const newMode = curMode === 'mobile' ? 'tablet' : 'mobile';
  localStorage.setItem('donluang_device_mode', newMode);
  applyDeviceMode(newMode);
  if (typeof showToast === 'function') {
    showToast(newMode === 'mobile' ? '📱 ສະຫຼັບເປັນ: ໂໝດມືຖື (ສະແກນຂາຍໄວ)' : '💻 ສະຫຼັບເປັນ: ໂໝດແທັບເລັດ/ຄອມ (ເຕັມຮູບແບບ)', 'info');
  }
}

function openDeviceModeModal(isMandatory = false) {
  const modal = document.getElementById('deviceModeModal');
  if (!modal) return;
  modal.style.display = 'flex';
  const cancelBtn = document.getElementById('btnCancelDeviceMode');
  if (cancelBtn) {
    cancelBtn.style.display = isMandatory ? 'none' : 'inline-block';
  }

  const curMode = state.deviceMode || localStorage.getItem('donluang_device_mode') || 'tablet';
  const cardMobile = document.getElementById('choiceCardMobile');
  const cardTablet = document.getElementById('choiceCardTablet');
  if (cardMobile) cardMobile.style.borderColor = curMode === 'mobile' ? '#2563eb' : '#e2e8f0';
  if (cardTablet) cardTablet.style.borderColor = curMode === 'tablet' ? '#2563eb' : '#e2e8f0';
}

function closeDeviceModeModal() {
  const modal = document.getElementById('deviceModeModal');
  if (modal) modal.style.display = 'none';
}

function selectDeviceMode(mode) {
  const activeMode = mode === 'mobile' ? 'mobile' : 'tablet';
  localStorage.setItem('donluang_device_mode', activeMode);
  applyDeviceMode(activeMode);
  closeDeviceModeModal();

  if (typeof showToast === 'function') {
    showToast(
      activeMode === 'mobile'
        ? '📱 ໂໝດມືຖື: ສະແດງສະເພາະ ບິນການຂາຍ'
        : '💻 ໂໝດແທັບເລັດ: ສະແດງເຕັມຮູບແບບ',
      'success'
    );
  }
}

function applyDeviceMode(mode, redirectToPos = false) {
  const activeMode = mode === 'mobile' ? 'mobile' : 'tablet';
  state.deviceMode = activeMode;
  document.body.setAttribute('data-device-mode', activeMode);

  const iconEl = document.getElementById('headerModeIcon');
  const labelEl = document.getElementById('headerModeLabel');
  const btnEl = document.getElementById('headerModeBtn');
  if (iconEl) iconEl.textContent = activeMode === 'mobile' ? '📱' : '💻';
  if (labelEl) labelEl.textContent = activeMode === 'mobile' ? 'ໂໝດ Android (ລວງຕັ້ງ)' : 'ໂໝດ Windows (ລວງນອນ)';
  if (btnEl) {
    btnEl.title = activeMode === 'mobile' ? 'ກົດເພື່ອສະຫຼັບເປັນ: ໂໝດ Windows (ລວງນອນ)' : 'ກົດເພື່ອສະຫຼັບເປັນ: ໂໝດ Android (ລວງຕັ້ງ)';
  }

  const sideIconEl = document.getElementById('sideModeIcon');
  const sideLabelEl = document.getElementById('sideModeLabel');
  if (sideIconEl) sideIconEl.textContent = activeMode === 'mobile' ? '📱' : '💻';
  if (sideLabelEl) sideLabelEl.textContent = activeMode === 'mobile' ? 'ໂໝດ Android' : 'ໂໝດ Windows';

  if (redirectToPos && activeMode === 'mobile') {
    switchTab('pos');
  }
}

function logoutUser() {
  if (confirm('ທ່ານຕ້ອງການອອກຈາກລະບົບແທ້ບໍ່?')) {
    localStorage.removeItem('donluang_auth_user');
    state.currentUser = null;
    closeDeviceModeModal();
    openLoginModal();
  }
}

// ==========================================
// MEMBER / USER MANAGEMENT FUNCTIONS
// ==========================================
function openUserManagementModal() {
  renderUserManagementList();
  const modal = document.getElementById('userManagementModal');
  if (modal) modal.style.display = 'flex';
}

function closeUserManagementModal() {
  const modal = document.getElementById('userManagementModal');
  if (modal) modal.style.display = 'none';
}

function renderUserManagementList() {
  const container = document.getElementById('userListContainer');
  const countBadge = document.getElementById('userCountBadge');
  if (!container) return;

  const users = getStoredUsers();
  if (countBadge) countBadge.textContent = users.length;

  if (users.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:1.5rem;color:#94a3b8;">ຍັງບໍ່ມີສະມາຊິກໃນລະບົບ</div>';
    return;
  }

  const permLabels = {
    pos: '🛒 ອອກບິນ',
    catalog: '📦 ສິນຄ້າ',
    machines: '🖨️ ອຸປະກອນ',
    history: '📊 ລາຍການບິນ',
    summary: '💰 ລາຍຮັບ-ຈ່າຍ',
    purchase: '📝 ແຜນຊື້',
    settings: '⚙️ ຕັ້ງຄ່າ'
  };

  container.innerHTML = users.map(u => {
    const isOwner = u.role === 'owner' || u.role === 'admin';
    const isCashier = u.role === 'cashier';
    const roleBadgeHtml = isOwner
      ? '<span style="font-size:0.74rem;font-weight:800;padding:0.18rem 0.6rem;border-radius:999px;background:#dbeafe;color:#1e40af;">👑 ເຈົ້າຂອງຮ້ານ</span>'
      : (isCashier
        ? '<span style="font-size:0.74rem;font-weight:800;padding:0.18rem 0.6rem;border-radius:999px;background:#dcfce7;color:#15803d;">🛒 ຄົນຂາຍ</span>'
        : '<span style="font-size:0.74rem;font-weight:800;padding:0.18rem 0.6rem;border-radius:999px;background:#fef3c7;color:#b45309;">⚙️ ກຳນົດເອງ</span>');

    const perms = u.permissions || (isOwner ? {
      pos: true, catalog: true, machines: true, history: true, summary: true, purchase: true, settings: true
    } : {
      pos: true, catalog: false, machines: false, history: false, summary: false, purchase: false, settings: false
    });

    const pillsHtml = Object.keys(permLabels).map(k => {
      const active = !!perms[k];
      return `<span class="perm-pill ${active ? 'active' : ''}">${permLabels[k]}</span>`;
    }).join(' ');

    const canDelete = u.username !== 'admin' && u.id !== 'user_admin' && u.id !== state.currentUser?.id;
    const avatarSrc = u.avatar || u.image || '';

    return `
      <div class="user-item-card">
        <div style="display:flex;align-items:center;gap:0.8rem;">
          <div
            onclick="triggerQuickMemberPhotoUpload('${u.id}', event)"
            title="ກົດເພື່ອໃສ່ຮູບ / ປ່ຽນຮູບໂປຣໄຟລ໌"
            style="position:relative;width:48px;height:48px;border-radius:50%;background:${isOwner ? '#eff6ff' : '#f0fdf4'};color:${isOwner ? '#2563eb' : '#16a34a'};display:flex;align-items:center;justify-content:center;font-size:1.35rem;border:2px solid ${isOwner ? '#93c5fd' : '#86efac'};cursor:pointer;flex-shrink:0;"
          >
            ${avatarSrc
              ? `<img src="${avatarSrc}" alt="${escapeHtml(u.name || u.username)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;" />`
              : (isOwner ? '👑' : '👤')
            }
            <span style="position:absolute;bottom:-2px;right:-2px;background:#2563eb;color:#ffffff;font-size:0.62rem;width:18px;height:18px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:1.5px solid #ffffff;box-shadow:0 1px 3px rgba(0,0,0,0.2);">📷</span>
          </div>
          <div>
            <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;">
              <strong style="font-size:0.95rem;color:#0f172a;">${escapeHtml(u.name || u.username)}</strong>
              <span style="font-size:0.78rem;color:#64748b;">(@${escapeHtml(u.username)})</span>
              ${roleBadgeHtml}
            </div>
            <div style="display:flex;gap:0.3rem;flex-wrap:wrap;margin-top:0.35rem;">
              ${pillsHtml}
            </div>
          </div>
        </div>
        <div style="display:flex;gap:0.4rem;align-items:center;flex-wrap:wrap;">
          <button type="button" class="btn btn-outline btn-sm" onclick="triggerQuickMemberPhotoUpload('${u.id}', event)" style="border-color:#93c5fd;color:#1d4ed8;background:#eff6ff;padding:0.3rem 0.6rem;font-size:0.78rem;font-weight:700;" title="ໃສ່ຮູບໂປຣໄຟລ໌">
            📷 ໃສ່ຮູບ
          </button>
          <button type="button" class="btn btn-outline btn-sm" onclick="openMemberFormModal('${u.id}')" style="padding:0.3rem 0.65rem;font-size:0.78rem;font-weight:700;">
            ✏️ ແກ້ໄຂ
          </button>
          ${canDelete ? `
            <button type="button" class="btn btn-sm btn-outline" onclick="deleteMember('${u.id}')" style="border-color:#fca5a5;color:#dc2626;background:#fef2f2;padding:0.3rem 0.65rem;font-size:0.78rem;font-weight:700;">
              🗑️ ລຶບ
            </button>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');
}

let quickPhotoTargetUserId = null;

function triggerQuickMemberPhotoUpload(userId, event) {
  if (event) event.stopPropagation();
  quickPhotoTargetUserId = userId;
  const fileInput = document.getElementById('quickMemberPhotoInput');
  if (fileInput) {
    fileInput.value = '';
    fileInput.click();
  }
}

async function handleQuickMemberPhotoUpload(event) {
  const file = event.target?.files?.[0];
  if (!file || !quickPhotoTargetUserId) return;
  try {
    const dataUrl = await compressImageFile(file, 300, 0.85);
    const users = getStoredUsers();
    const user = users.find(u => u.id === quickPhotoTargetUserId);
    if (user && dataUrl) {
      user.avatar = dataUrl;
      saveStoredUsers(users);
      if (state.currentUser && (state.currentUser.id === user.id || state.currentUser.username?.toLowerCase() === user.username?.toLowerCase())) {
        state.currentUser.avatar = dataUrl;
        localStorage.setItem('donluang_auth_user', JSON.stringify(state.currentUser));
        updateHeaderUserUI();
      }
      renderUserManagementList();
      if (typeof showToast === 'function') {
        showToast(`✅ ອັບເດດຮູບໂປຣໄຟລ໌ "${user.name || user.username}" ສຳເລັດ!`, 'success');
      }
    }
  } catch (err) {
    alert('ບໍ່ສາມາດອັບໂຫຼດຮູບພາບໄດ້!');
  }
  event.target.value = '';
}

function updateMemberModalAvatarPreview(avatarDataUrl, role = 'cashier') {
  const wrap = document.getElementById('memberAvatarPreviewWrap');
  const hiddenInput = document.getElementById('memberAvatarDataInput');
  if (hiddenInput) hiddenInput.value = avatarDataUrl || '';
  if (wrap) {
    if (avatarDataUrl) {
      wrap.innerHTML = `<img src="${avatarDataUrl}" alt="Avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;" />`;
    } else {
      const isOwner = role === 'owner' || role === 'admin';
      wrap.textContent = isOwner ? '👑' : '👤';
    }
  }
}

async function handleMemberModalPhotoChange(event) {
  const file = event.target?.files?.[0];
  if (!file) return;
  try {
    const dataUrl = await compressImageFile(file, 300, 0.85);
    const role = document.getElementById('memberRoleSelect')?.value || 'cashier';
    updateMemberModalAvatarPreview(dataUrl, role);
  } catch (err) {
    alert('ບໍ່ສາມາດອ່ານໄຟລ໌ຮູບພາບໄດ້!');
  }
  event.target.value = '';
}

function clearMemberModalPhoto() {
  const role = document.getElementById('memberRoleSelect')?.value || 'cashier';
  updateMemberModalAvatarPreview('', role);
}

function openMemberFormModal(userId = null) {
  const form = document.getElementById('memberFormModal');
  const title = document.getElementById('memberFormModalTitle');
  const idInput = document.getElementById('memberFormId');
  const nameInput = document.getElementById('memberNameInput');
  const usernameInput = document.getElementById('memberUsernameInput');
  const passwordInput = document.getElementById('memberPasswordInput');
  const roleSelect = document.getElementById('memberRoleSelect');
  const fileInput = document.getElementById('memberAvatarFileInput');
  if (fileInput) fileInput.value = '';

  if (!form) return;

  if (userId) {
    const users = getStoredUsers();
    const user = users.find(u => u.id === userId);
    if (!user) return;

    if (title) title.textContent = '✏️ ແກ້ໄຂຂໍ້ມູນສະມາຊິກ';
    if (idInput) idInput.value = user.id;
    if (nameInput) nameInput.value = user.name || '';
    if (usernameInput) {
      usernameInput.value = user.username || '';
      usernameInput.readOnly = user.username === 'admin';
    }
    if (passwordInput) passwordInput.value = user.password || '';
    if (roleSelect) {
      roleSelect.value = user.role || 'custom';
      roleSelect.disabled = user.username === 'admin';
    }
    updateMemberModalAvatarPreview(user.avatar || user.image || '', user.role || 'custom');

    const perms = user.permissions || {};
    ['pos', 'catalog', 'machines', 'history', 'summary', 'purchase', 'settings'].forEach(k => {
      const chk = document.getElementById(`perm_${k}`);
      if (chk) chk.checked = !!perms[k];
    });
  } else {
    if (title) title.textContent = '➕ ເພີ່ມສະມາຊິກໃໝ່';
    if (idInput) idInput.value = '';
    if (nameInput) nameInput.value = '';
    if (usernameInput) {
      usernameInput.value = '';
      usernameInput.readOnly = false;
    }
    if (passwordInput) passwordInput.value = '1234';
    if (roleSelect) {
      roleSelect.value = 'cashier';
      roleSelect.disabled = false;
    }
    updateMemberModalAvatarPreview('', 'cashier');
    handleMemberRoleChange();
  }

  form.style.display = 'flex';
  setTimeout(() => {
    if (nameInput) nameInput.focus();
  }, 100);
}

function closeMemberFormModal() {
  const form = document.getElementById('memberFormModal');
  if (form) form.style.display = 'none';
}

function handleMemberRoleChange() {
  const roleSelect = document.getElementById('memberRoleSelect');
  const role = roleSelect?.value || 'custom';

  const chkPos = document.getElementById('perm_pos');
  const chkCatalog = document.getElementById('perm_catalog');
  const chkMachines = document.getElementById('perm_machines');
  const chkHistory = document.getElementById('perm_history');
  const chkSummary = document.getElementById('perm_summary');
  const chkPurchase = document.getElementById('perm_purchase');
  const chkSettings = document.getElementById('perm_settings');

  if (role === 'owner') {
    if (chkPos) chkPos.checked = true;
    if (chkCatalog) chkCatalog.checked = true;
    if (chkMachines) chkMachines.checked = true;
    if (chkHistory) chkHistory.checked = true;
    if (chkSummary) chkSummary.checked = true;
    if (chkPurchase) chkPurchase.checked = true;
    if (chkSettings) chkSettings.checked = true;
  } else if (role === 'cashier') {
    if (chkPos) chkPos.checked = true;
    if (chkCatalog) chkCatalog.checked = false;
    if (chkMachines) chkMachines.checked = false;
    if (chkHistory) chkHistory.checked = false;
    if (chkSummary) chkSummary.checked = false;
    if (chkPurchase) chkPurchase.checked = false;
    if (chkSettings) chkSettings.checked = false;
  }
}

function handleSaveMember(event) {
  event.preventDefault();
  const idInput = document.getElementById('memberFormId');
  const nameInput = document.getElementById('memberNameInput');
  const usernameInput = document.getElementById('memberUsernameInput');
  const passwordInput = document.getElementById('memberPasswordInput');
  const roleSelect = document.getElementById('memberRoleSelect');

  const id = idInput?.value || `user_${Date.now()}`;
  const name = (nameInput?.value || '').trim();
  const username = (usernameInput?.value || '').trim();
  const password = (passwordInput?.value || '').trim();
  const role = roleSelect?.value || 'custom';

  if (!name || !username || !password) {
    alert('ກະລຸນາປ້ອນຂໍ້ມູນໃຫ້ຄົບຖ້ວນ!');
    return;
  }

  const users = getStoredUsers();
  const duplicate = users.find(u => u.username.toLowerCase() === username.toLowerCase() && u.id !== id);
  if (duplicate) {
    alert(`⚠️ ຊື່ເຂົ້າໃຊ້ "${username}" ມີໃນລະບົບແລ້ວ! ກະລຸນາເລືອກຊື່ໃໝ່.`);
    return;
  }

  const permissions = {
    pos: !!document.getElementById('perm_pos')?.checked,
    catalog: !!document.getElementById('perm_catalog')?.checked,
    machines: !!document.getElementById('perm_machines')?.checked,
    history: !!document.getElementById('perm_history')?.checked,
    summary: !!document.getElementById('perm_summary')?.checked,
    purchase: !!document.getElementById('perm_purchase')?.checked,
    settings: !!document.getElementById('perm_settings')?.checked
  };

  const existingIdx = users.findIndex(u => u.id === id);
  const avatarData = document.getElementById('memberAvatarDataInput')?.value || '';
  const userObj = {
    id,
    name,
    username,
    password,
    role,
    avatar: avatarData,
    permissions
  };

  if (existingIdx >= 0) {
    users[existingIdx] = userObj;
  } else {
    users.push(userObj);
  }

  saveStoredUsers(users);

  if (state.currentUser && (state.currentUser.id === id || state.currentUser.username.toLowerCase() === username.toLowerCase())) {
    state.currentUser = userObj;
    localStorage.setItem('donluang_auth_user', JSON.stringify(userObj));
    updateHeaderUserUI();
    applyUserPermissions();
  }

  closeMemberFormModal();
  renderUserManagementList();

  if (typeof showToast === 'function') {
    showToast(`✅ ບັນທຶກສະມາຊິກ "${name}" ສຳເລັດ!`, 'success');
  }
}

function deleteMember(userId) {
  const users = getStoredUsers();
  const user = users.find(u => u.id === userId);
  if (!user) return;

  if (user.username === 'admin' || user.id === 'user_admin') {
    alert('⚠️ ບໍ່ສາມາດລຶບບັນຊີຫຼັກ admin ໄດ້!');
    return;
  }

  if (state.currentUser && (state.currentUser.id === userId || state.currentUser.username.toLowerCase() === user.username.toLowerCase())) {
    alert('⚠️ ບໍ່ສາມາດລຶບບັນຊີທີ່ທ່ານກຳລັງເຂົ້າສູ່ລະບົບຢູ່ໄດ້!');
    return;
  }

  if (!confirm(`ທ່ານແນ່ໃຈບໍ່ວ່າຕ້ອງການລຶບສະມາຊິກ "${user.name || user.username}"?`)) {
    return;
  }

  const filtered = users.filter(u => u.id !== userId);
  saveStoredUsers(filtered);
  renderUserManagementList();

  if (typeof showToast === 'function') {
    showToast(`🗑️ ລຶບສະມາຊິກ "${user.name || user.username}" ສຳເລັດ`, 'info');
  }
}

// Initialize App & Auto Cloud Sync
window.addEventListener('DOMContentLoaded', () => {
  loadState();
  initAuthAndDeviceMode();
  renderAllCategorySelects();
  updateBadges();
  renderPOSProducts();
  renderCart();
  renderCatalogTable();
  renderMachines();
  renderSalesHistory();
  renderSummaryPage();
  renderPurchasePlanPage();
  updateGSheetIndicator();

  // ຮັກສາໜ້າເກົ່າທີ່ກຳລັງເປີດຢູ່ເວລາໂຫຼດໜ້າໃໝ່ (ບໍ່ໃຫ້ກັບໄປເລີ່ມໜ້າອອກບິນ)
  const savedActiveTab = localStorage.getItem(ACTIVE_TAB_KEY) || 'pos';
  switchTab(savedActiveTab);

  // 1. ດຶງຂໍ້ມູນພື້ນຖານ (Master Data) ຈາກ Google Drive ທັນທີຕອນເປີດແອັບ ຫຼື ຫຼັງອັບເດດເວັບແອັບ
  autoSyncFromCloud(true, false, true);

  // 2. ເລີ່ມລະບົບ Auto Sync Polling ຕະຫຼອດເວລາທີ່ເປີດແທັບ
  startAutoSyncPolling();

  // 3. ເມື່ອສະຫຼັບກັບມາເບິ່ງແທັບນີ້ ຫຼື ປົດລັອກໜ້າຈໍມືຖື ໃຫ້ຊິ້ງຂໍ້ມູນທັນທີ
  window.addEventListener('focus', () => autoSyncFromCloud(true));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      autoSyncFromCloud(true);
    }
  });
});

// ==========================================================================
// BARCODE STUDIO & PRINT MODULE (ອອກແບບ, ສ້າງ & ສັ່ງພິມບາໂຄ້ດ)
// ==========================================================================

let currentBarcodeFormat = 'barcode1d'; // 'barcode1d' or 'qrcode'
let activeBarcodeProductId = null;

// Pure JS Code 128 (Subset B) SVG generator - 100% vector & offline
function generateCode128Svg(text, options = {}) {
  const width = options.width || 1.8;
  const height = options.height || 42;
  const showText = options.showText !== false;

  const CODE128_PATTERNS = [
    "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
    "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
    "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
    "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
    "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
    "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
    "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
    "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
    "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
    "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
    "114131", "311141", "411131", "211412", "211214", "211232", "2331112"
  ];

  const cleanStr = String(text || '').replace(/[^\x20-\x7E]/g, '') || '0000';
  const indices = [104]; // Start B
  let checksum = 104;

  for (let i = 0; i < cleanStr.length; i++) {
    const code = cleanStr.charCodeAt(i) - 32;
    indices.push(code);
    checksum += code * (i + 1);
  }

  indices.push(checksum % 103);
  indices.push(106); // Stop

  let fullPattern = '';
  for (const idx of indices) {
    fullPattern += CODE128_PATTERNS[idx] || '212222';
  }

  let totalModules = 0;
  for (let i = 0; i < fullPattern.length; i++) {
    totalModules += parseInt(fullPattern[i], 10);
  }

  const quietZone = 8;
  const totalSvgWidth = Math.round((totalModules + quietZone * 2) * width);
  const totalSvgHeight = height + (showText ? 15 : 2);

  let currentX = quietZone * width;
  let rects = '';

  for (let i = 0; i < fullPattern.length; i++) {
    const barWidth = parseInt(fullPattern[i], 10) * width;
    if (i % 2 === 0) {
      rects += `<rect x="${currentX.toFixed(1)}" y="1" width="${barWidth.toFixed(1)}" height="${height}" fill="#000000" />`;
    }
    currentX += barWidth;
  }

  const textSvg = showText ? `<text x="${(totalSvgWidth / 2).toFixed(1)}" y="${height + 13}" text-anchor="middle" font-family="'Courier New', Courier, monospace" font-size="11" font-weight="bold" fill="#000000" letter-spacing="1.5">${escapeHtml(cleanStr)}</text>` : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalSvgWidth} ${totalSvgHeight}" width="${totalSvgWidth}" height="${totalSvgHeight}" style="max-width:100%;height:auto;display:block;margin:0 auto;">
    <rect width="${totalSvgWidth}" height="${totalSvgHeight}" fill="#ffffff"/>
    ${rects}
    ${textSvg}
  </svg>`;
}

function getCategoryBarcodePrefix(catId) {
  const prefixMap = {
    service: 'SV',
    paper: 'PA',
    ink: 'IK',
    stationery: 'ST',
    frame: 'FR',
    photo: 'PH',
    equipment: 'EQ',
    other: 'OT'
  };
  if (prefixMap[catId]) return prefixMap[catId];
  const clean = String(catId || '').replace(/[^a-zA-Z]/g, '').toUpperCase();
  return clean.length >= 2 ? clean.slice(0, 2) : 'DL';
}

function generateNextCategoryCode(catId) {
  const prefix = getCategoryBarcodePrefix(catId);
  const products = (state.products || []).filter(p => p.category === catId);
  let maxNum = 0;
  products.forEach(p => {
    const code = String(p.code || '');
    const match = code.match(new RegExp(`^${prefix}[-_]?(\\d+)`, 'i'));
    if (match && match[1]) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) maxNum = num;
    }
  });
  const nextNum = String(maxNum + 1).padStart(2, '0');
  return `${prefix}-${nextNum}`;
}

function generateNextBarcodeCode() {
  const products = state.products || [];
  let maxNum = 0;
  products.forEach(p => {
    const code = String(p.code || '');
    const match = code.match(/(\d+)/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) maxNum = num;
    }
  });
  return `BC-${String(maxNum + 1).padStart(4, '0')}`;
}

function openBarcodeStudioModal(productId = null) {
  const modal = document.getElementById('barcodeStudioModal');
  if (!modal) return;

  activeBarcodeProductId = productId;

  // Populate product dropdown
  const prodSelect = document.getElementById('barcodeProductSelect');
  if (prodSelect) {
    prodSelect.innerHTML = '<option value="">-- [ + ສ້າງບາໂຄ້ດ / ສິນຄ້າໃໝ່ ] --</option>' +
      (state.products || []).map(p => `
        <option value="${p.id}" ${p.id === productId ? 'selected' : ''}>
          [${p.code || 'NO-CODE'}] ${p.name} - ${formatLAK(p.price)}
        </option>
      `).join('');
  }

  if (productId) {
    const p = (state.products || []).find(prod => prod.id === productId);
    if (p) {
      const codeIn = document.getElementById('barcodeCodeInput');
      const nameIn = document.getElementById('barcodeNameInput');
      const priceIn = document.getElementById('barcodePriceInput');
      if (codeIn) codeIn.value = p.code || generateNextBarcodeCode();
      if (nameIn) nameIn.value = p.name || '';
      if (priceIn) priceIn.value = p.price || 0;
    }
  } else {
    // New barcode mode
    if (prodSelect) prodSelect.value = '';
    const codeIn = document.getElementById('barcodeCodeInput');
    const nameIn = document.getElementById('barcodeNameInput');
    const priceIn = document.getElementById('barcodePriceInput');
    if (codeIn) codeIn.value = generateNextBarcodeCode();
    if (nameIn) nameIn.value = '';
    if (priceIn) priceIn.value = '';
  }

  const sizeSelect = document.getElementById('barcodeSizeSelect');
  if (sizeSelect && (!sizeSelect.value || sizeSelect.value === '80x50')) {
    sizeSelect.value = '30x20';
  }
  const customRow = document.getElementById('barcodeCustomSizeRow');
  if (customRow) {
    customRow.style.display = sizeSelect?.value === 'custom' ? 'flex' : 'none';
  }
  const badge = document.getElementById('barcodeSizeBadge');
  if (badge) {
    badge.textContent = getSelectedStickerSize().label;
  }

  updateBarcodeLivePreview();
  modal.style.display = 'flex';
}

function closeBarcodeStudioModal() {
  const modal = document.getElementById('barcodeStudioModal');
  if (modal) modal.style.display = 'none';
}

function onBarcodeProductSelectChange() {
  const prodSelect = document.getElementById('barcodeProductSelect');
  const codeIn = document.getElementById('barcodeCodeInput');
  const nameIn = document.getElementById('barcodeNameInput');
  const priceIn = document.getElementById('barcodePriceInput');

  const prodId = prodSelect?.value;
  activeBarcodeProductId = prodId || null;

  if (prodId) {
    const p = (state.products || []).find(prod => prod.id === prodId);
    if (p) {
      if (codeIn) codeIn.value = p.code || generateNextBarcodeCode();
      if (nameIn) nameIn.value = p.name || '';
      if (priceIn) priceIn.value = p.price || 0;
    }
  } else {
    // Clear for new product
    if (codeIn) codeIn.value = generateNextBarcodeCode();
    if (nameIn) nameIn.value = '';
    if (priceIn) priceIn.value = '';
  }

  updateBarcodeLivePreview();
}

function onBarcodeCategorySelectChange() {}
function autoGenerateCategoryCode() {}
function setBarcodeFormat(format) {
  currentBarcodeFormat = 'barcode1d';
  updateBarcodeLivePreview();
}
function setBarcodeQtyPreset(qty) {
  const qtyIn = document.getElementById('barcodeQtyInput');
  if (qtyIn) qtyIn.value = qty;
}

// ==========================================
// STICKER SIZE CONFIGURATION & HELPERS
// ==========================================
const STICKER_SIZES = {
  '30x20': { width: 30, height: 20, label: '30 × 20 mm (POS-8610-L)', barWidth: 1.1, barHeight: 24, qrSize: 42, shopSize: '0.55rem', nameSize: '0.72rem', codeSize: '0.62rem', priceSize: '0.75rem' },
  '40x30': { width: 40, height: 30, label: '40 × 30 mm (ຂະໜາດກາງ)', barWidth: 1.4, barHeight: 36, qrSize: 64, shopSize: '0.64rem', nameSize: '0.76rem', codeSize: '0.72rem', priceSize: '0.84rem' },
  '50x30': { width: 50, height: 30, label: '50 × 30 mm (ມາດຕະຖານ)', barWidth: 1.7, barHeight: 38, qrSize: 70, shopSize: '0.68rem', nameSize: '0.8rem', codeSize: '0.75rem', priceSize: '0.88rem' },
  '35x25': { width: 35, height: 25, label: '35 × 25 mm', barWidth: 1.2, barHeight: 28, qrSize: 52, shopSize: '0.6rem', nameSize: '0.7rem', codeSize: '0.68rem', priceSize: '0.76rem' },
  '80x50': { width: 80, height: 50, label: '80 × 50 mm (80mm Thermal)', barWidth: 2.8, barHeight: 62, qrSize: 110, shopSize: '0.85rem', nameSize: '1.05rem', codeSize: '0.95rem', priceSize: '1.2rem' },
  '75x50': { width: 75, height: 50, label: '75 × 50 mm (Thermal 80mm)', barWidth: 2.6, barHeight: 60, qrSize: 105, shopSize: '0.82rem', nameSize: '1.0rem', codeSize: '0.92rem', priceSize: '1.15rem' },
  '80x40': { width: 80, height: 40, label: '80 × 40 mm (POS-8610-L)', barWidth: 2.6, barHeight: 52, qrSize: 95, shopSize: '0.82rem', nameSize: '1.0rem', codeSize: '0.9rem', priceSize: '1.15rem' },
  '60x40': { width: 60, height: 40, label: '60 × 40 mm (ຂະໜາດໃຫຍ່)', barWidth: 2.1, barHeight: 50, qrSize: 90, shopSize: '0.75rem', nameSize: '0.9rem', codeSize: '0.82rem', priceSize: '0.98rem' },
  '52x29': { width: 52.5, height: 29.7, label: '52.5 × 29.7 mm (A4 40 ດວງ)', barWidth: 1.8, barHeight: 36, qrSize: 68, shopSize: '0.68rem', nameSize: '0.78rem', codeSize: '0.74rem', priceSize: '0.86rem' },
  '38x21': { width: 38.1, height: 21.2, label: '38.1 × 21.2 mm (A4 65 ດວງ)', barWidth: 1.2, barHeight: 24, qrSize: 46, shopSize: '0.56rem', nameSize: '0.64rem', codeSize: '0.6rem', priceSize: '0.7rem' },
  '70x37': { width: 70, height: 37, label: '70 × 37 mm (A4 24 ດວງ)', barWidth: 2.4, barHeight: 46, qrSize: 85, shopSize: '0.78rem', nameSize: '0.92rem', codeSize: '0.85rem', priceSize: '1.02rem' }
};

function getSelectedStickerSize() {
  const sel = document.getElementById('barcodeSizeSelect')?.value || '30x20';
  if (sel === 'custom') {
    const w = Math.max(20, parseFloat(document.getElementById('barcodeCustomW')?.value) || 30);
    const h = Math.max(15, parseFloat(document.getElementById('barcodeCustomH')?.value) || 20);
    const scale = Math.min(w / 30, h / 20);
    return {
      width: w,
      height: h,
      label: `${w} × ${h} mm`,
      barWidth: Math.max(1.0, Math.min(2.5, +(1.1 * (w / 30)).toFixed(2))),
      barHeight: Math.max(18, Math.min(65, Math.round(24 * (h / 20)))),
      qrSize: Math.max(42, Math.min(105, Math.round(42 * (h / 20)))),
      shopSize: `${Math.max(0.5, +(0.55 * scale).toFixed(2))}rem`,
      nameSize: `${Math.max(0.65, +(0.72 * scale).toFixed(2))}rem`,
      codeSize: `${Math.max(0.55, +(0.62 * scale).toFixed(2))}rem`,
      priceSize: `${Math.max(0.68, +(0.75 * scale).toFixed(2))}rem`
    };
  }
  return STICKER_SIZES[sel] || STICKER_SIZES['30x20'];
}

function onBarcodeSizeSelectChange() {
  const sel = document.getElementById('barcodeSizeSelect')?.value;
  const customRow = document.getElementById('barcodeCustomSizeRow');
  const badge = document.getElementById('barcodeSizeBadge');

  if (customRow) {
    customRow.style.display = sel === 'custom' ? 'flex' : 'none';
  }

  const size = getSelectedStickerSize();
  if (badge) {
    badge.textContent = size.label;
  }

  updateBarcodeLivePreview();
}

// Draw barcode bars directly onto Canvas with high fidelity
function drawCode128OnCanvas(ctx, text, startX, startY, maxWidth, barHeight) {
  const CODE128_PATTERNS = [
    "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
    "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
    "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
    "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
    "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
    "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
    "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
    "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
    "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
    "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
    "114131", "311141", "411131", "211412", "211214", "211232", "2331112"
  ];
  const cleanStr = String(text || '').replace(/[^\x20-\x7E]/g, '') || '0000';
  const indices = [104]; // Start B
  let checksum = 104;
  for (let i = 0; i < cleanStr.length; i++) {
    const code = cleanStr.charCodeAt(i) - 32;
    indices.push(code);
    checksum += code * (i + 1);
  }
  indices.push(checksum % 103);
  indices.push(106); // Stop
  let fullPattern = '';
  for (const idx of indices) {
    fullPattern += CODE128_PATTERNS[idx] || '212222';
  }

  let totalModules = 0;
  for (let i = 0; i < fullPattern.length; i++) {
    totalModules += parseInt(fullPattern[i], 10);
  }
  let moduleWidth = Math.floor(maxWidth / totalModules);
  if (moduleWidth < 1) moduleWidth = 1;
  const barcodePixelWidth = totalModules * moduleWidth;
  let curX = startX + Math.floor((maxWidth - barcodePixelWidth) / 2);

  ctx.fillStyle = '#000000';
  let isBar = true;
  for (let i = 0; i < fullPattern.length; i++) {
    const w = parseInt(fullPattern[i], 10) * moduleWidth;
    if (isBar) {
      ctx.fillRect(curX, startY, w, barHeight);
    }
    curX += w;
    isBar = !isBar;
  }
}

// Generate complete Sticker on Canvas (203 DPI = 8 dots/mm)
function generateStickerCanvas(opts = {}) {
  const size = getSelectedStickerSize();
  const widthMm = opts.widthMm || size.width || 30;
  const heightMm = opts.heightMm || size.height || 20;
  const name = (opts.name !== undefined ? opts.name : (document.getElementById('barcodeNameInput')?.value || '')).trim() || 'ສິນຄ້າ';
  const code = (opts.code !== undefined ? opts.code : (document.getElementById('barcodeCodeInput')?.value || '')).trim() || '1001';
  const price = Number(opts.price !== undefined ? opts.price : (document.getElementById('barcodePriceInput')?.value || 0));

  // 203 DPI = 8 dots/mm. Ensure width is multiple of 8
  const dotsW = Math.round(widthMm * 8);
  const widthBytes = Math.ceil(dotsW / 8);
  const canvasW = widthBytes * 8;
  const canvasH = Math.round(heightMm * 8);

  const canvas = document.createElement('canvas');
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext('2d');

  ctx.imageSmoothingEnabled = false;

  // 1. Crisp white background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvasW, canvasH);

  ctx.fillStyle = '#000000';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  const fontLaoStack = '"Noto Sans Lao", "Leelawadee UI", "Saysettha OT", "Phetsarath OT", sans-serif';

  // 2. Top Line: Product Name (Lao font)
  let nameFontSize = Math.min(22, Math.max(14, Math.round(canvasH * 0.14)));
  ctx.font = `bold ${nameFontSize}px ${fontLaoStack}`;
  while (ctx.measureText(name).width > canvasW - 12 && nameFontSize > 11) {
    nameFontSize -= 1;
    ctx.font = `bold ${nameFontSize}px ${fontLaoStack}`;
  }
  const nameY = Math.max(3, Math.round(canvasH * 0.025));
  ctx.fillText(name, canvasW / 2, nameY);

  // 3. Middle: Barcode & Barcode Code text
  const barY = Math.round(nameY + nameFontSize * 1.15);
  const priceHeight = price > 0 ? Math.round(canvasH * 0.20) : 0;
  const codeTextHeight = Math.round(canvasH * 0.13);
  const availBarHeight = Math.max(26, canvasH - barY - codeTextHeight - priceHeight - 6);

  drawCode128OnCanvas(ctx, code, 8, barY, canvasW - 16, availBarHeight);

  const codeY = barY + availBarHeight + 2;
  const codeFontSize = Math.max(13, Math.round(canvasH * 0.11));
  ctx.font = `bold ${codeFontSize}px monospace`;
  ctx.fillText(code, canvasW / 2, codeY);

  // 4. Bottom Line: Price in Lao Kip with badge border
  if (price > 0) {
    const priceText = `ລາຄາ: ${formatLAK(price)}`;
    const priceFontSize = Math.max(14, Math.round(canvasH * 0.13));
    ctx.font = `bold ${priceFontSize}px ${fontLaoStack}`;
    const textMetrics = ctx.measureText(priceText);
    const boxW = Math.min(canvasW - 10, Math.round(textMetrics.width + 14));
    const boxH = Math.round(priceFontSize + 7);
    const boxX = Math.round((canvasW - boxW) / 2);
    const boxY = Math.round(canvasH - boxH - 3);

    // Subtle crisp border matching the on-screen pill
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1.5;
    if (typeof ctx.roundRect === 'function') {
      ctx.beginPath();
      ctx.roundRect(boxX, boxY, boxW, boxH, 4);
      ctx.stroke();
    } else {
      ctx.strokeRect(boxX, boxY, boxW, boxH);
    }
    ctx.fillText(priceText, canvasW / 2, boxY + 3);
  }

  return canvas;
}

function updateBarcodeLivePreview() {
  const container = document.getElementById('barcodeSinglePreview');
  if (container) {
    const canvas = generateStickerCanvas();
    canvas.style.maxWidth = '100%';
    canvas.style.maxHeight = '100%';
    canvas.style.borderRadius = '8px';
    canvas.style.boxShadow = '0 3px 10px rgba(0,0,0,0.15)';
    canvas.style.border = '1px solid #e2e8f0';
    container.innerHTML = '';
    container.appendChild(canvas);
  }

  const badge = document.getElementById('barcodeSizeBadge');
  if (badge) {
    const size = getSelectedStickerSize();
    badge.textContent = size.label;
  }
}

function getSingleStickerHtml(forPrint = false) {
  const code = (document.getElementById('barcodeCodeInput')?.value || '').trim() || 'NO-CODE';
  const name = (document.getElementById('barcodeNameInput')?.value || '').trim() || 'ສິນຄ້າທົ່ວໄປ';
  const priceVal = Number(document.getElementById('barcodePriceInput')?.value || 0);

  const size = getSelectedStickerSize();

  const barcodeGraphic = generateCode128Svg(code, {
    width: forPrint ? size.barWidth : Math.min(1.8, size.barWidth),
    height: forPrint ? size.barHeight : Math.min(42, size.barHeight),
    showText: true
  });

  const nameHtml = `<div style="font-size:${size.nameSize};font-weight:700;color:#0f172a;line-height:1.2;margin-bottom:2px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(name)}">${escapeHtml(name)}</div>`;
  const priceHtml = (priceVal > 0) ? `<div style="font-size:${size.priceSize};font-weight:800;color:#c2410c;background:#fff7ed;border:1px solid #fed7aa;border-radius:4px;padding:2px 6px;margin-top:2px;display:inline-block;white-space:nowrap;">ລາຄາ: ${formatLAK(priceVal)}</div>` : '';

  return `
    <div style="width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;box-sizing:border-box;padding:2px;">
      ${nameHtml}
      <div style="width:100%;display:flex;justify-content:center;margin:1px 0;">
        ${barcodeGraphic}
      </div>
      ${priceHtml}
    </div>
  `;
}

function updateBarcodeBatchPreview() {
  // Batch preview removed per user request for compact studio
}

function saveBarcodeToProduct(silent = false) {
  const rawCode = (document.getElementById('barcodeCodeInput')?.value || '').trim();
  const code = translateLaoThaiKeyToAscii(rawCode).trim() || rawCode;
  const name = (document.getElementById('barcodeNameInput')?.value || '').trim();
  const price = Number(document.getElementById('barcodePriceInput')?.value || 0);

  if (!code) {
    if (!silent) alert('ກະລຸນາປ້ອນລະຫັດບາໂຄ້ດ!');
    return;
  }

  let targetProd = null;
  if (activeBarcodeProductId) {
    targetProd = (state.products || []).find(prod => prod.id === activeBarcodeProductId) || null;
  }
  if (!targetProd && name) {
    targetProd = (state.products || []).find(prod => String(prod.name || '').trim().toLowerCase() === name.toLowerCase()) || null;
  }

  if (targetProd) {
    if (targetProd.code && targetProd.code !== code) {
      if (!Array.isArray(targetProd.altCodes)) targetProd.altCodes = [];
      if (!targetProd.altCodes.includes(targetProd.code)) {
        targetProd.altCodes.push(targetProd.code);
      }
    }
    targetProd.code = code;
    if (name) targetProd.name = name;
    if (price > 0) targetProd.price = price;
    activeBarcodeProductId = targetProd.id;
    saveState();
    renderCatalogTable();
    renderPOSProducts();
    if (!silent && typeof showToast === 'function') {
      showToast(`✅ ອັບເດດລະຫັດບາໂຄ້ດສຳລັບ "${targetProd.name}" ສຳເລັດ!`, 'success');
    }
  } else {
    if (!name) {
      if (!silent) alert('ກະລຸນາປ້ອນຊື່ສິນຄ້າເພື່ອບັນທຶກເຂົ້າສາງ!');
      return;
    }
    const physicalCat = (state.categories || []).find(c => c.id !== 'service')?.id || 'paper';
    const newProd = {
      id: `P_${Date.now()}`,
      code: code,
      name: name,
      category: physicalCat,
      cost: 0,
      price: price || 0,
      unit: 'ອັນ',
      stock: 10,
      minStock: 2,
      trackStock: true
    };
    state.products.push(newProd);
    saveState();
    renderCatalogTable();
    renderPOSProducts();
    activeBarcodeProductId = newProd.id;
    if (!silent && typeof showToast === 'function') {
      showToast(`✅ ເພີ່ມສິນຄ້າໃໝ່ "${name}" ພ້ອມລະຫັດບາໂຄ້ດສຳເລັດ!`, 'success');
    }
  }
}

function printBarcodeSheet() {
  // Auto-save barcode to the selected/matching product before printing so printed barcodes always scan!
  const nameVal = (document.getElementById('barcodeNameInput')?.value || '').trim();
  if (activeBarcodeProductId || nameVal) {
    saveBarcodeToProduct(true);
  }

  const qtyIn = document.getElementById('barcodeQtyInput');
  const qty = Math.max(1, Math.min(500, parseInt(qtyIn?.value, 10) || 1));

  const printArea = document.getElementById('barcodePrintArea');
  if (!printArea) return;

  const size = getSelectedStickerSize();
  const stickerHtml = getSingleStickerHtml(true);

  let batchHtml = `<div class="barcode-print-grid" style="grid-template-columns: repeat(auto-fill, minmax(${size.width}mm, 1fr)); gap: 2.5mm; padding: 3mm;">`;
  for (let i = 0; i < qty; i++) {
    batchHtml += `<div class="barcode-sticker-card" style="width:${size.width}mm; height:${size.height}mm; max-width:${size.width}mm; max-height:${size.height}mm; padding:2mm 2.5mm; box-sizing:border-box; overflow:hidden;">${stickerHtml}</div>`;
  }
  batchHtml += '</div>';

  printArea.innerHTML = batchHtml;
  document.body.classList.add('printing-barcodes');

  window.print();

  setTimeout(() => {
    document.body.classList.remove('printing-barcodes');
  }, 1000);
}

// ==========================================================================
// POS-8610-L BLUETOOTH THERMAL LABEL PRINTER INTEGRATION
// ==========================================================================
let pos8610BtDevice = null;
let pos8610BtServer = null;
let pos8610BtCharacteristic = null;

const POS8610_GATT_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb', // Standard Printer Service
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455', // ISSC transparent UART
  '0000ffe0-0000-1000-8000-00805f9b34fb', // HM-10 UART
  '0000ff00-0000-1000-8000-00805f9b34fb'
];

function updatePos8610BtUI(connected, deviceName = 'POS-8610-L') {
  const badge = document.getElementById('btStatusBadge');
  const btn = document.getElementById('btnConnectBT');
  const modalStatus = document.getElementById('setupModalBtStatus');

  if (connected) {
    if (badge) {
      badge.style.background = '#dcfce7';
      badge.style.color = '#15803d';
      badge.innerHTML = `<span style="width:7px;height:7px;border-radius:50%;background:#22c55e;display:inline-block;"></span> <span>ເຊື່ອມຕໍ່ແລ້ວ: ${deviceName}</span>`;
    }
    if (btn) {
      btn.innerHTML = '<span>🟢 ເຊື່ອມຕໍ່ແລ້ວ</span>';
      btn.style.background = '#16a34a';
      btn.style.borderColor = '#15803d';
    }
    if (modalStatus) {
      modalStatus.style.color = '#16a34a';
      modalStatus.innerHTML = `<span style="width:8px;height:8px;border-radius:50%;background:#22c55e;display:inline-block;"></span> <span>ເຊື່ອມຕໍ່ແລ້ວ (${deviceName})</span>`;
    }
  } else {
    if (badge) {
      badge.style.background = '#fee2e2';
      badge.style.color = '#991b1b';
      badge.innerHTML = `<span style="width:7px;height:7px;border-radius:50%;background:#ef4444;display:inline-block;"></span> <span id="btStatusText">ຍັງບໍ່ທັນເຊື່ອມຕໍ່</span>`;
    }
    if (btn) {
      btn.innerHTML = '<span>📶 ເຊື່ອມຕໍ່ Bluetooth</span>';
      btn.style.background = '#4f46e5';
      btn.style.borderColor = '#4338ca';
    }
    if (modalStatus) {
      modalStatus.style.color = '#dc2626';
      modalStatus.innerHTML = `<span style="width:8px;height:8px;border-radius:50%;background:#ef4444;display:inline-block;"></span> <span>ຍັງບໍ່ທັນເຊື່ອມຕໍ່</span>`;
    }
  }
}

async function connectPos8610Bluetooth() {
  if (!navigator.bluetooth) {
    alert('Browser ນີ້ຍັງບໍ່ຮອງຮັບ Web Bluetooth ໂດຍກົງ (ແນະນຳໃຫ້ໃຊ້ Google Chrome ໃນ Android/Windows/Mac ຫຼື ໃຊ້ການພິມຜ່ານລະບົບທົ່ວໄປ System Print).');
    openPos8610SetupModal();
    return;
  }
  try {
    const device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: POS8610_GATT_SERVICES
    });

    if (!device) return;
    pos8610BtDevice = device;
    device.addEventListener('gattserverdisconnected', () => {
      pos8610BtServer = null;
      pos8610BtCharacteristic = null;
      updatePos8610BtUI(false);
      if (typeof showToast === 'function') {
        showToast('⚠️ ຕັດການເຊື່ອມຕໍ່ກັບ POS-8610-L ແລ້ວ', 'warning');
      }
    });

    pos8610BtServer = await device.gatt.connect();

    // Find writable GATT characteristic for printing
    for (const serviceUuid of POS8610_GATT_SERVICES) {
      try {
        const service = await pos8610BtServer.getPrimaryService(serviceUuid);
        const chars = await service.getCharacteristics();
        for (const ch of chars) {
          if (ch.properties.write || ch.properties.writeWithoutResponse) {
            pos8610BtCharacteristic = ch;
            break;
          }
        }
        if (pos8610BtCharacteristic) break;
      } catch (e) {}
    }

    updatePos8610BtUI(true, device.name || 'POS-8610-L');
    if (typeof showToast === 'function') {
      showToast(`🟢 ເຊື່ອມຕໍ່ເຄື່ອງພິມ ${device.name || 'POS-8610-L'} ສຳເລັດ!`, 'success');
    }
  } catch (err) {
    console.error('Bluetooth connection error:', err);
    if (err.name !== 'NotFoundError') {
      alert(`ບໍ່ສາມາດເຊື່ອມຕໍ່ Bluetooth ໄດ້: ${err.message || err}`);
      openPos8610SetupModal();
    }
  }
}

function disconnectPos8610Bluetooth() {
  if (pos8610BtDevice && pos8610BtDevice.gatt && pos8610BtDevice.gatt.connected) {
    pos8610BtDevice.gatt.disconnect();
  }
  pos8610BtDevice = null;
  pos8610BtServer = null;
  pos8610BtCharacteristic = null;
  updatePos8610BtUI(false);
  if (typeof showToast === 'function') {
    showToast('ຕັດການເຊື່ອມຕໍ່ Bluetooth ແລ້ວ', 'info');
  }
}

function openPos8610SetupModal() {
  const modal = document.getElementById('pos8610SetupModal');
  if (modal) modal.style.display = 'flex';
}

function closePos8610SetupModal() {
  const modal = document.getElementById('pos8610SetupModal');
  if (modal) modal.style.display = 'none';
}

async function sendPos8610BluetoothBytes(uint8Data) {
  if (!pos8610BtCharacteristic) {
    throw new Error('ບໍ່ພົບຊ່ອງສົ່ງຂໍ້ມູນ Bluetooth Characteristic');
  }
  const CHUNK_SIZE = 100;
  for (let i = 0; i < uint8Data.length; i += CHUNK_SIZE) {
    const chunk = uint8Data.slice(i, i + CHUNK_SIZE);
    if (pos8610BtCharacteristic.writeValueWithoutResponse) {
      await pos8610BtCharacteristic.writeValueWithoutResponse(chunk);
    } else {
      await pos8610BtCharacteristic.writeValue(chunk);
    }
    // Small inter-packet delay for reliable BLE transmission on thermal printers
    if (i + CHUNK_SIZE < uint8Data.length) {
      await new Promise(r => setTimeout(r, 6));
    }
  }
}

// Convert HTML5 Canvas to 1-Bit Monochrome TSPL BITMAP Job
// Ensures 100% pixel-perfect Lao text, Code 128 barcode, and price matching on-screen preview
function convertCanvasToTsplJob(canvas, qty = 1, widthMm = 30, heightMm = 20) {
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  const widthBytes = Math.ceil(width / 8);
  const imageData = ctx.getImageData(0, 0, width, height);
  const pixels = imageData.data;

  const bitmapBytes = new Uint8Array(widthBytes * height);
  let byteIndex = 0;
  for (let row = 0; row < height; row++) {
    for (let colBytes = 0; colBytes < widthBytes; colBytes++) {
      let compiledByte = 0;
      for (let bit = 0; bit < 8; bit++) {
        const col = (colBytes * 8) + bit;
        if (col < width) {
          const pixelOffset = (row * width + col) * 4;
          const r = pixels[pixelOffset];
          const g = pixels[pixelOffset + 1];
          const b = pixels[pixelOffset + 2];
          const a = pixels[pixelOffset + 3];
          // Luminance calculation
          const luminance = (r * 0.299 + g * 0.587 + b * 0.114);
          // Dark pixel = 1 (printed dot in TSPL)
          const isBlack = (a > 128 && luminance < 195);
          if (isBlack) {
            compiledByte |= (1 << (7 - bit));
          }
        }
      }
      bitmapBytes[byteIndex++] = compiledByte;
    }
  }

  // TSPL Commands:
  // SIZE: mm dimensions
  // GAP: 2 mm label gap
  // DIRECTION 1: Right-side up output
  // CLS: Clear buffer
  // BITMAP 0,0,width_bytes,height_dots,0,
  const headerStr =
    `SIZE ${widthMm} mm, ${heightMm} mm\r\n` +
    `GAP 2 mm, 0 mm\r\n` +
    `DIRECTION 1\r\n` +
    `CLS\r\n` +
    `BITMAP 0,0,${widthBytes},${height},0,`;

  const encoder = new TextEncoder();
  const headerBytes = encoder.encode(headerStr);
  const footerBytes = encoder.encode(`\r\nPRINT ${qty},1\r\n`);

  const totalLength = headerBytes.length + bitmapBytes.length + footerBytes.length;
  const jobBytes = new Uint8Array(totalLength);
  jobBytes.set(headerBytes, 0);
  jobBytes.set(bitmapBytes, headerBytes.length);
  jobBytes.set(footerBytes, headerBytes.length + bitmapBytes.length);

  return jobBytes;
}

function generatePos8610TsplCommands(opts) {
  const { name = 'ສິນຄ້າ', code = '1001', price = 0, qty = 1, widthMm = 30, heightMm = 20 } = opts;
  const canvas = generateStickerCanvas({
    name: name,
    code: code,
    price: price,
    widthMm: widthMm,
    heightMm: heightMm
  });
  return convertCanvasToTsplJob(canvas, qty, widthMm, heightMm);
}

async function printBarcodeViaBluetooth() {
  // If not yet connected via Bluetooth, trigger pairing first
  if (!pos8610BtDevice || !pos8610BtServer || !pos8610BtCharacteristic) {
    const wantsConnect = confirm('ຍັງບໍ່ທັນໄດ້ເຊື່ອມຕໍ່ກັບເຄື່ອງພິມ POS-8610-L ຜ່ານ Bluetooth.\n\nກົດ "OK" ເພື່ອເລືອກເຊື່ອມຕໍ່ເຄື່ອງພິມ Bluetooth ດຽວນີ້!');
    if (wantsConnect) {
      await connectPos8610Bluetooth();
      if (!pos8610BtCharacteristic) return;
    } else {
      return;
    }
  }

  // Auto-save barcode to the selected/matching product before printing
  const nameVal = (document.getElementById('barcodeNameInput')?.value || '').trim();
  if (activeBarcodeProductId || nameVal) {
    saveBarcodeToProduct(true);
  }

  const codeVal = (document.getElementById('barcodeCodeInput')?.value || '').trim() || '1001';
  const priceVal = Number(document.getElementById('barcodePriceInput')?.value || 0);
  const qtyIn = document.getElementById('barcodeQtyInput');
  const qty = Math.max(1, Math.min(500, parseInt(qtyIn?.value, 10) || 1));
  const size = getSelectedStickerSize();

  try {
    const canvas = generateStickerCanvas({
      name: nameVal || 'ສິນຄ້າ',
      code: codeVal,
      price: priceVal,
      widthMm: size.width || 30,
      heightMm: size.height || 20
    });

    const jobBytes = convertCanvasToTsplJob(canvas, qty, size.width || 30, size.height || 20);
    await sendPos8610BluetoothBytes(jobBytes);

    if (typeof showToast === 'function') {
      showToast(`✅ ສົ່ງຄຳສັ່ງພິມບາໂຄ້ດ ${qty} ດວງ (${size.width}×${size.height}mm) ໄປຫາ POS-8610-L ສຳເລັດ!`, 'success');
    }
  } catch (err) {
    console.error('Print Bluetooth error:', err);
    alert(`ເກີດຂໍ້ຜິດພາດໃນການສົ່ງພິມຜ່ານ Bluetooth: ${err.message || err}`);
  }
}

async function testPrintPos8610Sample() {
  if (!pos8610BtCharacteristic) {
    const wantsConnect = confirm('ຍັງບໍ່ທັນໄດ້ເຊື່ອມຕໍ່ Bluetooth ກັບ POS-8610-L.\n\nກົດ "OK" ເພື່ອເຊື່ອມຕໍ່ Bluetooth ກ່ອນ!');
    if (wantsConnect) {
      await connectPos8610Bluetooth();
      if (!pos8610BtCharacteristic) return;
    } else {
      return;
    }
  }

  try {
    const size = getSelectedStickerSize();
    const testCanvas = generateStickerCanvas({
      name: 'ຜັກກາດຂາວ (Test)',
      code: '1001',
      price: 10000,
      widthMm: size.width || 30,
      heightMm: size.height || 20
    });
    const jobBytes = convertCanvasToTsplJob(testCanvas, 1, size.width || 30, size.height || 20);
    await sendPos8610BluetoothBytes(jobBytes);
    if (typeof showToast === 'function') {
      showToast('✅ ສົ່ງຄຳສັ່ງພິມທົດສອບ (30×20mm) ຜ່ານ Bluetooth ສຳເລັດ!', 'success');
    } else {
      alert('✅ ສົ່ງຄຳສັ່ງພິມທົດສອບ (30×20mm) ຜ່ານ Bluetooth ສຳເລັດ!');
    }
  } catch (e) {
    alert(`ການສົ່ງພິມທົດສອບຜ່ານ Bluetooth ຂັດຂ້ອງ: ${e.message || e}`);
  }
}

// ==========================================================================
// MOUSE CLICK SPARKLE STARS EFFECT (ເອັບເຟກດາວປະກາຍຕອນຄລິກເມົ້າ)
// ==========================================================================
(function initClickSparkleEffect() {
  const starIcons = ['✨', '⭐', '🌟', '✦', '✧'];
  const starColors = ['#f59e0b', '#fbbf24', '#f97316', '#ec4899', '#3b82f6', '#10b981', '#8b5cf6'];

  function createSparkles(x, y) {
    const starCount = 6 + Math.floor(Math.random() * 4); // 6 - 9 stars
    for (let i = 0; i < starCount; i++) {
      const star = document.createElement('span');
      star.className = 'click-sparkle-star';
      star.textContent = starIcons[Math.floor(Math.random() * starIcons.length)];

      const angle = (Math.PI * 2 * i) / starCount + (Math.random() - 0.5) * 0.45;
      const distance = 24 + Math.random() * 36;
      const dx = `${Math.cos(angle) * distance}px`;
      const dy = `${Math.sin(angle) * distance}px`;
      const rot = `${(Math.random() - 0.5) * 360}deg`;
      const size = 12 + Math.random() * 10; // 12px - 22px
      const color = starColors[Math.floor(Math.random() * starColors.length)];

      star.style.left = `${x}px`;
      star.style.top = `${y}px`;
      star.style.fontSize = `${size}px`;
      star.style.setProperty('--dx', dx);
      star.style.setProperty('--dy', dy);
      star.style.setProperty('--rot', rot);
      star.style.color = color;
      star.style.textShadow = `0 0 5px ${color}`;

      document.body.appendChild(star);
      setTimeout(() => {
        if (star.parentNode) star.parentNode.removeChild(star);
      }, 700);
    }
  }

  window.addEventListener('pointerdown', (e) => {
    // Only primary clicks (left-click or touch)
    if (e.button !== undefined && e.button !== 0) return;
    createSparkles(e.clientX, e.clientY);
  }, { passive: true });
})();

// ==========================================================================
// CLEAR ALL DATA TO BLANK TEMPLATE (ລ້າງຂໍ້ມູນທັງໝົດເປັນໂຄງເປົ່າ)
// ==========================================================================
function promptClearAllDataToBlank() {
  const confirmMsg =
    '⚠️ ຢືນຢັນການລ້າງຂໍ້ມູນທັງໝົດໃຫ້ເປັນໂຄງເປົ່າ 100%?\n\n' +
    '• ລາຍການສິນຄ້າ ແລະ ສະຕັອກທັງໝົດຈະຖືກລ້າງອອກ\n' +
    '• ບັນຊີຊັບສິນ ແລະ ອຸປະກອນທັງໝົດຈະຖືກລ້າງອອກ\n' +
    '• ປະຫວັດໃບບິນ ແລະ ໜີ້ຕ້ອງຮັບທັງໝົດຈະຖືກລ້າງອອກ\n' +
    '• ບັນຊີລາຍຈ່າຍ ແລະ ໜີ້ຕ້ອງສົ່ງທັງໝົດຈະຖືກລ້າງອອກ\n' +
    '• ແຜນຈັດຊື້ສິນຄ້າທັງໝົດຈະຖືກລ້າງອອກ\n\n' +
    'ຫຼັງຈາກລ້າງແລ້ວ ລະບົບຈະກາຍເປັນໂຄງເປົ່າພ້ອມໃຫ້ທ່ານເລີ່ມປ້ອນຂໍ້ມູນຕົວຈິງ!';

  if (!confirm(confirmMsg)) return;

  state.products = [];
  state.machines = [];
  state.bills = [];
  state.expenses = [];
  state.purchasePlan = [];
  state.heldBills = [];
  state._isDefaultState = false;

  // Clear cart
  cart = [];

  // Save to localStorage
  saveState();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {}

  // Re-render everything
  renderAll();
  alert('✅ ລ້າງຂໍ້ມູນທັງໝົດເປັນໂຄງເປົ່າຮຽບຮ້ອຍແລ້ວ!\nຕອນນີ້ທ່ານສາມາດເລີ່ມເພີ່ມສິນຄ້າ ແລະ ອຸປະກອນຕົວຈິງໄດ້ເລີຍ.');
}

// ==========================================================================
// VOICE DICTATION & SPEECH RECOGNITION SYSTEM (ລະບົບປ້ອນຂໍ້ມູນດ້ວຍສຽງ)
// ==========================================================================
let activeVoiceRecognition = null;
let activeVoiceTargetId = null;

function checkSpeechRecognitionSupport() {
  return ('SpeechRecognition' in window) || ('webkitSpeechRecognition' in window);
}

function updateVoiceBtnVisual(targetId, isListening) {
  const btn = document.getElementById(`voiceBtn_${targetId}`);
  if (btn) {
    if (isListening) {
      btn.classList.add('listening');
      btn.textContent = '🔴';
    } else {
      btn.classList.remove('listening');
      btn.textContent = '🎙️';
    }
  }
}

function parseLaoThaiSpokenNumber(rawText) {
  if (!rawText) return 0;
  let text = String(rawText).trim();

  // 1. Direct digits match: e.g. "98000", "8,000", "85 000"
  const digitsMatch = text.replace(/,/g, '').match(/\d+/g);
  if (digitsMatch) {
    return Number(digitsMatch.join(''));
  }

  // 2. Normalize Lao/Thai digits: ໐-໙, ๐-๙
  let normalized = text
    .replace(/[໐๐]/g, '0')
    .replace(/[໑๑]/g, '1')
    .replace(/[໒๒]/g, '2')
    .replace(/[໓๓]/g, '3')
    .replace(/[໔๔]/g, '4')
    .replace(/[໕๕]/g, '5')
    .replace(/[໖๖]/g, '6')
    .replace(/[໗๗]/g, '7')
    .replace(/[໘๘]/g, '8')
    .replace(/[໙๙]/g, '9');

  const pureDigits = normalized.replace(/\D/g, '');
  if (pureDigits) return Number(pureDigits);

  // 3. Spoken Lao/Thai number parsing
  let total = 0;
  if (text.includes('ລ້ານ') || text.includes('ล้าน')) {
    const parts = text.split(/ລ້ານ|ล้าน/);
    const m = parseLaoThaiSpokenNumber(parts[0]) || 1;
    total += m * 1000000;
    text = parts[1] || '';
  }
  if (text.includes('ແສນ') || text.includes('แสน')) {
    const parts = text.split(/ແສນ|แสน/);
    const m = parseLaoThaiSpokenNumber(parts[0]) || 1;
    total += m * 100000;
    text = parts[1] || '';
  }
  if (text.includes('ໝື່ນ') || text.includes('หมื่น')) {
    const parts = text.split(/ໝື່ນ|หมื่น/);
    const m = parseLaoThaiSpokenNumber(parts[0]) || 1;
    total += m * 10000;
    text = parts[1] || '';
  }
  if (text.includes('ພັນ') || text.includes('พัน')) {
    const parts = text.split(/ພັນ|พัน/);
    const m = parseLaoThaiSpokenNumber(parts[0]) || 1;
    total += m * 1000;
    text = parts[1] || '';
  }
  if (text.includes('ຮ້ອຍ') || text.includes('ร้อย')) {
    const parts = text.split(/ຮ້ອຍ|ร้อย/);
    const m = parseLaoThaiSpokenNumber(parts[0]) || 1;
    total += m * 100;
    text = parts[1] || '';
  }
  if (text.includes('ຊາວ') || text.includes('ยี่สิบ')) {
    total += 20;
  }
  if (text.includes('ສິບ') || text.includes('สิบ')) {
    total += 10;
  }

  return total;
}

function startVoiceInput(targetInputId, fieldType = 'text') {
  if (!checkSpeechRecognitionSupport()) {
    alert('⚠️ ບຣາວເຊີຂອງທ່ານຍັງບໍ່ທັນຮອງຮັບ Speech Recognition ຫຼື ຍັງບໍ່ທັນໄດ້ອະນຸຍາດໄມໂຄຣໂຟນ.\nແນະນຳໃຫ້ເປີດໃຊ້ງານໃນ Google Chrome (ທັງເທິງຄອມ ແລະ ມືຖື/Sunmi).');
    return;
  }

  // Toggle off if currently listening to the same field
  if (activeVoiceRecognition) {
    try { activeVoiceRecognition.stop(); } catch(e) {}
    activeVoiceRecognition = null;
    if (activeVoiceTargetId === targetInputId) {
      updateVoiceBtnVisual(targetInputId, false);
      activeVoiceTargetId = null;
      return;
    }
    updateVoiceBtnVisual(activeVoiceTargetId, false);
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const rec = new SpeechRecognition();
  rec.continuous = false;
  rec.interimResults = false;
  rec.lang = 'lo-LA'; // Lao speech primary

  activeVoiceRecognition = rec;
  activeVoiceTargetId = targetInputId;
  updateVoiceBtnVisual(targetInputId, true);
  if (typeof showToast === 'function') {
    showToast('🎙️ ກຳລັງຟັງ... ເວົ້າໄດ້ເລີຍ!');
  }

  rec.onresult = function(event) {
    if (!event.results || !event.results[0] || !event.results[0][0]) return;
    const transcript = event.results[0][0].transcript.trim();
    applyVoiceTranscriptToField(targetInputId, transcript, fieldType);
  };

  rec.onerror = function(event) {
    console.warn('Voice recognition error:', event.error);
    if (event.error === 'not-allowed') {
      alert('⚠️ ກະລຸນາກົດອະນຸຍາດ (Allow) ສິດການໃຊ້ງານ Microphone ໃນບຣາວເຊີຂອງທ່ານ.');
    }
    updateVoiceBtnVisual(targetInputId, false);
    activeVoiceRecognition = null;
    activeVoiceTargetId = null;
  };

  rec.onend = function() {
    updateVoiceBtnVisual(targetInputId, false);
    activeVoiceRecognition = null;
    activeVoiceTargetId = null;
  };

  try {
    rec.start();
  } catch(err) {
    console.error('Speech recognition failed to start:', err);
    updateVoiceBtnVisual(targetInputId, false);
    activeVoiceRecognition = null;
    activeVoiceTargetId = null;
  }
}

function applyVoiceTranscriptToField(targetInputId, transcript, fieldType) {
  const el = document.getElementById(targetInputId);
  if (!el) return;

  if (fieldType === 'number') {
    const num = parseLaoThaiSpokenNumber(transcript);
    el.value = num || 0;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    if (typeof showToast === 'function') {
      showToast(`🎙️ ບັນທຶກຕົວເລກ: ${el.value}`);
    }
  } else if (fieldType === 'code') {
    // Clean up code: remove words like ລະຫັດ, code, dashes, spaces
    let cleanCode = transcript
      .replace(/^(ລະຫັດ|ບາໂຄ້ດ|ໂຄ້ດ|code|barcode)\s*[:=]?\s*/i, '')
      .replace(/\s+/g, '-')
      .toUpperCase();
    el.value = cleanCode;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    if (typeof showToast === 'function') {
      showToast(`🎙️ ບັນທຶກລະຫັດ: ${cleanCode}`);
    }
  } else if (fieldType === 'category') {
    const sel = el;
    const norm = transcript.toLowerCase().replace(/^(ໝວດ|ໝວດໝູ່|ປະເພດ)\s*[:=]?\s*/i, '').trim();
    let matched = false;
    for (const opt of sel.options) {
      const optText = opt.textContent.toLowerCase();
      const optVal = opt.value.toLowerCase();
      if (norm.includes(optVal) || norm.includes(optText) || optText.includes(norm)) {
        sel.value = opt.value;
        matched = true;
        break;
      }
    }
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    if (typeof showToast === 'function') {
      showToast(matched ? `🎙️ ເລືອກໝວດ: ${sel.options[sel.selectedIndex]?.text}` : `🎙️ ຟັງສຽງ: "${transcript}"`);
    }
  } else {
    // Normal text
    let cleanText = transcript.replace(/^(ຊື່|ຊື່ສິນຄ້າ|ຊື່ອຸປະກອນ)\s*[:=]?\s*/i, '').trim();
    el.value = cleanText || transcript;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    if (typeof showToast === 'function') {
      showToast(`🎙️ ບັນທຶກ: "${el.value}"`);
    }
  }
}

// Smart Voice Assistant for Product Modal
function startSmartVoiceProductInput() {
  if (!checkSpeechRecognitionSupport()) {
    alert('⚠️ ບຣາວເຊີຂອງທ່ານຍັງບໍ່ທັນຮອງຮັບ Speech Recognition.\nແນະນຳໃຫ້ເປີດໃຊ້ງານໃນ Google Chrome.');
    return;
  }

  const bar = document.getElementById('smartVoiceProdBar');
  const txt = document.getElementById('smartVoiceText');
  const icon = document.getElementById('smartVoiceIcon');

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const rec = new SpeechRecognition();
  rec.continuous = false;
  rec.interimResults = false;
  rec.lang = 'lo-LA';

  if (bar) bar.classList.add('listening');
  if (txt) txt.textContent = '🔴 ກຳລັງຟັງ... ເວົ້າໄດ້ເລີຍ';
  if (icon) icon.textContent = '🔊';

  rec.onresult = function(event) {
    if (!event.results || !event.results[0] || !event.results[0][0]) return;
    const fullTranscript = event.results[0][0].transcript.trim();
    parseAndFillProductVoice(fullTranscript);
  };

  rec.onerror = function(event) {
    console.warn('Smart voice error:', event.error);
    if (event.error === 'not-allowed') {
      alert('⚠️ ກະລຸນາກົດອະນຸຍາດ (Allow) ສິດການໃຊ້ງານ Microphone.');
    }
    resetSmartVoiceProductUI();
  };

  rec.onend = function() {
    resetSmartVoiceProductUI();
  };

  try {
    rec.start();
  } catch(e) {
    resetSmartVoiceProductUI();
  }
}

function resetSmartVoiceProductUI() {
  const bar = document.getElementById('smartVoiceProdBar');
  const txt = document.getElementById('smartVoiceText');
  const icon = document.getElementById('smartVoiceIcon');
  if (bar) bar.classList.remove('listening');
  if (txt) txt.textContent = 'ກົດເພື່ອເວົ້າ';
  if (icon) icon.textContent = '🎙️';
}

function parseAndFillProductVoice(text) {
  if (!text) return;

  // Extract Code: e.g. "ລະຫັດ VG01" or "code PA01"
  const codeMatch = text.match(/(?:ລະຫັດ|code|ບາໂຄ້ດ)\s*[:=]?\s*([A-Za-z0-9_-]+)/i);
  if (codeMatch && codeMatch[1]) {
    const codeIn = document.getElementById('prodCodeInput');
    if (codeIn) {
      codeIn.value = codeMatch[1].toUpperCase();
      codeIn.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  // Extract Price: e.g. "ລາຄາ 8000" or "ລາຄາຂາຍ 98000"
  const priceMatch = text.match(/(?:ລາຄາຂາຍ|ລາຄາ|ຂາຍ)\s*[:=]?\s*([0-9,]+)/i);
  if (priceMatch && priceMatch[1]) {
    const priceIn = document.getElementById('prodPriceInput');
    if (priceIn) {
      priceIn.value = parseLaoThaiSpokenNumber(priceMatch[1]);
      priceIn.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  // Extract Cost: e.g. "ຕົ້ນທຶນ 5000" or "ທຶນ 82000"
  const costMatch = text.match(/(?:ຕົ້ນທຶນ|ທຶນ|ຊື້)\s*[:=]?\s*([0-9,]+)/i);
  if (costMatch && costMatch[1]) {
    const costIn = document.getElementById('prodCostInput');
    if (costIn) {
      costIn.value = parseLaoThaiSpokenNumber(costMatch[1]);
      costIn.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  // Extract Stock: e.g. "ສະຕັອກ 25" or "ຈຳນວນ 20"
  const stockMatch = text.match(/(?:ສະຕັອກ|ຈຳນວນ|ມີ)\s*[:=]?\s*([0-9,]+)/i);
  if (stockMatch && stockMatch[1]) {
    const stockIn = document.getElementById('prodStockInput');
    if (stockIn) {
      stockIn.value = parseLaoThaiSpokenNumber(stockMatch[1]);
      stockIn.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  // Extract Unit: e.g. "ຫົວໜ່ວຍ ມັດ" or "ເປັນ ແພັກ"
  const unitMatch = text.match(/(?:ຫົວໜ່ວຍ|ເປັນ|ໜ່ວຍ)\s*[:=]?\s*([^\s,]+)/i);
  if (unitMatch && unitMatch[1]) {
    const unitIn = document.getElementById('prodUnitInput');
    if (unitIn && !['ລາຄາ', 'ລະຫັດ', 'ຕົ້ນທຶນ'].includes(unitMatch[1])) {
      unitIn.value = unitMatch[1];
      unitIn.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  // Extract Category: check if spoken text mentions any category name
  const catSel = document.getElementById('prodCategoryInput');
  if (catSel) {
    const lower = text.toLowerCase();
    for (const opt of catSel.options) {
      if (lower.includes(opt.textContent.toLowerCase()) || lower.includes(opt.value.toLowerCase())) {
        catSel.value = opt.value;
        catSel.dispatchEvent(new Event('change', { bubbles: true }));
        break;
      }
    }
  }

  // Extract Name: remove keywords, or if "ຊື່ ..." exists
  let nameVal = '';
  const nameMatch = text.match(/(?:ຊື່|ຊື່ສິນຄ້າ)\s*[:=]?\s*([^,\.]+)/i);
  if (nameMatch && nameMatch[1]) {
    nameVal = nameMatch[1].trim();
  } else {
    // Clean string by taking out matched parts
    nameVal = text
      .replace(/(?:ລະຫັດ|code|ບາໂຄ້ດ)\s*[:=]?\s*[A-Za-z0-9_-]+/ig, '')
      .replace(/(?:ລາຄາຂາຍ|ລາຄາ|ຂາຍ)\s*[:=]?\s*[0-9,]+/ig, '')
      .replace(/(?:ຕົ້ນທຶນ|ທຶນ|ຊື້)\s*[:=]?\s*[0-9,]+/ig, '')
      .replace(/(?:ສະຕັອກ|ຈຳນວນ|ມີ)\s*[:=]?\s*[0-9,]+/ig, '')
      .replace(/(?:ຫົວໜ່ວຍ|ເປັນ|ໜ່ວຍ)\s*[:=]?\s*[^\s,]+/ig, '')
      .replace(/(?:ໝວດ|ໝວດໝູ່|ປະເພດ)\s*[:=]?\s*[^\s,]+/ig, '')
      .trim();
  }

  if (nameVal) {
    const nameIn = document.getElementById('prodNameInput');
    if (nameIn) {
      nameIn.value = nameVal;
      nameIn.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  if (typeof showToast === 'function') {
    showToast(`✅ ປ້ອນຂໍ້ມູນສິນຄ້າຈາກສຽງສຳເລັດ: "${text}"`);
  }
}

// Smart Voice Assistant for Machine Modal
function startSmartVoiceMachineInput() {
  if (!checkSpeechRecognitionSupport()) {
    alert('⚠️ ບຣາວເຊີຂອງທ່ານຍັງບໍ່ທັນຮອງຮັບ Speech Recognition.\nແນະນຳໃຫ້ເປີດໃຊ້ງານໃນ Google Chrome.');
    return;
  }

  const bar = document.getElementById('smartVoiceMachBar');
  const txt = document.getElementById('smartVoiceMachText');
  const icon = document.getElementById('smartVoiceMachIcon');

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const rec = new SpeechRecognition();
  rec.continuous = false;
  rec.interimResults = false;
  rec.lang = 'lo-LA';

  if (bar) bar.classList.add('listening');
  if (txt) txt.textContent = '🔴 ກຳລັງຟັງ... ເວົ້າໄດ້ເລີຍ';
  if (icon) icon.textContent = '🔊';

  rec.onresult = function(event) {
    if (!event.results || !event.results[0] || !event.results[0][0]) return;
    const transcript = event.results[0][0].transcript.trim();
    parseAndFillMachineVoice(transcript);
  };

  rec.onerror = function(event) {
    console.warn('Smart machine voice error:', event.error);
    resetSmartVoiceMachineUI();
  };

  rec.onend = function() {
    resetSmartVoiceMachineUI();
  };

  try {
    rec.start();
  } catch(e) {
    resetSmartVoiceMachineUI();
  }
}

function resetSmartVoiceMachineUI() {
  const bar = document.getElementById('smartVoiceMachBar');
  const txt = document.getElementById('smartVoiceMachText');
  const icon = document.getElementById('smartVoiceMachIcon');
  if (bar) bar.classList.remove('listening');
  if (txt) txt.textContent = 'ກົດເພື່ອເວົ້າ';
  if (icon) icon.textContent = '🎙️';
}

function parseAndFillMachineVoice(text) {
  if (!text) return;

  // Extract Price/Value
  const priceMatch = text.match(/(?:ມູນຄ່າ|ລາຄາ|ຕົ້ນທຶນ)\s*[:=]?\s*([0-9,]+)/i);
  if (priceMatch && priceMatch[1]) {
    const priceIn = document.getElementById('machPriceInput');
    if (priceIn) {
      priceIn.value = parseLaoThaiSpokenNumber(priceMatch[1]);
      priceIn.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  // Extract Name
  let nameVal = text
    .replace(/(?:ມູນຄ່າ|ລາຄາ|ຕົ້ນທຶນ)\s*[:=]?\s*[0-9,]+/ig, '')
    .replace(/(?:ຈຳນວນ)\s*[:=]?\s*[0-9,]+/ig, '')
    .trim();

  if (nameVal) {
    const nameIn = document.getElementById('machNameInput');
    if (nameIn) {
      nameIn.value = nameVal;
      nameIn.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  if (typeof showToast === 'function') {
    showToast(`✅ ປ້ອນຂໍ້ມູນອຸປະກອນຈາກສຽງສຳເລັດ: "${text}"`);
  }
}
