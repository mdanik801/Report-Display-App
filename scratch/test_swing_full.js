const fs = require('fs');
const content = fs.readFileSync('data/sample_swing.csv', 'utf8');

function cleanStr(val) {
  if (val === undefined || val === null) return '';
  return String(val).replace(/\u00A0/g, ' ').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
}

function parseNumber(val) {
  if (val === undefined || val === null || val === '') return null;
  const cleaned = String(val).replace(/,/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function formatNum(val, decimals = 0) {
  if (val === null || val === undefined || isNaN(val)) return '—';
  if (decimals === 0) return Math.round(val).toLocaleString();
  return val.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function formatPct(val) {
  if (val === null || val === undefined || isNaN(val)) return '—';
  const pct = val > 1.5 ? val : val * 100;
  return pct.toFixed(1) + '%';
}

function tokenizeTableData(text) {
  if (!text || !text.trim()) return [];
  const rows = [];
  let currentRow = [];
  let currentCell = '';
  let insideQuotes = false;
  let i = 0;
  const len = text.length;

  const sample = text.slice(0, 1000);
  const tabCount = (sample.match(/\t/g) || []).length;
  const commaCount = (sample.match(/,/g) || []).length;
  const delimiter = tabCount > commaCount ? '\t' : ',';

  while (i < len) {
    const ch = text[i];
    if (ch === '"') {
      if (insideQuotes && text[i + 1] === '"') {
        currentCell += '"';
        i += 2;
        continue;
      }
      insideQuotes = !insideQuotes;
      i++;
      continue;
    }
    if (!insideQuotes && ch === delimiter) {
      currentRow.push(cleanStr(currentCell));
      currentCell = '';
      i++;
      continue;
    }
    if (!insideQuotes && (ch === '\n' || ch === '\r')) {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      currentRow.push(cleanStr(currentCell));
      currentCell = '';
      if (currentRow.some(c => c !== '')) rows.push(currentRow);
      currentRow = [];
      i++;
      continue;
    }
    currentCell += ch;
    i++;
  }
  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(cleanStr(currentCell));
    if (currentRow.some(c => c !== '')) rows.push(currentRow);
  }
  return rows;
}

function parseSwingFloorData(rawText) {
  const rows = tokenizeTableData(rawText);
  if (!rows || rows.length < 3) throw new Error('Not enough rows in Swing report.');

  const result = {
    metadata: {
      floorResponsible: '',
      erpResponsible: '',
      floor: 'BURIGANGA - SEWING',
      date: '',
      totalLines: 0,
      runningLines: 0
    },
    lines: [],
    summary: {
      todayProduction: null,
      todayEfficiency: null,
      pvsOutput: null,
      pvsEfficiency: null
    }
  };

  let headerRowIndex = -1;
  let subheaderRowIndex = -1;

  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    const row = rows[r];
    const rowStr = row.join(' ').toLowerCase();

    if (rowStr.includes('floor responsible')) {
      if (rows[r + 1] && rows[r + 1][0]) result.metadata.floorResponsible = rows[r + 1][0];
    }
    if (rowStr.includes('erp responsible')) {
      for (let c = 0; c < row.length; c++) {
        if (/erp\s*responsible/i.test(row[c])) {
          if (rows[r + 1] && rows[r + 1][c]) result.metadata.erpResponsible = rows[r + 1][c];
        }
      }
    }
    if (rowStr.includes('floor :') || rowStr.includes('floor:')) {
      for (const cell of row) {
        if (/floor\s*:/i.test(cell)) result.metadata.floor = cell.replace(/floor\s*:\s*/i, '').trim();
      }
    }
    if (rowStr.includes('date') && !rowStr.includes('update')) {
      for (let c = 0; c < row.length; c++) {
        if (/date\s*:/i.test(row[c])) {
          for (let k = c + 1; k < Math.min(row.length, c + 8); k++) {
            if (row[k] && /\d{4}-\d{2}-\d{2}|\d{2}-\d{2}-\d{4}/.test(row[k])) {
              result.metadata.date = row[k];
              break;
            }
          }
        }
      }
    }
    if (rowStr.includes('total line')) {
      for (let c = 0; c < row.length; c++) {
        if (/total\s*line/i.test(row[c])) {
          for (let k = c + 1; k < Math.min(row.length, c + 6); k++) {
            if (/^\d+$/.test(row[k])) {
              result.metadata.totalLines = parseInt(row[k], 10);
              break;
            }
          }
        }
        if (/running\s*line/i.test(row[c])) {
          for (let k = c + 1; k < Math.min(row.length, c + 6); k++) {
            if (row[k]) {
              const m = row[k].match(/(\d+)/);
              if (m) {
                result.metadata.runningLines = parseInt(m[1], 10);
                break;
              }
            }
          }
        }
      }
    }

    if (rowStr.includes('line') && (rowStr.includes('buyer') || rowStr.includes('style name'))) {
      headerRowIndex = r;
      if (rows[r + 1] && (rows[r + 1].join(' ').toLowerCase().includes('op') || rows[r + 1].join(' ').toLowerCase().includes('1st'))) {
        subheaderRowIndex = r + 1;
      }
      break;
    }
  }

  if (headerRowIndex === -1) throw new Error('Could not detect Swing report table headers.');

  const startDataRow = (subheaderRowIndex !== -1 ? subheaderRowIndex : headerRowIndex) + 1;
  let currentPM = '';
  let currentPMEffName = '';
  let currentPMEffVal = null;

  for (let r = startDataRow; r < rows.length; r++) {
    const row = rows[r];
    const rowStr = row.join(' ').toLowerCase();

    if (rowStr.includes('today production')) {
      result.summary.todayProduction = row;
      continue;
    }
    if (rowStr.includes('today efficiency')) {
      result.summary.todayEfficiency = row;
      continue;
    }
    if (rowStr.includes('pvs output') || rowStr.includes('previous output')) {
      result.summary.pvsOutput = row;
      continue;
    }
    if (rowStr.includes('pvs efficiency') || rowStr.includes('previous efficiency')) {
      result.summary.pvsEfficiency = row;
      continue;
    }
    if (rowStr.includes('daily p/o wise') || rowStr.includes('update summary') || rowStr.includes('note')) {
      break;
    }

    const lineId = row[1];
    if (!lineId || lineId.trim() === '') continue;

    const isNewPM = row[0] && row[0].trim();
    if (isNewPM) {
      currentPM = row[0].trim();
    }
    if (row[37] && row[37].trim()) {
      currentPMEffName = row[37].trim();
      currentPMEffVal = parseNumber(row[38]);
    }

    const item = {
      pm: currentPM,
      pmDisplay: row[0] || '',
      isGroupStart: isNewPM ? true : false,
      line: lineId,
      buyer: row[2] || '',
      styleName: row[3] || '',
      item: row[4] || '',
      proDay: row[5] || '',
      manpower: {
        op: parseNumber(row[6]) || 0,
        hl: parseNumber(row[7]) || 0,
        iron: parseNumber(row[8]) || 0,
        total: parseNumber(row[9]) || 0
      },
      smv: parseNumber(row[10]) || 0,
      tgPercent: parseNumber(row[11]) || 0,
      target100: parseNumber(row[12]) || 0,
      wh: parseNumber(row[13]) || 0,
      ieTrg: parseNumber(row[14]) || 0,
      ieHTrg: parseNumber(row[15]) || 0,
      cmmtTgt: parseNumber(row[16]) || 0,
      hTgt: parseNumber(row[17]) || 0,
      hourlyProd: [
        parseNumber(row[18]) || 0,
        parseNumber(row[19]) || 0,
        parseNumber(row[20]) || 0,
        parseNumber(row[21]) || 0,
        parseNumber(row[22]) || 0,
        parseNumber(row[23]) || 0,
        parseNumber(row[24]) || 0,
        parseNumber(row[25]) || 0,
        parseNumber(row[26]) || 0,
        parseNumber(row[27]) || 0,
        parseNumber(row[28]) || 0
      ],
      average: parseNumber(row[29]) || 0,
      totalProduction: parseNumber(row[30]) || 0,
      todayTgt: parseNumber(row[31]) || 0,
      tgtShEx: parseNumber(row[32]) || 0,
      wHour: parseNumber(row[33]) || 0,
      efficiencyPercent: parseNumber(row[34]) || 0,
      availMinute: parseNumber(row[35]) || 0,
      produceMinute: parseNumber(row[36]) || 0,
      pmWiseEffName: currentPMEffName,
      pmWiseEffPercent: currentPMEffVal,
      inHand: row[39] || '',
      remarks: row[40] || '',
      rawRow: row
    };

    result.lines.push(item);
  }

  if (result.metadata.totalLines === 0) result.metadata.totalLines = result.lines.length;
  if (result.metadata.runningLines === 0) {
    result.metadata.runningLines = result.lines.filter(l => l.totalProduction > 0 || l.manpower.total > 0).length;
  }

  return result;
}

const parsed = parseSwingFloorData(content);
console.log('Parsed successfully:', parsed.lines.length, 'lines.');
