import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { measureCard } from "../scripts/art.mjs";
import { checkData } from "../scripts/check-data.mjs";
import { character, cleanCode, CODE_ALPHABET } from "@/lib/game";
import { errorKey, messages } from "@/lib/i18n";

describe("room codes", () => {
  test("typing ignores case and spaces", () => {
    expect(cleanCode(" ab c2 34 ")).toBe("ABC234");
    expect(cleanCode("abcdefgh")).toBe("ABCDEF");
  });
  test("0, O, 1 and I are never part of a code", () => {
    for (const c of "0O1I") expect(CODE_ALPHABET).not.toContain(c);
    expect(cleanCode("O0I1ab")).toBe("AB");
  });
});

describe("text", () => {
  test("English and Burmese have the same keys, none empty", () => {
    expect(Object.keys(messages.my).sort()).toEqual(Object.keys(messages.en).sort());
    for (const [k, v] of Object.entries(messages.my)) expect(v.trim(), k).not.toBe("");
  });
  test("every database error has a plain message", () => {
    for (const code of ["room_not_found", "room_full", "removed", "not_enough_players", "not_host", "not_allowed", "no_pairs"]) {
      expect(errorKey(code)).toBe(`error.${code}`);
    }
    expect(errorKey("TypeError: Failed to fetch")).toBe("error.generic");
  });
});

describe("characters", () => {
  test("the seed data passes the data check", () => {
    const { errors, characters, pairs } = checkData();
    expect(errors).toEqual([]);
    expect(characters).toBeGreaterThanOrEqual(12);
    expect(pairs).toBeGreaterThanOrEqual(8);
  });
  test("the check catches bad data", () => {
    const chars = [
      { id: "a", name: "A", category: "actor", image: "a.webp" },
      { id: "a", name: "", category: "actor", image: "x.png" },
    ];
    const { errors } = checkData(chars, [["a", "nobody"], ["a", "a"]]);
    expect(errors.join("\n")).toMatch(/duplicate id/);
    expect(errors.join("\n")).toMatch(/name is missing/);
    expect(errors.join("\n")).toMatch(/image must be/);
    expect(errors.join("\n")).toMatch(/unknown character "nobody"/);
    expect(errors.join("\n")).toMatch(/two different characters/);
  });
  test("a character without its image file uses the placeholder", () => {
    expect(character("goku").image).toBeNull();
    expect(character("goku").name).toBe("Goku");
  });
});

test("the service-role key is only used on the server and in scripts", () => {
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : [join(dir, f)]));
  const using = files("src").filter((f) => readFileSync(f, "utf8").includes("SUPABASE_SERVICE_ROLE_KEY"));
  expect(using.map((f) => f.replaceAll("\\", "/"))).toEqual(["src/server/supabase.ts"]);
  for (const f of files("src")) expect(readFileSync(f, "utf8"), f).not.toMatch(/NEXT_PUBLIC_[A-Z_]*SERVICE/);
});

test("npm run art finds the card's grey window and its cream nameplate, as percentages", () => {
  const [width, height] = [200, 280];
  const data = new Uint8Array(width * height * 4);
  const paint = (x0: number, y0: number, x1: number, y1: number, rgb: number[], alpha = 255) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) data.set([...rgb, alpha], (y * width + x) * 4);
  };
  const [cream, grey, green] = [[240, 230, 198], [190, 190, 190], [90, 120, 70]];
  paint(0, 0, width, height, cream);
  paint(0, 0, 8, 1, [255, 255, 255], 0); // a rounded corner, cleared
  paint(20, 20, 180, 180, grey);
  // The nameplate's frame, with a faint 3 px gap in its top line.
  paint(15, 195, 185, 197, green);
  paint(15, 250, 185, 252, green);
  paint(15, 195, 17, 252, green);
  paint(183, 195, 185, 252, green);
  paint(100, 195, 103, 197, cream);
  expect(measureCard({ data, width, height })).toEqual({
    aspect: 0.7143,
    radius: 4,
    window: { x: 10, y: 7.14, w: 80, h: 57.14 },
    nameplate: { x: 8.5, y: 70.36, w: 83, h: 18.93 },
  });
});
