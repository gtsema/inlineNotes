# Multi-stage build of the inlineNotes sync server.
#
# Stage 1 compiles a static binary; stage 2 is `alpine` plus that one file, which
# is what keeps the final image far below the 40 MB of AC 2.
#
# The module cache is mounted as a BuildKit cache, so a rebuild after a source edit
# does not re-download pgx.

# ------------------------------- build ------------------------------------
FROM golang:1.25-alpine AS build

WORKDIR /src

# Dependencies first: this layer is cached until go.mod/go.sum change.
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod \
    go mod download

COPY . .

# CGO off: the binary is static, so the runtime stage needs no libc compatibility
# beyond the musl that alpine already has.
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=linux go build \
        -trimpath \
        -ldflags='-s -w -extldflags "-static"' \
        -o /out/server ./cmd/server

# ------------------------------ runtime -----------------------------------
FROM alpine:3.21 AS runtime

RUN apk add --no-cache ca-certificates wget \
    && adduser -D -H -u 10001 appuser

COPY --from=build /out/server /usr/local/bin/server

USER appuser

ENV PORT=8080

EXPOSE 8080

# The compose healthcheck uses the same endpoint; this one makes `docker run`
# useful on its own.
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
    CMD wget --no-verbose --tries=1 --spider "http://127.0.0.1:${PORT}/health" || exit 1

ENTRYPOINT ["/usr/local/bin/server"]
