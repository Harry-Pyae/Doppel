// The whole game on four phones (four browser contexts), against the local Supabase.
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import characters from "../../data/characters.json" with { type: "json" };
import { ACCOUNTS, leaveRooms, PASSWORD, PENDING } from "./accounts";

/** seen: every API response body and Realtime frame this phone received. */
type Phone = { page: Page; context: BrowserContext; name: string; seen: string[] };
const contexts: BrowserContext[] = [];

/** Signs accounts from..to-1 in, each on its own phone. */
async function phones(browser: Browser, n = 4, from = 0): Promise<Phone[]> {
  return Promise.all(
    ACCOUNTS.slice(from, n).map(async (a) => {
      const context = await browser.newContext();
      contexts.push(context);
      const page = await context.newPage();
      const seen: string[] = [];
      page.on("response", async (r) => {
        if (r.url().includes("/rest/v1/")) seen.push(await r.text().catch(() => ""));
      });
      page.on("websocket", (ws) => ws.on("framereceived", (f) => seen.push(String(f.payload))));
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

/** Holds the card down, reads it, lets go. */
async function reveal(p: Phone) {
  const card = p.page.getByTestId("card");
  await expect(card).toBeVisible();
  await expect(p.page.getByTestId("card-name")).toHaveCount(0);
  await card.hover();
  await p.page.mouse.down();
  const name = (await p.page.getByTestId("card-name").textContent())!;
  const imposter = (await p.page.getByTestId("imposter").count()) === 1;
  await p.page.mouse.up();
  await expect(p.page.getByTestId("card-name")).toHaveCount(0);
  return { name, imposter };
}

async function confirm(p: Phone, button: string) {
  await p.page.getByRole("button", { name: button, exact: true }).click();
  const dialog = p.page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Confirm" }).click();
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

test("start a round: exactly one imposter, the others share one character; hold to reveal", async ({ browser }) => {
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

  const cards = [];
  for (const p of all) cards.push(await reveal(p));
  const imposters = cards.filter((c) => c.imposter);
  expect(imposters).toHaveLength(1);
  const others = new Set(cards.filter((c) => !c.imposter).map((c) => c.name));
  expect(others.size).toBe(1);
  expect(others.has(imposters[0].name)).toBe(false);

  // No phone ever received the other side's character, in any response or Realtime frame.
  const idOf = (name: string) => characters.find((c) => c.name === name)!.id;
  const [majority] = others;
  for (const [i, p] of all.entries()) {
    const other = cards[i].imposter ? majority : imposters[0].name;
    expect(p.seen.length).toBeGreaterThan(0);
    expect(p.seen.join("\n")).not.toContain(idOf(other));
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
    await expect(other.page.getByRole("button", { name: "Restart" })).toHaveCount(0);
    await expect(other.page.getByRole("button", { name: "End", exact: true })).toHaveCount(0);
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
  const before = await reveal(all[1]);
  await all[1].page.reload();
  expect(await reveal(all[1])).toEqual(before);
  // Closing the tab and opening the site again works the same, and the host keeps the menus.
  const reopened = await host.context.newPage();
  await host.page.close();
  await reopened.goto("/");
  await expect(reopened.getByRole("button", { name: "Restart" })).toBeVisible();
  await confirm({ ...host, page: reopened }, "Restart");
  await expect(all[2].page.getByTestId("room-code")).toHaveText(code);
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
