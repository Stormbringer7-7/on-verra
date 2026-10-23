# Service « web » : export web de l'app Expo, servi par nginx avec la publication on-verra
# (volume du service « donnees ») sous /donnees, sur la même origine.

FROM node:22-slim AS construction
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# Adresse de la publication vue par le navigateur ; relative = même hôte que l'app.
ARG PUBLICATION_URL=/donnees
ENV EXPO_PUBLIC_PUBLICATION_URL=${PUBLICATION_URL}
RUN npx expo export --platform web --output-dir dist

FROM nginx:1.27-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=construction /app/dist /usr/share/nginx/html
EXPOSE 80
