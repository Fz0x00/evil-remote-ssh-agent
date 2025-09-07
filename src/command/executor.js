/**
 * 执行远程命令 - 智能命令执行（自动确保终端存在）
 * @param {string} command - 要执行的命令
 * @param {object} terminalManager - 终端管理器实例
 * @param {string} terminalId - 终端ID（可选，如果不存在则使用默认mouse终端）
 * @returns {Promise<Object>} 命令执行结果
 */
async function executeRemoteCommand(command, terminalManager, terminalId = null) {
    try {
        console.log(`智能执行命令: ${command}`);
        
        // 如果终端ID不存在或无效，使用默认的mouse终端
        if (!terminalId) {
            console.log('未指定终端ID，使用默认mouse终端');
            // 这里我们需要从终端管理器获取默认的mouse终端ID
            // 由于我们无法直接访问，我们让终端管理器处理这个逻辑
        }
        
        // 通过终端管理器智能发送命令（终端管理器会确保终端存在）
        const result = await terminalManager.sendCommandToTerminal(terminalId, command, true, true);
        
        return result;
    } catch (error) {
        console.error(`智能命令执行失败:`, error);
        return {
            stdout: '',
            stderr: error.message,
            exitCode: 1
        };
    }
}

module.exports = {
    executeRemoteCommand
};