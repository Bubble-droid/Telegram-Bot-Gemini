// src/api/sendMessage.js

// 保留之前的格式化函数 formatToMarkdownV2, formatToHTML, formatToMarkdownLegacy, formatText
// 确保它们在作用域内可用，并已包含之前修正的语法错误。
// (此处省略具体实现，假设与之前提供的一致，并已修正 MarkdownV2/Legacy 行内代码语法错误)

/**
 * 将标准 Markdown 文本格式化为 Telegram Bot API 的 MarkdownV2 格式。
 * @param {string} markdownText - 标准 Markdown 格式的输入文本。
 * @returns {string} 格式化为 MarkdownV2 的文本。
 */
function formatToMarkdownV2(markdownText) {
	const escapeMarkdownV2General = (str) => {
		return str.replace(/([_\*\[\]\(\)~`>#+-=|{}.!\\])/g, '\\$1');
	};
	const escapeMarkdownV2Code = (str) => {
		return str.replace(/([`\\])/g, '\\$1');
	};
	const escapeMarkdownV2LinkUrl = (str) => {
		return str.replace(/([\)\\])/g, '\\$1');
	};

	let processedText = markdownText;

	processedText = processedText.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
		const escapedCode = escapeMarkdownV2Code(code);
		return `\`\`\`${lang}\n${escapedCode}\`\`\``;
	});

	processedText = processedText.replace(/`(.*?)`/g, (match, code) => {
		const escapedCode = escapeMarkdownV2Code(code);
		return `\`${escapedCode}\``; // 修正语法
	});

	processedText = processedText.replace(/\[(.*?)\]\((.*?)\)/g, (match, text, url) => {
		const escapedText = escapeMarkdownV2General(text);
		const escapedUrl = escapeMarkdownV2LinkUrl(url);
		return `[${escapedText}](${escapedUrl})`;
	});

	processedText = processedText.replace(/~~(.*?)~~/g, (match, content) => {
		const escapedContent = escapeMarkdownV2General(content);
		return `~~${escapedContent}~~`;
	});

	processedText = processedText.replace(/\*\*(.*?)\*\*/g, (match, content) => {
		const escapedContent = escapeMarkdownV2General(content);
		return `*${escapedContent}*`;
	});
	processedText = processedText.replace(/__(.*?)__/g, (match, content) => {
		const escapedContent = escapeMarkdownV2General(content);
		return `*${escapedContent}*`;
	});

	processedText = processedText.replace(/(?<!\*)\*(?!\*)(?!\s)(.*?)(?<!\s)\*(?!\*)/g, (match, content) => {
		const escapedContent = escapeMarkdownV2General(content);
		return `_${escapedContent}_`;
	});
	processedText = processedText.replace(/(?<!_)_(?!_)(?!\s)(.*?)(?<!\s)_(?!_)/g, (match, content) => {
		const escapedContent = escapeMarkdownV2General(content);
		return `_${escapedContent}_`;
	});

	const lines = processedText.split('\n');
	const processedLines = lines.map((line) => {
		if (line.startsWith('> ')) {
			return '> ' + escapeMarkdownV2General(line.substring(2));
		}
		return line;
	});
	processedText = processedLines.join('\n');

	let finalResult = '';
	let k = 0;
	const mv2SpecialChars = '_*[]()~`>#+-=|{}.!\\';
	const markersToSkip = ['```', '~~', '||', '[', '(', '> '];

	while (k < processedText.length) {
		let isMarker = false;
		for (const marker of markersToSkip) {
			if (processedText.substring(k, k + marker.length) === marker) {
				finalResult += marker;
				k += marker.length;
				isMarker = true;
				break;
			}
		}
		if (isMarker) continue;

		if (processedText[k] === ']' || processedText[k] === ')') {
			finalResult += processedText[k];
			k++;
			continue;
		}

		const char = processedText[k];
		if (mv2SpecialChars.includes(char)) {
			finalResult += '\\' + char;
			k++;
		} else {
			finalResult += char;
			k++;
		}
	}

	return finalResult;
}

/**
 * 将标准 Markdown 文本格式化为 Telegram Bot API 的 HTML 格式。
 * @param {string} markdownText - 标准 Markdown 格式的输入文本。
 * @returns {string} 格式化为 HTML 的文本。
 */
function formatToHTML(markdownText) {
	const escapeHTML = (str) => {
		return str.replace(/[<>&]/g, (c) => {
			switch (c) {
				case '<':
					return '&lt';
				case '>':
					return '&gt';
				case '&':
					return '&amp;';
				default:
					return c;
			}
		});
	};

	let processedText = markdownText;

	processedText = processedText.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
		const escapedCode = escapeHTML(code);
		if (lang) {
			return `<pre><code class="language-${lang}">${escapedCode}</code></pre>`;
		}
		return `<pre>${escapedCode}</pre>`;
	});

	processedText = processedText.replace(/`(.*?)`/g, (match, code) => {
		const escapedCode = escapeHTML(code);
		return `<code>${escapedCode}</code>`;
	});

	processedText = processedText.replace(/\[(.*?)\]\((.*?)\)/g, (match, text, url) => {
		const escapedText = escapeHTML(text);
		const escapedUrl = escapeHTML(url);
		return `<a href="${escapedUrl}">${escapedText}</a>`;
	});

	processedText = processedText.replace(/~~(.*?)~~/g, (match, content) => {
		const escapedContent = escapeHTML(content);
		return `<s>${escapedContent}</s>`;
	});

	processedText = processedText.replace(/\*\*(.*?)\*\*/g, (match, content) => {
		const escapedContent = escapeHTML(content);
		return `<b>${escapedContent}</b>`;
	});
	processedText = processedText.replace(/__(.*?)__/g, (match, content) => {
		const escapedContent = escapeHTML(content);
		return `<b>${escapedContent}</b>`;
	});

	processedText = processedText.replace(/(?<!\*)\*(?!\*)(?!\s)(.*?)(?<!\s)\*(?!\*)/g, (match, content) => {
		const escapedContent = escapeHTML(content);
		return `<i>${escapedContent}</i>`;
	});
	processedText = processedText.replace(/(?<!_)_(?!_)(?!\s)(.*?)(?<!\s)_(?!_)/g, (match, content) => {
		const escapedContent = escapeHTML(content);
		return `<i>${escapedContent}</i>`;
	});

	const lines = processedText.split('\n');
	let finalLines = [];
	let currentBlockquote = [];

	for (const line of lines) {
		if (line.startsWith('> ')) {
			currentBlockquote.push(line.substring(2));
		} else {
			if (currentBlockquote.length > 0) {
				finalLines.push(`<blockquote>${escapeHTML(currentBlockquote.join('\n'))}</blockquote>`);
				currentBlockquote = [];
			}
			finalLines.push(line);
		}
	}
	if (currentBlockquote.length > 0) {
		finalLines.push(`<blockquote>${escapeHTML(currentBlockquote.join('\n'))}</blockquote>`);
	}
	processedText = finalLines.join('\n');

	let finalResult = '';
	let k = 0;
	let inTag = false;

	while (k < processedText.length) {
		const char = processedText[k];

		if (char === '<') {
			inTag = true;
			finalResult += char;
		} else if (char === '>') {
			inTag = false;
			finalResult += char;
		} else if (inTag) {
			finalResult += char;
		} else {
			finalResult += escapeHTML(char);
		}
		k++;
	}

	return finalResult;
}

/**
 * 将标准 Markdown 文本格式化为 Telegram Bot API 的 Markdown (Legacy) 格式。
 * @param {string} markdownText - 标准 Markdown 格式的输入文本。
 * @returns {string} 格式化为 Markdown (Legacy) 的文本。
 */
function formatToMarkdownLegacy(markdownText) {
	const escapeMarkdownLegacyGeneral = (str) => {
		return str.replace(/([_\*`\[\\])/g, '\\$1');
	};
	const escapeMarkdownLegacyCode = (str) => {
		return str.replace(/([`\\])/g, '\\$1');
	};

	let processedText = markdownText;

	processedText = processedText.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
		const escapedCode = escapeMarkdownLegacyCode(code);
		return `\`\`\`${escapedCode}\`\`\``;
	});

	processedText = processedText.replace(/`(.*?)`/g, (match, code) => {
		const escapedCode = escapeMarkdownLegacyCode(code);
		return `\`${escapedCode}\``; // 修正语法
	});

	processedText = processedText.replace(/\[(.*?)\]\((.*?)\)/g, (match, text, url) => {
		const linkText = text;
		const linkUrl = url;
		return `[${linkText}](${linkUrl})`;
	});

	processedText = processedText.replace(/\*\*(.*?)\*\*/g, (match, content) => {
		const innerContent = content;
		return `*${innerContent}*`;
	});
	processedText = processedText.replace(/__(.*?)__/g, (match, content) => {
		const innerContent = content;
		return `*${innerContent}*`;
	});

	processedText = processedText.replace(/(?<!\*)\*(?!\*)(?!\s)(.*?)(?<!\s)\*(?!\*)/g, (match, content) => {
		const innerContent = content;
		return `_${innerContent}_`;
	});
	processedText = processedText.replace(/(?<!_)_(?!_)(?!\s)(.*?)(?<!\s)_(?!_)/g, (match, content) => {
		const innerContent = content;
		return `_${innerContent}_`;
	});

	let finalResult = '';
	let k = 0;
	const legacySpecialChars = '_*`[';
	const markersToSkip = ['```', '[', '('];

	while (k < processedText.length) {
		let isMarker = false;
		for (const marker of markersToSkip) {
			if (processedText.substring(k, k + marker.length) === marker) {
				finalResult += marker;
				k += marker.length;
				isMarker = true;
				break;
			}
		}
		if (isMarker) continue;

		if (processedText[k] === ']' || processedText[k] === ')') {
			finalResult += processedText[k];
			k++;
			continue;
		}

		const char = processedText[k];
		if (legacySpecialChars.includes(char)) {
			finalResult += '\\' + char;
			k++;
		} else if (char === '\\') {
			finalResult += '\\' + char;
			k++;
		} else {
			finalResult += char;
			k++;
		}
	}

	return finalResult;
}

/**
 * 根据 parseMode 格式化文本。
 * @param {string} text - 原始或部分原始文本。
 * @param {string | null} parseMode - 目标格式 ('HTML', 'MarkdownV2', 'Markdown', null)。
 * @returns {string} 格式化后的文本。
 * @throws {Error} 如果 parseMode 无效 (除了 null)。
 */
function formatText(text, parseMode) {
	if (parseMode === null) {
		return text;
	}
	switch (parseMode) {
		case 'HTML':
			return formatToHTML(text);
		case 'MarkdownV2':
			return formatToMarkdownV2(text);
		case 'Markdown':
			return formatToMarkdownLegacy(text);
		default:
			throw new Error(`不支持的 parseMode: ${parseMode}`);
	}
}

/**
 * 获取指定格式模式下，给定标记类型的开放标记字符串。
 * @param {string} type - 标记类型 (例如 'b', 'i', 'code', 'mv2_bold', 'mv2_italic', 'legacy_bold', 'legacy_italic', 'link_text', 'link_url', 'spoiler', 'strikethrough', 'pre', 'blockquote')。
 * @param {string | null} parseMode - 解析模式。
 * @returns {string} 开放标记字符串。
 */
function getOpeningTagString(type, parseMode) {
	if (parseMode === 'HTML') {
		switch (type) {
			case 'b':
			case 'strong':
				return '<b>';
			case 'i':
			case 'em':
				return '<i>';
			case 'u':
			case 'ins':
				return '<u>';
			case 's':
			case 'strike':
			case 'del':
				return '<s>';
			case 'span': // Used for spoiler
			case 'tg-spoiler':
				return '<span class="tg-spoiler">';
			case 'a':
				// 链接需要特殊处理，这里只返回 <a> 的开始，href 在 balanceChunkTags 中处理
				return '<a href="">'; // 占位符，实际 href 在 balanceChunkTags 中处理
			case 'code':
				return '<code>';
			case 'pre':
				// <pre> 可能包含 <code> 标签，这里只返回 <pre> 的开始
				return '<pre>';
			case 'blockquote':
				return '<blockquote>';
			case 'blockquote_expandable':
				return '<blockquote expandable>';
			default:
				return '';
		}
	} else if (parseMode === 'MarkdownV2') {
		switch (type) {
			case 'mv2_bold':
				return '*';
			case 'mv2_italic':
				return '_';
			case 'mv2_underline':
				return '__';
			case 'mv2_strikethrough':
				return '~~';
			case 'mv2_spoiler':
				return '||';
			case 'mv2_code_inline':
				return '`';
			case 'mv2_code_block':
				// 代码块需要语言信息，这里只返回开始标记，语言在 balanceChunkTags 中处理
				return '```'; // 占位符
			case 'mv2_link':
				// 链接需要文本和 URL，这里只返回 [ ，文本和 URL 在 balanceChunkTags 中处理
				return '['; // 占位符
			case 'mv2_blockquote':
				return '> '; // 块引用是行前缀，跨行处理复杂，这里作为标记类型
			case 'mv2_blockquote_expandable':
				return '> '; // 可展开块引用也是行前缀
			default:
				return '';
		}
	} else if (parseMode === 'Markdown') {
		// Legacy
		switch (type) {
			case 'legacy_bold':
				return '*';
			case 'legacy_italic':
				return '_';
			case 'legacy_code_inline':
				return '`';
			case 'legacy_code_block':
				return '```';
			case 'legacy_link':
				return '['; // 占位符
			default:
				return ''; // Legacy 不支持其他格式
		}
	}
	return '';
}

/**
 * 获取指定格式模式下，给定标记类型的闭合标记字符串。
 * @param {string} type - 标记类型。
 * @param {string | null} parseMode - 解析模式。
 * @returns {string} 闭合标记字符串。
 */
function getClosingTagString(type, parseMode) {
	if (parseMode === 'HTML') {
		switch (type) {
			case 'b':
			case 'strong':
				return '</b>';
			case 'i':
			case 'em':
				return '</i>';
			case 'u':
			case 'ins':
				return '</u>';
			case 's':
			case 'strike':
			case 'del':
				return '</s>';
			case 'span': // Used for spoiler
			case 'tg-spoiler':
				return '</span>';
			case 'a':
				return '</a>';
			case 'code':
				return '</code>';
			case 'pre':
				return '</pre>';
			case 'blockquote':
			case 'blockquote_expandable':
				return '</blockquote>';
			default:
				return '';
		}
	} else if (parseMode === 'MarkdownV2') {
		switch (type) {
			case 'mv2_bold':
				return '*';
			case 'mv2_italic':
				return '_';
			case 'mv2_underline':
				return '__';
			case 'mv2_strikethrough':
				return '~~';
			case 'mv2_spoiler':
				return '||';
			case 'mv2_code_inline':
				return '`';
			case 'mv2_code_block':
				return '```';
			case 'mv2_link':
				return ')'; // 链接的闭合是 )
			case 'mv2_blockquote':
			case 'mv2_blockquote_expandable':
				return ''; // 块引用是行前缀，没有闭合标记
			default:
				return '';
		}
	} else if (parseMode === 'Markdown') {
		// Legacy
		switch (type) {
			case 'legacy_bold':
				return '*';
			case 'legacy_italic':
				return '_';
			case 'legacy_code_inline':
				return '`';
			case 'legacy_code_block':
				return '```';
			case 'legacy_link':
				return ')'; // 链接的闭合是 )
			default:
				return ''; // Legacy 不支持其他格式
		}
	}
	return '';
}

/**
 * 识别并跟踪格式标记/标签的开放和闭合状态。
 * 这是一个启发式方法，特别是对于 Markdown 的复杂嵌套和转义，可能无法完美处理所有情况。
 * @param {string} chunk - 需要分析的文本块。
 * @param {string | null} parseMode - 解析模式。
 * @param {string[]} inheritedOpenTags - 从前一个块继承的开放标记类型栈。
 * @returns {{balancedChunk: string, nextInheritedOpenTags: string[]}} 包含平衡后文本和下一个块继承的开放标记栈。
 */
function balanceChunkTags(chunk, parseMode, inheritedOpenTags) {
	if (parseMode === null) {
		return { balancedChunk: chunk, nextInheritedOpenTags: [] }; // 纯文本无需处理
	}

	const currentStack = [...inheritedOpenTags];
	let processedChunk = '';
	let i = 0;

	// 构建需要添加到块开头的开放标记字符串
	let openingTagsString = '';
	for (const tagType of inheritedOpenTags) {
		// 对于链接和代码块，继承时需要特殊处理其内容（如链接URL，代码语言）
		// 这里的简化处理是只添加标记本身，这可能导致跨块的链接或代码块格式不完整。
		// 完美处理需要更复杂的逻辑来存储和恢复这些信息。
		const openStr = getOpeningTagString(tagType, parseMode);
		// 避免为块引用添加开始标记，因为它是行前缀
		if (openStr && !['> '].includes(openStr)) {
			openingTagsString += openStr;
		}
	}

	// 迭代文本块，跟踪标记状态
	while (i < chunk.length) {
		let matched = false;

		if (parseMode === 'HTML') {
			// 尝试匹配 HTML 标签
			const htmlTagMatch = chunk.substring(i).match(/^<(\/?\w+)(?:\s+[^>]*)?>/);
			if (htmlTagMatch) {
				const fullMatch = htmlTagMatch[0]; // 整个匹配的字符串，例如 "<b>" 或 "</a>"
				const tagName = htmlTagMatch[1].toLowerCase(); // <-- 修正点：访问捕获组 [1]
				const isClosing = tagName.startsWith('/');
				const cleanTagName = isClosing ? tagName.substring(1) : tagName;

				// 检查是否是支持的标签
				const supportedTags = [
					'b',
					'strong',
					'i',
					'em',
					'u',
					'ins',
					's',
					'strike',
					'del',
					'span',
					'tg-spoiler',
					'a',
					'code',
					'pre',
					'blockquote',
					'blockquote_expandable',
				];
				if (supportedTags.includes(cleanTagName)) {
					if (isClosing) {
						// 闭合标签
						const stackIndex = currentStack.lastIndexOf(cleanTagName);
						if (stackIndex !== -1) {
							// 找到匹配的开放标签，弹出栈及之上的所有标签 (处理嵌套)
							// 注意：HTML 嵌套规则复杂，这里简化处理，只弹出匹配的标签
							// 更严格应弹出匹配标签及之上的所有标签，然后重新压入之上的标签
							// 简化：只弹出匹配的最后一个
							currentStack.splice(stackIndex, 1);
						} else {
							// 未匹配的闭合标签，忽略或记录错误
							console.warn(`HTML 格式中发现未匹配的闭合标签: </${cleanTagName}>`);
						}
					} else {
						// 开放标签
						// 对于链接 <a> 和预格式化 <pre>，它们的内容处理特殊，不应被其他行内标签打断
						// 但这里只跟踪标签本身，不处理内容规则
						if (
							cleanTagName === 'a' ||
							cleanTagName === 'pre' ||
							cleanTagName === 'code' ||
							cleanTagName === 'blockquote' ||
							cleanTagName === 'blockquote_expandable'
						) {
							// 这些标签通常不应被其他行内标签嵌套或打断，但栈仍然需要跟踪它们
							// 压入栈
							currentStack.push(cleanTagName);
						} else {
							// 其他行内标签，直接压入栈
							currentStack.push(cleanTagName);
						}
					}
					processedChunk += fullMatch;
					i += fullMatch.length;
					matched = true;
				}
			}
			// 检查 HTML 实体
			else if (chunk.substring(i).match(/^&(\w+|#\d+|#x[0-9a-fA-F]+);/)) {
				const entityMatch = chunk.substring(i).match(/^&(\w+|#\d+|#x[0-9a-fA-F]+);/)[0]; // 获取整个匹配的实体字符串
				processedChunk += entityMatch;
				i += entityMatch.length;
				matched = true;
			}
		} else if (parseMode === 'MarkdownV2' || parseMode === 'Markdown') {
			// 检查转义字符
			if (chunk[i] === '\\' && i + 1 < chunk.length) {
				// 转义字符后面的字符不应被视为标记
				processedChunk += chunk.substring(i, i + 2);
				i += 2;
				matched = true;
			} else {
				// 尝试匹配 Markdown 标记 (优先匹配长的)
				const mv2Markers = {
					'~~': 'mv2_strikethrough',
					'||': 'mv2_spoiler', // MV2 only
					'**': 'mv2_bold',
					__: 'mv2_underline', // MV2 only
					'`': 'mv2_code_inline',
					'*': 'mv2_bold_italic_star', // MV2 * 可以是粗体或斜体，复杂
					_: 'mv2_bold_italic_underscore', // MV2 _ 可以是粗体或斜体，复杂
					'```': 'mv2_code_block', // 代码块
					'[': 'mv2_link', // 链接开始
					')': 'mv2_link_end', // 链接结束
					'> ': 'mv2_blockquote', // 块引用 (行前缀)
				};
				const legacyMarkers = {
					'*': 'legacy_bold',
					_: 'legacy_italic',
					'`': 'legacy_code_inline',
					'```': 'legacy_code_block',
					'[': 'legacy_link',
					')': 'legacy_link_end',
				};
				const currentMarkers = parseMode === 'MarkdownV2' ? mv2Markers : legacyMarkers;

				let markerFound = false;
				// 检查多字符标记
				for (const marker of ['```', '~~', '||', '**', '__']) {
					// 优先检查长标记
					if (parseMode === 'MarkdownV2' && mv2Markers[marker] && chunk.substring(i, i + marker.length) === marker) {
						const type = mv2Markers[marker];
						const top = currentStack.length > 0 ? currentStack[currentStack.length - 1] : null;

						if (top === type) {
							// 闭合标记
							currentStack.pop();
						} else {
							// 开放标记
							currentStack.push(type);
						}
						processedChunk += marker;
						i += marker.length;
						matched = true;
						markerFound = true;
						break;
					}
					if (parseMode === 'Markdown' && legacyMarkers[marker] && chunk.substring(i, i + marker.length) === marker) {
						const type = legacyMarkers[marker];
						const top = currentStack.length > 0 ? currentStack[currentStack.length - 1] : null;

						if (top === type) {
							// 闭合标记
							currentStack.pop();
						} else {
							// 开放标记
							currentStack.push(type);
						}
						processedChunk += marker;
						i += marker.length;
						matched = true;
						markerFound = true;
						break;
					}
				}
				if (markerFound) continue;

				// 检查单字符标记 (确保不是多字符标记的一部分)
				for (const marker of ['`', '*', '_', '[', ')']) {
					if (currentMarkers[marker] && chunk[i] === marker) {
						// 排除多字符标记的开头
						if (
							(marker === '*' && chunk.substring(i, i + 2) === '**') ||
							(marker === '_' && chunk.substring(i, i + 2) === '__') ||
							(marker === '`' && chunk.substring(i, i + 3) === '```')
						) {
							// 这是多字符标记的一部分，跳过，将在上面的循环中处理
							continue;
						}

						const type = currentMarkers[marker];
						const top = currentStack.length > 0 ? currentStack[currentStack.length - 1] : null;

						if (marker === ')') {
							// 链接闭合标记
							if (top === 'mv2_link' || top === 'legacy_link') {
								currentStack.pop(); // 弹出匹配的链接开放标记
							} else {
								console.warn(`${parseMode} 格式中发现未匹配的链接闭合标记: )`);
							}
						} else if (marker === '[') {
							// 链接开放标记
							currentStack.push(type);
						} else if (marker === '`') {
							// 行内代码
							if (top === type) {
								currentStack.pop();
							} else {
								currentStack.push(type);
							}
						} else if (marker === '*' || marker === '_') {
							// 粗体/斜体
							// Markdown 的 * 和 _ 比较复杂，取决于上下文和嵌套。
							// 这里的栈逻辑是简化的，可能无法完美处理所有嵌套情况。
							// 对于 MV2，* 和 _ 可以互相嵌套，但不能嵌套 pre/code。
							// 对于 Legacy，不允许嵌套。
							// 简化处理：如果栈顶是同类型标记，则弹出（闭合）；否则压入（开放）。
							// 这对于 Legacy 的“不允许嵌套”规则是不准确的，但提供了一种基本的平衡尝试。
							if (top === type) {
								currentStack.pop();
							} else {
								currentStack.push(type);
							}
						}

						processedChunk += marker;
						i += marker.length;
						matched = true;
						break;
					}
				}

				// 检查块引用 (行前缀，只在行首有效)
				if (!matched && chunk.substring(i).startsWith('> ') && (i === 0 || chunk[i - 1] === '\n')) {
					// 块引用是行前缀，不压栈，但需要识别并保留
					// 这里的栈逻辑不适合块引用，块引用是按行处理的。
					// 我们在 splitFormattedText 中处理块引用行的连续性。
					// 在 balanceChunkTags 中，如果遇到行首的 '> '，直接跳过标记部分，处理内容。
					// 但是，为了在栈中体现块引用状态（尽管它不是行内标记），我们可以压入一个特殊类型。
					// 这样，如果一个块以 '> ' 开头，栈顶会有块引用标记。
					// 在构建 openingTagsString 时，需要避免为块引用类型生成实际的开始标记字符串。
					// 在构建 closingTagsString 时，需要避免为块引用类型生成实际的闭合标记字符串。
					// 这种处理方式是为了让栈能反映块引用状态，以便在分割点判断是否在块引用内部。
					// 实际的 '> ' 标记本身会直接添加到 processedChunk。
					if (
						currentStack.length === 0 ||
						(currentStack[currentStack.length - 1] !== 'mv2_blockquote' &&
							currentStack[currentStack.length - 1] !== 'mv2_blockquote_expandable')
					) {
						// 如果栈顶不是块引用，说明这是一个新的块引用开始
						currentStack.push('mv2_blockquote'); // 压入块引用标记类型
					}
					processedChunk += '> ';
					i += 2;
					matched = true;
				} else if (
					!matched &&
					currentStack.length > 0 &&
					(currentStack[currentStack.length - 1] === 'mv2_blockquote' ||
						currentStack[currentStack.length - 1] === 'mv2_blockquote_expandable') &&
					(i === 0 || chunk[i - 1] === '\n')
				) {
					// 如果栈顶是块引用，且当前是新行，但没有 '> ' 前缀，说明块引用结束了
					// 从栈中弹出块引用标记
					currentStack.pop();
					// 继续处理当前行
				}
			}
		}

		if (!matched) {
			processedChunk += chunk[i];
			i++;
		}
	}

	// 构建需要添加到块末尾的闭合标记字符串
	let closingTagsString = '';
	// 从栈顶开始，为所有未闭合的标记添加闭合符
	// 注意：块引用类型不生成闭合标记字符串
	for (let j = currentStack.length - 1; j >= 0; j--) {
		const tagType = currentStack[j];
		const closeStr = getClosingTagString(tagType, parseMode);
		closingTagsString += closeStr;
	}

	// 最终返回的下一个块继承的开放标记栈就是当前处理完后栈的状态
	const nextInheritedOpenTags = [...currentStack];

	// 返回平衡后的文本块 (开头添加继承的开放标记，末尾添加闭合标记) 和下一个块继承的开放标记栈
	return {
		balancedChunk: openingTagsString + chunk + closingTagsString,
		nextInheritedOpenTags: nextInheritedOpenTags,
	};
}

/**
 * 将格式化后的文本分割成适合 Telegram 消息长度的块，并尝试避免在代码块内部分割。
 * @param {string} formattedText - 已经格式化为特定 parseMode 的文本。
 * @param {string | null} parseMode - 当前的解析模式 ('HTML', 'MarkdownV2', 'Markdown', null)。
 * @returns {string[]} 文本块数组 (原始分割块，未添加平衡标签)。
 */
function splitFormattedText(formattedText, parseMode) {
	const maxLength = 4000; // Telegram 消息最大长度约为 4096 字节，4000 字符是安全估计
	const chunks = [];
	let currentPos = 0;

	// 识别代码块的范围，以便在分割时避开
	const codeBlockRanges = [];
	if (parseMode === 'HTML') {
		const preRegex = /<pre(?:[^>]*?)?>[\s\S]*?<\/pre>/g;
		let match;
		while ((match = preRegex.exec(formattedText)) !== null) {
			codeBlockRanges.push({ start: match.index, end: match.index + match.length });
		}
	} else if (parseMode === 'MarkdownV2' || parseMode === 'Markdown') {
		const codeBlockRegex = /```[\s\S]*?```/g;
		let match;
		while ((match = codeBlockRegex.exec(formattedText)) !== null) {
			codeBlockRanges.push({ start: match.index, end: match.index + match.length });
		}
	}

	while (currentPos < formattedText.length) {
		let endPos = Math.min(currentPos + maxLength, formattedText.length);

		// 如果不是最后一个块
		if (endPos < formattedText.length) {
			// 检查 endPos 是否落在代码块内部
			let isInCodeBlock = false;
			let currentBlockEnd = -1;
			for (const range of codeBlockRanges) {
				if (endPos > range.start && endPos < range.end) {
					isInCodeBlock = true;
					currentBlockEnd = range.end;
					break;
				}
			}

			if (isInCodeBlock) {
				// 如果落在代码块内部，尝试调整分割点
				if (currentBlockEnd - currentPos <= maxLength) {
					// 如果从当前位置到代码块结束不超过最大长度，则将分割点移到代码块结束之后
					endPos = currentBlockEnd;
				} else {
					// 代码块太长，必须在内部分割。尝试在代码块内部找换行符。
					const searchStart = Math.max(currentPos, endPos - 200); // 在末尾 200 个字符内查找
					let safeSplitPoint = -1;
					for (let i = endPos - 1; i >= searchStart; i--) {
						if (formattedText[i] === '\n') {
							// 代码块内部主要按行分割
							safeSplitPoint = i + 1;
							break;
						}
					}
					if (safeSplitPoint !== -1) {
						endPos = safeSplitPoint;
					}
					// 如果在窗口内没有找到换行符，就按 maxLength 硬分割 (可能破坏代码块格式)
				}
			} else {
				// 如果没有落在代码块内部，尝试在附近找换行符或空格作为安全分割点
				const searchStart = Math.max(currentPos, endPos - 200); // 在末尾 200 个字符内查找
				let safeSplitPoint = -1;
				for (let i = endPos - 1; i >= searchStart; i--) {
					if (formattedText[i] === '\n' || formattedText[i] === ' ') {
						safeSplitPoint = i + 1;
						break;
					}
				}
				if (safeSplitPoint !== -1) {
					endPos = safeSplitPoint;
				}
				// 如果在窗口内没有找到安全的分割点，就按 maxLength 硬分割
			}
		}

		const chunk = formattedText.substring(currentPos, endPos);
		chunks.push(chunk);
		currentPos = endPos;
	}

	return chunks;
}

/**
 * 发送单个 Telegram 消息块。
 * @param {string} botToken
 * @param {number} chatId
 * @param {string} text - 需要发送的文本块 (已格式化并平衡标签)。
 * @param {number | null} replyToMessageId - 回复消息 ID。
 * @param {string | null} parseMode - 消息解析模式。
 * @returns {Promise<{ok: boolean, message_id?: number, error?: any}>} 发送结果。
 */
async function _sendSingleTelegramChunk(botToken, chatId, text, replyToMessageId, parseMode) {
	const apiUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
	const payload = {
		chat_id: chatId,
		text: text,
		reply_to_message_id: replyToMessageId,
		...(parseMode ? { parse_mode: parseMode } : {}),
		link_preview_options: { is_disabled: true },
	};

	try {
		const response = await fetch(apiUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(payload),
		});

		const result = await response.json();

		if (!response.ok) {
			console.error(`发送 Telegram 消息块失败 (状态码: ${response.status}, 格式: ${parseMode === null ? '纯文本' : parseMode}):`, result);
			return { ok: false, error: result };
		} else {
			console.log(`成功发送 Telegram 消息块 (格式: ${parseMode === null ? '纯文本' : parseMode}), message_id:`, result.result.message_id);
			return { ok: true, message_id: result.result.message_id };
		}
	} catch (error) {
		console.error('发送 Telegram 消息块时发生网络或解析错误:', error);
		return { ok: false, error: error };
	}
}

/**
 * 发送 Telegram 消息，支持文本分割、按块格式化回退和未闭合标签处理。
 * 优先使用 HTML 格式，失败则回退到 MarkdownV2，然后 Markdown (Legacy)，最后纯文本。
 * 对原始超长文本按 4000 字符分割，并尝试在分割点闭合常见的行内格式。
 *
 * @param {string} botToken - Telegram Bot API Token。
 * @param {number} chatId - 目标聊天 ID。
 * @param {string} standardMarkdownText - 标准 Markdown 格式的输入文本。
 * @param {number | null} replyToMessageId - (可选) 如果需要回复某条消息，则指定 message_id。
 * @returns {Promise<{ok: boolean, message_id?: number, error?: any}>} 发送结果。成功时返回最后一条消息的 message_id。
 */
export async function sendFormattedTelegramMessage(botToken, chatId, standardMarkdownText, replyToMessageId = null) {
	const modesToTry = ['HTML', 'MarkdownV2', 'Markdown', null]; // null 代表纯文本模式
	let lastMessageId = null;
	let lastError = null;
	let currentReplyTo = replyToMessageId;

	// 跟踪原始文本中已经成功发送的字符数
	let originalTextSentLength = 0;

	// 外层循环：尝试不同的格式模式
	for (const mode of modesToTry) {
		console.log(`尝试使用 ${mode === null ? '纯文本' : mode} 格式处理剩余文本...`);

		// 获取当前模式需要处理的剩余原始文本
		const remainingOriginalText = standardMarkdownText.substring(originalTextSentLength);

		if (remainingOriginalText.length === 0) {
			console.log(`剩余原始文本已发送完毕.`);
			// 如果所有文本都已发送，且这是最后一个模式（或成功模式），则返回成功
			if (lastMessageId !== null) {
				return { ok: true, message_id: lastMessageId };
			} else {
				// 如果没有任何消息成功发送 (例如，输入是空字符串)
				return { ok: true, message_id: undefined };
			}
		}

		let formattedText;
		try {
			// 1. 格式化剩余原始文本
			formattedText = formatText(remainingOriginalText, mode);
		} catch (e) {
			console.error(`格式化剩余文本为 ${mode === null ? '纯文本' : mode} 失败:`, e);
			lastError = e;
			continue; // 格式化失败，尝试下一个模式
		}

		// 2. 分割格式化后的文本 (不在此处平衡标签)
		const rawChunks = splitFormattedText(formattedText, mode);
		console.log(`格式化后的剩余文本被分割成 ${rawChunks.length} 块.`);

		let modeSuccessForRemaining = true; // 标记当前模式是否成功发送了所有剩余块
		let chunkIndex = 0; // 当前正在发送的原始块的索引
		let inheritedOpenTags = []; // 跟踪从前一个块继承的开放标记栈

		// 3. 逐块发送消息
		while (chunkIndex < rawChunks.length) {
			const rawChunk = rawChunks[chunkIndex];

			// 4. 平衡当前块的标签 (添加继承的开放标签和块末尾的闭合标签)
			const { balancedChunk, nextInheritedOpenTags } = balanceChunkTags(rawChunk, mode, inheritedOpenTags);
			inheritedOpenTags = nextInheritedOpenTags; // 更新下一个块需要继承的状态

			console.log(
				`发送第 ${originalTextSentLength + chunkIndex + 1} 条消息 (当前块 ${chunkIndex + 1}/${rawChunks.length}, 长度: ${balancedChunk.length})...`,
			);

			// Telegram API 对消息长度有严格限制，空消息或过短消息也可能失败
			if (balancedChunk.trim().length === 0) {
				console.log(`跳过发送空消息块 (格式: ${mode === null ? '纯文本' : mode}).`);
				// 跳过空块，但需要更新 originalTextSentLength 以便后续模式从正确位置开始
				// 这里估算跳过的原始文本长度，仍然不精确
				originalTextSentLength += rawChunk.length; // 使用原始块长度估算
				chunkIndex++; // 跳过空块，处理下一块
				lastError = null; // 清除错误状态
				continue;
			}

			const sendResult = await _sendSingleTelegramChunk(botToken, chatId, balancedChunk, currentReplyTo, mode);

			if (sendResult.ok) {
				console.log(`消息块发送成功 (格式: ${mode === null ? '纯文本' : mode}).`);
				lastMessageId = sendResult.message_id; // 更新最后一条消息 ID
				currentReplyTo = sendResult.message_id; // 下一块回复当前块
				// 成功发送当前块，更新已发送的原始文本长度 (估算值)
				originalTextSentLength += rawChunk.length; // 使用原始块长度估算

				chunkIndex++; // 成功发送当前块，处理下一块
				lastError = null; // 清除错误状态
			} else {
				console.error(`消息块发送失败 (格式: ${mode === null ? '纯文本' : mode}).`);
				lastError = sendResult.error; // 记录当前块的错误
				modeSuccessForRemaining = false; // 当前模式未能成功发送所有剩余块
				// 当前模式失败，跳出块循环，尝试下一个模式处理剩余文本
				break;
			}
		}

		// 如果当前模式成功发送了所有剩余块
		if (modeSuccessForRemaining) {
			console.log(`${mode === null ? '纯文本' : mode} 格式成功发送了所有剩余文本.`);
			// 整个发送过程成功，因为所有文本都已发送
			return { ok: true, message_id: lastMessageId };
		}

		// 如果当前模式失败，外层循环将继续，尝试下一个模式处理从失败点开始的剩余原始文本
		// originalTextSentLength 保持在失败块之前的状态，确保下一模式从正确位置开始
		// inheritedOpenTags 也需要重置，因为换了格式模式
		inheritedOpenTags = [];
	}

	// 如果所有模式都失败了
	console.error('所有格式化模式发送均失败.');
	return { ok: false, error: lastError || new Error('所有格式化模式发送失败') };
}
