/**
 * Block Indent Controller Plugin v2.0
 * 
 * 完全重构版本 - 基于简洁、鲁棒的设计原则
 * 
 * 核心理念：
 * 1. 所有操作在字符串层面进行，避免数值转换
 * 2. 使用统一的数据结构，避免多种表示方式
 * 3. 函数职责单一，易于测试和维护
 * 4. 特殊情况用清晰的条件分支处理
 */

const { Plugin } = require('obsidian');

module.exports = class BlockIndentController extends Plugin {
    async onload() {
        console.log('加载 Block Indent Controller v2.0');

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

        // 命令5: 智能粘贴
        this.addCommand({
            id: 'smart-paste',
            name: '智能粘贴（匹配当前行格式）',
            hotkeys: [{ modifiers: ['Ctrl', 'Shift'], key: 'V' }],
            editorCallback: async (editor) => {
                await this.smartPaste(editor);
            }
        });

        // 命令6: 智能Enter - 列表自动延续
        this.addCommand({
            id: 'smart-enter',
            name: '智能换行（列表自动延续）',
            hotkeys: [{ modifiers: [], key: 'Enter' }],
            editorCallback: (editor) => {
                this.smartEnter(editor);
            }
        });
    }

    // ==================== 核心数据结构 ====================
    
    /**
     * 解析行结构 - 保持字符串形式
     * 
     * 返回结构：
     * {
     *   raw: 原始行字符串,
     *   preQuoteIndent: 引用前缩进字符串,
     *   quotes: 引用符号字符串,
     *   postQuoteIndent: 引用后缩进字符串,
     *   listMarker: 列表标记（如 "1." 或 "-"），无则为 null,
     *   content: 内容字符串,
     *   // 辅助信息
     *   prefixEnd: 完整前缀结束位置（不含列表标记）,
     *   markerEnd: 列表标记结束位置（含空格）
     * }
     */
    parseLine(line) {
        let pos = 0;
        const len = line.length;
        
        // 1. 解析引用前缩进
        let preQuoteIndent = '';
        while (pos < len && (line[pos] === ' ' || line[pos] === '\t')) {
            preQuoteIndent += line[pos];
            pos++;
        }
        
        // 2. 解析引用符号
        let quotes = '';
        while (pos < len && line[pos] === '>') {
            quotes += '>';
            pos++;
            // 引用符号后通常有一个空格
            if (pos < len && line[pos] === ' ') {
                quotes += ' ';
                pos++;
            }
        }
        
        // 3. 解析引用后缩进
        let postQuoteIndent = '';
        while (pos < len && (line[pos] === ' ' || line[pos] === '\t')) {
            postQuoteIndent += line[pos];
            pos++;
        }
        
        const prefixEnd = pos;
        
        // 4. 解析列表标记
        let listMarker = null;
        let markerEnd = pos;
        
        const remaining = line.substring(pos);
        // 无序列表: - * +
        const unorderedMatch = remaining.match(/^([-*+])\s+/);
        if (unorderedMatch) {
            listMarker = unorderedMatch[1];
            markerEnd = pos + unorderedMatch[0].length;
        } else {
            // 有序列表: 1. 2. 等
            const orderedMatch = remaining.match(/^(\d+\.)\s+/);
            if (orderedMatch) {
                listMarker = orderedMatch[1];
                markerEnd = pos + orderedMatch[0].length;
            }
        }
        
        // 5. 提取内容
        const content = line.substring(markerEnd);
        
        return {
            raw: line,
            preQuoteIndent,
            quotes,
            postQuoteIndent,
            listMarker,
            content,
            prefixEnd,
            markerEnd
        };
    }

    /**
     * 重建行 - 从结构生成字符串
     */
    rebuildLine(structure) {
        let line = '';
        line += structure.preQuoteIndent || '';
        line += structure.quotes || '';
        line += structure.postQuoteIndent || '';
        if (structure.listMarker) {
            line += structure.listMarker + ' ';
        }
        line += structure.content || '';
        return line;
    }

    /**
     * 提取前缀（不含列表标记）
     */
    extractPrefix(structure) {
        return (structure.preQuoteIndent || '') + 
               (structure.quotes || '') + 
               (structure.postQuoteIndent || '');
    }

    /**
     * 合并前缀 - 用于粘贴功能
     * 
     * 算法：目标前缀 + 源的相对缩进
     * 
     * @param {string} destPrefix - 目标前缀
     * @param {string} srcPrefix - 源前缀
     * @param {string} minPrefix - 源内容的最小前缀（用于计算相对缩进）
     */
    mergePrefix(destPrefix, srcPrefix, minPrefix) {
        // 提取源的相对缩进部分
        // 如果源前缀以最小前缀开头，移除它得到相对部分
        let relativeIndent = '';
        if (srcPrefix.startsWith(minPrefix)) {
            relativeIndent = srcPrefix.substring(minPrefix.length);
        } else {
            // 如果不匹配（理论上不应该发生），使用完整源前缀
            relativeIndent = srcPrefix;
        }
        
        return destPrefix + relativeIndent;
    }

    /**
     * 生成下一个列表标记
     */
    getNextListMarker(marker) {
        if (!marker) return null;
        
        // 有序列表：递增数字
        const numMatch = marker.match(/^(\d+)\.$/);
        if (numMatch) {
            const num = parseInt(numMatch[1]);
            return (num + 1) + '.';
        }
        
        // 无序列表：保持相同
        return marker;
    }

    // ==================== 智能换行功能 ====================
    
    /**
     * 智能换行 - 完全重写
     * 
     * 核心逻辑：
     * 1. 解析当前行结构
     * 2. 判断光标位置
     * 3. 根据场景执行对应操作
     */
    smartEnter(editor) {
        const cursor = editor.getCursor();
        const line = editor.getLine(cursor.line);
        const cursorPos = cursor.ch;
        
        const parsed = this.parseLine(line);
        
        // === 场景判断 ===
        
        // 场景1: 空引用行（最高优先级）
        // 实现 Obsidian 默认的逐层退出引用块机制
        // 条件：有引用符号 + 无列表标记 + 内容为空
        if (parsed.quotes && !parsed.listMarker && parsed.content.trim() === '') {
            this.handleEmptyQuoteEnter(editor, cursor, line, parsed);
            return;
        }
        
        // 场景2: 光标在前缀中（引用、缩进部分）
        // 注意：要排除已经被场景1处理的空引用行
        if (cursorPos < parsed.prefixEnd) {
            this.handleEnterInPrefix(editor, cursor, line, parsed, cursorPos);
            return;
        }
        
        // 场景3: 在列表项中
        if (parsed.listMarker) {
            // 场景2.1: 光标在列表标记中
            if (cursorPos < parsed.markerEnd) {
                this.handleEnterInMarker(editor, cursor, line, parsed, cursorPos);
                return;
            }
            
            // 场景2.2: 空列表项（内容为空）
            if (parsed.content.trim() === '') {
                this.handleEmptyListEnter(editor, cursor, line, parsed);
                return;
            }
            
            // 场景3.3: 非空列表项
            this.handleListEnter(editor, cursor, line, parsed, cursorPos);
            return;
        }
        
        // 场景4: 普通行
        this.handleNormalEnter(editor, cursor, line, parsed, cursorPos);
    }
    
    /**
     * 处理：空引用行换行
     * 行为：逐层退出引用块（Obsidian 默认行为）
     * 
     * 逻辑：
     * - 在空引用行按 Enter，引用层级减少 1 层
     * - 例如：`> > > > ` → 当前行变成 `> > > `，新行也是 `> > > `
     * - 直到完全退出引用块
     */
    handleEmptyQuoteEnter(editor, cursor, line, parsed) {
        // 统计当前的引用层级
        const quoteCount = (parsed.quotes.match(/>/g) || []).length;
        
        if (quoteCount === 0) {
            // 没有引用符号，正常换行
            this.handleNormalEnter(editor, cursor, line, parsed, cursor.ch);
            return;
        }
        
        if (quoteCount === 1) {
            // 只有一层引用，完全退出引用块
            // 当前行变成空行，新行也是空行
            const newText = parsed.preQuoteIndent + '\n' + parsed.preQuoteIndent;
            
            editor.replaceRange(
                newText,
                { line: cursor.line, ch: 0 },
                { line: cursor.line, ch: line.length }
            );
            
            editor.setCursor({ 
                line: cursor.line + 1, 
                ch: parsed.preQuoteIndent.length 
            });
            return;
        }
        
        // 减少一层引用
        const newQuoteCount = quoteCount - 1;
        let newQuotes = '';
        for (let i = 0; i < newQuoteCount; i++) {
            newQuotes += '> ';
        }
        
        // 构建新的前缀（保持引用前缩进和引用后缩进）
        const newPrefix = parsed.preQuoteIndent + newQuotes + parsed.postQuoteIndent;
        
        // 替换当前行并插入新行
        const newText = newPrefix + '\n' + newPrefix;
        
        editor.replaceRange(
            newText,
            { line: cursor.line, ch: 0 },
            { line: cursor.line, ch: line.length }
        );
        
        // 光标移到新行
        editor.setCursor({ line: cursor.line + 1, ch: newPrefix.length });
    }

    /**
     * 处理：光标在前缀中换行
     * 行为：只继承光标前的前缀，不继承列表标记
     */
    handleEnterInPrefix(editor, cursor, line, parsed, cursorPos) {
        const beforeCursor = line.substring(0, cursorPos);
        const afterCursor = line.substring(cursorPos);
        
        // 解析光标前的部分，提取前缀
        const beforeParsed = this.parseLine(beforeCursor);
        const inheritedPrefix = this.extractPrefix(beforeParsed);
        
        // 构建新行
        const newText = beforeCursor + '\n' + inheritedPrefix + afterCursor;
        
        editor.replaceRange(
            newText,
            { line: cursor.line, ch: 0 },
            { line: cursor.line, ch: line.length }
        );
        
        editor.setCursor({ line: cursor.line + 1, ch: inheritedPrefix.length });
    }

    /**
     * 处理：光标在列表标记中换行
     * 行为：只继承前缀，不继承列表标记
     */
    handleEnterInMarker(editor, cursor, line, parsed, cursorPos) {
        const beforeCursor = line.substring(0, cursorPos);
        const afterCursor = line.substring(cursorPos);
        
        const prefix = this.extractPrefix(parsed);
        
        const newText = beforeCursor + '\n' + prefix + afterCursor;
        
        editor.replaceRange(
            newText,
            { line: cursor.line, ch: 0 },
            { line: cursor.line, ch: line.length }
        );
        
        editor.setCursor({ line: cursor.line + 1, ch: prefix.length });
    }

    /**
     * 处理：空列表项换行
     * 行为：移除列表标记，光标留在当前行
     */
    handleEmptyListEnter(editor, cursor, line, parsed) {
        const prefix = this.extractPrefix(parsed);
        
        editor.replaceRange(
            prefix,
            { line: cursor.line, ch: 0 },
            { line: cursor.line, ch: line.length }
        );
        
        editor.setCursor({ line: cursor.line, ch: prefix.length });
    }

    /**
     * 处理：非空列表项换行
     * 行为：生成下一个列表项，分割内容
     */
    handleListEnter(editor, cursor, line, parsed, cursorPos) {
        const prefix = this.extractPrefix(parsed);
        const nextMarker = this.getNextListMarker(parsed.listMarker);
        
        // 分割当前行
        const beforeCursor = line.substring(0, cursorPos);
        const afterCursor = line.substring(cursorPos);
        
        // 新行：前缀 + 下一个列表标记 + 光标后内容
        const newLine = prefix + nextMarker + ' ' + afterCursor;
        
        editor.replaceRange(
            beforeCursor + '\n' + newLine,
            { line: cursor.line, ch: 0 },
            { line: cursor.line, ch: line.length }
        );
        
        editor.setCursor({ 
            line: cursor.line + 1, 
            ch: prefix.length + nextMarker.length + 1 
        });
    }

    /**
     * 处理：普通行换行
     * 行为：继承前缀，分割内容
     */
    handleNormalEnter(editor, cursor, line, parsed, cursorPos) {
        const prefix = this.extractPrefix(parsed);
        
        const beforeCursor = line.substring(0, cursorPos);
        const afterCursor = line.substring(cursorPos);
        
        const newText = beforeCursor + '\n' + prefix + afterCursor;
        
        editor.replaceRange(
            newText,
            { line: cursor.line, ch: 0 },
            { line: cursor.line, ch: line.length }
        );
        
        editor.setCursor({ line: cursor.line + 1, ch: prefix.length });
    }

    // ==================== 智能粘贴功能 ====================
    
    /**
     * 智能粘贴 - 完全重写
     */
    async smartPaste(editor) {
        try {
            const clipboardText = await navigator.clipboard.readText();
            if (!clipboardText) {
                return;
            }

            // 统一换行符
            const normalizedText = clipboardText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
            const lines = normalizedText.split('\n');

            // 单行直接粘贴
            if (lines.length <= 1) {
                editor.replaceSelection(normalizedText);
                return;
            }

            const cursor = editor.getCursor();
            const currentLine = editor.getLine(cursor.line);
            const currentParsed = this.parseLine(currentLine);

            // 获取目标前缀
            let destPrefix = this.extractPrefix(currentParsed);
            
            // 关键修复：只有当当前行完全为空（连前缀都没有）时，才向上查找
            // 如果当前行是 "> > > " 这样只有前缀的，应该直接使用这个前缀！
            if (currentLine.trim() === '' && destPrefix === '') {
                // 向上查找最近的非空行，使用它的前缀
                for (let i = cursor.line - 1; i >= 0; i--) {
                    const prevLine = editor.getLine(i);
                    if (prevLine.trim() !== '') {
                        const prevParsed = this.parseLine(prevLine);
                        destPrefix = this.extractPrefix(prevParsed);
                        break;
                    }
                }
            }

            // 解析所有源行
            const srcStructures = lines.map(line => this.parseLine(line));

            // 检测代码块
            const isCodeBlock = lines.length >= 2 &&
                              lines[0].trim().startsWith('```') &&
                              lines[lines.length - 1].trim().startsWith('```');

            console.log('粘贴调试:', {
                currentLine: currentLine,
                currentParsed: currentParsed,
                destPrefix: destPrefix,
                srcStructures: srcStructures,
                isCodeBlock: isCodeBlock
            });

            // 处理每一行
            const processedLines = lines.map((line, index) => {
                const struct = srcStructures[index];
                
                // 空行：只添加目标前缀
                if (struct.raw.trim() === '') {
                    return destPrefix;
                }
                
                // 代码块内部行：目标前缀 + 原始行
                if (isCodeBlock && index > 0 && index < lines.length - 1) {
                    return destPrefix + line;
                }
                
                // 常规行：直接拼接目标前缀 + 源前缀 + 列表标记 + 内容
                // 关键修复：不计算相对缩进，直接叠加，保持源内容的绝对缩进
                const srcPrefix = this.extractPrefix(struct);
                const mergedPrefix = destPrefix + srcPrefix;
                
                if (index === 0) {
                    console.log('第一行处理:', {
                        srcPrefix: srcPrefix,
                        destPrefix: destPrefix,
                        mergedPrefix: mergedPrefix,
                        listMarker: struct.listMarker,
                        content: struct.content
                    });
                }
                
                let result = mergedPrefix;
                if (struct.listMarker) {
                    result += struct.listMarker + ' ';
                }
                result += struct.content;
                
                return result;
            });

            const processedText = processedLines.join('\n');

            // 根据当前行状态决定插入方式
            if (currentParsed.content.trim() === '' && !currentParsed.listMarker) {
                // 当前行只有前缀：替换整行
                editor.replaceRange(
                    processedText,
                    { line: cursor.line, ch: 0 },
                    { line: cursor.line, ch: currentLine.length }
                );
            } else {
                // 当前行有内容：在光标位置插入
                if (cursor.ch >= currentLine.length) {
                    // 光标在行末：添加换行
                    editor.replaceSelection('\n' + processedText);
                } else {
                    // 光标在行中：直接插入
                    editor.replaceSelection(processedText);
                }
            }

            console.log('智能粘贴完成');

        } catch (error) {
            console.error('智能粘贴失败:', error);
            // 失败时回退
            try {
                const clipboardText = await navigator.clipboard.readText();
                editor.replaceSelection(clipboardText);
            } catch (fallbackError) {
                console.error('回退粘贴也失败:', fallbackError);
            }
        }
    }

    // ==================== 缩进和引用调整功能 ====================
    
    adjustBlockIndent(editor, increase) {
        const selection = editor.getSelection();
        
        if (selection) {
            const from = editor.getCursor('from');
            const to = editor.getCursor('to');
            const startLine = from.line;
            const endLine = to.line;
            
            let newLines = [];
            for (let i = startLine; i <= endLine; i++) {
                const line = editor.getLine(i);
                const newLine = increase ? '\t' + line : this.removeLeadingIndent(line);
                newLines.push(newLine);
            }
            
            const lastLineLength = editor.getLine(endLine).length;
            editor.replaceRange(
                newLines.join('\n'),
                { line: startLine, ch: 0 },
                { line: endLine, ch: lastLineLength }
            );
            
            editor.setSelection(
                { line: startLine, ch: 0 },
                { line: endLine, ch: newLines[newLines.length - 1].length }
            );
        } else {
            const cursor = editor.getCursor();
            const line = editor.getLine(cursor.line);
            const newLine = increase ? '\t' + line : this.removeLeadingIndent(line);
            
            editor.replaceRange(
                newLine,
                { line: cursor.line, ch: 0 },
                { line: cursor.line, ch: line.length }
            );
            
            const offset = newLine.length - line.length;
            editor.setCursor({ 
                line: cursor.line, 
                ch: Math.max(0, cursor.ch + offset) 
            });
        }
    }

    removeLeadingIndent(line) {
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

    adjustQuoteLevel(editor, increase) {
        const selection = editor.getSelection();
        
        if (selection) {
            const from = editor.getCursor('from');
            const to = editor.getCursor('to');
            const startLine = from.line;
            const endLine = to.line;
            
            let newLines = [];
            for (let i = startLine; i <= endLine; i++) {
                const line = editor.getLine(i);
                const parsed = this.parseLine(line);
                
                if (increase) {
                    // 在引用前添加 "> "
                    const newQuotes = '> ' + (parsed.quotes || '');
                    newLines.push(parsed.preQuoteIndent + newQuotes + parsed.postQuoteIndent + 
                                (parsed.listMarker ? parsed.listMarker + ' ' : '') + parsed.content);
                } else {
                    // 移除第一个 "> "
                    const newQuotes = parsed.quotes.replace(/^>\s?/, '');
                    newLines.push(parsed.preQuoteIndent + newQuotes + parsed.postQuoteIndent + 
                                (parsed.listMarker ? parsed.listMarker + ' ' : '') + parsed.content);
                }
            }
            
            const lastLineLength = editor.getLine(endLine).length;
            editor.replaceRange(
                newLines.join('\n'),
                { line: startLine, ch: 0 },
                { line: endLine, ch: lastLineLength }
            );
            
            editor.setSelection(
                { line: startLine, ch: 0 },
                { line: endLine, ch: newLines[newLines.length - 1].length }
            );
        } else {
            const cursor = editor.getCursor();
            const line = editor.getLine(cursor.line);
            const parsed = this.parseLine(line);
            
            let newLine;
            if (increase) {
                const newQuotes = '> ' + (parsed.quotes || '');
                newLine = parsed.preQuoteIndent + newQuotes + parsed.postQuoteIndent + 
                         (parsed.listMarker ? parsed.listMarker + ' ' : '') + parsed.content;
            } else {
                const newQuotes = parsed.quotes.replace(/^>\s?/, '');
                newLine = parsed.preQuoteIndent + newQuotes + parsed.postQuoteIndent + 
                         (parsed.listMarker ? parsed.listMarker + ' ' : '') + parsed.content;
            }
            
            editor.replaceRange(
                newLine,
                { line: cursor.line, ch: 0 },
                { line: cursor.line, ch: line.length }
            );
            
            const offset = newLine.length - line.length;
            editor.setCursor({ 
                line: cursor.line, 
                ch: Math.max(0, cursor.ch + offset) 
            });
        }
    }

    onunload() {
        console.log('卸载 Block Indent Controller v2.0');
    }
};
