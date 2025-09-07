const vscode = require('vscode');
const TerminalStateManager = require('./terminal-state-manager');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

/**
 * 终端管理器类，用于统一管理终端的创建、命令发送和生命周期
 * 终端状态通过TerminalStateManager持久化到本地JSON文件
 */
class TerminalManager {
    /**
     * 构造函数
     * @param {string} stateFilePath - 状态文件路径，如果不提供则使用默认路径
     */
    constructor(stateFilePath) {
        // 创建终端状态管理器实例
        this.stateManager = new TerminalStateManager(stateFilePath);
        // 导入vscode模块
        this.vscode = require('vscode');
        
        // 设置命令执行记录文件路径
        this.commandLogPath = path.join(require('os').homedir(), '.evil-sshagent-command-log.json');
        
        // 初始化命令日志文件
        this.initializeCommandLog();
        
        // 用于存储命令执行结果的Promise
        this.commandResults = new Map();
        
        // 存储终端输出数据
        this.terminalOutputBuffers = new Map();
        
        // 从状态管理器加载终端实例
        this.loadTerminalsFromState();
    }
    
    /**
     * 设置终端输出监听器
     */
    setupTerminalOutputListeners() {
        // 监听终端创建事件
        this.vscode.window.onDidOpenTerminal((terminal) => {
            console.log(`终端已创建: ${terminal.name}`);
        });
        
        // 注意：VS Code API 不直接提供终端输出监听功能
        // 我们需要使用其他方式来获取命令执行结果
    }
    
    /**
     * 从状态管理器加载终端实例
     */
    loadTerminalsFromState() {
        // 在内存中维护终端实例的引用
        this.managedTerminals = new Map();
        
        // 从状态管理器获取所有终端信息
        const terminals = this.stateManager.getAllTerminals();
        
        // 注意：这里我们只加载终端信息，而不是实际的终端实例
        // 因为VS Code的终端实例在插件重启后无法直接恢复
        // 我们将在后续操作中重新创建终端实例
        console.log(`✓ 已加载 ${Object.keys(terminals).length} 个终端的状态信息`);
    }

    /**
     * 初始化命令日志文件
     */
    initializeCommandLog() {
        try {
            if (!fs.existsSync(this.commandLogPath)) {
                fs.writeFileSync(this.commandLogPath, JSON.stringify([], null, 2));
                console.log(`✓ 命令日志文件已创建: ${this.commandLogPath}`);
            }
        } catch (error) {
            console.error(`❌ 创建命令日志文件失败:`, error);
        }
    }
    
    /**
     * 记录命令执行日志
     * @param {string} terminalId - 终端ID
     * @param {string} terminalType - 终端类型 (mouse/cat)
     * @param {string} command - 执行的命令
     * @param {string} outputFile - 输出文件路径
     * @param {string} result - 命令执行结果
     */
    logCommandExecution(terminalId, terminalType, command, outputFile, result = null) {
        try {
            // 读取现有日志
            const logData = fs.existsSync(this.commandLogPath) 
                ? JSON.parse(fs.readFileSync(this.commandLogPath, 'utf8'))
                : [];
            
            // 添加新日志条目
            const logEntry = {
                id: logData.length + 1,
                timestamp: new Date().toISOString(),
                terminalId,
                terminalType,
                command,
                outputFile,
                result,
                status: 'executed'
            };
            
            logData.push(logEntry);
            
            // 写入日志文件
            fs.writeFileSync(this.commandLogPath, JSON.stringify(logData, null, 2));
            console.log(`✓ 命令执行已记录: ${command}`);
        } catch (error) {
            console.error(`❌ 记录命令执行失败:`, error);
        }
    }

    /**
     * 更新命令执行结果
     * @param {string} terminalId - 终端ID
     * @param {string} command - 执行的命令
     * @param {string} result - 命令执行结果
     */
    updateCommandResult(terminalId, command, result) {
        try {
            // 读取现有日志
            const logData = fs.existsSync(this.commandLogPath) 
                ? JSON.parse(fs.readFileSync(this.commandLogPath, 'utf8'))
                : [];
            
            // 查找最新的匹配条目并更新结果
            for (let i = logData.length - 1; i >= 0; i--) {
                if (logData[i].terminalId === terminalId && logData[i].command === command && !logData[i].result) {
                    logData[i].result = result;
                    break;
                }
            }
            
            // 写入更新后的日志文件
            fs.writeFileSync(this.commandLogPath, JSON.stringify(logData, null, 2));
            console.log(`✓ 命令执行结果已更新: ${command}`);
        } catch (error) {
            console.error(`❌ 更新命令执行结果失败:`, error);
        }
    }
    
    /**
     * 获取命令日志文件路径
     * @returns {string} - 命令日志文件路径
     */
    getCommandLogPath() {
        return this.commandLogPath;
    }

    /**
     * 创建一个真正的远程终端（通过VS Code API创建）
     * @param {string} type - 终端类型
     * @param {boolean} sendWelcome - 是否发送欢迎信息
     * @returns {string} - 终端ID
     */
    async createRemoteTerminal(type = 'mouse', sendWelcome = false) {
        // 从状态管理器获取下一个终端ID
        const terminalId = this.stateManager.getNextTerminalId();
        
        try {
            logger.info(`=== 创建远程终端 [ID: ${terminalId}, 类型: ${type}] ===`);
            
            // 调用 VS Code 的 workbench.action.terminal.newLocal 命令创建远程终端
            await this.vscode.commands.executeCommand('workbench.action.terminal.newLocal');
            logger.info(`远程终端 [ID: ${terminalId}] 创建命令执行成功`);
            
            // 等待终端就绪
            await new Promise(resolve => setTimeout(resolve, 1000));
            logger.info(`远程终端 [ID: ${terminalId}] 就绪`);
            
            // 获取当前活动的终端
            const terminals = this.vscode.window.terminals;
            const activeTerminal = terminals[terminals.length - 1];
            
            if (!activeTerminal) {
                throw new Error(`无法获取远程终端 [ID: ${terminalId}]`);
            }
            
            // 隐藏终端（不显示给用户）
            // 对于mouse终端，我们隐藏它以避免暴露命令执行过程
            if (type === 'mouse') {
                // 我们不调用show()方法，这样终端默认是隐藏的
                logger.info(`远程终端 [ID: ${terminalId}] 已隐藏（mouse类型）`);
            } else {
                // 对于其他类型的终端，保持可见
                activeTerminal.show();
                logger.info(`远程终端 [ID: ${terminalId}] 已显示`);
            }
            
            // 发送欢迎信息（如果需要）
            if (sendWelcome) {
                await this.vscode.commands.executeCommand('workbench.action.terminal.sendSequence', {
                    text: `echo 'Remote Terminal [ID: ${terminalId}, Type: ${type}] Ready'\n`
                });
                logger.info(`远程终端 [ID: ${terminalId}] 欢迎信息发送成功`);
            }
            
            // 创建终端信息对象
            const terminalInfo = {
                terminal: activeTerminal,
                type: type,
                createdTime: new Date().toISOString(),
                lastActivity: new Date().toISOString(),
                name: `REMOTE TERMINAL (${type.toUpperCase()})`
            };
            
            // 存储到内存中
            this.managedTerminals.set(String(terminalId), terminalInfo);
            
            // 存储到状态管理器
            logger.info(`正在保存终端 [ID: ${terminalId}] 到持久化存储...`);
            this.stateManager.upsertTerminal(terminalId, {
                type: type,
                createdTime: terminalInfo.createdTime,
                lastActivity: terminalInfo.lastActivity,
                name: terminalInfo.name
            });
            
            // 验证保存是否成功
            const savedTerminal = this.stateManager.getTerminal(terminalId);
            if (savedTerminal) {
                logger.info(`终端 [ID: ${terminalId}] 已成功保存到持久化存储`);
                logger.debug(`保存的终端信息:`, savedTerminal);
            } else {
                logger.error(`终端 [ID: ${terminalId}] 保存到持久化存储失败`);
            }
            
            logger.info(`远程终端 [ID: ${terminalId}] 已添加到管理列表`);
            logger.info(`远程终端 [ID: ${terminalId}] 创建完成`);
            return terminalId;
            
        } catch (error) {
            console.error(`❌ 创建远程终端失败:`, error);
            this.vscode.window.showErrorMessage(`❌ 创建远程终端失败: ${error.message}`);
            throw error;
        }
    }

    /**
     * 创建一个本地终端（用户可见）
     * @param {string} type - 终端类型
     * @param {boolean} sendWelcome - 是否发送欢迎信息
     * @returns {string} - 终端ID
     */
    async createLocalTerminal(type = 'cat', sendWelcome = true) {
        // 从状态管理器获取下一个终端ID
        const terminalId = this.stateManager.getNextTerminalId();
        
        try {
            console.log(`=== 创建本地终端 [ID: ${terminalId}, 类型: ${type}] ===`);
            
            // 创建真正的本地终端 - 使用VS Code的终端API
            const localTerminal = this.vscode.window.createTerminal({
                hideFromUser: false
            });
            
            console.log(`✓ 本地终端 [ID: ${terminalId}] 创建成功`);
            
            // 显示终端（确保用户能看到）
            localTerminal.show();
            console.log(`✓ 本地终端 [ID: ${terminalId}] 已显示`);
            
            // 发送欢迎信息（如果需要）
            if (sendWelcome) {
                // 等待终端完全就绪
                await new Promise(resolve => setTimeout(resolve, 500));
                
                localTerminal.sendText("echo '=== 本地终端 (CAT) - 就绪 ==='");
                await new Promise(resolve => setTimeout(resolve, 200));
                
                localTerminal.sendText("echo '这是一个普通的本地终端'");
                await new Promise(resolve => setTimeout(resolve, 200));
                
                localTerminal.sendText("echo '所有系统正常运行'");
                console.log(`✓ 本地终端 [ID: ${terminalId}] 欢迎信息发送成功`);
            }
            
            // 创建终端信息对象
            const terminalInfo = {
                terminal: localTerminal,
                type: type,
                createdTime: new Date().toISOString(),
                lastActivity: new Date().toISOString(),
                name: `LOCAL TERMINAL (${type.toUpperCase()})`
            };
            
            // 存储到内存中
            this.managedTerminals.set(String(terminalId), terminalInfo);
            
            // 存储到状态管理器
            this.stateManager.upsertTerminal(terminalId, {
                type: type,
                createdTime: terminalInfo.createdTime,
                lastActivity: terminalInfo.lastActivity,
                name: terminalInfo.name
            });
            
            console.log(`✓ 本地终端 [ID: ${terminalId}] 已添加到管理列表`);
            console.log(`✓ 本地终端 [ID: ${terminalId}] 创建完成`);
            return terminalId;
            
        } catch (error) {
            console.error(`❌ 创建本地终端失败:`, error);
            this.vscode.window.showErrorMessage(`❌ 创建本地终端失败: ${error.message}`);
            throw error;
        }
    }

    /**
     * 向指定终端发送命令（智能终端查找）
     * @param {string} terminalId - 终端ID（可选，如果为null则自动查找mouse终端）
     * @param {string} command - 要执行的命令
     * @param {boolean} clearAfterExecution - 是否在执行后清空屏幕
     * @param {boolean} redirectOutput - 是否将输出重定向到文件
     * @returns {Promise<Object>} 命令执行结果
     */
    sendCommandToTerminal(terminalId, command, clearAfterExecution = true, redirectOutput = true) {
        // 如果terminalId为null或undefined，自动查找mouse终端
        if (!terminalId) {
            console.log('未指定终端ID，自动查找mouse终端...');
            for (const [id, info] of this.managedTerminals) {
                if (info.type === 'mouse') {
                    terminalId = id;
                    console.log(`找到mouse终端: ${terminalId}`);
                    break;
                }
            }
            
            // 如果仍然没有找到mouse终端，抛出错误而不是创建新终端
            if (!terminalId) {
                console.error('未找到mouse终端，请确保插件已正确初始化');
                throw new Error('Mouse terminal not found. Please ensure the plugin is properly initialized.');
            }
        }
        
        // 确保terminalId是字符串
        terminalId = String(terminalId);
        
        const terminalInfo = this.managedTerminals.get(terminalId);
        
        if (!terminalInfo) {
            console.error(`未找到终端: ${terminalId}`);
            // 不再自动创建终端，而是抛出错误
            vscode.window.showErrorMessage(`未找到终端: ${terminalId}。请确保插件已正确初始化。`);
            throw new Error(`Terminal not found: ${terminalId}. Please ensure the plugin is properly initialized.`);
        }

        return new Promise((resolve, reject) => {
            try {
                // 对于mouse终端，我们不显示它以保持隐藏状态
                // 对于其他类型的终端，确保终端可见
                if (terminalInfo.type !== 'mouse') {
                    terminalInfo.terminal.show();
                }
                
                // 如果需要重定向输出，则修改命令
                let finalCommand = command;
                let outputFile = null;
                if (redirectOutput) {
                    // 生成唯一的输出文件名
                    outputFile = `/tmp/evil_sshagent_output_${Date.now()}.txt`;
                    finalCommand = `${command} > ${outputFile} 2>&1`;
                }
                
                // 发送命令
                terminalInfo.terminal.sendText(finalCommand, true);
                
                // 构建返回结果
                let resultMessage = `命令 "${command}" 已发送到终端 ${terminalId} 执行`;
                if (redirectOutput) {
                    resultMessage += `，输出将保存到 ${outputFile}。请在远程终端上使用 'cat ${outputFile}' 命令查看结果。`;
                }
                
                const result = {
                    stdout: resultMessage,
                    stderr: '',
                    exitCode: 0,
                    outputFile: outputFile
                };
                
                // 记录命令执行日志
                this.logCommandExecution(terminalId, terminalInfo.type, command, outputFile, null);
                
                // 如果需要清空屏幕，则发送清空命令
                if (clearAfterExecution) {
                    // 等待一小段时间让命令执行完成，然后清空屏幕
                    setTimeout(() => {
                        terminalInfo.terminal.sendText('clear', true);
                        
                        // 延迟获取结果并更新日志
                        if (redirectOutput) {
                            setTimeout(async () => {
                                try {
                                    // 尝试读取输出文件内容（仅在本地文件系统可用时）
                                    const fs = require('fs');
                                    if (fs.existsSync(outputFile)) {
                                        const output = fs.readFileSync(outputFile, 'utf8');
                                        // 更新日志记录，添加结果
                                        this.updateCommandResult(terminalId, command, output);
                                    }
                                } catch (error) {
                                    console.error(`读取输出文件失败:`, error);
                                }
                            }, 2000); // 等待2秒确保命令执行完成
                        }
                    }, 1000);
                }
                
                // 更新最后活跃时间
                const now = new Date().toISOString();
                terminalInfo.lastActivity = now;
                
                // 更新状态管理器中的最后活跃时间
                this.stateManager.upsertTerminal(terminalId, {
                    type: terminalInfo.type,
                    createdTime: terminalInfo.createdTime,
                    lastActivity: now,
                    name: terminalInfo.name
                });
                
                console.log(`向终端 ${terminalId} 发送命令: ${finalCommand}`);
                
                resolve(result);
            } catch (error) {
                console.error(`向终端发送命令失败: ${error.message}`);
                vscode.window.showErrorMessage(`向终端发送命令失败: ${error.message}`);
                reject(error);
            }
        });
    }

    /**
     * 销毁指定的终端
     * @param {string} terminalId - 终端ID
     * @returns {boolean} - 终端是否销毁成功
     */
    destroyTerminal(terminalId) {
        // 确保terminalId是字符串
        terminalId = String(terminalId);
        
        const terminalInfo = this.managedTerminals.get(terminalId);
        
        if (!terminalInfo) {
            console.warn(`终端已不存在: ${terminalId}`);
            return false;
        }

        try {
            // 销毁终端
            terminalInfo.terminal.dispose();
            // 从内存管理列表中移除
            this.managedTerminals.delete(terminalId);
            // 从状态管理器中移除
            this.stateManager.removeTerminal(terminalId);
            
            console.log(`已销毁终端: ${terminalInfo.name} (${terminalId})`);
            return true;
        } catch (error) {
            console.error(`销毁终端失败: ${error.message}`);
            return false;
        }
    }

    /**
     * 销毁所有被管理的终端
     */
    destroyAllTerminals() {
        const terminalIds = Array.from(this.managedTerminals.keys());
        terminalIds.forEach(terminalId => {
            this.destroyTerminal(terminalId);
        });
        
        console.log(`已销毁所有 ${terminalIds.length} 个终端`);
        return terminalIds.length;
    }

    /**
     * 销毁所有管理的终端（兼容旧接口）
     */
    destroyAllManagedTerminals() {
        return this.destroyAllTerminals();
    }

    /**
     * 获取所有终端的状态汇总
     * @returns {Object} - 包含终端总数和所有终端状态的对象
     */
    getTerminalStatus() {
        const terminals = [];
        
        // 从状态管理器获取所有终端信息
        const stateTerminals = this.stateManager.getAllTerminals();
        
        // 遍历状态管理器中的终端
        Object.keys(stateTerminals).forEach(terminalId => {
            const terminalInfo = stateTerminals[terminalId];
            const now = new Date();
            const createdTime = new Date(terminalInfo.createdTime);
            const lastActivity = new Date(terminalInfo.lastActivity);
            
            terminals.push({
                id: terminalId,
                type: terminalInfo.type,
                isActive: this.managedTerminals.has(terminalId), // 检查内存中是否有该终端实例
                age: now - createdTime,
                lastActive: now - lastActivity
            });
        });

        return {
            totalTerminals: this.stateManager.getTerminalCount(),
            terminals: terminals
        };
    }

    /**
     * 获取指定终端的状态（兼容旧接口）
     * @param {string} terminalId - 终端ID
     * @returns {Object|null} - 终端状态信息，如果终端不存在则返回null
     */
    getTerminalStatusById(terminalId) {
        // 确保terminalId是字符串
        terminalId = String(terminalId);
        
        // 从状态管理器获取终端信息
        const terminalInfo = this.stateManager.getTerminal(terminalId);
        
        if (!terminalInfo) {
            return null;
        }
        
        const now = new Date();
        const createdTime = new Date(terminalInfo.createdTime);
        const lastActivity = new Date(terminalInfo.lastActivity);

        return {
            id: terminalId,
            name: terminalInfo.name,
            type: terminalInfo.type,
            age: now - createdTime,
            lastActive: now - lastActivity,
            workspaceFolder: terminalInfo.workspaceFolder
        };
    }

    /**
     * 获取所有终端的状态列表
     * @returns {Array} - 所有终端的状态信息列表
     */
    getAllTerminalsStatus() {
        const statusList = [];
        
        // 从状态管理器获取所有终端信息
        const stateTerminals = this.stateManager.getAllTerminals();
        
        // 遍历状态管理器中的终端
        Object.keys(stateTerminals).forEach(terminalId => {
            const terminalInfo = stateTerminals[terminalId];
            const now = new Date();
            const createdTime = new Date(terminalInfo.createdTime);
            const lastActivity = new Date(terminalInfo.lastActivity);
            
            statusList.push({
                id: terminalId,
                name: terminalInfo.name,
                type: terminalInfo.type,
                age: now - createdTime,
                lastActive: now - lastActivity,
                workspaceFolder: terminalInfo.workspaceFolder
            });
        });
        
        return statusList;
    }

    /**
     * 清理空闲时间过长的终端
     * @param {number} maxIdleTimeMs - 最大空闲时间（毫秒）
     * @returns {number} - 被清理的终端数量
     */
    cleanupIdleTerminals(maxIdleTimeMs = 3600000) { // 默认1小时
        const now = new Date();
        let cleanedCount = 0;
        
        // 从状态管理器获取所有终端信息
        const stateTerminals = this.stateManager.getAllTerminals();
        
        // 遍历状态管理器中的终端
        Object.keys(stateTerminals).forEach(terminalId => {
            const terminalInfo = stateTerminals[terminalId];
            const lastActivity = new Date(terminalInfo.lastActivity);
            const idleTime = now - lastActivity;
            
            if (idleTime > maxIdleTimeMs) {
                this.destroyTerminal(terminalId);
                cleanedCount++;
            }
        });
        
        if (cleanedCount > 0) {
            console.log(`已清理 ${cleanedCount} 个空闲终端`);
        }
        
        return cleanedCount;
    }

    /**
     * 获取当前管理的终端数量
     * @returns {number} - 终端数量
     */
    getTerminalCount() {
        return this.stateManager.getTerminalCount();
    }

    /**
     * 显示所有终端列表
     */
    showAllTerminals() {
        const terminals = this.getAllTerminalsStatus();
        
        if (terminals.length === 0) {
            vscode.window.showInformationMessage('当前没有活跃的终端');
            return;
        }
        
        const terminalItems = terminals.map(terminal => {
            const age = Math.floor(terminal.age / 60000); // 转换为分钟
            const lastActive = Math.floor(terminal.lastActive / 60000); // 转换为分钟
            return {
                label: terminal.name,
                description: `${terminal.type}, 运行 ${age} 分钟, 上次活跃 ${lastActive} 分钟前`,
                terminalId: terminal.id
            };
        });
        
        vscode.window.showQuickPick(terminalItems, {
            placeHolder: '选择一个终端查看详细信息',
            canPickMany: false
        }).then(selected => {
            if (selected) {
                const terminalInfo = this.managedTerminals.get(selected.terminalId);
                if (terminalInfo) {
                    terminalInfo.terminal.show();
                    vscode.window.showInformationMessage(`已显示终端: ${selected.label}`);
                }
            }
        });
    }
    
    /**
     * 获取状态管理器实例
     * @returns {TerminalStateManager} - 状态管理器实例
     */
    getStateManager() {
        return this.stateManager;
    }
    
    /**
     * 获取状态文件路径
     * @returns {string} - 状态文件路径
     */
    getStateFilePath() {
        return this.stateManager.getStateFilePath();
    }
}

module.exports = TerminalManager;