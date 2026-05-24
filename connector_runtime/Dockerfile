FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Package mounted as /app/connector_runtime so `python -m connector_runtime` works.
COPY . /app/connector_runtime

ENV PYTHONUNBUFFERED=1
ENV MODZERO_STATE_FILE=/var/lib/modzero/connector_state.json

# Default proxy port (matches connector_runtime/config.py defaults).
EXPOSE 18080

ENTRYPOINT ["python", "-m", "connector_runtime"]
CMD ["run", "--proxy"]
