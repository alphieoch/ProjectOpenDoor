"use client";

import { useEffect } from "react";
import { useOpenBotShell } from "@/components/openbot/shell";

export default function OpenBotSkillsPage() {
  const { openSkills } = useOpenBotShell();

  useEffect(() => {
    openSkills();
  }, [openSkills]);

  return (
    <div className="mx-auto w-full max-w-2xl overflow-y-auto px-4 py-12">
      <h2 className="text-lg font-bold text-foreground">Skills</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Skills are playbooks on a coworker. Browse the premade catalog, or write the exact instructions
        you need.
      </p>
      <button type="button" className="btn-secondary mt-6" onClick={openSkills}>
        Browse skills
      </button>
    </div>
  );
}
