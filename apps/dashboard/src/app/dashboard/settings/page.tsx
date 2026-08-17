"use client";

import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import {
  User,
  CreditCard,
  Shield,
  Save,
  Loader2,
  Check,
  Globe,
  Mail,
  ChevronRight,
  KeyRound,
  LifeBuoy,
  Lock,
  Sparkles,
  Camera,
  ExternalLink,
  ArrowUpRight,
  Users,
  Clock,
  Plus,
  Trash2,
  Calendar,
  Cpu,
  Zap,
  Play,
  Info,
  X,
  Gauge,
  Moon,
  ListOrdered,
  Receipt,
} from "lucide-react";
import Link from "next/link";
import { Avatar, Badge } from "@heroui/react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { EnterpriseGate } from "@/components/enterprise-gate";
import { isEnterprisePlan } from "@opendoor/shared";

/* ── Compute Execution Modes ── */
export type ExecutionMode = "on-demand" | "off-peak" | "batch";

interface ExecutionModeConfig {
  id: ExecutionMode;
  label: string;
  badge: string;
  discountText: string;
  description: string;
  availabilityNote: string;
  sla: string;
}

const EXECUTION_MODES: ExecutionModeConfig[] = [
  {
    id: "on-demand",
    label: "On-Demand Dedicated",
    badge: "Instant Real-Time",
    discountText: "Full Price",
    description: "Immediate dedicated GPU instance with zero cold starts, zero queue, and guaranteed non-interrupted runtime.",
    availabilityNote: "Instant launch · 100% Dedicated VRAM",
    sla: "Interactive Sub-Second",
  },
  {
    id: "off-peak",
    label: "Off-Peak Scheduled",
    badge: "10 PM – 8 AM UK & Weekends",
    discountText: "~40% Discount",
    description: "Scheduled compute during predictable low-demand hours (10:00 PM – 8:00 AM UK time & all weekend). Uninterrupted once started.",
    availabilityNote: "Low-demand window · Uninterrupted once provisioned",
    sla: "Scheduled Dedicated",
  },
  {
    id: "batch",
    label: "Flexible Batch Queue",
    badge: "Async Queue (~60% Off)",
    discountText: "Cheapest Rate",
    description: "Cheaper, asynchronous batch processing for bulk image generation and long video diffusion. Jobs queue and process with auto-checkpointing.",
    availabilityNote: "Queue-based · Auto-resumes on spare capacity",
    sla: "Asynchronous Batch (Slower, High Throughput)",
  },
];

/* ── GPU Fleet Tier Specifications ── */
interface GpuTier {
  id: "standard" | "pro" | "max" | "ultra" | "enterprise";
  name: string;
  classEquivalent: string;
  subtitle: string;
  vram: string;
  coreSpeed: string;
  bandwidth: string;
  onDemandHourly: number;
  offPeakHourly: number;
  batchHourly: number;
  marketComparison: string;
  recommendedFor: string;
  benchmarks: {
    fluxDev: string;
    imagen3: string;
    veoVideo: string;
  };
  badge?: string;
  popular?: boolean;
  totalAllocations: number;
  availableAllocations: number;
}

const GPU_TIERS: GpuTier[] = [
  {
    id: "standard",
    name: "Standard GPU",
    classEquivalent: "L4 / Metal Class",
    subtitle: "24GB Dedicated VRAM",
    vram: "24 GB High-Speed VRAM",
    coreSpeed: "120 TFLOPS Core Speed",
    bandwidth: "300 GB/s Memory Bandwidth",
    onDemandHourly: 0.79,
    offPeakHourly: 0.47,
    batchHourly: 0.29,
    marketComparison: "Dedicated node at $0.47/hr off-peak with instant preloaded container.",
    recommendedFor: "Fast SDXL, Flux Schnell 1024px, LoRA testing & low-latency prototyping.",
    benchmarks: {
      fluxDev: "2.1s / step",
      imagen3: "1.9s (1024px)",
      veoVideo: "Standard Queue",
    },
    badge: "Entry",
    totalAllocations: 16,
    availableAllocations: 11,
  },
  {
    id: "pro",
    name: "Pro GPU",
    classEquivalent: "RTX 4090 / A10G Class",
    subtitle: "24GB Ultra-Fast VRAM",
    vram: "24 GB Ultra-Fast VRAM",
    coreSpeed: "250 TFLOPS Core Speed",
    bandwidth: "600 GB/s Memory Bandwidth",
    onDemandHourly: 1.49,
    offPeakHourly: 0.89,
    batchHourly: 0.59,
    marketComparison: "Unlocks dedicated 24GB VRAM with preloaded Flux Dev & zero cold starts.",
    recommendedFor: "Real-time Flux Dev Canvas, ComfyUI node workflows, image-to-video SDV.",
    badge: "Popular",
    popular: true,
    benchmarks: {
      fluxDev: "0.85s / step",
      imagen3: "1.1s (1024px)",
      veoVideo: "6.2s (720p)",
    },
    totalAllocations: 12,
    availableAllocations: 5,
  },
  {
    id: "max",
    name: "Max GPU",
    classEquivalent: "A100 80GB SXM4 Class",
    subtitle: "80GB High-Bandwidth VRAM",
    vram: "80 GB High-Bandwidth VRAM",
    coreSpeed: "312 TFLOPS Core Speed",
    bandwidth: "1,935 GB/s Memory Bandwidth",
    onDemandHourly: 3.29,
    offPeakHourly: 1.98,
    batchHourly: 1.29,
    marketComparison: "Dedicated 80GB SXM4 compute at $1.98/hr off-peak with NVLink throughput.",
    recommendedFor: "High-res Flux 1.1 Pro, multi-modal video synthesis, full-batch LoRA training.",
    badge: "80GB VRAM",
    benchmarks: {
      fluxDev: "0.48s / step",
      imagen3: "0.72s (1024px)",
      veoVideo: "3.8s (1080p)",
    },
    totalAllocations: 8,
    availableAllocations: 3,
  },
  {
    id: "ultra",
    name: "Ultra GPU",
    classEquivalent: "H100 80GB SXM5 Class",
    subtitle: "80GB Ultra-Bandwidth VRAM",
    vram: "80 GB Ultra-Bandwidth VRAM",
    coreSpeed: "750 TFLOPS Core Speed",
    bandwidth: "3,350 GB/s Memory Bandwidth",
    onDemandHourly: 5.95,
    offPeakHourly: 3.57,
    batchHourly: 2.38,
    marketComparison: "Full SXM5 HBM3 speed with 3,350 GB/s bandwidth beating bare cloud rates.",
    recommendedFor: "Cinematic Veo 2 / Wan 2.1 video generation, 4K rendering pipelines, LLM fine-tuning.",
    badge: "Ultra Fast",
    benchmarks: {
      fluxDev: "0.19s / step",
      imagen3: "0.35s (1024px)",
      veoVideo: "1.9s (1080p 60fps)",
    },
    totalAllocations: 6,
    availableAllocations: 2,
  },
  {
    id: "enterprise",
    name: "Enterprise GPUs",
    classEquivalent: "8x H100 640GB Cluster",
    subtitle: "640GB Clustered VRAM",
    vram: "640 GB Clustered VRAM",
    coreSpeed: "6,000 TFLOPS Cluster Compute",
    bandwidth: "3.2 Tbps Ultra Interconnect",
    onDemandHourly: 39.50,
    offPeakHourly: 23.70,
    batchHourly: 18.50,
    marketComparison: "Dedicated 8-way multi-node cluster bundled with 3.2 Tbps InfiniBand interconnect.",
    recommendedFor: "Production-scale video generation pipelines, high-concurrency enterprise studio endpoints.",
    badge: "Cluster Power",
    benchmarks: {
      fluxDev: "< 0.05s / batch",
      imagen3: "0.12s (4K Ultra)",
      veoVideo: "0.65s (4K Cinema)",
    },
    totalAllocations: 4,
    availableAllocations: 1,
  },
];

/* ── Types ── */
interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: string;
  isSiteAdmin: boolean;
  avatarUrl?: string | null;
}

interface OrgSettings {
  id: string;
  name: string;
  slug: string;
  plan: string;
  creditsUsdCents: number;
  ssoEnabled: boolean | null;
  ssoDefaultRole: string | null;
  workosOrganizationId: string | null;
  workosConnectionId: string | null;
  customDomain: string | null;
  customDomainVerified: boolean | null;
  emailNotificationsEnabled: boolean | null;
  notifyOnInvites: boolean | null;
  notifyOnBillingAlerts: boolean | null;
}

interface FamilyMember {
  id: string;
  name: string;
  email: string;
  role: "organizer" | "member";
  avatarUrl?: string | null;
  joinedAt: string;
  monthlyQuotaCents: number | null;
  currentMonthSpentCents: number;
  protectedChild?: boolean;
}

interface FamilyPoolData {
  isFamilyPlan: boolean;
  planId: string;
  planName: string;
  maxSeats: number;
  seatsUsed: number;
  totalPoolCreditsCents: number;
  rolledOverCreditsCents: number;
  rolloverMonthsActive: number;
  rolloverMaxMonths: number;
  hasParentPin?: boolean;
  members: FamilyMember[];
}

type Rental = {
  id: string;
  model: string;
  customModel: string | null;
  deploymentId: string | null;
  sku: string;
  gpuTierName?: string;
  status: string;
  hourlyRate: number;
  hours: number | null;
  modelId: string | null;
  weightsUri: string | null;
  startedAt: string | null;
  endedAt: string | null;
  executionMode: ExecutionMode;
  deployment: {
    id: string;
    name: string;
    target: string;
    status: string;
    fqdn: string | null;
  } | null;
};

/* ── Tab config ── */
interface TabItem {
  id: "profile" | "billing" | "sso" | "domain" | "email";
  label: string;
  icon: any;
  enterprise?: boolean;
}

const TABS: readonly TabItem[] = [
  { id: "profile", label: "Profile & Account", icon: User       },
  { id: "billing", label: "Plans & Billing",   icon: CreditCard },
  { id: "sso",     label: "Authentication",    icon: Shield     },
  { id: "domain",  label: "Custom Domain",     icon: Globe, enterprise: true },
  { id: "email",   label: "Notifications",     icon: Mail       },
] as const;

type Tab = TabItem["id"];

/* ── Row helper ── */
function SettingRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 py-5 sm:flex-row sm:items-start sm:gap-8">
      <div className="w-full shrink-0 sm:w-52">
        <p className="text-sm font-medium" style={{ color: "var(--ink)" }}>{label}</p>
        {hint && <p className="mt-0.5 text-xs leading-relaxed" style={{ color: "var(--ink-3)" }}>{hint}</p>}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}

const ALL_PLAN_TIERS = [
  {
    id: "starter",
    category: "individual",
    name: "Starter",
    price: "$0",
    period: "forever",
    seatsText: "1 Person",
    description: "Essential tools for personal experimentation and prompt exploration.",
    features: [
      "Standard generation queue",
      "500 monthly compute credits",
      "Text-to-image synthesis",
      "Community support",
    ],
    badge: null,
  },
  {
    id: "pro",
    category: "individual",
    name: "Pro",
    price: "$20",
    period: "per month",
    seatsText: "1 Person",
    description: "High-speed real-time canvas, video timeline editor & Google Imagen 3.",
    features: [
      "Sub-second Flux Canvas v2",
      "Google Imagen 3 & Veo 2 video",
      "Interactive video timeline editor",
      "ComfyUI node graph pipeline",
      "5,000 monthly compute credits",
      "Priority GPU synthesis queue",
    ],
    badge: "Solo Creator",
  },
  {
    id: "ultra",
    category: "individual",
    name: "Ultra",
    price: "$45",
    period: "per month",
    seatsText: "1 Person (Power Artist)",
    description: "Maximum performance with Google Imagen 3 Ultra, Veo 2 Cinematic & 4K upscaling.",
    features: [
      "Google Imagen 3 Ultra 8K & Veo 2",
      "15,000 monthly compute credits",
      "Unlimited 4K Super-Resolution",
      "Dedicated high-speed GPU tier",
      "Early access to new foundation models",
      "Priority 24/7 support",
    ],
    badge: "Power Artist",
  },
  {
    id: "family",
    category: "family",
    name: "Family",
    price: "$60",
    period: "per month",
    seatsText: "Up to 4 Family Members",
    description: "Shared credit pool, 4-month credit rollover, private galleries & anti-abuse quotas.",
    features: [
      "4 Family Member Seats included",
      "25,000 Shared Family Credit Pool",
      "4-Month Rollover Vault (unused credits never expire for 4 months)",
      "Per-member monthly credit limits (prevent overspend)",
      "Private individual member galleries & prompt history",
      "Parental content safety filters",
      "Sub-second Flux Canvas & Google Imagen 3",
    ],
    badge: "Best for Families",
    isFamily: true,
  },
  {
    id: "family_max",
    category: "family",
    name: "Family Max",
    price: "$110",
    period: "per month",
    seatsText: "Up to 6 Family Members",
    description: "Ultimate family tier with 60,000 pooled credits, 4-month rollover & Veo 2 for all seats.",
    features: [
      "6 Family Member Seats included",
      "60,000 Shared Family Credit Pool",
      "4-Month Rollover Vault (accumulate unused credits)",
      "Google Veo 2 Cinematic Video for all members",
      "Google Imagen 3 Ultra 8K for all members",
      "Highest priority GPU queue across all family seats",
      "Organizer anti-abuse spending caps & seat management",
      "Unlimited 4K AI detail enhancements",
    ],
    badge: "Maximum Family Power",
    isFamily: true,
  },
];

/* ── Page ── */
export default function SettingsPage() {
  const searchParams = useSearchParams();
  const initialTab = (searchParams?.get("tab") as Tab) || "profile";
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [billingSubTab, setBillingSubTab] = useState<"plans" | "gpus" | "family" | "credits">("plans");
  const [planCategoryView, setPlanCategoryView] = useState<"all" | "individual" | "family">("all");

  // GPU Rental State
  const [selectedGpuTier, setSelectedGpuTier] = useState<GpuTier["id"]>("pro");
  const [executionMode, setExecutionMode] = useState<ExecutionMode>("off-peak");
  const [inspectModalTier, setInspectModalTier] = useState<GpuTier | null>(null);
  const [durationHours, setDurationHours] = useState<number>(12);
  const [selectedModel, setSelectedModel] = useState("flux-1-dev");
  const [gpuStarting, setGpuStarting] = useState(false);

  const [rentals, setRentals] = useState<Rental[]>([
    {
      id: "rent-1",
      model: "premium:flux-1-dev-pro",
      customModel: null,
      deploymentId: "dep-1",
      sku: "pro-gpu-24gb",
      gpuTierName: "Pro GPU (24GB Ultra-Fast · RTX 4090 Class)",
      status: "active",
      hourlyRate: 0.89,
      hours: 12,
      executionMode: "off-peak",
      modelId: "flux-1-dev",
      weightsUri: "black-forest-labs/FLUX.1-dev",
      startedAt: new Date(Date.now() - 45 * 60000).toISOString(),
      endedAt: null,
      deployment: {
        id: "dep-1",
        name: "Dedicated Pro GPU Node",
        target: "cloud",
        status: "running",
        fqdn: "gpu-node-us-central1.opendoor.ai",
      },
    },
  ]);

  const [userProfile, setUserProfile] = useState<UserProfile>({
    id: "user-1",
    name: "Alphonce Ochieng",
    email: "alphonce@ochiengandco.com",
    role: "admin",
    isSiteAdmin: true,
    avatarUrl: null,
  });

  const [settings, setSettings] = useState<OrgSettings>({
    id: "default-workspace",
    name: "OpenDoor Workspace",
    slug: "opendoor",
    plan: "family",
    creditsUsdCents: 36500,
    ssoEnabled: false,
    ssoDefaultRole: "admin",
    workosOrganizationId: null,
    workosConnectionId: null,
    customDomain: null,
    customDomainVerified: false,
    emailNotificationsEnabled: true,
    notifyOnInvites: true,
    notifyOnBillingAlerts: true,
  });

  const [familyData, setFamilyData] = useState<FamilyPoolData>({
    isFamilyPlan: true,
    planId: "family",
    planName: "Family Pool",
    maxSeats: 4,
    seatsUsed: 3,
    totalPoolCreditsCents: 36500,
    rolledOverCreditsCents: 11500,
    rolloverMonthsActive: 3,
    rolloverMaxMonths: 4,
    members: [
      {
        id: "fam-1",
        name: "Alphonce Ochieng",
        email: "alphonce@ochiengandco.com",
        role: "organizer",
        joinedAt: new Date(Date.now() - 30 * 86400000).toISOString(),
        monthlyQuotaCents: null,
        currentMonthSpentCents: 4200,
      },
      {
        id: "fam-2",
        name: "Sarah Ochieng",
        email: "sarah@ochiengandco.com",
        role: "member",
        joinedAt: new Date(Date.now() - 15 * 86400000).toISOString(),
        monthlyQuotaCents: 8000,
        currentMonthSpentCents: 2150,
      },
      {
        id: "fam-3",
        name: "Leo Ochieng",
        email: "leo@ochiengandco.com",
        role: "member",
        joinedAt: new Date(Date.now() - 7 * 86400000).toISOString(),
        monthlyQuotaCents: 5000,
        currentMonthSpentCents: 1800,
      },
    ],
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [topupLoading, setTopupLoading] = useState<number | null>(null);

  // Invite modal state
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteQuotaUsd, setInviteQuotaUsd] = useState("50");
  const [inviteLoading, setInviteLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const activeGpuTier = GPU_TIERS.find((t) => t.id === selectedGpuTier) || GPU_TIERS[1];
  const activeModeConfig = EXECUTION_MODES.find((m) => m.id === executionMode) || EXECUTION_MODES[1];

  const effectiveGpuHourlyRate =
    executionMode === "batch"
      ? activeGpuTier.batchHourly
      : executionMode === "off-peak"
        ? activeGpuTier.offPeakHourly
        : activeGpuTier.onDemandHourly;

  const totalGpuCost = (effectiveGpuHourlyRate * durationHours).toFixed(2);
  const standardGpuCost = (activeGpuTier.onDemandHourly * durationHours).toFixed(2);
  const gpuSavings = (Number(standardGpuCost) - Number(totalGpuCost)).toFixed(2);

  const fetchFamily = async () => {
    try {
      const res = await fetch("/api/settings/family");
      if (res.ok) {
        const data = await res.json();
        if (data.family) setFamilyData(data.family);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    Promise.all([
      fetch("/api/settings/profile").then((r) => r.json()).catch(() => ({})),
      fetch("/api/settings/sso").then((r) => r.json()).catch(() => ({})),
      fetch("/api/billing/balance").then((r) => r.json()).catch(() => ({})),
      fetchFamily(),
    ])
      .then(([profileData, ssoData, balanceData]) => {
        if (profileData.user) {
          setUserProfile(profileData.user);
        }
        if (profileData.org || ssoData.org) {
          const org = profileData.org || ssoData.org;
          setSettings((prev) => ({
            ...prev,
            ...org,
            creditsUsdCents: balanceData?.creditsUsdCents ?? org.creditsUsdCents ?? prev.creditsUsdCents,
          }));
        }
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, []);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);

    try {
      if (activeTab === "profile") {
        const res = await fetch("/api/settings/profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: userProfile.name,
            orgName: settings.name,
          }),
        });
        if (res.ok) {
          setSaved(true);
          setTimeout(() => setSaved(false), 3000);
        } else {
          setError("Failed to save profile changes.");
        }
      } else {
        const res = await fetch("/api/settings/sso", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ssoEnabled: settings.ssoEnabled,
            ssoDefaultRole: settings.ssoDefaultRole,
            workosOrganizationId: settings.workosOrganizationId,
            workosConnectionId: settings.workosConnectionId,
            customDomain: settings.customDomain,
            customDomainVerified: settings.customDomainVerified,
            emailNotificationsEnabled: settings.emailNotificationsEnabled,
            notifyOnInvites: settings.notifyOnInvites,
            notifyOnBillingAlerts: settings.notifyOnBillingAlerts,
          }),
        });
        if (res.ok) {
          setSaved(true);
          setTimeout(() => setSaved(false), 3000);
        } else {
          const data = await res.json().catch(() => ({}));
          setError(data.error || "Failed to save settings.");
        }
      }
    } catch {
      setError("Failed to save settings.");
    } finally {
      setSaving(false);
    }
  }

  const handleAvatarUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      setUserProfile((prev) => ({ ...prev, avatarUrl: String(reader.result) }));
    };
    reader.readAsDataURL(file);
  };

  const handleUpgradePlan = async (planId: string) => {
    setCheckoutLoading(planId);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planId }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.url) {
        window.location.href = data.url;
      } else if (data.usePortal) {
        const portalRes = await fetch("/api/billing/portal", { method: "POST" });
        const portalData = await portalRes.json().catch(() => ({}));
        if (portalData.url) window.location.href = portalData.url;
      } else {
        setSettings((prev) => ({ ...prev, plan: planId }));
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch {
      setSettings((prev) => ({ ...prev, plan: planId }));
    } finally {
      setCheckoutLoading(null);
    }
  };

  const handleTopup = async (cents: number) => {
    setTopupLoading(cents);
    try {
      const res = await fetch("/api/billing/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountCents: cents }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.url) {
        window.location.href = data.url;
      } else {
        setSettings((prev) => ({ ...prev, creditsUsdCents: prev.creditsUsdCents + cents }));
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch {
      setSettings((prev) => ({ ...prev, creditsUsdCents: prev.creditsUsdCents + cents }));
    } finally {
      setTopupLoading(null);
    }
  };

  const handleInviteMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail) return;
    setInviteLoading(true);
    try {
      const res = await fetch("/api/settings/family", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "invite",
          email: inviteEmail,
          name: inviteName,
          monthlyQuotaCents: parseInt(inviteQuotaUsd, 10) * 100,
        }),
      });
      const data = await res.json();
      if (data.members) {
        setFamilyData((prev) => ({ ...prev, members: data.members, seatsUsed: data.members.length }));
        setShowInviteModal(false);
        setInviteEmail("");
        setInviteName("");
      }
    } catch {
      // fallback
    } finally {
      setInviteLoading(false);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    try {
      const res = await fetch("/api/settings/family", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove", memberId }),
      });
      const data = await res.json();
      if (data.members) {
        setFamilyData((prev) => ({ ...prev, members: data.members, seatsUsed: data.members.length }));
      }
    } catch {
      // ignore
    }
  };

  const handleSetChild = async (memberId: string, protectedChild: boolean) => {
    const pin = familyData.hasParentPin
      ? window.prompt("Enter parent PIN to change child protection") || ""
      : undefined;
    try {
      const res = await fetch("/api/settings/family", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_child", memberId, protectedChild, pin }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        window.alert(data.error || "Could not update child protection");
        return;
      }
      setFamilyData((prev) => ({
        ...prev,
        members: prev.members.map((m) =>
          m.id === memberId ? { ...m, protectedChild } : m
        ),
      }));
    } catch {
      window.alert("Could not update child protection");
    }
  };

  const handleSetParentPin = async () => {
    const newPin = window.prompt("Set a 4–8 digit parent PIN") || "";
    if (!/^\d{4,8}$/.test(newPin)) {
      window.alert("PIN must be 4–8 digits");
      return;
    }
    const pin = familyData.hasParentPin
      ? window.prompt("Enter current parent PIN") || ""
      : undefined;
    try {
      const res = await fetch("/api/settings/family", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_parent_pin", newPin, pin }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        window.alert(data.error || "Could not set parent PIN");
        return;
      }
      setFamilyData((prev) => ({ ...prev, hasParentPin: true }));
    } catch {
      window.alert("Could not set parent PIN");
    }
  };

  async function startGpuRental(e: React.FormEvent) {
    e.preventDefault();
    setGpuStarting(true);

    try {
      const newRental: Rental = {
        id: `rent-${Date.now()}`,
        model: `premium:${selectedModel}`,
        customModel: null,
        deploymentId: null,
        sku: activeGpuTier.id,
        gpuTierName: `${activeGpuTier.name} (${activeGpuTier.classEquivalent})`,
        status: "active",
        hourlyRate: effectiveGpuHourlyRate,
        hours: durationHours,
        executionMode: executionMode,
        modelId: selectedModel,
        weightsUri: null,
        startedAt: new Date().toISOString(),
        endedAt: null,
        deployment: {
          id: `dep-${Date.now()}`,
          name: `${activeGpuTier.name} Node`,
          target: "cloud",
          status: "running",
          fqdn: `gpu-${activeGpuTier.id}.opendoor.ai`,
        },
      };
      setRentals((prev) => [newRental, ...prev]);
    } finally {
      setGpuStarting(false);
    }
  }

  const isCurrentFamily = settings.plan === "family" || settings.plan === "family_max";
  const domainLocked =
    !loading && !isEnterprisePlan(settings.plan) && !userProfile.isSiteAdmin;

  const userInitials = (userProfile.name || "User")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const displayedPlans = ALL_PLAN_TIERS.filter((p) => {
    if (planCategoryView === "all") return true;
    if (planCategoryView === "individual") return p.category === "individual";
    if (planCategoryView === "family") return p.category === "family";
    return true;
  });

  return (
    <div>
      <PageHeader
        eyebrow="Workspace"
        title="Settings & Billing"
        description="Manage your personal profile, subscription plans, private GPU rentals, and compute credit pooling."
      />

      <div className="flex flex-col md:flex-row gap-8">
        {/* ── Left Tab Nav ── */}
        <nav className="w-full md:w-52 shrink-0">
          <ul className="flex md:flex-col gap-1 overflow-x-auto pb-2 md:pb-0">
            {TABS.map(({ id, label, icon: Icon, ...tab }) => (
              <li key={id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab(id);
                    setError(null);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all",
                    activeTab === id
                      ? "bg-[var(--paper-3)] text-[var(--ink)] shadow-xs"
                      : "text-[var(--ink-2)] hover:bg-[var(--paper-3)] hover:text-[var(--ink)]",
                  )}
                >
                  <Icon
                    className="h-4 w-4 shrink-0"
                    style={{ color: activeTab === id ? "var(--brand)" : "var(--ink-3)" }}
                  />
                  <span>{label}</span>
                  {"enterprise" in tab && tab.enterprise && domainLocked && (
                    <Lock className="ml-auto h-3.5 w-3.5 shrink-0" style={{ color: "var(--ink-4)" }} />
                  )}
                  {activeTab === id && !("enterprise" in tab && tab.enterprise && domainLocked) && (
                    <ChevronRight className="ml-auto hidden md:block h-3.5 w-3.5" style={{ color: "var(--ink-4)" }} />
                  )}
                </button>
              </li>
            ))}

            <li className="hidden md:block my-2 border-t" style={{ borderColor: "var(--line)" }} />

            <li className="shrink-0">
              <Link
                href="/dashboard/settings/byok"
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors",
                  "text-[var(--ink-2)] hover:bg-[var(--paper-3)] hover:text-[var(--ink)]",
                )}
              >
                <KeyRound className="h-4 w-4 shrink-0" style={{ color: "var(--ink-3)" }} />
                <span>Provider Keys</span>
              </Link>
            </li>
            <li className="shrink-0">
              <Link
                href="/dashboard/support"
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors",
                  "text-[var(--ink-2)] hover:bg-[var(--paper-3)] hover:text-[var(--ink)]",
                )}
              >
                <LifeBuoy className="h-4 w-4 shrink-0" style={{ color: "var(--ink-3)" }} />
                <span>Support</span>
              </Link>
            </li>
          </ul>
        </nav>

        {/* ── Right Content Panel ── */}
        <div className="flex-1 min-w-0">
          {loading ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-indigo-400" />
            </div>
          ) : (
            <form onSubmit={saveProfile}>
              {/* ── 1. Profile & Account ── */}
              {activeTab === "profile" && (
                <div className="card space-y-0 overflow-hidden">
                  <div className="px-6 py-4" style={{ borderBottom: "1px solid var(--line)" }}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <User className="h-4 w-4" style={{ color: "var(--brand)" }} />
                        <h2 className="section-title">Personal Profile & Account</h2>
                      </div>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/10 px-3 py-1 text-xs font-mono font-medium text-indigo-400 border border-indigo-500/20">
                        <Sparkles className="h-3 w-3" />
                        <span>
                          {userProfile.isSiteAdmin
                            ? "SITE ADMIN · UNLIMITED"
                            : `${settings.plan.toUpperCase().replace("_", " ")} PLAN`}
                        </span>
                      </span>
                    </div>
                    <p className="mt-1 text-sm" style={{ color: "var(--ink-3)" }}>
                      Manage your profile photo, personal information, and workspace account identity.
                    </p>
                  </div>

                  <div className="divide-y px-6" style={{ borderColor: "var(--line)" }}>
                    {/* User Avatar & Photo */}
                    <SettingRow label="Profile Avatar" hint="Your photo or account avatar shown across the studio.">
                      <div className="flex items-center gap-4">
                        <Badge.Anchor className="group relative">
                          <Avatar className="size-16" size="lg">
                            {userProfile.avatarUrl ? (
                              <Avatar.Image alt={userProfile.name} src={userProfile.avatarUrl} />
                            ) : null}
                            <Avatar.Fallback>{userInitials}</Avatar.Fallback>
                          </Avatar>
                          <Badge
                            color={userProfile.isSiteAdmin ? "accent" : "success"}
                            placement="bottom-right"
                            size="sm"
                            variant="primary"
                          >
                            {userProfile.isSiteAdmin ? "Admin" : undefined}
                          </Badge>
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="absolute inset-0 z-[1] flex items-center justify-center rounded-full bg-black/60 opacity-0 transition-opacity group-hover:opacity-100"
                            title="Change photo"
                          >
                            <Camera className="h-5 w-5 text-white" />
                          </button>
                        </Badge.Anchor>

                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => fileInputRef.current?.click()}
                              className="btn-secondary text-xs px-3 py-1.5"
                            >
                              Upload new photo
                            </button>
                            {userProfile.avatarUrl && (
                              <button
                                type="button"
                                onClick={() => setUserProfile((prev) => ({ ...prev, avatarUrl: null }))}
                                className="text-xs text-zinc-400 hover:text-white px-2 py-1 transition-colors"
                              >
                                Remove
                              </button>
                            )}
                          </div>
                          <p className="text-[11px]" style={{ color: "var(--ink-4)" }}>
                            JPG, PNG or GIF up to 5MB.
                          </p>
                        </div>

                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleAvatarUpload(file);
                            e.target.value = "";
                          }}
                        />
                      </div>
                    </SettingRow>

                    {/* Display Name */}
                    <SettingRow label="Full Name" hint="Your primary display name across OpenDoor Studio.">
                      <input
                        type="text"
                        value={userProfile.name}
                        onChange={(e) => setUserProfile({ ...userProfile, name: e.target.value })}
                        placeholder="e.g. Alphonce Ochieng"
                        className="input w-full max-w-md text-sm"
                      />
                    </SettingRow>

                    {/* Email Address */}
                    <SettingRow label="Email Address" hint="Used for account login and notifications.">
                      <div className="flex items-center gap-2 max-w-md">
                        <input
                          type="email"
                          readOnly
                          value={userProfile.email}
                          className="input flex-1 text-sm font-mono opacity-90 cursor-default"
                        />
                        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2.5 py-1 text-xs font-mono text-emerald-400 border border-emerald-500/20">
                          <Check className="h-3 w-3" />
                          <span>Verified</span>
                        </span>
                      </div>
                    </SettingRow>

                    {/* Workspace Account & Role */}
                    <SettingRow label="Workspace & Role" hint="Your current organization and permission level.">
                      <div className="flex flex-wrap items-center gap-3">
                        <input
                          type="text"
                          value={settings.name}
                          onChange={(e) => setSettings({ ...settings, name: e.target.value })}
                          placeholder="Workspace Name"
                          className="input text-sm w-56"
                        />
                        <span className="rounded-lg bg-[var(--paper-3)] px-3 py-1.5 text-xs font-mono text-zinc-300 border border-[var(--line)]">
                          Role: {userProfile.role.toUpperCase()}
                        </span>
                        {userProfile.isSiteAdmin && (
                          <span className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-1.5 text-xs font-mono text-indigo-300">
                            Site admin · unlimited
                          </span>
                        )}
                      </div>
                    </SettingRow>

                    {/* Subscription Callout */}
                    <SettingRow label="Subscription Plan" hint="Manage your subscription tier, family pooling, and credits.">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-4">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-white">
                              {userProfile.isSiteAdmin
                                ? "Site admin (unlimited)"
                                : settings.plan === "family"
                                  ? "Family Plan (4 Seats)"
                                  : settings.plan === "family_max"
                                    ? "Family Max Plan (6 Seats)"
                                    : settings.plan === "ultra"
                                      ? "Ultra Studio Plan"
                                      : settings.plan === "pro"
                                        ? "Pro Studio Plan"
                                        : settings.plan === "enterprise"
                                          ? "Enterprise Plan"
                                          : "Starter Plan"}
                            </span>
                            <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-[10px] font-mono text-indigo-300">
                              Active
                            </span>
                          </div>
                          <p className="text-xs text-zinc-400">
                            Pool Balance:{" "}
                            <span className="font-mono text-emerald-400 font-medium">
                              ${(settings.creditsUsdCents / 100).toFixed(2)} USD
                            </span>{" "}
                            {isCurrentFamily && "(includes 4-month rolled over credits)"}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => setActiveTab("billing")}
                          className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-md shadow-indigo-500/20 hover:scale-102 transition-all"
                        >
                          <span>Manage & Upgrade Plan</span>
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </SettingRow>
                  </div>
                </div>
              )}

              {/* ── 2. Unified Plans, GPU Rentals & Billing Hub ── */}
              {activeTab === "billing" && (
                <div className="space-y-6">
                  {/* Unified Sub-Nav Header inside Billing */}
                  <div className="flex items-center justify-between border-b border-white/10 pb-3">
                    <div className="flex items-center gap-1.5 rounded-xl bg-black/50 p-1 border border-white/10">
                      {[
                        { id: "plans", label: "Subscription Plans", icon: Sparkles },
                        { id: "gpus", label: "GPU Rental Hub", icon: Cpu },
                        { id: "family", label: "Family Pool & Rollover", icon: Users },
                        { id: "credits", label: "Credits & Invoices", icon: Receipt },
                      ].map((sub) => {
                        const Icon = sub.icon;
                        return (
                          <button
                            key={sub.id}
                            type="button"
                            onClick={() => setBillingSubTab(sub.id as any)}
                            className={cn(
                              "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all",
                              billingSubTab === sub.id
                                ? "bg-indigo-600 text-white shadow-xs font-semibold"
                                : "text-zinc-400 hover:text-white",
                            )}
                          >
                            <Icon className="h-3.5 w-3.5" />
                            <span>{sub.label}</span>
                          </button>
                        );
                      })}
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <span className="text-[10px] text-zinc-400 font-mono block">Compute Balance</span>
                        <span className="text-sm font-bold font-mono text-emerald-400">
                          ${(settings.creditsUsdCents / 100).toFixed(2)} USD
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* ── Sub-Tab 1: Subscription Plans ── */}
                  {billingSubTab === "plans" && (
                    <div className="space-y-5">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-semibold text-white">Subscription Plans & Tiers</h3>
                          <p className="text-xs text-zinc-400">Choose between solo creator plans and pooled family tiers.</p>
                        </div>

                        <div className="flex items-center rounded-xl bg-black/50 p-1 border border-white/10">
                          {[
                            { id: "all", label: "All Plans" },
                            { id: "individual", label: "Solo Tiers" },
                            { id: "family", label: "Family Plans (Pooled)" },
                          ].map((btn) => (
                            <button
                              key={btn.id}
                              type="button"
                              onClick={() => setPlanCategoryView(btn.id as any)}
                              className={cn(
                                "px-3 py-1 text-xs font-medium rounded-lg transition-all",
                                planCategoryView === btn.id
                                  ? "bg-indigo-600 text-white shadow-xs"
                                  : "text-zinc-400 hover:text-white",
                              )}
                            >
                              {btn.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {displayedPlans.map((tier) => {
                          const isCurrent = settings.plan === tier.id;
                          return (
                            <div
                              key={tier.id}
                              className={cn(
                                "relative flex flex-col justify-between rounded-2xl border p-5 transition-all duration-200",
                                isCurrent
                                  ? "border-indigo-500/60 bg-indigo-500/10 shadow-lg shadow-indigo-500/10"
                                  : tier.isFamily
                                    ? "border-purple-500/30 bg-purple-950/10 hover:border-purple-500/50"
                                    : "border-white/10 bg-black/40 hover:border-white/20",
                              )}
                            >
                              {tier.badge && (
                                <span className="absolute -top-2.5 right-4 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 px-2.5 py-0.5 text-[9px] font-mono font-bold text-white shadow-sm">
                                  {tier.badge}
                                </span>
                              )}

                              <div>
                                <div className="flex items-baseline justify-between">
                                  <h4 className="text-base font-bold text-white">{tier.name}</h4>
                                  <span className="text-[10px] font-mono text-zinc-400 bg-white/5 px-2 py-0.5 rounded-full border border-white/5">
                                    {tier.seatsText}
                                  </span>
                                </div>

                                <div className="mt-2 flex items-baseline gap-1">
                                  <span className="text-2xl font-bold font-mono text-white">{tier.price}</span>
                                  <span className="text-xs text-zinc-400">{tier.period}</span>
                                </div>

                                <p className="mt-2 text-xs text-zinc-400 leading-relaxed min-h-[36px]">
                                  {tier.description}
                                </p>

                                <ul className="mt-4 space-y-2 border-t border-white/10 pt-4 text-xs text-zinc-300">
                                  {tier.features.map((feat) => (
                                    <li key={feat} className="flex items-start gap-2">
                                      <Check className="h-3.5 w-3.5 text-indigo-400 shrink-0 mt-0.5" />
                                      <span>{feat}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>

                              <div className="mt-6 pt-2">
                                {isCurrent ? (
                                  <button
                                    type="button"
                                    disabled
                                    className="w-full rounded-xl border border-indigo-500/40 bg-indigo-500/20 py-2 text-xs font-semibold text-indigo-300 cursor-default"
                                  >
                                    Current Plan
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    disabled={checkoutLoading === tier.id}
                                    onClick={() => void handleUpgradePlan(tier.id)}
                                    className="w-full rounded-xl bg-white text-black py-2 text-xs font-semibold hover:bg-zinc-200 transition-colors shadow-md flex items-center justify-center gap-1.5"
                                  >
                                    {checkoutLoading === tier.id ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <>
                                        <span>Select {tier.name}</span>
                                        <ArrowUpRight className="h-3.5 w-3.5" />
                                      </>
                                    )}
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* ── Sub-Tab 2: GPU Rental Hub ── */}
                  {billingSubTab === "gpus" && (
                    <div className="space-y-4">
                      {/* Mode Header */}
                      <div className="flex items-center justify-between p-3 rounded-2xl bg-black/40 border border-white/10">
                        <div className="flex items-center gap-2">
                          <Cpu className="h-4 w-4 text-indigo-400" />
                          <span className="text-xs font-bold text-white">Select Execution Mode:</span>
                        </div>
                        <div className="flex items-center gap-1">
                          {EXECUTION_MODES.map((mode) => (
                            <button
                              key={mode.id}
                              type="button"
                              onClick={() => setExecutionMode(mode.id)}
                              className={cn(
                                "px-2.5 py-1 text-[11px] font-medium rounded-lg transition-all flex items-center gap-1",
                                executionMode === mode.id
                                  ? "bg-indigo-600 text-white font-semibold shadow-xs"
                                  : "text-zinc-400 hover:text-white bg-white/5",
                              )}
                            >
                              {mode.id === "on-demand" && <Zap className="h-3 w-3" />}
                              {mode.id === "off-peak" && <Moon className="h-3 w-3" />}
                              {mode.id === "batch" && <ListOrdered className="h-3 w-3" />}
                              <span>{mode.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* 5 GPU Tiers Row */}
                      <div className="grid grid-cols-1 md:grid-cols-5 gap-2.5">
                        {GPU_TIERS.map((tier) => {
                          const isSelected = selectedGpuTier === tier.id;
                          const currentHourly =
                            executionMode === "batch"
                              ? tier.batchHourly
                              : executionMode === "off-peak"
                                ? tier.offPeakHourly
                                : tier.onDemandHourly;

                          return (
                            <div
                              key={tier.id}
                              onClick={() => setSelectedGpuTier(tier.id)}
                              className={cn(
                                "group relative cursor-pointer flex flex-col justify-between rounded-2xl border p-3 transition-all duration-200 hover:scale-[1.02]",
                                isSelected
                                  ? "border-indigo-500 bg-gradient-to-b from-indigo-950/40 via-purple-950/20 to-black/80 shadow-indigo-500/20 ring-1 ring-indigo-500"
                                  : "border-white/10 bg-black/40 hover:border-indigo-400/40",
                              )}
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-bold font-mono text-zinc-200">{tier.name}</span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setInspectModalTier(tier);
                                  }}
                                  className="text-zinc-400 hover:text-white"
                                >
                                  <Info className="h-3.5 w-3.5 text-indigo-400" />
                                </button>
                              </div>

                              <div className="mt-1">
                                <span className="inline-block rounded bg-white/5 px-1 py-0.5 text-[9px] font-mono text-indigo-300">
                                  {tier.classEquivalent}
                                </span>
                                <p className="text-[10px] text-emerald-400 font-mono font-semibold mt-0.5">{tier.vram}</p>
                                <div className="mt-1 flex items-baseline gap-1">
                                  <span className="text-base font-bold font-mono text-emerald-400">${currentHourly.toFixed(2)}</span>
                                  <span className="text-[10px] text-zinc-400 font-mono">/ hr</span>
                                </div>
                              </div>

                              <div className="mt-2 border-t border-white/10 pt-1.5 flex justify-between text-[9px] font-mono text-zinc-400">
                                <span>Slots:</span>
                                <span className={tier.availableAllocations <= 2 ? "text-amber-400" : "text-emerald-400"}>
                                  {tier.availableAllocations}/{tier.totalAllocations} Left
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Lease Form */}
                      <div className="card p-4 border-indigo-500/30 bg-gradient-to-br from-black/80 to-indigo-950/20 flex flex-col md:flex-row items-center justify-between gap-4">
                        <div className="flex-1 space-y-2 w-full">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-white font-medium flex items-center gap-1.5">
                              <Clock className="h-3.5 w-3.5 text-indigo-400" />
                              Duration: <span className="font-mono text-indigo-300 font-bold">{durationHours} Hours</span>
                            </span>
                            <span className="text-[10px] font-mono text-zinc-400">{activeModeConfig.availabilityNote}</span>
                          </div>
                          <input
                            type="range"
                            min={7}
                            max={24}
                            step={1}
                            value={durationHours}
                            onChange={(e) => setDurationHours(Number(e.target.value))}
                            className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                          />
                          <div className="pt-1">
                            <select
                              value={selectedModel}
                              onChange={(e) => setSelectedModel(e.target.value)}
                              className="input w-full text-xs font-mono py-1"
                            >
                              <option value="flux-1-dev">Preloaded: Flux.1 Dev (1024px Full Precision)</option>
                              <option value="flux-1-schnell">Preloaded: Flux.1 Schnell (4-Step Realtime)</option>
                              <option value="google-imagen-3">Preloaded: Google Imagen 3 (Ultra 8K)</option>
                              <option value="google-veo-2">Preloaded: Google Veo 2 (Video Diffusion)</option>
                            </select>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 shrink-0">
                          <div>
                            <span className="text-[10px] text-zinc-400 block font-mono">Total ({durationHours}h)</span>
                            <div className="flex items-baseline gap-1.5">
                              <span className="text-lg font-bold font-mono text-emerald-400">${totalGpuCost} USD</span>
                              {executionMode !== "on-demand" && Number(gpuSavings) > 0 && (
                                <span className="text-[10px] text-emerald-400 font-mono">(-${gpuSavings})</span>
                              )}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={startGpuRental}
                            disabled={gpuStarting}
                            className="btn-primary text-xs px-4 py-2 flex items-center gap-1.5"
                          >
                            {gpuStarting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                            <span>Rent {activeGpuTier.name}</span>
                          </button>
                        </div>
                      </div>

                      {/* Active GPU Nodes if any */}
                      {rentals.length > 0 && (
                        <div className="card p-4 space-y-2">
                          <span className="text-xs font-semibold text-white block">Active GPU Leases ({rentals.length})</span>
                          <div className="space-y-2">
                            {rentals.map((r) => (
                              <div key={r.id} className="flex items-center justify-between p-2.5 rounded-xl bg-white/5 border border-white/10 text-xs">
                                <div>
                                  <p className="font-semibold text-white">{r.gpuTierName || r.model}</p>
                                  <p className="text-[10px] text-zinc-400 font-mono">${r.hourlyRate.toFixed(2)}/hr · {r.hours}h lease ({r.executionMode})</p>
                                </div>
                                <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[9px] font-mono text-emerald-300">
                                  Running
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Sub-Tab 3: Family Pool & Rollover ── */}
                  {billingSubTab === "family" && (
                    <div className="space-y-4">
                      <div className="card p-6 border-indigo-500/40 bg-gradient-to-br from-indigo-950/40 via-purple-950/20 to-black/80 backdrop-blur-xl">
                        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 pb-5 border-b border-white/10">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="rounded-full bg-indigo-500/20 px-2.5 py-0.5 text-[10px] font-mono font-bold text-indigo-300 border border-indigo-500/30">
                                SHARED FAMILY CREDIT POOL
                              </span>
                              <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[10px] font-mono font-bold text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                <span>4-MONTH ROLLOVER VAULT</span>
                              </span>
                            </div>

                            <h2 className="mt-2 text-2xl font-bold text-white tracking-tight">
                              {settings.plan === "family_max" ? "Family Max Plan (6 Seats)" : "Family Plan (4 Seats)"}
                            </h2>
                            <p className="mt-1 text-xs text-zinc-300 max-w-xl">
                              All family members share this centralized credit pool with private individual libraries, anti-abuse quotas, and automatic 4-month rollover.
                            </p>
                          </div>

                          <div className="flex items-center gap-6 bg-black/40 p-3.5 rounded-2xl border border-white/10">
                            <div>
                              <span className="text-[10px] text-zinc-400 font-mono block">Total Spendable Pool</span>
                              <span className="text-2xl font-bold font-mono text-emerald-400">
                                ${(settings.creditsUsdCents / 100).toFixed(2)}
                              </span>
                            </div>

                            <div className="border-l border-white/10 pl-6">
                              <span className="text-[10px] text-zinc-400 font-mono block">Rolled Over (Up to 4 mo)</span>
                              <span className="text-lg font-bold font-mono text-indigo-300">
                                ${(familyData.rolledOverCreditsCents / 100).toFixed(2)}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* 4-Month Rollover Progress Timeline */}
                        <div className="pt-4 space-y-2">
                          <div className="flex items-center justify-between text-xs text-zinc-300">
                            <div className="flex items-center gap-1.5 font-medium">
                              <Calendar className="h-3.5 w-3.5 text-indigo-400" />
                              <span>Credit Rollover Vault Activity (Up to 4 Consecutive Months)</span>
                            </div>
                            <span className="text-[11px] font-mono text-zinc-400">
                              Unused credits roll over automatically
                            </span>
                          </div>

                          <div className="grid grid-cols-4 gap-2 pt-1">
                            {[
                              { month: "Month 1 (Current)", status: "Active Grant ($60.00)", color: "border-indigo-500/60 bg-indigo-500/20 text-indigo-200" },
                              { month: "Month 2 Rollover", status: "Preserved ($45.00)", color: "border-emerald-500/50 bg-emerald-500/15 text-emerald-200" },
                              { month: "Month 3 Rollover", status: "Preserved ($40.00)", color: "border-emerald-500/50 bg-emerald-500/15 text-emerald-200" },
                              { month: "Month 4 Vault Cap", status: "Protected ($30.00)", color: "border-purple-500/50 bg-purple-500/15 text-purple-200" },
                            ].map((slot, idx) => (
                              <div key={idx} className={cn("rounded-xl border p-2.5 text-center", slot.color)}>
                                <p className="text-[11px] font-semibold">{slot.month}</p>
                                <p className="text-[10px] font-mono opacity-80 mt-0.5">{slot.status}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Family Members Controls */}
                      <div className="card p-5 space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <Users className="h-4 w-4 text-indigo-400" />
                              <h3 className="text-sm font-semibold text-white">Family Members & Seat Controls</h3>
                            </div>
                            <p className="text-xs text-zinc-400 mt-0.5">
                              {familyData.members.length} of {settings.plan === "family_max" ? 6 : 4} seats filled. Manage per-seat monthly spending caps and child protection.
                            </p>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => void handleSetParentPin()}
                              className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:bg-white/10"
                            >
                              {familyData.hasParentPin ? "Change parent PIN" : "Set parent PIN"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setShowInviteModal(true)}
                              disabled={familyData.members.length >= (settings.plan === "family_max" ? 6 : 4)}
                              className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 transition-colors disabled:opacity-40"
                            >
                              <Plus className="h-3.5 w-3.5" />
                              <span>Invite Family Member</span>
                            </button>
                          </div>
                        </div>

                        <div className="divide-y divide-white/10 border-t border-b border-white/10">
                          {familyData.members.map((member) => (
                            <div key={member.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 py-3">
                              <div className="flex items-center gap-3">
                                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-mono font-bold text-xs">
                                  {member.name.slice(0, 2).toUpperCase()}
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-semibold text-white">{member.name}</span>
                                    {member.role === "organizer" && (
                                      <span className="rounded-full bg-amber-500/20 px-2 py-0.2 text-[9px] font-mono text-amber-300 border border-amber-500/30">
                                        ORGANIZER
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-[11px] text-zinc-400 font-mono">{member.email}</span>
                                </div>
                              </div>

                              <div className="flex items-center gap-4">
                                <div className="text-right">
                                  <span className="text-[10px] text-zinc-400 block font-mono">Monthly Fair-Use Cap</span>
                                  <span className="text-xs font-mono font-medium text-emerald-300">
                                    {member.monthlyQuotaCents ? `$${member.monthlyQuotaCents / 100} / mo limit` : "Uncapped (Full Pool)"}
                                  </span>
                                </div>

                                {member.role !== "organizer" && (
                                  <label className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-300">
                                    <input
                                      type="checkbox"
                                      checked={Boolean(member.protectedChild)}
                                      onChange={(e) => void handleSetChild(member.id, e.target.checked)}
                                      className="rounded border-white/20"
                                    />
                                    Child / Protected
                                  </label>
                                )}

                                {member.role !== "organizer" && (
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveMember(member.id)}
                                    className="text-zinc-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-white/5 transition-colors"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── Sub-Tab 4: Credits & Invoices ── */}
                  {billingSubTab === "credits" && (
                    <div className="space-y-4">
                      <div className="card p-6 border-indigo-500/30 bg-gradient-to-br from-black/80 to-indigo-950/20">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                          <div>
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-indigo-400 font-mono">
                              Available Compute Credits
                            </span>
                            <div className="text-3xl font-bold font-mono text-emerald-400 mt-1">
                              ${(settings.creditsUsdCents / 100).toFixed(2)} USD
                            </div>
                            <p className="text-xs text-zinc-400 mt-1">
                              Use compute credits for GPU rentals, real-time canvas synthesis, and 4K upscaling.
                            </p>
                          </div>

                          <div className="flex items-center gap-2">
                            {[2000, 5000, 10000].map((cents) => (
                              <button
                                key={cents}
                                type="button"
                                disabled={topupLoading === cents}
                                onClick={() => void handleTopup(cents)}
                                className="rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-xs font-mono font-bold text-zinc-200 hover:bg-white/10 transition-colors"
                              >
                                {topupLoading === cents ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : `+$${cents / 100}`}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="card p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/5 border border-white/10">
                            <CreditCard className="h-4 w-4 text-zinc-300" />
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-white">Payment Methods & Invoices</p>
                            <p className="text-[11px] text-zinc-400">Update payment cards and download past tax receipts via Stripe.</p>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={async () => {
                            const res = await fetch("/api/billing/portal", { method: "POST" });
                            const data = await res.json().catch(() => ({}));
                            if (data.url) window.location.href = data.url;
                          }}
                          className="btn-secondary text-xs flex items-center gap-1.5"
                        >
                          <span>Stripe Portal</span>
                          <ExternalLink className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── 3. Authentication / SSO ── */}
              {activeTab === "sso" && (
                <div className="card">
                  <div className="px-6 py-4" style={{ borderBottom: "1px solid var(--line)" }}>
                    <div className="flex items-center gap-2.5">
                      <Shield className="h-4 w-4" style={{ color: "var(--brand)" }} />
                      <h2 className="section-title">Single Sign-On & Authentication</h2>
                    </div>
                    <p className="mt-1 text-sm" style={{ color: "var(--ink-3)" }}>
                      Allow your team to authenticate via Okta, Azure AD, Google Workspace, and SAML through WorkOS.
                    </p>
                  </div>

                  <div className="divide-y px-6" style={{ borderColor: "var(--line)" }}>
                    <SettingRow label="Enable SSO" hint="Team members will be redirected to your identity provider.">
                      <label className="flex cursor-pointer items-center gap-3">
                        <input
                          type="checkbox"
                          checked={settings.ssoEnabled || false}
                          onChange={(e) => setSettings({ ...settings, ssoEnabled: e.target.checked })}
                          className="h-4 w-4 rounded accent-indigo-600"
                        />
                        <span className="text-sm" style={{ color: "var(--ink-2)" }}>
                          {settings.ssoEnabled ? "SSO is enabled" : "SSO is disabled"}
                        </span>
                      </label>
                    </SettingRow>

                    <SettingRow label="WorkOS Organisation ID" hint="Found in your WorkOS Dashboard under Organisations.">
                      <input
                        type="text"
                        value={settings.workosOrganizationId || ""}
                        onChange={(e) => setSettings({ ...settings, workosOrganizationId: e.target.value })}
                        placeholder="org_xxxxxxxxxxxx"
                        className="input w-full max-w-md font-mono text-xs"
                      />
                    </SettingRow>

                    <SettingRow label="Default Role" hint="Role assigned to new users who sign in via SSO.">
                      <select
                        value={settings.ssoDefaultRole || "member"}
                        onChange={(e) => setSettings({ ...settings, ssoDefaultRole: e.target.value })}
                        className="input max-w-xs"
                      >
                        <option value="member">Member</option>
                        <option value="admin">Admin</option>
                      </select>
                    </SettingRow>
                  </div>
                </div>
              )}

              {/* ── 4. Custom Domain ── */}
              {activeTab === "domain" && (
                <EnterpriseGate locked={domainLocked} feature="Custom Domain">
                  <div className="card">
                    <div className="px-6 py-4" style={{ borderBottom: "1px solid var(--line)" }}>
                      <div className="flex items-center gap-2.5">
                        <Globe className="h-4 w-4" style={{ color: "var(--brand)" }} />
                        <h2 className="section-title">Custom Domain</h2>
                      </div>
                      <p className="mt-1 text-sm" style={{ color: "var(--ink-3)" }}>
                        Configure a custom branded domain for your OpenDoor dashboard and API gateway.
                      </p>
                    </div>

                    <div className="divide-y px-6" style={{ borderColor: "var(--line)" }}>
                      <SettingRow label="Dashboard Domain" hint="The custom domain you want to use for the studio.">
                        <input
                          type="text"
                          value={settings.customDomain || ""}
                          onChange={(e) => setSettings({ ...settings, customDomain: e.target.value, customDomainVerified: false })}
                          placeholder="app.yourdomain.com"
                          className="input w-full max-w-md font-mono text-xs"
                        />
                      </SettingRow>
                    </div>
                  </div>
                </EnterpriseGate>
              )}

              {/* ── 5. Email Notifications ── */}
              {activeTab === "email" && (
                <div className="card">
                  <div className="px-6 py-4" style={{ borderBottom: "1px solid var(--line)" }}>
                    <div className="flex items-center gap-2.5">
                      <Mail className="h-4 w-4" style={{ color: "var(--brand)" }} />
                      <h2 className="section-title">Email Notifications</h2>
                    </div>
                    <p className="mt-1 text-sm" style={{ color: "var(--ink-3)" }}>
                      Control which notification alerts you receive.
                    </p>
                  </div>

                  <div className="divide-y px-6" style={{ borderColor: "var(--line)" }}>
                    <SettingRow label="Master Notifications" hint="Toggle all email notifications on or off.">
                      <label className="flex cursor-pointer items-center gap-3">
                        <input
                          type="checkbox"
                          checked={settings.emailNotificationsEnabled || false}
                          onChange={(e) => setSettings({ ...settings, emailNotificationsEnabled: e.target.checked })}
                          className="h-4 w-4 rounded accent-indigo-600"
                        />
                        <span className="text-sm" style={{ color: "var(--ink-2)" }}>
                          {settings.emailNotificationsEnabled ? "Email notifications enabled" : "Email notifications disabled"}
                        </span>
                      </label>
                    </SettingRow>

                    <SettingRow label="Billing & Balance Alerts" hint="Receive an alert when compute credits fall below threshold.">
                      <label className="flex cursor-pointer items-center gap-3">
                        <input
                          type="checkbox"
                          checked={settings.notifyOnBillingAlerts || false}
                          onChange={(e) => setSettings({ ...settings, notifyOnBillingAlerts: e.target.checked })}
                          disabled={!settings.emailNotificationsEnabled}
                          className="h-4 w-4 rounded accent-indigo-600 disabled:opacity-40"
                        />
                        <span className="text-sm" style={{ color: settings.emailNotificationsEnabled ? "var(--ink-2)" : "var(--ink-4)" }}>
                          {settings.notifyOnBillingAlerts ? "On" : "Off"}
                        </span>
                      </label>
                    </SettingRow>
                  </div>
                </div>
              )}

              {/* Error & Save Footer */}
              {error && (
                <div className="mt-4 alert-error text-sm">{error}</div>
              )}

              {activeTab !== "billing" && !(activeTab === "domain" && domainLocked) && (
                <div className="mt-5 flex items-center gap-3">
                  <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2">
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : saved ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    <span>{saving ? "Saving…" : saved ? "Saved!" : "Save Changes"}</span>
                  </button>
                  {saved && (
                    <span className="text-xs text-emerald-400 font-medium">Changes saved successfully.</span>
                  )}
                </div>
              )}
            </form>
          )}
        </div>
      </div>

      {/* Detail Modal Dialog for GPU Specs */}
      {inspectModalTier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
            onClick={() => setInspectModalTier(null)}
          />

          <div
            className="relative z-10 w-full max-w-lg rounded-2xl border border-white/20 p-6 shadow-2xl backdrop-blur-2xl space-y-5 animate-in fade-in zoom-in-95 duration-200"
            style={{ background: "rgba(14, 16, 26, 0.98)" }}
          >
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                  <Cpu className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-white">{inspectModalTier.name}</h3>
                    <span className="rounded-md bg-indigo-500/20 px-2 py-0.5 text-[10px] font-mono font-bold text-indigo-300">
                      {inspectModalTier.classEquivalent}
                    </span>
                  </div>
                  <p className="text-xs text-emerald-400 font-mono font-semibold">{inspectModalTier.vram}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setInspectModalTier(null)}
                className="rounded-full p-1 text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400 font-mono">
                Compute & Memory Specifications
              </h4>
              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <div className="rounded-xl bg-white/5 p-2.5 border border-white/5">
                  <span className="text-zinc-500 text-[10px] block">Dedicated VRAM</span>
                  <span className="text-emerald-400 font-bold">{inspectModalTier.vram}</span>
                </div>
                <div className="rounded-xl bg-white/5 p-2.5 border border-white/5">
                  <span className="text-zinc-500 text-[10px] block">Core Compute Speed</span>
                  <span className="text-white font-bold">{inspectModalTier.coreSpeed}</span>
                </div>
                <div className="rounded-xl bg-white/5 p-2.5 border border-white/5">
                  <span className="text-zinc-500 text-[10px] block">Memory Bandwidth</span>
                  <span className="text-white font-bold">{inspectModalTier.bandwidth}</span>
                </div>
                <div className="rounded-xl bg-white/5 p-2.5 border border-white/5">
                  <span className="text-zinc-500 text-[10px] block">Platform Advantage</span>
                  <span className="text-emerald-300 font-sans text-[11px]">{inspectModalTier.marketComparison}</span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400 font-mono flex items-center gap-1.5">
                <Gauge className="h-3.5 w-3.5 text-indigo-400" />
                <span>Live Inference Benchmarks</span>
              </h4>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-xl bg-indigo-500/10 border border-indigo-500/20 p-2">
                  <span className="text-[10px] text-zinc-400 block">Flux.1 Dev</span>
                  <span className="font-mono text-indigo-300 font-bold mt-0.5 block">{inspectModalTier.benchmarks.fluxDev}</span>
                </div>
                <div className="rounded-xl bg-indigo-500/10 border border-indigo-500/20 p-2">
                  <span className="text-[10px] text-zinc-400 block">Google Imagen 3</span>
                  <span className="font-mono text-indigo-300 font-bold mt-0.5 block">{inspectModalTier.benchmarks.imagen3}</span>
                </div>
                <div className="rounded-xl bg-indigo-500/10 border border-indigo-500/20 p-2">
                  <span className="text-[10px] text-zinc-400 block">Veo 2 Video</span>
                  <span className="font-mono text-indigo-300 font-bold mt-0.5 block">{inspectModalTier.benchmarks.veoVideo}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={() => setInspectModalTier(null)}
                className="btn-secondary text-xs px-4 py-2"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedGpuTier(inspectModalTier.id);
                  setInspectModalTier(null);
                }}
                className="btn-primary text-xs px-4 py-2 flex items-center gap-1.5"
              >
                <Check className="h-3.5 w-3.5" />
                <span>Select {inspectModalTier.name}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invite Family Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setShowInviteModal(false)} />

          <div
            className="relative z-10 w-full max-w-md rounded-2xl border border-white/15 p-6 shadow-2xl backdrop-blur-2xl"
            style={{ background: "rgba(16, 18, 28, 0.98)" }}
          >
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-indigo-400" />
                <h3 className="text-base font-bold text-white">Invite Family Member</h3>
              </div>
            </div>

            <form onSubmit={handleInviteMember} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Family Member Email</label>
                <input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="family.member@email.com"
                  className="input w-full text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Name (Optional)</label>
                <input
                  type="text"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  placeholder="e.g. Alex"
                  className="input w-full text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Monthly Fair-Use Cap (USD)
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono text-zinc-400">$</span>
                  <input
                    type="number"
                    min="1"
                    max="200"
                    value={inviteQuotaUsd}
                    onChange={(e) => setInviteQuotaUsd(e.target.value)}
                    className="input w-32 font-mono text-sm"
                  />
                  <span className="text-xs text-zinc-400 font-mono">USD / month cap</span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="btn-secondary text-xs px-4 py-2"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={inviteLoading}
                  className="btn-primary text-xs px-4 py-2 flex items-center gap-2"
                >
                  {inviteLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  <span>Send Family Invite</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
