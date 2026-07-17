FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Vide volontairement : le front appelle /api en relatif, nginx proxifie vers
# l'API. Les variables Vite sont figées au build, jamais lues au runtime.
ENV VITE_API_URL=""
RUN npm run build


FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
