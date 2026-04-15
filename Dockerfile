FROM oven/bun:1-debian AS builder

ARG OPENCODE_REPO=https://github.com/anomalyco/opencode.git
ARG OPENCODE_REF=dev

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    git \
    python3 \
    make \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

RUN git clone --depth=1 --branch=${OPENCODE_REF} ${OPENCODE_REPO} . \
    || (git clone ${OPENCODE_REPO} . && git checkout ${OPENCODE_REF})

RUN bun install --frozen-lockfile

RUN cd packages/opencode && bun run build --single --skip-embed-web-ui

# --------------- runtime ---------------
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    git \
    ripgrep \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /build/packages/opencode/dist/opencode-linux-*/bin/opencode /usr/local/bin/opencode
RUN chmod +x /usr/local/bin/opencode && opencode --version

COPY opencode.sh /usr/local/bin/opencode.sh
RUN chmod +x /usr/local/bin/opencode.sh

WORKDIR /workspace

RUN echo '{"provider":{"openai":{"models":{"gpt-4o":{}}}}}' > /workspace/.opencode.json

EXPOSE 4096

ENTRYPOINT ["/usr/local/bin/opencode.sh"]
