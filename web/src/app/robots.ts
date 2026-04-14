import type { MetadataRoute } from "next";

const APP_URL = "https://reharse.inferix.in";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/pricing", "/sign-in", "/sign-up"],
        disallow: [
          "/dashboard/",
          "/interview/",
          "/onboarding/",
          "/api/",
          "/coach/",
          "/sessions/",
          "/tools/",
        ],
      },
    ],
    sitemap: `${APP_URL}/sitemap.xml`,
    host: APP_URL,
  };
}
