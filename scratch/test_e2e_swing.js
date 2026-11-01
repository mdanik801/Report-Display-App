const fs = require('fs');

// Create minimal DOM mock
const dom = {
  elements: {},
  getElementById(id) {
    if (!this.elements[id]) {
      this.elements[id] = {
        id,
        classList: {
          classes: new Set(),
          add(...c) { c.forEach(x => this.classes.add(x)); },
          remove(...c) { c.forEach(x => this.classes.delete(x)); },
          contains(c) { return this.classes.has(c); }
        },
        style: {},
        innerHTML: '',
        textContent: '',
        value: ''
      };
    }
    return this.elements[id];
  }
};

global.document = dom;
global.window = {
  location: { protocol: 'http:', hostname: 'localhost', search: '?module=swing' },
  addEventListener: () => {}
};
global.localStorage = {
  store: {},
  getItem(k) { return this.store[k] || null; },
  setItem(k, v) { this.store[k] = String(v); },
  removeItem(k) { delete this.store[k]; }
};

// Evaluate public/script.js
const scriptCode = fs.readFileSync('public/script.js', 'utf8');
eval(scriptCode);

// Read user's sample CSV
const csv = fs.readFileSync('data/sample_swing.csv', 'utf8');

// Parse with parseSwingFloorData
const parsed = parseSwingFloorData(csv);
console.log('✓ Successfully parsed Swing data:');
console.log('  Floor:', parsed.metadata.floor);
console.log('  Date:', parsed.metadata.date);
console.log('  Floor Responsible:', parsed.metadata.floorResponsible);
console.log('  ERP Responsible:', parsed.metadata.erpResponsible);
console.log('  Lines count:', parsed.lines.length);

// Store and render
swingData = parsed;
renderSwingModule();

console.log('✓ renderSwingModule executed successfully!');
console.log('  kpiSwingProd:', dom.getElementById('kpiSwingProd').textContent);
console.log('  kpiSwingTarget:', dom.getElementById('kpiSwingTarget').textContent);
console.log('  kpiSwingEff:', dom.getElementById('kpiSwingEff').textContent);
console.log('  kpiSwingActiveLines:', dom.getElementById('kpiSwingActiveLines').textContent);
console.log('  Table rows generated in tbody:', dom.getElementById('swingTableBody').innerHTML.split('</tr>').length - 1);
console.log('  Table foot generated in tfoot:', dom.getElementById('swingTableFoot').innerHTML.includes('TODAY PRODUCTION'));

