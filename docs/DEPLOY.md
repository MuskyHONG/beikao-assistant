# 在自己的服务器部署

适用于 Linux + Docker Engine + Compose v2、Python3（仅交互式账号初始化工具）。v0.2.0-alpha.2 已实现服务器账号和共享题库；个人练习、目标、模拟答卷及未核验时政草稿仍在访问者浏览器。建议起步使用2核/4GB内存的单机环境，再依据真实负载调整；这不是压力测试结果。

## 首次拉取与启动

以下命令在服务器Linux Bash终端执行，账号须有Docker权限。先检查工具：

```sh
git --version
docker --version
docker compose version
python3 --version
```

容器会安装Node依赖和数据库，服务器本机无需另外安装Node.js或PostgreSQL。如果尚未安装Docker，按对应系统的[Docker官方安装说明](https://docs.docker.com/engine/install/ubuntu/)安装Engine及Compose插件；已有其他项目使用Docker时直接复用，不卸载或重装它们。

默认端口：本机开发网页43126，API43127；Docker部署仅将网页入口43128映射到宿主127.0.0.1。API和PostgreSQL不映射宿主端口。开发端口被占用会报错，不自动寻找其他端口。

```sh
git clone --branch v0.2.0-alpha.2 --depth 1 https://github.com/MuskyHONG/beikao-assistant.git
cd beikao-assistant
python3 - <<'PY'
from pathlib import Path
import secrets
target = Path('.env')
if target.exists():
    raise SystemExit('.env already exists; keep it and update it manually')
value = Path('.env.example').read_text().replace('POSTGRES_PASSWORD=\n', 'POSTGRES_PASSWORD=' + secrets.token_hex(32) + '\n', 1)
target.write_text(value)
target.chmod(0o600)
print('Created .env with a unique database password; the password was not printed.')
PY
```

上面会直接生成唯一数据库密码并写入.env，不打印密码；如果已有.env则拒绝覆盖。数据库用户名、库名首期保留beikao。也可自行复制.env.example并填写随机十六进制密码。Docker运行时忽略.env中的开发DATABASE_URL，自动构造内部数据库连接。

设置登录来源：

- 仅本机或SSH转发验证：APP_ORIGIN=http://127.0.0.1:43128，ALLOW_INSECURE_HTTP=true，TRUST_PROXY_HOPS=1。
- 公网：APP_ORIGIN=https://实际域名（不带末尾斜杠），ALLOW_INSECURE_HTTP=false。Cookie自动启用Secure。若外层还有可信Caddy/Nginx代理，TRUST_PROXY_HOPS=2，否则1；不能按客户端任意传入的Host推断可信来源。
- 修改HTTP_PORT时同步修改APP_ORIGIN。开发Vite使用http://127.0.0.1:4174及TRUST_PROXY_HOPS=0。Origin必须与浏览器地址一致，localhost与127.0.0.1是不同来源。

```sh
chmod 600 .env
docker compose up -d --build
docker compose ps -a
curl --fail http://127.0.0.1:43128/api/v1/health/ready
curl --fail http://127.0.0.1:43128/api/v1/version
```

首次构建和数据库初始化需要等待。`migrate` 容器正常状态是 Exited(0)，其余 db、api、web 应运行且健康。ready 返回 200 后访问 `http://127.0.0.1:43128`；web 仅绑定服务器本地，数据库和 API 没有宿主机端口。

成功时ready返回`{"status":"ready","version":"0.2.0-alpha.2"}`。若未就绪，先查看下列日志定位镜像下载、数据库启动或迁移失败：

```sh
docker compose logs --tail=100 migrate api web
```

远程临时查看可建立 SSH 转发：`ssh -L 43128:127.0.0.1:43128 user@server`，再在自己的电脑打开 `http://127.0.0.1:43128`。公开访问时用服务器已有的 Nginx/Caddy 将 HTTPS 域名代理到 `127.0.0.1:43128`；账号服务的公网使用必须配置HTTPS。

宿主机 Caddy 示例（替换真实域名，域名 DNS 先指向服务器）：

```caddy
beikao.example.com {
    reverse_proxy 127.0.0.1:43128
}
```

默认端口冲突时修改 `.env` 的 HTTP_PORT，再重建 web。若宿主反向代理也运行在容器里，127.0.0.1 指向代理容器本身，应配置共同 Docker 网络并将代理上游设为 web:43128；不要直接照用宿主机示例。

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

## 实际运行验收与自动测试

先通过SSH转发或HTTPS域名打开网页，使用自己初始化的管理员登录，然后依次验证：

1. 题库维护端→账号管理，创建学员账号；管理员与学员使用不同浏览器/无痕窗口。
2. 新建选择、判断、填空、简答，补齐相应答案与解析并发布；另一账号刷新题库后能看到并练习。
3. 保存一份未发布修改，学员仍看到旧版本；点击“发布修改”后才看到新版本。
4. 学员不能进入维护功能；客观题可以核对，简答显示参考供自评。退出和重新登录正常。
5. `docker compose restart api web`后账号及题库仍存在。个人目标、练习、模拟答卷本期仍在访问者浏览器，不属于云同步验收。

完整自动测试只需Docker，在项目根目录执行：

```sh
bash scripts/test-server.sh
```

它会独立构建测试镜像并启动临时PostgreSQL，运行依赖公告检查、类型检查、20项单元/原型规则测试、前后端构建、真实数据库权限/版本/CLI测试；全部通过退出码为0。每次使用独立Compose项目名，不读取.env、不映射任何宿主端口、不挂载业务卷，完成后自动清理自身测试容器与网络。第一次需要下载镜像和依赖。

跨账号的真实浏览器测试另外在[GitHub Actions](https://github.com/MuskyHONG/beikao-assistant/actions)自动执行，覆盖四题型、发布/草稿、历史、自评、改密与退出。`npm run test:e2e`使用合成账号，不应直接对真实业务站点执行；日常服务器验收按上面的人工步骤即可。

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

先备份数据库，阅读目标版本CHANGELOG并记录旧tag。保留已有.env，不再执行首次初始化命令。若升级自alpha.1，更新HTTP_PORT=43128，PORT=43127、WEB_DEV_PORT=43126；APP_ORIGIN仅在原本为本机旧地址时改为http://127.0.0.1:43128，已有HTTPS域名保持原域名。同步外层反向代理的上游端口，数据库密码不变。

```sh
git fetch origin --tags
git checkout v0.2.0-alpha.2
docker compose build
docker compose up -d --force-recreate migrate api web
docker compose ps -a
curl --fail http://127.0.0.1:43128/api/v1/health/ready
curl --fail http://127.0.0.1:43128/api/v1/version
```

按镜像构建、数据库健康、一次性迁移、API 健康、web 启动的顺序进行。迁移失败时不会启动依赖它的新 API；检查 `docker compose logs migrate`。对已有迁移不允许改文件，校验不一致会拒绝继续。

当前为单机部署，不承诺零停机。后续数据库迁移应采用兼容旧 API 的扩展/收缩步骤。不能只 checkout 旧代码就认为数据库也回退；先根据发布说明确认兼容性，不自动执行破坏性 down migration。

从0.1升级到0.2时，先备份，补充APP_ORIGIN、ALLOW_INSECURE_HTTP、TRUST_PROXY_HOPS，新增002迁移由migrate容器执行。首次建立管理员，选择是否导入样例。匿名原型localStorage记录不自动归入任何账号；新版本个人记录按账号隔离，不覆盖旧版本浏览器键。

## 在新环境验证恢复

使用独立新目录、独立 Compose 项目名和新端口，不能覆盖正在使用的生产数据库。以下示例的 `.env` 先按首次启动配置好，`backups/checked.dump` 是待验证备份：

```sh
HTTP_PORT=43129 docker compose -p beikao-restore up -d db
# 等待新 db 健康后：
docker compose -p beikao-restore exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --exit-on-error --no-owner' < backups/checked.dump
HTTP_PORT=43129 docker compose -p beikao-restore up -d --build
curl --fail http://127.0.0.1:43129/api/v1/health/ready
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

Vite 在 43126 端口代理 /api 到 43127；无需更改生产地址。不要把生产数据库连接用于开发集成测试。
