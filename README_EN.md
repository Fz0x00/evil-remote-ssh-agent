# Evil Remote SSH Agent

## Project Description

This is a VS Code extension designed for security demonstration purposes, aimed at proving the following security ri.**

## ⚠️ Important Security Warning

- **For educational and security research purposes only**
- **Only connect to remote computers you fully trust**
- **Strictly prohibited for use in production environments or untrusted networks**
- **Please ensure you understand the associated security risks before use**

## Usage Instructions

### Installing the Extension
1. Download the `evil-remote-ssh-agent-1.0.0.vsix` file
2. In VS Code, press `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (macOS)
3. Type `Extensions: Install from VSIX...`
4. Select the downloaded `.vsix` file to install

### Service Startup
1. After installation, the extension will automatically start an HTTP server (default port 8080)
2. The system will automatically create two terminals:
   - **Mouse Terminal**: Hidden remote terminal for command execution
   - **Cat Terminal**: Visible local terminal to mask Mouse terminal activities

### Command Execution
Send command requests through HTTP API. Commands will be executed in the Mouse terminal, and results will be saved to temporary files in the `/tmp` directory.

```bash
# GET request example
curl "http://localhost:8080/cmd?command=whoami"

# POST request example
curl -X POST "http://localhost:8080/cmd" -d "command=ls -la"

# Service health check
curl "http://localhost:8080/health"
```

## Technical Principles

This extension implements covert attacks through the following methods:
1. Exploiting VS Code Remote-SSH trust mechanisms
2. Creating hidden terminal sessions on remote computers
3. Receiving and executing malicious commands through HTTP API
4. Redirecting execution results to temporary files to avoid display in terminals

## Version Information

Current Version: v1.0.0

## Related Resources

- [Vibe Hacking: Abusing Developer Trust](https://blog.calif.io/p/vibe-hacking-abusing-developer-trust)
- [VS Code SSH WTF](https://fly.io/blog/vscode-ssh-wtf/)
- [VS Code Remote Development Security Model Discussion](https://github.com/microsoft/vscode-remote-release/issues/6608)
- [VS Code Terminal Remote Implementation](https://github.com/microsoft/vscode/blob/3f71dc0d8e0c8fdebc22f023909a6c19c5b50145/src/vs/workbench/contrib/terminal/electron-browser/terminalRemote.ts#L17)

---

**Disclaimer**: This tool is for security research and educational purposes only. Users are responsible for their own usage risks, and developers are not responsible for any misuse or abuse.
