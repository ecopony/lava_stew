FROM node:20-slim

# Install Python and uv for executing Python scripts
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

# Build TypeScript
RUN npm run build

# Python scripts and dependencies will be mounted at runtime from agent_worker directory
# Create virtual environment directory structure (will be populated at runtime)
RUN mkdir -p /app/agent_worker

CMD ["sh", "-c", "cd /app/agent_worker && ([ -d .venv ] || uv venv .venv) && . .venv/bin/activate && uv pip install -r pyproject.toml && cd /app && npm start"]
