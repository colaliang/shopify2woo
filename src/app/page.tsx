export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-12">
      <h1 className="text-3xl font-bold mb-8">Shopify → Woo 导入工具</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <a
          href="/import"
          className="rounded-lg border px-6 py-4 hover:bg-gray-50"
        >
          <h2 className="text-xl font-semibold">导入页面</h2>
          <p className="text-sm text-gray-600 mt-1">输入 Shopify 站点与产品链接</p>
        </a>
        <a
          href="/config"
          className="rounded-lg border px-6 py-4 hover:bg-gray-50"
        >
          <h2 className="text-xl font-semibold">配置页面</h2>
          <p className="text-sm text-gray-600 mt-1">保存 WordPress 网址与密钥</p>
        </a>
      </div>
    </main>
  );
}
