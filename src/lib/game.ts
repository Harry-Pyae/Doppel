// What the browser knows about the game: the room code format, the character list
// (public, like a deck of cards) and the shape of my_state's answer.
import characters from "../../data/characters.json";

export const CODE_LENGTH = 6;
export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 12;
/** Room codes have no 0, O, 1 or I. */
export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** What was typed, as a code: upper case, spaces and unknown characters dropped, 6 at most. */
export const cleanCode = (raw: string) =>
  [...raw.toUpperCase()].filter((c) => CODE_ALPHABET.includes(c)).join("").slice(0, CODE_LENGTH);

export type Character = { id: string; name: string; category: string; image: string | null };
const images = new Set((process.env.NEXT_PUBLIC_CHARACTER_IMAGES ?? "").split(","));
const byId = new Map((characters as Character[]).map((c) => [c.id, c]));

/** The character for a card, with its image only if the file exists (else the placeholder). */
export function character(id: string): Character {
  const c = byId.get(id) ?? { id, name: id, category: "", image: null };
  return { ...c, image: c.image && images.has(c.image) ? `/characters/${c.image}` : null };
}

export type Player = { id: string; name: string; host: boolean; connected: boolean; waiting: boolean };
/** The host's round timer: minutes 0 = Off. Times are the server's clock, in ms. */
export type Timer = { minutes: number; started_at: number | null; ends_at: number | null };
export const TIMER_MINUTES = [0, 1, 2, 3, 5] as const;
export type Room = { id: string; code: string; phase: "lobby" | "round"; round: number; host: boolean; host_changed_at: string | null; timer: Timer };
export type MyState =
  | { status: "none" | "removed" | "ended" }
  | {
      status: "in_room";
      /** The server's clock when it answered (ms). */
      now: number;
      room: Room;
      me: { id: string; waiting: boolean };
      players: Player[];
      card: { character: string; imposter: boolean } | null;
    };
