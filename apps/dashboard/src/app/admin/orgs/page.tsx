"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Building2, Loader2 } from "lucide-react";

interface OrgRow {
  id: string;
  name: string;
  slug: string;
  plan: string;
  memberCount: number;
  creditsUsdCents: number;
  totalRequests: number;
  totalCostUsd: number;
  createdAt: string;
}

export default function AdminOrgsPage() {
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/orgs")
      .then((r) => r.json())
      .then((d) => { setOrgs(d.orgs || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="mb-8">
        <h1 className="page-title">Organizations</h1>
        <p className="page-desc">All client organizations on the platform</p>
      </div>

      <div className="card overflow-hidden">
        <table className="min-w-full">
          <thead>
            <tr className="border-b border-zinc-100">
              <th className="table-header-cell">Organization</th>
              <th className="table-header-cell">Plan</th>
              <th className="table-header-cell">Members</th>
              <th className="table-header-cell">Credits</th>
              <th className="table-header-cell">30d Requests</th>
              <th className="table-header-cell">30d Cost</th>
              <th className="table-header-cell">Created</th>
              <th className="table-header-cell">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-zinc-400" />
                </td>
              </tr>
            ) : orgs.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center">
                  <Building2 className="mx-auto mb-3 h-8 w-8 text-zinc-300" />
                  <p className="text-sm text-zinc-400">No organizations found.</p>
                </td>
              </tr>
            ) : (
              orgs.map((org) => (
                <tr key={org.id} className="table-row">
                  <td className="table-cell">
                    <div>
                      <p className="font-medium text-zinc-900">{org.name}</p>
                      <p className="text-xs text-zinc-400">{org.slug}</p>
                    </div>
                  </td>
                  <td className="table-cell">
                    <span className={org.plan === "enterprise" ? "badge-info" : org.plan === "pro" ? "badge-success" : "badge-neutral"}>
                      {org.plan}
                    </span>
                  </td>
                  <td className="table-cell text-zinc-600">{org.memberCount}</td>
                  <td className="table-cell text-zinc-600">${(org.creditsUsdCents / 100).toFixed(2)}</td>
                  <td className="table-cell text-zinc-600">{org.totalRequests.toLocaleString()}</td>
                  <td className="table-cell text-zinc-600">${Number(org.totalCostUsd).toFixed(2)}</td>
                  <td className="table-cell text-zinc-500">{new Date(org.createdAt).toLocaleDateString()}</td>
                  <td className="table-cell">
                    <Link href={`/admin/orgs/${org.id}`} className="btn-secondary btn-sm">
                      View
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
