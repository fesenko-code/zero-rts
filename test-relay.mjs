// Relay integration test: host + guest over the standalone WS relay.
import WebSocket from 'ws';

const URL = 'ws://127.0.0.1:8765';

async function open(role) {
  return new Promise((res, rej) => {
    const ws = new WebSocket(URL);
    ws.on('open', () => { ws.send(JSON.stringify({ role })); res(ws); });
    ws.on('error', rej);
  });
}

const host = await open('host');
console.log('host connected');
const guest = await open('guest');
console.log('guest connected');

let got = false;
guest.on('message', (buf) => {
  const d = JSON.parse(buf.toString());
  if (d.type === 'snap') { got = true; console.log('guest received snapshot t=' + d.s.t.toFixed(1)); }
});

// host sends a snapshot
host.send(JSON.stringify({ type: 'snap', s: { t: 1.5, res: [], units: [], buildings: [], winner: null } }));
await new Promise((r) => setTimeout(r, 500));

console.log('RELAY WORKS: ' + got);
host.close(); guest.close();
process.exit(0);
