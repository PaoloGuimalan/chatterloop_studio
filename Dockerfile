FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY scripts ./scripts
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
RUN apk add --no-cache jq
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html/studio
RUN cp /usr/share/nginx/html/studio/index.html /etc/studio-index.template.html
COPY scripts/40-studio-config.sh /docker-entrypoint.d/40-studio-config.sh
RUN chmod +x /docker-entrypoint.d/40-studio-config.sh
EXPOSE 80
