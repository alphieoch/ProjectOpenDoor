import PricingCalculator from "@/components/pricing-calculator";

export default function PricingPage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="page-title">Pricing Calculator</h1>
        <p className="page-desc">Estimate costs for different models and usage patterns</p>
      </div>
      <div className="max-w-2xl">
        <PricingCalculator />
      </div>
    </div>
  );
}
