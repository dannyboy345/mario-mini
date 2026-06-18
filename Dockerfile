# Pixel Dash — static site served by Python's http.server on port 3000.
FROM python:3.12-alpine

WORKDIR /app

# Copy the static game files into the web root.
COPY index.html style.css game.js ./

EXPOSE 3000

# Healthcheck uses Python's stdlib (urllib) against 127.0.0.1 — the busybox
# `wget` healthcheck was unreliable under Swarm and SIGKILLed the container.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD ["python3", "-c", "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:3000/',timeout=3).status==200 else 1)"]

# Serve the current directory on all interfaces, port 3000.
CMD ["python3", "-m", "http.server", "3000", "--bind", "0.0.0.0"]
