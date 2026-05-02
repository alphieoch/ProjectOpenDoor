# Lightweight base image for OpenDoor self-hosted models
# Uses llama.cpp for CPU inference with OpenAI-compatible API

FROM ghcr.io/ggerganov/llama.cpp:server

ENV MODEL_URL=""
ENV PORT=8000
ENV HF_HOME=/tmp/huggingface

# Install curl for model download
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8000

ENTRYPOINT ["/entrypoint.sh"]
