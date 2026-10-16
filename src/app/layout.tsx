import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Voxel QR — scannable 3D QR codes",
  description:
    "Turn a link into a 3D object that still scans from directly above. Style it, rotate it, and take it away as an image.",
  openGraph: {
    title: "Voxel QR — scannable 3D QR codes",
    description:
      "Turn a link into a 3D object that still scans from directly above.",
    type: "website",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/* h-full, not min-h-full: the canvas sizes itself from a definite parent height. */}
      <body className="h-full flex flex-col">
        {children}
      </body>
    </html>
  );
}
