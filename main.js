/**
 * Block Indent Controller Plugin v2.7.2
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
            hotkeys: [{ modifiers: ['Ctrl', 'Shift'], key: 'Enter' }],
            editorCallback: (editor) => {
                this.smartEnter(editor);
            }
        });

        // 命令7: 智能反向缩进 - 只减少引用符号后的缩进
        this.addCommand({
            id: 'smart-unindent',
            name: '智能反向缩进（保留引用前缩进）',
            hotkeys: [{ modifiers: ['Shift'], key: 'Tab' }],
            editorCallback: (editor) => {
                this.smartUnindent(editor);
            }
        });

        // 命令8: Shift+Enter - 硬换行（不延续列表）
        this.addCommand({
            id: 'hard-newline',
            name: '硬换行（不延续列表）',
            hotkeys: [{ modifiers: ['Shift'], key: 'Enter' }],
            editorCallback: (editor) => {
                this.hardNewline(editor);
            }
        });

        // 命令9: 修复列表序号
        this.addCommand({
            id: 'fix-list-numbers',
            name: '修复列表序号（按缩进层级独立计数）',
            editorCallback: (editor) => {
                this.fixListNumbers(editor);
            }
        });
    }

    // ==================== 核心数据结构 ====================
    
    /**
     * 解析行结构 - 保持字符串形式
     * 
     * 支持多组引用符号（例如：\t> > \t> > 1. 内容）
     * 
     * 返回结构：
     * {
     *   raw: 原始行字符串,
     *   preQuoteIndent: 引用前缩进字符串,
     *   quotes: 引用符号字符串（包含所有组的引用符），
     *   postQuoteIndent: 引用后缩进字符串（最后一组引用后的缩进）,
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
        
        // 2. 解析所有引用符号（支持多组）
        // 例如：> > \t> > 会被完整识别
        let quotes = '';
        
        while (pos < len) {
            // 尝试识别一组引用符号
            let hasQuote = false;
            while (pos < len && line[pos] === '>') {
                quotes += '>';
                pos++;
                hasQuote = true;
                // 引用符号后通常有一个空格
                if (pos < len && line[pos] === ' ') {
                    quotes += ' ';
                    pos++;
                }
            }
            
            // 如果这次循环没有识别到引用符，说明引用符已经结束
            if (!hasQuote) {
                break;
            }
            
            // 检查是否有缩进后跟更多引用符
            let tempPos = pos;
            let tempIndent = '';
            while (tempPos < len && (line[tempPos] === ' ' || line[tempPos] === '\t')) {
                tempIndent += line[tempPos];
                tempPos++;
            }
            
            // 如果缩进后还有引用符，将缩进加入 quotes 并继续
            if (tempPos < len && line[tempPos] === '>') {
                quotes += tempIndent;
                pos = tempPos;
                // 继续下一轮循环识别下一组引用符
            } else {
                // 没有更多引用符了，退出循环
                break;
            }
        }
        
        // 3. 解析引用后缩进（最后一组引用后的缩进）
        let postQuoteIndent = '';
        while (pos < len && (line[pos] === ' ' || line[pos] === '\t')) {
            postQuoteIndent += line[pos];
            pos++;
        }
        
        const prefixEnd = pos;
        
        // 4. 解析列表标记
        let listMarker = null;
        let listType = null; // 'ordered', 'unordered', 'task'
        let taskState = null; // ' ', 'x', 'X' for task lists
        let markerEnd = pos;
        
        const remaining = line.substring(pos);
        
        // 任务列表: - [ ] 或 - [x] 或 - [X]
        const taskMatch = remaining.match(/^([-*+])\s+\[([xX ])\]\s+/);
        if (taskMatch) {
            listMarker = taskMatch[1];
            listType = 'task';
            taskState = taskMatch[2];
            markerEnd = pos + taskMatch[0].length;
        } else {
            // 无序列表: - * +
            const unorderedMatch = remaining.match(/^([-*+])\s+/);
            if (unorderedMatch) {
                listMarker = unorderedMatch[1];
                listType = 'unordered';
                markerEnd = pos + unorderedMatch[0].length;
            } else {
                // 有序列表: 1. 2. 等
                const orderedMatch = remaining.match(/^(\d+\.)\s+/);
                if (orderedMatch) {
                    listMarker = orderedMatch[1];
                    listType = 'ordered';
                    markerEnd = pos + orderedMatch[0].length;
                }
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
            listType,
            taskState,
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
            if (structure.listType === 'task' && structure.taskState) {
                line += '[' + structure.taskState + '] ';
            }
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
     * 构建列表标记部分（包括任务状态）
     * 返回完整的列表标记字符串（如 "1. " 或 "- [ ] "）
     */
    buildListMarkerString(structure) {
        if (!structure.listMarker) {
            return '';
        }
        
        let marker = structure.listMarker + ' ';
        if (structure.listType === 'task' && structure.taskState) {
            marker += '[' + structure.taskState + '] ';
        }
        return marker;
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
     * 
     * 关键改进：根据前缀最后的符号类型决定行为
     * - 如果最后是引用符 > : 触发引用退出逻辑
     * - 如果最后是缩进符 \t或空格 : 触发缩进退出逻辑
     */
    smartEnter(editor) {
        const cursor = editor.getCursor();
        const line = editor.getLine(cursor.line);
        const cursorPos = cursor.ch;
        
        const parsed = this.parseLine(line);
        
        // === 场景判断 ===
        
        // 场景1: 空行且无列表标记
        // 退出优先级：postQuoteIndent → quotes → preQuoteIndent
        if (!parsed.listMarker && parsed.content.trim() === '') {
            // 优先级1: 如果有 postQuoteIndent（引用后缩进），减少它
            if (parsed.postQuoteIndent) {
                this.handleEmptyIndentEnter(editor, cursor, line, parsed);
                return;
            }
            
            // 优先级2: 如果有 quotes（引用符），减少它
            if (parsed.quotes) {
                this.handleEmptyQuoteEnter(editor, cursor, line, parsed);
                return;
            }
            
            // 优先级3: 如果有 preQuoteIndent（引用前缩进），减少它
            if (parsed.preQuoteIndent) {
                this.handleEmptyIndentEnter(editor, cursor, line, parsed);
                return;
            }
        }
        
        // 场景2: 光标在前缀中（引用、缩进部分）
        // 注意：要排除已经被场景1和场景1.5处理的空行
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
     * - 在空引用行按 Enter，删除最后一个引用符 >
     * - 保持 quotes 的完整结构（包括中间的缩进）
     * - 例如：`\t\t> > > \t> > ` → `\t\t> > > \t> `
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
            // 当前行变成只有 preQuoteIndent，新行也一样
            const newStructure = {
                ...parsed,
                quotes: '',
                postQuoteIndent: ''
            };
            const newLine = this.rebuildLine(newStructure);
            const newText = newLine + '\n' + newLine;
            
            editor.replaceRange(
                newText,
                { line: cursor.line, ch: 0 },
                { line: cursor.line, ch: line.length }
            );
            
            editor.setCursor({ 
                line: cursor.line + 1, 
                ch: newLine.length
            });
            return;
        }
        
        // 减少一层引用：使用 removeLastQuoteSymbol 保持结构
        const newQuotes = this.removeLastQuoteSymbol(parsed.quotes);
        
        // 构建新结构
        const newStructure = {
            ...parsed,
            quotes: newQuotes
        };
        
        const newLine = this.rebuildLine(newStructure);
        
        // 替换当前行并插入新行
        const newText = newLine + '\n' + newLine;
        
        editor.replaceRange(
            newText,
            { line: cursor.line, ch: 0 },
            { line: cursor.line, ch: line.length }
        );
        
        // 光标移到新行
        editor.setCursor({ line: cursor.line + 1, ch: newLine.length });
    }

    /**
     * 处理：空缩进行换行
     * 行为：逐层退出缩进
     * 
     * 逻辑：
     * - 优先减少 postQuoteIndent（引用后缩进）
     * - 如果没有 postQuoteIndent，且没有 quotes，才减少 preQuoteIndent
     * - 保持结构完整性
     * 
     * 注意：此函数被调用时，意味着应该减少缩进，而不是引用符
     */
    handleEmptyIndentEnter(editor, cursor, line, parsed) {
        let newStructure;
        
        // 优先级1: 如果有 postQuoteIndent，减少它
        if (parsed.postQuoteIndent) {
            const newPostIndent = this.removeOneIndentUnit(parsed.postQuoteIndent);
            newStructure = {
                ...parsed,
                postQuoteIndent: newPostIndent
            };
        }
        // 优先级2: 如果有 preQuoteIndent（且没有 quotes），减少它
        else if (parsed.preQuoteIndent && !parsed.quotes) {
            const newPreIndent = this.removeOneIndentUnit(parsed.preQuoteIndent);
            newStructure = {
                ...parsed,
                preQuoteIndent: newPreIndent
            };
        }
        // 没有缩进，正常换行
        else {
            this.handleNormalEnter(editor, cursor, line, parsed, cursor.ch);
            return;
        }
        
        const newLine = this.rebuildLine(newStructure);
        const newText = newLine + '\n' + newLine;
        
        editor.replaceRange(
            newText,
            { line: cursor.line, ch: 0 },
            { line: cursor.line, ch: line.length }
        );
        
        // 光标移到新行
        editor.setCursor({ line: cursor.line + 1, ch: newLine.length });
    }

    /**
     * 辅助函数：移除一个缩进单位
     * 优先移除 Tab，其次移除 4 个空格，再次移除较少的空格
     */
    removeOneIndentUnit(indent) {
        // 从末尾开始移除
        if (indent.endsWith('\t')) {
            return indent.substring(0, indent.length - 1);
        } else if (indent.endsWith('    ')) {
            // 移除 4 个空格
            return indent.substring(0, indent.length - 4);
        } else if (indent.endsWith('   ')) {
            // 移除 3 个空格
            return indent.substring(0, indent.length - 3);
        } else if (indent.endsWith('  ')) {
            // 移除 2 个空格
            return indent.substring(0, indent.length - 2);
        } else if (indent.endsWith(' ')) {
            // 移除 1 个空格
            return indent.substring(0, indent.length - 1);
        }
        return indent;
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
        // 如果是任务列表（有 taskState），并且还没有被去掉，先变成普通无序列表
        if (parsed.listType === 'task') {
            const newStructure = {
                ...parsed,
                listType: 'unordered',
                taskState: null
            };
            const newLine = this.rebuildLine(newStructure);
            editor.replaceRange(
                newLine,
                { line: cursor.line, ch: 0 },
                { line: cursor.line, ch: line.length }
            );
            editor.setCursor({ line: cursor.line, ch: newLine.length });
            return;
        }

        // 否则是普通列表项，直接退出列表（移除 listMarker，保留前缀）
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
        
        // 构建新的列表行
        let newLine = prefix + nextMarker + ' ';
        
        // 如果是任务列表，添加未完成的复选框
        if (parsed.listType === 'task') {
            newLine += '[ ] ';
        }
        
        newLine += afterCursor;
        
        editor.replaceRange(
            beforeCursor + '\n' + newLine,
            { line: cursor.line, ch: 0 },
            { line: cursor.line, ch: line.length }
        );
        
        // 计算光标位置
        let cursorCh = prefix.length + nextMarker.length + 1;
        if (parsed.listType === 'task') {
            cursorCh += 4; // '[ ] ' 的长度
        }
        
        editor.setCursor({ 
            line: cursor.line + 1, 
            ch: cursorCh
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

            // 获取目标前缀：直接使用当前行的前缀，不向上查找
            // 这样在空行粘贴时会保持粘贴内容的原始缩进结构
            const destPrefix = this.extractPrefix(currentParsed);

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
                result += this.buildListMarkerString(struct);
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

    /**
     * 增加引用符（在最后一组引用符末尾添加）
     */
    addLastQuoteSymbol(quotes) {
        if (!quotes) {
            return '> ';
        }
        // 直接在末尾添加 "> "
        return quotes + '> ';
    }

    /**
     * 减少引用符（删除最后一组引用符的最后一个 >）
     */
    removeLastQuoteSymbol(quotes) {
        if (!quotes) {
            return '';
        }
        
        // 从末尾删除最后一个 "> " 或 ">"
        // 需要处理末尾可能有空格的情况
        
        // 情况1: 末尾是 "> "（引用符+空格）
        if (quotes.endsWith('> ')) {
            return quotes.substring(0, quotes.length - 2);
        }
        
        // 情况2: 末尾是 ">"（只有引用符，无空格）
        if (quotes.endsWith('>')) {
            return quotes.substring(0, quotes.length - 1);
        }
        
        // 理论上不应该到这里，但为了安全返回原值
        return quotes;
    }

    adjustQuoteLevel(editor, increase) {
        const selection = editor.getSelection();
        
        if (selection) {
            const from = editor.getCursor('from');
            const to = editor.getCursor('to');
            const startLine = from.line;
            const endLine = to.line;
            
            // 以首行的 preQuoteIndent 为基准：
            // 无引用层级时，引用符统一插入在该缩进之后
            const firstParsed = this.parseLine(editor.getLine(startLine));
            const baseIndent = firstParsed.preQuoteIndent;
            
            let newLines = [];
            for (let i = startLine; i <= endLine; i++) {
                const line = editor.getLine(i);
                const parsed = this.parseLine(line);
                
                let newStructure;
                if (increase) {
                    if (!parsed.quotes) {
                        // 无引用层级：在基准缩进之后插入引用符
                        // 本行超出基准缩进的部分移入 postQuoteIndent
                        const extraIndent = parsed.preQuoteIndent.startsWith(baseIndent)
                            ? parsed.preQuoteIndent.slice(baseIndent.length)
                            : parsed.preQuoteIndent;
                        newStructure = {
                            ...parsed,
                            preQuoteIndent: baseIndent,
                            quotes: '> ',
                            postQuoteIndent: extraIndent + parsed.postQuoteIndent
                        };
                    } else {
                        // 已有引用层级：在最后一组引用符末尾追加 "> "
                        newStructure = {
                            ...parsed,
                            quotes: this.addLastQuoteSymbol(parsed.quotes)
                        };
                    }
                } else {
                    // 删除最后一组引用符的最后一个 ">"
                    newStructure = {
                        ...parsed,
                        quotes: this.removeLastQuoteSymbol(parsed.quotes)
                    };
                }
                
                newLines.push(this.rebuildLine(newStructure));
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
            // 单行：基准缩进 = 本行自身的 preQuoteIndent
            const baseIndent = parsed.preQuoteIndent;
            
            let newStructure;
            if (increase) {
                if (!parsed.quotes) {
                    // 无引用层级：在基准缩进之后插入引用符（extraIndent 为空）
                    newStructure = {
                        ...parsed,
                        preQuoteIndent: baseIndent,
                        quotes: '> ',
                        postQuoteIndent: parsed.postQuoteIndent
                    };
                } else {
                    // 已有引用层级：在最后一组引用符末尾追加 "> "
                    newStructure = {
                        ...parsed,
                        quotes: this.addLastQuoteSymbol(parsed.quotes)
                    };
                }
            } else {
                // 删除最后一组引用符的最后一个 ">"
                newStructure = {
                    ...parsed,
                    quotes: this.removeLastQuoteSymbol(parsed.quotes)
                };
            }
            
            const newLine = this.rebuildLine(newStructure);
            
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

    /**
     * 智能反向缩进 - 只减少引用后的缩进
     * 
     * 核心逻辑：
     * - 如果行中有引用符号(>)，只减少引用后的缩进(postQuoteIndent)
     * - 如果行中没有引用符号，正常减少行首缩进(preQuoteIndent)
     * 
     * 这样可以保护引用前的缩进不被Shift+Tab影响
     */
    smartUnindent(editor) {
        const selection = editor.getSelection();
        
        if (selection) {
            // 处理多行选中的情况
            const from = editor.getCursor('from');
            const to = editor.getCursor('to');
            const startLine = from.line;
            const endLine = to.line;
            
            let newLines = [];
            for (let i = startLine; i <= endLine; i++) {
                const line = editor.getLine(i);
                const parsed = this.parseLine(line);
                
                let newStructure;
                if (parsed.quotes) {
                    // 有引用符号：只减少引用后的缩进
                    const reducedPostIndent = this.removeLeadingIndent(parsed.postQuoteIndent);
                    newStructure = {
                        ...parsed,
                        postQuoteIndent: reducedPostIndent
                    };
                } else {
                    // 没有引用符号：正常减少行首缩进
                    const reducedPreIndent = this.removeLeadingIndent(parsed.preQuoteIndent);
                    newStructure = {
                        ...parsed,
                        preQuoteIndent: reducedPreIndent
                    };
                }
                
                newLines.push(this.rebuildLine(newStructure));
            }
            
            const lastLineLength = editor.getLine(endLine).length;
            editor.replaceRange(
                newLines.join('\n'),
                { line: startLine, ch: 0 },
                { line: endLine, ch: lastLineLength }
            );
            
            // 保持选中状态
            editor.setSelection(
                { line: startLine, ch: 0 },
                { line: endLine, ch: newLines[newLines.length - 1].length }
            );
        } else {
            // 处理单行的情况
            const cursor = editor.getCursor();
            const line = editor.getLine(cursor.line);
            const parsed = this.parseLine(line);
            
            let newStructure;
            if (parsed.quotes) {
                // 有引用符号：只减少引用后的缩进
                const reducedPostIndent = this.removeLeadingIndent(parsed.postQuoteIndent);
                newStructure = {
                    ...parsed,
                    postQuoteIndent: reducedPostIndent
                };
            } else {
                // 没有引用符号：正常减少行首缩进
                const reducedPreIndent = this.removeLeadingIndent(parsed.preQuoteIndent);
                newStructure = {
                    ...parsed,
                    preQuoteIndent: reducedPreIndent
                };
            }
            
            const newLine = this.rebuildLine(newStructure);
            
            editor.replaceRange(
                newLine,
                { line: cursor.line, ch: 0 },
                { line: cursor.line, ch: line.length }
            );
            
            // 调整光标位置
            const offset = newLine.length - line.length;
            editor.setCursor({ 
                line: cursor.line, 
                ch: Math.max(0, cursor.ch + offset) 
            });
        }
    }

    /**
     * 硬换行 - Shift+Enter
     * 行为：简单换行，继承前缀但不延续列表标记
     * 
     * 与 Obsidian 智能列表的 Shift+Enter 行为一致：
     * - 在列表中按 Shift+Enter 会换行但不创建新的列表项
     * - 只继承引用符号和缩进，不继承列表标记
     */
    hardNewline(editor) {
        const cursor = editor.getCursor();
        const line = editor.getLine(cursor.line);
        const cursorPos = cursor.ch;
        
        const parsed = this.parseLine(line);
        
        // 获取前缀（不包含列表标记）
        const prefix = this.extractPrefix(parsed);
        
        // 分割当前行
        const beforeCursor = line.substring(0, cursorPos);
        const afterCursor = line.substring(cursorPos);
        
        // 构建新文本：当前行 + 换行 + 前缀 + 光标后内容
        const newText = beforeCursor + '\n' + prefix + afterCursor;
        
        editor.replaceRange(
            newText,
            { line: cursor.line, ch: 0 },
            { line: cursor.line, ch: line.length }
        );
        
        // 光标移到新行的前缀之后
        editor.setCursor({ line: cursor.line + 1, ch: prefix.length });
    }

    /**
     * 修复列表序号 - 按缩进层级独立计数
     * 
     * 核心算法：
     * 1. 遍历所有行，识别有序列表
     * 2. 为每个"前缀+缩进层级"组合维护独立的计数器
     * 3. 这样可以正确处理多引用层级中的列表
     * 
     * 关键改进：
     * - 不同缩进层级的列表独立计数
     * - 不同引用层级的列表独立计数
     * - 避免 Obsidian 原生智能列表的跨层级序号错误
     * 
     * 智能列表冲突处理：
     * - 执行前临时禁用 Obsidian 智能列表
     * - 执行完成后恢复原设置
     * - 避免修复的序号被立即覆盖
     */
    fixListNumbers(editor) {
        // 保存当前智能列表设置
        const originalSmartListSetting = this.app.vault.getConfig('smartIndentList');
        
        // 临时禁用智能列表
        if (originalSmartListSetting !== false) {
            this.app.vault.setConfig('smartIndentList', false);
        }
        
        const selection = editor.getSelection();
        let startLine, endLine;
        
        if (selection) {
            // 处理选中范围
            const from = editor.getCursor('from');
            const to = editor.getCursor('to');
            startLine = from.line;
            endLine = to.line;
        } else {
            // 处理整个文档
            startLine = 0;
            endLine = editor.lastLine();
        }
        
        // 解析所有行
        const lines = [];
        const parsed = [];
        for (let i = startLine; i <= endLine; i++) {
            const line = editor.getLine(i);
            lines.push(line);
            parsed.push(this.parseLine(line));
        }
        
        // 为每个"前缀+缩进层级"维护计数器
        // key = prefix + postQuoteIndent (用于区分不同的嵌套层级)
        const counters = new Map();
        
        // 遍历并调整序号
        const newLines = [];
        for (let i = 0; i < parsed.length; i++) {
            const p = parsed[i];
            
            // 只处理有序列表
            if (p.listType !== 'ordered') {
                newLines.push(lines[i]);
                continue;
            }
            
            // 构建层级键：前缀(引用符号) + 缩进(postQuoteIndent)
            // 这样不同引用层级和不同缩进层级的列表会有不同的键
            const levelKey = (p.preQuoteIndent || '') + (p.quotes || '') + (p.postQuoteIndent || '');
            
            // 检查是否是列表的第一项（序号为 1）
            // 或者上一行不是列表/是不同层级的列表
            let shouldResetCounter = false;
            
            if (i === 0) {
                shouldResetCounter = true;
            } else {
                const prevParsed = parsed[i - 1];
                
                // 上一行不是有序列表，或者层级不同
                if (prevParsed.listType !== 'ordered') {
                    shouldResetCounter = true;
                } else {
                    const prevLevelKey = (prevParsed.preQuoteIndent || '') + (prevParsed.quotes || '') + (prevParsed.postQuoteIndent || '');
                    
                    // 如果层级键不同，说明是不同的列表
                    if (prevLevelKey !== levelKey) {
                        shouldResetCounter = true;
                    }
                    
                    // 如果当前缩进小于等于前一行，且是同层级，检查是否应该延续
                    if (prevLevelKey === levelKey) {
                        // 同一层级，延续计数
                        shouldResetCounter = false;
                    } else if (levelKey.length < prevLevelKey.length) {
                        // 缩进减少，可能是返回上一层级
                        shouldResetCounter = false;
                    }
                }
            }
            
            // 获取或初始化计数器
            if (shouldResetCounter || !counters.has(levelKey)) {
                counters.set(levelKey, 1);
            }
            
            const currentNumber = counters.get(levelKey);
            
            // 构建新的列表标记
            const newMarker = currentNumber + '.';
            
            // 更新解析结构的 listMarker
            const updatedParsed = {
                ...p,
                listMarker: newMarker
            };
            
            // 使用 rebuildLine 重建行（保持一致性，处理任务列表等）
            const newLine = this.rebuildLine(updatedParsed);
            
            newLines.push(newLine);
            
            // 递增计数器
            counters.set(levelKey, currentNumber + 1);
        }
        
        // 替换文本
        const lastLineLength = editor.getLine(endLine).length;
        editor.replaceRange(
            newLines.join('\n'),
            { line: startLine, ch: 0 },
            { line: endLine, ch: lastLineLength }
        );
        
        // 使用 setTimeout 确保文本替换完成后再恢复智能列表设置
        // 这样可以避免智能列表在我们修复期间触发
        setTimeout(() => {
            // 恢复原始智能列表设置
            if (originalSmartListSetting !== false) {
                this.app.vault.setConfig('smartIndentList', originalSmartListSetting);
            }
        }, 100);
        
        console.log('列表序号已修复');
    }

    onunload() {
        console.log('卸载 Block Indent Controller v2.0');
    }
};
