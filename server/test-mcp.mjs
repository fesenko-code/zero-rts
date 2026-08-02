import { spawn } from 'node:child_process';

const proc = spawn(
  'C:\\Users\\Admin\\AppData\\Local\\hermes\\node\\node.exe',
  ['C:\\Users\\Admin\\Documents\\0 a.d\\server\\nakama-mcp\\dist\\index.js'],
  {
    env: {
      NAKAMA_HOST: '127.0.0.1',
      NAKAMA_PORT: '7350',
      NAKAMA_SERVER_KEY: 'zero_dev_key',
      NAKAMA_CONSOLE_PORT: '7351',
      NAKAMA_CONSOLE_USERNAME: 'admin',
      NAKAMA_CONSOLE_PASSWORD: 'admin',
      NAKAMA_USE_SSL: 'false',
      NAKAMA_TIMEOUT_MS: '15000',
    },
    stdio: ['pipe', 'pipe', 'inherit'],
  }
);

let buf = '';
const send = (obj) => proc.stdin.write(JSON.stringify(obj) + '\n');

proc.stdout.on('data', (d) => {
  buf += d.toString();
  let nl;
  while ((nl = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, nl);
    buf = buf.slice(nl + 1);
    if (!line.trim()) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    if (msg.id === 1) {
      console.log('TOOLS:', msg.result?.tools?.map((t) => t.name).join(', '));
      // now call nakama_healthcheck
      send({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'nakama_healthcheck', arguments: {} } });
    } else if (msg.id === 2) {
      const text = msg.result?.content?.[0]?.text ?? JSON.stringify(msg);
      console.log('\n=== nakama_healthcheck RESULT ===\n' + text);
      proc.kill();
      process.exit(0);
    }
  }
});

// MCP handshake
send({ jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '1' } } });
proc.stdin.write('\n');
setTimeout(() => send({ jsonrpc: '2.0', method: 'notifications/initialized' }), 200);
setTimeout(() => send({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }), 400);
