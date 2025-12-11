"use client";

import Link from "next/link";
import { Image as ImageIcon, Search, Facebook, Linkedin, Twitter } from "lucide-react";
import { useTranslation } from "react-i18next";
import { urlFor } from "@/lib/sanity";
import TableOfContents from "./TableOfContents";
import ContentRenderer from "./ContentRenderer";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SanityImageSource = any;

interface Post {
  _id: string;
  title: string;
  slug: { current: string };
  mainImage: SanityImageSource;
  publishedAt: string;
  bodyHtml?: string;
  bodyMarkdown?: string;
  body?: unknown[];
  excerpt?: string;
  categories: { title: string; slug: { current: string } }[];
}

interface BlogPostContentProps {
  post: Post;
  recentPosts: Post[];
  categories: { _id: string; title: string; slug: { current: string } }[];
}

export default function BlogPostContent({ post, recentPosts, categories }: BlogPostContentProps) {
  const { t, i18n } = useTranslation();
  
  const date = new Date(post.publishedAt);
  const day = date.getDate().toString().padStart(2, "0");
  const month = date.toLocaleString(i18n.language, { month: "short" });

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-12">
      <div className="flex flex-col lg:flex-row gap-12 justify-center max-w-[1920px] mx-auto">
        {/* Main Content (Left) */}
        <article className="lg:w-2/3 xl:w-3/5">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            {/* Featured Image with Date Badge */}
            <div className="relative aspect-[16/9] bg-gray-100">
              {post.mainImage ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={urlFor(post.mainImage).width(1200).height(675).url()}
                  alt={post.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400">
                  <ImageIcon className="w-16 h-16" />
                </div>
              )}
              {/* Date Badge */}
              <div className="absolute top-6 left-6 bg-white shadow-md rounded-lg p-3 text-center min-w-[70px] flex flex-col items-center justify-center">
                <span className="text-3xl font-bold text-gray-900 leading-none">{day}</span>
                <span className="text-xs font-bold text-gray-500 uppercase mt-1 tracking-wider">
                  {month}
                </span>
              </div>
            </div>

            <div className="p-8 sm:p-12">
              {/* Title */}
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-gray-900 leading-tight mb-8">
                {post.title}
              </h1>

              {/* Content */}
              {post.bodyMarkdown ? (
                <ContentRenderer markdown={post.bodyMarkdown} />
              ) : post.bodyHtml ? (
                <ContentRenderer html={post.bodyHtml} />
              ) : (
                <div className="bg-yellow-50 p-6 rounded-xl border border-yellow-200 text-yellow-800">
                  {t("blog.no_content")}
                </div>
              )}

              {/* Footer / Tags */}
              <div className="mt-12 pt-8 border-t border-gray-100">
                {/* Tags */}
                <div className="flex flex-wrap gap-3 mb-8">
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {post.categories?.map((cat: any) => (
                    <Link
                      key={cat.slug.current}
                      href={`/blog?category=${cat.slug.current}`}
                      className="inline-flex items-center px-4 py-2 rounded-full bg-gray-50 text-gray-700 text-sm font-medium hover:bg-blue-50 hover:text-blue-600 transition-colors"
                    >
                      {cat.title}
                    </Link>
                  ))}
                </div>

                {/* Social Share */}
                <div className="flex items-center justify-between">
                  <span className="text-gray-900 font-bold text-lg">{t("blog.share_article")}</span>
                  <div className="flex gap-4">
                    <a
                      href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(
                        `https://www.ydplus.net/blog/${post.slug.current}`
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-10 h-10 flex items-center justify-center rounded-full bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                      aria-label="Share on Facebook"
                    >
                      <Facebook className="w-5 h-5" />
                    </a>
                    <a
                      href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(
                        `https://www.ydplus.net/blog/${post.slug.current}`
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-10 h-10 flex items-center justify-center rounded-full bg-[#0077b5] text-white hover:opacity-90 transition-opacity"
                      aria-label="Share on LinkedIn"
                    >
                      <Linkedin className="w-5 h-5" />
                    </a>
                    <a
                      href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(
                        `https://www.ydplus.net/blog/${post.slug.current}`
                      )}&text=${encodeURIComponent(post.title)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-10 h-10 flex items-center justify-center rounded-full bg-black text-white hover:bg-gray-800 transition-colors"
                      aria-label="Share on X"
                    >
                      <Twitter className="w-5 h-5" />
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </article>

        {/* Sidebar (Right) */}
        <aside className="lg:w-1/3 xl:w-1/5 space-y-10 sticky top-24 self-start">
          {/* Search */}
          <div>
            <form action="/blog" className="relative">
              <input
                name="q"
                placeholder={t("blog.search")}
                className="w-full pl-4 pr-10 py-3 bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all text-sm shadow-sm"
              />
              <button
                type="submit"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-blue-600"
              >
                <Search className="w-4 h-4" />
              </button>
            </form>
          </div>

          {/* Table of Contents */}
          {(post.bodyHtml || post.bodyMarkdown) && (
            <TableOfContents content={post.bodyHtml} markdown={post.bodyMarkdown} />
          )}

          {/* Recent Posts */}
          <div>
            <h3 className="text-lg font-bold text-gray-900 mb-6">{t("blog.recent_posts")}</h3>
            <div className="space-y-6">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {recentPosts.map((p: any) => (
                <Link key={p._id} href={`/blog/${p.slug.current}`} className="flex gap-4 group">
                  <div className="w-24 h-24 flex-shrink-0 bg-gray-100 rounded-lg overflow-hidden shadow-sm">
                    {p.mainImage ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={urlFor(p.mainImage).width(200).height(200).url()}
                        alt={p.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400">
                        <ImageIcon className="w-8 h-8" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 flex flex-col justify-between py-1 h-24">
                    <h4 className="text-base font-bold text-gray-900 line-clamp-2 group-hover:text-blue-600 transition-colors leading-snug">
                      {p.title}
                    </h4>
                    <div className="text-xs text-gray-500 font-medium">
                      {new Date(p.publishedAt).toLocaleDateString(i18n.language, {
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* Categories */}
          <div>
            <h3 className="text-lg font-bold text-gray-900 mb-6">{t("blog.categories")}</h3>
            <div className="flex flex-col space-y-2">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {categories.map((cat: any) => (
                <Link
                  key={cat._id}
                  href={`/blog?category=${cat.slug.current}`}
                  className="text-sm text-gray-600 hover:text-blue-600 hover:translate-x-1 transition-all py-1"
                >
                  {cat.title}
                </Link>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
