# VERALIQ self-hosted TTS service (Chatterbox Multilingual V3).
FROM nvidia/cuda:12.4.1-runtime-ubuntu22.04

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.11 python3-pip \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

COPY main.py .
# Drop consented reference .wav files here at deploy time — see
# services/tts/README.md and main.py's file header. Never committed to git
# (see .gitignore) since these are voice biometric material.
RUN mkdir -p voice_profiles

ENV VOICE_PROFILES_DIR=/app/voice_profiles
ENV DEFAULT_VOICE_ID=elif-kaya-tr
ENV ALLOWED_ORIGINS=https://veraliq.com

EXPOSE 8002
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8002"]
