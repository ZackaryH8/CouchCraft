# syntax=docker/dockerfile:1.4
ARG BASE_APP_IMAGE=ghcr.io/games-on-whales/base-app:edge

# hadolint ignore=DL3006
FROM ${BASE_APP_IMAGE}

ARG DEBIAN_FRONTEND=noninteractive

COPY couchcraft.deb /tmp/couchcraft.deb

# apt-get install resolves deb dependencies automatically
RUN apt-get update -y && \
    apt-get install -y --no-install-recommends /tmp/couchcraft.deb && \
    rm /tmp/couchcraft.deb && \
    rm -rf /var/lib/apt/lists/*

COPY --chmod=777 scripts/startup.sh /opt/gow/startup-app.sh

ENV XDG_RUNTIME_DIR=/tmp/.X11-unix
ENV GDK_SCALE=1
ENV GDK_DPI_SCALE=1

ARG IMAGE_SOURCE
LABEL org.opencontainers.image.source=$IMAGE_SOURCE
LABEL org.opencontainers.image.title="CouchCraft"
LABEL org.opencontainers.image.description="10-foot Minecraft launcher for the couch"
