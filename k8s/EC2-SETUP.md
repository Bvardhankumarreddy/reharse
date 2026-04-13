# Rehearse — EC2 + Kubernetes Setup Guide
# Domain: inferix.in

---

## 1. Launch EC2 Instance

**AWS Console → EC2 → Launch Instance**

| Setting | Value |
|---------|-------|
| AMI | Ubuntu 22.04 LTS (Jammy) |
| Instance type | t3.xlarge (4 vCPU, 16GB RAM) |
| Storage | 50 GB gp3 |
| Security Group | ports 22, 80, 443 open |
| Key pair | create/select your key pair |

---

## 2. Point inferix.in to EC2

After launch, copy the **Elastic IP** (allocate one if needed):
**EC2 → Elastic IPs → Allocate → Associate to instance**

Then in **GoDaddy DNS → inferix.in**:

| Type | Name | Value |
|------|------|-------|
| A | @ | `<EC2 Elastic IP>` |
| A | www | `<EC2 Elastic IP>` |

---

## 3. SSH into EC2 and install dependencies

```bash
ssh -i your-key.pem ubuntu@<EC2-IP>

# System update
sudo apt update && sudo apt upgrade -y

# Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker ubuntu
newgrp docker

# kubectl
curl -LO "https://dl.k8s.io/release/$(curl -Ls https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
sudo install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl

# k3s (lightweight Kubernetes — single node)
curl -sfL https://get.k3s.io | sh -

# Allow ubuntu user to use kubectl
mkdir -p ~/.kube
sudo cp /etc/rancher/k3s/k3s.yaml ~/.kube/config
sudo chown ubuntu:ubuntu ~/.kube/config
export KUBECONFIG=~/.kube/config

# Verify
kubectl get nodes
```

---

## 4. Install Nginx Ingress + cert-manager

```bash
# Nginx Ingress Controller
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/baremetal/deploy.yaml

# cert-manager (Let's Encrypt SSL)
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/latest/download/cert-manager.yaml

# Wait for cert-manager to be ready
kubectl wait --namespace cert-manager \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/instance=cert-manager \
  --timeout=120s
```

---

## 5. Build and push Docker images

On your **local machine**, build and push to Docker Hub (or ECR):

```bash
# Login to Docker Hub
docker login

# Build images
docker build -t bhopathivardhan1/rehearse-api:latest ./api
docker build -t bhopathivardhan1/rehearse-web:latest \
  --build-arg NEXT_PUBLIC_API_URL=https://inferix.in/api/v1 \
  --build-arg NEXT_PUBLIC_APP_URL=https://inferix.in \
  ./web
docker build -t bhopathivardhan1/rehearse-ai-engine:latest ./ai-engine

# Push
docker push bhopathivardhan1/rehearse-api:latest
docker push bhopathivardhan1/rehearse-web:latest
docker push bhopathivardhan1/rehearse-ai-engine:latest
```

Update image names in k8s/base/05-ai-engine.yaml, 06-api.yaml, 07-web.yaml:
```yaml
image: bhopathivardhan1/rehearse-api:latest
```

---

## 6. Fill in secrets

On your **local machine**, encode each value:

```bash
echo -n "your_value" | base64
```

Fill every `<base64>` in `k8s/base/01-secrets.yaml` with the encoded values:

| Secret | Value to encode |
|--------|----------------|
| POSTGRES_PASSWORD | strong random password |
| BETTER_AUTH_SECRET | `openssl rand -hex 32` |
| GOOGLE_CLIENT_ID | from Google Console |
| GOOGLE_CLIENT_SECRET | from Google Console |
| GITHUB_CLIENT_ID | from GitHub |
| GITHUB_CLIENT_SECRET | from GitHub |
| GOOGLE_STATE_SECRET | `openssl rand -hex 32` |
| ANTHROPIC_API_KEY | sk-ant-... |
| OPENAI_API_KEY | optional |
| RAZORPAY_KEY_ID | rzp_live_... |
| RAZORPAY_KEY_SECRET | from Razorpay |
| RAZORPAY_PLAN_WEEKLY | plan_... |
| RAZORPAY_PLAN_MONTHLY | plan_... |
| RAZORPAY_PLAN_YEARLY | plan_... |
| RAZORPAY_WEBHOOK_SECRET | from Razorpay |
| STORAGE_LAMBDA_SECRET | your Lambda secret |

---

## 7. Deploy to Kubernetes

Copy manifests to EC2:
```bash
scp -i your-key.pem -r k8s/ ubuntu@<EC2-IP>:~/rehearse-k8s/
```

On EC2:
```bash
cd ~/rehearse-k8s

# Apply everything
kubectl apply -k base/

# Watch pods come up
kubectl get pods -n rehearse -w
```

Expected output after ~2 minutes:
```
NAME                         READY   STATUS    RESTARTS
postgres-0                   1/1     Running   0
redis-0                      1/1     Running   0
ai-engine-xxx                1/1     Running   0
api-xxx                      1/1     Running   0
api-xxx                      1/1     Running   0
web-xxx                      1/1     Running   0
web-xxx                      1/1     Running   0
```

---

## 8. Expose Nginx Ingress on port 80/443

k3s uses a different ingress setup. Patch it to use host ports:

```bash
kubectl patch svc ingress-nginx-controller \
  -n ingress-nginx \
  -p '{"spec":{"type":"NodePort","ports":[{"port":80,"nodePort":80,"protocol":"TCP","name":"http"},{"port":443,"nodePort":443,"protocol":"TCP","name":"https"}]}}'
```

---

## 9. Verify SSL certificate issued

```bash
kubectl get certificate -n rehearse
# Should show READY = True after ~2 minutes

kubectl describe certificate rehearse-tls -n rehearse
```

---

## 10. Run DB migration

```bash
kubectl run migrate --rm -it \
  --image=bhopathivardhan1/rehearse-web:latest \
  --restart=Never \
  --env="DATABASE_URL=postgresql://rehearse:<password>@postgres-svc:5432/rehearse" \
  --env="BETTER_AUTH_SECRET=<secret>" \
  --env="BETTER_AUTH_URL=https://inferix.in" \
  -n rehearse \
  -- npx @better-auth/cli migrate --yes
```

---

## 11. Verify everything works

```bash
# Health checks
curl https://inferix.in/api/v1/health
curl https://inferix.in/pricing

# Check all pods healthy
kubectl get pods -n rehearse

# Check HPA
kubectl get hpa -n rehearse

# Logs
kubectl logs -n rehearse deployment/api --tail=50
kubectl logs -n rehearse deployment/web --tail=50
```

---

## Useful commands

```bash
# Restart a deployment
kubectl rollout restart deployment/api -n rehearse

# Scale manually
kubectl scale deployment/api --replicas=3 -n rehearse

# Update image after new build
kubectl set image deployment/api api=bhopathivardhan1/rehearse-api:latest -n rehearse

# View all resources
kubectl get all -n rehearse

# Delete everything (nuclear)
kubectl delete namespace rehearse
```
