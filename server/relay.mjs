// Minimal WebSocket relay for ZERO RTS (stand-in for Nakama match transport).
// Two clients connect; messages from one are forwarded to the other.
// Host connects first, guest second. No matchmaking — just a 1:1 relay.
import { WebSocketServer } from 'ws';

const wss = new WebSocketServer({ port: 8766 });
let host = null;
let guest = null;

wss.on('connection', (ws) => {
  console.log('client connected');
  ws.on('message', (buf) => {
    const msg = buf.toString();
    // tag role on first message: { role: 'host' | 'guest' }
    try {
      const data = JSON.parse(msg);
      if (data.role === 'host') { host = ws; console.log('host registered'); return; }
      if (data.role === 'guest') { guest = ws; console.log('guest registered'); return; }
    } catch {}
    // relay: host -> guest, guest -> host
    if (ws === host && guest && guest.readyState === 1) guest.send(msg);
    else if (ws === guest && host && host.readyState === 1) host.send(msg);
  });
  ws.on('close', () => {
    if (ws === host) host = null;
    if (ws === guest) guest = null;
    console.log('client disconnected');
  });
});

console.log('ZERO relay listening on ws://127.0.0.1:8765');
