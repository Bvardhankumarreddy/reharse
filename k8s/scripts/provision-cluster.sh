#!/usr/bin/env bash
# ── Rehearse — Provision a new k3s cluster on an EC2 instance ─────────────────
#
# Usage:
#   ./provision-cluster.sh <project> <ec2-ip> <path-to-pem>
#
# Example:
#   ./provision-cluster.sh rehearse 13.233.x.x ~/.ssh/my-key.pem
#   ./provision-cluster.sh karigari 15.206.x.x ~/.ssh/my-key.pem
#
# What it does:
#   1. SSHs into the EC2 instance
#   2. Installs Docker, kubectl, k3s
#   3. Installs Nginx Ingress + cert-manager
#   4. Copies kubeconfig back to your local machine as ~/.kube/<project>.yaml
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

PROJECT=${1:?"Usage: $0 <project> <ec2-ip> <pem-file>"}
EC2_IP=${2:?"Usage: $0 <project> <ec2-ip> <pem-file>"}
PEM=${3:?"Usage: $0 <project> <ec2-ip> <pem-file>"}

SSH="ssh -i $PEM -o StrictHostKeyChecking=no ubuntu@$EC2_IP"

echo "━━━ Provisioning cluster: $PROJECT on $EC2_IP ━━━"

# ── 1. System deps ─────────────────────────────────────────────────────────────
echo "→ Installing system dependencies..."
$SSH "sudo apt-get update -q && sudo apt-get upgrade -y -q"

# ── 2. Docker ──────────────────────────────────────────────────────────────────
echo "→ Installing Docker..."
$SSH "curl -fsSL https://get.docker.com | sh && sudo usermod -aG docker ubuntu"

# ── 3. k3s ─────────────────────────────────────────────────────────────────────
echo "→ Installing k3s..."
$SSH "curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC='--disable traefik' sh -"
$SSH "mkdir -p ~/.kube && sudo cp /etc/rancher/k3s/k3s.yaml ~/.kube/config && sudo chown ubuntu:ubuntu ~/.kube/config"

# ── 4. kubectl ────────────────────────────────────────────────────────────────
echo "→ Installing kubectl..."
$SSH "curl -sLO https://dl.k8s.io/release/\$(curl -Ls https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl && sudo install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl && rm kubectl"

# ── 5. Nginx Ingress ──────────────────────────────────────────────────────────
echo "→ Installing Nginx Ingress Controller..."
$SSH "kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/baremetal/deploy.yaml"
$SSH "kubectl wait --namespace ingress-nginx --for=condition=ready pod --selector=app.kubernetes.io/component=controller --timeout=120s"

# Expose ingress on host ports 80 + 443
$SSH "kubectl patch svc ingress-nginx-controller -n ingress-nginx -p '{\"spec\":{\"type\":\"NodePort\",\"ports\":[{\"port\":80,\"nodePort\":80,\"protocol\":\"TCP\",\"name\":\"http\"},{\"port\":443,\"nodePort\":443,\"protocol\":\"TCP\",\"name\":\"https\"}]}}'"

# ── 6. cert-manager ───────────────────────────────────────────────────────────
echo "→ Installing cert-manager..."
$SSH "kubectl apply -f https://github.com/cert-manager/cert-manager/releases/latest/download/cert-manager.yaml"
$SSH "kubectl wait --namespace cert-manager --for=condition=ready pod --selector=app.kubernetes.io/instance=cert-manager --timeout=120s"

# ── 7. Copy kubeconfig locally ────────────────────────────────────────────────
echo "→ Copying kubeconfig to ~/.kube/$PROJECT.yaml..."
$SSH "cat ~/.kube/config" \
  | sed "s/127.0.0.1/$EC2_IP/g" \
  | sed "s/default/$PROJECT/g" \
  > ~/.kube/$PROJECT.yaml

chmod 600 ~/.kube/$PROJECT.yaml

echo ""
echo "✅ Cluster '$PROJECT' ready!"
echo ""
echo "To use this cluster:"
echo "  export KUBECONFIG=~/.kube/$PROJECT.yaml"
echo "  kubectl get nodes"
echo ""
echo "To deploy Rehearse:"
echo "  export KUBECONFIG=~/.kube/$PROJECT.yaml"
echo "  kubectl apply -k k8s/clusters/$PROJECT/"
