"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Coins, Check, Loader2 } from "lucide-react";

interface OrgOption {
  id: string;
  name: string;
  creditsUsdCents: number;
}

function CreditsForm() {
  const searchParams = useSearchParams();
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState(searchParams.get("orgId") || "");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [mode, setMode] = useState<"add" | "set">("add");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/orgs")
      .then((r) => r.json())
      .then((d) => {
        setOrgs(d.orgs || []);
        if (!selectedOrgId && d.orgs?.length > 0) setSelectedOrgId(d.orgs[0].id);
      });
  }, [selectedOrgId]);

  const selectedOrg = orgs.find((o) => o.id === selectedOrgId);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedOrgId || !amount) return;
    setLoading(true);
    setError("");
    setDone(false);

    const amountCents = Math.round(Number(amount) * 100);
    const res = await fetch("/api/admin/credits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgId: selectedOrgId, amountCents, mode, note }),
    });

    if (res.ok) {
      setDone(true);
      setAmount("");
      setNote("");
      // Refresh org list
      fetch("/api/admin/orgs").then((r) => r.json()).then((d) => setOrgs(d.orgs || []));
      setTimeout(() => setDone(false), 3000);
    } else {
      const data = await res.json();
      setError(data.error || "Failed to update credits");
    }
    setLoading(false);
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="page-title">Credit Override</h1>
        <p className="page-desc">Manually add or set credits for any organization</p>
      </div>

      <div className="max-w-lg">
        <div className="card p-6">
          <div className="flex items-center gap-2.5 mb-5">
            <Coins className="h-5 w-5 text-zinc-500" />
            <h2 className="section-title">Adjust Credits</h2>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-zinc-700">Organization</label>
              <select
                value={selectedOrgId}
                onChange={(e) => setSelectedOrgId(e.target.value)}
                className="input"
                required
              >
                {orgs.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name} (${(o.creditsUsdCents / 100).toFixed(2)})
                  </option>
                ))}
              </select>
              {selectedOrg && (
                <p className="mt-1 text-xs text-zinc-400">
                  Current balance: <strong>${(selectedOrg.creditsUsdCents / 100).toFixed(2)}</strong>
                </p>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-zinc-700">Mode</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={mode === "add"}
                    onChange={() => setMode("add")}
                    className="h-4 w-4 accent-indigo-600"
                  />
                  <span className="text-sm text-zinc-700">Add credits</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={mode === "set"}
                    onChange={() => setMode("set")}
                    className="h-4 w-4 accent-indigo-600"
                  />
                  <span className="text-sm text-zinc-700">Set to amount</span>
                </label>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-zinc-700">
                Amount (USD)
              </label>
              <input
                type="number"
                min={0}
                step={0.01}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="10.00"
                className="input"
                required
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-zinc-700">
                Note <span className="font-normal text-zinc-400">(optional)</span>
              </label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Reason for adjustment…"
                className="input"
              />
            </div>

            {error && <div className="alert-error">{error}</div>}

            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : done ? <Check className="h-4 w-4" /> : <Coins className="h-4 w-4" />}
              {loading ? "Saving…" : done ? "Done!" : mode === "add" ? "Add Credits" : "Set Credits"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function AdminCreditsPage() {
  return (
    <Suspense fallback={<div className="flex h-64 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-zinc-400" /></div>}>
      <CreditsForm />
    </Suspense>
  );
}
