-- Seed enterprise governance data
-- Run with: psql $DATABASE_URL -f scripts/seed-enterprise-governance.sql

-- ── Compliance Controls ─────────────────────────────────────────────────────
INSERT INTO compliance_controls (framework, control_code, control_name, description, requirement_level, guidance) VALUES
  ('gdpr', 'GDPR-1', 'Lawful Basis for Processing', 'Ensure AI processing has a lawful basis under GDPR Article 6.', 'required', 'Document consent or legitimate interest assessment.'),
  ('gdpr', 'GDPR-2', 'Data Minimisation', 'Only process personal data necessary for the specific purpose.', 'required', 'Review training data and prompts for unnecessary PII.'),
  ('gdpr', 'GDPR-3', 'Right to Explanation', 'Users can obtain meaningful information about logic involved.', 'required', 'Provide model cards and decision rationale documentation.'),
  ('gdpr', 'GDPR-4', 'Data Subject Rights', 'Support access, rectification, erasure, and portability.', 'required', 'Implement data retention and deletion workflows.'),
  ('gdpr', 'GDPR-5', 'Data Protection Impact Assessment', 'DPIA required for high-risk AI processing.', 'required', 'Complete DPIA before production deployment.'),
  ('eu_ai_act', 'AIACT-1', 'Risk Classification', 'Classify AI system risk level per EU AI Act.', 'required', 'Map to limited risk, high risk, or unacceptable risk.'),
  ('eu_ai_act', 'AIACT-2', 'Transparency Obligations', 'Notify users they are interacting with AI.', 'required', 'Add disclosure in UI and API responses.'),
  ('eu_ai_act', 'AIACT-3', 'Human Oversight', 'Enable effective oversight by natural persons.', 'required', 'Implement human-in-the-loop for high-risk decisions.'),
  ('eu_ai_act', 'AIACT-4', 'Accuracy, Robustness, Cybersecurity', 'Ensure appropriate levels for intended purpose.', 'required', 'Run red-team evaluations and penetration tests.'),
  ('eu_ai_act', 'AIACT-5', 'Record-Keeping', 'Maintain logs of operation for traceability.', 'required', 'Retain request logs for minimum 6 years.'),
  ('ico_uk', 'ICO-1', 'AI Auditing Framework', 'Follow ICO guidance on auditing AI systems.', 'recommended', 'Use ICO''s AI auditing framework checklist.'),
  ('ico_uk', 'ICO-2', 'Fairness by Design', 'Assess and mitigate bias in AI decisions.', 'required', 'Conduct bias audits and document mitigation.'),
  ('ico_uk', 'ICO-3', 'Data Residency', 'UK personal data should remain in UK/EU.', 'required', 'Ensure models and data processed in UK/EU regions.'),
  ('nist_ai_rmf', 'NIST-1', 'Govern', 'Establish AI risk management policies.', 'required', 'Define roles, responsibilities, and risk appetite.'),
  ('nist_ai_rmf', 'NIST-2', 'Map', 'Identify context and risks for AI systems.', 'required', 'Inventory all models, data sources, and use cases.'),
  ('nist_ai_rmf', 'NIST-3', 'Measure', 'Quantify and evaluate AI risks.', 'required', 'Use quantitative metrics for bias, safety, and security.'),
  ('nist_ai_rmf', 'NIST-4', 'Manage', 'Prioritize and act on identified risks.', 'required', 'Implement controls and monitor effectiveness.')
ON CONFLICT (framework, control_code) DO NOTHING;

-- ── Sector Templates ────────────────────────────────────────────────────────
INSERT INTO sector_templates (sector, name, description, default_models, default_policies, prompt_templates, guardrail_config, compliance_requirements) VALUES
  ('legal', 'Legal Services AI Pack', 'Pre-approved models, guardrails, and compliance config for UK law firms.', 
   '["gpt-4o", "claude-3-5-sonnet-20241022", "mistral-large-latest"]', 
   '{"dataClass": "confidential", "requireHumanApproval": true, "bannedUses": ["unauthorized legal advice", "client data training"]}', 
   '{"contractReview": "Review the following contract for risks. Do not provide legal advice.", "redaction": "Redact all PII and client-identifying information."}', 
   '{"piiDetection": "block", "promptInjection": "block", "requireDisclosure": true}', 
   '["GDPR-1", "GDPR-2", "GDPR-3", "GDPR-4", "GDPR-5", "ICO-1", "ICO-2", "ICO-3"]'),
  ('finance', 'Financial Services AI Pack', 'Governance templates for banks, insurers, and fintechs.', 
   '["gpt-4o", "azure-foundry-phi-4"]', 
   '{"dataClass": "restricted", "requireHumanApproval": true, "bannedUses": ["investment advice without disclaimer", "credit scoring without oversight"]}', 
   '{"fraudDetection": "Flag suspicious patterns. Escalate to human analyst.", "reportSummary": "Summarise the following financial report. Add disclaimer."}', 
   '{"piiDetection": "block", "secretScanning": "block", "requireDisclosure": true}', 
   '["GDPR-1", "GDPR-2", "GDPR-4", "GDPR-5", "AIACT-1", "AIACT-3", "AIACT-4", "AIACT-5", "ICO-2", "ICO-3"]'),
  ('property', 'Property & Real Estate AI Pack', 'AI governance for estate agencies, property managers, and surveyors.', 
   '["gpt-4o-mini", "mistral-small-latest"]', 
   '{"dataClass": "internal", "requireHumanApproval": false, "bannedUses": ["valuation without surveyor review", "tenant screening discrimination"]}', 
   '{"listingDescription": "Generate a property description from the following facts.", "tenantQuery": "Answer the tenant query based on the tenancy agreement."}', 
   '{"piiDetection": "redact", "biasDetection": "flag", "requireDisclosure": true}', 
   '["GDPR-1", "GDPR-2", "GDPR-4", "ICO-2", "ICO-3"]')
ON CONFLICT DO NOTHING;

-- ── Model Governance Registry ───────────────────────────────────────────────
WITH inserted_models AS (
  INSERT INTO model_governance (model_id, display_name, description, risk_level, business_labels, allowed_use_cases, banned_use_cases, data_classes_allowed, license_type, provenance_verified, bias_reviewed, safety_reviewed, context_window, parameter_scale, reasoning_modes, cost_tier, sector_tags, approval_status) VALUES
    ('gpt-4o', 'GPT-4o', 'OpenAI flagship multimodal model. Strong general reasoning and code.', 'medium', 
     '["general purpose", "code assistant", "multimodal"]', 
     '["internal copilots", "code review", "document drafting", "customer support triage"]', 
     '["medical diagnosis", "legal advice without disclaimer", "credit scoring without oversight"]', 
     '["public", "internal", "confidential"]', 'Proprietary (OpenAI)', true, true, true, 128000, 'unknown', '["chain-of-thought"]', 'premium', '["general", "legal", "finance", "property"]', 'approved'),
    ('claude-3-5-sonnet-20241022', 'Claude 3.5 Sonnet', 'Anthropic''s balanced model with strong safety features and long context.', 'medium', 
     '["general purpose", "long context", "safety-first"]', 
     '["internal copilots", "document analysis", "research synthesis"]', 
     '["medical diagnosis", "autonomous decision-making"]', 
     '["public", "internal", "confidential"]', 'Proprietary (Anthropic)', true, true, true, 200000, 'unknown', '["chain-of-thought"]', 'premium', '["general", "legal", "finance"]', 'approved'),
    ('deepseek-chat', 'DeepSeek-V3', 'Open-weight model with strong reasoning capabilities. Pending approval for our governance context.', 'high', 
     '["open-weight", "reasoning", "cost-efficient"]', 
     '["internal experimentation", "non-sensitive code generation"]', 
     '["customer PII processing", "regulated decision-making", "UK government data"]', 
     '["public", "internal"]', 'MIT', true, false, false, 64000, '671B', '["chain-of-thought", "multi-step"]', 'standard', '["general"]', 'pending'),
    ('mistral-large-latest', 'Mistral Large', 'European open-weight model. Good data sovereignty option for EU businesses.', 'low', 
     '["EU-based", "open-weight", "data sovereignty"]', 
     '["internal copilots", "document drafting", "customer email drafting"]', 
     '["medical diagnosis", "autonomous financial advice"]', 
     '["public", "internal", "confidential"]', 'Apache-2.0', true, true, true, 128000, 'unknown', '["chain-of-thought"]', 'standard', '["general", "legal", "finance", "property"]', 'approved'),
    ('gemini-1.5-pro', 'Gemini 1.5 Pro', 'Google model with very long context window and multimodal support.', 'medium', 
     '["long context", "multimodal", "video understanding"]', 
     '["document analysis", "media content review", "research synthesis"]', 
     '["medical imaging diagnosis", "facial recognition"]', 
     '["public", "internal"]', 'Proprietary (Google)', true, true, true, 2000000, 'unknown', '["chain-of-thought"]', 'premium', '["general"]', 'approved')
  ON CONFLICT (model_id) DO NOTHING
  RETURNING id, model_id, approval_status
)
SELECT * FROM inserted_models;

-- ── Evaluations for approved models ─────────────────────────────────────────
INSERT INTO model_evaluations (model_governance_id, evaluation_name, evaluation_type, score, score_unit, pass_threshold, passed)
SELECT g.id, 'MMLU Benchmark', 'benchmark', '85.2', 'percent', '80.0', true
FROM model_governance g WHERE g.approval_status = 'approved'
ON CONFLICT DO NOTHING;

INSERT INTO model_evaluations (model_governance_id, evaluation_name, evaluation_type, score, score_unit, pass_threshold, passed)
SELECT g.id, 'Safety Red-Team', 'red_team', '92.0', 'percent', '90.0', true
FROM model_governance g WHERE g.approval_status = 'approved'
ON CONFLICT DO NOTHING;

INSERT INTO model_evaluations (model_governance_id, evaluation_name, evaluation_type, score, score_unit, pass_threshold, passed)
SELECT g.id, 'Bias Audit', 'safety', '78.5', 'percent', '75.0', true
FROM model_governance g WHERE g.approval_status = 'approved'
ON CONFLICT DO NOTHING;

-- ── Compliance mappings for all models ──────────────────────────────────────
INSERT INTO model_compliance_mappings (model_governance_id, control_id, status, evidence, assessed_at)
SELECT g.id, c.id, 'compliant', 'Verified via third-party audit and internal review.', NOW()
FROM model_governance g, compliance_controls c
WHERE g.approval_status = 'approved' AND c.requirement_level = 'required'
ON CONFLICT (model_governance_id, control_id) DO NOTHING;

INSERT INTO model_compliance_mappings (model_governance_id, control_id, status)
SELECT g.id, c.id, 'not_assessed'
FROM model_governance g, compliance_controls c
WHERE g.approval_status = 'pending'
ON CONFLICT (model_governance_id, control_id) DO NOTHING;
