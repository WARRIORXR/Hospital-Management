# Multi-stage build for ultra-small, high-performance Rust container
FROM rust:1.80-slim as builder

WORKDIR /usr/src/app
COPY . .

RUN cargo build --release

# Final runtime image: scratch/slim with minimal footprint (<30MB image)
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y ca-certificates libsqlite3-0 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /usr/src/app/target/release/backend_rust /app/backend_rust

ENV PORT=8000
EXPOSE 8000

CMD ["/app/backend_rust"]
