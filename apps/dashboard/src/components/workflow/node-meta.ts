import type { ElementType } from "react";
import {
  ArrowRight, Bot, Wrench, GitBranch, Shuffle,
  CheckSquare, UserCheck, Timer, Repeat, UserPlus, Globe, Variable, Layers,
} from "lucide-react";

export const NODE_META: Record<string, {
  label: string;
  color: string;
  bg: string;
  icon: ElementType;
  description: string;
}> = {
  input:         { label: "Input",        color: "hsl(var(--card))", bg: "hsl(var(--foreground))", icon: ArrowRight, description: "Workflow entry point" },
  llm:           { label: "LLM Call",     color: "hsl(var(--card))", bg: "var(--green)", icon: Bot, description: "Call a language model" },
  tool:          { label: "Tool",         color: "hsl(var(--card))", bg: "var(--yellow)", icon: Wrench, description: "Invoke an OpenDoor tool" },
  condition:     { label: "Condition",    color: "hsl(var(--card))", bg: "hsl(var(--primary))", icon: GitBranch, description: "Branch based on output" },
  transform:     { label: "Transform",    color: "hsl(var(--card))", bg: "var(--green)", icon: Shuffle, description: "Interpolate variables and reshape text" },
  output:        { label: "Output",       color: "hsl(var(--card))", bg: "var(--red)", icon: CheckSquare, description: "Workflow result" },
  human_review:  { label: "Human Review", color: "hsl(var(--card))", bg: "var(--yellow)", icon: UserCheck, description: "Pause for approval with optional SLA" },
  wait:          { label: "Wait",         color: "hsl(var(--card))", bg: "hsl(var(--primary))", icon: Timer, description: "Delay or resume-at timer" },
  loop:          { label: "Loop",         color: "hsl(var(--card))", bg: "var(--green)", icon: Repeat, description: "Map items through a template" },
  assign:        { label: "Assign",       color: "hsl(var(--card))", bg: "hsl(var(--foreground))", icon: UserPlus, description: "Queue or assignee rule" },
  http:          { label: "HTTP",         color: "hsl(var(--card))", bg: "hsl(var(--primary))", icon: Globe, description: "Call an HTTPS integration" },
  set_variable:  { label: "Set variable", color: "hsl(var(--card))", bg: "hsl(var(--foreground))", icon: Variable, description: "Write a reusable variable" },
  subflow:       { label: "Subflow",      color: "hsl(var(--card))", bg: "hsl(var(--primary))", icon: Layers, description: "Run another published workflow" },
};

export const TRIGGER_LABELS: Record<string, string> = {
  manual: "Manual",
  webhook: "Webhook",
  schedule: "Schedule",
  inbound: "Inbound",
  agent_event: "Agent event",
  record: "Record change",
};
