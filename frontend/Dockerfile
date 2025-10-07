# Stage 1: build frontend using node
FROM node:18-alpine AS build

WORKDIR /app

COPY package.json ./
RUN npm install
COPY . .
RUN npm run build

# Stage 2: serve static files with nginx
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]