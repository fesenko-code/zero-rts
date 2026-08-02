// ---- Network layer for ZERO RTS (WebSocket relay) ----
// Transport: a tiny standalone relay server (server/relay.mjs) forwards
// messages 1:1 between the host and the guest. This replaces Nakama's match
// transport for the MVP; Nakama still handles auth/metadata if desired.
//
// Two roles:
//  - HOST (player 0): simulates the whole game, broadcasts compact snapshots.
//  - GUEST (player 1): renders snapshots, sends commands to host.
// This is a state-sync relay (not lockstep) — simple and robust for an MVP.

const RELAY_URL = 'ws://127.0.0.1:8765';

export type NetRole = 'host' | 'guest';

export interface SnapshotUnit {
  id: number; owner: number; kind: string; x: number; y: number; hp: number; st: string;
}
export interface SnapshotBuilding {
  id: number; owner: number; kind: string; x: number; y: number; hp: number;
}
export interface Snapshot {
  t: number;
  res: { food: number; wood: number; stone: number; gold: number }[];
  units: SnapshotUnit[];
  buildings: SnapshotBuilding[];
  winner: number | null;
}

export type NetCmd =
  | { op: 'move'; unitId: number; x: number; y: number }
  | { op: 'gather'; unitId: number; nodeId: number }
  | { op: 'attack'; unitId: number; targetId: number }
  | { op: 'train'; buildingId: number; kind: string }
  | { op: 'build'; owner: number; kind: string; x: number; y: number }
  | { op: 'research'; owner: number; techId: string };

export class Net {
  ws: WebSocket | null = null;
  role: NetRole = 'guest';
  onSnapshot: ((s: Snapshot) => void) | null = null;
  onCmd: ((c: NetCmd) => void) | null = null;

  async connect(role: NetRole): Promise<boolean> {
    this.role = role;
    return new Promise((resolve) => {
      try {
        const ws = new WebSocket(RELAY_URL);
        this.ws = ws;
        ws.onopen = () => {
          ws.send(JSON.stringify({ role }));
          console.log(`[net] ${role} connected to relay`);
          resolve(true);
        };
        ws.onmessage = (ev) => this.handleData(ev.data.toString());
        ws.onerror = () => { console.error('[net] socket error'); resolve(false); };
        ws.onclose = () => { console.log('[net] disconnected'); };
      } catch (e) {
        console.error('[net] connect failed', e);
        resolve(false);
      }
    });
  }

  private handleData(msg: string) {
    try {
      const data = JSON.parse(msg);
      if (data.type === 'snap' && this.onSnapshot) this.onSnapshot(data.s as Snapshot);
      else if (data.type === 'cmd' && this.onCmd) this.onCmd(data.c as NetCmd);
    } catch { /* ignore */ }
  }

  sendSnapshot(s: Snapshot) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify({ type: 'snap', s }));
  }

  sendCmd(c: NetCmd) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify({ type: 'cmd', c }));
  }

  disconnect() {
    try { this.ws?.close(); } catch { /* ignore */ }
  }
}
