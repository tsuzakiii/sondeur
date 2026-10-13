import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sondeur.app";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_URL}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/about`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/legal/terms`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/legal/privacy`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/legal/tokushoho`, changeFrequency: "yearly", priority: 0.2 },
  ];
}
