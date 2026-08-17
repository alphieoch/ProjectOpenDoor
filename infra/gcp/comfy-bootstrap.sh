#!/bin/bash
# Seed the GCS-backed checkpoint onto the container disk, then start ComfyUI.
# mmap over Cloud Storage FUSE is unusable (random reads stall KSampler).
# Weights still live in gs://opendoor-comfy-models; this copy is ephemeral.
set -euo pipefail

CKPT="${COMFY_CHECKPOINT:-v1-5-pruned-emaonly.safetensors}"
SRC="/mnt/comfy-models/checkpoints/${CKPT}"
DST_DIR="/root/ComfyUI/models/checkpoints"
DST="${DST_DIR}/${CKPT}"

mkdir -p "$DST_DIR"
if [[ -f "$SRC" ]]; then
  echo "[opendoor] Copying ${CKPT} from GCS FUSE → local disk"
  cp -f "$SRC" "$DST"
  echo "[opendoor] Copied $(wc -c < "$DST") bytes"
else
  echo "[opendoor] WARNING: ${SRC} missing; Comfy will only see the FUSE extra_model_paths"
fi

exec bash /runner-scripts/entrypoint.sh
