const { Plugin } = require('obsidian');

module.exports = class BlockIndentController extends Plugin {
    async onload() {
        console.log('加载 Block Indent Controller 插件');

        // 命令1: 整体增加缩进 (Alt+])
        this.addCommand({
            id: 'increase-block-indent',
            name: '增加整体块缩进',
            hotkeys: [{ modifiers: ['Alt'], key: ']' }],
            editorCallback: (editor) => {
                this.adjustBlockIndent(editor, true);
            }
        });

        // 命令2: 整体减少缩进 (Alt+[)
        this.addCommand({
            id: 'decrease-block-indent',
            name: '减少整体块缩进',
            hotkeys: [{ modifiers: ['Alt'], key: '[' }],
            editorCallback: (editor) => {
                this.adjustBlockIndent(editor, false);
            }
        });

        // 命令3: 增加引用符号 (Ctrl+Alt+])
        this.addCommand({
            id: 'increase-quote-level',
            name: '增加引用层级',
            hotkeys: [{ modifiers: ['Ctrl', 'Alt'], key: ']' }],
            editorCallback: (editor) => {
                this.adjustQuoteLevel(editor, true);
            }
        });

        // 命令4: 减少引用符号 (Ctrl+Alt+[)
        this.addCommand({
            id: 'decrease-quote-level',
            name: '减少引用层级',
            hotkeys: [{ modifiers: ['Ctrl', 'Alt'], key: '[' }],
            editorCallback: (editor) => {
                this.adjustQuoteLevel(editor, false);
            }
        });
    }

    /**
     * 调整整体块缩进（包括 > 符号一起移动）
     * @param {Editor} editor - Obsidian 编辑器实例
     * @param {boolean} increase - true 为增加缩进，false 为减少缩进
     */
    adjustBlockIndent(editor, increase) {
        const selection = editor.getSelection();
        
        if (selection) {
            // 有选中内容，处理多行
            const from = editor.getCursor('from');
            const to = editor.getCursor('to');
            const startLine = from.line;
            const endLine = to.line;
            
            let newLines = [];
            for (let i = startLine; i <= endLine; i++) {
                const line = editor.getLine(i);
                const newLine = this.adjustLineBlockIndent(line, increase);
                newLines.push(newLine);
            }
            
            // 替换选中的行 - 获取实际的行尾位置
            const lastLineLength = editor.getLine(endLine).length;
            const fromPos = { line: startLine, ch: 0 };
            const toPos = { line: endLine, ch: lastLineLength };
            editor.replaceRange(newLines.join('\n'), fromPos, toPos);
            
            // 恢复选择
            editor.setSelection(
                { line: startLine, ch: 0 },
                { line: endLine, ch: newLines[newLines.length - 1].length }
            );
        } else {
            // 没有选中，处理当前行
            const cursor = editor.getCursor();
            const lineNum = cursor.line;
            const line = editor.getLine(lineNum);
            const newLine = this.adjustLineBlockIndent(line, increase);
            
            // 使用 replaceRange 替换整行内容
            const fromPos = { line: lineNum, ch: 0 };
            const toPos = { line: lineNum, ch: line.length };
            editor.replaceRange(newLine, fromPos, toPos);
            
            // 调整光标位置
            const offset = newLine.length - line.length;
            const newCursorPos = Math.max(0, cursor.ch + offset);
            editor.setCursor({ line: lineNum, ch: newCursorPos });
        }
    }

    /**
     * 调整单行的整体块缩进
     * @param {string} line - 原始行内容
     * @param {boolean} increase - true 为增加缩进，false 为减少缩进
     * @returns {string} 调整后的行内容
     */
    adjustLineBlockIndent(line, increase) {
        if (increase) {
            // 增加缩进：在行首添加制表符
            return '\t' + line;
        } else {
            // 减少缩进：删除行首的一个制表符或最多4个空格
            if (line.startsWith('\t')) {
                return line.substring(1);
            } else if (line.startsWith('    ')) {
                return line.substring(4);
            } else if (line.startsWith('   ')) {
                return line.substring(3);
            } else if (line.startsWith('  ')) {
                return line.substring(2);
            } else if (line.startsWith(' ')) {
                return line.substring(1);
            }
            return line;
        }
    }

    /**
     * 调整引用层级（只修改最靠前的 > 符号数量）
     * @param {Editor} editor - Obsidian 编辑器实例
     * @param {boolean} increase - true 为增加引用，false 为减少引用
     */
    adjustQuoteLevel(editor, increase) {
        const selection = editor.getSelection();
        
        if (selection) {
            // 有选中内容，处理多行
            const from = editor.getCursor('from');
            const to = editor.getCursor('to');
            const startLine = from.line;
            const endLine = to.line;
            
            let newLines = [];
            for (let i = startLine; i <= endLine; i++) {
                const line = editor.getLine(i);
                const newLine = this.adjustLineQuoteLevel(line, increase);
                newLines.push(newLine);
            }
            
            // 替换选中的行 - 获取实际的行尾位置
            const lastLineLength = editor.getLine(endLine).length;
            const fromPos = { line: startLine, ch: 0 };
            const toPos = { line: endLine, ch: lastLineLength };
            editor.replaceRange(newLines.join('\n'), fromPos, toPos);
            
            // 恢复选择
            editor.setSelection(
                { line: startLine, ch: 0 },
                { line: endLine, ch: newLines[newLines.length - 1].length }
            );
        } else {
            // 没有选中，处理当前行
            const cursor = editor.getCursor();
            const lineNum = cursor.line;
            const line = editor.getLine(lineNum);
            const newLine = this.adjustLineQuoteLevel(line, increase);
            
            // 使用 replaceRange 替换整行内容
            const fromPos = { line: lineNum, ch: 0 };
            const toPos = { line: lineNum, ch: line.length };
            editor.replaceRange(newLine, fromPos, toPos);
            
            // 调整光标位置
            const offset = newLine.length - line.length;
            const newCursorPos = Math.max(0, cursor.ch + offset);
            editor.setCursor({ line: lineNum, ch: newCursorPos });
        }
    }

    /**
     * 调整单行的引用层级
     * @param {string} line - 原始行内容
     * @param {boolean} increase - true 为增加引用，false 为减少引用
     * @returns {string} 调整后的行内容
     */
    adjustLineQuoteLevel(line, increase) {
        // 找到第一个非空白字符的位置
        const match = line.match(/^(\s*)(>*\s*)?(.*)$/);
        if (!match) return line;
        
        const [, leadingSpace, quoteBlock, content] = match;
        
        if (increase) {
            // 增加引用：在第一个非空白字符位置添加 "> "
            if (quoteBlock) {
                // 已经有引用符号，在现有引用符号前添加
                return leadingSpace + '> ' + quoteBlock + content;
            } else {
                // 没有引用符号，直接添加
                return leadingSpace + '> ' + content;
            }
        } else {
            // 减少引用：删除最前面的一个 > 符号
            if (!quoteBlock) return line; // 没有引用符号，不做处理
            
            // 匹配第一个 > 和可能的空格
            const quoteMatch = quoteBlock.match(/^>\s?(.*)$/);
            if (quoteMatch) {
                const remainingQuote = quoteMatch[1];
                return leadingSpace + remainingQuote + content;
            }
            
            return line;
        }
    }

    onunload() {
        console.log('卸载 Block Indent Controller 插件');
    }
};
