#!/usr/bin/env bash
# Retired leftover. Do not wire OpenDoor apps to this service.
# Deploy Cloud Run GPU service `opendoor-comfy` (NVIDIA L4, official-public ComfyUI).
#
# Auth: --no-allow-unauthenticated. Gateway/dashboard runtime SA gets roles/run.invoker
# and sends an ADC identity token (audience = service URL). Not public, not Vertex Imagen.
#
# Usage:
#   ./infra/gcp/deploy-comfy.sh
#   SKIP_IMAGE_COPY=1 IMAGE=docker.io/yanwk/comfyui-boot:cu124-slim ./infra/gcp/deploy-comfy.sh
# Retired: do not point gateway/dashboard at this service.
#   UPDATE_APP_ENV=1 ./infra/gcp/deploy-comfy.sh   # leftover only; default is off
#   SKIP_CHECKPOINT_SYNC=1 ./infra/gcp/deploy-comfy.sh  # reuse weights already in GCS
#
# Checkpoints live in gs://opendoor-comfy-models (europe-west1) and are FUSE-mounted at
# /mnt/comfy-models. Scale-to-zero does not drop weights. Do not commit .safetensors.
#
# If Cloud Run GPU quota is denied, the script keeps the service definition and prints
# the quota error + console link. GCE fallback: ./infra/gcp/deploy-comfy-gce.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

# shellcheck source=cloud-run-env.sh
source "$ROOT/infra/gcp/cloud-run-env.sh"

PROJECT="${GCP_PROJECT_ID:-${OPENDOOR_GCP_PROJECT:-project-800192c2-3ecc-4889-8f7}}"
REGION="${GCP_REGION:-us-central1}"
FALLBACK_REGION="${COMFY_FALLBACK_REGION:-europe-west1}"
REPO="${ARTIFACT_REPO:-opendoor}"
REGISTRY="${REGION}-docker.pkg.dev/${PROJECT}/${REPO}"
SERVICE="${COMFY_SERVICE:-opendoor-comfy}"
# cu124-slim downloads ComfyUI from GitHub on first boot and exits on 429/503.
# cu130-slim-v2 bundles ComfyUI (matches Cloud Run L4 driver CUDA 13.0).
PUBLIC_IMAGE="${COMFY_PUBLIC_IMAGE:-docker.io/yanwk/comfyui-boot:cu130-slim-v2}"
AR_IMAGE="${REGISTRY}/comfy:cu130-slim-v2"
IMAGE="${IMAGE:-$AR_IMAGE}"
SKIP_IMAGE_COPY="${SKIP_IMAGE_COPY:-0}"
SKIP_CHECKPOINT_SYNC="${SKIP_CHECKPOINT_SYNC:-0}"
UPDATE_APP_ENV="${UPDATE_APP_ENV:-0}"
GPU_TYPE="${COMFY_GPU_TYPE:-nvidia-l4}"
MODELS_BUCKET="${OPENDOOR_COMFY_MODELS_BUCKET:-opendoor-comfy-models}"
CHECKPOINT="${PRIVATE_IMAGE_GEN_CHECKPOINT:-v1-5-pruned-emaonly.safetensors}"
CHECKPOINT_OBJECT="checkpoints/${CHECKPOINT}"
MODELS_MOUNT="/mnt/comfy-models"
# --disable-mmap: safetensors mmap over GCS FUSE stalls sampling.
# --highvram: keep SD 1.5 on the L4 after the local copy.
# extra_model_paths is a fallback if the bootstrap copy is missing.
CLI_ARGS="--listen 0.0.0.0 --port 8188 --highvram --disable-mmap --extra-model-paths-config ${MODELS_MOUNT}/extra_model_paths.yaml"
QUOTA_CONSOLE="https://console.cloud.google.com/iam-admin/quotas?project=${PROJECT}&pageState=(%22allQuotasTable%22:(%22f%22:%22%255B%257B_22k_22_3A_22_22_2C_22t_22_3A10_2C_22v_22_3A_22_5C_22Nvidia%2520L4_5C_22_22_2C_22s_22_3Atrue%257D%255D%22))"

gcloud config set project "$PROJECT" >/dev/null

PROJECT_NUMBER=$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')
RUNTIME_SA="${OPENDOOR_RUNTIME_SA:-${PROJECT_NUMBER}-compute@developer.gserviceaccount.com}"

copy_image_to_ar() {
  if [[ "$SKIP_IMAGE_COPY" == "1" ]]; then
    echo "==> Skipping image copy (IMAGE=${IMAGE})"
    return 0
  fi
  if gcloud artifacts docker images describe "$AR_IMAGE" --project="$PROJECT" >/dev/null 2>&1; then
    echo "==> Artifact Registry already has ${AR_IMAGE}"
    IMAGE="$AR_IMAGE"
    return 0
  fi
  echo "==> Copy ${PUBLIC_IMAGE} → ${AR_IMAGE} (Cloud Build gcrane)"
  gcloud builds submit --no-source --project="$PROJECT" --config=- <<EOF
substitutions:
  _SRC: ${PUBLIC_IMAGE}
  _DST: ${AR_IMAGE}
options:
  logging: CLOUD_LOGGING_ONLY
  machineType: E2_HIGHCPU_8
timeout: 1800s
steps:
  - name: gcr.io/go-containerregistry/gcrane
    args: ["copy", "\${_SRC}", "\${_DST}"]
EOF
  IMAGE="$AR_IMAGE"
}

sync_comfy_checkpoint() {
  if [[ "$SKIP_CHECKPOINT_SYNC" == "1" ]]; then
    echo "==> Skipping checkpoint sync (gs://${MODELS_BUCKET}/${CHECKPOINT_OBJECT})"
    return 0
  fi
  opendoor_ensure_comfy_models_bucket "$PROJECT" "$MODELS_BUCKET" "$RUNTIME_SA"
  echo "==> Upload extra_model_paths.yaml + bootstrap.sh → gs://${MODELS_BUCKET}"
  gcloud storage cp "$ROOT/infra/gcp/comfy-extra-model-paths.yaml" \
    "gs://${MODELS_BUCKET}/extra_model_paths.yaml" \
    --project="$PROJECT" >/dev/null
  gcloud storage cp "$ROOT/infra/gcp/comfy-bootstrap.sh" \
    "gs://${MODELS_BUCKET}/bootstrap.sh" \
    --project="$PROJECT" >/dev/null
  if gcloud storage objects describe "gs://${MODELS_BUCKET}/${CHECKPOINT_OBJECT}" \
    --project="$PROJECT" >/dev/null 2>&1; then
    echo "==> Checkpoint already in GCS: gs://${MODELS_BUCKET}/${CHECKPOINT_OBJECT}"
    return 0
  fi
  echo "==> Download ${CHECKPOINT} into gs://${MODELS_BUCKET} (Cloud Build, ~4.3 GiB SD 1.5)"
  gcloud builds submit --no-source --project="$PROJECT" \
    --config="$ROOT/infra/gcp/cloudbuild.comfy-checkpoint.yaml" \
    --substitutions="_BUCKET=${MODELS_BUCKET},_OBJECT=${CHECKPOINT_OBJECT}"
}

grant_invoker() {
  local region="$1"
  echo "==> IAM: ${RUNTIME_SA} → roles/run.invoker on ${SERVICE} (${region})"
  gcloud run services add-iam-policy-binding "$SERVICE" \
    --project="$PROJECT" \
    --region="$region" \
    --member="serviceAccount:${RUNTIME_SA}" \
    --role="roles/run.invoker" \
    --quiet >/dev/null
}

deploy_comfy() {
  local region="$1"
  echo "==> Deploy Cloud Run GPU ${SERVICE} (${region}, ${GPU_TYPE}, no zonal redundancy)"
  gcloud run deploy "$SERVICE" \
    --project="$PROJECT" \
    --image="$IMAGE" \
    --region="$region" \
    --platform=managed \
    --no-allow-unauthenticated \
    --port=8188 \
    --cpu=4 \
    --memory=16Gi \
    --gpu=1 \
    --gpu-type="$GPU_TYPE" \
    --no-gpu-zonal-redundancy \
    --no-cpu-throttling \
    --cpu-boost \
    --execution-environment=gen2 \
    --concurrency=1 \
    --min-instances=0 \
    --max-instances=1 \
    --timeout=600 \
    --startup-probe=tcpSocket.port=8188,periodSeconds=10,timeoutSeconds=5,failureThreshold=90,initialDelaySeconds=20 \
    --clear-volumes \
    --add-volume="name=comfy-models,type=cloud-storage,bucket=${MODELS_BUCKET},readonly=true,mount-options=implicit-dirs" \
    --add-volume-mount="volume=comfy-models,mount-path=${MODELS_MOUNT}" \
    --command=/bin/bash \
    --args="-c,bash ${MODELS_MOUNT}/bootstrap.sh" \
    --set-env-vars="^|^CLI_ARGS=${CLI_ARGS}|COMFY_CHECKPOINT=${CHECKPOINT}" \
    --quiet
}

update_app_env() {
  local url="$1"
  echo "==> Point gateway + dashboard at ${url}"
  gcloud run services update opendoor-gateway \
    --project="$PROJECT" \
    --region=us-central1 \
    --update-env-vars="PRIVATE_IMAGE_GEN_URL=${url},PRIVATE_IMAGE_GEN_KIND=comfy,PRIVATE_IMAGE_GEN_CHECKPOINT=${CHECKPOINT}" \
    --quiet
  gcloud run services update opendoor-dashboard \
    --project="$PROJECT" \
    --region=us-central1 \
    --update-env-vars="PRIVATE_IMAGE_GEN_URL=${url},PRIVATE_IMAGE_GEN_KIND=comfy,PRIVATE_IMAGE_GEN_CHECKPOINT=${CHECKPOINT}" \
    --quiet
}

sync_comfy_checkpoint
copy_image_to_ar

DEPLOY_LOG="$(mktemp)"
DEPLOY_REGION="$REGION"
set +e
deploy_comfy "$REGION" 2>&1 | tee "$DEPLOY_LOG"
RC=${PIPESTATUS[0]}
set -e

if [[ "$RC" -ne 0 ]]; then
  if grep -Eiq "quota|RESOURCE_EXHAUSTED|NvidiaL4|gpu-zonal" "$DEPLOY_LOG"; then
    echo ""
    echo "Cloud Run GPU in ${REGION} failed (likely quota). Exact error above."
    echo "Quota console: ${QUOTA_CONSOLE}"
    echo "L4 no-zonal quota: NvidiaL4GpuAllocNoZonalRedundancyPerProjectRegion"
    if [[ "$REGION" != "$FALLBACK_REGION" ]]; then
      echo "==> Retry ${FALLBACK_REGION} (this project already has L4 no-zonal quota there)"
      set +e
      deploy_comfy "$FALLBACK_REGION" 2>&1 | tee "$DEPLOY_LOG"
      RC=${PIPESTATUS[0]}
      set -e
      DEPLOY_REGION="$FALLBACK_REGION"
    fi
  fi
fi

if [[ "$RC" -ne 0 ]]; then
  echo ""
  echo "Cloud Run GPU deploy failed. Scripts are in place; service may be missing."
  echo "  Quota: ${QUOTA_CONSOLE}"
  echo "  GCE fallback (also needs GPU quota): ./infra/gcp/deploy-comfy-gce.sh"
  echo "  Do not set PRIVATE_IMAGE_GEN_URL until a URL exists."
  rm -f "$DEPLOY_LOG"
  exit "$RC"
fi
rm -f "$DEPLOY_LOG"

URL=$(gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$DEPLOY_REGION" --format='value(status.url)')
grant_invoker "$DEPLOY_REGION"

if [[ "$UPDATE_APP_ENV" == "1" ]]; then
  update_app_env "$URL"
fi

echo ""
echo "Deployed ${SERVICE}"
echo "  URL:     ${URL}"
echo "  Region:  ${DEPLOY_REGION}"
echo "  GPU:     ${GPU_TYPE} (no zonal redundancy, scale-to-zero)"
echo "  Image:   ${IMAGE}"
echo "  Auth:    Cloud Run IAM (no unauthenticated). Runtime SA ${RUNTIME_SA} is invoker."
echo "  Env:     PRIVATE_IMAGE_GEN_URL=${URL}"
echo "           PRIVATE_IMAGE_GEN_KIND=comfy"
echo "           PRIVATE_IMAGE_GEN_CHECKPOINT=${CHECKPOINT}"
echo "  Weights: gs://${MODELS_BUCKET}/${CHECKPOINT_OBJECT}"
echo "           FUSE mount ${MODELS_MOUNT} (readonly). Scale-to-zero keeps GCS objects."
echo "  Persist: infra/gcp/cloud-run-env.sh (next gateway/dashboard deploy keeps these)"
echo ""
echo "Smoke (identity token, token not printed):"
echo "  TOKEN=\$(gcloud auth print-identity-token --audiences=${URL})"
echo "  curl -sS -H \"Authorization: Bearer \$TOKEN\" ${URL}/system_stats"
