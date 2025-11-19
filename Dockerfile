# Multi-stage Dockerfile to run ASP.NET Core + Next.js in a single container

# 1. Build .NET app
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS dotnet-build
WORKDIR /src

# Copy solution and projects
COPY TechStacks.sln ./
COPY TechStacks ./TechStacks
COPY TechStacks.ServiceInterface ./TechStacks.ServiceInterface
COPY TechStacks.ServiceModel ./TechStacks.ServiceModel

# Restore and publish only the API project (avoid solution projects not copied into the image)
RUN dotnet restore TechStacks/TechStacks.csproj
# Disable .NET's built-in containerization (PublishProfile=DefaultContainer) inside Docker
RUN dotnet publish TechStacks/TechStacks.csproj -c Release --no-restore -p:PublishProfile=

# 2. Build Next.js app
FROM node:20-alpine AS next-build
WORKDIR /app/client

COPY TechStacks.Client/package*.json ./
RUN npm ci
COPY TechStacks.Client/ ./

# Build Next.js in server mode
RUN npm run build:prod

# 3. Runtime image with .NET + Node
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app

# Label required by Kamal, must match config/deploy.yml service (techstacks-io)
LABEL service="techstacks-io"

ARG SERVICESTACK_LICENSE

# Install Node.js >= 20.9 (Node 24.x LTS) and bash for the entrypoint script
RUN apt-get update \
    && apt-get install -y curl ca-certificates gnupg bash \
    && curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
    && apt-get install -y nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Copy published .NET app
COPY --from=dotnet-build /src/TechStacks/bin/Release/net10.0/publish ./api

# Copy built Next.js app (including .next, node_modules, public, etc.)
COPY --from=next-build /app/client ./client

ENV ASPNETCORE_URLS=http://0.0.0.0:8080 \
    NEXT_PORT=3000 \
    NODE_ENV=production \
    INTERNAL_API_URL=http://127.0.0.1:8080 \
    SERVICESTACK_LICENSE=$SERVICESTACK_LICENSE

EXPOSE 8080

# Copy entrypoint script
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

ENTRYPOINT ["/usr/bin/env", "bash", "/app/entrypoint.sh"]

