#!/bin/sh
set -e

if [ -z "$MODEL_ID" ]; then
  echo "ERROR: MODEL_ID environment variable is required"
  exit 1
fi

echo "Starting vLLM server for model: $MODEL_ID"

exec python -m vllm.entrypoints.openai.api_server \
  --model "$MODEL_ID" \
  --port "${PORT:-8000}" \
  --download-dir /tmp/huggingface \
  "$@"
