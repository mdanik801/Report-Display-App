/**
 * Test pasting real factory Excel data and broadcasting across LAN
 */
const http = require('http');

const headerRow1 = "Line\tBUYER\tSTYLE NAME\tProcsess Name\tThread Cut Man\tTTL MANPOWER\tSMV\t\t100% TGT\tEFF TGT %\tDay\tTARGET/ HOUR\tPRODUCTION HOUR\t\t\t\t\t\t\t\t\t\t\t\t\tTOTAL PRODUCTION\tRUNNING W/H\t\t\t\tAvailable Min.\tProdu. Min.\tTOTAL 80%TGT\tShort/EX\tLINE EFFICIENCY\tREMARKS";
const headerRow2 = "\t\t\t\t\t\t\t\t\t\t\t\t1st\t2nd\t3rd\t4th\t5th\t6th\t7th\t8th\t9th\t10th\t11 th\t\t\t\t\t\t\t\t\t\t\t\t\t";
const rows = [
  "C\tBest Seller\tJwhrick Short Orginal\tThread Trimming\t4\t23\t8.71\t\t158.4\t0.85\t4\t142.6\t80\t80\t80\t80\t80\t80\t80\t80\t\t\t\t\t\t640\t8\t\t\t\t\t\t1141\t-501\t0.4576\tHip(-) 3-3.5cm",
  "D\tBest Seller\tAlex Original\tThread Trimming\t4\t22\t9.35\t\t141.2\t0.85\t6\t127.1\t80\t80\t70\t70\t70\t80\t80\t80\t90\t90\t\t\t\t790\t10\t\t\t\t\t\t1271\t-481\t0.5610\tThigh(-)3-4cm",
  "E\tBest Seller\tChris Orginal\tThread Trimming\t5\t22\t9.36\t\t141.0\t0.85\t2\t126.9\t80\t80\t70\t70\t70\t70\t70\t70\t\t\t\t\t\t580\t8\t\t\t\t\t\t1015\t-435\t0.5141\tWaist(-) 2-2.5cm",
  "H\tBest Seller\tChris Orginal\tThread Trimming\t4\t23\t9.36\t\t147.4\t0.85\t3\t132.7\t80\t80\t80\t80\t80\t80\t80\t80\t90\t90\t\t\t\t820\t10\t\t\t\t\t\t1327\t-507\t0.6213\tWaist(-) 2-2.5cm"
];

const tsv = headerRow1 + "\n" + headerRow2 + "\n" + rows.join("\n");

// Test parsing with the parser from script.js
const fs = require('fs');
const scriptContent = fs.readFileSync('public/script.js', 'utf8');

// Evaluate parser in a sandbox context
const vm = require('vm');
const sandbox = {
  console: console,
  window: { addEventListener: () => {} },
  document: {
    getElementById: () => ({ classList: { add: () => {}, remove: () => {} }, textContent: '' })
  },
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  setInterval: setInterval,
  clearInterval: clearInterval
};
vm.createContext(sandbox);

// Extract tokenizer and finishing parser from script.js
vm.runInContext(scriptContent, sandbox);

const parsed = sandbox.parseFinishingFloorData(tsv);
console.log('Parsed lines:', parsed.lines.length, 'active:', parsed.activeCount, 'total target:', parsed.totalTarget);

// Now POST to /api/data
const reqData = JSON.stringify({
  type: 'finishing',
  data: parsed,
  currentModule: 'finishing'
});

const req = http.request({
  hostname: '127.0.0.1',
  port: 3000,
  path: '/api/data',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(reqData)
  }
}, res => {
  let b = '';
  res.on('data', c => b += c);
  res.on('end', () => {
    console.log('Server response:', b);
    process.exit(0);
  });
});
req.write(reqData);
req.end();
