# 在自己的服务器部署

适用于 Linux + Docker Engine + Compose v2、Python3（仅交互式账号初始化工具）。v0.2.0-alpha.1 已实现服务器账号和共享题库；个人练习、目标、模拟答卷及未核验时政草稿仍在访问者浏览器。建议起步使用2核/4GB内存的单机环境，再依据真实负载调整；这不是压力测试结果。

## 首次拉取与启动

```sh
git clone https://github.com/MuskyHONG/beikao-assistant.git
cd beikao-assistant
git checkout v0.2.0-alpha.1
cp .env.example .env
openssl rand -hex 32
```

将上一步生成的随机字符串填入 `.env` 的 `POSTGRES_PASSWORD`，不要使用示例占位符。数据库用户名、库名首期保留 beikao；密码使用十六进制字符串，避免连接 URL 的特殊字符转义。`.env` 只保存在服务器本机，不上传。

设置登录来源：

- 仅本机或SSH转发验证：APP_ORIGIN=http://127.0.0.1:8080，ALLOW_INSECURE_HTTP=true，TRUST_PROXY_HOPS=1。
- 公网：APP_ORIGIN=https://实际域名（不带末尾斜杠），ALLOW_INSECURE_HTTP=false。Cookie自动启用Secure。若外层还有可信Caddy/Nginx代理，TRUST_PROXY_HOPS=2，否则1；不能按客户端任意传入的Host推断可信来源。
- 修改HTTP_PORT时同步修改APP_ORIGIN。开发Vite使用http://127.0.0.1:4174及TRUST_PROXY_HOPS=0。Origin必须与浏览器地址一致，localhost与127.0.0.1是不同来源。

```sh
chmod 600 .env
docker compose up -d --build
docker compose ps -a
curl --fail http://127.0.0.1:8080/api/v1/health/ready
curl --fail http://127.0.0.1:8080/api/v1/version
```

首次构建和数据库初始化需要等待。`migrate` 容器正常状态是 Exited(0)，其余 db、api、web 应运行且健康。ready 返回 200 后访问 `http://127.0.0.1:8080`；web 仅绑定服务器本地，数据库和 API 没有宿主机端口。

远程临时查看可建立 SSH 转发：`ssh -L 8080:127.0.0.1:8080 user@server`，再在自己的电脑打开 `http://127.0.0.1:8080`。公开访问时用服务器已有的 Nginx/Caddy 将 HTTPS 域名代理到 `127.0.0.1:8080`；账号服务的公网使用必须配置HTTPS。

宿主机 Caddy 示例（替换真实域名，域名 DNS 先指向服务器）：

```caddy
beikao.example.com {
    reverse_proxy 127.0.0.1:8080
}
```

默认端口冲突时修改 `.env` 的 HTTP_PORT，再重建 web。若宿主反向代理也运行在容器里，127.0.0.1 指向代理容器本身，应配置共同 Docker 网络并将代理上游设为 web:8080；不要直接照用宿主机示例。

## 初始化管理员、题库和账号

服务健康后执行以下命令，交互输入邮箱、显示姓名和至少12位密码；密码不会回显、进入命令参数或Shell历史。

```sh
python3 scripts/account-input.py bootstrap | docker compose exec -T api node apps/api/dist/bootstrap.js
```

只允许数据库还没有任何账号时执行；重复初始化拒绝覆盖已有管理员。随后通过APP_ORIGIN所配置的地址登录，进入题库维护端→账号管理开通学员/维护者。维护者可以发布内容，不能管理账号；学员访问维护接口会被服务器拒绝。账号停用和改密会撤销会话，默认会话有效168小时。

题库初始为空。可自行录题，或在空题库导入已确认原型的11道教学样例（含变式，非官方试题）：

```sh
docker compose exec -T api node apps/api/dist/seed-demo.js
```

该导入在事务内一次完成，非空题库拒绝执行，不覆盖任何现有内容。日常内容维护使用网页，不反复执行导入。

忘记密码时，由有服务器权限的管理员执行：

```sh
python3 scripts/account-input.py reset | docker compose exec -T api node apps/api/dist/reset-password.js
```

重置撤销该用户全部会话并记录server_cli审计。此版本不发送邀请邮件或密码重置邮件；登录后用户可通过右上角“修改密码”更换初始密码。

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

从0.1升级到0.2时，先备份，补充APP_ORIGIN、ALLOW_INSECURE_HTTP、TRUST_PROXY_HOPS，新增002迁移由migrate容器执行。首次建立管理员，选择是否导入样例。匿名原型localStorage记录不自动归入任何账号；新版本个人记录按账号隔离，不覆盖旧版本浏览器键。

## 在新环境验证恢复

使用独立新目录、独立 Compose 项目名和新端口，不能覆盖正在使用的生产数据库。以下示例的 `.env` 先按首次启动配置好，`backups/checked.dump` 是待验证备份：

```sh
HTTP_PORT=8081 docker compose -p beikao-restore up -d db
# 等待新 db 健康后：
docker compose -p beikao-restore exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --exit-on-error --no-owner' < backups/checked.dump
HTTP_PORT=8081 docker compose -p beikao-restore up -d --build
curl --fail http://127.0.0.1:8081/api/v1/health/ready
```

恢复目标应为空数据库。验证迁移账本、users、questions、question_revisions和question_publications数量，使用恢复的账号检查权限及版本历史后再计划切换。备份含账号哈希与会话，按敏感数据管理；切换前可撤销全部旧sessions，强制重新登录。当前个人答卷在浏览器，不在pg_dump中。

## 开发时启动 API

安装 Node.js 24 后在仓库根执行 `npm ci`。准备单独的 PostgreSQL 开发库，复制 `.env.example` 为 `.env`，将 DATABASE_URL 填为可访问的开发库连接，密码中的特殊字符需 URL 编码，然后：

```sh
npm run db:migrate
python3 scripts/account-input.py bootstrap | npm run db:bootstrap
npm run dev:api
# 另一个终端
npm run dev:web
```

Vite 在 4174 端口代理 /api 到 3000；无需更改生产地址。不要把生产数据库连接用于开发集成测试。
