/**
 * ==============================================================================
 * AL MUSLIM GROUP - INDUSTRIAL MONITOR & DIGITAL SIGNAGE DASHBOARD
 * Core Engine: Dual Module Architecture (Finishing Floor & Fabric Store)
 * Multi-Row Excel Delimiter Engine, Auto-Scroll Manager, Notice Overlay & KPI Engine
 * Centralized Real-Time LAN Multi-PC Synchronization Engine (SSE & Central Storage)
 * ==============================================================================
 */

// Application State
let currentModule = 'finishing'; // 'finishing' | 'fabric'
let finishingData = null;        // Blank initial state
let fabricData = null;           // Blank initial state

let finishingFilterMode = 'ALL'; // 'ALL' | 'Active' | 'High Eff' | 'Line Off'
let finishingSearchTerm = '';
let fabricFilterMode = 'ALL';    // 'ALL' | 'Running' | 'Shortage'
let fabricSearchTerm = '';

// Active Diagnostic Drawer State (Line IDs expanded)
const expandedDiagnostics = new Set();

// Central Host Server & Real-time LAN Sync State
let serverSyncVersion = 0;
let lastServerSyncTime = null;
let isLanSyncConnected = false;
let sseEventSource = null;
let pollSyncInterval = null;
let hostLanAddresses = [];

// Notice & Poster Timing Settings (Default: 20s interval, 15s display duration)
let posterIntervalSeconds = parseInt(localStorage.getItem('al_muslim_poster_interval') || '20', 10);
if (isNaN(posterIntervalSeconds) || posterIntervalSeconds < 5) posterIntervalSeconds = 20;

let noticeDurationSeconds = parseInt(localStorage.getItem('al_muslim_notice_duration') || '15', 10);
if (isNaN(noticeDurationSeconds) || noticeDurationSeconds < 3) noticeDurationSeconds = 15;

let noticeTimerSeconds = posterIntervalSeconds;
let isNoticeOverlayShowing = false;
let posterImagesList = ["notice.jpg"];
let activePosterIndex = 0;
let noticeCountdownInterval = null;
let noticeOverlayInterval = null;
let posterTimeRemaining = noticeDurationSeconds;

// ==============================================================================
// 1. APPLICATION INITIALIZATION
// ==============================================================================
window.addEventListener('DOMContentLoaded', () => {
  startLiveClock();
  fetchPostersList();
  loadStoredDataFromStorage();
  loadTimingSettingsIntoUI();

  // Initialize active module view
  switchModuleTab('finishing', false);

  // Start notice timer with configured interval
  applyTimingSettings();

  // Initialize Real-Time Central LAN Multi-PC Synchronization
  initLanSync();

  // Global Keybindings (ESC closes overlays)
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (isNoticeOverlayShowing) dismissPosterSlideshow();
      closeAdminModal();
    }
  });

  // Handle window resize for auto-scroll recalculation
  window.addEventListener('resize', () => {
    AutoScrollManager.handleResize();
  });
});

// ==============================================================================
// 2. LIVE CLOCK
// ==============================================================================
function startLiveClock() {
  const clockEl = document.getElementById('liveClockDisplay');
  function tick() {
    const now = new Date();
    const opts = { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true };
    if (clockEl) clockEl.textContent = now.toLocaleTimeString('en-US', opts);
  }
  tick();
  setInterval(tick, 1000);
}

// ==============================================================================
// 3. STORAGE & DATA PERSISTENCE
// ==============================================================================
function loadStoredDataFromStorage() {
  const storedFin = localStorage.getItem('al_muslim_finishing_data');
  if (storedFin) {
    try {
      finishingData = JSON.parse(storedFin);
    } catch (e) {
      console.warn('Corrupt finishing data in localStorage, resetting to blank.', e);
      finishingData = null;
    }
  }

  const storedFab = localStorage.getItem('al_muslim_fabric_data');
  if (storedFab) {
    try {
      fabricData = JSON.parse(storedFab);
    } catch (e) {
      console.warn('Corrupt fabric data in localStorage, resetting to blank.', e);
      fabricData = null;
    }
  }
}

async function clearCurrentModuleData() {
  const select = document.getElementById('modalReportTypeSelect');
  const type = select ? select.value : currentModule;

  if (type === 'finishing') {
    localStorage.removeItem('al_muslim_finishing_data');
    finishingData = null;
    renderFinishingModule();
  } else {
    localStorage.removeItem('al_muslim_fabric_data');
    fabricData = null;
    renderFabricModule();
  }

  // Broadcast reset across all LAN monitors
  try {
    await fetch('/api/data/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ module: type })
    });
  } catch (err) {
    console.warn('Could not reset on server:', err);
  }

  showModalFeedback('Module reset to blank state and synchronized across LAN.', 'info');
  setTimeout(() => {
    closeAdminModal();
  }, 600);
}

// ==============================================================================
// 4. MODULE SWITCHER (FINISHING FLOOR vs FABRIC STORE)
// ==============================================================================
function switchModuleTab(tabName, shouldBroadcast = false) {
  currentModule = tabName;

  const btnFinishing = document.getElementById('tabBtnFinishing');
  const btnFabric = document.getElementById('tabBtnFabric');

  const kpiFinishing = document.getElementById('finishingKpiBar');
  const kpiFabric = document.getElementById('fabricKpiBar');

  const modFinishing = document.getElementById('finishingFloorModule');
  const modFabric = document.getElementById('fabricStoreModule');

  if (tabName === 'finishing') {
    if (btnFinishing) btnFinishing.className = 'seg-tab-btn active';
    if (btnFabric) btnFabric.className = 'seg-tab-btn';

    if (kpiFinishing) kpiFinishing.classList.remove('hidden');
    if (kpiFabric) kpiFabric.classList.add('hidden');

    if (modFinishing) modFinishing.classList.remove('hidden');
    if (modFabric) modFabric.classList.add('hidden');

    renderFinishingModule();
    AutoScrollManager.init(document.getElementById('hourlyLinesScrollViewport'));
  } else {
    if (btnFinishing) btnFinishing.className = 'seg-tab-btn';
    if (btnFabric) btnFabric.className = 'seg-tab-btn active';

    if (kpiFinishing) kpiFinishing.classList.add('hidden');
    if (kpiFabric) kpiFabric.classList.remove('hidden');

    if (modFinishing) modFinishing.classList.add('hidden');
    if (modFabric) modFabric.classList.remove('hidden');

    renderFabricModule();
    AutoScrollManager.init(document.getElementById('fabricTableScrollViewport'));
  }

  const modalSelect = document.getElementById('modalReportTypeSelect');
  if (modalSelect) {
    modalSelect.value = tabName;
    onModalReportTypeChange(tabName);
  }

  if (shouldBroadcast && isLanSyncConnected) {
    fetch('/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentModule: tabName })
    }).catch(() => {});
  }
}

// ==============================================================================
// 5. DATA TOKENIZER & CELL VALUE CLASSIFIER
// ==============================================================================
function cleanStr(val) {
  if (val === undefined || val === null) return '';
  return String(val)
    .replace(/\u00A0/g, ' ')               // non-breaking space
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // zero-width spaces
    .trim();
}

/**
 * Universal Quote-Aware Delimiter Engine
 * Preserves all columns, handles embedded newlines in cells, escaped quotes,
 * tabs and comma delimiters without displacing column positions.
 */
function tokenizeTableData(text) {
  if (!text || !text.trim()) return [];
  const rows = [];
  let currentRow = [];
  let currentCell = '';
  let insideQuotes = false;
  let i = 0;
  const len = text.length;

  // Detect primary delimiter: tab vs comma in the first 1000 characters
  const sample = text.slice(0, 1000);
  const tabCount = (sample.match(/\t/g) || []).length;
  const commaCount = (sample.match(/,/g) || []).length;
  const delimiter = tabCount >= commaCount ? '\t' : ',';

  while (i < len) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (insideQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          // Escaped quote: "" -> "
          currentCell += '"';
          i += 2;
          continue;
        } else {
          // Closing quote
          insideQuotes = false;
          i++;
          continue;
        }
      } else {
        currentCell += char;
        i++;
        continue;
      }
    } else {
      if (char === '"') {
        insideQuotes = true;
        i++;
        continue;
      } else if (char === delimiter) {
        currentRow.push(cleanStr(currentCell));
        currentCell = '';
        i++;
        continue;
      } else if (char === '\r') {
        if (nextChar === '\n') i++; // Skip \r\n
        currentRow.push(cleanStr(currentCell));
        if (currentRow.some(c => c.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentCell = '';
        i++;
        continue;
      } else if (char === '\n') {
        currentRow.push(cleanStr(currentCell));
        if (currentRow.some(c => c.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentCell = '';
        i++;
        continue;
      } else {
        currentCell += char;
        i++;
        continue;
      }
    }
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(cleanStr(currentCell));
    if (currentRow.some(c => c.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

/**
 * Classifies cell value types:
 * Distinguishes valid zero (0), blank/empty, and formula errors (#REF!, #DIV/0!, etc.)
 */
function classifyCell(val) {
  const s = cleanStr(val);
  if (!s) return { type: 'BLANK', value: null, display: '---' };
  if (/^#REF!/i.test(s)) return { type: 'ERROR_REF', value: null, display: '#REF!' };
  if (/^#DIV\/0!/i.test(s)) return { type: 'ERROR_DIV0', value: null, display: '#DIV/0!' };
  if (/^#(VALUE!|N\/A|NAME\?|NULL!)/i.test(s)) return { type: 'ERROR_OTHER', value: null, display: s };
  if (/^#+$/.test(s)) return { type: 'OVERFLOW', value: null, display: '###' };
  if (s === '-') return { type: 'DASH', value: null, display: '-' };

  const numClean = s.replace(/,/g, '').replace(/%/g, '');
  const n = parseFloat(numClean);
  if (!isNaN(n)) {
    return { type: 'NUMBER', value: n, display: s };
  }
  return { type: 'STRING', value: s, display: s };
}

/**
 * Formats Excel serial dates (e.g. 45351) into readable dates
 */
function formatExcelDate(val) {
  const c = classifyCell(val);
  if (c.type === 'NUMBER' && c.value > 30000 && c.value < 65000) {
    const date = new Date(Math.round((c.value - 25569) * 86400 * 1000));
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  return c.display;
}

// ==============================================================================
// 6. PHASE 2 & 3: MULTI-ROW FINISHING FLOOR PARSER & RECONCILIATION
// ==============================================================================
function parseFinishingFloorData(rawText) {
  const rows = tokenizeTableData(rawText);
  if (rows.length === 0) throw new Error('No rows found in pasted content.');

  // Header detection: scan up to 10 rows
  let headerRowIndex = -1;
  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    const rowJoined = rows[r].join(' ').toLowerCase();
    if (rowJoined.includes('buyer') && (rowJoined.includes('line') || rowJoined.includes('style') || rowJoined.includes('target') || rowJoined.includes('manpower'))) {
      headerRowIndex = r;
      break;
    }
  }

  // Column map to dynamically resolve
  const colMap = {
    line: -1,
    buyer: -1,
    style: -1,
    process: -1,
    manual: -1,
    manpower: -1,
    smv: -1,
    target100: -1,
    effTarget: -1,
    day: -1,
    targetHr: -1,
    hourly: Array(11).fill(-1),
    totalProd: -1,
    runningWH: -1,
    target80: -1,
    shortEx: -1,
    efficiency: -1,
    remarks: -1
  };

  const hourLabels = [
    /^1st\b/i, /^2nd\b/i, /^3rd\b/i, /^4th\b/i, /^5th\b/i,
    /^6th\b/i, /^7th\b/i, /^8th\b/i, /^9th\b/i, /^10th\b/i, /^11\s*th\b/i
  ];

  if (headerRowIndex >= 0) {
    const h1 = rows[headerRowIndex] || [];
    const h2 = rows[headerRowIndex + 1] || [];
    const h3 = rows[headerRowIndex + 2] || [];
    const maxCols = Math.max(h1.length, h2.length, h3.length);

    for (let c = 0; c < maxCols; c++) {
      const cell1 = (h1[c] || '').toLowerCase().replace(/\s+/g, ' ');
      const cell2 = (h2[c] || '').toLowerCase().replace(/\s+/g, ' ');
      const cell3 = (h3[c] || '').toLowerCase().replace(/\s+/g, ' ');
      const combo = `${cell1} ${cell2} ${cell3}`.trim();

      if (colMap.line === -1 && (/^line$/i.test(cell1) || /^line\s*no/i.test(cell1) || /^line$/i.test(cell2))) colMap.line = c;
      else if (colMap.buyer === -1 && /buyer/i.test(combo)) colMap.buyer = c;
      else if (colMap.style === -1 && /style\s*name|style/i.test(combo)) colMap.style = c;
      else if (colMap.process === -1 && /procsess\s*name|process\s*name|process|item/i.test(combo)) colMap.process = c;
      else if (colMap.manual === -1 && (/thread\s*cut\s*man|thread\s*cut|manual/i.test(combo) && !/running/i.test(combo))) colMap.manual = c;
      else if (colMap.manpower === -1 && (/ttl\s*manpower|total\s*manpower|^manpower|ttl\s*mp/i.test(combo))) colMap.manpower = c;
      else if (colMap.smv === -1 && (/^smv\b/i.test(cell1) || /^smv\b/i.test(cell2) || /^smv\b/i.test(cell3))) colMap.smv = c;
      else if (colMap.target100 === -1 && /100%\s*tgt|100%\s*target/i.test(combo)) colMap.target100 = c;
      else if (colMap.effTarget === -1 && /eff\s*tgt\s*%|eff\s*tgt/i.test(combo)) colMap.effTarget = c;
      else if (colMap.day === -1 && (/^day$/i.test(cell1) || /^day$/i.test(cell2) || /^day$/i.test(cell3))) colMap.day = c;
      else if (colMap.targetHr === -1 && /target\s*\/\s*hour|target\/hr|tgt\/hr/i.test(combo)) colMap.targetHr = c;
      else if (colMap.totalProd === -1 && /total\s*production|total\s*prod/i.test(combo)) colMap.totalProd = c;
      else if (colMap.runningWH === -1 && /running\s*w\/h|running\s*wh|w\/h/i.test(combo)) colMap.runningWH = c;
      else if (colMap.target80 === -1 && /total\s*80%tgt|80%tgt|80%\s*target|total\s*target/i.test(combo)) colMap.target80 = c;
      else if (colMap.shortEx === -1 && /short\s*\/\s*ex|short\/ex|variance|diff/i.test(combo)) colMap.shortEx = c;
      else if (colMap.efficiency === -1 && /line\s*efficiency|floor\s*efficiency/i.test(combo)) colMap.efficiency = c;
      else if (colMap.remarks === -1 && /remarks|remark|comments/i.test(combo)) colMap.remarks = c;

      // Hourly columns (exclude LINE IN / LINE OUT columns that have '1hr' etc.)
      const isLineInOut = /line\s*in|line\s*out/i.test(cell1) || /line\s*in|line\s*out/i.test(cell2);
      if (!isLineInOut) {
        for (let h = 0; h < 11; h++) {
          if (colMap.hourly[h] === -1) {
            if (hourLabels[h].test(cell1) || hourLabels[h].test(cell2) || hourLabels[h].test(cell3)) {
              colMap.hourly[h] = c;
              break;
            }
          }
        }
      }
    }
  }

  // Contiguous hourly resolution if some slots missing
  if (colMap.hourly[0] === -1 && colMap.targetHr >= 0) {
    for (let h = 0; h < 11; h++) colMap.hourly[h] = colMap.targetHr + 1 + h;
  } else if (colMap.hourly[0] >= 0) {
    for (let h = 1; h < 11; h++) {
      if (colMap.hourly[h] === -1) colMap.hourly[h] = colMap.hourly[0] + h;
    }
  }

  // Standard safe fallbacks
  if (colMap.line === -1) colMap.line = 0;
  if (colMap.buyer === -1) colMap.buyer = 1;
  if (colMap.style === -1) colMap.style = 2;

  // Determine starting data row
  let startDataRow = headerRowIndex >= 0 ? headerRowIndex + 1 : 0;
  while (startDataRow < rows.length) {
    const rJoined = rows[startDataRow].join(' ').toLowerCase();
    if (rJoined.includes('1st') || rJoined.includes('production hour') || rJoined.includes('buriganga finishing')) {
      startDataRow++;
    } else {
      break;
    }
  }

  const linesList = [];
  const seenLines = new Set();

  for (let r = startDataRow; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length === 0) continue;

    const lineRaw = row[colMap.line] || '';
    if (/total|grand|floor|summary|average/i.test(lineRaw)) continue;

    const match = lineRaw.match(/^(?:Line\s*[-_]?\s*)?([A-Za-z0-9]{1,3})$/i);
    if (!match) continue;

    const lineLetter = match[1].toUpperCase();
    if (lineLetter.length > 2 && isNaN(Number(lineLetter))) continue;
    if (seenLines.has(lineLetter)) continue;

    const buyerCell = colMap.buyer >= 0 ? classifyCell(row[colMap.buyer]) : { display: '---', value: null, type: 'BLANK' };
    const styleCell = colMap.style >= 0 ? classifyCell(row[colMap.style]) : { display: '---', value: null, type: 'BLANK' };
    const procCell = colMap.process >= 0 ? classifyCell(row[colMap.process]) : { display: '---', value: null, type: 'BLANK' };
    const remarksCell = colMap.remarks >= 0 ? classifyCell(row[colMap.remarks]) : { display: '', value: '', type: 'BLANK' };

    const manualCell = colMap.manual >= 0 ? classifyCell(row[colMap.manual]) : { display: null, value: null, type: 'BLANK' };
    const mpCell = colMap.manpower >= 0 ? classifyCell(row[colMap.manpower]) : { display: null, value: null, type: 'BLANK' };
    const smvCell = colMap.smv >= 0 ? classifyCell(row[colMap.smv]) : { display: null, value: null, type: 'BLANK' };
    const tgt100Cell = colMap.target100 >= 0 ? classifyCell(row[colMap.target100]) : { display: null, value: null, type: 'BLANK' };
    const effTgtCell = colMap.effTarget >= 0 ? classifyCell(row[colMap.effTarget]) : { display: null, value: null, type: 'BLANK' };
    const dayCell = colMap.day >= 0 ? classifyCell(row[colMap.day]) : { display: null, value: null, type: 'BLANK' };
    const tgtHrCell = colMap.targetHr >= 0 ? classifyCell(row[colMap.targetHr]) : { display: null, value: null, type: 'BLANK' };
    const runWHCell = colMap.runningWH >= 0 ? classifyCell(row[colMap.runningWH]) : { display: null, value: null, type: 'BLANK' };
    const totProdCell = colMap.totalProd >= 0 ? classifyCell(row[colMap.totalProd]) : { display: null, value: null, type: 'BLANK' };
    const tgt80Cell = colMap.target80 >= 0 ? classifyCell(row[colMap.target80]) : { display: null, value: null, type: 'BLANK' };
    const shortExCell = colMap.shortEx >= 0 ? classifyCell(row[colMap.shortEx]) : { display: null, value: null, type: 'BLANK' };
    const effCell = colMap.efficiency >= 0 ? classifyCell(row[colMap.efficiency]) : { display: null, value: null, type: 'BLANK' };

    // 11 Hourly outputs
    const hourlyOutputs = [];
    let hourlySum = 0;
    for (let h = 0; h < 11; h++) {
      const colIdx = colMap.hourly[h];
      const rawVal = colIdx >= 0 && colIdx < row.length ? row[colIdx] : '';
      const c = classifyCell(rawVal);
      if (c.type === 'NUMBER') {
        hourlyOutputs.push(c.value);
        hourlySum += c.value;
      } else {
        hourlyOutputs.push(0);
      }
    }

    let effTarget = effTgtCell.value !== null ? effTgtCell.value : null;
    if (effTarget !== null && effTarget > 0 && effTarget <= 1.5) effTarget = effTarget * 100;

    let lineEff = effCell.value !== null ? effCell.value : null;
    if (lineEff !== null && lineEff > 0 && lineEff <= 1.5) lineEff = lineEff * 100;

    const reportedProd = totProdCell.type === 'NUMBER' ? totProdCell.value : null;
    const finalProd = reportedProd !== null ? reportedProd : (hourlySum > 0 ? hourlySum : (totProdCell.type === 'BLANK' ? 0 : null));
    const prodDiscrepancy = (reportedProd !== null && hourlySum > 0 && reportedProd !== hourlySum);

    const reportedTarget80 = tgt80Cell.type === 'NUMBER' ? tgt80Cell.value : null;
    const reportedShortEx = shortExCell.type === 'NUMBER' ? shortExCell.value : (reportedTarget80 !== null && finalProd !== null ? finalProd - reportedTarget80 : null);

    const isLineOff = /line off|off/i.test(remarksCell.display) ||
                      /line off|off/i.test(buyerCell.display) ||
                      (finalProd === 0 && (reportedTarget80 === 0 || reportedTarget80 === null) && tgtHrCell.value === 0);

    const status = isLineOff ? 'Line Off' : (lineEff !== null && lineEff >= 75 ? 'High Efficiency' : 'Running');

    linesList.push({
      line: lineLetter,
      buyer: buyerCell.display === '0' ? '---' : buyerCell.display,
      style: styleCell.display === '0' ? '---' : styleCell.display,
      process: procCell.display === '0' ? '---' : procCell.display,
      remarks: remarksCell.display,
      manual: manualCell.value,
      manpower: mpCell.value,
      smv: smvCell.value !== null ? Number(smvCell.value.toFixed(2)) : null,
      target100: tgt100Cell.value !== null ? Math.round(tgt100Cell.value) : null,
      effTarget: effTarget !== null ? Number(effTarget.toFixed(1)) : null,
      day: dayCell.value,
      targetHr: tgtHrCell.value !== null ? Math.round(tgtHrCell.value) : null,
      hourly: hourlyOutputs,
      hourlySum: hourlySum,
      totalProd: finalProd !== null ? Math.round(finalProd) : 0,
      reportedProd: reportedProd,
      prodDiscrepancy: prodDiscrepancy,
      runningWH: runWHCell.value,
      target80: reportedTarget80 !== null ? Math.round(reportedTarget80) : 0,
      shortEx: reportedShortEx !== null ? Math.round(reportedShortEx) : 0,
      efficiency: lineEff !== null ? Number(lineEff.toFixed(1)) : (reportedTarget80 > 0 && finalProd > 0 ? Number(((finalProd / reportedTarget80) * (effTarget || 80)).toFixed(1)) : 0),
      status: status,
      hasFormulaErrors: buyerCell.type.startsWith('ERROR') || totProdCell.type.startsWith('ERROR') || tgt80Cell.type.startsWith('ERROR') || effCell.type.startsWith('ERROR'),
      rawRow: row
    });

    seenLines.add(lineLetter);
  }

  // Dashboard Summary Calculations
  let totalTarget = 0, totalProd = 0, totalMP = 0, totalTargetHr = 0;
  let activeLinesCount = 0;
  let smvWeightedSum = 0;

  linesList.forEach(l => {
    if (l.status !== 'Line Off') {
      totalTarget += l.target80;
      totalProd += l.totalProd;
      if (l.manpower !== null) totalMP += l.manpower;
      if (l.targetHr !== null) totalTargetHr += l.targetHr;
      if (l.smv !== null && l.totalProd > 0) smvWeightedSum += l.smv * l.totalProd;
      activeLinesCount++;
    }
  });

  const overallEff = totalTarget > 0 ? (totalProd / totalTarget) * 100 : 0;
  const avgSMV = totalProd > 0 ? (smvWeightedSum / totalProd) : 0;

  return {
    date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
    activeCount: activeLinesCount,
    totalLines: linesList.length,
    totals: {
      target: totalTarget,
      production: totalProd,
      variance: totalProd - totalTarget,
      efficiency: Number(overallEff.toFixed(1)),
      manpower: totalMP,
      targetHr: totalTargetHr,
      avgSMV: Number(avgSMV.toFixed(2))
    },
    colMap: colMap,
    lines: linesList
  };
}

// ==============================================================================
// 7. PHASE 2 & 3: FABRIC STORE DATA PARSER
// ==============================================================================
function parseFabricStoreData(rawText) {
  const rows = tokenizeTableData(rawText);
  if (rows.length === 0) throw new Error('No rows found in pasted content.');

  let headerRowIndex = -1;
  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    const rowJoined = rows[r].join(' ').toLowerCase();
    if (rowJoined.includes('buyer') && (rowJoined.includes('style') || rowJoined.includes('supplier') || rowJoined.includes('fabric'))) {
      headerRowIndex = r;
      break;
    }
  }

  const colMap = {
    sl: 0,
    buyer: 1,
    style: 2,
    supplier: 3,
    ref: 4,
    color: 5,
    fabricType: 6,
    opening: 7,
    received: 8,
    lastRcvdDate: 9,
    issued: 10,
    lastIssueDate: 11,
    balance: 12,
    rolls: 13,
    rack: 14,
    merch: 15,
    status: 16
  };

  if (headerRowIndex >= 0) {
    const h = rows[headerRowIndex];
    for (let c = 0; c < h.length; c++) {
      const header = h[c].toLowerCase().replace(/\s+/g, ' ');
      if (/sl\s*no|^sl\b/i.test(header)) colMap.sl = c;
      else if (/^buyer/i.test(header)) colMap.buyer = c;
      else if (/^style/i.test(header)) colMap.style = c;
      else if (/supplier/i.test(header)) colMap.supplier = c;
      else if (/our\s*ref|ref\s*no/i.test(header)) colMap.ref = c;
      else if (/color/i.test(header)) colMap.color = c;
      else if (/fabric|type\s*of\s*fabric/i.test(header)) colMap.fabricType = c;
      else if (/opening/i.test(header)) colMap.opening = c;
      else if (/rcvd\s*qty|received/i.test(header)) colMap.received = c;
      else if (/last\s*rcvd/i.test(header)) colMap.lastRcvdDate = c;
      else if (/issue\s*qty|issued/i.test(header)) colMap.issued = c;
      else if (/last\s*issue/i.test(header)) colMap.lastIssueDate = c;
      else if (/balance/i.test(header)) colMap.balance = c;
      else if (/roll/i.test(header)) colMap.rolls = c;
      else if (/rack/i.test(header)) colMap.rack = c;
      else if (/merch/i.test(header)) colMap.merch = c;
      else if (/status/i.test(header)) colMap.status = c;
    }
  }

  const startRow = headerRowIndex >= 0 ? headerRowIndex + 1 : 0;
  const items = [];

  for (let r = startRow; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length < 4) continue;

    const firstCell = row[0] || '';
    if (/total|grand|summary/i.test(firstCell)) continue;

    const opening = classifyCell(row[colMap.opening]).value || 0;
    const received = classifyCell(row[colMap.received]).value || 0;
    const issued = classifyCell(row[colMap.issued]).value || 0;
    const balance = classifyCell(row[colMap.balance]).value || (opening + received - issued);
    const rolls = classifyCell(row[colMap.rolls]).value || 1;
    const statusRaw = cleanStr(row[colMap.status]);

    items.push({
      sl: row[colMap.sl] || String(items.length + 1),
      buyer: cleanStr(row[colMap.buyer]) || '---',
      style: cleanStr(row[colMap.style]) || '---',
      supplier: cleanStr(row[colMap.supplier]) || '---',
      ref: cleanStr(row[colMap.ref]) || '---',
      color: cleanStr(row[colMap.color]) || '---',
      fabricType: cleanStr(row[colMap.fabricType]).replace(/\s+/g, ' ') || '---',
      opening: opening,
      received: received,
      lastRcvdDate: formatExcelDate(row[colMap.lastRcvdDate]),
      issued: issued,
      lastIssueDate: formatExcelDate(row[colMap.lastIssueDate]),
      balance: balance,
      rolls: Math.round(rolls),
      rack: cleanStr(row[colMap.rack]) || '---',
      merch: cleanStr(row[colMap.merch]) || '---',
      status: statusRaw || (balance < 1000 ? 'Shortage' : 'Running'),
      rawRow: row
    });
  }

  return items;
}

// ==============================================================================
// 8. PHASE 4: RENDERER FOR FINISHING FLOOR VIEW
// ==============================================================================
function renderFinishingModule() {
  const blankState = document.getElementById('finishingBlankState');
  const scrollViewport = document.getElementById('hourlyLinesScrollViewport');
  const container = document.getElementById('hourlyLinesContainer');
  const summaryFooter = document.getElementById('finishingSummaryFooter');

  if (!finishingData || !Array.isArray(finishingData.lines) || finishingData.lines.length === 0) {
    if (blankState) blankState.classList.remove('hidden');
    if (scrollViewport) scrollViewport.classList.add('hidden');
    if (summaryFooter) summaryFooter.classList.add('hidden');
    if (container) container.innerHTML = '';

    document.getElementById('kpiFinProd').textContent = '0';
    document.getElementById('kpiFinVarianceTag').textContent = '0 pcs variance';
    document.getElementById('kpiFinPercentTag').textContent = '0% of target';
    document.getElementById('kpiFinTarget').textContent = '0';
    document.getElementById('kpiFinHourlySub').textContent = '0 pcs/hr';
    document.getElementById('kpiFinEff').textContent = '0.0%';
    document.getElementById('kpiFinEffBadge').textContent = '--';
    document.getElementById('kpiFinSmvSub').textContent = 'Avg SMV: 0.00 min';
    document.getElementById('kpiFinActiveLines').textContent = '0 / 0';
    document.getElementById('kpiFinMpSub').textContent = '0 Total Manpower';

    updateLineFilterCountBadges([]);
    AutoScrollManager.stop();
    return;
  }

  if (blankState) blankState.classList.add('hidden');
  if (scrollViewport) scrollViewport.classList.remove('hidden');
  if (summaryFooter) summaryFooter.classList.remove('hidden');

  const lines = finishingData.lines;
  const totals = finishingData.totals || {};

  // 1. Top 4 KPI Cards
  document.getElementById('kpiFinProd').textContent = totals.production.toLocaleString();
  const variance = totals.variance || (totals.production - totals.target);
  const varTag = document.getElementById('kpiFinVarianceTag');
  if (varTag) {
    varTag.textContent = `${variance >= 0 ? '+' : ''}${variance.toLocaleString()} pcs variance`;
    varTag.className = `font-bold ${variance >= 0 ? 'text-emerald-700' : 'text-rose-600'}`;
  }

  const tgtPct = totals.target > 0 ? Math.round((totals.production / totals.target) * 100) : 0;
  document.getElementById('kpiFinPercentTag').textContent = `${tgtPct}% of target`;

  document.getElementById('kpiFinTarget').textContent = totals.target.toLocaleString();
  document.getElementById('kpiFinHourlySub').textContent = `${(totals.targetHr || 0).toLocaleString()} pcs/hr`;

  document.getElementById('kpiFinEff').textContent = `${(totals.efficiency || 0).toFixed(1)}%`;
  const effBadge = document.getElementById('kpiFinEffBadge');
  if (effBadge) {
    if (totals.efficiency >= 75) {
      effBadge.textContent = 'Top Eff';
      effBadge.className = 'bg-emerald-100 text-emerald-800 text-xs font-bold px-2.5 py-0.5 rounded-full';
    } else if (totals.efficiency >= 50) {
      effBadge.textContent = 'Normal';
      effBadge.className = 'bg-amber-100 text-amber-800 text-xs font-bold px-2.5 py-0.5 rounded-full';
    } else {
      effBadge.textContent = 'Below Target';
      effBadge.className = 'bg-rose-100 text-rose-800 text-xs font-bold px-2.5 py-0.5 rounded-full';
    }
  }
  document.getElementById('kpiFinSmvSub').textContent = `Avg SMV: ${(totals.avgSMV || 0).toFixed(2)} min`;

  document.getElementById('kpiFinActiveLines').textContent = `${finishingData.activeCount} / ${finishingData.totalLines}`;
  document.getElementById('kpiFinMpSub').textContent = `${(totals.manpower || 0).toLocaleString()} Total Manpower`;
  document.getElementById('kpiFinShiftDate').textContent = finishingData.date || 'Today';

  // 2. Footer Summary Strip
  document.getElementById('sumActiveLines').textContent = `${finishingData.activeCount} Lines`;
  document.getElementById('sumTotalMP').textContent = `${totals.manpower} MP`;
  document.getElementById('sumTargetHr').textContent = `${totals.targetHr} pcs/hr`;
  document.getElementById('sumTarget80').textContent = `${totals.target.toLocaleString()} pcs`;
  document.getElementById('sumTotalProd').textContent = `${totals.production.toLocaleString()} pcs`;
  const sumVar = document.getElementById('sumVariance');
  if (sumVar) {
    sumVar.textContent = `${variance >= 0 ? '+' : ''}${variance.toLocaleString()} pcs`;
    sumVar.className = variance >= 0 ? 'text-emerald-700 font-bold' : 'text-rose-600 font-bold';
  }
  document.getElementById('sumFloorEff').textContent = `${totals.efficiency.toFixed(1)}%`;

  // 3. Filter Buttons Badges
  updateLineFilterCountBadges(lines);

  // 4. Render Line Cards
  renderHourlyLineCards(lines);

  // 5. Trigger AutoScroll check
  AutoScrollManager.init(scrollViewport);
}

function updateLineFilterCountBadges(lines) {
  const allCount = lines.length;
  const activeCount = lines.filter(l => l.status !== 'Line Off').length;
  const highCount = lines.filter(l => l.efficiency >= 75 && l.status !== 'Line Off').length;
  const offCount = lines.filter(l => l.status === 'Line Off').length;

  const elAll = document.getElementById('cntLineAll');
  const elActive = document.getElementById('cntLineActive');
  const elHigh = document.getElementById('cntLineHigh');
  const elOff = document.getElementById('cntLineOff');

  if (elAll) elAll.textContent = allCount;
  if (elActive) elActive.textContent = activeCount;
  if (elHigh) elHigh.textContent = highCount;
  if (elOff) elOff.textContent = offCount;
}

function setLineFilter(filterMode) {
  finishingFilterMode = filterMode;

  const btnAll = document.getElementById('fltLineAll');
  const btnActive = document.getElementById('fltLineActive');
  const btnHigh = document.getElementById('fltLineHigh');
  const btnOff = document.getElementById('fltLineOff');

  [btnAll, btnActive, btnHigh, btnOff].forEach(b => {
    if (b) b.className = 'px-3 py-1 rounded text-slate-600 hover:text-slate-900 cursor-pointer';
  });

  if (filterMode === 'ALL' && btnAll) btnAll.className = 'px-3 py-1 rounded bg-white text-emerald-950 font-bold shadow-xs cursor-pointer';
  if (filterMode === 'Active' && btnActive) btnActive.className = 'px-3 py-1 rounded bg-white text-emerald-950 font-bold shadow-xs cursor-pointer';
  if (filterMode === 'High Eff' && btnHigh) btnHigh.className = 'px-3 py-1 rounded bg-white text-emerald-950 font-bold shadow-xs cursor-pointer';
  if (filterMode === 'Line Off' && btnOff) btnOff.className = 'px-3 py-1 rounded bg-white text-emerald-950 font-bold shadow-xs cursor-pointer';

  if (finishingData && finishingData.lines) {
    renderHourlyLineCards(finishingData.lines);
    AutoScrollManager.resetPosition();
  }
}

function filterFinishingLines() {
  const input = document.getElementById('finishingSearchInput');
  finishingSearchTerm = input ? input.value.trim().toLowerCase() : '';
  if (finishingData && finishingData.lines) {
    renderHourlyLineCards(finishingData.lines);
    AutoScrollManager.resetPosition();
  }
}

function toggleLineDiagnostics(lineLetter) {
  if (expandedDiagnostics.has(lineLetter)) {
    expandedDiagnostics.delete(lineLetter);
  } else {
    expandedDiagnostics.add(lineLetter);
  }
  if (finishingData && finishingData.lines) {
    renderHourlyLineCards(finishingData.lines);
  }
}

function renderHourlyLineCards(lines) {
  const container = document.getElementById('hourlyLinesContainer');
  if (!container) return;

  const filtered = lines.filter(line => {
    if (finishingFilterMode === 'Active' && line.status === 'Line Off') return false;
    if (finishingFilterMode === 'High Eff' && (line.efficiency < 75 || line.status === 'Line Off')) return false;
    if (finishingFilterMode === 'Line Off' && line.status !== 'Line Off') return false;

    if (finishingSearchTerm) {
      const match = line.line.toLowerCase().includes(finishingSearchTerm) ||
                    line.buyer.toLowerCase().includes(finishingSearchTerm) ||
                    line.style.toLowerCase().includes(finishingSearchTerm) ||
                    line.process.toLowerCase().includes(finishingSearchTerm) ||
                    line.remarks.toLowerCase().includes(finishingSearchTerm);
      if (!match) return false;
    }

    return true;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="p-10 text-center bg-white rounded-xl border border-slate-200 shadow-xs">
        <p class="text-sm font-bold text-slate-700">No production lines match current filter criteria.</p>
        <p class="text-xs text-slate-400 mt-1">Try resetting the filter button to 'ALL' or clearing the search box.</p>
      </div>
    `;
    return;
  }

  const hourLabels = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th', '11th'];

  container.innerHTML = filtered.map(line => {
    const isLineOff = line.status === 'Line Off';
    const prod = line.totalProd || 0;
    const target = line.target80 || 0;
    const progressPct = target > 0 ? Math.min(100, Math.round((prod / target) * 100)) : 0;

    let progBarClass = 'bar-grad-green';
    let effStrokeColor = '#10B981';
    let varianceClass = 'text-emerald-700 font-bold';

    if (progressPct < 70) {
      progBarClass = 'bar-grad-red';
      effStrokeColor = '#EF4444';
      varianceClass = 'text-rose-600 font-bold';
    } else if (progressPct < 90) {
      progBarClass = 'bar-grad-amber';
      effStrokeColor = '#F59E0B';
      varianceClass = 'text-amber-600 font-bold';
    }

    if (isLineOff) {
      progBarClass = 'bar-grad-gray';
      effStrokeColor = '#94A3B8';
      varianceClass = 'text-slate-400 font-medium';
    }

    const hourlyPillsHtml = hourLabels.map((lbl, idx) => {
      const val = line.hourly[idx] !== undefined ? line.hourly[idx] : 0;
      const hasVal = val > 0;
      return `
        <div class="hour-pill-box ${hasVal ? 'active-output' : 'empty-output'}">
          <span class="hour-pill-tag">${lbl}</span>
          <span class="hour-pill-value tabular-nums">${hasVal ? val : '-'}</span>
        </div>
      `;
    }).join('');

    const effClamped = Math.min(100, Math.max(0, line.efficiency));
    const dashArray = `${effClamped}, 100`;

    const isExpanded = expandedDiagnostics.has(line.line);

    return `
      <div class="hourly-line-card ${isLineOff ? 'line-off' : ''} p-3.5 flex flex-col gap-2.5">
        
        <!-- TOP ROW: Line Identity, Status Badges & Complete Source Metadata Strip -->
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-2">
          
          <!-- Line Badge & Identity -->
          <div class="flex items-center gap-3">
            <div class="line-badge-square">
              <span class="text-[10px] tracking-wider text-emerald-200">LINE</span>
              <span class="text-xl font-black leading-none">${line.line}</span>
            </div>
            <div>
              <div class="flex items-center gap-2">
                <span class="font-black text-sm md:text-base text-slate-900 tracking-tight">${line.buyer}</span>
                ${isLineOff ? '<span class="px-2 py-0.5 rounded bg-slate-200 text-slate-600 text-[10px] font-black uppercase">LINE OFF</span>' : (line.efficiency >= 75 ? '<span class="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase">TOP EFF</span>' : '')}
                ${line.day !== null ? `<span class="text-[11px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600">Day ${line.day}</span>` : ''}
                ${line.hasFormulaErrors ? '<span class="px-2 py-0.5 rounded bg-rose-100 text-rose-800 text-[10px] font-bold">⚠️ Source Formula Error</span>' : ''}
              </div>
              <div class="flex items-center gap-2 mt-0.5">
                <span class="font-extrabold text-xs md:text-sm text-[#0F4C3A]" title="${line.style}">${line.style}</span>
                ${line.process && line.process !== '---' ? `<span class="text-xs text-slate-400 font-medium">| ${line.process}</span>` : ''}
              </div>
            </div>
          </div>

          <!-- All Source Metadata Chips (Total MP, Manual, SMV, Target/Hr, 100% Target, Running W/H, Remarks) -->
          <div class="flex flex-wrap items-center gap-2 text-xs font-semibold">
            <div class="bg-slate-50 border border-slate-200/80 px-2.5 py-1 rounded-lg text-slate-700">
              <span class="text-slate-400 text-[10px] uppercase font-bold block leading-none mb-0.5">MP / Manual</span>
              <span class="font-black text-slate-900">${line.manpower !== null ? line.manpower + ' MP' : '--'}</span> <span class="text-slate-400">(${line.manual !== null ? line.manual + ' Cut' : '--'})</span>
            </div>
            <div class="bg-slate-50 border border-slate-200/80 px-2.5 py-1 rounded-lg text-slate-700">
              <span class="text-slate-400 text-[10px] uppercase font-bold block leading-none mb-0.5">SMV</span>
              <span class="font-black text-slate-900">${line.smv !== null ? line.smv + 'm' : '--'}</span>
            </div>
            <div class="bg-slate-50 border border-slate-200/80 px-2.5 py-1 rounded-lg text-slate-700">
              <span class="text-slate-400 text-[10px] uppercase font-bold block leading-none mb-0.5">Target / Hr</span>
              <span class="font-black text-slate-900">${line.targetHr !== null ? line.targetHr + ' pcs' : '--'}</span>
            </div>
            <div class="bg-slate-50 border border-slate-200/80 px-2.5 py-1 rounded-lg text-slate-700">
              <span class="text-slate-400 text-[10px] uppercase font-bold block leading-none mb-0.5">100% Tgt / Eff Tgt</span>
              <span class="font-black text-slate-900">${line.target100 !== null ? line.target100 : '--'}</span> <span class="text-slate-400">(${line.effTarget !== null ? line.effTarget + '%' : '--'})</span>
            </div>
            <div class="bg-slate-50 border border-slate-200/80 px-2.5 py-1 rounded-lg text-slate-700">
              <span class="text-slate-400 text-[10px] uppercase font-bold block leading-none mb-0.5">Running W/H</span>
              <span class="font-black text-slate-900">${line.runningWH !== null ? line.runningWH + ' hrs' : '--'}</span>
            </div>
            ${line.remarks ? `
            <div class="bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg text-amber-900 max-w-[200px] truncate" title="${line.remarks}">
              <span class="text-amber-600 text-[10px] uppercase font-bold block leading-none mb-0.5">Remarks</span>
              <span class="font-semibold text-xs">${line.remarks}</span>
            </div>` : ''}
            
            <!-- Raw Diagnostics Toggle Button -->
            <button onclick="toggleLineDiagnostics('${line.line}')" class="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-bold rounded-lg border border-slate-300 transition cursor-pointer">
              ${isExpanded ? '▲ Hide Raw' : '▼ Raw Details'}
            </button>
          </div>

        </div>

        <!-- MIDDLE ROW: 11 Hourly Cells Grid + Target vs Output Bar + Circular Efficiency Gauge -->
        <div class="flex flex-wrap lg:flex-nowrap items-center justify-between gap-4">
          
          <!-- Hourly Output 11-Cell Grid -->
          <div class="flex-1 w-full lg:w-auto">
            <div class="hourly-cells-grid">
              ${hourlyPillsHtml}
            </div>
          </div>

          <!-- Progress Bar & Target Achievement Summary -->
          <div class="w-full lg:w-64 flex flex-col gap-1.5 bg-slate-50/70 p-2.5 rounded-xl border border-slate-200/60 flex-shrink-0">
            <div class="flex items-center justify-between text-xs font-bold font-mono">
              <span class="text-slate-600">Total: <strong class="text-slate-900 text-sm">${prod.toLocaleString()}</strong> pcs</span>
              <span class="text-slate-400">Tgt: ${target.toLocaleString()}</span>
            </div>
            <div class="target-prog-track">
              <div class="target-prog-bar ${progBarClass}" style="width: ${progressPct}%;"></div>
            </div>
            <div class="flex items-center justify-between text-[11px] font-semibold">
              <span class="${varianceClass}">${line.shortEx >= 0 ? '+' : ''}${line.shortEx.toLocaleString()} pcs diff</span>
              <span class="text-slate-500">${progressPct}% of target</span>
            </div>
          </div>

          <!-- Circular Radial Efficiency Badge -->
          <div class="flex items-center gap-2.5 pl-1 flex-shrink-0">
            <div class="relative w-14 h-14 flex items-center justify-center">
              <svg class="w-14 h-14" viewBox="0 0 36 36">
                <path class="gauge-circle-bg" stroke-width="3.5" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                <path class="gauge-circle-progress" stroke="${effStrokeColor}" stroke-dasharray="${dashArray}" stroke-dashoffset="0" stroke-width="3.5" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
              </svg>
              <div class="absolute inset-0 flex flex-col items-center justify-center">
                <span class="font-black text-xs md:text-sm text-slate-900 leading-none">${line.efficiency.toFixed(0)}%</span>
                <span class="text-[8px] font-bold text-slate-400 uppercase leading-none mt-0.5">Eff</span>
              </div>
            </div>
          </div>

        </div>

        <!-- EXPANDABLE RAW DATA & DIAGNOSTICS DRAWER (Preserves 100% of imported columns) -->
        ${isExpanded ? `
        <div class="mt-2 pt-2 border-t border-slate-200/80 bg-slate-50/90 rounded-lg p-3 text-xs">
          <div class="font-bold text-slate-700 uppercase tracking-wider text-[11px] mb-2 flex items-center justify-between">
            <span>Raw Column Diagnostics (Line ${line.line})</span>
            <span class="text-slate-400 font-mono">Hourly Sum: ${line.hourlySum} pcs | Reported: ${line.reportedProd !== null ? line.reportedProd : '---'} pcs</span>
          </div>
          <div class="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2 text-[11px] font-mono">
            ${(line.rawRow || []).map((val, idx) => `
              <div class="bg-white p-1.5 rounded border border-slate-200">
                <span class="text-slate-400 block text-[9px]">Col ${idx}</span>
                <span class="font-bold text-slate-800 truncate block" title="${val}">${val || '<empty>'}</span>
              </div>
            `).join('')}
          </div>
        </div>
        ` : ''}

      </div>
    `;
  }).join('');
}

// ==============================================================================
// 9. PHASE 4: RENDERER FOR FABRIC STORE VIEW
// ==============================================================================
function renderFabricModule() {
  const blankState = document.getElementById('fabricBlankState');
  const scrollViewport = document.getElementById('fabricTableScrollViewport');
  const tbody = document.getElementById('fabricTableBody');

  if (!fabricData || !Array.isArray(fabricData) || fabricData.length === 0) {
    if (blankState) blankState.classList.remove('hidden');
    if (scrollViewport) scrollViewport.classList.add('hidden');
    if (tbody) tbody.innerHTML = '';

    document.getElementById('kpiFabBalance').textContent = '0';
    document.getElementById('kpiFabReceived').textContent = '0';
    document.getElementById('kpiFabIssued').textContent = '0';
    document.getElementById('kpiFabRolls').textContent = '0';
    document.getElementById('kpiFabRacksSub').textContent = '0 Styles Registered';

    AutoScrollManager.stop();
    return;
  }

  if (blankState) blankState.classList.add('hidden');
  if (scrollViewport) scrollViewport.classList.remove('hidden');

  let totalBal = 0, totalRcvd = 0, totalIssued = 0, totalRolls = 0;
  const rackSet = new Set();

  fabricData.forEach(item => {
    totalBal += item.balance || 0;
    totalRcvd += item.received || 0;
    totalIssued += item.issued || 0;
    totalRolls += item.rolls || 0;
    if (item.rack && item.rack !== '---') rackSet.add(item.rack);
  });

  document.getElementById('kpiFabBalance').textContent = totalBal.toLocaleString();
  document.getElementById('kpiFabReceived').textContent = totalRcvd.toLocaleString();
  document.getElementById('kpiFabIssued').textContent = totalIssued.toLocaleString();
  document.getElementById('kpiFabRolls').textContent = totalRolls.toLocaleString();
  document.getElementById('kpiFabRacksSub').textContent = `Across ${rackSet.size} Active Racks`;

  const elAll = document.getElementById('cntFabAll');
  if (elAll) elAll.textContent = fabricData.length;

  renderFabricTableRows(fabricData);
  AutoScrollManager.init(scrollViewport);
}

function setFabricStatusFilter(status) {
  fabricFilterMode = status;

  const btnAll = document.getElementById('fltFabAll');
  const btnRun = document.getElementById('fltFabRunning');
  const btnShort = document.getElementById('fltFabShortage');

  [btnAll, btnRun, btnShort].forEach(b => {
    if (b) b.className = 'px-3 py-1 rounded text-slate-600 hover:text-slate-900 cursor-pointer';
  });

  if (status === 'ALL' && btnAll) btnAll.className = 'px-3 py-1 rounded bg-white text-emerald-950 font-bold shadow-xs cursor-pointer';
  if (status === 'Running' && btnRun) btnRun.className = 'px-3 py-1 rounded bg-white text-emerald-950 font-bold shadow-xs cursor-pointer';
  if (status === 'Shortage' && btnShort) btnShort.className = 'px-3 py-1 rounded bg-white text-emerald-950 font-bold shadow-xs cursor-pointer';

  if (fabricData) {
    renderFabricTableRows(fabricData);
    AutoScrollManager.resetPosition();
  }
}

function filterFabricTable() {
  const input = document.getElementById('fabricSearchInput');
  fabricSearchTerm = input ? input.value.trim().toLowerCase() : '';
  if (fabricData) {
    renderFabricTableRows(fabricData);
    AutoScrollManager.resetPosition();
  }
}

function renderFabricTableRows(data) {
  const tbody = document.getElementById('fabricTableBody');
  if (!tbody) return;

  const filtered = data.filter(item => {
    if (fabricFilterMode !== 'ALL' && item.status !== fabricFilterMode) return false;
    if (fabricSearchTerm) {
      const match = item.buyer.toLowerCase().includes(fabricSearchTerm) ||
                    item.style.toLowerCase().includes(fabricSearchTerm) ||
                    item.supplier.toLowerCase().includes(fabricSearchTerm) ||
                    item.rack.toLowerCase().includes(fabricSearchTerm) ||
                    item.color.toLowerCase().includes(fabricSearchTerm);
      if (!match) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="13" class="text-center py-8 text-slate-400 font-semibold">
          No inventory rows match filter criteria.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map(row => {
    let statusBadge = `<span class="bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded text-[11px]">${row.status}</span>`;
    if (row.status === 'Shortage') {
      statusBadge = `<span class="bg-rose-100 text-rose-800 font-bold px-2 py-0.5 rounded text-[11px]">Shortage</span>`;
    }

    return `
      <tr class="border-b border-slate-100 hover:bg-emerald-50/40 transition">
        <td class="py-2.5 px-3.5 font-mono text-slate-400 text-center">${row.sl}</td>
        <td class="py-2.5 px-3.5 font-extrabold text-slate-900">${row.buyer}</td>
        <td class="py-2.5 px-3.5 font-bold text-[#0F4C3A]">${row.style}</td>
        <td class="py-2.5 px-3.5 text-slate-600">${row.supplier}</td>
        <td class="py-2.5 px-3.5 font-mono text-slate-500">${row.ref}</td>
        <td class="py-2.5 px-3.5 text-slate-800">${row.color}</td>
        <td class="py-2.5 px-3.5 text-slate-600">${row.fabricType}</td>
        <td class="py-2.5 px-3.5 text-right font-mono font-semibold">${row.opening.toLocaleString()}</td>
        <td class="py-2.5 px-3.5 text-center font-mono text-slate-500">${row.lastRcvdDate}</td>
        <td class="py-2.5 px-3.5 text-right font-mono font-black text-slate-900">${row.balance.toLocaleString()}</td>
        <td class="py-2.5 px-3.5 text-center font-mono font-bold text-[#0F4C3A]">${row.rolls.toLocaleString()}</td>
        <td class="py-2.5 px-3.5 text-center font-mono font-bold text-slate-700">${row.rack}</td>
        <td class="py-2.5 px-3.5 text-center">${statusBadge}</td>
      </tr>
    `;
  }).join('');
}

// ==============================================================================
// 10. PHASE 5: ROCK-SOLID KIOSK AUTO-SCROLL MANAGER
// ==============================================================================
const AutoScrollManager = {
  viewport: null,
  state: 'IDLE', // 'IDLE' | 'SCROLLING' | 'PAUSED_BOTTOM' | 'RESETTING' | 'PAUSED_TOP' | 'USER_INTERACTION'
  speed: 1.0,
  rafId: null,
  pauseTimer: null,
  interactionTimer: null,

  init(viewportEl) {
    this.stop();
    this.viewport = viewportEl;
    if (!this.viewport) return;

    // Remove any previously bound listeners by re-adding with bound handlers
    this.boundInteraction = () => this.handleUserInteraction();
    this.viewport.removeEventListener('wheel', this.boundInteraction);
    this.viewport.removeEventListener('touchstart', this.boundInteraction);
    this.viewport.removeEventListener('touchmove', this.boundInteraction);
    this.viewport.removeEventListener('mousedown', this.boundInteraction);

    this.viewport.addEventListener('wheel', this.boundInteraction, { passive: true });
    this.viewport.addEventListener('touchstart', this.boundInteraction, { passive: true });
    this.viewport.addEventListener('touchmove', this.boundInteraction, { passive: true });
    this.viewport.addEventListener('mousedown', this.boundInteraction);

    this.checkAndStart();
  },

  checkAndStart() {
    if (!this.viewport || this.viewport.classList.contains('hidden')) {
      this.state = 'IDLE';
      this.updateIndicator();
      return;
    }

    const maxScroll = this.viewport.scrollHeight - this.viewport.clientHeight;
    if (maxScroll <= 5) {
      this.viewport.scrollTop = 0;
      this.state = 'IDLE';
      this.updateIndicator();
      return;
    }

    if (this.speed === 0) {
      this.state = 'USER_PAUSED';
      this.updateIndicator();
      return;
    }

    this.state = 'SCROLLING';
    this.updateIndicator();
    this.startLoop();
  },

  startLoop() {
    if (this.rafId) cancelAnimationFrame(this.rafId);

    const step = () => {
      if (this.state === 'SCROLLING' && this.viewport && this.speed > 0) {
        const maxScroll = this.viewport.scrollHeight - this.viewport.clientHeight;

        if (maxScroll > 5) {
          this.viewport.scrollTop += this.speed;

          if (this.viewport.scrollTop >= maxScroll - 1) {
            // Reached bottom of all production line cards!
            // Pause 3.5 seconds so viewers can easily read bottom cards
            this.state = 'PAUSED_BOTTOM';
            this.updateIndicator();

            if (this.pauseTimer) clearTimeout(this.pauseTimer);
            this.pauseTimer = setTimeout(() => {
              if (this.state === 'PAUSED_BOTTOM') {
                this.state = 'RESETTING';
                this.viewport.scrollTo({ top: 0, behavior: 'smooth' });

                // Allow 800ms for smooth scroll, then pause 1.5s at top
                this.pauseTimer = setTimeout(() => {
                  this.state = 'PAUSED_TOP';
                  this.pauseTimer = setTimeout(() => {
                    this.state = 'SCROLLING';
                    this.updateIndicator();
                    this.startLoop();
                  }, 1500);
                }, 800);
              }
            }, 3500);
            return;
          }
        }
      }

      if (this.state === 'SCROLLING') {
        this.rafId = requestAnimationFrame(step);
      }
    };

    this.rafId = requestAnimationFrame(step);
  },

  handleUserInteraction() {
    if (this.state === 'IDLE' || this.speed === 0) return;
    this.state = 'USER_INTERACTION';
    this.updateIndicator();

    if (this.interactionTimer) clearTimeout(this.interactionTimer);
    // Automatically resume scrolling 5 seconds after user finishes interaction
    this.interactionTimer = setTimeout(() => {
      if (this.state === 'USER_INTERACTION') {
        this.state = 'SCROLLING';
        this.updateIndicator();
        this.startLoop();
      }
    }, 5000);
  },

  setSpeed(newSpeed) {
    this.speed = parseFloat(newSpeed) || 0;
    if (this.speed === 0) {
      this.state = 'USER_PAUSED';
      if (this.rafId) cancelAnimationFrame(this.rafId);
    } else {
      this.checkAndStart();
    }
    this.updateIndicator();
  },

  resetPosition() {
    if (this.viewport) {
      this.viewport.scrollTop = 0;
    }
    this.checkAndStart();
  },

  handleResize() {
    this.checkAndStart();
  },

  stop() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    if (this.pauseTimer) clearTimeout(this.pauseTimer);
    if (this.interactionTimer) clearTimeout(this.interactionTimer);
    this.rafId = null;
    this.pauseTimer = null;
    this.interactionTimer = null;
    this.state = 'IDLE';
    this.updateIndicator();
  },

  updateIndicator() {
    const dot = document.getElementById('scrollStatusDot');
    if (dot) {
      if (this.state === 'SCROLLING') {
        dot.className = 'pulse-dot';
      } else {
        dot.className = 'pulse-dot paused';
      }
    }
  }
};

function changeScrollSpeed(speedVal) {
  AutoScrollManager.setSpeed(speedVal);
}

// ==============================================================================
// 11. 1-MINUTE NOTICE SLIDESHOW OVERLAY ("DHOPASH" & "THOPASH")
// ==============================================================================
function fetchPostersList() {
  fetch('/api/posters')
    .then(res => res.json())
    .then(data => {
      if (Array.isArray(data) && data.length > 0) {
        const seen = new Set();
        const unique = [];
        data.forEach(fn => {
          const base = fn.replace(/\.[^/.]+$/, '').toLowerCase();
          if (!seen.has(base)) {
            seen.add(base);
            unique.push(fn);
          }
        });
        posterImagesList = unique.length > 0 ? unique : ["notice.jpg"];
      }
    })
    .catch(() => {
      posterImagesList = ["notice.jpg"];
    });
}

// ==============================================================================
// 11. CENTRAL LAN MULTI-PC REAL-TIME SYNCHRONIZATION ENGINE
// ==============================================================================
function initLanSync() {
  // 1. Initial fetch from central host server
  fetchServerDashboardData();

  // 2. Fetch LAN network IP addresses for multi-device URLs
  fetchLanNetworkInfo();

  // 3. Connect to live Server-Sent Events (SSE) broadcast
  setupLanEventSource();

  // 4. Background polling failsafe (every 8s) in case SSE disconnects
  clearInterval(pollSyncInterval);
  pollSyncInterval = setInterval(pollServerDashboardData, 8000);
}

function updateLanBadge(status, text) {
  const badge = document.getElementById('lanStatusBadge');
  const dot = document.getElementById('lanStatusDot');
  const txt = document.getElementById('lanStatusText');
  const modalText = document.getElementById('modalLanStatusText');

  if (!badge || !dot || !txt) return;

  if (status === 'synced') {
    isLanSyncConnected = true;
    dot.className = 'w-2 h-2 rounded-full bg-emerald-400 animate-pulse';
    txt.textContent = text || 'LAN Synced';
    badge.className = 'flex items-center gap-1.5 bg-emerald-950/70 hover:bg-emerald-900 px-2.5 py-1.5 rounded-lg border border-emerald-700/60 text-xs font-semibold shadow-xs transition cursor-pointer';
    if (modalText) modalText.textContent = 'Connected to Central Host Server (Multi-PC Sync Active)';
  } else if (status === 'syncing') {
    dot.className = 'w-2 h-2 rounded-full bg-amber-400 animate-ping';
    txt.textContent = text || 'Syncing...';
    badge.className = 'flex items-center gap-1.5 bg-amber-950/70 hover:bg-amber-900 px-2.5 py-1.5 rounded-lg border border-amber-700/60 text-xs font-semibold shadow-xs transition cursor-pointer';
  } else if (status === 'reconnecting') {
    isLanSyncConnected = false;
    dot.className = 'w-2 h-2 rounded-full bg-amber-500 animate-pulse';
    txt.textContent = text || 'Connecting...';
    badge.className = 'flex items-center gap-1.5 bg-amber-950/70 hover:bg-amber-900 px-2.5 py-1.5 rounded-lg border border-amber-700/60 text-xs font-semibold shadow-xs transition cursor-pointer';
    if (modalText) modalText.textContent = 'Connecting to Central Host Server...';
  } else {
    isLanSyncConnected = false;
    dot.className = 'w-2 h-2 rounded-full bg-rose-500';
    txt.textContent = text || 'Offline (Local)';
    badge.className = 'flex items-center gap-1.5 bg-rose-950/70 hover:bg-rose-900 px-2.5 py-1.5 rounded-lg border border-rose-700/60 text-xs font-semibold shadow-xs transition cursor-pointer';
    if (modalText) modalText.textContent = 'Offline Mode (Local Browser Storage Only)';
  }
}

function setupLanEventSource() {
  if (typeof EventSource === 'undefined') {
    console.warn('Browser does not support Server-Sent Events. Relying on polling fallback.');
    return;
  }

  if (sseEventSource) {
    sseEventSource.close();
    sseEventSource = null;
  }

  try {
    sseEventSource = new EventSource('/api/events');

    sseEventSource.addEventListener('connected', (e) => {
      try {
        const payload = JSON.parse(e.data);
        updateLanBadge('synced');
        if (payload && payload.data) {
          handleServerSync(payload.data);
        }
      } catch (err) {
        console.error('Error parsing SSE connected payload:', err);
      }
    });

    sseEventSource.addEventListener('data_updated', (e) => {
      try {
        const payload = JSON.parse(e.data);
        updateLanBadge('syncing', 'Updating...');
        setTimeout(() => updateLanBadge('synced'), 600);
        if (payload && payload.data) {
          handleServerSync(payload.data);
        }
      } catch (err) {
        console.error('Error parsing SSE data_updated payload:', err);
      }
    });

    sseEventSource.addEventListener('data_reset', (e) => {
      try {
        const payload = JSON.parse(e.data);
        updateLanBadge('syncing', 'Resetting...');
        setTimeout(() => updateLanBadge('synced'), 600);
        if (payload && payload.data) {
          handleServerReset(payload);
        }
      } catch (err) {
        console.error('Error parsing SSE data_reset payload:', err);
      }
    });

    sseEventSource.onopen = () => {
      updateLanBadge('synced');
    };

    sseEventSource.onerror = () => {
      updateLanBadge('reconnecting');
    };
  } catch (err) {
    console.warn('SSE initialization failed:', err);
  }
}

async function fetchServerDashboardData() {
  try {
    const res = await fetch('/api/data', { cache: 'no-store' });
    if (res.ok) {
      const json = await res.json();
      if (json && json.data) {
        handleServerSync(json.data);
        updateLanBadge('synced');
      }
    }
  } catch (err) {
    console.warn('Initial server fetch failed, using local data:', err);
    updateLanBadge('reconnecting');
  }
}

async function pollServerDashboardData() {
  try {
    const res = await fetch('/api/data', { cache: 'no-store' });
    if (res.ok) {
      const json = await res.json();
      if (json && json.data && (json.data.version || 0) > serverSyncVersion) {
        handleServerSync(json.data);
      }
      if (!isLanSyncConnected) updateLanBadge('synced');
    }
  } catch {
    if (isLanSyncConnected) updateLanBadge('reconnecting');
  }
}

function handleServerSync(serverState) {
  if (!serverState) return;

  const incomingVer = serverState.version || 0;
  serverSyncVersion = Math.max(serverSyncVersion, incomingVer);
  lastServerSyncTime = serverState.lastUpdated || new Date().toISOString();

  const modalSyncTime = document.getElementById('modalLanLastSyncText');
  if (modalSyncTime) {
    try {
      const dt = new Date(lastServerSyncTime);
      modalSyncTime.textContent = `Synced: ${dt.toLocaleTimeString()}`;
    } catch {
      modalSyncTime.textContent = 'Synced: Just now';
    }
  }

  let needsRerender = false;

  // 1. Sync Finishing Data
  if (serverState.finishingData !== undefined) {
    const incomingStr = JSON.stringify(serverState.finishingData);
    const currentStr = JSON.stringify(finishingData);
    if (incomingStr !== currentStr) {
      finishingData = serverState.finishingData;
      if (finishingData) {
        localStorage.setItem('al_muslim_finishing_data', incomingStr);
      } else {
        localStorage.removeItem('al_muslim_finishing_data');
      }
      needsRerender = true;
    }
  }

  // 2. Sync Fabric Data
  if (serverState.fabricData !== undefined) {
    const incomingStr = JSON.stringify(serverState.fabricData);
    const currentStr = JSON.stringify(fabricData);
    if (incomingStr !== currentStr) {
      fabricData = serverState.fabricData;
      if (fabricData) {
        localStorage.setItem('al_muslim_fabric_data', incomingStr);
      } else {
        localStorage.removeItem('al_muslim_fabric_data');
      }
      needsRerender = true;
    }
  }

  // 3. Sync Active Module View if requested
  if (serverState.currentModule && serverState.currentModule !== currentModule) {
    currentModule = serverState.currentModule;
    needsRerender = true;
  }

  // 4. Sync Timing Settings
  if (serverState.timingSettings && typeof serverState.timingSettings === 'object') {
    const newInterval = parseInt(serverState.timingSettings.posterIntervalSeconds, 10);
    const newDuration = parseInt(serverState.timingSettings.noticeDurationSeconds, 10);

    let timingChanged = false;
    if (!isNaN(newInterval) && newInterval >= 5 && newInterval !== posterIntervalSeconds) {
      posterIntervalSeconds = newInterval;
      localStorage.setItem('al_muslim_poster_interval', String(newInterval));
      timingChanged = true;
    }
    if (!isNaN(newDuration) && newDuration >= 3 && newDuration !== noticeDurationSeconds) {
      noticeDurationSeconds = newDuration;
      localStorage.setItem('al_muslim_notice_duration', String(newDuration));
      timingChanged = true;
    }

    if (timingChanged) {
      applyTimingSettings();
      loadTimingSettingsIntoUI();
    }
  }

  if (needsRerender) {
    switchModuleTab(currentModule, false);
  }
}

function handleServerReset(payload) {
  const mod = payload.module;
  if (mod === 'finishing' || mod === 'all') {
    finishingData = null;
    localStorage.removeItem('al_muslim_finishing_data');
    if (currentModule === 'finishing') renderFinishingModule();
  }
  if (mod === 'fabric' || mod === 'all') {
    fabricData = null;
    localStorage.removeItem('al_muslim_fabric_data');
    if (currentModule === 'fabric') renderFabricModule();
  }
}

async function fetchLanNetworkInfo() {
  try {
    const res = await fetch('/api/network');
    if (res.ok) {
      const json = await res.json();
      if (json && json.lanAddresses) {
        hostLanAddresses = json.lanAddresses;
        populateLanUrls(json.port || 3000, json.lanAddresses);
      }
    }
  } catch (err) {
    console.warn('Could not fetch LAN network info:', err);
  }
}

function populateLanUrls(port, addresses) {
  const container = document.getElementById('lanUrlsContainer');
  const primaryDisplay = document.getElementById('primaryLanUrlDisplay');
  if (!container) return;

  if (!addresses || addresses.length === 0) {
    if (primaryDisplay) primaryDisplay.textContent = `http://localhost:${port}`;
    return;
  }

  const primary = addresses[0];
  const primaryUrl = `http://${primary.address}:${port}`;
  if (primaryDisplay) primaryDisplay.textContent = primaryUrl;

  container.innerHTML = addresses.map((net) => `
    <div class="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-xs">
      <div class="flex items-center gap-2">
        <span class="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[10px] uppercase">${net.interface}</span>
        <span class="font-mono font-bold text-slate-800 text-xs">http://${net.address}:${port}</span>
      </div>
      <button onclick="copyToClipboard('http://${net.address}:${port}', this)" class="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded font-sans text-xs font-semibold cursor-pointer">
        Copy
      </button>
    </div>
  `).join('');
}

function copyToClipboard(text, btnEl) {
  navigator.clipboard.writeText(text).then(() => {
    if (btnEl) {
      const orig = btnEl.textContent;
      btnEl.textContent = '✓ Copied!';
      btnEl.classList.add('bg-emerald-100', 'text-emerald-800');
      setTimeout(() => {
        btnEl.textContent = orig;
        btnEl.classList.remove('bg-emerald-100', 'text-emerald-800');
      }, 1500);
    }
  }).catch(() => {
    prompt('Copy this URL:', text);
  });
}

function copyPrimaryLanUrl() {
  const el = document.getElementById('primaryLanUrlDisplay');
  if (el) copyToClipboard(el.textContent, event?.target);
}

// ==============================================================================
// 12. CONFIGURABLE NOTICE TIMING CONTROLS & SLIDESHOW OVERLAY
// ==============================================================================
function onNoticeBadgeClicked(event) {
  if (event && (event.altKey || event.shiftKey)) {
    triggerNoticeImmediately();
  } else {
    openTimingSettingsModal();
  }
}

function openTimingSettingsModal() {
  openAdminModal('timing');
}

function onPosterIntervalPresetChange(val) {
  const customInput = document.getElementById('settingPosterIntervalCustom');
  if (!customInput) return;
  if (val === 'custom') {
    customInput.classList.remove('hidden');
    customInput.value = posterIntervalSeconds;
    customInput.focus();
  } else {
    customInput.classList.add('hidden');
  }
  updateTimingSummaryPill();
}

function onNoticeDurationPresetChange(val) {
  const customInput = document.getElementById('settingNoticeDurationCustom');
  if (!customInput) return;
  if (val === 'custom') {
    customInput.classList.remove('hidden');
    customInput.value = noticeDurationSeconds;
    customInput.focus();
  } else {
    customInput.classList.add('hidden');
  }
  updateTimingSummaryPill();
}

function updateTimingSummaryPill() {
  const pill = document.getElementById('activeTimingSummaryPill');
  if (!pill) return;
  pill.textContent = `Interval: ${posterIntervalSeconds}s • Duration: ${noticeDurationSeconds}s`;
}

function loadTimingSettingsIntoUI() {
  const intervalSelect = document.getElementById('settingPosterIntervalSelect');
  const intervalCustom = document.getElementById('settingPosterIntervalCustom');
  const durationSelect = document.getElementById('settingNoticeDurationSelect');
  const durationCustom = document.getElementById('settingNoticeDurationCustom');

  if (intervalSelect) {
    const standardIntervals = ['20', '30', '60', '120', '300'];
    if (standardIntervals.includes(String(posterIntervalSeconds))) {
      intervalSelect.value = String(posterIntervalSeconds);
      if (intervalCustom) intervalCustom.classList.add('hidden');
    } else {
      intervalSelect.value = 'custom';
      if (intervalCustom) {
        intervalCustom.classList.remove('hidden');
        intervalCustom.value = posterIntervalSeconds;
      }
    }
  }

  if (durationSelect) {
    const standardDurations = ['5', '10', '15', '20', '30'];
    if (standardDurations.includes(String(noticeDurationSeconds))) {
      durationSelect.value = String(noticeDurationSeconds);
      if (durationCustom) durationCustom.classList.add('hidden');
    } else {
      durationSelect.value = 'custom';
      if (durationCustom) {
        durationCustom.classList.remove('hidden');
        durationCustom.value = noticeDurationSeconds;
      }
    }
  }

  updateTimingSummaryPill();
}

async function saveTimingSettingsFromModal() {
  const intervalSelect = document.getElementById('settingPosterIntervalSelect');
  const intervalCustom = document.getElementById('settingPosterIntervalCustom');
  const durationSelect = document.getElementById('settingNoticeDurationSelect');
  const durationCustom = document.getElementById('settingNoticeDurationCustom');

  let newInterval = 20;
  if (intervalSelect) {
    if (intervalSelect.value === 'custom') {
      newInterval = parseInt(intervalCustom ? intervalCustom.value : '20', 10);
    } else {
      newInterval = parseInt(intervalSelect.value, 10);
    }
  }

  let newDuration = 15;
  if (durationSelect) {
    if (durationSelect.value === 'custom') {
      newDuration = parseInt(durationCustom ? durationCustom.value : '15', 10);
    } else {
      newDuration = parseInt(durationSelect.value, 10);
    }
  }

  // Validate safety limits
  if (isNaN(newInterval) || newInterval < 5) {
    showTimingFeedback('⚠️ Poster Interval must be a number of at least 5 seconds.', 'error');
    return;
  }
  if (isNaN(newDuration) || newDuration < 3) {
    showTimingFeedback('⚠️ Notice Duration must be a number of at least 3 seconds.', 'error');
    return;
  }

  // Save locally
  posterIntervalSeconds = newInterval;
  noticeDurationSeconds = newDuration;
  localStorage.setItem('al_muslim_poster_interval', String(posterIntervalSeconds));
  localStorage.setItem('al_muslim_notice_duration', String(noticeDurationSeconds));

  // Apply to running timers immediately
  applyTimingSettings();
  updateTimingSummaryPill();

  showTimingFeedback(`✓ Timing saved: ${posterIntervalSeconds}s interval / ${noticeDurationSeconds}s duration. Broadcasting to LAN...`, 'success');

  // Broadcast to central server for multi-PC sync
  try {
    await fetch('/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        timingSettings: {
          posterIntervalSeconds,
          noticeDurationSeconds
        }
      })
    });
  } catch (err) {
    console.warn('Could not sync timing to server:', err);
  }

  setTimeout(() => {
    closeAdminModal();
  }, 1000);
}

function showTimingFeedback(msg, type) {
  const el = document.getElementById('modalTimingFeedback');
  if (!el) return;
  el.className = `text-xs p-3 rounded-xl font-medium ${type === 'error' ? 'bg-rose-50 text-rose-800 border border-rose-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'}`;
  el.innerHTML = msg;
  el.classList.remove('hidden');
}

function applyTimingSettings() {
  clearInterval(noticeCountdownInterval);
  if (noticeTimerSeconds > posterIntervalSeconds) {
    noticeTimerSeconds = posterIntervalSeconds;
  }
  const display = document.getElementById('noticeTimerDisplay');
  if (display) {
    const mins = Math.floor(noticeTimerSeconds / 60).toString().padStart(2, '0');
    const secs = (noticeTimerSeconds % 60).toString().padStart(2, '0');
    display.textContent = `${mins}:${secs}`;
  }
  startNoticeCountdown();
}

function startNoticeCountdown() {
  const display = document.getElementById('noticeTimerDisplay');
  clearInterval(noticeCountdownInterval);

  noticeCountdownInterval = setInterval(() => {
    if (isNoticeOverlayShowing) return;

    noticeTimerSeconds--;
    if (noticeTimerSeconds <= 0) {
      noticeTimerSeconds = posterIntervalSeconds;
      triggerNoticePopup();
    }

    const mins = Math.floor(noticeTimerSeconds / 60).toString().padStart(2, '0');
    const secs = (noticeTimerSeconds % 60).toString().padStart(2, '0');
    if (display) display.textContent = `${mins}:${secs}`;
  }, 1000);
}

function triggerNoticeImmediately() {
  noticeTimerSeconds = posterIntervalSeconds;
  triggerNoticePopup();
}

function triggerNoticePopup() {
  if (isNoticeOverlayShowing) return;
  isNoticeOverlayShowing = true;

  const overlay = document.getElementById('posterOverlay');
  const card = document.getElementById('posterCard');
  const img = document.getElementById('posterDisplayImage');
  const countEl = document.getElementById('posterCountdownSeconds');
  const bar = document.getElementById('posterProgressBar');

  if (!overlay || !img) return;

  if (!posterImagesList || posterImagesList.length === 0) {
    posterImagesList = ["notice.jpg"];
  }

  const currentPoster = posterImagesList[activePosterIndex % posterImagesList.length];
  img.src = currentPoster.startsWith('data:') || currentPoster.startsWith('http')
    ? currentPoster
    : `/posters/${currentPoster}`;

  activePosterIndex = (activePosterIndex + 1) % posterImagesList.length;

  if (card) {
    card.classList.remove('animate-thopash');
    card.classList.add('animate-dhopash');
  }
  overlay.classList.add('active');

  posterTimeRemaining = noticeDurationSeconds;
  if (countEl) countEl.textContent = String(posterTimeRemaining);
  if (bar) bar.style.width = '100%';

  clearInterval(noticeOverlayInterval);
  noticeOverlayInterval = setInterval(() => {
    posterTimeRemaining--;
    if (countEl) countEl.textContent = String(posterTimeRemaining);
    if (bar) bar.style.width = `${Math.max(0, (posterTimeRemaining / noticeDurationSeconds) * 100)}%`;

    if (posterTimeRemaining <= 0) {
      clearInterval(noticeOverlayInterval);
      dismissPosterSlideshow();
    }
  }, 1000);
}

function dismissPosterSlideshow() {
  if (!isNoticeOverlayShowing) return;
  clearInterval(noticeOverlayInterval);

  const overlay = document.getElementById('posterOverlay');
  const card = document.getElementById('posterCard');

  if (card) {
    card.classList.remove('animate-dhopash');
    card.classList.add('animate-thopash');
  }

  setTimeout(() => {
    if (overlay) overlay.classList.remove('active');
    if (card) card.classList.remove('animate-thopash');
    isNoticeOverlayShowing = false;
    noticeTimerSeconds = posterIntervalSeconds;
    applyTimingSettings();
  }, 420);
}

function renderFallbackVectorPoster() {
  const img = document.getElementById('posterDisplayImage');
  if (img) {
    img.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600" viewBox="0 0 900 600"><rect fill="%230F4C3A" width="100%" height="100%"/><text fill="%23ffffff" font-family="sans-serif" font-size="34" font-weight="900" x="50%" y="45%" text-anchor="middle">AL MUSLIM GROUP</text><text fill="%23a7f3d0" font-family="sans-serif" font-size="20" font-weight="600" x="50%" y="55%" text-anchor="middle">Buriganga Finishing Floor Notice</text></svg>';
  }
}

// ==============================================================================
// 13. EXCEL COPY-PASTE ADMIN MODAL & TAB CONTROLLER
// ==============================================================================
function switchAdminModalTab(tabId) {
  const tabPaste = document.getElementById('modalTabBtnPaste');
  const tabTiming = document.getElementById('modalTabBtnTiming');
  const tabLan = document.getElementById('modalTabBtnLan');

  const panelPaste = document.getElementById('modalPanelPaste');
  const panelTiming = document.getElementById('modalPanelTiming');
  const panelLan = document.getElementById('modalPanelLan');

  const icon = document.getElementById('modalHeaderIcon');
  const title = document.getElementById('modalHeaderTitle');
  const subtitle = document.getElementById('modalHeaderSubtitle');

  [tabPaste, tabTiming, tabLan].forEach(btn => btn?.classList.remove('active'));
  [panelPaste, panelTiming, panelLan].forEach(panel => panel?.classList.add('hidden'));

  if (tabId === 'timing') {
    if (tabTiming) tabTiming.classList.add('active');
    if (panelTiming) panelTiming.classList.remove('hidden');
    if (icon) icon.textContent = '⏱️';
    if (title) title.textContent = 'Notice & Poster Timing Settings';
    if (subtitle) subtitle.textContent = 'Configurable Popup Intervals & Display Durations';
    loadTimingSettingsIntoUI();
  } else if (tabId === 'lan') {
    if (tabLan) tabLan.classList.add('active');
    if (panelLan) panelLan.classList.remove('hidden');
    if (icon) icon.textContent = '🌐';
    if (title) title.textContent = 'Multi-PC LAN Live Synchronization';
    if (subtitle) subtitle.textContent = 'Central Host Storage • Server-Sent Events Broadcast';
    fetchLanNetworkInfo();
  } else {
    if (tabPaste) tabPaste.classList.add('active');
    if (panelPaste) panelPaste.classList.remove('hidden');
    if (icon) icon.textContent = '📊';
    if (title) title.textContent = 'Paste Excel / Sheets Tabular Data';
    if (subtitle) subtitle.textContent = 'Accurate column index mapper with #REF! elimination';
    const textarea = document.getElementById('modalPasteArea');
    if (textarea) textarea.focus();
  }
}

function openAdminModal(preferredTypeOrTab) {
  const modal = document.getElementById('adminModal');
  if (!modal) return;
  modal.classList.add('active');

  if (preferredTypeOrTab === 'timing' || preferredTypeOrTab === 'lan' || preferredTypeOrTab === 'paste') {
    switchAdminModalTab(preferredTypeOrTab);
  } else {
    switchAdminModalTab('paste');
    const select = document.getElementById('modalReportTypeSelect');
    if (select) {
      select.value = preferredTypeOrTab || currentModule;
      onModalReportTypeChange(select.value);
    }
  }
}

function closeAdminModal() {
  const modal = document.getElementById('adminModal');
  if (modal) {
    modal.classList.remove('active');
  }
  const feedback = document.getElementById('modalParseFeedback');
  if (feedback) feedback.classList.add('hidden');
  const timingFeedback = document.getElementById('modalTimingFeedback');
  if (timingFeedback) timingFeedback.classList.add('hidden');
}

function clearModalPasteArea() {
  const textarea = document.getElementById('modalPasteArea');
  if (textarea) textarea.value = '';
}

function onModalReportTypeChange(type) {
  const helper = document.getElementById('modalFormatHelper');
  if (!helper) return;

  if (type === 'finishing') {
    helper.innerHTML = 'Expected columns: <code>Line | Buyer | Style | Process | Manpower | SMV | Day | Target/Hr | 1st - 11th Hours | Total Prod | Target | Eff% | Remarks</code>';
  } else {
    helper.innerHTML = 'Expected columns: <code>SL | Buyer | Style | Supplier | Ref No | Color | Fabric Construction | Opening | Last Rcvd | Balance | Rolls | Rack | Status</code>';
  }
}

function showModalFeedback(msg, type) {
  const el = document.getElementById('modalParseFeedback');
  if (!el) return;
  el.classList.remove('hidden', 'bg-rose-50', 'text-rose-800', 'border-rose-200', 'bg-emerald-50', 'text-emerald-800', 'border-emerald-200', 'bg-blue-50', 'text-blue-800', 'border-blue-200');

  if (type === 'error') {
    el.classList.add('bg-rose-50', 'text-rose-800', 'border', 'border-rose-200');
  } else if (type === 'success') {
    el.classList.add('bg-emerald-50', 'text-emerald-800', 'border', 'border-emerald-200');
  } else {
    el.classList.add('bg-blue-50', 'text-blue-800', 'border', 'border-blue-200');
  }
  el.innerHTML = msg;
}

async function processAndSaveModalData() {
  const select = document.getElementById('modalReportTypeSelect');
  const type = select ? select.value : currentModule;
  const textarea = document.getElementById('modalPasteArea');
  const rawText = textarea ? textarea.value : '';

  try {
    let parsed;
    if (type === 'finishing') {
      parsed = parseFinishingFloorData(rawText);
      finishingData = parsed;
      localStorage.setItem('al_muslim_finishing_data', JSON.stringify(finishingData));
    } else {
      parsed = parseFabricStoreData(rawText);
      fabricData = parsed;
      localStorage.setItem('al_muslim_fabric_data', JSON.stringify(fabricData));
    }

    showModalFeedback(`✓ Processed locally. Broadcasting to central LAN server...`, 'info');

    // Save and broadcast to Central Host Server
    try {
      const res = await fetch('/api/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: type,
          data: parsed,
          currentModule: type
        })
      });

      if (res.ok) {
        const json = await res.json();
        if (json.version) serverSyncVersion = json.version;
        showModalFeedback(
          type === 'finishing'
            ? `✓ Successfully processed ${parsed.lines.length} lines and broadcasted across all LAN screens!`
            : `✓ Successfully processed ${parsed.length} fabric store items and broadcasted across all LAN screens!`,
          'success'
        );
      } else {
        showModalFeedback(`✓ Processed & saved in browser (Central server returned ${res.status})`, 'info');
      }
    } catch (netErr) {
      console.warn('Central server unreachable:', netErr);
      showModalFeedback(`✓ Saved in local browser (Host server unreachable)`, 'info');
    }

    setTimeout(() => {
      closeAdminModal();
      switchModuleTab(type, false);
    }, 800);

  } catch (err) {
    showModalFeedback(`⚠️ Error: ${err.message}`, 'error');
  }
}

// ==============================================================================
// 13. FILE UPLOAD HANDLING (.xlsx, .csv, .tsv)
// ==============================================================================
function handleModalFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  const fname = file.name.toLowerCase();

  if (fname.endsWith('.xlsx') || fname.endsWith('.xls')) {
    reader.onload = function(e) {
      try {
        if (typeof XLSX === 'undefined') {
          throw new Error('SheetJS XLSX library is still loading. Please try again in a second.');
        }
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        
        let targetSheetName = workbook.SheetNames[0];
        for (const sname of workbook.SheetNames) {
          if (/^\d{2}-\d{2}/.test(sname) || /finishing/i.test(sname) || /floor/i.test(sname)) {
            targetSheetName = sname;
            break;
          }
        }

        const worksheet = workbook.Sheets[targetSheetName];
        const tsv = XLSX.utils.sheet_to_csv(worksheet, { FS: '\t' });
        
        const textarea = document.getElementById('modalPasteArea');
        if (textarea) textarea.value = tsv;
        showModalFeedback(`Loaded sheet "${targetSheetName}" (${tsv.split(/\r?\n/).length} rows). Click "Process & Save Data".`, 'info');
      } catch (err) {
        showModalFeedback(`Failed to read Excel workbook: ${err.message}`, 'error');
      }
    };
    reader.readAsArrayBuffer(file);
  } else {
    reader.onload = function(e) {
      const text = e.target.result;
      const textarea = document.getElementById('modalPasteArea');
      if (textarea) textarea.value = text;
      showModalFeedback(`Loaded text file (${text.split(/\r?\n/).length} rows). Click "Process & Save Data".`, 'info');
    };
    reader.readAsText(file);
  }
}

// ==============================================================================
// 14. SAMPLE DEMO DATASETS (Real Factory Columns)
// ==============================================================================
function loadSampleDataIntoModal() {
  const select = document.getElementById('modalReportTypeSelect');
  const type = select ? select.value : currentModule;
  const textarea = document.getElementById('modalPasteArea');
  if (!textarea) return;

  if (type === 'finishing') {
    const headerRow1 = "Line\tBUYER\tSTYLE NAME\tProcsess Name\tThread Cut Man\tTTL MANPOWER\tSMV\t\t100% TGT\tEFF TGT %\tDay\tTARGET/ HOUR\tPRODUCTION HOUR\t\t\t\t\t\t\t\t\t\t\t\t\tTOTAL PRODUCTION\tRUNNING W/H\t\t\t\tAvailable Min.\tProdu. Min.\tTOTAL 80%TGT\tShort/EX\tLINE EFFICIENCY\tREMARKS";
    const headerRow2 = "\t\t\t\t\t\t\t\t\t\t\t\t1st\t2nd\t3rd\t4th\t5th\t6th\t7th\t8th\t9th\t10th\t11 th\t\t\t\t\t\t\t\t\t\t\t\t\t";
    const rows = [
      "A\tCelio\tDolinus\tThread Trimming\t0\t0\t0\t\t0\t0\t0\t0\t\t\t\t\t\t\t\t\t\t\t\t\t\t0\t0\t\t\t\t\t\t0\t0\t0\tLine Off",
      "B\tBest Seller\tTollie brock\tThread Trimming\t0\t0\t7.31\t\t0\t0\t0\t0\t\t\t\t\t\t\t\t\t\t\t\t\t\t0\t0\t\t\t\t\t\t0\t0\t0\tLine Off",
      "C\tBest Seller\tJwhrick Short Orginal\tThread Trimming\t4\t23\t8.71\t\t158.4\t0.85\t4\t142.6\t80\t80\t80\t80\t80\t80\t80\t80\t\t\t\t\t\t640\t8\t\t\t\t\t\t1141\t-501\t0.4576\tHip(-) 3-3.5cm,Thigh(-) 2.5cm",
      "D\tBest Seller\tAlex Original\tThread Trimming\t4\t22\t9.35\t\t141.2\t0.85\t6\t127.1\t80\t80\t70\t70\t70\t80\t80\t80\t90\t90\t\t\t\t790\t10\t\t\t\t\t\t1271\t-481\t0.5610\tSideseam (-) 3-4 cm,Thigh(-)3-4cm",
      "E\tBest Seller\tChris Orginal\tThread Trimming\t5\t22\t9.36\t\t141.0\t0.85\t2\t126.9\t80\t80\t70\t70\t70\t70\t70\t70\t\t\t\t\t\t580\t8\t\t\t\t\t\t1015\t-435\t0.5141\tWaist(-) 2-2.5cm",
      "F\tCelio\tDolinusBM\tThread Trimming\t4\t23\t9.45\t\t146.0\t0.85\t2\t131.4\t80\t80\t70\t70\t80\t80\t80\t80\t\t\t\t\t\t620\t8\t\t\t\t\t\t1051\t-431\t0.3004\tWaist & Sideseam (-) 2-3cm,Spot",
      "G\tCelio\tDolinus\tThread Trimming\t3\t22\t9.80\t\t134.7\t0.85\t13\t121.2\t80\t80\t70\t70\t70\t70\t70\t70\t\t\t\t\t\t580\t8\t\t\t\t\t\t970\t-390\t0.1763\tSideseam(-)2-3cm,Inseam(-)2-3cm",
      "H\tBest Seller\tChris Orginal\tThread Trimming\t4\t23\t9.36\t\t147.4\t0.85\t3\t132.7\t80\t80\t80\t80\t80\t80\t80\t80\t90\t90\t\t\t\t820\t10\t\t\t\t\t\t1327\t-507\t0.6213\tWaist(-) 2-2.5cm",
      "I\tBest Seller\tChris Orginal\tThread Trimming\t4\t22\t9.36\t\t141.0\t0.85\t2\t126.9\t90\t80\t80\t80\t80\t70\t70\t70\t90\t90\t\t\t\t800\t10\t\t\t\t\t\t1269\t-469\t0.6678\tWaist(-) 2-2.5cm",
      "J\tBest Seller\tAlex Original\tThread Trimming\t4\t23\t9.35\t\t147.6\t0.85\t2\t132.8\t80\t80\t80\t80\t80\t80\t80\t80\t90\t90\t\t\t\t820\t10\t\t\t\t\t\t1328\t-508\t0.4712\tWaist(-) 3-4cm,Hip(-)2-3cm",
      "K\tBest Seller\tAlex Original\tThread Trimming\t4\t22\t9.35\t\t141.2\t0.85\t2\t127.1\t80\t80\t80\t80\t80\t80\t80\t80\t80\t80\t\t\t\t800\t10\t\t\t\t\t\t1271\t-471\t0.4353\tFront lenth (-) 2-3cm",
      "L\tBest Seller\tChris Orginal\tThread Trimming\t4\t23\t9.36\t\t147.4\t0.85\t5\t132.7\t80\t80\t80\t80\t80\t80\t80\t80\t80\t80\t\t\t\t800\t10\t\t\t\t\t\t1327\t-527\t0.8959\tWaist(-) 2-3cm",
      "M\tClub Fashion\tAndrew Chino\tThread Trimming\t3\t22\t6.80\t\t194.1\t0.85\t2\t174.7\t80\t80\t80\t80\t80\t80\t80\t70\t\t\t\t\t\t630\t8\t\t\t\t\t\t1398\t-768\t0.3027\tShading, Oil Spot,Folding",
      "N\tBest Seller\tDave Crew\tThread Trimming\t4\t22\t8.29\t\t159.2\t0.85\t2\t143.3\t80\t80\t80\t80\t80\t80\t80\t80\t90\t90\t\t\t\t820\t10\t\t\t\t\t\t1433\t-613\t0.5881\tSideSeam(-)2-2.5cm",
      "P\tBest Seller\tAlex Original\tThread Trimming\t4\t23\t9.35\t\t147.6\t0.85\t11\t132.8\t80\t80\t80\t80\t80\t80\t80\t80\t90\t90\t\t\t\t820\t10\t\t\t\t\t\t1328\t-508\t0.8525\tSideseam(-) 2-3cm,Spot",
      "Q\t---\t---\tThread Trimming\t0\t0\t9.07\t\t0\t0\t0\t0\t\t\t\t\t\t\t\t\t\t\t\t\t\t0\t0\t\t\t\t\t\t0\t0\t0\tLine Off"
    ];
    textarea.value = headerRow1 + "\n" + headerRow2 + "\n" + rows.join("\n");
  } else {
    const header = "SL\tBuyer\tStyle Name\tSupplier\tRef No\tColor\tFabric Construction\tOpening Yds\tLast Rcvd\tReceived\tIssued\tBalance Yds\tRolls\tRack No\tStatus";
    const rows = [
      "1\tZARA\tCHINO SLIM\tHYOSUNG\tRF-9081\tNAVY BLUE\t98% COT 2% SPAN\t14200\t28-Oct-26\t5000\t4800\t14400\t120\tRK-04\tRunning",
      "2\tH&M\tCARGO PANT\tTORAY\tRF-8722\tOLIVE GREEN\t100% COTTON TWILL\t18500\t27-Oct-26\t8000\t9500\t17000\t145\tRK-11\tRunning",
      "3\tMANGO\tDENIM JACKET\tISKO DENIM\tRF-6510\tINDIGO WASH\tDENIM 12 OZ\t8400\t26-Oct-26\t2000\t7800\t2600\t22\tRK-02\tShortage",
      "4\tNEXT\tPOLO SHIRT\tTEXTILE IND\tRF-4309\tOPTIC WHITE\tPIQUE KNIT\t22000\t29-Oct-26\t10000\t8200\t23800\t198\tRK-08\tRunning",
      "5\tP&C\tLINEN TROUSER\tRAYMOND\tRF-3201\tBEIGE OAT\t55% LINEN 45% COT\t6200\t25-Oct-26\t0\t2100\t4100\t34\tRK-15\tRunning",
      "6\tBERSHKA\tHOODIE SWEAT\tLUX KNIT\tRF-1190\tHEATHER GREY\tFRENCH TERRY\t15400\t28-Oct-26\t6000\t4000\t17400\t150\tRK-06\tRunning"
    ];
    textarea.value = header + "\n" + rows.join("\n");
  }

  showModalFeedback('Sample industrial data rows loaded into paste area. Click [Process & Save Data] below to apply.', 'info');
}

// ==============================================================================
// 15. FULLSCREEN CONTROLLER
// ==============================================================================
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(err => {
      console.warn('Fullscreen request blocked or unsupported:', err);
    });
  } else {
    if (document.exitFullscreen) document.exitFullscreen();
  }
}
