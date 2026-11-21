// Command server is the entrypoint of the inlineNotes sync server.
//
// Behaviour (docs/specs/sync-server.md -> Rules / Semantics -> "Startup"):
//   - read configuration from the environment (`DATABASE_URL`, `PORT`);
//   - wait for PostgreSQL to accept connections (the compose healthcheck is not
//     the only guard: the server retries, so a cold start never dies);
//   - apply the embedded migrations (idempotent, AC 4);
//   - serve the HTTP API with a permissive CORS policy and no authentication
//     (ruling A158).
//
// The binary is static and the image is a scratch of `alpine` + one file, which is
// what keeps the final stage under the 40 MB of AC 2.
package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"inlinenotes/server/internal/api"
	"inlinenotes/server/internal/store"
)

const (
	defaultPort          = "8080"
	defaultDatabaseURL   = "postgres://inlinenotes:inlinenotes@localhost:5432/inlinenotes?sslmode=disable"
	startupRetryInterval = time.Second
	startupRetryAttempts = 60
	shutdownGrace        = 10 * time.Second
	readHeaderTimeout    = 10 * time.Second
)

func main() {
	logger := log.New(os.Stdout, "server ", log.LstdFlags|log.LUTC)
	if err := run(logger); err != nil {
		logger.Printf("fatal: %v", err)
		os.Exit(1)
	}
}

func run(logger *log.Logger) error {
	databaseURL := envOr("DATABASE_URL", defaultDatabaseURL)
	port := envOr("PORT", defaultPort)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	repository, err := openWithRetry(ctx, databaseURL, logger)
	if err != nil {
		return err
	}
	defer repository.Close()

	if err := repository.Migrate(ctx); err != nil {
		return err
	}
	logger.Printf("schema ready")

	handler := api.New(repository, logger)
	httpServer := &http.Server{
		Addr:              ":" + port,
		Handler:           handler,
		ReadHeaderTimeout: readHeaderTimeout,
	}

	serverErr := make(chan error, 1)
	go func() {
		logger.Printf("listening on :%s", port)
		if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			serverErr <- err
			return
		}
		serverErr <- nil
	}()

	select {
	case err := <-serverErr:
		return err
	case <-ctx.Done():
		logger.Printf("shutdown requested")
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownGrace)
	defer cancel()
	if err := httpServer.Shutdown(shutdownCtx); err != nil {
		return err
	}
	return <-serverErr
}

// openWithRetry waits for the database to come up. `docker compose up` starts both
// services at once, so the first attempts legitimately fail (`AC 3`).
func openWithRetry(ctx context.Context, databaseURL string, logger *log.Logger) (*store.Store, error) {
	var lastErr error
	for attempt := 1; attempt <= startupRetryAttempts; attempt++ {
		repository, err := store.New(ctx, databaseURL)
		if err == nil {
			return repository, nil
		}
		lastErr = err
		logger.Printf("database not ready (attempt %d/%d): %v", attempt, startupRetryAttempts, err)
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(startupRetryInterval):
		}
	}
	return nil, lastErr
}

func envOr(name, fallback string) string {
	if value := os.Getenv(name); value != "" {
		return value
	}
	return fallback
}
