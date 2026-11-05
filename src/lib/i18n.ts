// English and Burmese. The choice lives in a cookie so pages render in the right language on the server.
// DRAFT: every Burmese line below was drafted for the owner to review (README "Owner steps").
export type Locale = "en" | "my";
export const LOCALE_COOKIE = "locale";

const en = {
  "app.title": "Doppel",
  "app.edition": "PolyHydra · Free-To-Play",
  "lang.label": "Language",

  "menu.signedIn": "Signed in as {name}",
  "menu.signOut": "Sign out",
  "menu.create": "Create room",
  "menu.or": "or join a room",
  "menu.code": "Room code",
  "menu.join": "Join",
  "how.title": "How to play",
  "how.1": "Everyone joins the same room on their own phone.",
  "how.2": "The host starts a round. Hold to see your card, and keep it hidden from others.",
  "how.3": "Everyone gets a character, but one player secretly has a related but different one: the doppel.",
  "how.4": "Nobody knows if they’re the doppel, not even the doppel. Take turns giving one clue out loud, carefully, and suspect everyone.",
  "how.5": "Vote out loud on who the doppel is. Then the host taps Reveal the doppel, and everyone sees who it was.",

  "room.code": "Room code",
  "room.copy": "Copy code",
  "room.copied": "Copied",
  "room.copyFailed": "Select the code to copy it",
  "room.players": "Players",
  "room.host": "Host",
  "room.you": "you",
  "room.connected": "connected",
  "room.away": "away",
  "room.remove": "Remove",
  "room.removeTitle": "Remove {name}?",
  "room.removeBody": "They can’t rejoin this room.",
  "room.start": "Start round",
  "room.needMore": "Needs 3 players to start ({n} more)",
  "room.waitHost": "Waiting for the host to start",
  "room.leave": "Leave room",
  "room.leaveTitle": "Leave this room?",
  "room.leaveOk": "Leave",

  "timer.label": "Round timer",
  "timer.off": "Off",
  "timer.minutes": "{n} min",
  "timer.sound": "Timer sound",
  "timer.start": "Start timer",
  "timer.add": "+30 s",
  "timer.stop": "Stop",
  "timer.up": "Time’s up",

  "round.label": "Round {n}",
  "round.hold": "Hold to see your card",
  "round.holdHint": "Keep it hidden from others",
  "round.cardLabel": "Your card. Press and hold to see it.",
  "round.waitHost": "Waiting for the host",
  "round.queued": "Round in progress, you’ll join next round",
  "round.reveal": "Reveal the doppel",
  "round.revealTitle": "Reveal the doppel to everyone?",
  "round.revealOk": "Reveal",
  "reveal.title": "The doppel was {name}",
  "reveal.group": "The group’s character",
  "reveal.doppel": "The doppel’s character",
  "round.restart": "Restart",
  "round.restartTitle": "Restart?",
  "round.restartBody": "Everyone goes back to the game room. The player list is kept.",
  "round.end": "End",
  "round.endTitle": "End the room?",
  "round.endBody": "The room closes and everyone goes back to the main menu.",

  "confirm.cancel": "Cancel",
  "confirm.ok": "Confirm",

  "conn.connected": "Connected",
  "conn.reconnecting": "Reconnecting…",
  "conn.offline": "Offline",

  "notice.host": "{name} is now the host",

  "error.room_not_found": "Room not found. Check the code.",
  "error.room_full": "This room is full (12 players).",
  "error.removed": "You were removed from this room.",
  "error.ended": "The room has ended.",
  "error.not_enough_players": "You need at least 3 players.",
  "error.not_host": "Only the host can do that.",
  "error.not_allowed": "This account can’t play right now.",
  "error.no_pairs": "No characters are set up yet.",
  "error.generic": "Something went wrong. Try again.",

  "signin.title": "Sign in",
  "signin.lead": "Use your PolyHydra account.",
  "signin.username": "Username",
  "signin.password": "Password",
  "signin.submit": "Sign in",
  "signin.busy": "Signing in…",
  "signin.wrong": "Wrong username or password.",
  "signin.locked": "Too many tries. Wait 15 minutes, then try again.",
  "signin.pending": "Your account is waiting for approval.",
  "signin.blocked": "This account can’t play.",
  "signin.off": "Sign-in isn’t set up yet.",
  "signin.invite": "No account? PolyHydra accounts come by invite only.",
} as const;

export type Key = keyof typeof en;

// DRAFT (owner to review).
const my: Record<Key, string> = {
  "app.title": "Doppel",
  "app.edition": "PolyHydra · Free-To-Play",
  "lang.label": "ဘာသာစကား",

  "menu.signedIn": "{name} အဖြစ် ဝင်ထားသည်",
  "menu.signOut": "ထွက်မည်",
  "menu.create": "အခန်း ဖွင့်မည်",
  "menu.or": "သို့မဟုတ် အခန်းသို့ ဝင်ပါ",
  "menu.code": "အခန်းကုဒ်",
  "menu.join": "ဝင်မည်",
  "how.title": "ကစားနည်း",
  "how.1": "လူတိုင်း ကိုယ့်ဖုန်းဖြင့် အခန်းတစ်ခုတည်းသို့ ဝင်ပါ။",
  // REVIEW: new wording (Nov 2026), "Hold to see your card".
  "how.2": "အိမ်ရှင်က အကြိမ်ကို စပါမည်။ ဖိထားပြီး သင့်ကတ်ကို ကြည့်ပါ၊ သူများကို မပြပါနှင့်။",
  "how.3": "လူတိုင်း ဇာတ်ကောင်တစ်ခုစီ ရပါမည်၊ သို့သော် ကစားသူတစ်ယောက်သည် ဆက်စပ်သော်လည်း မတူသော ဇာတ်ကောင်ကို လျှို့ဝှက်စွာ ရထားပါမည်- ၎င်းသည် doppel ဖြစ်သည်။",
  "how.4": "မိမိသည် doppel ဟုတ်မဟုတ် မည်သူမျှ မသိပါ၊ doppel ကိုယ်တိုင်ပင် မသိပါ။ အလှည့်ကျ အရိပ်အမြွက်တစ်ခုစီ သတိထား၍ အသံထွက် ပြောပါ၊ လူတိုင်းကို သံသယဝင်ပါ။",
  // REVIEW: new wording, "Then the host taps Reveal the doppel, and everyone sees who it was."
  "how.5": "doppel ဘယ်သူလဲ အသံထွက် မဲပေးပါ။ ပြီးလျှင် အိမ်ရှင်က doppel ကို ဖော်ပြမည် ကို နှိပ်ပြီး ဘယ်သူလဲ လူတိုင်း မြင်ရပါမည်။",

  "room.code": "အခန်းကုဒ်",
  "room.copy": "ကုဒ် ကူးမည်",
  "room.copied": "ကူးပြီး",
  // REVIEW: new line, "Select the code to copy it".
  "room.copyFailed": "ကုဒ်ကို ရွေးပြီး ကူးပါ",
  "room.players": "ကစားသူများ",
  "room.host": "အိမ်ရှင်",
  "room.you": "သင်",
  "room.connected": "ချိတ်ဆက်ထားသည်",
  "room.away": "ခဏ မရှိ",
  "room.remove": "ဖယ်မည်",
  "room.removeTitle": "{name} ကို ဖယ်မလား။",
  "room.removeBody": "ဤအခန်းသို့ ပြန်ဝင်၍ မရတော့ပါ။",
  "room.start": "အကြိမ် စမည်",
  "room.needMore": "စရန် ကစားသူ ၃ ယောက် လိုသည် (နောက်ထပ် {n} ယောက်)",
  "room.waitHost": "အိမ်ရှင် စရန် စောင့်နေသည်",
  "room.leave": "အခန်းမှ ထွက်မည်",
  "room.leaveTitle": "ဤအခန်းမှ ထွက်မလား။",
  "room.leaveOk": "ထွက်မည်",

  "timer.label": "အကြိမ်ချိန်",
  "timer.off": "ပိတ်",
  "timer.minutes": "{n} မိနစ်",
  "timer.sound": "အချိန်မှတ် အသံ",
  "timer.start": "အချိန် စမှတ်မည်",
  "timer.add": "+၃၀ စက္ကန့်",
  "timer.stop": "ရပ်မည်",
  "timer.up": "အချိန်ပြည့်ပြီ",

  "round.label": "အကြိမ် {n}",
  // REVIEW: new wording, "Hold to see your card".
  "round.hold": "ဖိထားပြီး သင့်ကတ်ကို ကြည့်ပါ",
  "round.holdHint": "သူများ မမြင်ပါစေနှင့်",
  "round.cardLabel": "သင့်ကတ်။ ဖိထားပြီး ကြည့်ပါ။",
  "round.waitHost": "အိမ်ရှင်ကို စောင့်နေသည်",
  "round.queued": "အကြိမ် ကစားနေဆဲ ဖြစ်သည်၊ နောက်အကြိမ်တွင် ပါဝင်ရပါမည်",
  // REVIEW: new wording, "Reveal the doppel" (the host's button).
  "round.reveal": "doppel ကို ဖော်ပြမည်",
  // REVIEW: new wording, "Reveal the doppel to everyone?".
  "round.revealTitle": "doppel ကို လူတိုင်းအား ဖော်ပြမလား။",
  "round.revealOk": "ဖော်ပြမည်",
  "reveal.title": "doppel မှာ {name} ဖြစ်သည်",
  "reveal.group": "အုပ်စု၏ ဇာတ်ကောင်",
  "reveal.doppel": "doppel ၏ ဇာတ်ကောင်",
  "round.restart": "ပြန်စမည်",
  "round.restartTitle": "ပြန်စမလား။",
  "round.restartBody": "လူတိုင်း ဂိမ်းအခန်းသို့ ပြန်သွားပါမည်။ ကစားသူစာရင်း ဆက်ရှိပါမည်။",
  "round.end": "ပိတ်မည်",
  "round.endTitle": "အခန်းကို ပိတ်မလား။",
  "round.endBody": "အခန်း ပိတ်သွားပြီး လူတိုင်း ပင်မမီနူးသို့ ပြန်သွားပါမည်။",

  "confirm.cancel": "မလုပ်တော့ပါ",
  "confirm.ok": "အတည်ပြုမည်",

  "conn.connected": "ချိတ်ဆက်ထားသည်",
  "conn.reconnecting": "ပြန်ချိတ်နေသည်…",
  "conn.offline": "အင်တာနက် မရှိ",

  "notice.host": "{name} သည် ယခု အိမ်ရှင် ဖြစ်သည်",

  "error.room_not_found": "အခန်း မတွေ့ပါ။ ကုဒ်ကို စစ်ကြည့်ပါ။",
  "error.room_full": "ဤအခန်း ပြည့်နေပြီ (ကစားသူ ၁၂ ယောက်)။",
  "error.removed": "သင့်ကို ဤအခန်းမှ ဖယ်ထားသည်။",
  "error.ended": "အခန်း ပိတ်သွားပြီ။",
  "error.not_enough_players": "ကစားသူ အနည်းဆုံး ၃ ယောက် လိုသည်။",
  "error.not_host": "အိမ်ရှင်သာ လုပ်နိုင်သည်။",
  "error.not_allowed": "ဤအကောင့်ဖြင့် ယခု ကစား၍ မရပါ။",
  "error.no_pairs": "ဇာတ်ကောင်များ မသတ်မှတ်ရသေးပါ။",
  "error.generic": "တစ်ခုခု မှားသွားသည်။ ထပ်ကြိုးစားပါ။",

  "signin.title": "ဝင်ရောက်ရန်",
  "signin.lead": "သင့် PolyHydra အကောင့်ကို သုံးပါ။",
  "signin.username": "အသုံးပြုသူအမည်",
  "signin.password": "စကားဝှက်",
  "signin.submit": "ဝင်မည်",
  "signin.busy": "ဝင်နေသည်…",
  "signin.wrong": "အသုံးပြုသူအမည် သို့မဟုတ် စကားဝှက် မှားနေသည်။",
  "signin.locked": "ကြိုးစားမှု များလွန်းသည်။ ၁၅ မိနစ် စောင့်ပြီး ထပ်ကြိုးစားပါ။",
  "signin.pending": "သင့်အကောင့် အတည်ပြုချက်ကို စောင့်နေဆဲ ဖြစ်သည်။",
  "signin.blocked": "ဤအကောင့်ဖြင့် ကစား၍ မရပါ။",
  "signin.off": "ဝင်ရောက်မှုကို မပြင်ဆင်ရသေးပါ။",
  "signin.invite": "အကောင့် မရှိသေးဘူးလား။ PolyHydra အကောင့်များကို ဖိတ်ကြားမှဖြင့်သာ ရနိုင်သည်။",
};

export const messages: Record<Locale, Record<Key, string>> = { en, my };

export const isLocale = (v: unknown): v is Locale => v === "en" || v === "my";

export function translate(locale: Locale, key: Key, vars: Record<string, string | number> = {}) {
  return messages[locale][key].replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
}

/** A database error ("room_full", …) as a message key. */
export function errorKey(message: string | undefined): Key {
  const key = `error.${message ?? ""}` as Key;
  return key in en ? key : "error.generic";
}
