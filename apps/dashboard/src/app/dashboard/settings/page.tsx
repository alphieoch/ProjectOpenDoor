"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { Avatar, Badge } from "@heroui/react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { EnterpriseGate } from "@/components/enterprise-gate";
import { formatPlanPriceUsd, formatUsd, getPlan, isEnterprisePlan } from "@opendoor/shared";

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
  icon: LucideIcon;
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
        <p className="text-sm font-medium text-foreground">{label}</p>
        {hint && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{hint}</p>}
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
    price: formatPlanPriceUsd(getPlan("starter").amountUsd),
    period: "forever",
    seatsText: "1 Person",
    description: "Log in and top up to use the API. No included inference stipend.",
    features: [
      `${formatUsd(getPlan("starter").includedCreditsCents)} included inference credit`,
      `${getPlan("starter").maxApiKeys} API keys`,
      `${getPlan("starter").maxActiveDeployments} dedicated deployment`,
    ],
    badge: null,
  },
  {
    id: "pro",
    category: "individual",
    name: "Pro",
    price: formatPlanPriceUsd(getPlan("pro").amountUsd),
    period: "per month",
    seatsText: "1 Person",
    description: getPlan("pro").name,
    features: [
      `${formatUsd(getPlan("pro").includedCreditsCents)} included inference credit every month`,
      `${getPlan("pro").maxApiKeys} API keys`,
      `${getPlan("pro").maxActiveDeployments} concurrent dedicated deployments`,
    ],
    badge: "Solo Creator",
  },
  {
    id: "ultra",
    category: "individual",
    name: "Ultra",
    price: formatPlanPriceUsd(getPlan("ultra").amountUsd),
    period: "per month",
    seatsText: "1 Person",
    description: getPlan("ultra").name,
    features: [
      `${formatUsd(getPlan("ultra").includedCreditsCents)} included inference credit every month`,
      `${getPlan("ultra").maxApiKeys} API keys`,
      `${getPlan("ultra").maxActiveDeployments} concurrent dedicated deployments`,
    ],
    badge: "Power Artist",
  },
  {
    id: "family",
    category: "family",
    name: "Family",
    price: formatPlanPriceUsd(getPlan("family").amountUsd),
    period: "per month",
    seatsText: `Up to ${getPlan("family").maxSeats} members`,
    description: "Shared household credit pool and seat caps.",
    features: [
      `${getPlan("family").maxSeats} seats included`,
      `${formatUsd(getPlan("family").includedCreditsCents)} shared monthly stipend`,
      `${getPlan("family").rolloverMonths}-month unused stipend rollover`,
    ],
    badge: "Best for Families",
    isFamily: true,
  },
  {
    id: "family_max",
    category: "family",
    name: "Family Max",
    price: formatPlanPriceUsd(getPlan("family_max").amountUsd),
    period: "per month",
    seatsText: `Up to ${getPlan("family_max").maxSeats} members`,
    description: "Larger household pool and more seats.",
    features: [
      `${getPlan("family_max").maxSeats} seats included`,
      `${formatUsd(getPlan("family_max").includedCreditsCents)} shared monthly stipend`,
      `${getPlan("family_max").rolloverMonths}-month unused stipend rollover`,
      "Organizer anti-abuse spending caps & seat management",
    ],
    badge: "Maximum Family Power",
    isFamily: true,
  },
];

/* ── Page ── */
export default function SettingsPage() {
  const router = useRouter();
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
  const gpuStarting = false;

  const [rentals, setRentals] = useState<Rental[]>([]);

  const [userProfile, setUserProfile] = useState<UserProfile>({
    id: "",
    name: "",
    email: "",
    role: "member",
    isSiteAdmin: false,
    avatarUrl: null,
  });

  const [settings, setSettings] = useState<OrgSettings>({
    id: "",
    name: "",
    slug: "",
    plan: "free",
    creditsUsdCents: 0,
    ssoEnabled: false,
    ssoDefaultRole: "member",
    workosOrganizationId: null,
    workosConnectionId: null,
    customDomain: null,
    customDomainVerified: false,
    emailNotificationsEnabled: true,
    notifyOnInvites: true,
    notifyOnBillingAlerts: true,
  });

  const [familyData, setFamilyData] = useState<FamilyPoolData>({
    isFamilyPlan: false,
    planId: "free",
    planName: "",
    maxSeats: 1,
    seatsUsed: 0,
    totalPoolCreditsCents: 0,
    rolledOverCreditsCents: 0,
    rolloverMonthsActive: 0,
    rolloverMaxMonths: 0,
    members: [],
  });
  const [pinDialog, setPinDialog] = useState<{
    mode: "set" | "child";
    memberId?: string;
    protectedChild?: boolean;
  } | null>(null);
  const [pinValue, setPinValue] = useState("");
  const [pinCurrent, setPinCurrent] = useState("");

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
      fetch("/api/settings/profile", { credentials: "include" }).then((r) => r.json()).catch(() => ({})),
      fetch("/api/settings/sso", { credentials: "include" }).then((r) => r.json()).catch(() => ({})),
      fetch("/api/billing/balance", { credentials: "include" }).then((r) => r.json()).catch(() => ({})),
      fetch("/api/deployments", { credentials: "include" }).then((r) => r.json()).catch(() => ({})),
      fetchFamily(),
    ])
      .then(([profileData, ssoData, balanceData, deployData]) => {
        if (profileData.user) {
          setUserProfile((prev) => ({ ...prev, ...profileData.user }));
        }
        if (profileData.org || ssoData.org) {
          const org = profileData.org || ssoData.org;
          setSettings((prev) => ({
            ...prev,
            ...org,
            creditsUsdCents: balanceData?.creditsUsdCents ?? org.creditsUsdCents ?? prev.creditsUsdCents,
          }));
        }
        if (Array.isArray(deployData.deployments)) {
          setRentals(
            deployData.deployments.map((d: {
              id: string;
              name: string;
              status: string;
              gpuType: string;
              sourceValue?: string;
              runtimeModel?: string | null;
              startedAt?: string | null;
              target?: string;
              fqdn?: string | null;
              computeCostUsd?: string | null;
            }) => ({
              id: d.id,
              model: d.runtimeModel || d.sourceValue || d.name,
              customModel: null,
              deploymentId: d.id,
              sku: d.gpuType,
              gpuTierName: d.name,
              status: d.status,
              hourlyRate: Number(d.computeCostUsd || 0),
              hours: null,
              executionMode: "on-demand" as const,
              modelId: d.runtimeModel || d.sourceValue || null,
              weightsUri: null,
              startedAt: d.startedAt || null,
              endedAt: null,
              deployment: {
                id: d.id,
                name: d.name,
                target: d.target || "gcp",
                status: d.status,
                fqdn: d.fqdn || null,
              },
            })),
          );
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
        body: JSON.stringify({ planId }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      if (data.usePortal) {
        const portalRes = await fetch("/api/billing/portal", { method: "POST" });
        const portalData = await portalRes.json().catch(() => ({}));
        if (portalData.url) {
          window.location.href = portalData.url;
          return;
        }
      }
      setError(data.error || "Checkout is not configured for this plan.");
    } catch {
      setError("Failed to start checkout.");
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
        return;
      }
      setError(data.error || "Top-up checkout is not configured.");
    } catch {
      setError("Failed to start top-up.");
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
      if (!res.ok) {
        setError(data.error || "Failed to invite member.");
        return;
      }
      setShowInviteModal(false);
      setInviteEmail("");
      setInviteName("");
      await fetchFamily();
    } catch {
      setError("Failed to invite member.");
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
      if (!res.ok) {
        setError(data.error || "Failed to remove member.");
        return;
      }
      await fetchFamily();
    } catch {
      setError("Failed to remove member.");
    }
  };

  const handleSetChild = async (memberId: string, protectedChild: boolean, pinOverride?: string) => {
    if (familyData.hasParentPin && pinOverride == null) {
      setPinDialog({ mode: "child", memberId, protectedChild });
      setPinValue("");
      setPinCurrent("");
      return;
    }
    const pin = pinOverride;
    try {
      const res = await fetch("/api/settings/family", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_child", memberId, protectedChild, pin }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not update child protection");
        return;
      }
      await fetchFamily();
    } catch {
      setError("Could not update child protection");
    }
  };

  const handleSetParentPin = () => {
    setPinDialog({ mode: "set" });
    setPinValue("");
    setPinCurrent("");
  };

  async function submitPinDialog(e: React.FormEvent) {
    e.preventDefault();
    if (!pinDialog) return;
    if (pinDialog.mode === "set") {
      if (!/^\d{4,8}$/.test(pinValue)) {
        setError("PIN must be 4–8 digits");
        return;
      }
      const res = await fetch("/api/settings/family", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set_parent_pin",
          newPin: pinValue,
          pin: familyData.hasParentPin ? pinCurrent : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not set parent PIN");
        return;
      }
      setFamilyData((prev) => ({ ...prev, hasParentPin: true }));
      setPinDialog(null);
      return;
    }
    if (pinDialog.memberId) {
      await handleSetChild(pinDialog.memberId, Boolean(pinDialog.protectedChild), pinCurrent || pinValue);
      setPinDialog(null);
    }
  }

  function startGpuRental(e: React.FormEvent) {
    e.preventDefault();
    router.push("/dashboard/deployments/new");
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
                      ? "bg-accent text-foreground shadow-xs"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  <Icon
                    className={cn(
                      "h-4 w-4 shrink-0",
                      activeTab === id ? "text-primary" : "text-muted-foreground",
                    )}
                  />
                  <span>{label}</span>
                  {"enterprise" in tab && tab.enterprise && domainLocked && (
                    <Lock className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  )}
                  {activeTab === id && !("enterprise" in tab && tab.enterprise && domainLocked) && (
                    <ChevronRight className="ml-auto hidden md:block h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </button>
              </li>
            ))}

            <li className="hidden md:block my-2 border-t border-border" />

            <li className="shrink-0">
              <Link
                href="/dashboard/settings/byok"
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors",
                  "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <KeyRound className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span>Provider Keys</span>
              </Link>
            </li>
            <li className="shrink-0">
              <Link
                href="/dashboard/support"
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors",
                  "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <LifeBuoy className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span>Support</span>
              </Link>
            </li>
          </ul>
        </nav>

        {/* ── Right Content Panel ── */}
        <div className="flex-1 min-w-0">
          {loading ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-info" />
            </div>
          ) : (
            <form onSubmit={saveProfile}>
              {/* ── 1. Profile & Account ── */}
              {activeTab === "profile" && (
                <div className="card space-y-0 overflow-hidden">
                  <div className="border-b border-border px-6 py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <User className="h-4 w-4 text-primary" />
                        <h2 className="section-title">Personal Profile & Account</h2>
                      </div>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-info/10 px-3 py-1 text-xs font-mono font-medium text-info border border-info/20">
                        <Sparkles className="h-3 w-3" />
                        <span>
                          {userProfile.isSiteAdmin
                            ? "SITE ADMIN · UNLIMITED"
                            : `${settings.plan.toUpperCase().replace("_", " ")} PLAN`}
                        </span>
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Manage your profile photo, personal information, and workspace account identity.
                    </p>
                  </div>

                  <div className="divide-y divide-border px-6">
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
                                className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 transition-colors"
                              >
                                Remove
                              </button>
                            )}
                          </div>
                          <p className="text-[11px] text-muted-foreground">
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
                        <span className="inline-flex items-center gap-1 rounded-md bg-success/10 px-2.5 py-1 text-xs font-mono text-success border border-success/20">
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
                        <span className="rounded-lg bg-muted px-3 py-1.5 text-xs font-mono text-foreground border border-border">
                          Role: {userProfile.role.toUpperCase()}
                        </span>
                        {userProfile.isSiteAdmin && (
                          <span className="rounded-lg border border-info/30 bg-info/10 px-3 py-1.5 text-xs font-mono text-info">
                            Site admin · unlimited
                          </span>
                        )}
                      </div>
                    </SettingRow>

                    {/* Subscription Callout */}
                    <SettingRow label="Subscription Plan" hint="Manage your subscription tier, family pooling, and credits.">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-xl border border-info/30 bg-info/5 p-4">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-foreground">
                              {userProfile.isSiteAdmin
                                ? "Site admin (unlimited)"
                                : settings.plan === "family"
                                  ? "Family Plan (4 Seats)"
                                  : settings.plan === "family_max"
                                    ? "Family Max Plan (5 Seats)"
                                    : settings.plan === "ultra"
                                      ? "Ultra Studio Plan"
                                      : settings.plan === "pro"
                                        ? "Pro Studio Plan"
                                        : settings.plan === "enterprise"
                                          ? "Enterprise Plan"
                                          : "Starter Plan"}
                            </span>
                            <span className="rounded-full bg-info/20 px-2 py-0.5 text-[10px] font-mono text-info">
                              Active
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Pool Balance:{" "}
                            <span className="font-mono text-success font-medium">
                              ${(settings.creditsUsdCents / 100).toFixed(2)} USD
                            </span>{" "}
                            {isCurrentFamily && "(includes 4-month rolled over credits)"}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => setActiveTab("billing")}
                          className="flex items-center gap-1.5 rounded-xl bg-info px-3.5 py-1.5 text-xs font-semibold text-info-foreground shadow-md shadow-info/20 hover:bg-info/90 transition-all"
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
                <div className="space-y-6 text-zinc-900 dark:text-zinc-50">
                  {/* Unified Sub-Nav Header inside Billing */}
                  <div className="flex items-center justify-between border-b border-zinc-200 pb-3 dark:border-zinc-800">
                    <div className="flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-zinc-100 p-1 dark:border-zinc-800 dark:bg-zinc-900">
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
                            onClick={() => setBillingSubTab(sub.id as "plans" | "gpus" | "family" | "credits")}
                            className={cn(
                              "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all",
                              billingSubTab === sub.id
                                ? "bg-white text-zinc-900 shadow-sm font-semibold dark:bg-zinc-950 dark:text-zinc-50"
                                : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100",
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
                        <span className="text-[10px] text-zinc-500 font-mono block">Compute Balance</span>
                        <span className="text-sm font-bold font-mono text-zinc-900 dark:text-zinc-50">
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
                          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Subscription Plans & Tiers</h3>
                          <p className="text-xs text-zinc-500">Choose between solo creator plans and pooled family tiers.</p>
                        </div>

                        <div className="flex items-center rounded-xl border border-zinc-200 bg-zinc-100 p-1 dark:border-zinc-800 dark:bg-zinc-900">
                          {[
                            { id: "all", label: "All Plans" },
                            { id: "individual", label: "Solo Tiers" },
                            { id: "family", label: "Family Plans (Pooled)" },
                          ].map((btn) => (
                            <button
                              key={btn.id}
                              type="button"
                              onClick={() => setPlanCategoryView(btn.id as "all" | "individual" | "family")}
                              className={cn(
                                "px-3 py-1 text-xs font-medium rounded-lg transition-all",
                                planCategoryView === btn.id
                                  ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-950 dark:text-zinc-50"
                                  : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100",
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
                                "relative flex flex-col justify-between rounded-2xl border bg-white p-5 text-zinc-900 shadow-sm transition-all duration-200 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50",
                                isCurrent
                                  ? "border-zinc-900 dark:border-zinc-100"
                                  : "border-zinc-200 hover:border-zinc-400 dark:hover:border-zinc-600",
                              )}
                            >
                              {tier.badge && (
                                <span className="absolute -top-2.5 right-4 rounded-full border border-zinc-200 bg-white px-2.5 py-0.5 text-[9px] font-mono font-semibold text-zinc-600 shadow-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
                                  {tier.badge}
                                </span>
                              )}

                              <div>
                                <div className="flex items-baseline justify-between">
                                  <h4 className="text-base font-bold text-zinc-900 dark:text-zinc-50">{tier.name}</h4>
                                  <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[10px] font-mono text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                                    {tier.seatsText}
                                  </span>
                                </div>

                                <div className="mt-2 flex items-baseline gap-1">
                                  <span className="text-2xl font-bold font-mono text-zinc-900 dark:text-zinc-50">{tier.price}</span>
                                  <span className="text-xs text-zinc-500">{tier.period}</span>
                                </div>

                                <p className="mt-2 min-h-[36px] text-xs leading-relaxed text-zinc-500">
                                  {tier.description}
                                </p>

                                <ul className="mt-4 space-y-2 border-t border-zinc-200 pt-4 text-xs text-zinc-700 dark:border-zinc-800 dark:text-zinc-300">
                                  {tier.features.map((feat) => (
                                    <li key={feat} className="flex items-start gap-2">
                                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400" />
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
                                    className="w-full cursor-default rounded-xl border border-zinc-200 bg-zinc-50 py-2 text-xs font-semibold text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900"
                                  >
                                    Current Plan
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    disabled={checkoutLoading === tier.id}
                                    onClick={() => void handleUpgradePlan(tier.id)}
                                    className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-zinc-900 py-2 text-xs font-semibold text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
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
                      <div className="flex items-center justify-between p-3 rounded-2xl bg-muted border border-border">
                        <div className="flex items-center gap-2">
                          <Cpu className="h-4 w-4 text-info" />
                          <span className="text-xs font-bold text-foreground">Select Execution Mode:</span>
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
                                  ? "bg-background text-foreground font-semibold shadow-sm"
                                  : "text-muted-foreground hover:text-foreground",
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
                                  ? "border-info bg-info/10 ring-1 ring-info"
                                  : "border-border bg-card hover:border-info/40",
                              )}
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-bold font-mono text-foreground">{tier.name}</span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setInspectModalTier(tier);
                                  }}
                                  className="text-muted-foreground hover:text-foreground"
                                >
                                  <Info className="h-3.5 w-3.5 text-info" />
                                </button>
                              </div>

                              <div className="mt-1">
                                <span className="inline-block rounded bg-muted px-1 py-0.5 text-[9px] font-mono text-info">
                                  {tier.classEquivalent}
                                </span>
                                <p className="text-[10px] text-success font-mono font-semibold mt-0.5">{tier.vram}</p>
                                <div className="mt-1 flex items-baseline gap-1">
                                  <span className="text-base font-bold font-mono text-success">${currentHourly.toFixed(2)}</span>
                                  <span className="text-[10px] text-muted-foreground font-mono">/ hr</span>
                                </div>
                              </div>

                              <div className="mt-2 border-t border-border pt-1.5 flex justify-between text-[9px] font-mono text-muted-foreground">
                                <span>Slots:</span>
                                <span className="text-muted-foreground">Estimator</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Lease Form */}
                      <div className="card p-4 border-info/30 bg-info/5 flex flex-col md:flex-row items-center justify-between gap-4">
                        <div className="flex-1 space-y-2 w-full">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-foreground font-medium flex items-center gap-1.5">
                              <Clock className="h-3.5 w-3.5 text-info" />
                              Duration: <span className="font-mono text-info font-bold">{durationHours} Hours</span>
                            </span>
                            <span className="text-[10px] font-mono text-muted-foreground">{activeModeConfig.availabilityNote}</span>
                          </div>
                          <input
                            type="range"
                            min={7}
                            max={24}
                            step={1}
                            value={durationHours}
                            onChange={(e) => setDurationHours(Number(e.target.value))}
                            className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-[hsl(var(--info))]"
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
                            <span className="text-[10px] text-muted-foreground block font-mono">Total ({durationHours}h)</span>
                            <div className="flex items-baseline gap-1.5">
                              <span className="text-lg font-bold font-mono text-success">${totalGpuCost} USD</span>
                              {executionMode !== "on-demand" && Number(gpuSavings) > 0 && (
                                <span className="text-[10px] text-success font-mono">(-${gpuSavings})</span>
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
                            <span>Provision on Deployments</span>
                          </button>
                        </div>
                      </div>

                      {/* Active GPU Nodes if any */}
                      {rentals.length === 0 ? (
                        <div className="card p-4 text-sm text-muted-foreground">
                          No deployments on this workspace. Provision one from Deployments — this list is live, not a sample.
                        </div>
                      ) : (
                        <div className="card p-4 space-y-2">
                          <span className="text-xs font-semibold text-foreground block">Active GPU Leases ({rentals.length})</span>
                          <div className="space-y-2">
                            {rentals.map((r) => (
                              <div key={r.id} className="flex items-center justify-between p-2.5 rounded-xl bg-muted border border-border text-xs">
                                <div>
                                  <p className="font-semibold text-foreground">{r.gpuTierName || r.model}</p>
                                  <p className="text-[10px] text-muted-foreground font-mono">
                                    {r.sku} · {r.deployment?.target || "gcp"}
                                  </p>
                                </div>
                                <span className="rounded-full bg-muted px-2 py-0.5 text-[9px] font-mono text-foreground">
                                  {r.status}
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
                      <div className="card p-6 border-info/30 bg-gradient-to-br from-info/10 via-info/5 to-transparent">
                        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 pb-5 border-b border-border">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="rounded-full bg-info/15 px-2.5 py-0.5 text-[10px] font-mono font-bold text-info border border-info/25">
                                SHARED FAMILY CREDIT POOL
                              </span>
                              <span className="rounded-full bg-success/15 px-2.5 py-0.5 text-[10px] font-mono font-bold text-success border border-success/25 flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                <span>4-MONTH ROLLOVER VAULT</span>
                              </span>
                            </div>

                            <h2 className="mt-2 text-2xl font-bold text-foreground tracking-tight">
                              {familyData.planName || getPlan(settings.plan).name}
                            </h2>
                            <p className="mt-1 text-xs text-muted-foreground max-w-xl">
                              All family members share this centralized credit pool with private individual libraries, anti-abuse quotas, and automatic 4-month rollover.
                            </p>
                          </div>

                          <div className="flex items-center gap-6 bg-card p-3.5 rounded-2xl border border-border">
                            <div>
                              <span className="text-[10px] text-muted-foreground font-mono block">Total Spendable Pool</span>
                              <span className="text-2xl font-bold font-mono text-success">
                                ${(settings.creditsUsdCents / 100).toFixed(2)}
                              </span>
                            </div>

                            <div className="border-l border-border pl-6">
                              <span className="text-[10px] text-muted-foreground font-mono block">Rolled Over (Up to 4 mo)</span>
                              <span className="text-lg font-bold font-mono text-info">
                                ${(familyData.rolledOverCreditsCents / 100).toFixed(2)}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* 4-Month Rollover Progress Timeline */}
                        <div className="pt-4 space-y-2">
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <div className="flex items-center gap-1.5 font-medium text-foreground">
                              <Calendar className="h-3.5 w-3.5 text-info" />
                              <span>Credit Rollover Vault Activity (Up to 4 Consecutive Months)</span>
                            </div>
                            <span className="text-[11px] font-mono text-muted-foreground">
                              Unused credits roll over automatically
                            </span>
                          </div>

                          <div className="rounded-xl border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                            {familyData.rolledOverCreditsCents > 0
                              ? `${(familyData.rolledOverCreditsCents / 100).toFixed(2)} USD remaining from earlier stipend grants.`
                              : "No rolled-over stipend this month. Unused included credit appears here after a grant month closes."}
                          </div>
                        </div>
                      </div>

                      {/* Family Members Controls */}
                      <div className="card p-5 space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <Users className="h-4 w-4 text-info" />
                              <h3 className="text-sm font-semibold text-foreground">Family Members & Seat Controls</h3>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {familyData.members.length} of {settings.plan === "family_max" ? 5 : 4} seats filled. Manage per-seat monthly spending caps and child protection.
                            </p>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => void handleSetParentPin()}
                              className="rounded-xl border border-border bg-muted px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-accent"
                            >
                              {familyData.hasParentPin ? "Change parent PIN" : "Set parent PIN"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setShowInviteModal(true)}
                              disabled={familyData.members.length >= (settings.plan === "family_max" ? 5 : 4)}
                              className="flex items-center gap-1.5 rounded-xl bg-info px-3 py-1.5 text-xs font-semibold text-info-foreground hover:bg-info/90 transition-colors disabled:opacity-40"
                            >
                              <Plus className="h-3.5 w-3.5" />
                              <span>Invite Family Member</span>
                            </button>
                          </div>
                        </div>

                        <div className="divide-y divide-border border-t border-b border-border">
                          {familyData.members.map((member) => (
                            <div key={member.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 py-3">
                              <div className="flex items-center gap-3">
                                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-info text-info-foreground font-mono font-bold text-xs">
                                  {member.name.slice(0, 2).toUpperCase()}
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-semibold text-foreground">{member.name}</span>
                                    {member.role === "organizer" && (
                                      <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[9px] font-mono text-warning border border-warning/25">
                                        ORGANIZER
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-[11px] text-muted-foreground font-mono">{member.email}</span>
                                </div>
                              </div>

                              <div className="flex items-center gap-4">
                                <div className="text-right">
                                  <span className="text-[10px] text-muted-foreground block font-mono">Monthly Fair-Use Cap</span>
                                  <span className="text-xs font-mono font-medium text-success">
                                    {member.monthlyQuotaCents ? `$${member.monthlyQuotaCents / 100} / mo limit` : "Uncapped (Full Pool)"}
                                  </span>
                                </div>

                                {member.role !== "organizer" && (
                                  <label className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground">
                                    <input
                                      type="checkbox"
                                      checked={Boolean(member.protectedChild)}
                                      onChange={(e) => void handleSetChild(member.id, e.target.checked)}
                                      className="rounded border-border"
                                    />
                                    Child / Protected
                                  </label>
                                )}

                                {member.role !== "organizer" && (
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveMember(member.id)}
                                    className="text-muted-foreground hover:text-destructive p-1.5 rounded-lg hover:bg-accent transition-colors"
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
                      <div className="card p-6 border-info/30 bg-info/5">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                          <div>
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-info font-mono">
                              Available Compute Credits
                            </span>
                            <div className="text-3xl font-bold font-mono text-success mt-1">
                              ${(settings.creditsUsdCents / 100).toFixed(2)} USD
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
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
                                className="rounded-xl border border-border bg-muted px-3.5 py-2 text-xs font-mono font-bold text-foreground hover:bg-accent transition-colors"
                              >
                                {topupLoading === cents ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : `+$${cents / 100}`}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="card p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted border border-border">
                            <CreditCard className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-foreground">Payment Methods & Invoices</p>
                            <p className="text-[11px] text-muted-foreground">Update payment cards and download past tax receipts via Stripe.</p>
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
                  <div className="border-b border-border px-6 py-4">
                    <div className="flex items-center gap-2.5">
                      <Shield className="h-4 w-4 text-primary" />
                      <h2 className="section-title">Single Sign-On & Authentication</h2>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Allow your team to authenticate via Okta, Azure AD, Google Workspace, and SAML through WorkOS.
                    </p>
                  </div>

                  <div className="divide-y divide-border px-6">
                    <SettingRow label="Enable SSO" hint="Team members will be redirected to your identity provider.">
                      <label className="flex cursor-pointer items-center gap-3">
                        <input
                          type="checkbox"
                          checked={settings.ssoEnabled || false}
                          onChange={(e) => setSettings({ ...settings, ssoEnabled: e.target.checked })}
                          className="h-4 w-4 rounded accent-[hsl(var(--info))]"
                        />
                        <span className="text-sm text-muted-foreground">
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
                    <div className="border-b border-border px-6 py-4">
                      <div className="flex items-center gap-2.5">
                        <Globe className="h-4 w-4 text-primary" />
                        <h2 className="section-title">Custom Domain</h2>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Configure a custom branded domain for your OpenDoor dashboard and API gateway.
                      </p>
                    </div>

                    <div className="divide-y divide-border px-6">
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
                  <div className="border-b border-border px-6 py-4">
                    <div className="flex items-center gap-2.5">
                      <Mail className="h-4 w-4 text-primary" />
                      <h2 className="section-title">Email Notifications</h2>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Control which notification alerts you receive.
                    </p>
                  </div>

                  <div className="divide-y divide-border px-6">
                    <SettingRow label="Master Notifications" hint="Toggle all email notifications on or off.">
                      <label className="flex cursor-pointer items-center gap-3">
                        <input
                          type="checkbox"
                          checked={settings.emailNotificationsEnabled || false}
                          onChange={(e) => setSettings({ ...settings, emailNotificationsEnabled: e.target.checked })}
                          className="h-4 w-4 rounded accent-[hsl(var(--info))]"
                        />
                        <span className="text-sm text-muted-foreground">
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
                          className="h-4 w-4 rounded accent-[hsl(var(--info))] disabled:opacity-40"
                        />
                        <span className={cn("text-sm", settings.emailNotificationsEnabled ? "text-muted-foreground" : "text-muted-foreground/50")}>
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
                    <span className="text-xs text-success font-medium">Changes saved successfully.</span>
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
            className="absolute inset-0 bg-foreground/40 backdrop-blur-md"
            onClick={() => setInspectModalTier(null)}
          />

          <div className="relative z-10 w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-info/15 text-info border border-info/25">
                  <Cpu className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-foreground">{inspectModalTier.name}</h3>
                    <span className="rounded-md bg-info/15 px-2 py-0.5 text-[10px] font-mono font-bold text-info">
                      {inspectModalTier.classEquivalent}
                    </span>
                  </div>
                  <p className="text-xs text-success font-mono font-semibold">{inspectModalTier.vram}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setInspectModalTier(null)}
                className="rounded-full p-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground font-mono">
                Compute & Memory Specifications
              </h4>
              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <div className="rounded-xl bg-muted p-2.5 border border-border">
                  <span className="text-muted-foreground text-[10px] block">Dedicated VRAM</span>
                  <span className="text-success font-bold">{inspectModalTier.vram}</span>
                </div>
                <div className="rounded-xl bg-muted p-2.5 border border-border">
                  <span className="text-muted-foreground text-[10px] block">Core Compute Speed</span>
                  <span className="text-foreground font-bold">{inspectModalTier.coreSpeed}</span>
                </div>
                <div className="rounded-xl bg-muted p-2.5 border border-border">
                  <span className="text-muted-foreground text-[10px] block">Memory Bandwidth</span>
                  <span className="text-foreground font-bold">{inspectModalTier.bandwidth}</span>
                </div>
                <div className="rounded-xl bg-muted p-2.5 border border-border">
                  <span className="text-muted-foreground text-[10px] block">Platform Advantage</span>
                  <span className="text-success font-sans text-[11px]">{inspectModalTier.marketComparison}</span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground font-mono flex items-center gap-1.5">
                <Gauge className="h-3.5 w-3.5 text-info" />
                <span>Live Inference Benchmarks</span>
              </h4>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-xl bg-info/10 border border-info/20 p-2">
                  <span className="text-[10px] text-muted-foreground block">Flux.1 Dev</span>
                  <span className="font-mono text-info font-bold mt-0.5 block">{inspectModalTier.benchmarks.fluxDev}</span>
                </div>
                <div className="rounded-xl bg-info/10 border border-info/20 p-2">
                  <span className="text-[10px] text-muted-foreground block">Google Imagen 3</span>
                  <span className="font-mono text-info font-bold mt-0.5 block">{inspectModalTier.benchmarks.imagen3}</span>
                </div>
                <div className="rounded-xl bg-info/10 border border-info/20 p-2">
                  <span className="text-[10px] text-muted-foreground block">Veo 2 Video</span>
                  <span className="font-mono text-info font-bold mt-0.5 block">{inspectModalTier.benchmarks.veoVideo}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
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
          <div className="absolute inset-0 bg-foreground/40 backdrop-blur-md" onClick={() => setShowInviteModal(false)} />

          <div className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-info" />
                <h3 className="text-base font-bold text-foreground">Invite Family Member</h3>
              </div>
            </div>

            <form onSubmit={handleInviteMember} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Family Member Email</label>
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
                <label className="block text-xs font-medium text-foreground mb-1">Name (Optional)</label>
                <input
                  type="text"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  placeholder="e.g. Alex"
                  className="input w-full text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Monthly Fair-Use Cap (USD)
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono text-muted-foreground">$</span>
                  <input
                    type="number"
                    min="1"
                    max="200"
                    value={inviteQuotaUsd}
                    onChange={(e) => setInviteQuotaUsd(e.target.value)}
                    className="input w-32 font-mono text-sm"
                  />
                  <span className="text-xs text-muted-foreground font-mono">USD / month cap</span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
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

      {pinDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-background/80"
            aria-label="Close PIN dialog"
            onClick={() => setPinDialog(null)}
          />
          <form
            onSubmit={submitPinDialog}
            className="relative z-10 w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-xl"
          >
            <h3 className="text-base font-semibold text-foreground">
              {pinDialog.mode === "set" ? "Parent PIN" : "Confirm parent PIN"}
            </h3>
            {pinDialog.mode === "set" && familyData.hasParentPin && (
              <div className="mt-4">
                <label className="mb-1 block text-xs text-muted-foreground">Current PIN</label>
                <input
                  type="password"
                  inputMode="numeric"
                  value={pinCurrent}
                  onChange={(e) => setPinCurrent(e.target.value)}
                  className="input w-full"
                />
              </div>
            )}
            <div className="mt-4">
              <label className="mb-1 block text-xs text-muted-foreground">
                {pinDialog.mode === "set" ? "New 4–8 digit PIN" : "Parent PIN"}
              </label>
              <input
                type="password"
                inputMode="numeric"
                value={pinDialog.mode === "set" ? pinValue : pinCurrent}
                onChange={(e) =>
                  pinDialog.mode === "set" ? setPinValue(e.target.value) : setPinCurrent(e.target.value)
                }
                className="input w-full"
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setPinDialog(null)}>
                Cancel
              </button>
              <button type="submit" className="btn-primary">
                Save
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
