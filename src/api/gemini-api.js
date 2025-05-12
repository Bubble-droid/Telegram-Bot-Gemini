// src/api/gemini-api.js

import { sendErrorNotification } from '../utils/utils'; // 假设您有一个 sendErrorNotification 函数用于发送错误通知

/**
 * 定义 Gemini API 可用的工具 (Function Calling)
 * 这些定义会被发送给模型，告知其有哪些工具可用及其参数
 * 格式遵循 OpenAI API 规范
 */
const toolDefinitions = [
	{
		type: 'function',
		function: {
			name: 'getDocument',
			description: '始终使用此工具，根据用户的提问和文档路径列表，查询相关的在线文档，获取解答依据',
			parameters: {
				type: 'object',
				properties: {
					docsPath: {
						type: 'array',
						description:
							'需要查询的文档路径列表，一个数组，例如: ["MetaCubeX/Meta-Docs/refs/heads/main/docs/api/index.md", "SagerNet/sing-box/refs/heads/dev-next/docs/configuration/experimental/clash-api.md", ...]',
						items: {
							type: 'string',
							description: '单个文档的路径',
						},
					},
				},
				required: ['docsPath'],
			},
		},
	},
];

/**
 * 执行工具的映射对象
 * 键是工具名称 (function_declarations 中的 name)，值是对应的执行函数
 */
const toolExecutors = {
	/**
	 * 执行 getDocument 工具
	 * @param {object} args  工具调用时传递的参数对象，例如 { docsPath: ['path1', 'path2'] }
	 * @returns {Promise<string>}  文档内容
	 */
	getDocument: async (args) => {
		console.log('执行工具: getDocument, 参数:', args);
		const docUrlPrefix = 'https://raw.githubusercontent.com'; // 假设文档仓库前缀
		let docstxt = '';
		if (args && args.docsPath && Array.isArray(args.docsPath)) {
			for (const doc of args.docsPath) {
				if (typeof doc === 'string') {
					const completeDocUrl = `${docUrlPrefix}/${doc}`;
					try {
						console.log(`尝试获取文档: ${completeDocUrl}`);
						const response = await fetch(completeDocUrl, {
							method: 'GET',
						});

						if (!response.ok) {
							console.warn(`获取文档失败，状态码: ${response.status}, URL: ${completeDocUrl}`);
							docstxt += `#${doc}\n\n错误：无法获取文档内容 (状态码: ${response.status})\n`; // 添加错误提示到结果中
							continue; // 继续处理下一个文档
						}

						const docContent = await response.text();
						docstxt += `#${doc}\n\n${docContent}\n\n`; // 文档内容之间用空行隔开
					} catch (fetchError) {
						console.error(`获取文档时发生网络错误: ${fetchError}, URL: ${completeDocUrl}`);
						docstxt += `#${doc}\n\n错误：获取文档时发生网络错误\n`; // 添加错误提示到结果中
					}
				}
			}
		} else {
			console.warn('getDocument 工具调用参数无效:', args);
			docstxt = '错误：getDocument 工具调用参数无效，未提供文档路径。';
		}
		console.log('getDocument 工具执行完毕，结果长度:', docstxt.length);
		return docstxt.trim(); // 返回去除首尾空白的文档内容
	},
};

/**
 * 调用 Gemini API 获取聊天回复，并处理工具调用
 * @param {object} env Cloudflare Worker environment
 * @param {Array<object>} initialMessages  初始消息内容 (包含系统提示和用户消息)
 * @returns {Promise<string>}  返回 Gemini API 最终的文本回复
 */
export async function getGeminiChatCompletion(env, initialMessages) {
	const apiKey = env.GEMINI_API_KEY;
	const apiUrl = env.OPENAI_API_BASE_URL; // 使用 OpenAI 兼容的 URL
	const modelName = env.GEMINI_MODEL_NAME; // 从 env 获取模型名称

	if (!apiKey || !apiUrl || !modelName) {
		const errorMsg = 'Gemini API Key, Base URL 或 Model Name 未配置';
		console.error(errorMsg);
		await sendErrorNotification(env, new Error(errorMsg), 'gemini-api.js - getGeminiChatCompletion'); // 避免在初始化错误时发送通知
		throw new Error(errorMsg);
	}

	console.log('开始调用 Gemini API (带工具调用支持)...');
	console.log(`当前使用的 AI 模型: ${modelName}`);

	let messages = [...initialMessages]; // 复制初始消息，以便在工具调用时添加新消息

	//  !!!  循环处理，直到 API 返回最终回复而不是工具调用  !!!
	//  设置最大循环次数，防止无限循环 (例如，模型反复调用不存在的工具)
	const MAX_TOOL_CALL_ROUNDS = 5;
	for (let i = 0; i < MAX_TOOL_CALL_ROUNDS; i++) {
		console.log(`API 调用轮次: ${i + 1}`);
		// console.log('当前发送的 messages:', JSON.stringify(messages, null, 2)); // 打印完整的 messages 可能非常长，谨慎使用

		const payload = {
			model: modelName,
			messages: messages,
			tools: toolDefinitions, //  !!!  包含工具定义 (OpenAI 格式)  !!!
			tool_choice: 'auto', //  !!!  自动决定是否调用工具 (OpenAI 格式)  !!!
			reasoning_effort: 'high',
			max_completion_tokens: 65536, //  !!!  使用 max_completion_tokens (OpenAI 格式)  !!!
			temperature: 0.3,
			n: 1, //  !!!  使用 n (OpenAI 格式)  !!!
		};

		// console.log('Gemini API 请求体: ', JSON.stringify(payload, null, 2));

		console.log('发送 Gemini API 请求 (payload 摘要):', {
			model: payload.model,
			messagesCount: payload.messages.length,
			lastMessageRole: payload.messages.length > 0 ? payload.messages[payload.messages.length - 1].role : 'N/A',
			toolsCount: payload.tools ? payload.tools.length : 0,
			tool_choice: payload.tool_choice,
		});

		try {
			const response = await fetch(apiUrl, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${apiKey}`,
				},
				body: JSON.stringify(payload),
			});

			if (!response.ok) {
				const errorBody = await response
					.json()
					.catch(() => ({ message: '无法解析 JSON 错误响应', text: '原始响应体：' + response.statusText })); // 尝试解析 JSON，失败则构造一个包含状态文本的错误对象
				const errorMsg = `Gemini API 请求失败, 状态码: ${response.status}, 错误信息: ${JSON.stringify(errorBody)}`;
				console.error(errorMsg);
				await sendErrorNotification(env, new Error(errorMsg), `gemini-api.js - API 调用失败 (轮次: ${i + 1})`);
				throw new Error(errorMsg);
			}

			const responseData = await response.json();
			console.log('Gemini API 响应:', JSON.stringify(responseData, null, 2));

			if (!responseData.choices || responseData.choices.length === 0) {
				const errorMsg = 'Gemini API 响应中没有 choices';
				console.error(errorMsg);
				await sendErrorNotification(env, new Error(errorMsg), `gemini-api.js - API 响应异常 (轮次: ${i + 1})`);
				throw new Error(errorMsg);
			}

			const candidateMessage = responseData.choices[0]?.message;
			const finishReason = responseData.choices[0]?.finish_reason; // 从 choice 对象中获取 finish_reason

			if (!candidateMessage) {
				const errorMsg = 'Gemini API 响应中 message 对象为空';
				console.error(errorMsg);
				await sendErrorNotification(env, new Error(errorMsg), `gemini-api.js - API 响应 message 为空 (轮次: ${i + 1})`);
				throw new Error(errorMsg);
			}

			//  !!!  检查是否需要调用工具 (根据 OpenAI 格式)  !!!
			const toolCalls = candidateMessage.tool_calls;

			if (toolCalls && toolCalls.length > 0) {
				console.log(`检测到工具调用 (${toolCalls.length} 个)`);

				//  !!!  将模型的工具调用回复添加到消息历史 (整个 message 对象)  !!!
				messages.push(candidateMessage); //  直接将包含 tool_calls 的 message 对象添加到历史

				const toolResults = []; //  存储本次轮次所有工具的执行结果

				for (const toolCall of toolCalls) {
					const functionName = toolCall.function.name;
					//  !!!  解析 function.arguments 字符串为 JSON 对象  !!!
					let functionArgs = {};
					try {
						functionArgs = JSON.parse(toolCall.function.arguments);
					} catch (parseError) {
						console.error(`解析工具 ${functionName} 的参数失败:`, parseError);
						toolResults.push({
							name: functionName, //  工具名称
							content: `错误：解析工具参数失败 - ${parseError.message || '未知错误'}`, //  报告错误信息
						});
						await sendErrorNotification(env, parseError, `gemini-api.js - 解析工具参数失败: ${functionName}`);
						continue; // 跳过本次工具执行，处理下一个工具调用
					}

					if (toolExecutors[functionName]) {
						try {
							//  !!!  执行对应的工具函数  !!!
							console.log(`执行工具: ${functionName}, 参数:`, functionArgs);
							const toolResultContent = await toolExecutors[functionName](functionArgs);

							//  !!!  将工具执行结果添加到 toolResults 数组，准备发送回 API (遵循日志中的 assistant 角色格式)  !!!
							toolResults.push({
								name: functionName, //  工具名称
								content: toolResultContent, //  将工具执行结果放在 content 字段
							});
							console.log(`工具 ${functionName} 执行成功，结果已记录`);
						} catch (toolError) {
							console.error(`执行工具 ${functionName} 失败:`, toolError);
							//  !!!  即使工具执行失败，也向 API 报告失败信息  !!!
							toolResults.push({
								name: functionName, //  工具名称
								content: `错误：执行工具 ${functionName} 失败 - ${toolError.message || '未知错误'}`,
							});
							await sendErrorNotification(env, toolError, `gemini-api.js - 工具执行失败: ${functionName}`);
						}
					} else {
						//  !!!  处理模型调用了我们未实现的工具的情况  !!!
						const errorMsg = `模型调用了未实现的工具: ${functionName}`;
						console.warn(errorMsg);
						toolResults.push({
							name: functionName, //  工具名称
							content: `错误：工具 ${functionName} 未实现`,
						});
						await sendErrorNotification(env, new Error(errorMsg), `gemini-api.js - 调用未实现的工具: ${functionName}`);
					}
				}

				//  !!!  将所有工具的执行结果作为消息发送回 API (遵循日志中的 assistant 角色格式)  !!!
				if (toolResults.length > 0) {
					//  汇总所有工具结果到一个字符串
					const aggregatedToolResultContent = toolResults.map((result) => `工具 ${result.name} 执行结果:\n${result.content}`).join('\n\n'); //  用两个换行分隔不同工具的结果

					messages.push({
						role: 'user', //  遵循日志中将工具结果作为 assistant 消息发送回 API 的格式
						content: aggregatedToolResultContent, //  将汇总的工具结果放在 content 字段
					});
					console.log('工具执行结果已添加到消息历史，准备下一轮 API 调用');
				} else {
					// 如果没有任何工具被成功或失败执行（理论上不应该发生如果 model 响应有 toolCalls）
					console.warn('模型调用了工具，但没有工具执行结果被记录');
					// 这种情况下，模型可能陷入困境，直接返回一个提示或错误
					return '😥 抱歉，模型尝试使用工具但未能获取结果。';
				}
			} else {
				//  !!!  没有工具调用，提取最终的文本回复 (根据 OpenAI 格式)  !!!
				const finalReplyText = candidateMessage.content;

				if (!finalReplyText || !finalReplyText.trim()) {
					//  如果提取到的文本内容为空，但没有工具调用
					console.warn('Gemini API 返回非工具调用响应，但文本内容为空');
					// 可以检查 finishReason，例如是否是 "STOP"
					if (finishReason === 'STOP') {
						// 如果正常停止但内容为空，可能是模型无话可说或遇到问题
						return '😥 抱歉，未能获取有效的文本回复。';
					} else {
						// 其他 finishReason 可能需要进一步处理
						return `😥 抱歉，未能获取有效的文本回复，Finish Reason: ${finishReason}`;
					}
				}

				return finalReplyText.trim(); //  返回最终的文本回复
			}
		} catch (error) {
			console.error('调用 Gemini API 或处理工具调用过程中发生错误:', error);
			//  错误已在内部记录和通知，这里只需重新抛出或返回错误状态
			throw error;
		}
	}

	//  !!!  如果循环次数达到上限，仍然没有最终回复  !!!
	const errorMsg = `达到最大 API 调用轮次 (${MAX_TOOL_CALL_ROUNDS})，未能获取最终回复`;
	console.error(errorMsg);
	await sendErrorNotification(env, new Error(errorMsg), 'gemini-api.js - 达到最大 API 调用轮次');
	throw new Error(errorMsg);
}
