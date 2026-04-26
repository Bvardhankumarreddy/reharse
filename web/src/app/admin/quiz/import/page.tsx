"use client";

import { useEffect, useState, useRef } from "react";

interface PreviewResult {
  totalRows: number;
  validCount: number;
  errorCount: number;
  errors: Array<{ row: number; message: string }>;
  preview: Record<string, unknown>[];
}

interface ImportResult {
  imported: number;
  errors: Array<{ row: number; message: string }>;
}

export default function AdminQuizImportPage() {
  const [token, setToken] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [mode, setMode] = useState<"append" | "replace">("append");
  const [quizWeek, setQuizWeek] = useState("1");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/auth/token")
      .then((r) => r.json())
      .then((d: { token?: string }) => { if (d.token) setToken(d.token); });
  }, []);

  function selectFile(f: File | null) {
    setFile(f);
    setPreview(null);
    setResult(null);
    setError(null);
  }

  async function runPreview() {
    if (!token || !file) return;
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("preview", "true");
      const res = await fetch("/api/v1/admin/quiz/questions/import", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (!res.ok) throw new Error((await res.json()).message ?? "Preview failed");
      const data: PreviewResult = await res.json();
      setPreview(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  async function runImport() {
    if (!token || !file) return;
    if (!preview || preview.validCount === 0) return;
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("mode", mode);
      if (mode === "replace") fd.append("quizWeek", quizWeek);
      const res = await fetch("/api/v1/admin/quiz/questions/import", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (!res.ok) throw new Error((await res.json()).message ?? "Import failed");
      const data: ImportResult = await res.json();
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  async function downloadTemplate() {
    if (!token) return;
    const res = await fetch("/api/v1/admin/quiz/questions/template", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "quiz_questions_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h2 className="text-white font-bold text-xl mb-1">Import Quiz Questions</h2>
        <p className="text-slate-400 text-sm">Bulk upload questions via CSV or Excel</p>
      </div>

      {/* Template download */}
      <div className="bg-[#1e293b] rounded-2xl p-4 border border-white/5 flex items-center justify-between">
        <div>
          <div className="text-white text-sm font-medium">Need a template?</div>
          <div className="text-slate-400 text-xs">Download a sample CSV with the required columns</div>
        </div>
        <button
          onClick={downloadTemplate}
          className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white text-sm rounded-xl transition border border-white/10"
        >
          Download Template
        </button>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files[0];
          if (f) selectFile(f);
        }}
        onClick={() => inputRef.current?.click()}
        className={`bg-[#1e293b] rounded-2xl p-8 border-2 border-dashed cursor-pointer transition ${
          dragOver ? "border-indigo-500 bg-indigo-500/5" : "border-white/10 hover:border-white/20"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          className="hidden"
          onChange={(e) => selectFile(e.target.files?.[0] ?? null)}
        />
        <div className="text-center">
          <div className="text-4xl mb-2">📥</div>
          <div className="text-white font-medium mb-1">
            {file ? file.name : "Drop CSV/Excel file here"}
          </div>
          <div className="text-slate-400 text-xs">
            {file ? `${(file.size / 1024).toFixed(1)} KB` : "or click to browse — .csv, .xlsx, .xls"}
          </div>
        </div>
      </div>

      {file && !preview && !result && (
        <button
          onClick={runPreview}
          disabled={loading}
          className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl disabled:opacity-50 transition"
        >
          {loading ? "Validating..." : "Preview & Validate"}
        </button>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Preview results */}
      {preview && !result && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-[#1e293b] border border-white/5 rounded-xl p-4">
              <div className="text-2xl font-bold text-white">{preview.totalRows}</div>
              <div className="text-xs text-slate-400 mt-1">Total Rows</div>
            </div>
            <div className="bg-[#1e293b] border border-white/5 rounded-xl p-4">
              <div className="text-2xl font-bold text-emerald-400">{preview.validCount}</div>
              <div className="text-xs text-slate-400 mt-1">Valid</div>
            </div>
            <div className="bg-[#1e293b] border border-white/5 rounded-xl p-4">
              <div className="text-2xl font-bold text-red-400">{preview.errorCount}</div>
              <div className="text-xs text-slate-400 mt-1">Errors</div>
            </div>
          </div>

          {preview.errors.length > 0 && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
              <h3 className="text-red-300 font-medium mb-2">Validation Errors</h3>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {preview.errors.map((e, i) => (
                  <div key={i} className="text-red-300 text-xs">
                    Row {e.row}: {e.message}
                  </div>
                ))}
              </div>
            </div>
          )}

          {preview.preview.length > 0 && (
            <div className="bg-[#1e293b] border border-white/5 rounded-xl overflow-hidden">
              <div className="px-4 py-2 border-b border-white/5 text-slate-400 text-xs uppercase tracking-wide">
                Preview (first 5 rows)
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-white/5 text-slate-400">
                      {Object.keys(preview.preview[0] ?? {}).slice(0, 6).map((k) => (
                        <th key={k} className="text-left px-3 py-2 font-medium">{k}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.preview.map((row, i) => (
                      <tr key={i} className="border-t border-white/5">
                        {Object.keys(preview.preview[0] ?? {}).slice(0, 6).map((k) => (
                          <td key={k} className="px-3 py-2 text-slate-300 truncate max-w-xs">
                            {String(row[k] ?? "")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Import options */}
          <div className="bg-[#1e293b] border border-white/5 rounded-xl p-4 space-y-3">
            <h3 className="text-white font-medium">Import Mode</h3>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="radio" checked={mode === "append"} onChange={() => setMode("append")} />
              <div>
                <div className="text-white text-sm">Append</div>
                <div className="text-slate-400 text-xs">Add to existing question bank</div>
              </div>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="radio" checked={mode === "replace"} onChange={() => setMode("replace")} />
              <div>
                <div className="text-white text-sm">Replace Week</div>
                <div className="text-slate-400 text-xs">Delete all existing questions for the chosen week</div>
              </div>
              {mode === "replace" && (
                <input
                  type="number"
                  value={quizWeek}
                  onChange={(e) => setQuizWeek(e.target.value)}
                  placeholder="Week"
                  className="bg-[#0f172a] border border-white/10 rounded-lg px-3 py-1 text-sm text-white w-20"
                />
              )}
            </label>
          </div>

          <div className="flex gap-3">
            <button
              onClick={runImport}
              disabled={loading || preview.validCount === 0}
              className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl disabled:opacity-50 transition"
            >
              {loading ? "Importing..." : `Import ${preview.validCount} Questions`}
            </button>
            <button
              onClick={() => { setFile(null); setPreview(null); }}
              className="px-6 text-slate-400 hover:text-white text-sm transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Final result */}
      {result && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-5 text-center">
          <div className="text-5xl mb-2">✅</div>
          <h3 className="text-emerald-300 font-bold text-lg">{result.imported} questions imported</h3>
          {result.errors.length > 0 && (
            <p className="text-amber-300 text-sm mt-1">{result.errors.length} rows skipped</p>
          )}
          <button
            onClick={() => { setFile(null); setPreview(null); setResult(null); }}
            className="mt-4 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm rounded-xl transition"
          >
            Import Another File
          </button>
        </div>
      )}
    </div>
  );
}
