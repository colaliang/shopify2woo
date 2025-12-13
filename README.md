This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## 部署与发布（GitHub + Vercel）

### 同步到 GitHub

1. 初始化并提交（若已存在可跳过）：
   ```bash
   git init
   git add .
   git commit -m "init: shopify2woo-web"
   ```
2. 添加远程并推送（将 `<YOUR_REPO_URL>` 替换为你的 GitHub 仓库地址）：
   ```bash
   git remote add origin <YOUR_REPO_URL>
   git branch -M main
   git push -u origin main
   ```

### 部署到 Vercel（生产环境）

1. 在 Vercel 控制台创建新项目，选择你刚推送的 GitHub 仓库。
2. 在 `Project Settings → Environment Variables` 配置：
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `WECHAT_APP_ID`（微信开放平台 AppID）
   - `WECHAT_APP_SECRET`（微信开放平台 AppSecret）
   - `DEEPL_API_KEY`（DeepL 翻译 API Key）
   - （可选）`NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - （可选）`HTTP_PROXY`、`HTTPS_PROXY`（仅服务器端请求需要代理时）
3. 触发一次部署（自动），完成后将获得生产域名，例如 `https://shopify2woo-web.vercel.app`。
4. 更新 Chrome 扩展的 `background.js` 中的 URL 指向生产域名，并重新打包扩展。

### 本地类型检查与构建

```bash
npm run build
# 若本地路径包含中文/特殊字符导致 Turbopack 构建异常，可用：
npx tsc -p tsconfig.json --noEmit
```

提示：Vercel 的构建环境不受本地路径影响，即使本地 `npm run build` 遇到 Turbopack 的中文路径问题，云端部署通常可正常完成。
