"use client";
import { useState, useEffect } from "react";
import { Trash2, Plus, Play, CheckCircle, XCircle } from "lucide-react";

type TestCase = {
  id: string;
  platform: "Shopify" | "Wix" | "WordPress";
  url: string;
  expected: {
    title?: string;
    shortDescription?: string; // Partial match or existence
    longDescription?: string; // Partial match or existence
    imageCount?: number;
    category?: string;
  };
};

type TestResult = {
  id: string;
  status: "pending" | "running" | "pass" | "fail" | "error";
  message?: string;
  actual?: {
    title: string;
    shortDescription: string;
    longDescription: string;
    imageCount: number;
    category: string;
  };
  details?: Record<string, { expected: unknown; actual: unknown; pass: boolean }>;
};

export default function RegressionPage() {
  const [cases, setCases] = useState<TestCase[]>([]);
  const [results, setResults] = useState<Record<string, TestResult>>({});
  const [running, setRunning] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("regression_cases");
    if (saved) {
      try {
        setCases(JSON.parse(saved));
      } catch {}
    } else {
      // Default example
      setCases([
        {
          id: "1",
          platform: "WordPress",
          url: "https://example.com/product/test",
          expected: {
            title: "Test Product",
            imageCount: 2,
            category: "Shoes"
          }
        }
      ]);
    }
  }, []);

  // Save to localStorage whenever cases change
  useEffect(() => {
    localStorage.setItem("regression_cases", JSON.stringify(cases));
  }, [cases]);

  const addCase = () => {
    setCases([
      ...cases,
      {
        id: Math.random().toString(36).slice(2),
        platform: "WordPress",
        url: "",
        expected: {},
      },
    ]);
  };

  const removeCase = (id: string) => {
    setCases(cases.filter((c) => c.id !== id));
    const newResults = { ...results };
    delete newResults[id];
    setResults(newResults);
  };

  const updateCase = (id: string, updates: Partial<TestCase>) => {
    setCases(cases.map((c) => (c.id === id ? { ...c, ...updates } : c)));
  };

  const updateExpected = (id: string, field: keyof TestCase["expected"], value: string | number) => {
    setCases(
      cases.map((c) =>
        c.id === id
          ? { ...c, expected: { ...c.expected, [field]: value } }
          : c
      )
    );
  };

  const runTest = async (c: TestCase) => {
    setResults((prev) => ({
      ...prev,
      [c.id]: { id: c.id, status: "running" },
    }));

    try {
      const res = await fetch(
        `/api/debug/scrape?url=${encodeURIComponent(c.url)}&platform=${encodeURIComponent(c.platform)}`
      );
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Request failed");
      }

      const actual = {
        title: String(data.name || ""),
        shortDescription: String(data.short_description || ""),
        longDescription: String(data.description || ""),
        imageCount: Number(data.galleryCount || 0),
        category: String(data.primaryCategory || ""),
      };

      const details: TestResult["details"] = {};
      let passed = true;

      if (c.expected.title) {
        const p = actual.title.includes(c.expected.title);
        details.title = { expected: c.expected.title, actual: actual.title, pass: p };
        if (!p) passed = false;
      }
      if (c.expected.shortDescription) {
        const p = actual.shortDescription.includes(c.expected.shortDescription);
        details.shortDescription = { expected: c.expected.shortDescription, actual: actual.shortDescription.slice(0, 50) + "...", pass: p };
        if (!p) passed = false;
      }
      if (c.expected.longDescription) {
        // Just check if it's not empty if expected is "present", or partial match
        const p = actual.longDescription.includes(c.expected.longDescription);
        details.longDescription = { expected: c.expected.longDescription, actual: actual.longDescription.slice(0, 50) + "...", pass: p };
        if (!p) passed = false;
      }
      if (c.expected.imageCount !== undefined) {
        // Allow some flexibility? No, user asked for regression, exact match usually.
        // But maybe >= ? Let's stick to exact for now or allow user to specify logic later.
        // Or maybe >= because sometimes more images are loaded?
        // Let's assume exact match for "image count" as regression usually implies stability.
        const p = actual.imageCount === c.expected.imageCount;
        details.imageCount = { expected: c.expected.imageCount, actual: actual.imageCount, pass: p };
        if (!p) passed = false;
      }
      if (c.expected.category) {
        const p = actual.category.includes(c.expected.category);
        details.category = { expected: c.expected.category, actual: actual.category, pass: p };
        if (!p) passed = false;
      }

      setResults((prev) => ({
        ...prev,
        [c.id]: {
          id: c.id,
          status: passed ? "pass" : "fail",
          actual,
          details,
        },
      }));
    } catch (e) {
      setResults((prev) => ({
        ...prev,
        [c.id]: {
          id: c.id,
          status: "error",
          message: String((e as Error).message),
        },
      }));
    }
  };

  const runAll = async () => {
    setRunning(true);
    for (const c of cases) {
      if (!c.url) continue;
      await runTest(c);
    }
    setRunning(false);
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">抓取回归测试 (Regression Testing)</h1>
        <div className="space-x-4">
          <button
            onClick={addCase}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded flex items-center gap-2"
          >
            <Plus size={16} /> 添加用例
          </button>
          <button
            onClick={runAll}
            disabled={running}
            className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded flex items-center gap-2 disabled:opacity-50"
          >
            <Play size={16} /> {running ? "运行中..." : "运行所有测试"}
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {cases.map((c) => {
          const res = results[c.id];
          return (
            <div key={c.id} className="border rounded-lg p-4 bg-white shadow-sm">
              <div className="flex gap-4 items-start mb-4">
                <div className="w-32">
                  <label className="block text-xs text-gray-500 mb-1">平台</label>
                  <select
                    value={c.platform}
                    onChange={(e) => updateCase(c.id, { platform: e.target.value as TestCase['platform'] })}
                    className="w-full border rounded px-2 py-1 text-sm"
                  >
                    <option value="WordPress">WordPress</option>
                    <option value="Shopify">Shopify</option>
                    <option value="Wix">Wix</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-gray-500 mb-1">URL</label>
                  <input
                    value={c.url}
                    onChange={(e) => updateCase(c.id, { url: e.target.value })}
                    className="w-full border rounded px-2 py-1 text-sm"
                    placeholder="https://..."
                  />
                </div>
                <button
                  onClick={() => removeCase(c.id)}
                  className="mt-6 text-gray-400 hover:text-red-500"
                >
                  <Trash2 size={18} />
                </button>
              </div>

              <div className="grid grid-cols-5 gap-4 mb-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">期望标题 (包含)</label>
                  <input
                    value={c.expected.title || ""}
                    onChange={(e) => updateExpected(c.id, "title", e.target.value)}
                    className="w-full border rounded px-2 py-1 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">期望短描述 (包含)</label>
                  <input
                    value={c.expected.shortDescription || ""}
                    onChange={(e) => updateExpected(c.id, "shortDescription", e.target.value)}
                    className="w-full border rounded px-2 py-1 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">期望长描述 (包含)</label>
                  <input
                    value={c.expected.longDescription || ""}
                    onChange={(e) => updateExpected(c.id, "longDescription", e.target.value)}
                    className="w-full border rounded px-2 py-1 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">期望图片数 (等于)</label>
                  <input
                    type="number"
                    value={c.expected.imageCount ?? ""}
                    onChange={(e) => updateExpected(c.id, "imageCount", parseInt(e.target.value) || 0)}
                    className="w-full border rounded px-2 py-1 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">期望分类 (包含)</label>
                  <input
                    value={c.expected.category || ""}
                    onChange={(e) => updateExpected(c.id, "category", e.target.value)}
                    className="w-full border rounded px-2 py-1 text-sm"
                  />
                </div>
              </div>

              {res && (
                <div className={`mt-4 p-3 rounded text-sm ${
                  res.status === "pass" ? "bg-green-50 border border-green-200" :
                  res.status === "fail" ? "bg-red-50 border border-red-200" :
                  res.status === "error" ? "bg-yellow-50 border border-yellow-200" :
                  "bg-gray-50"
                }`}>
                  <div className="flex items-center gap-2 font-medium mb-2">
                    {res.status === "running" && <span className="animate-spin">⏳</span>}
                    {res.status === "pass" && <CheckCircle size={16} className="text-green-600" />}
                    {res.status === "fail" && <XCircle size={16} className="text-red-600" />}
                    {res.status === "error" && <XCircle size={16} className="text-yellow-600" />}
                    <span className="capitalize">{res.status}</span>
                    {res.message && <span className="text-red-600 ml-2">{res.message}</span>}
                  </div>
                  
                  {res.details && (
                    <div className="space-y-1">
                      {Object.entries(res.details).map(([key, val]) => (
                        <div key={key} className={`flex gap-2 ${val.pass ? "text-green-700" : "text-red-700"}`}>
                          <span className="w-24 font-semibold">{key}:</span>
                          <span>Expected &quot;{String(val.expected)}&quot;, Got &quot;{String(val.actual)}&quot;</span>
                          {!val.pass && <XCircle size={14} className="mt-1" />}
                        </div>
                      ))}
                    </div>
                  )}
                  {res.status === "pass" && !res.details && (
                     <div className="text-green-700">All checks passed.</div>
                  )}
                  {res.actual && (
                     <details className="mt-2">
                       <summary className="cursor-pointer text-gray-500 hover:text-gray-700">查看抓取结果</summary>
                       <pre className="mt-2 text-xs overflow-auto bg-gray-100 p-2 rounded max-h-40">
                         {JSON.stringify(res.actual, null, 2)}
                       </pre>
                     </details>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
