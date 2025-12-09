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
  alternates: {
    canonical: '/',
  },
  title: {
    default: "云店+WordPress产品导入助手 | Yundian+ WooCommerce Importer",
    template: "%s | 云店+WordPress产品导入助手"
  },
  description: "支持从WordPress, Shopify, Wix导入产品到WooCommerce/WordPress。无需原网站API，支持批量采集。Professional tool import products from WordPress, Shopify, Wix to WooCommerce/WordPress. ",
  keywords: ["WordPress产品迁移", "Shopify导入WooCommerce", "Wix导入WooCommerce", "产品搬家", "WooCommerce产品导入", "产品采集", "Yundian+", "云店+", "WooCommerce Importer"],
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
    locale: "zh_CN",
    url: "https://www.ydplus.net", // 假设的域名，需确认或使用process.env.NEXT_PUBLIC_SITE_URL
    title: "云店+WordPress产品导入助手 | Yundian+ WooCommerce Importer",
    description: "支持从WordPress, Shopify, Wix导入产品到WooCommerce/WordPress。无需原网站API，支持批量采集。Professional tool import products from WordPress, Shopify, Wix to WooCommerce/WordPress. ",
    siteName: "云店+WordPress产品导入助手",
    images: [
      {
        url: '/logo.jpg',
        width: 800,
        height: 800,
        alt: '云店+WordPress产品导入助手',
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "云店+WordPress产品导入助手 | Yundian+ WooCommerce Importer",
    description: "支持从WordPress, Shopify, Wix导入产品到WooCommerce/WordPress。无需原网站API，支持批量采集。Professional tool import products from WordPress, Shopify, Wix to WooCommerce/WordPress. ",  
    images: ['/logo.jpg'],
  },
  verification: {
    google: "google-site-verification-code", // 预留
    other: {
      "baidu-site-verification": "baidu-site-verification-code" // 预留
    }
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
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
