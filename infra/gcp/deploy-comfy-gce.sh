#!/usr/bin/env bash
# GCE fallback if Cloud Run GPU is blocked: 1x L4 (g2-standard-4) + ComfyUI on :8188.
#
# Prefer ./infra/gcp/deploy-comfy.sh (Cloud Run). This path needs Compute Engine
# GPU quota (NVIDIA_L4_GPUS and GPUS_ALL_REGIONS). HTTP is VPC-only; gateway
# reaches it through the existing Serverless VPC connector.
#
# Usage: ./infra/gcp/deploy-comfy-gce.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
# shellcheck source=cloud-run-env.sh
source "$ROOT/infra/gcp/cloud-run-env.sh"

PROJECT="${GCP_PROJECT_ID:-${OPENDOOR_GCP_PROJECT:-project-800192c2-3ecc-4889-8f7}}"
REGION="${GCP_REGION:-us-central1}"
ZONE="${COMFY_GCE_ZONE:-${REGION}-a}"
NAME="${COMFY_GCE_NAME:-opendoor-comfy}"
MACHINE="${COMFY_GCE_MACHINE:-g2-standard-4}"
IMAGE="${COMFY_PUBLIC_IMAGE:-docker.io/yanwk/comfyui-boot:cu130-slim-v2}"
QUOTA_CONSOLE="https://console.cloud.google.com/iam-admin/quotas?project=${PROJECT}"

gcloud config set project "$PROJECT" >/dev/null

echo "==> GCE ${NAME} (${MACHINE}, 1x L4) in ${ZONE}"
echo "    This project often has GPUS_ALL_REGIONS=0 — create will fail until that quota is raised."
echo "    Quota console: ${QUOTA_CONSOLE}"

if gcloud compute instances describe "$NAME" --zone="$ZONE" --project="$PROJECT" >/dev/null 2>&1; then
  echo "    instance already exists"
else
  gcloud compute instances create "$NAME" \
    --project="$PROJECT" \
    --zone="$ZONE" \
    --machine-type="$MACHINE" \
    --accelerator=type=nvidia-l4,count=1 \
    --maintenance-policy=TERMINATE \
    --provisioning-model=STANDARD \
    --image-family=cos-stable \
    --image-project=cos-cloud \
    --boot-disk-size=200GB \
    --boot-disk-type=pd-balanced \
    --scopes=cloud-platform \
    --tags=opendoor-comfy \
    --metadata=google-logging-enabled=true,startup-script="#!/bin/bash
set -eux
# COS + nvidia installer + docker
if ! command -v nvidia-smi >/dev/null 2>&1; then
  curl -fsSL https://raw.githubusercontent.com/GoogleCloudPlatform/compute-gpu-installation/main/linux/install_gpu_driver.py -o /tmp/install_gpu_driver.py || true
fi
# Pull public ComfyUI and listen on 8188 (all interfaces inside the VM)
docker-credential-gcr configure-docker --registries=${REGION}-docker.pkg.dev || true
docker pull ${IMAGE}
docker rm -f comfy || true
docker run -d --name comfy --gpus all --restart unless-stopped \
  -p 8188:8188 \
  -e CLI_ARGS='--listen 0.0.0.0 --port 8188' \
  ${IMAGE}
"
fi

echo "==> Firewall: tcp:8188 from VPC + IAP only (not 0.0.0.0/0)"
gcloud compute firewall-rules describe opendoor-comfy-8188 --project="$PROJECT" >/dev/null 2>&1 || \
  gcloud compute firewall-rules create opendoor-comfy-8188 \
    --project="$PROJECT" \
    --network=default \
    --allow=tcp:8188 \
    --target-tags=opendoor-comfy \
    --source-ranges=10.0.0.0/8,10.8.0.0/28,172.16.0.0/12,35.235.240.0/20 \
    --description="ComfyUI 8188 from VPC + IAP, not the public internet"

INTERNAL_IP=$(gcloud compute instances describe "$NAME" --zone="$ZONE" --project="$PROJECT" --format='value(networkInterfaces[0].networkIP)')
URL="http://${INTERNAL_IP}:8188"

echo ""
echo "GCE ${NAME}"
echo "  Internal: ${URL}"
echo "  Auth:     VPC path (not public). Point PRIVATE_IMAGE_GEN_URL at this only if"
echo "            gateway vpc-egress can reach 10.x (private-ranges-only already can)."
echo "  Smoke:    gcloud compute ssh ${NAME} --zone=${ZONE} --command='curl -sS http://127.0.0.1:8188/system_stats'"
echo "  Env:      PRIVATE_IMAGE_GEN_URL=${URL} PRIVATE_IMAGE_GEN_KIND=comfy"
