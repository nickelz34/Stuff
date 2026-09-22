import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stuff",
  description: "A simple inventory application for your Stuff",
  applicationName: "Stuff",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Stuff",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0a0a0a",
  // Ask the browser to shrink the layout above the keyboard so a bottom field stays put.
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-ink text-white antialiased">{children}</body>
    </html>
  );
}
