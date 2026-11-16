import type { MetadataRoute } from "next";
import { getSitemapData } from "@/lib/data";
import { SITE_URL } from "@/lib/site";

// Only pages with real results are listed; untested providers and plans are
// marked noindex on their own pages.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const data = await getSitemapData();
  const at = (d: Date | null) => d ?? undefined;
  return [
    { url: `${SITE_URL}/`, lastModified: at(data.lastModified), changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/providers`, lastModified: at(data.lastModified), changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/methodology`, changeFrequency: "monthly", priority: 0.6 },
    ...data.providers.map((p) => ({
      url: `${SITE_URL}/provider/${p.slug}`,
      lastModified: at(p.lastModified),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    ...data.plans.map((p) => ({
      url: `${SITE_URL}/plan/${p.slug}`,
      lastModified: at(p.lastModified),
      changeFrequency: "weekly" as const,
      priority: 0.9,
    })),
    ...data.trials.map((t) => ({
      url: `${SITE_URL}/test/${t.id}`,
      lastModified: at(t.lastModified),
      changeFrequency: "yearly" as const,
      priority: 0.4,
    })),
  ];
}
