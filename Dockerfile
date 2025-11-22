# Multi-stage Dockerfile to run ASP.NET Core + Next.js in a single container

# Build arguments
ARG KAMAL_DEPLOY_HOST
ARG SERVICESTACK_LICENSE
ARG SERVICE_LABEL

# 1. Build .NET app + Node.js apps
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS dotnet-build
ARG KAMAL_DEPLOY_HOST
ENV KAMAL_DEPLOY_HOST=${KAMAL_DEPLOY_HOST}

WORKDIR /src

# Install Node.js for building Tailwind CSS and Next.js
RUN apt-get update \
    && apt-get install -y curl ca-certificates gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
    && apt-get install -y nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Copy solution and projects
COPY TechStacks.slnx ./
COPY NuGet.Config ./
COPY TechStacks ./TechStacks
COPY TechStacks.ServiceInterface ./TechStacks.ServiceInterface
COPY TechStacks.ServiceModel ./TechStacks.ServiceModel

# Build Tailwind CSS for .NET project
WORKDIR /src/TechStacks

# Download tailwindcss binary directly (avoiding sudo requirement in postinstall.js)
RUN curl -sLO https://github.com/tailwindlabs/tailwindcss/releases/latest/download/tailwindcss-linux-x64 \
    && chmod +x tailwindcss-linux-x64 \
    && mv tailwindcss-linux-x64 /usr/local/bin/tailwindcss
RUN npm run ui:build

# Build Next.js app
WORKDIR /src/TechStacks.Client
COPY TechStacks.Client/package*.json ./
RUN npm ci
COPY TechStacks.Client/ ./
RUN npm run build:prod

# Restore and publish .NET app
WORKDIR /src
RUN dotnet restore TechStacks/TechStacks.csproj
# Disable .NET's built-in containerization (PublishProfile=DefaultContainer) inside Docker
RUN dotnet publish TechStacks/TechStacks.csproj -c Release --no-restore -p:PublishProfile=

# 2. Runtime image with .NET + Node
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
ARG SERVICESTACK_LICENSE
ARG SERVICE_LABEL
ARG KAMAL_DEPLOY_HOST

WORKDIR /app

# Label required by Kamal, must match config/deploy.yml service
LABEL service="${SERVICE_LABEL}"

# Install Node.js >= 20.9 (Node 24.x LTS) and bash for the entrypoint script
RUN apt-get update \
    && apt-get install -y curl ca-certificates gnupg bash \
    && curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
    && apt-get install -y nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Copy published .NET app
COPY --from=dotnet-build /src/TechStacks/bin/Release/net10.0/publish ./api

# Copy built Next.js app (including dist, node_modules, public, etc.)
COPY --from=dotnet-build /src/TechStacks.Client ./client

ENV ASPNETCORE_URLS=http://0.0.0.0:8080 \
    INTERNAL_API_URL=http://127.0.0.1:8080 \
    NEXT_PORT=3000 \
    NODE_ENV=production \
    SERVICESTACK_LICENSE=$SERVICESTACK_LICENSE \
    KAMAL_DEPLOY_HOST=$KAMAL_DEPLOY_HOST

EXPOSE 8080

# Copy entrypoint script
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

ENTRYPOINT ["/usr/bin/env", "bash", "/app/entrypoint.sh"]

