FROM node:20-alpine AS build
WORKDIR /app

ARG VITE_API_URL=http://localhost:4000
ENV VITE_API_URL=$VITE_API_URL

COPY package.json ./
RUN npm install --legacy-peer-deps

COPY . .
RUN npm run build

FROM nginx:alpine AS production
COPY --from=build /app/dist /usr/share/nginx/html

RUN mkdir -p /etc/nginx/templates && echo 'server { \
  listen ${PORT}; \
  root /usr/share/nginx/html; \
  index index.html; \
  location /health { \
    access_log off; \
    add_header Content-Type text/plain; \
    return 200 "healthy"; \
  } \
  location / { \
    try_files $uri $uri/ /index.html; \
  } \
}' > /etc/nginx/templates/default.conf.template

EXPOSE 80
CMD ["sh", "-c", "envsubst '$$PORT' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]
