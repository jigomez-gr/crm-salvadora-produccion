#!/bin/bash
echo "=================================================="
echo " 🚀 ARRANCANDO SERVICIOS CRM SALVADORA"
echo "=================================================="
docker network create dokploy-network 2>/dev/null || true
git fetch origin main && git reset --hard origin/main
if [ -f "docker-compose.prod.yml" ]; then
    docker compose -f docker-compose.prod.yml up -d --build --force-recreate --remove-orphans
else
    docker compose up -d --build --force-recreate --remove-orphans
fi
echo ""
echo "⏳ Esperando 8 segundos a que inicialicen los servicios..."
sleep 8
echo ""
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
echo ""
echo "=================================================="