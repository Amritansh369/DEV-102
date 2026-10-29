# AI proctoring agent image. Build from this folder: docker build -t dev102-agent backend-services
FROM python:3.11-slim

WORKDIR /app
# OpenCV and MediaPipe need these shared libraries at runtime.
RUN apt-get update && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
# Bake the detector models into the image so cold starts don't download them.
RUN python -c "import vision; print(vision.ensure_models())"

ENV PORT=8000
EXPOSE 8000
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT} --log-level warning"]
