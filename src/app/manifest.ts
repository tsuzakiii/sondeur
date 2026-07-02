import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Sondeur",
    short_name: "Sondeur",
    description: "Select any phrase and drill deeper with What / Why",
    start_url: "/",
    display: "standalone",
    background_color: "#e8ecf3",
    theme_color: "#e8ecf3",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
