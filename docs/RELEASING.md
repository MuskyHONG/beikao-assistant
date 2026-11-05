# GitHub 与版本管理

仓库：https://github.com/MuskyHONG/beikao-assistant

## 分支与标识

- main：通过检查的当前主线；开发分支使用 codex/功能名 或 feature/功能名。
- 发布标签：vMAJOR.MINOR.PATCH，未稳定阶段加 -alpha.N。初始版本为 v0.1.0-alpha.1。
- VERSION、根 package.json、web/api package.json 版本一致；锁文件同次更新，CI 校验标签一致。
- 前端显示版本；`GET /api/v1/version` 返回同一版本和能力范围。数据库版本用单独的 schema_migrations 账本，不拿应用版本替代迁移编号。
- 已发布标签不移动；修复产生新版本。服务器按 tag 拉取，便于核对实际部署内容。

## 发布步骤

1. 更新 VERSION 和所有包版本、CHANGELOG，说明完成范围、迁移与恢复要求。运行 npm install --package-lock-only 同步锁文件。
2. 运行 npm run check、npm test、npm run build；使用隔离 PostgreSQL 执行 TEST_DATABASE_URL=... npm run test:db。
3. 提交并推送 main，等 GitHub Actions CI 通过。首次公开发布还需确认没有 .env、token 或个人答卷进入跟踪列表。
4. 创建有说明的标签并推送：

```sh
git tag -a v0.1.0-alpha.1 -m "v0.1.0-alpha.1: engineering foundation"
git push origin main
git push origin v0.1.0-alpha.1
```

5. 标签触发的 CI 再次通过后，release job 用该标签生成源码 tar.gz、SHA256 校验文件与 GitHub Release；alpha/beta/rc 标签标记为 prerelease。归档不包含 node_modules、.env 或数据库数据。
6. 核对 GitHub Release、Actions 和标签指向的 commit，服务器按 DEPLOY.md 升级。不要跳过数据库备份。

上传代码不等于已经通过远程 CI；执行状态以对应提交的 Actions 为准。项目未自动修改仓库分支保护，后续如多人协作可将 CI 设为合并必需条件。发布工作流只有 release job 具有 contents:write；普通测试任务仅 contents:read。

## 获取源码

```sh
git clone --branch v0.1.0-alpha.1 --depth 1 https://github.com/MuskyHONG/beikao-assistant.git
```

也可从 GitHub Releases 下载 tar.gz 并校验 SHA256。以后仓库改为私有时，服务器使用自己的只读 deploy key 或个人授权，不把电脑上的 GitHub token 复制进项目。
