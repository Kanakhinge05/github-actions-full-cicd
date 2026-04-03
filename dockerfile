# ---------- Stage 1: Build ----------
    
FROM alpine AS builder
WORKDIR /app
COPY . .
RUN apk add --no-cache bash

# ---------- Stage 2: Production ----------

FROM nginx:alpine
RUN rm -rf /usr/share/nginx/html/*
COPY --from=builder /app/build /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]