# VERALIQ self-hosted STT service (faster-whisper).
# Base image assumes an NVIDIA GPU host with the NVIDIA Container Toolkit
# installed (see docs/SELF_HOSTED_DEPLOYMENT.md). For CPU-only development,
# swap the base image for `python:3.11-slim` and set WHISPER_DEVICE=cpu /
# WHISPER_COMPUTE_TYPE=int8 in docker-compose.yml — faster-whisper runs
# (slowly) on CPU with no code changes.
FROM nvidia/cuda:12.4.1-runtime-ubuntu22.04

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.11 python3-pip ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

COPY main.py .

ENV WHISPER_MODEL_SIZE=small
ENV WHISPER_DEVICE=cuda
ENV WHISPER_COMPUTE_TYPE=float16
ENV ALLOWED_ORIGINS=https://veraliq.com

EXPOSE 8001
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
