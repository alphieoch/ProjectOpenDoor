import { db } from "@opendoor/database";
import {
  modelGovernance,
  complianceControls,
  sectorTemplates,
  modelEvaluations,
  modelComplianceMappings,
} from "@opendoor/database";
import { eq } from "drizzle-orm";

async function seed() {
  console.log("🌱 Seeding enterprise governance data...");

  // ── Compliance Controls ────────────────────────────────────────────────────
  const controls = [
    // GDPR
    { framework: "gdpr" as const, controlCode: "GDPR-1", controlName: "Lawful Basis for Processing", description: "Ensure AI processing has a lawful basis under GDPR Article 6.", requirementLevel: "required", guidance: "Document consent or legitimate interest assessment." },
    { framework: "gdpr" as const, controlCode: "GDPR-2", controlName: "Data Minimisation", description: "Only process personal data necessary for the specific purpose.", requirementLevel: "required", guidance: "Review training data and prompts for unnecessary PII." },
    { framework: "gdpr" as const, controlCode: "GDPR-3", controlName: "Right to Explanation", description: "Users can obtain meaningful information about logic involved.", requirementLevel: "required", guidance: "Provide model cards and decision rationale documentation." },
    { framework: "gdpr" as const, controlCode: "GDPR-4", controlName: "Data Subject Rights", description: "Support access, rectification, erasure, and portability.", requirementLevel: "required", guidance: "Implement data retention and deletion workflows." },
    { framework: "gdpr" as const, controlCode: "GDPR-5", controlName: "Data Protection Impact Assessment", description: "DPIA required for high-risk AI processing.", requirementLevel: "required", guidance: "Complete DPIA before production deployment." },
    // EU AI Act
    { framework: "eu_ai_act" as const, controlCode: "AIACT-1", controlName: "Risk Classification", description: "Classify AI system risk level per EU AI Act.", requirementLevel: "required", guidance: "Map to limited risk, high risk, or unacceptable risk." },
    { framework: "eu_ai_act" as const, controlCode: "AIACT-2", controlName: "Transparency Obligations", description: "Notify users they are interacting with AI.", requirementLevel: "required", guidance: "Add disclosure in UI and API responses." },
    { framework: "eu_ai_act" as const, controlCode: "AIACT-3", controlName: "Human Oversight", description: "Enable effective oversight by natural persons.", requirementLevel: "required", guidance: "Implement human-in-the-loop for high-risk decisions." },
    { framework: "eu_ai_act" as const, controlCode: "AIACT-4", controlName: "Accuracy, Robustness, Cybersecurity", description: "Ensure appropriate levels for intended purpose.", requirementLevel: "required", guidance: "Run red-team evaluations and penetration tests." },
    { framework: "eu_ai_act" as const, controlCode: "AIACT-5", controlName: "Record-Keeping", description: "Maintain logs of operation for traceability.", requirementLevel: "required", guidance: "Retain request logs for minimum 6 years." },
    // ICO UK
    { framework: "ico_uk" as const, controlCode: "ICO-1", controlName: "AI Auditing Framework", description: "Follow ICO guidance on auditing AI systems.", requirementLevel: "recommended", guidance: "Use ICO's AI auditing framework checklist." },
    { framework: "ico_uk" as const, controlCode: "ICO-2", controlName: "Fairness by Design", description: "Assess and mitigate bias in AI decisions.", requirementLevel: "required", guidance: "Conduct bias audits and document mitigation." },
    { framework: "ico_uk" as const, controlCode: "ICO-3", controlName: "Data Residency", description: "UK personal data should remain in UK/EU.", requirementLevel: "required", guidance: "Ensure models and data processed in UK/EU regions." },
    // NIST AI RMF
    { framework: "nist_ai_rmf" as const, controlCode: "NIST-1", controlName: "Govern", description: "Establish AI risk management policies.", requirementLevel: "required", guidance: "Define roles, responsibilities, and risk appetite." },
    { framework: "nist_ai_rmf" as const, controlCode: "NIST-2", controlName: "Map", description: "Identify context and risks for AI systems.", requirementLevel: "required", guidance: "Inventory all models, data sources, and use cases." },
    { framework: "nist_ai_rmf" as const, controlCode: "NIST-3", controlName: "Measure", description: "Quantify and evaluate AI risks.", requirementLevel: "required", guidance: "Use quantitative metrics for bias, safety, and security." },
    { framework: "nist_ai_rmf" as const, controlCode: "NIST-4", controlName: "Manage", description: "Prioritize and act on identified risks.", requirementLevel: "required", guidance: "Implement controls and monitor effectiveness." },
  ];

  for (const control of controls) {
    const existing = await db.select().from(complianceControls).where(eq(complianceControls.controlCode, control.controlCode)).limit(1);
    if (existing.length === 0) {
      await db.insert(complianceControls).values(control);
      console.log(`  ✓ Control ${control.controlCode} seeded`);
    }
  }

  // ── Sector Templates ───────────────────────────────────────────────────────
  const templates = [
    {
      sector: "legal" as const,
      name: "Legal Services AI Pack",
      description: "Pre-approved models, guardrails, and compliance config for UK law firms.",
      defaultModels: ["gpt-4o", "claude-3-5-sonnet-20241022", "mistral-large-latest"],
      defaultPolicies: {
        dataClass: "confidential",
        requireHumanApproval: true,
        bannedUses: ["unauthorized legal advice", "client data training"],
      },
      promptTemplates: {
        contractReview: "Review the following contract for risks. Do not provide legal advice.",
        redaction: "Redact all PII and client-identifying information.",
      },
      guardrailConfig: {
        piiDetection: "block",
        promptInjection: "block",
        requireDisclosure: true,
      },
      complianceRequirements: ["GDPR-1", "GDPR-2", "GDPR-3", "GDPR-4", "GDPR-5", "ICO-1", "ICO-2", "ICO-3"],
    },
    {
      sector: "finance" as const,
      name: "Financial Services AI Pack",
      description: "Governance templates for banks, insurers, and fintechs.",
      defaultModels: ["gpt-4o", "azure-foundry-phi-4"],
      defaultPolicies: {
        dataClass: "restricted",
        requireHumanApproval: true,
        bannedUses: ["investment advice without disclaimer", "credit scoring without oversight"],
      },
      promptTemplates: {
        fraudDetection: "Flag suspicious patterns. Escalate to human analyst.",
        reportSummary: "Summarise the following financial report. Add disclaimer.",
      },
      guardrailConfig: {
        piiDetection: "block",
        secretScanning: "block",
        requireDisclosure: true,
      },
      complianceRequirements: ["GDPR-1", "GDPR-2", "GDPR-4", "GDPR-5", "AIACT-1", "AIACT-3", "AIACT-4", "AIACT-5", "ICO-2", "ICO-3"],
    },
    {
      sector: "property" as const,
      name: "Property & Real Estate AI Pack",
      description: "AI governance for estate agencies, property managers, and surveyors.",
      defaultModels: ["gpt-4o-mini", "mistral-small-latest"],
      defaultPolicies: {
        dataClass: "internal",
        requireHumanApproval: false,
        bannedUses: ["valuation without surveyor review", "tenant screening discrimination"],
      },
      promptTemplates: {
        listingDescription: "Generate a property description from the following facts.",
        tenantQuery: "Answer the tenant query based on the tenancy agreement.",
      },
      guardrailConfig: {
        piiDetection: "redact",
        biasDetection: "flag",
        requireDisclosure: true,
      },
      complianceRequirements: ["GDPR-1", "GDPR-2", "GDPR-4", "ICO-2", "ICO-3"],
    },
  ];

  for (const template of templates) {
    const existing = await db.select().from(sectorTemplates).where(eq(sectorTemplates.name, template.name)).limit(1);
    if (existing.length === 0) {
      await db.insert(sectorTemplates).values(template);
      console.log(`  ✓ Template ${template.name} seeded`);
    }
  }

  // ── Model Governance Registry ──────────────────────────────────────────────
  const governanceModels = [
    {
      modelId: "gpt-4o",
      displayName: "GPT-4o",
      description: "OpenAI flagship multimodal model. Strong general reasoning and code.",
      riskLevel: "medium" as const,
      businessLabels: ["general purpose", "code assistant", "multimodal"],
      allowedUseCases: ["internal copilots", "code review", "document drafting", "customer support triage"],
      bannedUseCases: ["medical diagnosis", "legal advice without disclaimer", "credit scoring without oversight"],
      dataClassesAllowed: ["public", "internal", "confidential"],
      licenseType: "Proprietary (OpenAI)",
      provenanceVerified: true,
      biasReviewed: true,
      safetyReviewed: true,
      contextWindow: 128000,
      parameterScale: "unknown",
      reasoningModes: ["chain-of-thought"],
      costTier: "premium",
      sectorTags: ["general", "legal", "finance", "property"],
      approvalStatus: "approved" as const,
    },
    {
      modelId: "claude-3-5-sonnet-20241022",
      displayName: "Claude 3.5 Sonnet",
      description: "Anthropic's balanced model with strong safety features and long context.",
      riskLevel: "medium" as const,
      businessLabels: ["general purpose", "long context", "safety-first"],
      allowedUseCases: ["internal copilots", "document analysis", "research synthesis"],
      bannedUseCases: ["medical diagnosis", "autonomous decision-making"],
      dataClassesAllowed: ["public", "internal", "confidential"],
      licenseType: "Proprietary (Anthropic)",
      provenanceVerified: true,
      biasReviewed: true,
      safetyReviewed: true,
      contextWindow: 200000,
      parameterScale: "unknown",
      reasoningModes: ["chain-of-thought"],
      costTier: "premium",
      sectorTags: ["general", "legal", "finance"],
      approvalStatus: "approved" as const,
    },
    {
      modelId: "deepseek-chat",
      displayName: "DeepSeek-V3",
      description: "Open-weight model with strong reasoning capabilities. China-based provider.",
      riskLevel: "high" as const,
      businessLabels: ["open-weight", "reasoning", "cost-efficient"],
      allowedUseCases: ["internal experimentation", "non-sensitive code generation"],
      bannedUseCases: ["customer PII processing", "regulated decision-making", "UK government data"],
      dataClassesAllowed: ["public", "internal"],
      licenseType: "MIT",
      provenanceVerified: true,
      biasReviewed: false,
      safetyReviewed: false,
      contextWindow: 64000,
      parameterScale: "671B",
      reasoningModes: ["chain-of-thought", "multi-step"],
      costTier: "standard",
      sectorTags: ["general"],
      approvalStatus: "pending" as const,
    },
    {
      modelId: "mistral-large-latest",
      displayName: "Mistral Large",
      description: "European open-weight model. Good data sovereignty option for EU businesses.",
      riskLevel: "low" as const,
      businessLabels: ["EU-based", "open-weight", "data sovereignty"],
      allowedUseCases: ["internal copilots", "document drafting", "customer email drafting"],
      bannedUseCases: ["medical diagnosis", "autonomous financial advice"],
      dataClassesAllowed: ["public", "internal", "confidential"],
      licenseType: "Apache-2.0",
      provenanceVerified: true,
      biasReviewed: true,
      safetyReviewed: true,
      contextWindow: 128000,
      parameterScale: "unknown",
      reasoningModes: ["chain-of-thought"],
      costTier: "standard",
      sectorTags: ["general", "legal", "finance", "property"],
      approvalStatus: "approved" as const,
    },
    {
      modelId: "gemini-1.5-pro",
      displayName: "Gemini 1.5 Pro",
      description: "Google model with very long context window and multimodal support.",
      riskLevel: "medium" as const,
      businessLabels: ["long context", "multimodal", "video understanding"],
      allowedUseCases: ["document analysis", "media content review", "research synthesis"],
      bannedUseCases: ["medical imaging diagnosis", "facial recognition"],
      dataClassesAllowed: ["public", "internal"],
      licenseType: "Proprietary (Google)",
      provenanceVerified: true,
      biasReviewed: true,
      safetyReviewed: true,
      contextWindow: 2000000,
      parameterScale: "unknown",
      reasoningModes: ["chain-of-thought"],
      costTier: "premium",
      sectorTags: ["general"],
      approvalStatus: "approved" as const,
    },
  ];

  for (const model of governanceModels) {
    const existing = await db.select().from(modelGovernance).where(eq(modelGovernance.modelId, model.modelId)).limit(1);
    if (existing.length === 0) {
      const [inserted] = await db.insert(modelGovernance).values(model).returning();
      console.log(`  ✓ Governance model ${model.modelId} seeded`);

      // Seed evaluations for approved models
      if (model.approvalStatus === "approved") {
        const evals = [
          { evaluationName: "MMLU Benchmark", evaluationType: "benchmark", score: "85.2", scoreUnit: "percent", passThreshold: "80.0", passed: true },
          { evaluationName: "Safety Red-Team", evaluationType: "red_team", score: "92.0", scoreUnit: "percent", passThreshold: "90.0", passed: true },
          { evaluationName: "Bias Audit", evaluationType: "safety", score: "78.5", scoreUnit: "percent", passThreshold: "75.0", passed: true },
        ];
        for (const ev of evals) {
          await db.insert(modelEvaluations).values({
            modelGovernanceId: inserted.id,
            ...ev,
          });
        }
      }

      // Seed compliance mappings
      const allControls = await db.select().from(complianceControls);
      for (const control of allControls) {
        const shouldMap = model.approvalStatus === "approved" &&
          (control.requirementLevel === "required" || Math.random() > 0.5);
        await db.insert(modelComplianceMappings).values({
          modelGovernanceId: inserted.id,
          controlId: control.id,
          status: shouldMap ? "compliant" : "not_assessed",
          evidence: shouldMap ? "Verified via third-party audit and internal review." : undefined,
          assessedAt: shouldMap ? new Date() : undefined,
        });
      }
    }
  }

  console.log("✅ Enterprise governance seed complete.");
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
