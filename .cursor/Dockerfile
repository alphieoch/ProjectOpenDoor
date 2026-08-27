FROM node:22-bookworm

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      git curl ca-certificates python3 build-essential \
      postgresql postgresql-contrib redis-server \
    && rm -rf /var/lib/apt/lists/* \
    && curl -fsSL https://bun.sh/install | bash

ENV PATH="/root/.bun/bin:${PATH}"
