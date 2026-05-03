"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2, UserCheck, ExternalLink } from "lucide-react";

interface OrgDetail {
  id: string;
  name: string;
  slug: string;
  plan: string;
  creditsUsdCents: number;
  subscriptionStatus: string | null;
  createdAt: string;
  members: { id: string; name: string | null; email: string; role: string }[];
}

export default function AdminOrgDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [org, setOrg] = useState<OrgDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [impersonating, setImpersonating] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/orgs/${id}`)
      .then((r) => r.json())
      .then((d) => { setOrg(d.org || null); setLoading(false); })
      .catch(() => setLoading(false));
  }, [id]);

  async function impersonate() {
    setImpersonating(true);
    const res = await fetch("/api/admin/impersonate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgId: id }),
    });
    if (res.ok) {
      router.push("/dashboard");
      router.refresh();
    } else {
      alert("Failed to impersonate");
      setImpersonating(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (!org) {
    return <div className="alert-error">Organization not found.</div>;
  }

  return (
    <div>
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="page-title">{org.name}</h1>
          <p className="page-desc">{org.slug} · {org.plan} plan</p>
        </div>
        <button
          type="button"
          onClick={impersonate}
          disabled={impersonating}
          className="btn-primary"
        >
          {impersonating ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
          {impersonating ? "Switching…" : "Act as this org"}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="card p-5">
          <p className="text-sm text-zinc-500">Credits Balance</p>
          <p className="mt-1.5 text-2xl font-semibold text-zinc-900">
            ${(org.creditsUsdCents / 100).toFixed(2)}
          </p>
        </div>
        <div className="card p-5">
          <p className="text-sm text-zinc-500">Plan</p>
          <p className="mt-1.5 text-2xl font-semibold text-zinc-900 capitalize">{org.plan}</p>
        </div>
        <div className="card p-5">
          <p className="text-sm text-zinc-500">Subscription</p>
          <p className="mt-1.5 text-lg font-semibold text-zinc-900 capitalize">{org.subscriptionStatus || "inactive"}</p>
        </div>
      </div>

      <div className="mt-6 card overflow-hidden">
        <div className="border-b border-zinc-100 px-4 py-3">
          <h2 className="section-title">Members ({org.members.length})</h2>
        </div>
        <table className="min-w-full">
          <thead>
            <tr className="border-b border-zinc-100">
              <th className="table-header-cell">Name</th>
              <th className="table-header-cell">Email</th>
              <th className="table-header-cell">Role</th>
            </tr>
          </thead>
          <tbody>
            {org.members.map((m) => (
              <tr key={m.id} className="table-row">
                <td className="table-cell font-medium text-zinc-900">{m.name || "—"}</td>
                <td className="table-cell text-zinc-600">{m.email}</td>
                <td className="table-cell">
                  <span className={m.role === "admin" ? "badge-info" : "badge-neutral"}>
                    {m.role}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex gap-3">
        <a href={`/admin/credits?orgId=${org.id}&orgName=${encodeURIComponent(org.name)}`} className="btn-secondary">
          <ExternalLink className="h-4 w-4" />
          Adjust credits
        </a>
      </div>
    </div>
  );
}
