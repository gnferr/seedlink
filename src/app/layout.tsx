import type { Metadata } from "next";
import { Geist, Geist_Mono, Pixelify_Sans } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const pixel = Pixelify_Sans({
  variable: "--font-pixel",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Seedlink — grow your link into a tree",
  description:
    "Paste a link and a pixel tree grows on a floating island. Tap it and it folds into a QR code that scans; save it as an image.",
  openGraph: {
    title: "Seedlink — grow your link into a tree",
    description:
      "Paste a link and a pixel tree grows on a floating island. Tap it and it folds into a QR code that scans.",
    type: "website",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${pixel.variable} h-full antialiased`}
    >
      {/* h-full, not min-h-full: the canvas sizes itself from a definite parent height. */}
      <body className="h-full flex flex-col">
        {children}
      </body>
    </html>
  );
}
