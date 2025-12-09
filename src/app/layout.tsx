import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import I18nProvider from "@/components/providers/I18nProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://www.ydplus.net"),
  // Default metadata if page doesn't override it
  title: {
    default: "Shopify/Wix/WP to WooCommerce Importer | Yundian+",
    template: "%s | Yundian+ WooCommerce Importer"
  },
  description: "Professional cross-border e-commerce product migration tool. Import from WordPress, Shopify, Wix to WooCommerce/WordPress.",
  keywords: ["WordPress Migration", "Shopify to WooCommerce", "Wix to WooCommerce", "Product Import", "WooCommerce Importer", "Yundian+"],
  icons: {
    icon: '/logo-28.jpg',
    shortcut: '/logo-28.jpg',
    apple: '/logo-28.jpg',
  },
  authors: [{ name: "Yundian+ Team" }],
  creator: "Yundian+ Team",
  publisher: "Yundian+ Team",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  openGraph: {
    type: "website",
    url: "https://www.ydplus.net",
    siteName: "Yundian+ WooCommerce Importer",
    images: [
      {
        url: '/logo.jpg',
        width: 800,
        height: 800,
        alt: 'Yundian+ WooCommerce Importer',
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    images: ['/logo.jpg'],
  },
  verification: {
    google: "google-site-verification-code", // Reserved
    other: {
      "baidu-site-verification": "baidu-site-verification-code" // Reserved
    }
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Use a default language, client-side will update it
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <I18nProvider>
        <Script id="baidu-analytics" strategy="afterInteractive">
          {`
            var _hmt = _hmt || [];
            (function() {
              var hm = document.createElement("script");
              hm.src = "https://hm.baidu.com/hm.js?7e0df22d8bc16df8937647f11759f544";
              var s = document.getElementsByTagName("script")[0]; 
              s.parentNode.insertBefore(hm, s);
            })();
          `}
        </Script>
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-V6Z9TLFXVM"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());

            gtag('config', 'G-V6Z9TLFXVM');
          `}
        </Script>
        {children}
        </I18nProvider>
      </body>
    </html>
  );
}
