// Worker エントリ：静的アセット配信 ＋ /api/room/:id を Durable Object へルーティング。
import { GameRoom } from "./game-room.js";
export { GameRoom };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // WebSocket 対戦ルーム
    if (url.pathname.startsWith("/api/room/")) {
      const roomId = url.pathname.split("/")[3] || "default";
      const id = env.GAME_ROOM.idFromName(roomId);
      const stub = env.GAME_ROOM.get(id);
      return stub.fetch(request);
    }

    // それ以外は PWA 静的アセット
    return env.ASSETS.fetch(request);
  },
};
