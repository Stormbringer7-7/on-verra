# Service « web » : export web de l'app Expo, servi par nginx avec l'API sous /api, sur la même origine.

FROM node:22-slim AS construction
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# Adresse de l'API vue par le navigateur ; relative = même hôte que l'app.
ARG API_URL=/api
ENV EXPO_PUBLIC_API_URL=${API_URL}
RUN npx expo export --platform web --output-dir dist

FROM nginx:1.27-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=construction /app/dist /usr/share/nginx/html
EXPOSE 80
