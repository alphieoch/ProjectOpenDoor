"use client";

import { useState, useEffect, useMemo } from "react";
import { formatCurrency } from "@/lib/utils";

interface PricingRule {
  id: string;
  modelId: string;
  providerName: string;
  inputCostPer1K: string;
  outputCostPer1K: string;
  markupPercent: string;
  finalInputCostPer1K: string;
  finalOutputCostPer1K: string;
}

export default function PricingCalculator() {
  const [rules, setRules] = useState<PricingRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedModel, setSelectedModel] = useState("");
  const [requestsPerDay, setRequestsPerDay] = useState(1000);
  const [inputTokens, setInputTokens] = useState(500);
  const [outputTokens, setOutputTokens] = useState(250);

  useEffect(() => {
    async function fetchPricing() {
      const res = await fetch("/api/pricing");
      if (res.ok) {
        const data = await res.json();
        setRules(data.rules);
        if (data.rules.length > 0) setSelectedModel(data.rules[0].modelId);
      }
      setLoading(false);
    }
    fetchPricing();
  }, []);

  const selectedRule = useMemo(
    () => rules.find((r) => r.modelId === selectedModel),
    [rules, selectedModel]
  );

  const estimate = useMemo(() => {
    if (!selectedRule) return null;

    const inputCostPer1K = parseFloat(selectedRule.finalInputCostPer1K);
    const outputCostPer1K = parseFloat(selectedRule.finalOutputCostPer1K);
    const baseInputCost = parseFloat(selectedRule.inputCostPer1K);
    const baseOutputCost = parseFloat(selectedRule.outputCostPer1K);

    const dailyInputCost = (inputTokens / 1000) * inputCostPer1K * requestsPerDay;
    const dailyOutputCost = (outputTokens / 1000) * outputCostPer1K * requestsPerDay;
    const dailyTotal = dailyInputCost + dailyOutputCost;
    const monthlyTotal = dailyTotal * 30;

    const baseDailyInput = (inputTokens / 1000) * baseInputCost * requestsPerDay;
    const baseDailyOutput = (outputTokens / 1000) * baseOutputCost * requestsPerDay;
    const baseMonthlyTotal = (baseDailyInput + baseDailyOutput) * 30;

    return {
      daily: dailyTotal,
      monthly: monthlyTotal,
      baseMonthly: baseMonthlyTotal,
      markup: monthlyTotal - baseMonthlyTotal,
    };
  }, [selectedRule, requestsPerDay, inputTokens, outputTokens]);

  if (loading) {
    return (
      <div className="card p-6">
        <p className="text-sm text-zinc-400">Loading pricing data…</p>
      </div>
    );
  }

  if (rules.length === 0) {
    return (
      <div className="card p-6">
        <p className="text-sm text-zinc-400">No pricing data available.</p>
      </div>
    );
  }

  return (
    <div className="card p-6">
      <h2 className="section-title">Pricing Calculator</h2>
      <p className="mt-1 text-sm text-zinc-500">Estimate your monthly LLM costs</p>

      <div className="mt-5 space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-zinc-700">Model</label>
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="input"
          >
            {rules.map((rule) => (
              <option key={rule.id} value={rule.modelId}>
                {rule.modelId} ({rule.providerName})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-zinc-700">
            Requests per day: <span className="font-semibold">{requestsPerDay.toLocaleString()}</span>
          </label>
          <input
            type="range"
            min={10}
            max={100000}
            step={10}
            value={requestsPerDay}
            onChange={(e) => setRequestsPerDay(Number(e.target.value))}
            className="w-full accent-zinc-900"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-700">
              Avg input tokens: <span className="font-semibold">{inputTokens.toLocaleString()}</span>
            </label>
            <input
              type="range"
              min={10}
              max={8000}
              step={10}
              value={inputTokens}
              onChange={(e) => setInputTokens(Number(e.target.value))}
              className="w-full accent-zinc-900"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-700">
              Avg output tokens: <span className="font-semibold">{outputTokens.toLocaleString()}</span>
            </label>
            <input
              type="range"
              min={10}
              max={4000}
              step={10}
              value={outputTokens}
              onChange={(e) => setOutputTokens(Number(e.target.value))}
              className="w-full accent-zinc-900"
            />
          </div>
        </div>
      </div>

      {estimate && (
        <div className="mt-6 space-y-3">
          <div className="rounded-xl bg-zinc-950 p-5 text-center">
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">Monthly estimate</p>
            <p className="mt-1.5 text-3xl font-semibold text-white">{formatCurrency(estimate.monthly)}</p>
          </div>

          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-lg border border-zinc-100 bg-zinc-50 p-3">
              <p className="text-xs text-zinc-500">Base provider cost</p>
              <p className="mt-1 font-semibold text-zinc-900">{formatCurrency(estimate.baseMonthly)}</p>
            </div>
            <div className="rounded-lg border border-zinc-100 bg-zinc-50 p-3">
              <p className="text-xs text-zinc-500">OpenDoor markup</p>
              <p className="mt-1 font-semibold text-zinc-900">{formatCurrency(estimate.markup)}</p>
            </div>
            <div className="rounded-lg border border-zinc-100 bg-zinc-50 p-3">
              <p className="text-xs text-zinc-500">Daily cost</p>
              <p className="mt-1 font-semibold text-zinc-900">{formatCurrency(estimate.daily)}</p>
            </div>
            <div className="rounded-lg border border-zinc-100 bg-zinc-50 p-3">
              <p className="text-xs text-zinc-500">Per-request cost</p>
              <p className="mt-1 font-semibold text-zinc-900">{formatCurrency(estimate.daily / requestsPerDay)}</p>
            </div>
          </div>

          <p className="text-xs text-zinc-400">
            Rates: ${parseFloat(selectedRule!.finalInputCostPer1K).toFixed(6)}/1K input · ${parseFloat(selectedRule!.finalOutputCostPer1K).toFixed(6)}/1K output
          </p>
        </div>
      )}
    </div>
  );
}
