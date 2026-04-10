import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Rehearse — AI Mock Interview Coach",
    template: "%s | Rehearse",
  },
  description:
    "Rehearse — Practice real interviews with an AI that listens, adapts, and gives you honest feedback — anytime.",
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
