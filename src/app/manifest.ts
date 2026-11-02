import type { MetadataRoute } from "next";
import { art } from "@/lib/art";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Doppel",
    short_name: "Doppel",
    description: "A PolyHydra Free-To-Play party game for one room of phones.",
    start_url: "/",
    display: "standalone",
    background_color: "#e4d8bb",
    theme_color: "#e4d8bb",
    icons: art.icons
      ? [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
        ]
      : [],
  };
}
