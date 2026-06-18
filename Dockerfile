# Pixel Dash — static site served by Python's http.server on port 3000.
FROM python:3.12-alpine

WORKDIR /app

# Copy the static game files into the web root.
COPY index.html style.css game.js ./

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget -qO- http://localhost:3000/ >/dev/null 2>&1 || exit 1

# Serve the current directory on port 3000.
CMD ["python3", "-m", "http.server", "3000"]
