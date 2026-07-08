FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend core (Community Edition routes)
COPY backend/ .

# Enterprise overlay — merged at build time (Phase P2)
COPY ee-backend/ /ee-backend/
COPY scripts/assemble-edition.sh /assemble-edition.sh
ARG DGCPOS_EDITION=enterprise
RUN chmod +x /assemble-edition.sh \
    && DGCPOS_EDITION="$DGCPOS_EDITION" /assemble-edition.sh "$DGCPOS_EDITION"

# Copy version file (at repo root) so /api/settings/version works
COPY version.json /app/version.json

# Copy startup script
COPY start.sh /start.sh
RUN chmod +x /start.sh

EXPOSE 5000

CMD ["/start.sh"]
