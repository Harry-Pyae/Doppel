"use client";

// The phone's view of its room. Everything comes from imposter.my_state, which returns
// only this player's own card. It is fetched on load, every 10 seconds while the tab is
// visible (the heartbeat behind the connected/away dots and the host hand-over), when the
// tab comes back, when the network returns, and on every Realtime "changed" ping
// (the ping carries nothing else).
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { errorKey, type Key } from "@/lib/i18n";
import type { MyState } from "@/lib/game";
import { browserClient } from "@/lib/supabase";

/** The room this phone was last in, to tell "you were removed" from "the room ended". */
const LAST_ROOM = "imposter.room";
const HEARTBEAT_MS = 10_000;

export type Conn = "connected" | "reconnecting" | "offline";
export type Notice = { id: number; key: Key; vars?: Record<string, string> };

const lastRoom = {
  get: () => {
    try {
      return localStorage.getItem(LAST_ROOM);
    } catch {
      return null;
    }
  },
  set: (id: string | null) => {
    try {
      if (id) localStorage.setItem(LAST_ROOM, id);
      else localStorage.removeItem(LAST_ROOM);
    } catch {
      // Private mode: "removed" and "ended" show as the plain main menu.
    }
  },
};

const subscribeOnline = (cb: () => void) => {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
};

let noticeSeq = 0;

/**
 * The server's clock, from each my_state answer: offset = server time - the midpoint of the
 * request. The sample with the shortest round trip of the last 8 is the most exact (its error
 * is at most half that round trip), so every phone counts down to the same instant.
 */
const samples: { rtt: number; offset: number }[] = [];
let offset = 0;
function clockSample(sent: number, received: number, serverNow: number) {
  samples.push({ rtt: received - sent, offset: serverNow - (sent + received) / 2 });
  if (samples.length > 8) samples.shift();
  offset = samples.reduce((best, s) => (s.rtt < best.rtt ? s : best)).offset;
}
/** Now, on the server's clock (ms). */
export const serverNow = () => Date.now() + offset;

export function useRoom() {
  const [state, setState] = useState<MyState | null>(null);
  const [fetchOk, setFetchOk] = useState(true);
  const [live, setLive] = useState(true);
  const [notices, setNotices] = useState<Notice[]>([]);
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  const busy = useRef(false);
  const again = useRef(false);
  const hostNotice = useRef<string | null>(null);

  const notify = useCallback((key: Key, vars?: Record<string, string>) => {
    const id = ++noticeSeq;
    setNotices((list) => [...list.filter((n) => n.key !== key || n.vars?.name !== vars?.name), { id, key, vars }]);
    setTimeout(() => setNotices((list) => list.filter((n) => n.id !== id)), 4500);
  }, []);
  const dismiss = useCallback((id: number) => setNotices((list) => list.filter((n) => n.id !== id)), []);

  const refresh = useCallback(async () => {
    // One fetch at a time; pings that arrive meanwhile cause one more.
    if (busy.current) {
      again.current = true;
      return;
    }
    busy.current = true;
    try {
      do {
        again.current = false;
        const sent = Date.now();
        const { data, error } = await browserClient().rpc("my_state", { p_room: lastRoom.get() });
        const received = Date.now();
        if (error) {
          if (error.message === "not_signed_in") return window.location.replace("/sign-in");
          // Banned or unapproved since sign-in: the page says so.
          if (error.message === "not_allowed") return window.location.reload();
          setFetchOk(false);
          break;
        }
        setFetchOk(true);
        const next = data as MyState;
        if (next.status === "in_room") {
          clockSample(sent, received, next.now);
          lastRoom.set(next.room.id);
          const changed = next.room.host_changed_at;
          if (changed && changed !== hostNotice.current) {
            hostNotice.current = changed;
            const host = next.players.find((p) => p.host);
            if (host) notify("notice.host", { name: host.name });
          }
        } else {
          if (next.status !== "none") notify(next.status === "removed" ? "error.removed" : "error.ended");
          lastRoom.set(null);
        }
        setState(next);
      } while (again.current);
    } finally {
      busy.current = false;
    }
  }, [notify]);

  useEffect(() => {
    const visible = () => document.visibilityState === "visible";
    const onShow = () => visible() && refresh();
    const tick = setInterval(onShow, HEARTBEAT_MS);
    // First load, and the tab reopened (bfcache) or brought back.
    onShow();
    document.addEventListener("visibilitychange", onShow);
    window.addEventListener("pageshow", onShow);
    window.addEventListener("online", onShow);
    return () => {
      clearInterval(tick);
      document.removeEventListener("visibilitychange", onShow);
      window.removeEventListener("pageshow", onShow);
      window.removeEventListener("online", onShow);
    };
  }, [refresh]);

  const roomId = state?.status === "in_room" ? state.room.id : null;
  useEffect(() => {
    if (!roomId) return;
    const client = browserClient();
    const channel = client
      .channel(`room:${roomId}`)
      .on("broadcast", { event: "changed" }, () => refresh())
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setLive(true);
          refresh();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setLive(false);
      });
    return () => {
      client.removeChannel(channel);
      setLive(true);
    };
  }, [roomId, refresh]);

  /** Calls a state-changing function, then fetches the new state. Returns the error's message key, if any. */
  const act = useCallback(
    async (fn: string, args?: Record<string, unknown>): Promise<Key | null> => {
      // Leaving or ending on purpose is not "removed" or "ended".
      if (fn === "leave_room" || fn === "end_room") lastRoom.set(null);
      const { error } = await browserClient().rpc(fn, args);
      await refresh();
      return error ? errorKey(error.message) : null;
    },
    [refresh],
  );

  const conn: Conn = !online ? "offline" : !fetchOk || (roomId && !live) ? "reconnecting" : "connected";
  return { state, conn, act, notify, notices, dismiss };
}
