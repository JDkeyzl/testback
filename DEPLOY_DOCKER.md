## 部署指南（Docker 版）

本项目已提供 docker-compose 一键部署。以下为在阿里云 Linux（RHEL 系）服务器上的快速安装脚本与使用步骤。

### 1) 安装 Docker 与 Docker Compose

将以下脚本保存为 `install_docker.sh`，赋权并执行：

```bash
#!/bin/bash
set -e

echo ">>> [1/5] 安装依赖工具..."
sudo yum install -y yum-utils device-mapper-persistent-data lvm2

echo ">>> [2/5] 添加阿里云 Docker 源..."
if ! sudo yum-config-manager --add-repo http://mirrors.aliyun.com/docker-ce/linux/centos/docker-ce.repo; then
    echo "添加阿里云源失败，尝试使用官方源..."
    sudo yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
fi

echo ">>> [3/5] 安装 Docker Engine..."
sudo yum install -y docker-ce docker-ce-cli containerd.io

echo ">>> [4/5] 启动 Docker 并设置开机启动..."
sudo systemctl enable --now docker

echo ">>> [5/5] 安装 Docker Compose 插件..."
PLUGIN_DIR="$HOME/.docker/cli-plugins"
mkdir -p $PLUGIN_DIR
if [ ! -f "$PLUGIN_DIR/docker-compose" ]; then
    echo "未检测到 docker-compose，开始下载..."
    curl -SL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-$(uname -m) \
        -o $PLUGIN_DIR/docker-compose
    chmod +x $PLUGIN_DIR/docker-compose
else
    echo "检测到已存在 docker-compose，跳过下载。"
fi

echo ">>> 验证安装结果..."
docker --version
docker compose version

echo ">>> 安装完成！你现在可以使用 docker 和 docker compose 了 🚀"
```

执行：

```bash
chmod +x install_docker.sh
./install_docker.sh
```

可选：配置镜像加速（/etc/docker/daemon.json），示例：

```json
{
  "registry-mirrors": [
    "https://414w94f4.mirror.aliyuncs.com",
    "https://docker.m.daocloud.io",
    "https://mirror.ccs.tencentyun.com",
    "https://hub-mirror.c.163.com"
  ]
}
```

重启 Docker：

```bash
sudo systemctl daemon-reload && sudo systemctl restart docker
```

### 2) 构建与运行

```bash
git clone <your-repo>
cd testback
docker compose build
docker compose up -d
```

默认端口：前端 8080、后端 8000。

### 3) 访问与验证

- 前端：`http://<你的公网IP>:8080`
- 后端健康检查：`curl http://<你的公网IP>:8000/api/v1/health`

### 4) 常见问题

- 拉取基础镜像超时：配置镜像加速，或在 Dockerfile 中将基础镜像替换为你的加速域前缀（如 `414w94f4.mirror.aliyuncs.com/library/python:3.11-slim`）。
- 权限：执行 `sudo usermod -aG docker $USER && newgrp docker`，避免每次都用 sudo。


