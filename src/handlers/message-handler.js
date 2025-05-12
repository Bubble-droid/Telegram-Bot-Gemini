// src/handlers/message-handler.js

import { getJsonFromKv, putJsonToKv } from '../utils/utils';
import { recordGroupRequestTimestamp, isGroupInCooldown } from '../utils/cooldown';
import { handleImageMessageForContext } from './image-handler';
import { getGeminiChatCompletion } from '../api/gemini-api';
import { updateUserContextHistory, getUserContextHistory } from '../storage/context-storage';
import { sendTelegramMessage, deleteTelegramMessage } from '../api/telegram-api';
import { scheduleDeletion } from '../utils/scheduler';
import { handleTextFileMessage } from './document-handler';
import { sendFormattedTelegramMessage } from '../api/sendMessage';

/**
 * 提取消息内容 (文本和/或图片) 用于回复提问 -  彻底重构函数
 * @param {object} message Telegram message 对象
 * @param {object} env Cloudflare Worker environment
 * @param {string} botName 机器人名称
 * @returns {Promise<object|null>}  messageContent 对象，如果消息不包含文本或图片则返回 null
 */
export async function extractMessageContentForReply(env, message, botName) {
	if (!message) {
		return null;
	}

	let messageContentParts = []; //  用于存储消息内容片段 (text 或 image_url)

	// 处理文本内容 (text 或 caption)
	let text = message.text || message.caption;
	if (text) {
		text = text.replace(new RegExp(`@${botName}`, 'gi'), '').trim(); // 移除 @botName 并 trim，忽略大小写
		// if (text) {
		//  只有当文本内容不为空时才添加 text content part
		messageContentParts.push({ type: 'text', text: text });
		// }
	}

	// 处理图片内容 (photo)
	if (message.photo) {
		const imageMessageContent = await handleImageMessageForContext(message, env, true); //  !!!  isReply = true  !!!
		if (imageMessageContent && imageMessageContent.content) {
			messageContentParts.push(...imageMessageContent.content.filter((part) => part.type === 'image_url')); //  只添加 image_url content part, 并过滤掉可能的 text
		}
	}

	if (messageContentParts.length === 0) {
		return null; //  如果没有任何内容片段，则返回 null
	} else if (messageContentParts.length === 1 && messageContentParts[0].type === 'text') {
		return { role: 'user', content: messageContentParts[0].text }; //  如果只有一个 text content part, 则 content 为字符串
	} else {
		return { role: 'user', content: messageContentParts }; //  否则 content 为 content part 数组
	}
}

/**
 * 处理回复消息的提问 (不带上下文)
 * @param {object} message Telegram message 对象
 * @param {object} env Cloudflare Worker environment
 * @param {string} botName 机器人名称
 * @param {function} sendTelegramMessage 发送 Telegram 消息的函数
 * @param {function} editTelegramMessage 编辑 Telegram 消息的函数
 * @param {function} recordGroupRequestTimestamp 记录群组请求时间戳函数
 * @param {function} isGroupInCooldown 检查群组冷却函数
 * @param {function} getUserWhitelist 获取用户白名单函数
 * @param {function} getJsonFromKv 从 KV 获取 JSON 数据函数
 * @param {function} getGeminiChatCompletion 调用 Gemini API 函数
 * @param {function} formatGeminiReply 格式化 Gemini 回复函数
 * @returns {Promise<Response>}
 */
export async function handleReplyToMessageQuestion(env, message, botName) {
	console.log('开始处理回复消息提问 (不带上下文)...');

	const { message_id: messageId } = await sendTelegramMessage(
		env.BOT_TOKEN,
		message.chat.id,
		'✨ Thinking......',
		message.message_id,
		'HTML',
	);

	const chatId = message.chat.id; //  !!!  获取群组 ID
	const userId = message.from.id;
	const botConfigKv = env.BOT_CONFIG;

	const systemInitConfigKv = env.SYSTEM_INIT_CONFIG;
	const systemPromptKey = env.SYSTEM_PROMPT_KV_KEY;

	const systemPromptData = (await systemInitConfigKv.get(systemPromptKey)) || 'You are a helpful assistant.'; //  获取系统提示词

	const systemInitMessages = [{ role: 'system', content: systemPromptData }];

	const replyToMessage = message.reply_to_message;
	const replyMessage = message;

	let replyToMessageContent = await extractMessageContentForReply(env, replyToMessage, botName); //  !!!  提取被回复消息内容
	let currentMessageContent = await extractMessageContentForReply(env, replyMessage, botName); //  !!!  提取当前回复消息内容，包含 @bot 的文本/图片

	let geminiMessages = [...systemInitMessages]; //  !!!  仅包含系统初始化消息，不包含上下文 !!!

	if (replyToMessageContent) {
		geminiMessages.push(replyToMessageContent); //  添加被回复消息内容
	}
	if (currentMessageContent) {
		geminiMessages.push(currentMessageContent); //  添加当前回复消息内容
	}

	let geminiReplyText = '';

	const botMessageIdsKv = env.BOT_MESSAGE_IDS;

	try {
		geminiReplyText = await getGeminiChatCompletion(env, geminiMessages);

		await recordGroupRequestTimestamp(botConfigKv, chatId);

		const { message_id: replyMessageId } = await sendFormattedTelegramMessage(env.BOT_TOKEN, chatId, geminiReplyText, message.message_id);

		if (replyMessageId) {
			await scheduleDeletion(env, env.BOT_TOKEN, chatId, replyMessageId, 24 * 60 * 60 * 1_000);
			const botMessageIdKey = `last_bot_message_id:${chatId}:${userId}`;
			await putJsonToKv(botMessageIdsKv, botMessageIdKey, replyMessageId, 7 * 24 * 60 * 60);
			console.log(`存储 Bot 消息 ID (message_id: ${replyMessageId}) 到 KV, key: ${botMessageIdKey}`);
		}

		await deleteTelegramMessage(env.BOT_TOKEN, chatId, messageId);
	} catch (e) {
		console.error('引用提问处理失败: ', e);
		await sendTelegramMessage(env.BOT_TOKEN, chatId, `\`${e.message ? e.message : e}\``, message.message_id, 'HTML');
		await deleteTelegramMessage(env.BOT_TOKEN, chatId, messageId);
	}
	return new Response('OK');
}

/**
 * 处理 @bot 提问 (带上下文)
 * @param {object} message Telegram message 对象
 * @param {object} env Cloudflare Worker environment
 * @param {string} botName 机器人名称
 * @param {function} sendTelegramMessage 发送 Telegram 消息的函数
 * @param {function} editTelegramMessage 编辑 Telegram 消息的函数
 * @param {function} recordGroupRequestTimestamp 记录群组请求时间戳函数
 * @param {function} isGroupInCooldown 检查群组冷却函数
 * @param {function} getUserWhitelist 获取用户白名单函数
 * @param {function} getJsonFromKv 从 KV 获取 JSON 数据函数
 * @param {function} getUserContextHistory 获取用户上下文历史函数
 * @param {function} updateUserContextHistory 更新用户上下文历史函数
 * @param {function} getGeminiChatCompletion 调用 Gemini API 函数
 * @param {function} formatGeminiReply 格式化 Gemini 回复函数
 * @returns {Promise<Response>}
 */
export async function handleBotMentionQuestion(
	env,
	botConfigKv,
	contextKv,
	imageDataKv,
	botMessageIdsKv,
	systemInitConfigKv,
	systemPromptKey,
	message,
	chatId,
	userId,
	replyToMessageId,
	botToken,
	botName,
) {
	let messageContent;
	const mimeTypes = ['application/json', 'application/yaml', 'text/javascript', 'text/plain', 'text/markdown', 'application/x-shellscript'];
	try {
		if (message.text) {
			const textWithoutBotName = message.text.replace(new RegExp(`@${botName}`, 'gi'), '').trim(); //  !!!  使用 RegExp 忽略大小写  !!!
			messageContent = { role: 'user', content: textWithoutBotName };
		} else if (message.photo || message?.document?.mime_type === 'image/png') {
			messageContent = await handleImageMessageForContext(message, env);
		} else if (message.document && mimeTypes.includes(message?.document?.mime_type)) {
			messageContent = await handleTextFileMessage(env, botToken, botName, message);
		}
	} catch (e) {
		throw e;
	}

	if (!messageContent) return new Response('OK');

	console.log(`开始处理 @ 提问...`);

	const { message_id: tempMessageId } = await sendTelegramMessage(botToken, chatId, `✨ Thinking......`, replyToMessageId, 'HTML');

	const contextHistory = await getUserContextHistory(contextKv, chatId, userId);
	// console.log('上下文历史记录 (提问前):', contextHistory);

	const systemPromptData = (await systemInitConfigKv.get(systemPromptKey)) || `<system_context></system_context>`;

	const systemInitMessages = [{ role: 'system', content: systemPromptData }];

	let processedMessages = [];
	for (const msg of [...contextHistory, messageContent]) {
		if (msg.content && Array.isArray(msg.content)) {
			const processedContent = await Promise.all(
				msg.content.map(async (contentPart) => {
					if (contentPart.type === 'image_url') {
						const imageKvKey = contentPart.image_url.url;
						const base64Image = await imageDataKv.get(imageKvKey);
						if (base64Image) {
							return {
								type: 'image_url',
								image_url: { url: `data:image/jpeg;base64,${base64Image}` },
							};
						} else {
							console.error(`KV 键名 ${imageKvKey} 对应的 Base64 数据未找到`);
							return { type: 'text', text: `(图片数据丢失, key: ${imageKvKey})` };
						}
					}
					return contentPart;
				}),
			);
			processedMessages.push({ role: msg.role, content: processedContent });
		} else {
			processedMessages.push(msg);
		}
	}

	const geminiMessages = [...systemInitMessages, ...processedMessages];

	let geminiReplyText = '';

	try {
		geminiReplyText = await getGeminiChatCompletion(env, geminiMessages);

		await recordGroupRequestTimestamp(botConfigKv, chatId);

		const { message_id: replyMessageId } = await sendFormattedTelegramMessage(botToken, chatId, geminiReplyText, replyToMessageId);

		await deleteTelegramMessage(botToken, chatId, tempMessageId);

		if (replyMessageId) {
			await scheduleDeletion(env, botToken, chatId, replyMessageId, 24 * 60 * 60 * 1_000);
			const botMessageIdKey = `last_bot_message_id:${chatId}:${userId}`;
			await putJsonToKv(botMessageIdsKv, botMessageIdKey, replyMessageId, 7 * 24 * 60 * 60);
			console.log(`存储 Bot 消息 ID (message_id: ${replyMessageId}) 到 KV, key: ${botMessageIdKey}`);
		}

		const botReplyMessageContent = { role: 'assistant', content: geminiReplyText }; //  机器人回复消息内容

		await updateUserContextHistory(contextKv, chatId, userId, [messageContent, botReplyMessageContent]); //  记录机器人回复消息
	} catch (e) {
		console.error('提问处理失败: ', e);
		await sendTelegramMessage(botToken, chatId, `\`${e.message ? e.message : e}\``, replyToMessageId, 'HTML'); //  发送错误消息
		await deleteTelegramMessage(botToken, chatId, tempMessageId);
	}

	return new Response('OK');
}

/**
 *  处理普通消息
 */

export async function handleUniversalMessage(
	env,
	botConfigKv,
	contextKv,
	imageDataKv,
	botMessageIdsKv,
	systemInitConfigKv,
	systemPromptKey,
	userWhitelistKey,
	cooldownDuration,
	message,
	chatId,
	userId,
	replyToMessageId,
	botToken,
	botId,
	botName,
) {
	console.log(`普通群组消息 (非 @ 提及, 也非命令, 图片消息: ${!!message.photo})`);

	if (message.new_chat_participant) {
		return await handleNewChatPtcp(env, botToken, botName, message, chatId);
	}

	//  !!!  连续对话检测 !!!
	if (message.reply_to_message && message.reply_to_message.from.id === parseInt(botId)) {
		//  !!!  回复消息 且 回复对象是 Bot !!!
		const botMessageIdKey = `last_bot_message_id:${chatId}:${userId}`;
		const lastBotMessageId = await getJsonFromKv(botMessageIdsKv, botMessageIdKey); //  !!!  从 BOT_MESSAGE_IDS KV 获取  !!!

		if (lastBotMessageId && message.reply_to_message.message_id === lastBotMessageId) {
			//  !!!  检测到连续对话 !!!
			console.log(`检测到用户 ${userId} 在群组 ${chatId} 的连续对话 (回复了 message_id: ${lastBotMessageId})`);
			//  !!!  触发 @ 提问处理流程 (复用现有逻辑) !!!

			const isInCooldown = await isGroupInCooldown(
				env,
				botConfigKv,
				cooldownDuration,
				chatId,
				userId,
				userWhitelistKey,
				replyToMessageId,
				botToken,
			);

			if (isInCooldown) return new Response('OK');

			console.log(`群组 ${chatId} 未冷却或用户在白名单中，继续处理提问`);

			await handleBotMentionQuestion(
				env,
				botConfigKv,
				contextKv,
				imageDataKv,
				botMessageIdsKv,
				systemInitConfigKv,
				systemPromptKey,
				message,
				chatId,
				userId,
				replyToMessageId,
				botToken,
				botName,
			);

			return new Response('OK');
		} else {
			console.log(
				`用户 ${userId} 回复了 Bot 消息，但不是连续对话 (lastBotMessageId: ${lastBotMessageId}, reply_message_id: ${message.reply_to_message.message_id})`,
			);
		}
	}

	let messageContent;

	const mimeTypes = ['application/json', 'application/yaml', 'text/javascript', 'text/plain', 'text/markdown', 'application/x-shellscript'];

	try {
		if (message?.text) {
			const textWithoutBotName = message.text.replace(new RegExp(`@${botName}`, 'gi'), '').trim(); //  !!!  使用 RegExp 忽略大小写  !!!
			messageContent = { role: 'user', content: textWithoutBotName };
		} else if (message?.photo || message?.document?.mime_type === 'image/png') {
			messageContent = await handleImageMessageForContext(message, env);
		} else if (message?.document && mimeTypes.includes(message?.document?.mime_type)) {
			messageContent = await handleTextFileMessage(env, botToken, botName, message);
		}
	} catch (e) {
		throw e;
	}

	if (!messageContent) return new Response('OK');

	if (messageContent) await updateUserContextHistory(contextKv, chatId, userId, [messageContent]);

	return new Response('OK');
}

/**
 *  处理私聊消息
 */

export const handlePrivateMessage = async (env, botToken, chatId, messageId) => {
	console.log(`收到私聊消息`);

	const schedule = (id) => id && scheduleDeletion(env, botToken, chatId, id, 10_000);

	try {
		await schedule(messageId);

		const { message_id: sendMessageId } = await sendTelegramMessage(botToken, chatId, `⚠️ Unauthorized`, messageId, 'HTML');

		await schedule(sendMessageId);
	} catch (e) {
		console.error(`handlePrivateMessage 处理失败: \`${e.message || e}\``);
	}

	return new Response('OK');
};

const handleNewChatPtcp = async (env, botToken, botName, message, chatId) => {
	const ptcp = message?.new_chat_participant;
	if (!ptcp) return new Response('OK');

	const { id = '', first_name = '', last_name = '' } = ptcp || {};
	const ptcpName = `${first_name} ${last_name}`;
	const ptcpMention = `[${ptcpName.trim()}](tg://user?id=${id})`;
	const welcomeText = `欢迎  ${ptcpMention}  加入讨论组！

		* 提问前须知：

		  - 遇到任何问题请先将 GUI 客户端和滚动发行升级到最新版。
		  - 请确保你当前使用的 GUI 版本，与所选内核兼容。
		  - 提问应直接发报错或者日志截图，而不是一堆意义不明的文字。(没有人喜欢做问答题)
		  - 有关 GUI 操作和内核配置的相关问题都可 @ 智能助手(${botName}) 提问，以获得及时解答。`;

	try {
		const { message_id } = (await sendTelegramMessage(botToken, chatId, welcomeText, null, 'HTML')) || {};

		if (message_id) await scheduleDeletion(env, botToken, chatId, message_id, 120_000);
	} catch (e) {
		console.error(`Error in handleNewChatPtcp: \`${e.message || e}\``);
	}
	return new Response('OK');
};
