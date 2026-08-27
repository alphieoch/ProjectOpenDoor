"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Clock,
  Cpu,
  ExternalLink,
  Gauge,
  ListOrdered,
  Loader2,
  Moon,
  Play,
  Share2,
  ShieldCheck,
  Square,
  Zap,
} from "lucide-react";
import { gcpStartCreditCents } from "@opendoor/shared";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/ui/page-header";
import {
  capacityGuideRates,
  CLASS_COMPARISON,
  defaultRentFromUsSku,
  displaySkus,
  ENTERPRISE_CLUSTER_SKU,
  EXECUTION_MODES,
  modeToProvision,
  premiumProductFromSelection,
  provisionLabel,
  rentFromUsCta,
  rentalHoursLeft,
  shortGpuLabel,
  specForSku,
  type DisplaySku,
  type ExecutionMode,
  type PremiumHubLane,
} from "@/lib/premium/display";
import {
  earningsCentsForElapsed,
  formatEarningsUsd,
  SHARED_METAL_DEFAULT_HOURLY_USD,
  useVsShareCopy,
} from "@/lib/premium/host-share";

type CatalogModel = {
  id: string;
  displayName: string;
  status: string;
  note?: string;
};

type DeployRow = {
  id: string;
  name: string;
  target: string;
  gpuType: string | null;
  status: string;
  fqdn: string | null;
  reserved?: boolean;
  scaleToZero?: boolean;
};

type Rental = {
  id: string;
  model: string;
  customModel: string | null;
  sku: string;
  status: string;
  hourlyRate: number;
  hours: number | null;
  modelId: string | null;
  weightsUri: string | null;
  hostShareId?: string | null;
  earningsCents?: number;
  startedAt: string | null;
  endedAt: string | null;
  catalog: { displayName?: string } | null;
  deployment: {
    id: string;
    name: string;
    target: string;
    gpuType?: string | null;
    status: string;
    statusMessage?: string | null;
    fqdn: string | null;
    runtimeModel?: string | null;
    reserved?: boolean;
    scaleToZero?: boolean;
    regionLocked?: boolean;
    hostShareId?: string | null;
  } | null;
};

type HostListing = {
  id: string;
  status: string;
  hourlyUsd: number;
  displayName: string;
  chip: string | null;
  gpuName: string | null;
  memoryGb: number | null;
  workerKind: string | null;
  isDemo: boolean;
  earningsCents: number;
  listedAt: string | null;
  inUse: boolean;
  activeRentalCount: number;
  isOwn?: boolean;
};

type HostEligibility = {
  eligible: boolean;
  reasons: string[];
  hasAccelerator: boolean;
  memoryOk: boolean;
  workerUp: boolean;
  label: string;
  workerKind: "studio" | "ollama" | null;
};

type InboundRental = {
  id: string;
  status: string;
  hourlyRate: number;
  earningsCents: number;
  startedAt: string | null;
  endedAt: string | null;
  isPreview: boolean;
};

function CompactSku({
  selected,
  name,
  price,
  onPick,
  onPreview,
}: {
  selected: boolean;
  name: string;
  price: string;
  onPick: () => void;
  onPreview?: (on: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      onMouseEnter={() => onPreview?.(true)}
      onMouseLeave={() => onPreview?.(false)}
      onFocus={() => onPreview?.(true)}
      onBlur={() => onPreview?.(false)}
      className={cn(
        "min-w-0 flex-1 py-1.5 text-left border-b-2 transition-colors",
        selected
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
      )}
    >
      <span className="block text-[11px] font-semibold truncate">{name}</span>
      <span className="block text-[10px] font-mono">{price}</span>
    </button>
  );
}

function SkuSpecSheet({
  sku,
  localLabel,
}: {
  sku: DisplaySku;
  localLabel: string;
}) {
  const windows = capacityGuideRates(sku.hourlyUsd);
  const listed = sku.rentable
    ? sku.sku === "metal"
      ? "$0.00/hr"
      : `$${sku.hourlyUsd.toFixed(2)}/hr`
    : "Quote";
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Cpu className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="text-sm font-bold text-foreground">
              {sku.sku === "metal" ? localLabel : sku.displayName}
            </h3>
            <span className="font-mono text-[10px] font-bold text-primary">{sku.classEquivalent}</span>
          </div>
          <p className="font-mono text-[11px] font-semibold text-success">{sku.vram}</p>
          {sku.badge ? (
            <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{sku.badge}</p>
          ) : null}
        </div>
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">{sku.recommendedFor}</p>
      <p className="font-mono text-[10px] text-muted-foreground">
        {sku.coreSpeed} · {sku.bandwidth} · {sku.region}
      </p>
      <div>
        <h4 className="font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Pricing by compute window
        </h4>
        <div className="mt-1 grid grid-cols-3 gap-2 font-mono text-[11px]">
          <div className="border-t border-border py-1">
            <span className="block text-[10px] text-muted-foreground">On-Demand billed</span>
            <span className="font-bold text-foreground">{listed}</span>
          </div>
          <div className="border-t border-border py-1">
            <span className="block text-[10px] text-primary">Off-Peak window</span>
            <span className="font-bold text-success">
              {sku.rentable ? `$${windows.offPeak.toFixed(2)}/hr` : "Quote"}
            </span>
          </div>
          <div className="border-t border-border py-1">
            <span className="block text-[10px] text-warning">Batch window</span>
            <span className="font-bold text-warning">
              {sku.rentable ? `$${windows.batch.toFixed(2)}/hr` : "Quote"}
            </span>
          </div>
        </div>
      </div>
      <div>
        <h4 className="flex items-center gap-1 font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          <Gauge className="h-3 w-3 text-primary" />
          Class benchmarks
        </h4>
        <div className="mt-1 grid grid-cols-3 gap-2 text-[11px]">
          <div className="border-t border-border py-1">
            <span className="block text-[10px] text-muted-foreground">Flux.1 class</span>
            <span className="font-mono font-bold text-primary">{sku.benchmarks.fluxDev}</span>
          </div>
          <div className="border-t border-border py-1">
            <span className="block text-[10px] text-muted-foreground">Imagen path</span>
            <span className="font-mono font-bold text-primary">{sku.benchmarks.imagen3}</span>
          </div>
          <div className="border-t border-border py-1">
            <span className="block text-[10px] text-muted-foreground">Video class</span>
            <span className="font-mono font-bold text-primary">{sku.benchmarks.veoVideo}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PremiumGpuPage() {
  const selfUse = useVsShareCopy("self-use");
  const shareCopy = useVsShareCopy("share");
  const openDoor = useVsShareCopy("opendoor");
  const [skus, setSkus] = useState<DisplaySku[]>([]);
  const [catalog, setCatalog] = useState<CatalogModel[]>([]);
  const [rentals, setRentals] = useState<Rental[]>([]);
  const [deployments, setDeployments] = useState<DeployRow[]>([]);
  const [availableHosts, setAvailableHosts] = useState<HostListing[]>([]);
  const [listing, setListing] = useState<HostListing | null>(null);
  const [eligibility, setEligibility] = useState<HostEligibility | null>(null);
  const [inbound, setInbound] = useState<InboundRental[]>([]);
  const [imageEndpoint, setImageEndpoint] = useState<{ url?: string; kind?: string } | null>(null);
  const [isSiteAdmin, setIsSiteAdmin] = useState(false);
  const [hubLane, setHubLane] = useState<PremiumHubLane>("use");
  const [selectedSku, setSelectedSku] = useState("nvidia-l4");
  const [selectedHostId, setSelectedHostId] = useState("");
  const [executionMode, setExecutionMode] = useState<ExecutionMode>("on-demand");
  const [hoverSku, setHoverSku] = useState<string | null>(null);
  const [durationHours, setDurationHours] = useState(12);
  const [runUntilStop, setRunUntilStop] = useState(false);
  const [modelId, setModelId] = useState("");
  const [attachId, setAttachId] = useState("");
  const [shareHourly, setShareHourly] = useState(SHARED_METAL_DEFAULT_HOURLY_USD);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [listingBusy, setListingBusy] = useState(false);
  const [stopId, setStopId] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [billingHref, setBillingHref] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [detailsOpen, setDetailsOpen] = useState(false);

  const load = useCallback(async () => {
    let res: Response;
    try {
      res = await fetch("/api/premium/rentals", { credentials: "include" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load rentals");
      setSkus(displaySkus([]));
      setLoading(false);
      return;
    }
    const data = (await res.json().catch(() => ({}))) as {
      rentals?: Rental[];
      skus?: Array<{ sku: string; displayName: string; hourlyUsd: number; target: "local" | "gcp"; regionMultiplier?: number }>;
      catalog?: CatalogModel[];
      deployments?: DeployRow[];
      availableHosts?: HostListing[];
      host?: { listing?: HostListing | null; eligibility?: HostEligibility; inbound?: InboundRental[] };
      imageEndpoint?: { url?: string; kind?: string } | null;
      isSiteAdmin?: boolean;
      error?: string;
      warning?: string;
    };
    const nextSkus = displaySkus(Array.isArray(data.skus) ? data.skus : []);
    setSkus(nextSkus);
    setRentals(Array.isArray(data.rentals) ? data.rentals : []);
    if (Array.isArray(data.catalog)) setCatalog(data.catalog);
    if (Array.isArray(data.deployments)) setDeployments(data.deployments);
    if (Array.isArray(data.availableHosts)) setAvailableHosts(data.availableHosts);
    if (data.host) {
      setListing(data.host.listing ?? null);
      setEligibility(data.host.eligibility ?? null);
      setInbound(Array.isArray(data.host.inbound) ? data.host.inbound : []);
    }
    if (data.imageEndpoint !== undefined) setImageEndpoint(data.imageEndpoint || null);
    if (data.isSiteAdmin !== undefined) setIsSiteAdmin(Boolean(data.isSiteAdmin));
    setSelectedSku((current) => {
      if (nextSkus.some((s) => s.sku === current)) return current;
      return defaultRentFromUsSku(nextSkus);
    });
    setModelId((current) => current || data.catalog?.[0]?.id || "");
    if (data.host?.listing?.hourlyUsd) setShareHourly(data.host.listing.hourlyUsd);
    setError(data.error || data.warning || (res.ok ? null : "Failed to load rentals"));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 8000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  const cards = skus.length > 0 ? skus : displaySkus([]);
  const openDoorCards = cards.filter((c) => c.target === "gcp");
  const localCards = cards.filter((c) => c.target === "local");
  const selectedHost = hubLane === "share" ? availableHosts.find((h) => h.id === selectedHostId) || null : null;
  const activeSku = cards.find((s) => s.sku === selectedSku) || cards.find((s) => s.rentable) || cards[0];
  const previewSku = (hoverSku && cards.find((s) => s.sku === hoverSku)) || activeSku;
  const product = premiumProductFromSelection({
    hub: hubLane,
    sku: activeSku?.sku,
    target: activeSku?.target,
  });
  const activeMode = EXECUTION_MODES.find((m) => m.id === executionMode) || EXECUTION_MODES[0];
  const provision = modeToProvision(executionMode);
  const attached = deployments.find((d) => d.id === attachId);
  const billedHourly = selectedHost
    ? selectedHost.hourlyUsd
    : attached
      ? cards.find((s) => s.sku === attached.gpuType)?.hourlyUsd ?? activeSku?.hourlyUsd ?? 0
      : activeSku?.hourlyUsd ?? 0;
  const hours = runUntilStop ? null : durationHours;
  const estimate = hours == null ? null : (billedHourly * hours).toFixed(2);
  const guides = capacityGuideRates(billedHourly);
  const liveCount = rentals.filter((r) => r.status === "active" || r.status === "pending").length;
  const reservedCredit = (gcpStartCreditCents(true) / 100).toFixed(0);
  const scaleCredit = (gcpStartCreditCents(false) / 100).toFixed(0);
  const canDemoList = Boolean(isSiteAdmin && eligibility && !eligibility.eligible);
  const liveInbound = inbound.filter((r) => r.status === "active" || r.status === "pending");
  const listingInUse = Boolean(listing?.inUse || liveInbound.length > 0);

  const skuName = useMemo(() => {
    const map = new Map(cards.map((s) => [s.sku, s.displayName]));
    return (sku: string) => map.get(sku) || specForSku(sku).classEquivalent || sku;
  }, [cards]);

  function liveEarnings(r: { hourlyRate: number; earningsCents: number; startedAt: string | null; endedAt: string | null; status: string }) {
    if (!r.startedAt) return r.earningsCents;
    const end = r.endedAt || new Date(nowTick).toISOString();
    return Math.max(r.earningsCents, earningsCentsForElapsed(r.hourlyRate, r.startedAt, end));
  }

  function runningUsd(r: { hourlyRate: number; startedAt: string | null; endedAt: string | null }) {
    if (!r.startedAt) return 0;
    const end = r.endedAt ? new Date(r.endedAt).getTime() : nowTick;
    return Math.max(0, ((end - new Date(r.startedAt).getTime()) / 3_600_000) * r.hourlyRate);
  }

  async function startGpuRental(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedHost && !activeSku?.rentable && !attachId) return;
    setStarting(true);
    setError(null);
    setBillingHref(false);
    const body = selectedHost
      ? { target: "shared", hostShareId: selectedHost.id, hours, modelId }
      : attachId
        ? { target: "attach", deploymentId: attachId, hours, modelId }
        : {
            target: activeSku.target,
            sku: activeSku.sku,
            hours,
            modelId,
            reserved: activeSku.target === "gcp" ? provision.reserved : true,
            scaleToZero: activeSku.target === "gcp" ? provision.scaleToZero : false,
          };
    const res = await fetch("/api/premium/rentals", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; requiredCents?: number };
    if (!res.ok) {
      setError(data.error || "Could not start rental");
      setBillingHref(res.status === 402);
    }
    setStarting(false);
    await load();
  }

  async function confirmStopRental() {
    if (!stopId) return;
    setStopping(true);
    const res = await fetch(`/api/premium/rentals/${encodeURIComponent(stopId)}`, {
      method: "DELETE",
      credentials: "include",
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) setError(data.error || "Could not stop rental");
    setStopping(false);
    setStopId(null);
    await load();
  }

  async function listHost() {
    setListingBusy(true);
    setError(null);
    const res = await fetch("/api/premium/host", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hourlyUsd: shareHourly }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) setError(data.error || "Could not list this host");
    setListingBusy(false);
    await load();
  }

  async function unlistHost() {
    setListingBusy(true);
    setError(null);
    const res = await fetch("/api/premium/host", { method: "DELETE", credentials: "include" });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) setError(data.error || "Could not unlist this host");
    setListingBusy(false);
    await load();
  }

  const startLabel = selectedHost
    ? selectedHost.isOwn
      ? "Preview as renter"
      : useVsShareCopy("shared-rental").verb
    : attachId
      ? "Attach GPU"
      : product === "self-use"
        ? selfUse.verb
        : rentFromUsCta({
            sku: activeSku?.sku || "nvidia-l4",
            displayName: activeSku?.displayName,
            rentable: activeSku?.rentable,
            hours,
            executionMode,
          });

  function pickUseSku(tier: DisplaySku) {
    setHubLane("use");
    setSelectedSku(tier.sku);
    setAttachId("");
    setSelectedHostId("");
    setHoverSku(null);
  }

  const rentalsList = (
    <div className="min-h-0 overflow-y-auto pr-1">
      <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
        Your rentals
        <span className="ml-2 font-mono text-success">{liveCount}</span>
      </p>
      {rentals.length === 0 ? (
        <p className="mt-2 text-[12px] text-muted-foreground">No rentals yet — premium_rentals only.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {rentals.map((r) => {
            const left = rentalHoursLeft(r);
            const live = r.status === "active" || r.status === "pending";
            const mode = provisionLabel({ ...r.deployment, hostShareId: r.hostShareId });
            return (
              <li key={r.id} className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-foreground truncate">
                    {r.catalog?.displayName || r.modelId || skuName(r.sku)}
                  </p>
                  <p className="text-[10px] text-muted-foreground font-mono truncate">
                    {r.hostShareId ? "Shared host" : skuName(r.sku)} · ${Number(r.hourlyRate).toFixed(2)}/hr · {r.status}
                    {mode ? ` · ${mode}` : ""}
                    {r.hostShareId
                      ? ` · earned ${formatEarningsUsd(liveEarnings({ ...r, earningsCents: r.earningsCents ?? 0 }))}`
                      : ""}
                    {" · "}
                    {left.label}
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2">
                    <Link href="/dashboard/studio" className="text-[10px] underline flex items-center gap-0.5">
                      Studio
                      <ArrowUpRight className="h-2.5 w-2.5" />
                    </Link>
                    {r.deployment?.fqdn ? (
                      <a
                        href={r.deployment.fqdn}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] underline font-mono truncate max-w-[12rem]"
                      >
                        {r.deployment.fqdn}
                      </a>
                    ) : r.deployment?.statusMessage ? (
                      <span className="text-[10px] text-muted-foreground truncate max-w-[12rem]">{r.deployment.statusMessage}</span>
                    ) : null}
                  </div>
                </div>
                {live ? (
                  <button type="button" onClick={() => setStopId(r.id)} className="btn-danger btn-sm shrink-0">
                    <Square className="h-3 w-3" />
                    Stop
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <PageHeader
        compact
        className="mb-2 shrink-0 [&_h1]:text-base [&_h1]:leading-tight [&_p]:text-[11px] [&_p]:mt-0.5"
        eyebrow="Premium"
        title={
          product === "share"
            ? shareCopy.title
            : product === "self-use"
              ? selfUse.title
              : `${openDoor.title} · ${shortGpuLabel(activeSku?.sku || "nvidia-l4", activeSku?.displayName)}`
        }
        description={
          product === "share"
            ? "List this Mac at a real $/hr. Eligibility stays on Share."
            : product === "self-use"
              ? "$0 on this machine — not a rental from OpenDoor."
              : `${shortGpuLabel(activeSku?.sku || "nvidia-l4", activeSku?.displayName)} · $${(activeSku?.hourlyUsd ?? 0).toFixed(2)}/hr · ${activeSku?.region || "your GCP project"}`
        }
        actions={
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="flex items-center rounded-md bg-muted p-0.5 text-xs">
              <button
                type="button"
                onClick={() => {
                  setHubLane("use");
                  setSelectedHostId("");
                }}
                className={cn(
                  "px-2 py-0.5 text-[11px] font-medium rounded transition-colors",
                  hubLane === "use"
                    ? "bg-primary text-primary-foreground font-semibold"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Use
              </button>
              <button
                type="button"
                onClick={() => setHubLane("share")}
                className={cn(
                  "px-2 py-0.5 text-[11px] font-medium rounded transition-colors",
                  hubLane === "share"
                    ? "bg-primary text-primary-foreground font-semibold"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Share
              </button>
            </div>
            {product === "opendoor" ? (
              <div className="flex items-center rounded-md bg-muted p-0.5 text-xs">
                {EXECUTION_MODES.map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => setExecutionMode(mode.id)}
                    className={cn(
                      "px-2 py-0.5 text-[11px] font-medium rounded transition-colors flex items-center gap-1",
                      executionMode === mode.id
                        ? "bg-primary text-primary-foreground font-semibold"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {mode.id === "on-demand" && <Zap className="h-3 w-3" />}
                    {mode.id === "off-peak" && <Moon className="h-3 w-3" />}
                    {mode.id === "batch" && <ListOrdered className="h-3 w-3" />}
                    <span>{mode.label.split(" ")[0]}</span>
                  </button>
                ))}
              </div>
            ) : null}
            <button type="button" onClick={() => setDetailsOpen(true)} className="btn-ghost text-[11px] px-2 py-1">
              Full details
            </button>
            <Link href="/dashboard/studio" className="btn-secondary text-[11px] px-2 py-1 flex items-center gap-1">
              Studio
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        }
      />

      {error ? (
        <div className="alert-error mb-2 shrink-0 text-[12px]" role="alert">
          {error}{" "}
          {billingHref ? (
            <Link href="/dashboard/billing" className="underline font-medium">
              Add credit
            </Link>
          ) : null}
        </div>
      ) : null}

      {loading ? (
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {hubLane === "use" ? (
            <>
              <div className="flex shrink-0 flex-wrap gap-x-3 gap-y-0 border-b border-border">
                {openDoorCards.map((tier) => (
                  <CompactSku
                    key={tier.sku}
                    selected={selectedSku === tier.sku && !attachId}
                    name={shortGpuLabel(tier.sku, tier.displayName)}
                    price={tier.rentable ? `$${tier.hourlyUsd.toFixed(2)}/hr` : "Quote"}
                    onPick={() => pickUseSku(tier)}
                    onPreview={(on) => setHoverSku(on ? tier.sku : null)}
                  />
                ))}
                {localCards.map((tier) => (
                  <CompactSku
                    key={tier.sku}
                    selected={selectedSku === tier.sku && !attachId}
                    name={selfUse.title}
                    price="$0.00/hr"
                    onPick={() => pickUseSku(tier)}
                    onPreview={(on) => setHoverSku(on ? tier.sku : null)}
                  />
                ))}
              </div>

              <div className="mt-2 flex min-h-0 flex-1 flex-col gap-3 overflow-hidden lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-4">
                <form onSubmit={startGpuRental} className="flex shrink-0 flex-col lg:min-h-0 lg:overflow-hidden">
                  <p className="shrink-0 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                    Configure {product === "self-use" ? selfUse.title : shortGpuLabel(activeSku?.sku || "GPU", activeSku?.displayName)}
                  </p>
                  <p className="mt-0.5 shrink-0 text-[11px] font-mono text-muted-foreground">
                    {product === "opendoor" && activeSku
                      ? `$${activeSku.hourlyUsd.toFixed(2)}/hr · ${activeSku.region}`
                      : product === "self-use"
                        ? imageEndpoint?.url
                          ? `Studio live · ${imageEndpoint.kind}`
                          : "Studio offline — rental stays pending until Studio or Ollama is up"
                        : activeMode.availabilityNote}
                  </p>

                  <div className="mt-2 shrink-0">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="flex items-center gap-1 font-medium text-foreground">
                        <Clock className="h-3 w-3 text-primary" />
                        {runUntilStop ? "Until stop" : `${durationHours}h`}
                      </span>
                      <span className="font-mono text-[10px] text-muted-foreground">7–24h</span>
                    </div>
                    <input
                      type="range"
                      min={7}
                      max={24}
                      step={1}
                      value={durationHours}
                      disabled={runUntilStop}
                      onChange={(e) => setDurationHours(Number(e.target.value))}
                      className="mt-1 h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-muted accent-primary disabled:opacity-40"
                    />
                    <div className="mt-1 flex gap-2">
                      {[7, 12, 18, 24].map((val) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => {
                            setRunUntilStop(false);
                            setDurationHours(val);
                          }}
                          className={cn(
                            "text-[10px] font-mono border-b-2 pb-0.5",
                            !runUntilStop && durationHours === val
                              ? "border-primary font-bold text-foreground"
                              : "border-transparent text-muted-foreground",
                          )}
                        >
                          {val}h
                        </button>
                      ))}
                      <label className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground">
                        <input
                          type="checkbox"
                          checked={runUntilStop}
                          onChange={(e) => setRunUntilStop(e.target.checked)}
                          className="h-3 w-3 accent-[hsl(var(--primary))]"
                        />
                        Until stop
                      </label>
                    </div>
                  </div>

                  <div className="mt-2 grid shrink-0 grid-cols-2 gap-2 text-xs">
                    <label>
                      <span className="mb-0.5 block text-[10px] text-muted-foreground">Model</span>
                      <select
                        value={modelId}
                        onChange={(e) => setModelId(e.target.value)}
                        className="input w-full py-1 font-mono text-[11px]"
                      >
                        {catalog.length === 0 ? (
                          <option value="">No catalog models</option>
                        ) : (
                          catalog.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.displayName}
                            </option>
                          ))
                        )}
                      </select>
                    </label>
                    <label>
                      <span className="mb-0.5 block text-[10px] text-muted-foreground">SLA</span>
                      <input
                        type="text"
                        readOnly
                        value={activeMode.sla}
                        className="input w-full cursor-default py-1 font-mono text-[11px] opacity-90"
                      />
                    </label>
                  </div>

                  {deployments.length > 0 ? (
                    <label className="mt-2 block shrink-0 text-xs">
                      <span className="mb-0.5 block text-[10px] text-muted-foreground">Attach running deployment</span>
                      <select
                        className="input w-full py-1 font-mono text-[11px]"
                        value={attachId}
                        onChange={(e) => {
                          setAttachId(e.target.value);
                          setSelectedHostId("");
                        }}
                      >
                        <option value="">
                          New {activeSku?.sku === "metal" ? selfUse.title : `rental on ${shortGpuLabel(activeSku?.sku || "GPU", activeSku?.displayName)}`}
                        </option>
                        {deployments.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name} · {d.target} · {d.gpuType || "gpu"}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}

                  <div className="mt-auto flex shrink-0 items-center justify-between gap-2 border-t border-border pt-2">
                    <div className="min-w-0">
                      <p className="text-[11px] text-muted-foreground">
                        {attachId ? "Attach" : hours == null ? "Until stop" : `Total (${hours}h)`}
                        {estimate ? <span className="ml-1 font-mono font-bold text-foreground">${estimate}</span> : null}
                      </p>
                      <p className="truncate font-mono text-[10px] text-muted-foreground">
                        {activeSku?.target === "gcp" && !attachId
                          ? provision.scaleToZero
                            ? `Idle $0 · $${billedHourly.toFixed(2)}/hr warm · $${scaleCredit} prepaid`
                            : `Reserved $${billedHourly.toFixed(2)}/hr · $${reservedCredit} prepaid`
                          : `${selfUse.title} is $0`}
                      </p>
                    </div>
                    {product === "opendoor" && !activeSku?.rentable ? (
                      <Link href="/dashboard/support" className="btn-primary shrink-0 px-3 py-1.5 text-[11px]">
                        Talk to Support
                      </Link>
                    ) : (
                      <button
                        type="submit"
                        disabled={starting || (!modelId && !attachId) || (!attachId && !activeSku?.rentable)}
                        className="btn-primary flex shrink-0 items-center gap-1.5 px-3 py-1.5 text-[11px]"
                      >
                        {starting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                        {startLabel}
                      </button>
                    )}
                  </div>
                </form>

                <div className="flex min-h-0 flex-col overflow-hidden lg:border-l lg:border-border lg:pl-4">
                  <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                    {previewSku ? <SkuSpecSheet sku={previewSku} localLabel={selfUse.sku} /> : null}
                    <div className="mt-3 border-t border-border pt-2">{rentalsList}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 border-t border-border pt-2 text-[11px] text-muted-foreground">
                    <button type="button" onClick={() => setDetailsOpen(true)} className="underline hover:text-foreground">
                      Full details
                    </button>
                    <button type="button" onClick={() => setHubLane("share")} className="hover:text-foreground">
                      {shareCopy.title} →
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden lg:grid lg:grid-cols-2 lg:gap-4">
              <div className="flex shrink-0 flex-col overflow-hidden lg:min-h-0">
                <p className="shrink-0 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  {shareCopy.title}
                </p>
                {eligibility ? (
                  <p className="mt-1 shrink-0 text-[12px] text-foreground">
                    {eligibility.label}
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {eligibility.workerKind ? ` · ${eligibility.workerKind}` : ""}
                      {eligibility.eligible ? " · eligible to list" : " · not eligible"}
                    </span>
                  </p>
                ) : (
                  <p className="mt-1 shrink-0 text-[12px] text-muted-foreground">Checking whether this Mac can be listed…</p>
                )}
                {eligibility && !eligibility.eligible ? (
                  <ul className="mt-1 shrink-0 space-y-0.5 text-[11px] text-muted-foreground">
                    {eligibility.reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                    {canDemoList ? <li className="text-foreground">Site admin: you can still create a demo listing.</li> : null}
                  </ul>
                ) : null}

                {listing?.status === "listed" ? (
                  <div className="mt-2 flex shrink-0 items-end justify-between gap-2">
                    <div>
                      <p className="text-[12px] font-medium text-foreground">
                        Listed ${listing.hourlyUsd.toFixed(2)}/hr
                        {listing.isDemo ? <span className="ml-1 font-mono text-[10px] uppercase text-warning">Demo</span> : null}
                      </p>
                      <p className="font-mono text-[10px] text-muted-foreground">
                        {listingInUse ? `In use · ${liveInbound.length}` : "Idle"}
                        {" · "}
                        Earned {formatEarningsUsd(
                          listing.earningsCents +
                            liveInbound.reduce((sum, r) => sum + Math.max(0, liveEarnings(r) - r.earningsCents), 0),
                        )}
                        {liveInbound[0]?.startedAt ? ` · $${runningUsd(liveInbound[0]).toFixed(4)} running` : ""}
                      </p>
                      {liveInbound.map((r) => (
                        <p key={r.id} className="font-mono text-[10px] text-muted-foreground">
                          {r.isPreview ? "Preview" : "Inbound"} · {r.status} · {formatEarningsUsd(liveEarnings(r))}
                          <button type="button" onClick={() => setStopId(r.id)} className="ml-2 underline">
                            Stop
                          </button>
                        </p>
                      ))}
                    </div>
                    <button
                      type="button"
                      disabled={listingBusy || listingInUse}
                      onClick={() => void unlistHost()}
                      className="btn-secondary px-2 py-1 text-[11px]"
                    >
                      {listingBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                      {listingInUse ? "Unlist when idle" : "Unlist"}
                    </button>
                  </div>
                ) : (
                  <div className="mt-2 flex shrink-0 items-end gap-2">
                    <label className="text-xs">
                      <span className="mb-0.5 block text-[10px] text-muted-foreground">Listed $/hr</span>
                      <input
                        type="number"
                        min={0.25}
                        max={4}
                        step={0.05}
                        value={shareHourly}
                        onChange={(e) => setShareHourly(Number(e.target.value))}
                        className="input w-24 py-1 font-mono text-[11px]"
                      />
                    </label>
                    <button
                      type="button"
                      disabled={listingBusy || (!eligibility?.eligible && !canDemoList)}
                      onClick={() => void listHost()}
                      className="btn-primary flex items-center gap-1 px-2 py-1 text-[11px]"
                    >
                      {listingBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Share2 className="h-3 w-3" />}
                      {canDemoList ? "List demo" : shareCopy.verb}
                    </button>
                  </div>
                )}

                {selectedHost ? (
                  <form onSubmit={startGpuRental} className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden border-t border-border pt-2">
                    <p className="shrink-0 text-[11px] font-medium text-foreground">Rent {selectedHost.displayName}</p>
                    <p className="font-mono text-[10px] text-muted-foreground">${selectedHost.hourlyUsd.toFixed(2)}/hr listed</p>
                    <div className="mt-auto flex shrink-0 items-center justify-between gap-2 pt-2">
                      <span className="text-[11px] text-muted-foreground">
                        {hours == null ? "Until stop" : `${hours}h`}
                        {estimate ? <span className="ml-1 font-mono font-bold text-foreground">${estimate}</span> : null}
                      </span>
                      <button
                        type="submit"
                        disabled={starting || !modelId || Boolean(selectedHost.inUse)}
                        className="btn-primary flex items-center gap-1 px-3 py-1.5 text-[11px]"
                      >
                        {starting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                        {startLabel}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="mt-auto shrink-0 border-t border-border pt-2 text-[11px] text-muted-foreground">
                    <button type="button" onClick={() => setDetailsOpen(true)} className="underline hover:text-foreground">
                      Full details
                    </button>
                  </div>
                )}
              </div>

              <div className="flex min-h-0 flex-col overflow-hidden lg:border-l lg:border-border lg:pl-4">
                <p className="shrink-0 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  Available hosts
                </p>
                <div className="mt-1 min-h-0 flex-1 overflow-y-auto pr-1">
                  {availableHosts.length === 0 ? (
                    <p className="text-[12px] text-muted-foreground">
                      No hosts listed yet. Real <span className="font-mono">gpu_host_shares</span> rows only.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {availableHosts.map((host) => {
                        const selected = selectedHostId === host.id;
                        return (
                          <li key={host.id} className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-[12px] font-medium text-foreground">
                                {host.displayName}
                                {host.isOwn ? (
                                  <span className="ml-1 font-mono text-[10px] uppercase text-muted-foreground">You</span>
                                ) : null}
                                {host.isDemo ? (
                                  <span className="ml-1 font-mono text-[10px] uppercase text-warning">Demo</span>
                                ) : null}
                              </p>
                              <p className="font-mono text-[10px] text-muted-foreground">
                                ${host.hourlyUsd.toFixed(2)}/hr · {host.inUse ? "In use" : "Open"}
                                {host.workerKind ? ` · ${host.workerKind}` : ""}
                                {host.memoryGb != null ? ` · ${host.memoryGb} GB` : ""}
                              </p>
                            </div>
                            <button
                              type="button"
                              disabled={host.inUse && !selected}
                              onClick={() => {
                                setSelectedHostId(host.id);
                                setAttachId("");
                              }}
                              className={cn(
                                "shrink-0 rounded-md border px-2 py-1 text-[11px]",
                                selected ? "border-primary text-foreground" : "border-border text-muted-foreground",
                              )}
                            >
                              {host.inUse ? "In use" : host.isOwn ? "Preview" : "Select"}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
                <div className="mt-2 flex min-h-0 max-h-[28%] flex-col overflow-hidden border-t border-border pt-2">
                  {rentalsList}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>How Premium works</DialogTitle>
            <DialogDescription>
              Listed gpu_skus rates on your GCP project. Off-peak and batch are capacity windows, not a silent discount.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 text-[13px] text-muted-foreground">
            {hubLane === "share" ? (
              <ol className="space-y-2">
                <li>
                  <span className="font-semibold text-foreground">1. Check this host.</span> Eligibility only applies when
                  you want to list.
                </li>
                <li>
                  <span className="font-semibold text-foreground">2. List at a real $/hr.</span> Unlist only when idle.
                </li>
                <li>
                  <span className="font-semibold text-foreground">3. Earn while away.</span> Cents accrue on the listing
                  and each inbound rental.
                </li>
              </ol>
            ) : (
              <ol className="space-y-2">
                <li>
                  <span className="font-semibold text-foreground">1. Pick an OpenDoor GPU.</span> L4, A100, or H100 at the
                  listed rate on your GCP project.
                </li>
                <li>
                  <span className="font-semibold text-foreground">2. Set duration and start.</span> Cloud Run via
                  deployGpuToGcp. {selfUse.title} is the $0 local card only.
                </li>
                <li>
                  <span className="font-semibold text-foreground">3. Stop when done.</span> Owned Cloud Run services are
                  torn down.
                </li>
              </ol>
            )}
            <div className="space-y-1 font-mono text-[11px]">
              <div className="flex justify-between border-b border-border py-1">
                <span className="font-sans text-muted-foreground">On-Demand (billed)</span>
                <span className="text-foreground">${guides.onDemand.toFixed(2)}/hr</span>
              </div>
              <div className="flex justify-between border-b border-border py-1">
                <span className="font-sans text-muted-foreground">Off-Peak guide</span>
                <span className="text-success">${guides.offPeak.toFixed(2)}/hr · not a meter</span>
              </div>
              <div className="flex justify-between border-b border-border py-1">
                <span className="font-sans text-muted-foreground">Batch guide</span>
                <span className="text-warning">${guides.batch.toFixed(2)}/hr · not a meter</span>
              </div>
            </div>
            <p className="text-[11px] leading-relaxed">
              <ShieldCheck className="mr-1 inline h-3.5 w-3.5 text-primary" />
              You are billed the listed hour while the instance is warm. Off-peak and batch map to Cloud Run
              scale-to-zero ($0 idle).
            </p>
            <ul className="space-y-1 font-mono text-[11px]">
              {CLASS_COMPARISON.map((row) => (
                <li key={row.cls}>
                  <span className="text-foreground">{row.cls}:</span> {row.note}
                </li>
              ))}
            </ul>
            <p className="text-[11px]">
              <Link href="/docs/how-it-works/premium" className="underline">
                How Premium works
              </Link>
              {" · "}
              <Link href="/dashboard/deployments" className="underline">
                Deployments
              </Link>
              {" · "}
              <Link href="/dashboard/support" className="underline">
                Support for clusters
              </Link>
            </p>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(stopId)} onOpenChange={(open) => { if (!open && !stopping) setStopId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Stop this rental?</DialogTitle>
            <DialogDescription>
              Owned GPUs are torn down. Attached boxes stay in place. Shared-host earnings settle up to this moment.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button type="button" className="btn-ghost" disabled={stopping} onClick={() => setStopId(null)}>
              Keep running
            </button>
            <button type="button" className="btn-danger" disabled={stopping} onClick={() => void confirmStopRental()}>
              {stopping ? <Loader2 className="size-4 animate-spin" /> : null}
              Stop rental
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
