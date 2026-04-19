FROM python:3.12-slim-bookworm

LABEL maintainer="ModZero Team"
LABEL description="ModZero Connector — lightweight reverse proxy for zero-trust access"

WORKDIR /app

# Create non-root user for running the connector
RUN groupadd -r modzero && useradd -r -g modzero -d /app -s /sbin/nologin modzero

# Install security updates
RUN apt-get update && apt-get upgrade -y && rm -rf /var/lib/apt/lists/*

# Create config directory with correct permissions
RUN mkdir -p /etc/modzero-connector && \
    chown modzero:modzero /etc/modzero-connector && \
    chmod 700 /etc/modzero-connector

COPY requirements.txt ./
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

COPY *.py ./

# Switch to non-root user
USER modzero

EXPOSE 8443

ENV MODZERO_CONFIG_DIR=/etc/modzero-connector \
    MODZERO_CONNECTOR_LISTEN_ADDR=0.0.0.0 \
    MODZERO_CONNECTOR_LISTEN_PORT=8443

CMD ["python", "main.py"]
