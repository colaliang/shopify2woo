import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
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
  metadataBase: new URL("https://www.ydplus.net"),
  title: {
    default: "云店+WordPress产品导入助手 | Yundian+WordPress Products Import Assistant",
    template: "%s | 云店+WordPress产品导入助手"
  },
  description: "Yundian+WordPress Products Import Assistant is a professional tool to import products from WordPress, Shopify, Wix to WooCommerce/WordPress. 支持从WordPress, Shopify, Wix一键导入产品到WooCommerce/WordPress。抓取网站产品公开信息，不需要原网站的API，支持批量采集、自动化同步、图片迁移，无缝对接，提升运营效率。",
  keywords: ["WordPress导入WooCommerce", "WordPress导入", "Shopify导入WooCommerce", "Wix导入WooCommerce", "跨境电商工具", "产品搬家", "WooCommerce插件", "店铺同步", "产品采集", "Yundian+", "云店+"],
  icons: {
    icon: '/logo-28.jpg',
    shortcut: '/logo-28.jpg',
    apple: '/logo-28.jpg',
  },
  authors: [{ name: "Shopify2Woo Team" }],
  creator: "Shopify2Woo Team",
  publisher: "Shopify2Woo Team",
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
    title: "云店+WordPress产品导入助手 | Yundian+WordPress Products Import Assistant",
    description: "专业的外贸和跨境电商产品导入工具，支持从WordPress, Shopify, Wix一键导入产品到WooCommerce/WordPress。抓取网站产品公开信息，不需要原网站的API，支持批量采集、自动化同步、图片迁移，无缝对接，提升运营效率。",
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
    title: "云店+WordPress产品导入助手 | Yundian+WordPress Products Import Assistant",
    description: "专业的外贸和跨境电商产品导入工具，支持从WordPress, Shopify, Wix一键导入产品到WooCommerce/WordPress。抓取网站产品公开信息，不需要原网站的API，支持批量采集、自动化同步、图片迁移，无缝对接，提升运营效率。",  
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
      </body>
    </html>
  );
}
