# 打包与试用发布

## 发布前确认

- 检查原项目作者允许的代码分发方式，以及 PRTS 数据、游戏头像和启动器图标的再分发条件。当前上游基线未找到项目级许可证。Windows 启动器内嵌网页和游戏素材，上传 EXE 也会分发这些内容。 [GitHub 许可证说明](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository)
- 在本项目单独配置 Git 提交署名。使用网名与 GitHub **Settings → Emails** 中显示的 `noreply` 地址。提交前执行 `git var GIT_AUTHOR_IDENT` 检查最终署名，推送前检查暂存区。保留上游记录。
- 创建自己账号下的空仓库 `AKSP-Toolkit`，确认仓库的可见范围和试用渠道。使用 `origin` 指向自己的仓库，保留 `upstream` 作为原项目来源。

## Windows EXE

需要 Windows x64、PowerShell、Node.js 24、npm 和 Go 1.24 或更高版本。在项目根目录执行：

```powershell
Push-Location frontend
npm ci
npm run test -- --run
Pop-Location
./launcher/build.ps1
Get-FileHash ./release/AKSP-Toolkit.exe -Algorithm SHA256
```

构建脚本执行 Vue 类型检查、前端生产构建和 Go 测试，然后将网页与多尺寸图标打包到 `release/AKSP-Toolkit.exe`。本地生成的 `release/`、`launcher/web.zip` 和前端构建目录已被 Git 忽略。

打包后用 Windows 试运行。确认双击能打开网页、数据和图标可以加载、配置可导入导出、关闭最后一个页面后进程会退出。端口若被 Vite 占用，先停掉占用该端口的进程。当前 EXE 没有 Authenticode 签名，试用者可用发布记录中的 SHA-256 比对文件。

代码提交和推送完成后，从目标仓库的 **Releases** 创建预发行版本，选择经过验证的提交创建版本标签，将 EXE 作为附件上传。发布说明写明系统要求、启动方式、已知问题和 SHA-256。 [GitHub Releases 文档](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository)

## GitHub Pages

网页试用构建使用 `frontend/dist/`。当前 Vite base 对应仓库名 `AKSP-Toolkit`。将含发布工作流的分支设为默认分支，在 **Settings → Pages → Build and deployment** 下选择 **GitHub Actions**。在 **Actions** 中手动运行 **Deploy AKSP-Toolkit to GitHub Pages**，选择要发布的分支。工作流会先运行单元测试和生产构建，再部署静态产物。 [GitHub Pages 文档](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

部署后用工作流给出的地址验证首页、`backup.html`、静态图片与 Service Worker。GitHub Pages 与本机版使用各自的浏览器存储，迁移设置用页头的 JSON 导入导出。
