# Base image for OpenDoor self-hosted model deployments
# Uses vLLM CPU backend for OpenAI-compatible inference

FROM vllm/vllm-openai:latest

ENV MODEL_ID=""
ENV PORT=8000
ENV HF_HOME=/tmp/huggingface

# Pre-download common models at build time if MODEL_ID is set
# Otherwise models are downloaded at runtime

EXPOSE 8000

ENTRYPOINT ["python", "-m", "vllm.entrypoints.openai.api_server"]
CMD ["--model", "${MODEL_ID}", "--port", "${PORT}", "--download-dir", "/tmp/huggingface"]
