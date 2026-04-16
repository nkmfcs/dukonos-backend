<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"/>
<title>DukonOS — Склад</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700;9..40,800&display=swap" rel="stylesheet"/>
<link rel="stylesheet" href="shared.css">
<style>
:root {
  --bg: #f0f2f5;
  --surface: #ffffff;
  --surface2: #f7f8fa;
  --border: rgba(0,0,0,0.07);
  --text: #18181b;
  --muted: #71717a;
  --hint: #a1a1aa;
  --cyan: #0891b2;
  --cyan-bg: rgba(8,145,178,0.1);
  --green: #059669;
  --green-bg: rgba(5,150,105,0.1);
  --red: #dc2626;
  --red-bg: rgba(220,38,38,0.1);
  --amber: #d97706;
  --amber-bg: rgba(217,119,6,0.1);
  --nav-bg: #ffffff;
  --shadow: 0 2px 16px rgba(0,0,0,0.06);
  --shadow-lg: 0 8px 32px rgba(0,0,0,0.10);
}
[data-theme="dark"] {
  --bg: #0a0a0f;
  --surface: #18181b;
  --surface2: #111113;
  --border: rgba(255,255,255,0.06);
  --text: #f4f4f5;
  --muted: #71717a;
  --hint: #52525b;
  --cyan: #00f0ff;
  --cyan-bg: rgba(0,240,255,0.08);
  --green: #10b981;
  --green-bg: rgba(16,185,129,0.08);
  --red: #ef4444;
  --red-bg: rgba(239,68,68,0.08);
  --amber: #f59e0b;
  --amber-bg: rgba(245,158,11,0.08);
  --nav-bg: #18181b;
  --shadow: 0 2px 16px rgba(0,0,0,0.4);
  --shadow-lg: 0 8px 32px rgba(0,0,0,0.5);
}
*{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
body{
  background:var(--bg);color:var(--text);font-family:'DM Sans',sans-serif;
  min-height:100dvh;display:flex;justify-content:center;align-items:center;
  overflow:hidden;transition:background .3s,color .3s;
}
.phone{
  width:100%;height:100dvh;max-width:100%;position:relative;
  display:flex;flex-direction:column;overflow:hidden;
  background:var(--bg);
}
@media(min-width:600px){
  .phone{max-width:390px;height:844px;border-radius:44px;border:8px solid #111;box-shadow:0 40px 100px rgba(0,0,0,0.45);}
}

/* === TOPNAV === */
.topnav{
  display:flex;align-items:center;justify-content:space-between;
  padding:16px 20px 12px;flex-shrink:0;
}
.brand{font-size:17px;font-weight:800;letter-spacing:-0.4px;color:var(--text);}
.brand span{color:var(--cyan);}
.icon-btn{
  width:36px;height:36px;border-radius:50%;border:none;
  background:var(--surface);border:1px solid var(--border);
  display:flex;align-items:center;justify-content:center;
  color:var(--muted);cursor:pointer;transition:.2s;text-decoration:none;
}
.icon-btn:active{transform:scale(.92);}

/* Выпадающее меню профиля */
.dropdown-wrapper { position: relative; display: flex; align-items: center; justify-content: center; }
.avatar{
  width:36px;height:36px;border-radius:50%;
  background:var(--cyan);color:#fff;font-weight:700;font-size:14px;
  display:flex;align-items:center;justify-content:center;cursor:pointer;
  border:2px solid var(--surface);box-shadow:0 0 0 2px var(--cyan);
  position:relative;
}
.theme-dot{
  position:absolute;bottom:-2px;right:-2px;width:14px;height:14px;
  border-radius:50%;background:var(--surface);border:1.5px solid var(--border);
  display:flex;align-items:center;justify-content:center;font-size:8px;cursor:pointer;
}
.profile-dropdown { position: absolute; top: 50px; right: 0; background: var(--nav-bg); border: 1px solid var(--border); border-radius: 16px; padding: 8px; box-shadow: var(--shadow-lg); display: none; flex-direction: column; gap: 4px; z-index: 1001; min-width: 180px;}
.profile-dropdown.active { display: flex; }
.pd-item { display: flex; align-items: center; gap: 10px; padding: 12px 16px; border-radius: 10px; font-size: 14px; font-weight: 700; color: var(--text); cursor: pointer; text-decoration: none;}
.pd-item:active { background: var(--surface2); }
.pd-item.danger { color: var(--red); }

/* === TABS === */
.tabs-wrap{padding:0 20px 14px;flex-shrink:0;}
.tabs{
  display:flex;background:var(--surface);border-radius:14px;
  padding:4px;border:1px solid var(--border);gap:4px;
}
.tab{
  flex:1;padding:10px;font-size:13px;font-weight:700;
  color:var(--muted);border-radius:10px;border:none;
  background:transparent;font-family:'DM Sans',sans-serif;
  cursor:pointer;transition:.25s;
}
.tab.active{
  background:var(--cyan);color:#fff;
  box-shadow:0 4px 12px rgba(8,145,178,.3);
}
[data-theme="dark"] .tab.active{box-shadow:0 4px 16px rgba(0,240,255,.2);}

/* === SEARCH ROW === */
.search-row{display:flex;gap:10px;padding:0 20px 12px;flex-shrink:0;}
.search-box{
  flex:1;display:flex;align-items:center;gap:10px;
  background:var(--surface);border:1px solid var(--border);
  border-radius:14px;padding:12px 14px;box-shadow:var(--shadow);
}
.search-box input{
  flex:1;border:none;background:transparent;outline:none;
  font-family:'DM Sans',sans-serif;font-size:15px;font-weight:500;
  color:var(--text);
}
.search-box input::placeholder{color:var(--hint);}
.filter-btn{
  width:48px;height:48px;border-radius:14px;border:1px solid var(--border);
  background:var(--surface);display:flex;align-items:center;justify-content:center;
  color:var(--muted);cursor:pointer;transition:.2s;box-shadow:var(--shadow);
  position:relative;flex-shrink:0;
}
.filter-btn.active{background:var(--cyan);color:#fff;border-color:var(--cyan);}
.filter-dot{
  position:absolute;top:9px;right:9px;width:7px;height:7px;
  background:var(--red);border-radius:50%;border:1.5px solid var(--surface);
  display:none;
}
.filter-btn.has-filter .filter-dot{display:block;}

/* === CATEGORY PILLS === */
.cat-scroll{
  display:flex;gap:8px;padding:0 20px 14px;overflow-x:auto;flex-shrink:0;
  scrollbar-width:none;
}
.cat-scroll::-webkit-scrollbar{display:none;}
.cat-pill{
  display:flex;align-items:center;gap:6px;padding:8px 14px;
  border-radius:999px;font-size:13px;font-weight:600;white-space:nowrap;
  border:1.5px solid var(--border);background:var(--surface);
  color:var(--muted);cursor:pointer;transition:.2s;flex-shrink:0;
}
.cat-pill .pill-icon{font-size:14px;}
.cat-pill.active{
  background:var(--cyan-bg);border-color:var(--cyan);color:var(--cyan);
}
.cat-pill.active .pill-dot{
  width:6px;height:6px;border-radius:50%;background:var(--cyan);flex-shrink:0;
}

/* === STORE SELECTOR === */
.store-bar{
  margin:0 20px 12px;padding:14px 16px;
  background:var(--surface);border-radius:14px;border:1px solid var(--border);
  display:flex;align-items:center;justify-content:space-between;
  cursor:pointer;transition:.2s;box-shadow:var(--shadow);
}
.store-bar:active{transform:scale(.99);}
.store-bar-left{display:flex;align-items:center;gap:10px;}
.store-icon{
  width:32px;height:32px;border-radius:10px;background:var(--cyan-bg);
  display:flex;align-items:center;justify-content:center;font-size:16px;
}
.store-label{font-size:10px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;}
.store-name{font-size:14px;font-weight:700;color:var(--text);}

/* === SCROLL LIST === */
.list-scroll{flex:1;overflow-y:auto;padding:0 20px 130px;display:flex;flex-direction:column;gap:8px;}
.list-scroll::-webkit-scrollbar{display:none;}

/* === PRODUCT CARD === */
.p-card{
  background:var(--surface);border-radius:16px;border:1px solid var(--border);
  display:flex;align-items:center;gap:12px;padding:14px;
  box-shadow:var(--shadow);transition:.2s;animation:fadeUp .3s ease both;
}
@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
.p-card:active{transform:scale(.99);}
.p-emoji{
  width:44px;height:44px;border-radius:12px;background:var(--surface2);
  display:flex;align-items:center;justify-content:center;font-size:22px;
  flex-shrink:0;border:1px solid var(--border);
}
.p-body{flex:1;min-width:0;}
.p-name{font-size:14px;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.p-meta{display:flex;align-items:center;gap:8px;margin-top:3px;}
.p-price{font-size:12px;font-weight:600;color:var(--muted);}
.badge{font-size:10px;font-weight:700;padding:3px 8px;border-radius:999px;}
.badge-green{color:var(--green);background:var(--green-bg);}
.badge-red{color:var(--red);background:var(--red-bg);}
.badge-amber{color:var(--amber);background:var(--amber-bg);}
.p-cat{font-size:10px;font-weight:600;color:var(--hint); white-space: nowrap;}
.p-actions{display:flex;align-items:center;gap:6px;flex-shrink:0;}
.del-btn{
  width:32px;height:32px;border-radius:10px;border:none;
  background:var(--red-bg);color:var(--red);
  display:flex;align-items:center;justify-content:center;cursor:pointer;transition:.2s;
}
.del-btn:active{transform:scale(.88);}

/* === INV CONTROLS === */
.inv-ctrl{display:flex;align-items:center;gap:2px;flex-shrink:0;}
.inv-btn{
  width:32px;height:32px;border-radius:10px;border:1px solid var(--border);
  background:var(--surface2);color:var(--text);font-size:18px;font-weight:700;
  display:flex;align-items:center;justify-content:center;cursor:pointer;transition:.2s;
}
.inv-btn:active{background:var(--cyan);color:#fff;border-color:var(--cyan);}
.inv-val{
  width:44px;text-align:center;font-size:15px;font-weight:800;
  color:var(--text);border:none;background:transparent;
  font-family:'DM Sans',sans-serif;outline:none;
}

/* === EMPTY === */
.empty{text-align:center;padding:60px 20px 20px;animation:fadeUp .4s ease;}
.empty-icon{font-size:52px;margin-bottom:14px;opacity:.5;}
.empty-title{font-size:16px;font-weight:700;color:var(--text);margin-bottom:6px;}
.empty-sub{font-size:13px;color:var(--muted);}

/* === FAB === */
.fab{
  position:absolute;bottom:92px;right:20px;
  width:56px;height:56px;border-radius:18px;
  background:var(--cyan);color:#fff;border:none;
  display:flex;align-items:center;justify-content:center;
  box-shadow:0 8px 24px rgba(8,145,178,.4);cursor:pointer;z-index:50;transition:.25s;
}
[data-theme="dark"] .fab{box-shadow:0 8px 28px rgba(0,240,255,.25);}
.fab:active{transform:scale(.88) rotate(90deg);}

/* === SAVE PANEL === */
.save-panel{
  position:absolute;bottom:80px;left:0;right:0;padding:12px 20px;
  background:linear-gradient(to top,var(--bg) 60%,transparent);
  display:none;z-index:20;
}
.save-panel.show{display:block;animation:fadeUp .3s ease;}
.save-btn{
  width:100%;padding:16px;border-radius:16px;border:none;
  background:var(--green);color:#fff;font-family:'DM Sans',sans-serif;
  font-size:15px;font-weight:700;cursor:pointer;transition:.2s;
  box-shadow:0 6px 20px rgba(5,150,105,.3);display:flex;align-items:center;justify-content:center;gap:8px;
}
.save-btn:active{transform:scale(.98);}

/* === NAV === */
.bottom-nav{
  position:absolute;bottom:16px;left:16px;right:16px;height:62px;
  background:var(--nav-bg);border:1px solid var(--border);border-radius:20px;
  display:flex;justify-content:space-around;align-items:center;
  box-shadow:var(--shadow-lg);z-index:100;
}
.nav-item{
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  width:54px;height:50px;border-radius:14px;
  color:var(--hint);text-decoration:none;transition:.2s;position:relative;
}
.nav-item svg{width:20px;height:20px;stroke-width:2;}
.nav-item.active{color:var(--text);}
.nav-item.active::after{
  content:'';position:absolute;bottom:4px;width:18px;height:3px;
  border-radius:2px;background:var(--cyan);
}

/* === MODAL === */
.overlay{
  position:fixed;top:0;left:0;width:100%;height:100%;
  background:rgba(0,0,0,.55);backdrop-filter:blur(6px);
  z-index:1000;display:none;flex-direction:column;justify-content:flex-end;
}
.overlay.show{display:flex;}
.sheet{
  background:var(--nav-bg);border-radius:24px 24px 0 0;
  border-top:1px solid var(--border);
  animation:slideUp .3s cubic-bezier(.16,1,.3,1);
  max-height:80dvh;overflow-y:auto;
}
.sheet::-webkit-scrollbar{display:none;}
@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
.sheet-handle{width:36px;height:4px;border-radius:2px;background:var(--hint);margin:12px auto 0;}
.sheet-head{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;}
.sheet-title{font-size:16px;font-weight:800;color:var(--text);}
.close-btn{
  width:34px;height:34px;border-radius:50%;border:1px solid var(--border);
  background:var(--surface2);display:flex;align-items:center;justify-content:center;
  color:var(--muted);cursor:pointer;
}
.sheet-body{padding:0 20px 32px;}

/* Category items */
.cat-list{display:flex;flex-direction:column;gap:8px;}
.cat-item{
  display:flex;align-items:center;gap:14px;padding:16px;
  border-radius:14px;background:var(--surface2);border:1.5px solid transparent;
  cursor:pointer;transition:.2s;
}
.cat-item:active{transform:scale(.98);}
.cat-item.active{border-color:var(--cyan);background:var(--cyan-bg);}
.cat-item.active .ci-name{color:var(--cyan);}
.ci-ico{font-size:22px;}
.ci-name{font-size:14px;font-weight:700;color:var(--text);}
.ci-count{font-size:12px;color:var(--muted);margin-left:auto;}
.ci-check{
  width:20px;height:20px;border-radius:50%;border:2px solid var(--border);
  display:flex;align-items:center;justify-content:center;flex-shrink:0;
}
.cat-item.active .ci-check{background:var(--cyan);border-color:var(--cyan);}

/* Store items */
.store-list{display:flex;flex-direction:column;gap:8px;}
.store-item{
  display:flex;align-items:center;gap:14px;padding:16px;
  border-radius:14px;background:var(--surface2);border:1.5px solid transparent;
  cursor:pointer;transition:.2s;
}
.store-item:active{transform:scale(.98);}
.store-item.active{border-color:var(--cyan);background:var(--cyan-bg);}
.si-dot{width:10px;height:10px;border-radius:50%;background:var(--green);margin-left:auto;}

/* Add form */
.form-group{margin-bottom:16px;}
.form-label{font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.6px;margin-bottom:8px;display:block;}
.form-input{
  width:100%;padding:14px 16px;border-radius:14px;
  border:1.5px solid var(--border);background:var(--surface2);
  font-family:'DM Sans',sans-serif;font-size:15px;font-weight:500;
  color:var(--text);outline:none;transition:.2s;appearance:none;
}
.form-input:focus{border-color:var(--cyan);background:var(--surface);}
.form-row{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
.emoji-row{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;}
.emoji-opt{
  width:42px;height:42px;border-radius:12px;font-size:20px;
  display:flex;align-items:center;justify-content:center;
  border:2px solid var(--border);background:var(--surface2);cursor:pointer;transition:.2s;
}
.emoji-opt.sel{border-color:var(--cyan);background:var(--cyan-bg);}
.btn-primary{
  width:100%;padding:16px;border-radius:16px;border:none;
  background:var(--cyan);color:#fff;font-family:'DM Sans',sans-serif;
  font-size:15px;font-weight:700;cursor:pointer;transition:.2s;
  box-shadow:0 6px 20px rgba(8,145,178,.3);
}
.btn-primary:active{transform:scale(.98);}

/* === TOASTS === */
.toast-wrap{position:absolute;top:16px;left:50%;transform:translateX(-50%);z-index:9999;pointer-events:none;width:88%;display:flex;flex-direction:column;gap:8px;}
.toast{
  background:var(--surface);border:1px solid var(--border);color:var(--text);
  font-size:13px;font-weight:700;padding:14px 18px;border-radius:16px;
  box-shadow:var(--shadow-lg);display:flex;align-items:center;gap:12px;
  animation:toastIn .4s forwards;
}
@keyframes toastIn{from{opacity:0;transform:translateY(-14px) scale(.9)}to{opacity:1;transform:translateY(0)}}
@keyframes toastOut{from{opacity:1}to{opacity:0;transform:translateY(-14px) scale(.9)}}
.ti-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;}
.ti-green{background:var(--green);}
.ti-red{background:var(--red);}

/* === SUMMARY BAR === */
.summary-bar{
  display:flex;gap:8px;padding:0 20px 12px;flex-shrink:0;
}
.sum-card{
  flex:1;background:var(--surface);border-radius:14px;border:1px solid var(--border);
  padding:12px;display:flex;flex-direction:column;gap:2px;
}
.sum-label{font-size:10px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;}
.sum-val{font-size:18px;font-weight:800;color:var(--text);}
.sum-val.cyan{color:var(--cyan);}
.sum-val.green{color:var(--green);}
.sum-val.red{color:var(--red);}
</style>
</head>
<body>
<div class="phone" id="app">
  <div class="toast-wrap" id="toastWrap"></div>

  <div class="topnav">
    <a href="settings.html" class="icon-btn" title="Настройки">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
    </a>
    <div class="brand">Dukon<span>OS</span></div>
    
    <div class="dropdown-wrapper">
      <div class="avatar" id="avatarBtn" onclick="toggleDropdown(event)">
        <span id="avatarLetter">?</span>
        <div class="theme-dot" id="themeDot" onclick="toggleTheme(event)">☀</div>
      </div>
      <div class="profile-dropdown" id="owner-dropdown">
        <a href="profile.html" class="pd-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 18px;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> Мой профиль
        </a>
        <div class="pd-item danger" onclick="logout()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 18px;"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg> Выйти
        </div>
      </div>
    </div>
  </div>

  <div class="tabs-wrap">
    <div class="tabs">
      <button class="tab active" onclick="switchTab('catalog', this)">📦 База товаров</button>
      <button class="tab" onclick="switchTab('inventory', this)">📋 Инвентаризация</button>
    </div>
  </div>

  <div class="search-row">
    <div class="search-box">
      <svg viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2" style="width:18px;flex-shrink:0"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input type="text" id="searchInput" placeholder="Поиск товара..." oninput="render()">
    </div>
    <div class="filter-btn" id="filterBtn" onclick="openModal('filterModal')">
      <div class="filter-dot"></div>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
    </div>
  </div>

  <div class="cat-scroll" id="catScroll"></div>

  <div class="summary-bar" id="summaryBar">
    <div class="sum-card">
      <div class="sum-label">Всего</div>
      <div class="sum-val cyan" id="sumTotal">0</div>
    </div>
    <div class="sum-card">
      <div class="sum-label">Ок</div>
      <div class="sum-val green" id="sumOk">0</div>
    </div>
    <div class="sum-card">
      <div class="sum-label">Мало</div>
      <div class="sum-val red" id="sumLow">0</div>
    </div>
  </div>

  <div id="storeBar" style="display:none" onclick="openModal('storeModal')">
    <div class="store-bar">
      <div class="store-bar-left">
        <div class="store-icon">🏪</div>
        <div>
          <div class="store-label">Магазин для переучёта</div>
          <div class="store-name" id="storeNameTxt">Выберите магазин...</div>
        </div>
      </div>
      <svg viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2.5" style="width:16px"><path d="M6 9l6 6 6-6"/></svg>
    </div>
  </div>

  <div class="list-scroll" id="mainList"></div>

  <div class="save-panel" id="savePanel">
    <button class="save-btn" onclick="saveInventory()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:18px"><polyline points="20 6 9 17 4 12"/></svg>
      Сохранить остатки
    </button>
  </div>

  <button class="fab" onclick="openAddModal()">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:24px"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
  </button>

  <div class="bottom-nav">
    <a href="index.html" class="nav-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg></a>
    <a href="Search.html" class="nav-item active"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></a>
    <a href="network.html" class="nav-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></a>
    <a href="finance.html" class="nav-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg></a>
  </div>

  <div class="overlay" id="filterModal" onclick="bgClose(event,'filterModal')">
    <div class="sheet">
      <div class="sheet-handle"></div>
      <div class="sheet-head">
        <div class="sheet-title">Категории товаров</div>
        <button class="close-btn" onclick="closeModal('filterModal')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="sheet-body">
        <div class="cat-list" id="catModalList"></div>
      </div>
    </div>
  </div>

  <div class="overlay" id="storeModal" onclick="bgClose(event,'storeModal')">
    <div class="sheet">
      <div class="sheet-handle"></div>
      <div class="sheet-head">
        <div class="sheet-title">Выберите магазин</div>
        <button class="close-btn" onclick="closeModal('storeModal')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="sheet-body">
        <div class="store-list" id="storeList"></div>
      </div>
    </div>
  </div>

  <div class="overlay" id="addModal" onclick="bgClose(event,'addModal')">
    <div class="sheet">
      <div class="sheet-handle"></div>
      <div class="sheet-head">
        <div class="sheet-title" id="addModalTitle">Новый товар</div>
        <button class="close-btn" onclick="closeModal('addModal')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="sheet-body">
        <div class="form-group">
          <label class="form-label">Иконка</label>
          <div class="emoji-row" id="emojiRow"></div>
        </div>
        <div class="form-group">
          <label class="form-label">Название товара</label>
          <input class="form-input" id="fName" type="text" placeholder="Например: Сок 1л">
        </div>
        <div class="form-group">
          <label class="form-label">Категория</label>
          <select class="form-input" id="fCat">
            <option>Напитки</option>
            <option>Молочное</option>
            <option>Бакалея</option>
            <option>Снеки</option>
            <option>Кондитерское</option>
          </select>
        </div>
        <div class="form-row form-group">
          <div>
            <label class="form-label">Цена (UZS)</label>
            <input class="form-input" id="fPrice" type="number" placeholder="0">
          </div>
          <div>
            <label class="form-label">Количество</label>
            <input class="form-input" id="fStock" type="number" placeholder="0">
          </div>
        </div>
        <button class="btn-primary" onclick="saveProduct()">Добавить товар</button>
      </div>
    </div>
  </div>
</div>

<script src="data.js"></script>
<script>
const EMOJIS = ['🧃','🥛','🥤','☕','🍫','🍪','🧁','🥚','🍞','🧀','🥩','🍕','🍜','🍱','🧂','🫙'];
const CATEGORIES = [
  {icon:'🛒',name:'Все товары'},
  {icon:'🥤',name:'Напитки'},
  {icon:'🥛',name:'Молочное'},
  {icon:'🌾',name:'Бакалея'},
  {icon:'🍫',name:'Кондитерское'},
  {icon:'🍟',name:'Снеки'},
];

let STORES = [];
let products = [];
let inventory = [];

let tab = 'catalog';
let selCat = 'Все товары';
let selStore = null;
let hasChanges = false;
let selEmoji = '📦';

// DROPDOWN
function toggleDropdown(e) {
    e.stopPropagation();
    document.getElementById('owner-dropdown').classList.toggle('active');
}
window.addEventListener('click', (e) => {
    if (!e.target.closest('.dropdown-wrapper')) {
        document.getElementById('owner-dropdown')?.classList.remove('active');
    }
});

// THEME
function initTheme(){
  const t = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', t);
  document.getElementById('themeDot').textContent = t === 'dark' ? '🌙' : '☀';
}
function toggleTheme(e){
  if(e) e.stopPropagation();
  const cur = document.documentElement.getAttribute('data-theme');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  document.getElementById('themeDot').textContent = next === 'dark' ? '🌙' : '☀';
}

// API DATA LOADING
async function initData() {
    await loadGlobalProducts();
    await loadStoresForInventory();
    renderPills();
    render();
}

async function loadGlobalProducts() {
    try {
        const token = localStorage.getItem('dukonos_token');
        
        // Fetch User Avatar Letter
        if(document.getElementById('avatarLetter').innerText === '?') {
            const resMe = await fetch('/api/me', { headers: { 'Authorization': `Bearer ${token}` } });
            if(resMe.ok) {
                const me = await resMe.json();
                document.getElementById('avatarLetter').innerText = me.name ? me.name[0].toUpperCase() : '?';
            }
        }

        // Fetch Products
        const res = await fetch('/api/products', { headers: { 'Authorization': `Bearer ${token}` } });
        if(res.ok) {
            products = await res.json();
        } else throw new Error();
    } catch(e) {
        // DEMO
        products = [
          {id:1, icon:'🧃', name:'Сок апельсин 1л', category:'Напитки', price:15000, stock:17},
          {id:2, icon:'🥛', name:'Молоко 1.5% жир', category:'Молочное', price:12000, stock:97},
          {id:3, icon:'🥤', name:'Fanta 0.5л', category:'Напитки', price:5000, stock:58},
          {id:4, icon:'☕', name:'Кофе зерновой', category:'Бакалея', price:45000, stock:8},
          {id:5, icon:'🍫', name:'Шоколад тёмный', category:'Кондитерское', price:12000, stock:45},
          {id:6, icon:'🍪', name:'Печенье Oreo', category:'Снеки', price:8000, stock:3},
          {id:7, icon:'🥚', name:'Яйца C1 (10шт)', category:'Молочное', price:22000, stock:34},
          {id:8, icon:'🧁', name:'Кекс шоколадный', category:'Кондитерское', price:6500, stock:0},
        ];
    }
    if(tab === 'catalog') render();
}

async function loadStoresForInventory() {
    try {
        const token = localStorage.getItem('dukonos_token');
        const res = await fetch('/api/stores', { headers: { 'Authorization': `Bearer ${token}` } });
        if (res.ok) {
            STORES = await res.json();
        } else throw new Error();
    } catch(e) {
        // DEMO
        STORES = [
          {id:1, name:'Baraka Store', address:'Ул. Навоий 14'},
          {id:2, name:'Сохо Бутик', address:'Пр. Мустакиллик 22'},
          {id:3, name:'Neon Market', address:'Ул. Бунёдкор 5'},
        ];
    }
}

// TABS
function switchTab(t, el){
  if(hasChanges && !confirm('Есть несохранённые изменения. Покинуть вкладку?')) return;
  tab = t; hasChanges = false;
  document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('summaryBar').style.display = t === 'catalog' ? 'flex' : 'none';
  document.getElementById('storeBar').style.display = t === 'inventory' ? 'block' : 'none';
  document.getElementById('savePanel').classList.remove('show');
  
  if(t === 'inventory' && selStore) {
      loadInventoryApi(selStore.id);
  } else {
      render();
  }
}

// CATEGORY PILLS
function renderPills(){
  const scroll = document.getElementById('catScroll');
  scroll.innerHTML = CATEGORIES.map(c => `
    <div class="cat-pill ${c.name === selCat ? 'active' : ''}" onclick="setCat('${c.name}')">
      <span class="pill-icon">${c.icon}</span>${c.name}
      ${c.name === selCat ? '<span class="pill-dot"></span>' : ''}
    </div>`).join('');
}

function setCat(name){
  selCat = name;
  const fb = document.getElementById('filterBtn');
  name === 'Все товары' ? fb.classList.remove('has-filter') : fb.classList.add('has-filter');
  renderPills();
  renderCatModal();
  closeModal('filterModal');
  render();
}

// RENDER MAIN LIST
function render(){
  const q = document.getElementById('searchInput').value.toLowerCase();
  const list = document.getElementById('mainList');
  const src = tab === 'catalog' ? products : inventory;

  if(tab === 'inventory' && !selStore){
    list.innerHTML = `<div class="empty"><div class="empty-icon">🏪</div><div class="empty-title">Выберите магазин</div><div class="empty-sub">Нажмите на поле выше, чтобы выбрать магазин для переучёта</div></div>`;
    return;
  }

  // Support both API format 'category' and DEMO format 'cat'
  const filtered = src.filter(p =>
    (selCat === 'Все товары' || (p.category || p.cat) === selCat) &&
    p.name.toLowerCase().includes(q)
  );

  if(!filtered.length){
    list.innerHTML = `<div class="empty"><div class="empty-icon">🔍</div><div class="empty-title">Ничего не найдено</div><div class="empty-sub">Попробуйте изменить поиск или категорию</div></div>`;
    return;
  }

  if(tab === 'catalog'){
    const ok = filtered.filter(p => p.stock > 10).length;
    const low = filtered.filter(p => p.stock <= 10 && p.stock > 0).length;
    const zero = filtered.filter(p => p.stock == 0).length;
    document.getElementById('sumTotal').textContent = filtered.length;
    document.getElementById('sumOk').textContent = ok;
    document.getElementById('sumLow').textContent = low + zero;

    list.innerHTML = filtered.map((p,i) => {
      let badgeClass = 'badge-green', badgeTxt = (p.stock||0) + ' шт';
      if((p.stock||0) == 0){badgeClass='badge-red';badgeTxt='Нет в наличии';}
      else if(p.stock <= 10){badgeClass='badge-amber';badgeTxt='⚠ ' + p.stock + ' шт';}
      
      const iconStr = p.icon || '📦';
      const catStr = p.category || p.cat || '';
      
      return `
      <div class="p-card" style="animation-delay:${i*0.04}s">
        <div class="p-emoji">${iconStr}</div>
        <div class="p-body">
          <div class="p-name">${p.name}</div>
          <div class="p-meta">
            <span class="p-price">${Number(p.price).toLocaleString('ru')} UZS</span>
            <span class="badge ${badgeClass}">${badgeTxt}</span>
          </div>
          <div class="p-cat">${catStr}</div>
        </div>
        <div class="p-actions">
          <button class="del-btn" onclick="delProduct(${p.id})">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </div>`;
    }).join('');
  } else {
    list.innerHTML = filtered.map((p,i) => {
        const iconStr = p.icon || '📦';
        const stockVal = p.stock || 0;
        const pId = p.product_id || p.id;
        
        return `
      <div class="p-card" style="animation-delay:${i*0.04}s">
        <div class="p-emoji" style="font-size:18px">${iconStr}</div>
        <div class="p-body">
          <div class="p-name">${p.name}</div>
          <div class="p-price">${Number(p.price).toLocaleString('ru')} UZS</div>
        </div>
        <div class="inv-ctrl">
          <button class="inv-btn" onclick="adj(${pId},-1)">−</button>
          <input class="inv-val" type="number" value="${stockVal}" onchange="setVal(${pId},this.value)">
          <button class="inv-btn" onclick="adj(${pId},1)">+</button>
        </div>
      </div>`
    }).join('');
  }
}

function adj(id, delta){
  const item = inventory.find(i => (i.product_id || i.id) == id);
  if(!item) return;
  item.stock = Math.max(0, (item.stock||0) + delta);
  markChanged(); render();
}
function setVal(id, val){
  const item = inventory.find(i => (i.product_id || i.id) == id);
  if(!item) return;
  item.stock = Math.max(0, parseInt(val)||0);
  markChanged();
}
function markChanged(){
  hasChanges = true;
  document.getElementById('savePanel').classList.add('show');
}

async function saveInventory(){
    if(!hasChanges || !selStore) return;
    try {
        const token = localStorage.getItem('dukonos_token');
        const res = await fetch('/api/inventory/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ store_id: selStore.id, inventory: inventory })
        });
        if(res.ok) {
            toast('Остатки успешно сохранены!', 'green');
            hasChanges = false;
            document.getElementById('savePanel').classList.remove('show');
        } else throw new Error();
    } catch(e) {
        // Fallback for demo
        products = JSON.parse(JSON.stringify(inventory));
        hasChanges = false;
        document.getElementById('savePanel').classList.remove('show');
        toast('Остатки сохранены (Демо)!', 'green');
    }
}

async function delProduct(id){
    if(!confirm('Удалить товар из базы?')) return;
    try {
        const token = localStorage.getItem('dukonos_token');
        const res = await fetch(`/api/products/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
        if(res.ok) {
            products = products.filter(p => p.id !== id);
            toast('Товар удалён', 'red');
            render();
        } else throw new Error();
    } catch(e) {
        products = products.filter(p => p.id !== id);
        toast('Товар удалён (Демо)', 'red');
        render();
    }
}

// STORE MODAL
function renderStores(){
  document.getElementById('storeList').innerHTML = STORES.map(s => `
    <div class="store-item ${selStore && selStore.id === s.id ? 'active' : ''}" onclick="selectStore(${s.id})">
      <div style="font-size:22px">🏪</div>
      <div>
        <div style="font-size:14px;font-weight:700;color:var(--text)">${s.name}</div>
        <div style="font-size:12px;color:var(--muted)">${s.address || 'Магазин сети'}</div>
      </div>
      <div class="si-dot" style="${selStore && selStore.id === s.id ? '' : 'background:var(--hint)'}"></div>
    </div>`).join('');
}

async function selectStore(id){
  selStore = STORES.find(s => s.id === id);
  document.getElementById('storeNameTxt').textContent = selStore.name;
  closeModal('storeModal');
  await loadInventoryApi(id);
}

async function loadInventoryApi(storeId) {
    document.getElementById('mainList').innerHTML = '<div style="text-align:center; padding:40px; font-weight:600; color:var(--muted);">Загрузка остатков...</div>';
    try {
        const token = localStorage.getItem('dukonos_token');
        const res = await fetch(`/api/inventory/${storeId}`, { headers: { 'Authorization': `Bearer ${token}` } });
        if(res.ok) {
            inventory = await res.json();
        } else throw new Error();
    } catch(e) {
        // DEMO Fallback
        inventory = JSON.parse(JSON.stringify(products));
    }
    hasChanges = false;
    document.getElementById('savePanel').classList.remove('show');
    render();
}

// CAT MODAL
function renderCatModal(){
  document.getElementById('catModalList').innerHTML = CATEGORIES.map(c => {
      const count = c.name === 'Все товары' ? products.length : products.filter(p => (p.category || p.cat) === c.name).length;
      return `
    <div class="cat-item ${c.name === selCat ? 'active' : ''}" onclick="setCat('${c.name}')">
      <div class="ci-ico">${c.icon}</div>
      <div class="ci-name">${c.name}</div>
      <div class="ci-count">${count} тов.</div>
      <div class="ci-check">
        ${c.name === selCat ? '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" style="width:10px"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
      </div>
    </div>`;
  }).join('');
}

// ADD MODAL
function openAddModal(){
  if(tab === 'inventory' && !selStore){ toast('Сначала выберите магазин!', 'red'); return; }
  document.getElementById('addModalTitle').textContent = tab === 'catalog' ? '➕ Новый товар (вся сеть)' : '➕ Товар для ' + selStore.name;
  selEmoji = EMOJIS[0];
  document.getElementById('emojiRow').innerHTML = EMOJIS.map(e =>
    `<div class="emoji-opt ${e === selEmoji ? 'sel' : ''}" onclick="pickEmoji(this,'${e}')">${e}</div>`).join('');
  document.getElementById('fName').value = '';
  document.getElementById('fPrice').value = '';
  document.getElementById('fStock').value = '';
  openModal('addModal');
}
function pickEmoji(el, e){
  selEmoji = e;
  document.querySelectorAll('.emoji-opt').forEach(o => o.classList.remove('sel'));
  el.classList.add('sel');
}

async function saveProduct(){
  const name = document.getElementById('fName').value.trim();
  const price = parseInt(document.getElementById('fPrice').value) || 0;
  const stock = parseInt(document.getElementById('fStock').value) || 0;
  const cat = document.getElementById('fCat').value;
  if(!name){ toast('Введите название!', 'red'); return; }
  if(!price){ toast('Введите цену!', 'red'); return; }
  
  const payload = { name, category: cat, price, icon: selEmoji, stock };
  if (tab === 'inventory' && selStore) {
      payload.target_store_id = selStore.id;
  }

  try {
      const token = localStorage.getItem('dukonos_token');
      const res = await fetch('/api/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify(payload)
      });
      if(res.ok) {
          closeModal('addModal');
          toast('Товар добавлен!', 'green');
          if(tab === 'catalog') loadGlobalProducts();
          else loadInventoryApi(selStore.id);
      } else throw new Error();
  } catch(e) {
      // Demo Add
      const newP = {id: Date.now(), icon: selEmoji, name, category: cat, price, stock};
      products.push(newP);
      if(tab === 'inventory') inventory.push({...newP});
      closeModal('addModal');
      toast('Товар добавлен (Демо)!', 'green');
      render(); renderPills(); renderCatModal();
  }
}

// MODALS
function openModal(id){
  if(id === 'filterModal') renderCatModal();
  if(id === 'storeModal') renderStores();
  document.getElementById(id).classList.add('show');
}
function closeModal(id){ document.getElementById(id).classList.remove('show'); }
function bgClose(e, id){ if(e.target.classList.contains('overlay')) closeModal(id); }

// TOAST
function toast(msg, type='green'){
  const wrap = document.getElementById('toastWrap');
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<div class="ti-dot ti-${type}"></div><span>${msg}</span>`;
  wrap.appendChild(el);
  setTimeout(() => { el.style.animation = 'toastOut .4s forwards'; setTimeout(() => el.remove(), 400); }, 2200);
}

// INIT
window.onload = () => {
    initTheme();
    initData();
};
</script>
</body>
</html>
