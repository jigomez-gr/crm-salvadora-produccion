#!/usr/bin/env bash
# Script de prueba rápida para el microservicio C# o el endpoint de NestJS

PHONE="34611223344"
MSG="Prueba de mensaje Zadarma SMS Salvadora CRM"

echo "=== 1. Prueba contra el endpoint C# (localhost:5005) ==="
curl -X POST "http://localhost:5005/api/sms/send" \
  -H "Content-Type: application/json" \
  -d "{\"number\":\"$PHONE\", \"message\":\"$MSG\"}"

echo -e "\n\n=== 2. Prueba contra el endpoint NestJS CRM (localhost:3000) ==="
curl -X POST "http://localhost:3000/api/sms/send" \
  -H "Content-Type: application/json" \
  -d "{\"number\":\"$PHONE\", \"message\":\"$MSG\"}"
