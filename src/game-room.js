// Durable Object：1部屋=1インスタンス。囚人1・看守1のWebSocketを保持し、権威stateを更新して配信。
import { newGame, submitAction } from "./engine/engine.js";
import { buildView } from "./engine/view.js";

const ROLES = ["prisoner", "guard"];

export class GameRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = new Map(); // ws -> role
    this.game = null;
  }

  async fetch(request) {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("expected websocket", { status: 426 });
    }
    const pair = new WebSocketPair();
    this.accept(pair[1]);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  takenRoles() { return new Set(this.sessions.values()); }

  accept(ws) {
    ws.accept();
    const taken = this.takenRoles();
    const role = ROLES.find((r) => !taken.has(r));
    if (!role) {
      ws.send(JSON.stringify({ t: "full" }));
      ws.close(1000, "room full");
      return;
    }
    this.sessions.set(ws, role);
    ws.send(JSON.stringify({ t: "joined", role }));
    ws.addEventListener("message", (ev) => this.onMessage(ws, role, ev));
    ws.addEventListener("close", () => { this.sessions.delete(ws); });
    ws.addEventListener("error", () => { this.sessions.delete(ws); });
    if (this.game) this.sendState(ws, role);
  }

  onMessage(ws, role, ev) {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    let res = { ok: true };
    switch (msg.t) {
      case "join":
        if (!this.game) this.game = newGame();
        break;
      case "act":
        if (this.game) res = submitAction(this.game, role, msg);
        break;
      case "reset":
        this.game = newGame();
        break;
      default:
        return;
    }
    if (!res.ok) ws.send(JSON.stringify({ t: "error", msg: res.err }));
    this.broadcast();
  }

  sendState(ws, role) {
    try { ws.send(JSON.stringify({ t: "state", view: buildView(this.game, role) })); }
    catch { this.sessions.delete(ws); }
  }

  broadcast() {
    if (!this.game) return;
    for (const [ws, role] of this.sessions) this.sendState(ws, role);
  }
}
