# Node Alpine -- multi-arch (amd64 + arm64)
FROM node:24-alpine AS builder

WORKDIR /app

ARG BUILD_COMMIT
ENV BUILD_COMMIT=${BUILD_COMMIT}

# Copy package files first for caching
COPY package.json package-lock.json ./

RUN npm ci

# Copy the rest of the project
COPY . .

# Build the project
RUN npm run build

# Serve with nginx
FROM nginx:1.28.2-alpine

ARG BUILD_COMMIT
ENV NGINX_ENVSUBST_FILTER='^(NAVIDROME_URL)$'
LABEL org.opencontainers.image.title="Navichrome" \
      org.opencontainers.image.version="0.1.0-beta.1" \
      org.opencontainers.image.revision="${BUILD_COMMIT}" \
      org.opencontainers.image.source="https://github.com/lozza/monochrome-navidrome"

COPY --from=builder /app/dist /usr/share/nginx/html

COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY docker/security-headers.conf /etc/nginx/snippets/security-headers.conf

# Expose the nginx port
EXPOSE 4173

CMD ["nginx", "-g", "daemon off;"]
