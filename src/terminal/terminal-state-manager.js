const fs = require('fs');
const path = require('path');
const os = require('os');
const logger = require('../utils/logger');

/**
 * 终端状态管理器类，用于处理终端生命周期的读取、存储和修改
 * 将终端状态持久化到本地JSON文件中
 */
class TerminalStateManager {
    /**
     * 构造函数
     * @param {string} stateFilePath - 状态文件路径，如果不提供则使用默认路径
     */
    constructor(stateFilePath) {
        // 设置状态文件路径
        this.stateFilePath = stateFilePath || path.join(os.homedir(), '.evil-sshagent-terminals.json');
        
        // 初始化状态数据
        this.stateData = {
            terminals: {},
            terminalIdCounter: 1,
            lastUpdated: new Date().toISOString()
        };
        
        // 加载状态
        this.loadState();
    }

    /**
     * 从文件加载状态
     */
    loadState() {
        try {
            logger.info(`正在加载终端状态文件: ${this.stateFilePath}`);
            if (fs.existsSync(this.stateFilePath)) {
                const fileContent = fs.readFileSync(this.stateFilePath, 'utf8');
                logger.debug(`文件内容长度: ${fileContent.length} 字节`);
                this.stateData = JSON.parse(fileContent);
                logger.info(`终端状态已从文件加载: ${this.stateFilePath}`);
                logger.info(`加载的终端数量: ${Object.keys(this.stateData.terminals).length}`);
                logger.debug(`终端ID列表: ${Object.keys(this.stateData.terminals)}`);
                logger.debug(`终端ID计数器: ${this.stateData.terminalIdCounter}`);
            } else {
                logger.info(`状态文件不存在，将创建新文件: ${this.stateFilePath}`);
                logger.debug(`文件路径检查: ${this.stateFilePath}`);
                logger.debug(`父目录是否存在: ${fs.existsSync(path.dirname(this.stateFilePath))}`);
                this.saveState();
            }
        } catch (error) {
            logger.error(`加载终端状态失败:`, error);
            logger.error(`错误详情:`, {
                message: error.message,
                stack: error.stack,
                stateFilePath: this.stateFilePath
            });
            // 如果加载失败，使用默认状态
            this.stateData = {
                terminals: {},
                terminalIdCounter: 1,
                lastUpdated: new Date().toISOString()
            };
        }
    }

    /**
     * 保存状态到文件
     */
    saveState() {
        try {
            // 更新最后修改时间
            this.stateData.lastUpdated = new Date().toISOString();
            
            logger.info(`正在保存终端状态到文件: ${this.stateFilePath}`);
            logger.debug(`当前状态数据:`, {
                terminalsCount: Object.keys(this.stateData.terminals).length,
                terminalIds: Object.keys(this.stateData.terminals),
                terminalIdCounter: this.stateData.terminalIdCounter
            });
            
            // 确保目录存在
            const dir = path.dirname(this.stateFilePath);
            if (!fs.existsSync(dir)) {
                logger.info(`创建目录: ${dir}`);
                fs.mkdirSync(dir, { recursive: true });
            }
            
            // 写入文件
            const jsonData = JSON.stringify(this.stateData, null, 2);
            fs.writeFileSync(this.stateFilePath, jsonData);
            logger.info(`终端状态已保存到文件: ${this.stateFilePath}`);
            logger.debug(`文件大小: ${jsonData.length} 字节`);
            
            // 验证文件是否写入成功
            if (fs.existsSync(this.stateFilePath)) {
                const fileContent = fs.readFileSync(this.stateFilePath, 'utf8');
                const parsedData = JSON.parse(fileContent);
                logger.info(`文件验证成功，包含 ${Object.keys(parsedData.terminals).length} 个终端`);
            } else {
                logger.error(`文件保存后不存在: ${this.stateFilePath}`);
            }
        } catch (error) {
            logger.error(`保存终端状态失败:`, error);
            logger.error(`错误详情:`, {
                message: error.message,
                stack: error.stack,
                stateFilePath: this.stateFilePath
            });
        }
    }

    /**
     * 添加或更新终端信息
     * @param {string} terminalId - 终端ID
     * @param {Object} terminalInfo - 终端信息对象
     */
    upsertTerminal(terminalId, terminalInfo) {
        // 确保terminalId是字符串
        terminalId = String(terminalId);
        
        logger.info(`正在更新终端信息 [ID: ${terminalId}]`, {
            terminalInfo: terminalInfo,
            existingTerminal: this.stateData.terminals[terminalId] ? 'exists' : 'new'
        });
        
        // 更新终端信息
        this.stateData.terminals[terminalId] = {
            ...terminalInfo,
            id: terminalId,
            lastUpdated: new Date().toISOString()
        };
        
        logger.debug(`终端信息已更新到内存 [ID: ${terminalId}]`, this.stateData.terminals[terminalId]);
        
        // 保存状态
        this.saveState();
        
        logger.info(`终端信息已更新 [ID: ${terminalId}]`);
    }

    /**
     * 获取终端信息
     * @param {string} terminalId - 终端ID
     * @returns {Object|null} - 终端信息对象，如果不存在则返回null
     */
    getTerminal(terminalId) {
        // 确保terminalId是字符串
        terminalId = String(terminalId);
        
        const terminalInfo = this.stateData.terminals[terminalId];
        if (!terminalInfo) {
            console.warn(`⚠️ 终端不存在 [ID: ${terminalId}]`);
            return null;
        }
        
        return terminalInfo;
    }

    /**
     * 删除终端信息
     * @param {string} terminalId - 终端ID
     * @returns {boolean} - 是否成功删除
     */
    removeTerminal(terminalId) {
        // 确保terminalId是字符串
        terminalId = String(terminalId);
        
        if (!this.stateData.terminals[terminalId]) {
            console.warn(`⚠️ 终端不存在，无法删除 [ID: ${terminalId}]`);
            return false;
        }
        
        // 删除终端
        delete this.stateData.terminals[terminalId];
        
        // 保存状态
        this.saveState();
        
        console.log(`✓ 终端已删除 [ID: ${terminalId}]`);
        return true;
    }

    /**
     * 获取所有终端信息
     * @returns {Object} - 包含所有终端信息的对象
     */
    getAllTerminals() {
        return { ...this.stateData.terminals };
    }

    /**
     * 获取所有终端ID
     * @returns {Array} - 包含所有终端ID的数组
     */
    getAllTerminalIds() {
        return Object.keys(this.stateData.terminals);
    }

    /**
     * 获取终端数量
     * @returns {number} - 终端数量
     */
    getTerminalCount() {
        return Object.keys(this.stateData.terminals).length;
    }

    /**
     * 获取下一个终端ID
     * @returns {number} - 下一个可用的终端ID
     */
    getNextTerminalId() {
        const nextId = this.stateData.terminalIdCounter;
        // 更新计数器
        this.stateData.terminalIdCounter++;
        // 保存状态
        this.saveState();
        return nextId;
    }

    /**
     * 清空所有终端信息
     */
    clearAllTerminals() {
        this.stateData.terminals = {};
        // 保存状态
        this.saveState();
        console.log(`✓ 所有终端信息已清空`);
    }

    /**
     * 获取状态文件路径
     * @returns {string} - 状态文件路径
     */
    getStateFilePath() {
        return this.stateFilePath;
    }

    /**
     * 获取最后更新时间
     * @returns {string} - 最后更新时间
     */
    getLastUpdatedTime() {
        return this.stateData.lastUpdated;
    }
}

module.exports = TerminalStateManager;