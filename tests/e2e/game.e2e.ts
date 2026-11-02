// The whole game on four phones (four browser contexts), against the local Supabase.
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import characters from "../../data/characters.json" with { type: "json" };
import { ACCOUNTS, api, leaveRooms, PASSWORD, PENDING } from "./accounts";

/** seen: every API response body and Realtime frame this phone received. */
type Phone = { page: Page; context: BrowserContext; name: string; seen: string[] };
const contexts: BrowserContext[] = [];

/**
 * Signs accounts from..n-1 in, each on its own phone. skews: how far each phone's clock is off
 * (ms), to prove the countdown follows the server's clock rather than the phone's.
 */
async function phones(browser: Browser, n = 4, from = 0, skews: number[] = []): Promise<Phone[]> {
  return Promise.all(
    ACCOUNTS.slice(from, n).map(async (a, i) => {
      const context = await browser.newContext();
      contexts.push(context);
      if (skews[i]) await context.clock.install({ time: Date.now() + skews[i] });
      // The timer's sound test hook (src/lib/sound.ts): every sound this page plays.
      await context.addInitScript(() => {
        const w = window as unknown as { sounds: string[] };
        w.sounds = [];
        addEventListener("doppel:sound", (e) => w.sounds.push((e as CustomEvent<string>).detail));
      });
      const page = await context.newPage();
      const seen: string[] = [];
      page.on("response", async (r) => {
        if (r.url().includes("/rest/v1/")) seen.push(await r.text().catch(() => ""));
      });
      // Supabase Realtime only (not the dev server's hot-reload socket, which carries the app's own code).
      page.on("websocket", (ws) => ws.url().includes("/realtime/") && ws.on("framereceived", (f) => seen.push(String(f.payload))));
      await page.goto("/");
      await expect(page).toHaveURL(/\/sign-in$/);
      await page.getByLabel("Username").fill(a.username);
      await page.getByLabel("Password").fill(PASSWORD);
      await page.getByRole("button", { name: "Sign in" }).click();
      await expect(page.getByRole("button", { name: "Create room" })).toBeVisible();
      return { page, context, name: a.name, seen };
    }),
  );
}

test.beforeEach(leaveRooms);

test.afterEach(async () => {
  await Promise.all(contexts.splice(0).map((c) => c.close().catch(() => {})));
});

async function createRoom(host: Phone) {
  await host.page.getByRole("button", { name: "Create room" }).click();
  const code = (await host.page.getByTestId("room-code").textContent())!;
  expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
  return code;
}

/** Types the code the sloppy way: lower case, with a space. */
async function join(p: Phone, code: string) {
  await p.page.getByLabel("Room code").fill(`${code.slice(0, 3).toLowerCase()} ${code.slice(3).toLowerCase()}`);
  await p.page.getByRole("button", { name: "Join", exact: true }).click();
}

async function room(browser: Browser, n = 4) {
  const all = await phones(browser, n);
  const code = await createRoom(all[0]);
  for (const p of all.slice(1)) {
    await join(p, code);
    await expect(p.page.getByTestId("room-code")).toHaveText(code);
  }
  for (const p of all) await expect(p.page.getByTestId("player")).toHaveCount(n);
  return { all, code, host: all[0] };
}

const names = (p: Phone) => p.page.getByTestId("player-name").allTextContents();

/** Holds the card down, reads it, lets go. layout: the face's element tree and size, without the character. */
async function peek(p: Phone) {
  const card = p.page.getByTestId("card");
  await expect(card).toBeVisible();
  await expect(p.page.getByTestId("card-name")).toHaveCount(0);
  await card.hover();
  await p.page.mouse.down();
  const face = p.page.getByTestId("card-face");
  const name = (await p.page.getByTestId("card-name").textContent())!;
  const text = (await face.textContent())!;
  const layout = await face.evaluate((el) => {
    // Layout size (offset*), not the on-screen box, which the press animation scales.
    const [width, height] = [(el as HTMLElement).offsetWidth, (el as HTMLElement).offsetHeight];
    const tree = [...el.querySelectorAll("*")].map((e) => `${e.tagName}.${e.getAttribute("class") ?? ""}`);
    return JSON.stringify({ width, height, tree, cls: el.className, anim: getComputedStyle(el).animation });
  });
  await p.page.mouse.up();
  await expect(p.page.getByTestId("card-name")).toHaveCount(0);
  return { name, text, layout };
}

async function confirm(p: Phone, button: string, ok = "Confirm") {
  await p.page.getByRole("button", { name: button, exact: true }).click();
  const dialog = p.page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: ok, exact: true }).click();
}

test("create, join and remove a player", async ({ browser }) => {
  const { all, code, host } = await room(browser);
  expect(await names(host)).toEqual(["Ann", "Ben", "Cho", "Dee"]);
  await expect(host.page.getByTestId("player").filter({ hasText: "Ann" })).toContainText("Host");
  // Only the host can remove; nobody else sees the button.
  await expect(all[1].page.getByRole("button", { name: /^Remove/ })).toHaveCount(0);

  // Cancel first, then confirm.
  await host.page.getByRole("button", { name: "Remove Dee" }).click();
  await host.page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
  await expect(host.page.getByRole("dialog")).toBeHidden();
  await expect(host.page.getByTestId("player")).toHaveCount(4);
  await confirm(host, "Remove Dee");

  await expect(host.page.getByTestId("player")).toHaveCount(3);
  await expect(all[1].page.getByTestId("player")).toHaveCount(3);
  const dee = all[3];
  await expect(dee.page.getByTestId("notice")).toHaveText("You were removed from this room.");
  await expect(dee.page.getByRole("button", { name: "Create room" })).toBeVisible();
  // They can't rejoin that room.
  await join(dee, code);
  await expect(dee.page.locator("#menu-error")).toHaveText("You were removed from this room.");
  // A wrong code says so plainly.
  await join(dee, "ZZZZZZ");
  await expect(dee.page.locator("#menu-error")).toHaveText("Room not found. Check the code.");

  // Leave room asks first; Cancel keeps you in.
  const ben = all[1];
  await ben.page.getByRole("button", { name: "Leave room" }).click();
  const dialog = ben.page.getByRole("dialog");
  await expect(dialog.getByRole("heading")).toHaveText("Leave this room?");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await expect(ben.page.getByTestId("room-code")).toHaveText(code);
  await ben.page.getByRole("button", { name: "Leave room" }).click();
  await dialog.getByRole("button", { name: "Leave", exact: true }).click();
  await expect(ben.page.getByRole("button", { name: "Create room" })).toBeVisible();
  await expect(host.page.getByTestId("player")).toHaveCount(2);
});

test("start a round: one player secretly has a different character; nobody's card or phone says who", async ({ browser }) => {
  const all = await phones(browser);
  const host = all[0];
  const code = await createRoom(host);
  // Start unlocks at 3 players.
  await join(all[1], code);
  await expect(host.page.getByRole("button", { name: "Start round" })).toBeDisabled();
  await expect(host.page.getByText("Needs 3 players to start (1 more)")).toBeVisible();
  await expect(all[1].page.getByRole("button", { name: "Start round" })).toHaveCount(0);
  for (const p of all.slice(2)) await join(p, code);
  await expect(host.page.getByTestId("player")).toHaveCount(4);
  await host.page.getByRole("button", { name: "Start round" }).click();

  const cards: Awaited<ReturnType<typeof peek>>[] = [];
  for (const p of all) cards.push(await peek(p));
  // Exactly one player has the other character of the pair.
  const count = (name: string) => cards.filter((c) => c.name === name).length;
  const doppel = cards.find((c) => count(c.name) === 1)!;
  const group = cards.find((c) => count(c.name) === 3)!;
  expect(doppel).toBeDefined();
  expect(group).toBeDefined();
  // No card shows a role, and every card is laid out and animated the same.
  for (const c of cards) {
    // Only the name (and the placeholder's initial): no role, label or stamp.
    expect(c.text.replace(c.name, "")).toBe(c.name[0]);
    expect(c.layout.replaceAll(c.name, "")).toBe(cards[0].layout.replaceAll(cards[0].name, ""));
  }

  // During the round no phone, the host's included, received the other character, a role, a
  // flag or a pair, in any API response or Realtime frame.
  const idOf = (name: string) => characters.find((c) => c.name === name)!.id;
  for (const [i, p] of all.entries()) {
    const other = cards[i].name === doppel.name ? group.name : doppel.name;
    const seen = p.seen.join("\n");
    expect(seen.length).toBeGreaterThan(0);
    expect(seen).not.toContain(idOf(other));
    expect(seen).not.toMatch(/imposter|doppel|is_imposter|"pair|"role"/i);
  }

  // Hold to reveal: only while held, and hidden again when the app goes to the background.
  const p = all[1].page;
  await p.getByTestId("card").hover();
  await p.mouse.down();
  await expect(p.getByTestId("card-name")).toBeVisible();
  await p.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(p.getByTestId("card-name")).toHaveCount(0);
  await p.mouse.up();

  // Host menus only for the host.
  await expect(host.page.getByRole("button", { name: "Restart" })).toBeVisible();
  for (const other of all.slice(1)) {
    await expect(other.page.getByText("Waiting for the host")).toBeVisible();
    for (const name of ["Reveal", "Restart", "End"]) await expect(other.page.getByRole("button", { name, exact: true })).toHaveCount(0);
  }
});

test("the host reveals the doppel: the same on every phone, through a refresh; Restart goes back to the game room", async ({ browser }) => {
  const { all, code, host } = await room(browser);
  await host.page.getByRole("button", { name: "Start round" }).click();
  const cards: Awaited<ReturnType<typeof peek>>[] = [];
  for (const p of all) cards.push(await peek(p));
  const count = (name: string) => cards.filter((c) => c.name === name).length;
  const doppelAt = cards.findIndex((c) => count(c.name) === 1);
  const doppel = { player: all[doppelAt].name, character: cards[doppelAt].name };
  const group = cards.find((c) => count(c.name) === 3)!.name;
  await host.page.getByRole("button", { name: "Start timer" }).click();
  await expect(all[1].page.getByTestId("timer")).toHaveAttribute("data-state", "running");

  // Only the host may reveal: nobody else has the button, and the database refuses them too.
  const ben = await api(ACCOUNTS[1]);
  const { data: s } = await ben.rpc("my_state");
  expect((await ben.rpc("reveal", { p_room: s.room.id })).error?.message).toBe("not_host");
  await expect(all[1].page.getByTestId("reveal")).toHaveCount(0);

  // It asks first; Cancel changes nothing.
  await host.page.getByRole("button", { name: "Reveal", exact: true }).click();
  const dialog = host.page.getByRole("dialog");
  await expect(dialog.getByRole("heading")).toHaveText("Reveal the doppel?");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await expect(host.page.getByTestId("card")).toBeVisible();
  await host.page.getByRole("button", { name: "Reveal", exact: true }).click();
  await dialog.getByRole("button", { name: "Reveal", exact: true }).click();

  const shows = async (p: Phone) => {
    await expect(p.page.getByTestId("reveal-title")).toHaveText(`The doppel was ${doppel.player}`);
    await expect(p.page.getByTestId("reveal-group").getByTestId("card-name")).toHaveText(group);
    await expect(p.page.getByTestId("reveal-doppel").getByTestId("card-name")).toHaveText(doppel.character);
    await expect(p.page.getByTestId("reveal-group")).toContainText("The group’s character");
    await expect(p.page.getByTestId("reveal-doppel")).toContainText("The doppel’s character");
    // The round is over: no card, no timer.
    await expect(p.page.getByTestId("card")).toHaveCount(0);
    await expect(p.page.getByTestId("timer")).toHaveCount(0);
  };
  for (const p of all) await shows(p);
  await expect(host.page.getByRole("button", { name: "Reveal", exact: true })).toHaveCount(0);
  await expect(host.page.getByRole("button", { name: "Start timer" })).toHaveCount(0);

  // It is stored: a refresh shows it again.
  await all[2].page.reload();
  await shows(all[2]);
  await host.page.reload();
  await shows(host);

  await confirm(host, "Restart");
  for (const p of all) {
    await expect(p.page.getByTestId("room-code")).toHaveText(code);
    await expect(p.page.getByTestId("reveal")).toHaveCount(0);
  }
});

test("Restart keeps the list (and adds late joiners); End closes the room", async ({ browser }) => {
  const { all, code, host } = await room(browser, 3);
  const [late] = await phones(browser, 4, 3);
  await host.page.getByRole("button", { name: "Start round" }).click();
  for (const p of all) await expect(p.page.getByTestId("card")).toBeVisible();

  await join(late, code);
  await expect(late.page.getByTestId("queued")).toHaveText("Round in progress, you’ll join next round");

  await confirm(host, "Restart");
  for (const p of [...all, late]) {
    await expect(p.page.getByTestId("room-code")).toHaveText(code);
    await expect(p.page.getByTestId("player")).toHaveCount(4);
  }
  expect(await names(all[1])).toEqual(["Ann", "Ben", "Cho", "Dee"]);

  await host.page.getByRole("button", { name: "Start round" }).click();
  await expect(late.page.getByTestId("card")).toBeVisible();
  await confirm(host, "End");
  await expect(host.page.getByRole("button", { name: "Create room" })).toBeVisible();
  for (const p of [...all.slice(1), late]) {
    await expect(p.page.getByRole("button", { name: "Create room" })).toBeVisible();
    await expect(p.page.getByTestId("notice")).toHaveText("The room has ended.");
  }
  // The code no longer works.
  await join(all[1], code);
  await expect(all[1].page.locator("#menu-error")).toHaveText("Room not found. Check the code.");
});

test("the host disconnects; after 3 minutes (not before) the role passes", async ({ browser }) => {
  test.setTimeout(300_000);
  const { all, host } = await room(browser);
  await host.context.close();
  const closedAt = Date.now();
  const [ben, cho] = all.slice(1);
  const ann = ben.page.getByTestId("player").filter({ hasText: "Ann" });
  // Away after ~25 s, but still the host well past a minute.
  await expect(ann).toContainText("away", { timeout: 45_000 });
  await ben.page.waitForTimeout(Math.max(0, 90_000 - (Date.now() - closedAt)));
  await expect(ann).toContainText("Host");
  // The role passes after 3 minutes (plus up to one 10 s heartbeat).
  await expect(ben.page.getByTestId("notice")).toHaveText(/^(Ben|Cho|Dee) is now the host$/, { timeout: 150_000 });
  // 3 minutes from the host's last heartbeat, which was at most 10 s before the close.
  expect(Date.now() - closedAt).toBeGreaterThanOrEqual(170_000);
  const newHost = (await ben.page.getByTestId("notice").textContent())!.replace(" is now the host", "");
  await expect(cho.page.getByText(`${newHost} is now the host`)).toBeVisible({ timeout: 15_000 });
  const phone = all.find((p) => p.name === newHost)!;
  await expect(phone.page.getByRole("button", { name: "Start round" })).toBeEnabled();
  await expect(ben.page.getByTestId("player").filter({ hasText: newHost })).toContainText("Host");
});

test("refresh mid-round restores the room, the round and the card", async ({ browser }) => {
  const { all, code, host } = await room(browser, 3);
  await host.page.getByRole("button", { name: "Start round" }).click();
  const before = await peek(all[1]);
  await all[1].page.reload();
  expect(await peek(all[1])).toEqual(before);
  // Closing the tab and opening the site again works the same, and the host keeps the menus.
  const reopened = await host.context.newPage();
  await host.page.close();
  await reopened.goto("/");
  await expect(reopened.getByRole("button", { name: "Restart" })).toBeVisible();
  await confirm({ ...host, page: reopened }, "Restart");
  await expect(all[2].page.getByTestId("room-code")).toHaveText(code);
});

/** What each phone's countdown shows as left (ms), read on all of them at once. */
const lefts = (all: Phone[]) =>
  Promise.all(all.map((p) => p.page.getByTestId("timer").evaluate((el) => Number((el as HTMLElement).dataset.endsLocal) - Date.now())));
const spread = (xs: number[]) => Math.max(...xs) - Math.min(...xs);
const sounds = (p: Phone) => p.page.evaluate(() => (window as unknown as { sounds: string[] }).sounds);

test("round timer: the host's, the same on every phone (clocks off by seconds), through a refresh; sound on the host's only", async ({ browser }) => {
  test.setTimeout(150_000);
  const all = await phones(browser, 4, 0, [0, 7_000, -4_000, 2_500]);
  const [host, ...others] = all;
  // The clocks really are off.
  const hostNow = await host.page.evaluate(() => Date.now());
  expect((await all[1].page.evaluate(() => Date.now())) - hostNow).toBeGreaterThan(6_000);
  const code = await createRoom(host);
  for (const p of others) await join(p, code);
  for (const p of all) await expect(p.page.getByTestId("player")).toHaveCount(4);

  // 2 minutes by default; only the host picks; everyone sees it.
  for (const p of others) {
    await expect(p.page.getByTestId("timer-minutes")).toHaveText("2 min");
    await expect(p.page.getByRole("radio")).toHaveCount(0);
  }
  await host.page.getByRole("radio", { name: "1 min" }).click();
  for (const p of others) await expect(p.page.getByTestId("timer-minutes")).toHaveText("1 min");

  // Never started on its own.
  await host.page.getByRole("button", { name: "Start round" }).click();
  for (const p of all) await expect(p.page.getByTestId("timer-text")).toHaveText("1:00");
  for (const p of others) await expect(p.page.getByRole("button", { name: "Start timer" })).toHaveCount(0);
  await host.page.waitForTimeout(1_500);
  for (const p of all) await expect(p.page.getByTestId("timer")).toHaveAttribute("data-state", "idle");

  await host.page.getByRole("button", { name: "Start timer" }).click();
  for (const p of all) await expect(p.page.getByTestId("timer")).toHaveAttribute("data-ends-local", /\d/);
  expect(spread(await lefts(all))).toBeLessThan(500);
  // The bar sits above the card and never covers it.
  const bar = (await host.page.getByTestId("timer").boundingBox())!;
  const card = (await host.page.getByTestId("card").boundingBox())!;
  expect(bar.y + bar.height).toBeLessThanOrEqual(card.y);

  // A refresh mid-countdown comes back to the same time.
  await all[2].page.reload();
  await expect(all[2].page.getByTestId("timer")).toHaveAttribute("data-ends-local", /\d/);
  await all[2].page.waitForTimeout(1_000);
  expect(spread(await lefts(all))).toBeLessThan(500);
  await expect(all[2].page.getByTestId("timer")).toHaveAttribute("data-state", "running");

  for (const p of all) await expect(p.page.getByTestId("timer-text")).toHaveText("Time’s up", { timeout: 75_000 });
  // The last 5 seconds tick and 0 chimes, on the host's phone only.
  expect(await sounds(host)).toEqual(["tick", "tick", "tick", "tick", "tick", "chime"]);
  for (const p of others) expect(await sounds(p)).toEqual([]);
});

test("round timer: +30 s and Stop (host only), Restart clears it, Off hides it", async ({ browser }) => {
  const { all, host } = await room(browser, 3);
  await host.page.getByRole("button", { name: "Start round" }).click();
  await host.page.getByRole("button", { name: "Start timer" }).click();
  for (const p of all) await expect(p.page.getByTestId("timer")).toHaveAttribute("data-state", "running");

  // Only the host may: the others' calls are refused by the database too.
  const ben = await api(ACCOUNTS[1]);
  const { data: s } = await ben.rpc("my_state");
  for (const action of ["start", "add", "stop"]) {
    const { error } = await ben.rpc("timer", { p_room: s.room.id, p_action: action });
    expect(error?.message).toBe("not_host");
  }
  for (const name of ["Start timer", "+30 s", "Stop"]) await expect(all[1].page.getByRole("button", { name, exact: true })).toHaveCount(0);

  await host.page.getByRole("button", { name: "+30 s" }).click();
  for (const p of all) await expect(p.page.getByTestId("timer-text")).toHaveText(/^2:(2\d|30)$/);
  await host.page.getByRole("button", { name: "Stop", exact: true }).click();
  for (const p of all) {
    await expect(p.page.getByTestId("timer")).toHaveAttribute("data-state", "idle");
    await expect(p.page.getByTestId("timer-text")).toHaveText("2:00");
  }

  // Restart clears it.
  await host.page.getByRole("button", { name: "Start timer" }).click();
  await expect(all[1].page.getByTestId("timer")).toHaveAttribute("data-state", "running");
  await confirm(host, "Restart");
  await host.page.getByRole("button", { name: "Start round" }).click();
  for (const p of all) await expect(p.page.getByTestId("timer")).toHaveAttribute("data-state", "idle");

  // Off hides it everywhere.
  await confirm(host, "Restart");
  await host.page.getByRole("radio", { name: "Off" }).click();
  await expect(all[1].page.getByTestId("timer-minutes")).toHaveText("Off");
  await expect(host.page.getByRole("switch", { name: "Timer sound" })).toHaveCount(0);
  await host.page.getByRole("button", { name: "Start round" }).click();
  for (const p of all) {
    await expect(p.page.getByTestId("card")).toBeVisible();
    await expect(p.page.getByTestId("timer")).toHaveCount(0);
  }
  await expect(host.page.getByRole("button", { name: "Start timer" })).toHaveCount(0);
});

test("sign-in: only approved accounts get in, with the shared rules", async ({ page }) => {
  const signIn = async (username: string, password: string) => {
    await page.getByLabel("Username").fill(username);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
  };
  await page.goto("/");
  await expect(page).toHaveURL(/\/sign-in$/);
  await signIn(ACCOUNTS[0].username, "not-the-password");
  await expect(page.locator("form [role=alert]")).toHaveText("Wrong username or password.");
  // Unknown names get the same answer.
  await signIn("nobody_here", PASSWORD);
  await expect(page.locator("form [role=alert]")).toHaveText("Wrong username or password.");
  await signIn(PENDING.username, PASSWORD);
  await expect(page.locator("form [role=alert]")).toHaveText("Your account is waiting for approval.");
  await page.goto("/");
  await expect(page).toHaveURL(/\/sign-in$/);
  // Usernames ignore case, as in the shared sign-in.
  await signIn(ACCOUNTS[0].username.toUpperCase(), PASSWORD);
  await expect(page.getByText("Signed in as Ann")).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
});

// npm run screens (only then): the README's screenshots, phone and desktop.
test("screenshots for the README @screens", async ({ browser }) => {
  test.setTimeout(120_000);
  // Phone, tablet (portrait) and desktop; SCREENS_SIZES="1024x768,..." and SCREENS_DIR try others.
  const sizes = (process.env.SCREENS_SIZES ?? "390x844,820x1180,1440x900").split(",").map((wh) => {
    const [width, height] = wh.split("x").map(Number);
    return { width, height };
  });
  const dir = process.env.SCREENS_DIR ?? "docs/screens";
  const shoot = async (page: Page, name: string, hold = false) => {
    for (const size of sizes) {
      await page.setViewportSize(size);
      await page.waitForFunction(() => [...document.images].every((i) => i.complete));
      if (hold) {
        await page.getByTestId("card").hover();
        await page.mouse.down();
        await expect(page.getByTestId("card-name")).toBeVisible();
        await page.waitForFunction(() => [...document.images].every((i) => i.complete));
      }
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${dir}/${name}-${size.width}.jpg`, type: "jpeg", quality: 82 });
      if (hold) await page.mouse.up();
    }
    await page.setViewportSize(sizes[0]);
  };
  const all = await phones(browser);
  const host = all[0];
  await shoot(all[3].page, "menu");
  const code = await createRoom(host);
  for (const p of all.slice(1)) await join(p, code);
  for (const p of all) await expect(p.page.getByTestId("player")).toHaveCount(4);
  await shoot(host.page, "room");
  await host.page.getByRole("button", { name: "Start round" }).click();
  await host.page.getByRole("button", { name: "Start timer" }).click();
  await host.page.waitForTimeout(5_000);
  await shoot(all[1].page, "card", true);
  await confirm(host, "Reveal", "Reveal");
  await expect(all[1].page.getByTestId("reveal")).toBeVisible();
  await all[1].page.waitForTimeout(800);
  await shoot(all[1].page, "reveal");
});
