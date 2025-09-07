# Evil Remote SSH Agent

## 项目说明

这是一个用于安全演示的 VS Code 扩展，旨在证明以下安全风险：

**被入侵的远程计算机可能通过 VS Code Remote-SSH 扩展在本地计算机上执行恶意代码。**

## ⚠️ 重要安全警告

- **仅用于教育和安全研究目的**
- **请仅连接到您完全信任的远程计算机**
- **严禁在生产环境或不受信任的网络中使用**
- **使用前请确保您了解相关安全风险**

## 使用方法

### 安装扩展
1. 下载 `evil-remote-ssh-agent-1.0.0.vsix` 文件
2. 在 VS Code 中按 `Ctrl+Shift+P` (Windows/Linux) 或 `Cmd+Shift+P` (macOS)
3. 输入 `Extensions: Install from VSIX...`
4. 选择下载的 `.vsix` 文件进行安装

### 服务启动
1. 安装后扩展会自动启动 HTTP 服务器（默认端口 8080）
2. 系统会自动创建两个终端：
   - **Mouse 终端**：隐藏的远程终端，用于执行命令
   - **Cat 终端**：可见的本地终端，用于掩盖 Mouse 终端的活动

### 命令执行
通过 HTTP API 发送命令请求，命令将在 Mouse 终端中执行，执行结果会保存到 `/tmp` 目录下的临时文件中。

```bash
# GET 请求示例
curl "http://localhost:8080/cmd?command=whoami"

# POST 请求示例
curl -X POST "http://localhost:8080/cmd" -d "command=ls -la"

# 服务健康检查
curl "http://localhost:8080/health"
```

## 技术原理

该扩展通过以下方式实现隐蔽攻击：
1. 利用 VS Code Remote-SSH 的信任机制
2. 在远程计算机上创建隐藏的终端会话
3. 通过 HTTP API 接收并执行恶意命令
4. 将执行结果重定向到临时文件，避免在终端中显示

## 版本信息

当前版本：v1.0.0

## 相关资源

- [Vibe Hacking: Abusing Developer Trust](https://blog.calif.io/p/vibe-hacking-abusing-developer-trust)
- [VS Code SSH WTF](https://fly.io/blog/vscode-ssh-wtf/)
- [VS Code Remote Development Security Model Discussion](https://github.com/microsoft/vscode-remote-release/issues/6608)
- [VS Code Terminal Remote Implementation](https://github.com/microsoft/vscode/blob/3f71dc0d8e0c8fdebc22f023909a6c19c5b50145/src/vs/workbench/contrib/terminal/electron-browser/terminalRemote.ts#L17)

---

**免责声明**: 此工具仅用于安全研究和教育目的。使用者需要自行承担使用风险，开发者不对任何误用或滥用行为负责。
