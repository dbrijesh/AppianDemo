.PHONY: dev dev-build test lint clean seed logs help

COMPOSE=docker compose
COMPOSE_FILE=docker-compose.yml

help:
	@echo "MGP Manufacturing Governance Platform"
	@echo ""
	@echo "  make dev        Start all services locally (SQLite + stub auth + Ollama)"
	@echo "  make dev-build  Rebuild images and start"
	@echo "  make seed       Seed demo data into all services"
	@echo "  make test       Run all service tests"
	@echo "  make lint       Lint all Python + TypeScript code"
	@echo "  make logs       Follow all service logs"
	@echo "  make clean      Stop and remove containers + volumes"

dev:
	@cp -n .env.example .env.local 2>/dev/null || true
	$(COMPOSE) --env-file .env.local up -d
	@echo ""
	@echo "  MGP is running at http://localhost:3000"
	@echo "  API Gateway:     http://localhost:8000"
	@echo "  Audit Core:      http://localhost:8001/docs"
	@echo "  Identity:        http://localhost:8003/docs"
	@echo "  Workflow Engine: http://localhost:8004/docs"
	@echo "  Task Service:    http://localhost:8005/docs"
	@echo "  LLM Gateway:     http://localhost:8007/docs"
	@echo ""

dev-build:
	@cp -n .env.example .env.local 2>/dev/null || true
	$(COMPOSE) --env-file .env.local up -d --build

seed:
	$(COMPOSE) exec identity python -m app.seed
	$(COMPOSE) exec workflow-engine python -m app.seed
	$(COMPOSE) exec task-service python -m app.seed

test:
	@for svc in audit-core identity esign workflow-engine task-service llm-gateway agent-service; do \
		echo "Testing $$svc..."; \
		$(COMPOSE) run --rm $$svc python -m pytest tests/ -v --tb=short || exit 1; \
	done

lint:
	@for svc in audit-core identity esign workflow-engine task-service llm-gateway agent-service; do \
		$(COMPOSE) run --rm $$svc ruff check app/ tests/; \
	done
	cd packages/ui && npm run lint

logs:
	$(COMPOSE) logs -f

clean:
	$(COMPOSE) down -v --remove-orphans
	find . -name "*.db" -delete
	find . -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true
