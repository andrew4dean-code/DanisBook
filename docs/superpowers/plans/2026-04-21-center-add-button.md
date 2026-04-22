# Center Add Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Scan tab and the floating "+" FAB with a single elevated center button in the tab bar that opens a bottom sheet (Add Manually / Scan or Photo / From Instagram).

**Architecture:** All changes are in `index.html` (HTML structure, CSS, JS) and `server.js` (version string). The existing `.modal-overlay` / `.modal-sheet` CSS system is reused for the bottom sheet. The scan panel is converted from a tab panel to a triggered full-screen overlay. No new files are created.

**Tech Stack:** Vanilla JS, CSS custom properties, Lucide icons (already loaded via unpkg CDN)

---

## File Map

| File | What changes |
|---|---|
| `index.html` | Tab bar HTML, center button CSS, remove FAB, add bottom sheet HTML+CSS, scan panel → overlay, JS tab system, JS sheet logic, version strings |
| `server.js` | Version string `'1.8'` → `'1.9'` |

---

### Task 1: Version bump and What's New entry

**Files:**
- Modify: `server.js` (line ~239)
- Modify: `index.html` (lines ~1136, ~1152, ~2976)

- [ ] **Step 1: Bump version in server.js**

Find and replace in `server.js`:
```js
// Before
res.json({ version: '1.8' });

// After
res.json({ version: '1.9' });
```

- [ ] **Step 2: Bump APP_VERSION in index.html**

Find and replace in `index.html`:
```js
// Before
const APP_VERSION = '1.8';

// After
const APP_VERSION = '1.9';
```

- [ ] **Step 3: Update version display in Settings**

Find in `index.html`:
```html
<span class="settings-version">Version <span class="version-num">1.8</span></span>
```
Replace with:
```html
<span class="settings-version">Version <span class="version-num">1.9</span></span>
```

- [ ] **Step 4: Add What's New entry**

Find in `index.html`:
```html
<p style="font-weight:600;color:var(--text)">Version 1.8 — April 2026</p>
```
Replace with:
```html
<p style="font-weight:600;color:var(--text)">Version 1.9 — April 2026</p>
        <p>• Add button now lives in the center of the tab bar — tap it to add a recipe manually, scan a photo, or pull from Instagram</p>
        <p style="margin-top:14px;font-weight:600;color:var(--text-muted)">Version 1.8 — April 2026</p>
```

- [ ] **Step 5: Commit**

```bash
git add index.html server.js
git commit -m "chore: bump to v1.9, add What's New entry"
```

---

### Task 2: Tab bar HTML restructure

**Files:**
- Modify: `index.html` (tab bar nav, recipes panel)

The current tab order is Recipes | Scan | Grocery | Planner | Settings. The new order is Recipes | Grocery | [center button] | Planner | Settings. The Scan tab button is removed. The FAB button is removed. A center button element is added.

- [ ] **Step 1: Replace the entire tab bar nav**

Find in `index.html`:
```html
<nav class="tab-bar">
  <button class="tab-btn active" data-tab="recipes" data-tab-index="0">
    <i data-lucide="book-open"></i>
    <span>Recipes</span>
  </button>
  <button class="tab-btn" data-tab="scan" data-tab-index="1">
    <i data-lucide="camera"></i>
    <span>Scan</span>
  </button>
  <button class="tab-btn" data-tab="grocery" data-tab-index="2">
    <i data-lucide="shopping-bag"></i>
    <span>Grocery</span>
    <span class="tab-badge" id="groceryBadge" style="display:none">0</span>
  </button>
  <button class="tab-btn" data-tab="planner" data-tab-index="3">
    <i data-lucide="calendar-days"></i>
    <span>Planner</span>
  </button>
  <button class="tab-btn" data-tab="settings" data-tab-index="4">
    <i data-lucide="settings"></i>
    <span>Settings</span>
  </button>
</nav>
```

Replace with:
```html
<nav class="tab-bar">
  <button class="tab-btn active" data-tab="recipes" data-tab-index="0">
    <i data-lucide="book-open"></i>
    <span>Recipes</span>
  </button>
  <button class="tab-btn" data-tab="grocery" data-tab-index="1">
    <i data-lucide="shopping-bag"></i>
    <span>Grocery</span>
    <span class="tab-badge" id="groceryBadge" style="display:none">0</span>
  </button>
  <button class="tab-center-btn" id="addCenterBtn" aria-label="Add recipe">
    <div class="tab-center-circle">
      <i data-lucide="plus"></i>
    </div>
    <span>Add</span>
  </button>
  <button class="tab-btn" data-tab="planner" data-tab-index="2">
    <i data-lucide="calendar-days"></i>
    <span>Planner</span>
  </button>
  <button class="tab-btn" data-tab="settings" data-tab-index="3">
    <i data-lucide="settings"></i>
    <span>Settings</span>
  </button>
</nav>
```

- [ ] **Step 2: Remove the FAB button from the recipes panel**

Find in `index.html`:
```html
  <button class="fab" id="addRecipeBtn" aria-label="Add recipe">
    <i data-lucide="plus"></i>
  </button>
```
Delete those 3 lines entirely.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: restructure tab bar — remove scan tab, add center button"
```

---

### Task 3: Center button CSS and remove FAB CSS

**Files:**
- Modify: `index.html` (style block)

- [ ] **Step 1: Replace the FAB CSS block with center button styles**

Find in `index.html`:
```css
/* ========== FAB ========== */
.fab{
  position:fixed;bottom:calc(var(--tab-bar-h) + var(--safe-bottom) + 16px);
  right:16px;z-index:50;
  width:52px;height:52px;border-radius:var(--radius-full);
  background:var(--accent);color:#fff;
  display:flex;align-items:center;justify-content:center;
  box-shadow:var(--shadow-lg);
  transition:transform var(--transition),background var(--transition);
}
.fab:active{transform:scale(0.92);background:var(--accent-active)}
.fab svg{width:24px;height:24px}
```

Replace with:
```css
/* ========== CENTER TAB BUTTON ========== */
.tab-center-btn{
  flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:2px;
  padding-bottom:6px;
  font-size:11px;font-weight:600;color:var(--accent);letter-spacing:0.02em;
  -webkit-tap-highlight-color:transparent;
  position:relative;
}
.tab-center-circle{
  width:52px;height:52px;border-radius:var(--radius-full);
  background:var(--accent);color:#fff;
  display:flex;align-items:center;justify-content:center;
  box-shadow:0 4px 14px rgba(196,112,90,0.45);
  border:3px solid var(--bg);
  margin-top:-18px;
  transition:transform var(--transition),background var(--transition);
}
.tab-center-btn:active .tab-center-circle{transform:scale(0.92);background:var(--accent-active)}
.tab-center-circle svg{width:24px;height:24px}
[data-theme="dark"] .tab-center-circle{border-color:var(--bg);box-shadow:0 4px 14px rgba(212,136,110,0.4)}
```

- [ ] **Step 2: Commit**

```bash
git add index.html
git commit -m "feat: add center button CSS, remove FAB CSS"
```

---

### Task 4: Add-recipe bottom sheet HTML

**Files:**
- Modify: `index.html` (add sheet markup before closing `</body>`)

The sheet reuses the existing `.modal-overlay` / `.modal-sheet` / `.modal-handle` CSS classes already in the stylesheet.

- [ ] **Step 1: Add the bottom sheet markup**

Find in `index.html` the closing `</body>` tag. Insert the following immediately before it:

```html
<!-- ADD RECIPE SHEET -->
<div class="modal-overlay" id="addSheetOverlay">
  <div class="modal-sheet" id="addSheet">
    <div class="modal-handle"></div>
    <div class="modal-header">
      <span class="modal-title">Add a Recipe</span>
    </div>
    <div class="modal-body" style="padding-bottom:24px">
      <p style="font-size:14px;color:var(--text-muted);margin-bottom:20px">How would you like to add it?</p>
      <div style="display:flex;flex-direction:column;gap:12px">
        <button class="add-sheet-option" id="sheetAddManual">
          <div class="add-sheet-icon" style="background:var(--accent)">
            <i data-lucide="pencil-line"></i>
          </div>
          <div class="add-sheet-text">
            <div class="add-sheet-title">Add Manually</div>
            <div class="add-sheet-desc">Type it in yourself</div>
          </div>
        </button>
        <button class="add-sheet-option" id="sheetScanPhoto">
          <div class="add-sheet-icon" style="background:var(--text)">
            <i data-lucide="camera"></i>
          </div>
          <div class="add-sheet-text">
            <div class="add-sheet-title">Scan or Photo</div>
            <div class="add-sheet-desc">Snap a dish or scan a recipe card</div>
          </div>
        </button>
        <button class="add-sheet-option" id="sheetInstagram">
          <div class="add-sheet-icon" style="background:linear-gradient(135deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)">
            <i data-lucide="instagram"></i>
          </div>
          <div class="add-sheet-text">
            <div class="add-sheet-title">From Instagram</div>
            <div class="add-sheet-desc">Paste a post link or Reel</div>
          </div>
        </button>
      </div>
      <button class="add-sheet-cancel" id="sheetCancel">Cancel</button>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Commit**

```bash
git add index.html
git commit -m "feat: add add-recipe bottom sheet HTML"
```

---

### Task 5: Bottom sheet CSS

**Files:**
- Modify: `index.html` (style block — add after the CENTER TAB BUTTON section)

- [ ] **Step 1: Add sheet option styles**

Find the line `/* ========== MODAL ========== */` in the CSS. Add the following CSS block immediately after the existing modal CSS block (after the `@media(min-width:640px)` block and `.modal-body` rule):

```css
/* ========== ADD SHEET OPTIONS ========== */
.add-sheet-option{
  display:flex;align-items:center;gap:14px;
  width:100%;padding:14px 16px;
  background:var(--surface-alt);border:1.5px solid var(--border);
  border-radius:var(--radius-md);
  text-align:left;
  transition:background var(--transition),border-color var(--transition);
}
.add-sheet-option:active{background:var(--border-light)}
#sheetAddManual{background:var(--accent-light);border-color:var(--accent)}
#sheetAddManual:active{background:var(--accent-muted)}
.add-sheet-icon{
  width:44px;height:44px;border-radius:var(--radius-sm);flex-shrink:0;
  display:flex;align-items:center;justify-content:center;color:#fff;
}
.add-sheet-icon svg{width:20px;height:20px}
.add-sheet-title{font-size:15px;font-weight:600;color:var(--text)}
.add-sheet-desc{font-size:12px;color:var(--text-muted);margin-top:1px}
.add-sheet-cancel{
  display:block;width:100%;margin-top:16px;padding:12px;
  background:var(--surface-alt);border-radius:var(--radius-md);
  font-size:14px;color:var(--text-muted);text-align:center;
}
.add-sheet-cancel:active{background:var(--border-light)}
```

- [ ] **Step 2: Commit**

```bash
git add index.html
git commit -m "feat: add bottom sheet option CSS"
```

---

### Task 6: Convert scan panel to overlay

**Files:**
- Modify: `index.html` (`#panel-scan` HTML and add scan overlay CSS)

The scan panel currently has class `tab-panel`. We'll replace that with a `scan-overlay` class so it behaves as a fixed full-screen overlay triggered from the sheet instead of a tab.

- [ ] **Step 1: Update the scan panel opening tag**

Find in `index.html`:
```html
<div class="tab-panel" id="panel-scan">
```
Replace with:
```html
<div class="scan-overlay" id="panel-scan">
```

- [ ] **Step 2: Add a close button inside the scan panel**

Find in `index.html` (immediately after the opening tag you just changed):
```html
<div class="scan-section" id="scanUploadSection">
```
Insert a close button before it:
```html
  <button class="scan-overlay-close" id="scanOverlayClose" aria-label="Close">
    <i data-lucide="arrow-left"></i>
  </button>
```

- [ ] **Step 3: Add scan overlay CSS**

In the style block, find the `/* ========== ADD SHEET OPTIONS ========== */` section you added in Task 5 and add the following immediately after it:

```css
/* ========== SCAN OVERLAY ========== */
.scan-overlay{
  position:fixed;inset:0;z-index:150;
  background:var(--bg);
  overflow-y:auto;-webkit-overflow-scrolling:touch;
  padding:16px;padding-top:calc(var(--header-h) + 16px);
  padding-bottom:calc(var(--tab-bar-h) + var(--safe-bottom) + 16px);
  display:none;
  animation:fadeIn 0.22s ease;
}
.scan-overlay.open{display:block}
.scan-overlay-close{
  display:flex;align-items:center;gap:6px;
  font-size:15px;font-weight:500;color:var(--text-muted);
  margin-bottom:16px;
  -webkit-tap-highlight-color:transparent;
}
.scan-overlay-close svg{width:20px;height:20px}
.scan-overlay-close:active{color:var(--accent)}
```

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: convert scan panel from tab to overlay with close button"
```

---

### Task 7: Update JS — tab system

**Files:**
- Modify: `index.html` (JS section)

- [ ] **Step 1: Update tabOrder array**

Find in `index.html`:
```js
const tabOrder=['recipes','scan','grocery','planner','settings'];
```
Replace with:
```js
const tabOrder=['recipes','grocery','planner','settings'];
```

- [ ] **Step 2: Remove the FAB bounce animation from the tab switch handler**

Find in `index.html`:
```js
    if(currentTab==='recipes'){
      renderRecipes();
      const fab=$('.fab');fab.classList.remove('bounce-in');void fab.offsetWidth;fab.classList.add('bounce-in');
    }
```
Replace with:
```js
    if(currentTab==='recipes'){
      renderRecipes();
    }
```

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: update tab system — remove scan from tabOrder, remove FAB bounce"
```

---

### Task 8: Wire the bottom sheet and scan overlay JS

**Files:**
- Modify: `index.html` (JS section)

- [ ] **Step 1: Find where the FAB click handler is and replace it with sheet logic**

Find in `index.html`:
```js
$('#addRecipeBtn').addEventListener('click',()=>{
  editingId=null;
  pendingScanUrl=null;
  $('#formTitle').textContent='Add Recipe';
  $('#recipeForm').reset();
  $('#formSubmitBtn').textContent='Save Recipe';
  clearRecipePhoto();
  $('#formModal').classList.add('open');
});
```

Replace that entire block with the following:

```js
// ========== ADD SHEET ==========
function openAddSheet(){
  const overlay=$('#addSheetOverlay');
  overlay.classList.add('open');
  lucide.createIcons({attrs:{class:''},nameAttr:'data-lucide'});
  overlay.addEventListener('click',function closeOnBg(e){
    if(e.target===overlay){closeAddSheet();overlay.removeEventListener('click',closeOnBg);}
  });
}
function closeAddSheet(){
  $('#addSheetOverlay').classList.remove('open');
}

$('#addCenterBtn').addEventListener('click',openAddSheet);
$('#sheetCancel').addEventListener('click',closeAddSheet);

function openScanOverlay(mode){
  closeAddSheet();
  // Trigger the existing mode button so all its side-effects run
  $$('.scan-mode-btn').forEach(b=>{if(b.dataset.mode===mode)b.click();});
  $('#panel-scan').classList.add('open');
  lucide.createIcons({attrs:{class:''},nameAttr:'data-lucide'});
}
function closeScanOverlay(){
  $('#panel-scan').classList.remove('open');
}

$('#sheetAddManual').addEventListener('click',()=>{
  closeAddSheet();
  editingId=null;
  pendingScanUrl=null;
  $('#formTitle').textContent='Add Recipe';
  $('#recipeForm').reset();
  $('#formSubmitBtn').textContent='Save Recipe';
  clearRecipePhoto();
  $('#formModal').classList.add('open');
});
$('#sheetScanPhoto').addEventListener('click',()=>openScanOverlay('identify'));
$('#sheetInstagram').addEventListener('click',()=>openScanOverlay('instagram'));
$('#scanOverlayClose').addEventListener('click',closeScanOverlay);
```

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: wire add-sheet and scan overlay JS"
```

---

### Task 9: Remove stale scan tab JS references

**Files:**
- Modify: `index.html` (JS section)

The existing scan mode toggle JS block (around `$$('.scan-mode-btn').forEach`) fires independently and remains valid — it handles the in-panel toggle buttons. No changes needed there.

- [ ] **Step 1: Check for any remaining references to the removed scan tab button**

Search `index.html` for `data-tab="scan"` — it should appear zero times after Task 2. If any JS references remain (e.g. `currentTab==='scan'`), remove or update them.

- [ ] **Step 2: Check for `.fab` class references in JS**

Search `index.html` for `'.fab'` or `$('.fab')` — should appear zero times after Task 7. Remove any remaining references.

- [ ] **Step 3: Commit (if any changes were needed)**

```bash
git add index.html
git commit -m "chore: remove stale scan tab and FAB JS references"
```

---

### Task 10: Manual smoke test

No automated tests exist in this project. Verify all flows manually by running the dev server.

- [ ] **Step 1: Start the server**

```bash
cd /Users/andrewdean/Desktop/Claude\ Work/DanisBook
node server.js
```
Open `http://localhost:8080` in a browser (or on device via local IP).

- [ ] **Step 2: Verify tab bar**

- [ ] 4 tabs visible: Recipes, Grocery, Planner, Settings
- [ ] Center button is a raised circle in accent color with a + icon and "Add" label
- [ ] No Scan tab visible
- [ ] No floating + button on the Recipes screen
- [ ] Switching between the 4 tabs works normally (slide animation, active state)

- [ ] **Step 3: Verify bottom sheet**

- [ ] Tap center button → sheet slides up from bottom with dim overlay
- [ ] Sheet shows: "Add a Recipe" title, three options, Cancel row
- [ ] Tap outside sheet → sheet dismisses
- [ ] Tap Cancel → sheet dismisses

- [ ] **Step 4: Verify Add Manually flow**

- [ ] Tap center button → tap "Add Manually" → sheet closes → add-recipe form opens

- [ ] **Step 5: Verify Scan or Photo flow**

- [ ] Tap center button → tap "Scan or Photo" → sheet closes → scan overlay opens in Identify mode
- [ ] Mode toggle shows "Identify" as active
- [ ] Back arrow closes the scan overlay, returns to previous tab

- [ ] **Step 6: Verify From Instagram flow**

- [ ] Tap center button → tap "From Instagram" → sheet closes → scan overlay opens in Instagram mode
- [ ] Mode toggle shows "Instagram" as active, Instagram input section is visible
- [ ] Back arrow closes the scan overlay

- [ ] **Step 7: Verify Settings version**

- [ ] Navigate to Settings → version number reads 1.9
- [ ] What's New shows v1.9 entry at top

- [ ] **Step 8: Final commit**

```bash
git add index.html server.js
git commit -m "feat: v1.9 — center add button with bottom sheet"
```
