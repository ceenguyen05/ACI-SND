FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3001
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/src ./src
COPY --from=build /app/server ./server
RUN mkdir -p /app/server-data && chown node:node /app/server-data
VOLUME ["/app/server-data"]
USER node
EXPOSE 3001
CMD ["npm", "start"]
