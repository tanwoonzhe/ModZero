# Stage 1: build frontend using node
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json ./
RUN npm install
COPY . .
RUN npm run build

# Stage 2: serve static files with nginx
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]