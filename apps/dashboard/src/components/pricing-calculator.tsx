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
        if (data.rules.length > 0) {
          setSelectedModel(data.rules[0].modelId);
        }
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
    const markupAmount = monthlyTotal - baseMonthlyTotal;

    return {
      daily: dailyTotal,
      monthly: monthlyTotal,
      baseMonthly: baseMonthlyTotal,
      markup: markupAmount,
      inputCost: dailyInputCost,
      outputCost: dailyOutputCost,
    };
  }, [selectedRule, requestsPerDay, inputTokens, outputTokens]);

  if (loading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <p className="text-gray-500">Loading pricing data...</p>
      </div>
    );
  }

  if (rules.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <p className="text-gray-500">No pricing data available.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <h2 className="text-lg font-semibold text-gray-900">Pricing Calculator</h2>
      <p className="mt-1 text-sm text-gray-600">
        Estimate your monthly LLM costs
      </p>

      <div className="mt-4 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Model</label>
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            {rules.map((rule) => (
              <option key={rule.id} value={rule.modelId}>
                {rule.modelId} ({rule.providerName})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Requests per day: {requestsPerDay.toLocaleString()}
          </label>
          <input
            type="range"
            min={10}
            max={100000}
            step={10}
            value={requestsPerDay}
            onChange={(e) => setRequestsPerDay(Number(e.target.value))}
            className="mt-1 w-full"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Avg input tokens: {inputTokens.toLocaleString()}
            </label>
            <input
              type="range"
              min={10}
              max={8000}
              step={10}
              value={inputTokens}
              onChange={(e) => setInputTokens(Number(e.target.value))}
              className="mt-1 w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Avg output tokens: {outputTokens.toLocaleString()}
            </label>
            <input
              type="range"
              min={10}
              max={4000}
              step={10}
              value={outputTokens}
              onChange={(e) => setOutputTokens(Number(e.target.value))}
              className="mt-1 w-full"
            />
          </div>
        </div>
      </div>

      {estimate && (
        <div className="mt-6 space-y-3">
          <div className="rounded-lg bg-primary-50 p-4">
            <p className="text-sm text-gray-600">Estimated monthly cost</p>
            <p className="mt-1 text-3xl font-bold text-primary-700">
              {formatCurrency(estimate.monthly)}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-md border border-gray-100 bg-gray-50 p-3">
              <p className="text-gray-500">Base provider cost</p>
              <p className="mt-1 font-semibold text-gray-900">
                {formatCurrency(estimate.baseMonthly)}
              </p>
            </div>
            <div className="rounded-md border border-gray-100 bg-gray-50 p-3">
              <p className="text-gray-500">OpenDoor markup</p>
              <p className="mt-1 font-semibold text-gray-900">
                {formatCurrency(estimate.markup)}
              </p>
            </div>
            <div className="rounded-md border border-gray-100 bg-gray-50 p-3">
              <p className="text-gray-500">Daily cost</p>
              <p className="mt-1 font-semibold text-gray-900">
                {formatCurrency(estimate.daily)}
              </p>
            </div>
            <div className="rounded-md border border-gray-100 bg-gray-50 p-3">
              <p className="text-gray-500">Per-request cost</p>
              <p className="mt-1 font-semibold text-gray-900">
                {formatCurrency(estimate.daily / requestsPerDay)}
              </p>
            </div>
          </div>

          <div className="text-xs text-gray-500">
            Rates: ${parseFloat(selectedRule!.finalInputCostPer1K).toFixed(6)}/1K input tokens, ${parseFloat(selectedRule!.finalOutputCostPer1K).toFixed(6)}/1K output tokens
          </div>
        </div>
      )}
    </div>
  );
}
