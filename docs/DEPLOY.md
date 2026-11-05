# 在自己的服务器部署

适用于 Linux + Docker Engine + Compose v2。当前标签为工程预览：前端仍使用浏览器存储，部署 PostgreSQL 不会自动让当前界面变成共享题库。正式业务随后续版本接入。

## 首次拉取与启动

```sh
git clone https://github.com/MuskyHONG/beikao-assistant.git
cd beikao-assistant
git checkout v0.1.0-alpha.1
cp .env.example .env
openssl rand -hex 32
```

将上一步生成的随机字符串填入 `.env` 的 `POSTGRES_PASSWORD`，不要使用示例占位符。数据库用户名、库名首期保留 beikao；密码使用十六进制字符串，避免连接 URL 的特殊字符转义。`.env` 只保存在服务器本机，不上传。

```sh
chmod 600 .env
docker compose up -d --build
docker compose ps -a
curl --fail http://127.0.0.1:8080/api/v1/health/ready
curl --fail http://127.0.0.1:8080/api/v1/version
```

首次构建和数据库初始化需要等待。`migrate` 容器正常状态是 Exited(0)，其余 db、api、web 应运行且健康。ready 返回 200 后访问 `http://127.0.0.1:8080`；web 仅绑定服务器本地，数据库和 API 没有宿主机端口。

远程临时查看可建立 SSH 转发：`ssh -L 8080:127.0.0.1:8080 user@server`，再在自己的电脑打开 `http://127.0.0.1:8080`。公开访问时用服务器已有的 Nginx/Caddy 将 HTTPS 域名代理到 `127.0.0.1:8080`，不要把 PostgreSQL 暴露出去。账号功能接入的版本要求 HTTPS；当前版本没有登录接口。

宿主机 Caddy 示例（替换真实域名，域名 DNS 先指向服务器）：

```caddy
beikao.example.com {
    reverse_proxy 127.0.0.1:8080
}
```

默认端口冲突时修改 `.env` 的 HTTP_PORT，再重建 web。若宿主反向代理也运行在容器里，127.0.0.1 指向代理容器本身，应配置共同 Docker 网络并将代理上游设为 web:8080；不要直接照用宿主机示例。

## 持久化与备份

数据库保存在 Compose 的 postgres-data 命名卷中。普通 `docker compose down` 不删卷；不要使用 `down -v` 清理有业务数据的服务器。前端目前的 localStorage 位于访问者浏览器，不在数据库备份里。

以下备份命令在服务器 Linux shell 运行：

```sh
mkdir -p backups
chmod 700 backups
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "backups/beikao-$(date +%Y%m%d-%H%M%S).dump"
```

核对命令退出码和文件大小，再将备份复制到另一台机器或独立存储。保留部署 tag、`.env` 的安全副本和备份日期；定时备份是服务器运维任务，仓库 CI 不备份业务库。

## 更新到新版本

先备份数据库，阅读目标版本 CHANGELOG 和迁移说明，记录旧 tag。使用已发布 tag，避免让服务器直接跟随尚未验证的 main。

```sh
git fetch origin --tags
git checkout <目标版本标签>
docker compose build
docker compose up -d --force-recreate migrate api web
docker compose ps -a
curl --fail http://127.0.0.1:8080/api/v1/health/ready
curl --fail http://127.0.0.1:8080/api/v1/version
```

按镜像构建、数据库健康、一次性迁移、API 健康、web 启动的顺序进行。迁移失败时不会启动依赖它的新 API；检查 `docker compose logs migrate`。对已有迁移不允许改文件，校验不一致会拒绝继续。

当前为单机部署，不承诺零停机。后续数据库迁移应采用兼容旧 API 的扩展/收缩步骤。不能只 checkout 旧代码就认为数据库也回退；先根据发布说明确认兼容性，不自动执行破坏性 down migration。

## 在新环境验证恢复

使用独立新目录、独立 Compose 项目名和新端口，不能覆盖正在使用的生产数据库。以下示例的 `.env` 先按首次启动配置好，`backups/checked.dump` 是待验证备份：

```sh
HTTP_PORT=8081 docker compose -p beikao-restore up -d db
# 等待新 db 健康后：
docker compose -p beikao-restore exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --exit-on-error --no-owner' < backups/checked.dump
HTTP_PORT=8081 docker compose -p beikao-restore up -d --build
curl --fail http://127.0.0.1:8081/api/v1/health/ready
```

恢复目标应为空数据库。验证迁移版本、题库与答卷数量后再计划切换；本期尚无业务表，后续上线必须把真实数据恢复验收加入发布流程。

## 开发时启动 API

安装 Node.js 24 后在仓库根执行 `npm ci`。准备单独的 PostgreSQL 开发库，复制 `.env.example` 为 `.env`，将 DATABASE_URL 填为可访问的开发库连接，密码中的特殊字符需 URL 编码，然后：

```sh
npm run db:migrate
npm run dev:api
# 另一个终端
npm run dev:web
```

Vite 在 4174 端口代理 /api 到 3000；无需更改生产地址。不要把生产数据库连接用于开发集成测试。
