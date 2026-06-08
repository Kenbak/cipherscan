# syntax=docker/dockerfile:1

# Zebra built with the experimental internal miner enabled.
# TESTNET ONLY - the internal miner is not competitive on mainnet (see
# https://dannywillems.github.io/blog/2026/06/02/zcash-mining-zebra-stratum/).
#
# Pin the Zebra source to any tag/branch/commit with --build-arg ZEBRA_REF=...
ARG RUST_IMAGE=rust:1.86-bookworm
ARG ZEBRA_REF=v2.4.0

FROM ${RUST_IMAGE} AS build
ARG ZEBRA_REF
WORKDIR /src
# Build dependencies for Zebra (rocksdb bindgen needs clang/libclang).
# hadolint ignore=DL3008
RUN apt-get update && apt-get install -y --no-install-recommends \
      clang \
      libclang-dev \
      protobuf-compiler \
      git \
    && rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 --branch "${ZEBRA_REF}" \
      https://github.com/ZcashFoundation/zebra.git .
RUN cargo build --release --features internal-miner --bin zebrad \
    && cp target/release/zebrad /usr/local/bin/zebrad

FROM debian:bookworm-slim AS runtime
ARG ZEBRA_REF
LABEL org.opencontainers.image.title="cipherscan-zebra-mining" \
      org.opencontainers.image.source="https://github.com/ZcashFoundation/zebra" \
      org.opencontainers.image.revision="${ZEBRA_REF}"
# hadolint ignore=DL3008
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 10001 zebra
COPY --from=build /usr/local/bin/zebrad /usr/local/bin/zebrad
USER zebra
EXPOSE 8232
ENTRYPOINT ["zebrad"]
CMD ["start"]
