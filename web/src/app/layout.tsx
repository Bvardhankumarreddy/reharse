import type { Metadata } from "next";
import "./globals.css";

const APP_URL = "https://reharse.inferix.in";

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),

  title: {
    default: "Rehearse — AI Mock Interview Coach",
    template: "%s | Rehearse",
  },
  description:
    "Ace your next interview with Rehearse — an AI coach that conducts realistic mock interviews, gives honest feedback, tracks your weak areas, and adapts to your level. Practice behavioral, technical, and system design interviews anytime.",

  keywords: [
    "AI mock interview",
    "interview practice",
    "interview coach",
    "behavioral interview prep",
    "technical interview practice",
    "system design interview",
    "job interview preparation",
    "AI interview feedback",
    "mock interview platform",
    "software engineer interview",
    "product manager interview",
    "data science interview prep",
    "FAANG interview prep",
    "interview simulator",
    "career coaching AI",
  ],

  authors: [{ name: "Rehearse", url: APP_URL }],
  creator: "Rehearse",
  publisher: "Rehearse",

  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },

  openGraph: {
    type: "website",
    locale: "en_US",
    url: APP_URL,
    siteName: "Rehearse",
    title: "Rehearse — AI Mock Interview Coach",
    description:
      "Practice real interviews with an AI that listens, adapts, and gives you honest feedback. Improve faster with personalized coaching on behavioral, technical, and system design rounds.",
    images: [
      {
        url: `${APP_URL}/opengraph-image`,
        width: 1200,
        height: 630,
        alt: "Rehearse — AI Mock Interview Coach",
        type: "image/png",
      },
    ],
  },

  twitter: {
    card: "summary_large_image",
    title: "Rehearse — AI Mock Interview Coach",
    description:
      "Practice real interviews with an AI that listens, adapts, and gives you honest feedback. Ace your next interview.",
    images: [`${APP_URL}/opengraph-image`],
    creator: "@rehearseai",
  },

  alternates: {
    canonical: APP_URL,
  },

  category: "technology",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
        />
      </head>
      <body className="bg-bg-app text-text-pri antialiased">{children}</body>
    </html>
  );
}
