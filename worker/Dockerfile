FROM node:20-slim

# Install Python and uv
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    curl \
    && rm -rf /var/lib/apt/lists/*

RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:$PATH"

WORKDIR /app

# Install Node dependencies
COPY package*.json ./
RUN npm ci

# Copy TypeScript config and worker source
COPY tsconfig.json ./
COPY src ./src
COPY migrations ./migrations

# Copy Python scripts and dependencies
COPY scripts ./scripts
COPY pyproject.toml ./

# Create virtual environment and install Python dependencies
RUN uv venv .venv && \
    . .venv/bin/activate && \
    uv pip install -r pyproject.toml

# Use virtual environment for Python execution
ENV PATH="/app/.venv/bin:$PATH"

CMD ["npm", "run", "dev"]
