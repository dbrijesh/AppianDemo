FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY ../../packages/py-shared /tmp/py-shared
RUN pip install --no-cache-dir /tmp/py-shared
COPY . .
RUN mkdir -p data/docs
EXPOSE 8006
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8006"]
