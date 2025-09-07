const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * 详细的日志管理器
 * 提供文件日志和控制台日志双重输出
 */
class Logger {
    constructor() {
        // 日志文件路径
        this.logDir = path.join(os.homedir(), '.evil-sshagent-logs');
        this.logFile = path.join(this.logDir, `evil-sshagent-${this.getDateString()}.log`);
        
        // 确保日志目录存在
        this.ensureLogDir();
        
        // 日志级别
        this.levels = {
            DEBUG: 0,
            INFO: 1,
            WARN: 2,
            ERROR: 3
        };
        
        this.currentLevel = this.levels.DEBUG; // 默认显示所有级别
    }
    
    /**
     * 获取日期字符串用于日志文件名
     */
    getDateString() {
        const now = new Date();
        return now.toISOString().split('T')[0]; // YYYY-MM-DD
    }
    
    /**
     * 获取时间戳字符串
     */
    getTimestamp() {
        const now = new Date();
        return now.toISOString().replace('T', ' ').replace('Z', '');
    }
    
    /**
     * 确保日志目录存在
     */
    ensureLogDir() {
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
    }
    
    /**
     * 写入日志到文件
     */
    writeToFile(level, message, data = null) {
        try {
            const timestamp = this.getTimestamp();
            let logEntry = `[${timestamp}] [${level}] ${message}`;
            
            if (data) {
                if (typeof data === 'object') {
                    logEntry += `\n${JSON.stringify(data, null, 2)}`;
                } else {
                    logEntry += `\n${data}`;
                }
            }
            
            logEntry += '\n' + '='.repeat(80) + '\n';
            
            fs.appendFileSync(this.logFile, logEntry, 'utf8');
        } catch (error) {
            console.error('写入日志文件失败:', error);
        }
    }
    
    /**
     * 输出到控制台
     */
    writeToConsole(level, message, data = null) {
        const timestamp = this.getTimestamp();
        const prefix = `[${timestamp}] [${level}]`;
        
        switch (level) {
            case 'DEBUG':
                console.log(`🔍 ${prefix} ${message}`);
                break;
            case 'INFO':
                console.log(`ℹ️  ${prefix} ${message}`);
                break;
            case 'WARN':
                console.warn(`⚠️  ${prefix} ${message}`);
                break;
            case 'ERROR':
                console.error(`❌ ${prefix} ${message}`);
                break;
        }
        
        if (data) {
            if (typeof data === 'object') {
                console.log(JSON.stringify(data, null, 2));
            } else {
                console.log(data);
            }
        }
    }
    
    /**
     * 通用日志方法
     */
    log(level, message, data = null) {
        if (this.levels[level] >= this.currentLevel) {
            this.writeToConsole(level, message, data);
        }
        this.writeToFile(level, message, data);
    }
    
    /**
     * Debug级别日志
     */
    debug(message, data = null) {
        this.log('DEBUG', message, data);
    }
    
    /**
     * Info级别日志
     */
    info(message, data = null) {
        this.log('INFO', message, data);
    }
    
    /**
     * Warning级别日志
     */
    warn(message, data = null) {
        this.log('WARN', message, data);
    }
    
    /**
     * Error级别日志
     */
    error(message, data = null) {
        this.log('ERROR', message, data);
    }
    
    /**
     * 记录函数调用
     */
    logFunctionCall(functionName, params = null, result = null) {
        this.debug(`函数调用: ${functionName}`, {
            parameters: params,
            result: result,
            timestamp: this.getTimestamp()
        });
    }
    
    /**
     * 记录终端操作
     */
    logTerminalOperation(operation, terminalId, terminalType, details = null) {
        this.info(`终端操作: ${operation}`, {
            terminalId: terminalId,
            terminalType: terminalType,
            details: details,
            timestamp: this.getTimestamp()
        });
    }
    
    /**
     * 记录HTTP请求
     */
    logHttpRequest(method, url, body = null, response = null) {
        this.info(`HTTP请求: ${method} ${url}`, {
            requestBody: body,
            response: response,
            timestamp: this.getTimestamp()
        });
    }
    
    /**
     * 记录插件状态
     */
    logPluginStatus(status, details = null) {
        this.info(`插件状态: ${status}`, {
            details: details,
            timestamp: this.getTimestamp()
        });
    }
    
    /**
     * 获取日志文件路径
     */
    getLogFilePath() {
        return this.logFile;
    }
    
    /**
     * 获取日志目录路径
     */
    getLogDirPath() {
        return this.logDir;
    }
    
    /**
     * 清理旧日志文件（保留最近7天）
     */
    cleanupOldLogs() {
        try {
            const files = fs.readdirSync(this.logDir);
            const now = new Date();
            const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            
            files.forEach(file => {
                if (file.startsWith('evil-sshagent-') && file.endsWith('.log')) {
                    const filePath = path.join(this.logDir, file);
                    const stats = fs.statSync(filePath);
                    
                    if (stats.mtime < sevenDaysAgo) {
                        fs.unlinkSync(filePath);
                        this.info(`清理旧日志文件: ${file}`);
                    }
                }
            });
        } catch (error) {
            this.error('清理旧日志文件失败:', error);
        }
    }
    
    /**
     * 设置日志级别
     */
    setLevel(level) {
        if (this.levels.hasOwnProperty(level)) {
            this.currentLevel = this.levels[level];
            this.info(`日志级别设置为: ${level}`);
        }
    }
}

// 创建全局日志实例
const logger = new Logger();

// 启动时清理旧日志
logger.cleanupOldLogs();

module.exports = logger;
