# Base image documented at https://docs.apify.com/actors/development/actor-definition/dockerfile
# Slim variant: package.json and package-lock.json are the only source of dependency versions.
FROM apify/actor-node:22-slim

COPY --chown=myuser:myuser package*.json ./

# Optional dependencies are kept on purpose: pdfjs-dist uses @napi-rs/canvas when available.
RUN npm --quiet set progress=false \
 && npm ci --omit=dev \
 && echo "Node.js version:" && node --version \
 && echo "NPM version:" && npm --version

COPY --chown=myuser:myuser . ./

CMD ["npm", "start", "--silent"]
