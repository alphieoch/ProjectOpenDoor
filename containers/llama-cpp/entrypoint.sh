#!/bin/sh
set -e

if [ -z "$MODEL_URL" ]; then
  echo "ERROR: MODEL_URL environment variable is required"
  exit 1
fi

MODEL_DIR=/tmp/models
mkdir -p $MODEL_DIR

MODEL_FILENAME=$(basename "$MODEL_URL")
MODEL_PATH="$MODEL_DIR/$MODEL_FILENAME"

if [ ! -f "$MODEL_PATH" ]; then
  echo "Downloading model from $MODEL_URL..."
  curl -L -o "$MODEL_PATH" "$MODEL_URL"
  echo "Model downloaded."
fi

echo "Starting llama.cpp server with model: $MODEL_PATH"

exec /server \
  -m "$MODEL_PATH" \
  --host 0.0.0.0 \
  --port "${PORT:-8000}" \
  -np 4 \
  -cb \
  --slots 4 \
  "$@"
