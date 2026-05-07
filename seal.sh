#!/usr/bin/env bash
set -euo pipefail

CERT="${1:-pub-cert.pem}"

if [[ ! -f "$CERT" ]]; then
  echo "Erro: certificado '$CERT' nao encontrado."
  echo "Uso: ./seal.sh [pub-cert.pem]"
  echo ""
  echo "Obtenha a chave publica do cluster:"
  echo "  scp root@IP_DA_VPS:/root/pub-cert.pem ."
  exit 1
fi

sealed=0

for env in production homolog; do
  SECRET="k8s/${env}/secret.yaml"
  SEALED="k8s/${env}/sealed-secret.yaml"

  if [[ ! -f "$SECRET" ]]; then
    echo "  [skip] $SECRET nao encontrado"
    continue
  fi

  kubeseal --cert "$CERT" --format yaml < "$SECRET" > "$SEALED"
  echo "  [ok] $SEALED"
  sealed=$((sealed + 1))
done

if [[ $sealed -eq 0 ]]; then
  echo ""
  echo "Nenhum secret.yaml encontrado. Crie a partir dos exemplos:"
  echo "  cp k8s/production/secret.yaml.example k8s/production/secret.yaml"
  echo "  cp k8s/homolog/secret.yaml.example    k8s/homolog/secret.yaml"
  echo "  # edite os valores e entao rode: ./seal.sh"
fi
