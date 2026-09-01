#!/bin/bash
echo "=================================================="
echo " 🔍 ESTADO DE CONTENEDORES DOCKER"
echo "=================================================="
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
echo ""
echo "=================================================="
echo " 📋 ÚLTIMOS LOGS DEL BACKEND (API)"
echo "=================================================="
API_CONTAINER=$(docker ps -q -f name=api | head -n 1)
if [ -n "$API_CONTAINER" ]; then
    docker logs "$API_CONTAINER" --tail 25
else
    echo "⚠ Contenedor API no encontrado en ejecución."
    docker logs $(docker ps -aq -f name=api | head -n 1) --tail 25 2>/dev/null || true
fi
echo ""
echo "=================================================="
echo " 🌐 COMPROBACIÓN DE CONEXIÓN"
echo "=================================================="
echo -n "  Web Login: " && curl -s -o /dev/null -w "%{http_code}\n" https://crm-salvadoraconesa.jigretera.com/login --max-time 5 || echo "ERROR"
echo -n "  Backend (/healthz): " && curl -s -o /dev/null -w "%{http_code}\n" https://crm-salvadoraconesa.jigretera.com/healthz --max-time 5 || echo "ERROR"
echo -n "  DB Check: " && curl -s https://crm-salvadoraconesa.jigretera.com/healthz/db-check --max-time 5 || echo "ERROR"
echo ""
echo "=================================================="