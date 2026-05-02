import PricingCalculator from "@/components/pricing-calculator";

export default function PricingPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Pricing Calculator</h1>
      <p className="mt-1 text-gray-600">
        Estimate costs for different models and usage patterns
      </p>

      <div className="mt-6 max-w-2xl">
        <PricingCalculator />
      </div>
    </div>
  );
}
