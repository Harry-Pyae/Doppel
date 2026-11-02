// The processed art (npm run art) that exists at build time; next.config.ts checks the files.
// Anything missing keeps its placeholder: no menu background, the plain card, no icons.
type Box = { x: number; y: number; w: number; h: number };
/** Positions on the card art, in % of its width and height (data/card-layout.json). */
export type CardLayout = { aspect: number; radius: number; window: Box; nameplate: Box };
export type Art = {
  icons?: boolean;
  menu?: { color: string; files: { src: string; width: number }[] };
  card?: CardLayout;
};

export const art: Art = JSON.parse(process.env.NEXT_PUBLIC_ART || "{}");
