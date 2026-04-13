#!/usr/bin/env bash
# ── Rehearse — Deploy a project to its cluster ────────────────────────────────
#
# Usage:
#   ./deploy.sh <project>
#
# Example:
#   ./deploy.sh rehearse
#   ./deploy.sh karigari
#
# Requires: ~/.kube/<project>.yaml to exist (created by provision-cluster.sh)
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

PROJECT=${1:?"Usage: $0 <project>"}
KUBECONFIG_PATH=~/.kube/$PROJECT.yaml

if [ ! -f "$KUBECONFIG_PATH" ]; then
  echo "❌ No kubeconfig found at $KUBECONFIG_PATH"
  echo "   Run provision-cluster.sh first."
  exit 1
fi

export KUBECONFIG=$KUBECONFIG_PATH

echo "━━━ Deploying $PROJECT ━━━"
echo "→ Cluster: $(kubectl config current-context)"
echo "→ Nodes:   $(kubectl get nodes --no-headers | wc -l)"

kubectl apply -k k8s/clusters/$PROJECT/

echo ""
echo "→ Waiting for pods..."
kubectl wait --for=condition=ready pod \
  --selector=app \
  --namespace=$PROJECT \
  --timeout=180s 2>/dev/null || true

echo ""
kubectl get pods -n $PROJECT
echo ""
echo "✅ Deployed $PROJECT"
