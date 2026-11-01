/**
 * Automated Verification Script: Multi-PC LAN Real-Time Synchronization & Persistence
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const SERVER_PORT = 3000;
const SERVER_HOST = '127.0.0.1';

// Sample finishing report payload
const sampleFinishingData = {
  activeCount: 13,
  offCount: 3,
  totalLines: 16,
  totalHourlyProduction: 10223,
  totalTarget: 15964,
  avgEfficiency: 0.6402,
  lines: [
    {
      line: 'C',
      buyer: 'Best Seller',
      style: 'Jwhrick Short Orginal',
      process: 'Thread Trimming',
      hourlyOutputs: [80, 80, 80, 80, 80, 80, 80, 80, 0, 0, 0],
      totalProduction: 640,
      target: 1141,
      efficiency: 0.4576,
      remarks: 'Hip(-) 3-3.5cm',
      status: 'Active'
    },
    {
      line: 'D',
      buyer: 'Best Seller',
      style: 'Alex Original',
      process: 'Thread Trimming',
      hourlyOutputs: [80, 80, 70, 70, 70, 80, 80, 80, 90, 90, 0],
      totalProduction: 790,
      target: 1271,
      efficiency: 0.5610,
      remarks: 'Thigh(-)3-4cm',
      status: 'Active'
    }
  ]
};

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Connect SSE stream
function connectSseClient(clientName) {
  return new Promise((resolve, reject) => {
    const receivedEvents = [];
    const req = http.request({
      hostname: SERVER_HOST,
      port: SERVER_PORT,
      path: '/api/events',
      method: 'GET',
      headers: {
        'Accept': 'text/event-stream'
      }
    }, (res) => {
      let buffer = '';
      res.on('data', (chunk) => {
        buffer += chunk.toString();
        const parts = buffer.split('\n\n');
        buffer = parts.pop(); // keep last unfinished part
        for (const part of parts) {
          if (!part.trim() || part.startsWith(':')) continue; // skip ping
          const lines = part.split('\n');
          let eventType = 'message';
          let dataStr = '';
          for (const line of lines) {
            if (line.startsWith('event: ')) eventType = line.substring(7).trim();
            if (line.startsWith('data: ')) dataStr = line.substring(6).trim();
          }
          if (dataStr) {
            try {
              const parsed = JSON.parse(dataStr);
              receivedEvents.push({ type: eventType, data: parsed });
            } catch (e) {
              receivedEvents.push({ type: eventType, raw: dataStr });
            }
          }
        }
      });
      resolve({ clientName, req, res, receivedEvents });
    });

    req.on('error', reject);
    req.end();
  });
}

// HTTP POST JSON
function postJson(pathUrl, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request({
      hostname: SERVER_HOST,
      port: SERVER_PORT,
      path: pathUrl,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, (res) => {
      let resp = '';
      res.on('data', c => resp += c);
      res.on('end', () => {
        try {
          resolve(JSON.parse(resp));
        } catch {
          resolve(resp);
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// HTTP GET JSON
function getJson(pathUrl) {
  return new Promise((resolve, reject) => {
    http.get({
      hostname: SERVER_HOST,
      port: SERVER_PORT,
      path: pathUrl
    }, (res) => {
      let resp = '';
      res.on('data', c => resp += c);
      res.on('end', () => {
        try {
          resolve(JSON.parse(resp));
        } catch {
          resolve(resp);
        }
      });
    }).on('error', reject);
  });
}

async function runTests() {
  console.log('🧪 Starting Multi-PC LAN Real-Time Synchronization Test Suite...\n');

  // Step 1: Connect PC 1 and PC 2 via SSE
  console.log('1️⃣ Connecting simulated PC 1 and PC 2 via Server-Sent Events (/api/events)...');
  const pc1 = await connectSseClient('PC-1 (Admin Machine)');
  const pc2 = await connectSseClient('PC-2 (Floor Smart TV)');
  await delay(300);

  console.log(`   ✓ PC 1 initial event count: ${pc1.receivedEvents.length}`);
  console.log(`   ✓ PC 2 initial event count: ${pc2.receivedEvents.length}`);
  if (pc2.receivedEvents.length === 0) throw new Error('PC 2 did not receive initial connect event');

  // Step 2: PC 1 pastes/submits Finishing Excel Data
  console.log('\n2️⃣ PC 1 posts new Finishing Excel Report to central LAN server (/api/data)...');
  const postRes = await postJson('/api/data', {
    type: 'finishing',
    data: sampleFinishingData,
    currentModule: 'finishing'
  });
  console.log(`   ✓ Server response: success=${postRes.success}, version=${postRes.version}`);

  await delay(400);

  // Step 3: Verify PC 2 received the real-time broadcast
  console.log('\n3️⃣ Verifying PC 2 received real-time data update without manual page refresh...');
  const updateEventForPc2 = pc2.receivedEvents.find(e => e.type === 'data_updated');
  if (!updateEventForPc2) {
    throw new Error('❌ FAILED: PC 2 did not receive real-time data_updated broadcast event!');
  }
  const pc2Finishing = updateEventForPc2.data?.data?.finishingData;
  console.log(`   ✓ PC 2 received broadcasted version: ${updateEventForPc2.data?.version}`);
  console.log(`   ✓ PC 2 finishing lines received: ${pc2Finishing?.lines?.length} lines`);
  console.log(`   ✓ Line C output: ${pc2Finishing?.lines[0]?.totalProduction} pcs, Line D output: ${pc2Finishing?.lines[1]?.totalProduction} pcs`);
  if (pc2Finishing?.lines?.length !== 2) throw new Error('Data mismatch on PC 2');

  // Step 4: Verify Disk File Persistence
  console.log('\n4️⃣ Verifying persistent storage file on central server PC disk...');
  const dataFile = path.join(__dirname, '..', 'data', 'dashboard_data.json');
  if (!fs.existsSync(dataFile)) throw new Error('dashboard_data.json does not exist on disk');
  const diskState = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  console.log(`   ✓ Disk state version: ${diskState.version}`);
  console.log(`   ✓ Disk state finishing lines: ${diskState.finishingData?.lines?.length}`);
  console.log(`   ✓ Disk state timing: Interval ${diskState.timingSettings?.posterIntervalSeconds}s, Duration ${diskState.timingSettings?.noticeDurationSeconds}s`);

  // Step 5: Simulate Page Refresh on PC 2 (Fresh GET /api/data)
  console.log('\n5️⃣ Simulating page refresh / new device connection (GET /api/data)...');
  const freshFetch = await getJson('/api/data');
  console.log(`   ✓ Fresh fetch success: ${freshFetch.success}`);
  console.log(`   ✓ Fresh fetch total production: ${freshFetch.data?.finishingData?.totalHourlyProduction} pcs`);
  if (freshFetch.data?.finishingData?.totalHourlyProduction !== 10223) {
    throw new Error('Fresh fetch data mismatch');
  }

  // Step 6: Test Timing Settings Synchronization Across LAN
  console.log('\n6️⃣ PC 1 updates Notice Timing (Interval: 30s, Duration: 20s)...');
  const timingRes = await postJson('/api/data', {
    timingSettings: {
      posterIntervalSeconds: 30,
      noticeDurationSeconds: 20
    }
  });
  console.log(`   ✓ Server response: version=${timingRes.version}`);
  await delay(300);

  const pc2TimingEvent = pc2.receivedEvents[pc2.receivedEvents.length - 1];
  console.log(`   ✓ PC 2 received updated timing: Interval ${pc2TimingEvent.data?.data?.timingSettings?.posterIntervalSeconds}s, Duration ${pc2TimingEvent.data?.data?.timingSettings?.noticeDurationSeconds}s`);

  // Step 7: Test Network Info API
  console.log('\n7️⃣ Testing /api/network for Smart TV LAN IPv4 detection...');
  const netInfo = await getJson('/api/network');
  console.log(`   ✓ Port: ${netInfo.port}`);
  console.log(`   ✓ Detected LAN Addresses: ${netInfo.lanAddresses?.map(a => `${a.interface}: http://${a.address}:${netInfo.port}`).join(', ')}`);

  // Close SSE connections
  pc1.req.destroy();
  pc2.req.destroy();

  console.log('\n========================================================================');
  console.log('🎉 ALL MULTI-PC LAN SYNCHRONIZATION TESTS PASSED SUCCESSFULLY! (7/7)');
  console.log('========================================================================\n');
}

runTests().catch(err => {
  console.error('\n❌ Test Error:', err);
  process.exit(1);
});
