FROM docker.1ms.run/library/node:22-alpine
WORKDIR /app
COPY server.mjs payload-catalog.json ./
ENV PORT=7801
EXPOSE 7801
CMD ["node", "server.mjs"]
