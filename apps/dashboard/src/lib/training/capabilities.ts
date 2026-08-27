import { allowSimulatedTraining, hasRealTrainer } from "@opendoor/shared";
import type { TrainerCapabilities } from "./plan";

function env(name: string): string {
  return (process.env[name] || "").trim();
}

export function trainingCapabilities(): TrainerCapabilities {
  const vertex = Boolean(
    env("GOOGLE_CLOUD_PROJECT") ||
      env("GCP_PROJECT") ||
      env("GCP_PROJECT_ID") ||
      env("GOOGLE_APPLICATION_CREDENTIALS")
  );
  const together = Boolean(env("TOGETHER_API_KEY"));
  const localTrainer = Boolean(env("LOCAL_TRAINER_URL"));
  const customEndpoint = env("GCP_TRAINER_ENDPOINT");
  const customJobImage = Boolean(
    env("VERTEX_CUSTOM_TRAINING_IMAGE") || (customEndpoint && !/^https?:\/\//i.test(customEndpoint))
  );
  return {
    vertex,
    together,
    localTrainer,
    customJobImage,
    simulated: allowSimulatedTraining(),
    hasRealTrainer: hasRealTrainer(),
  };
}
