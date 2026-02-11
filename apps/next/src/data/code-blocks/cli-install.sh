# Install system-wide from source
cargo install --path apps/cli

# Or build release binary
cd apps/cli && cargo build --release

# Binary at: target/release/dlman