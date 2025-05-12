// src/storage/context-storage.js

import { getJsonFromKv, putJsonToKv, deleteAllKeys } from '../utils/utils'; //  只导入需要的通用 KV 函数
import { scheduleDeletion } from '../utils/scheduler';
import { sendTelegramMessage, deleteTelegramMessage } from '../api/telegram-api';

/**
 * 获取用户在群组中的上下文历史
 * @param {KVNamespace} contextKvNamespace
 * @param {number} groupId
 * @param {number} userId
 * @returns {Promise<Array<object>>}
 */
export async function getUserContextHistory(contextKvNamespace, groupId, userId) {
	const key = `context:${groupId}:${userId}`;
	return (await getJsonFromKv(contextKvNamespace, key)) || []; // 默认返回空数组
}

/**
 * 更新用户在群组中的上下文历史 -  恢复为接收 messageContent 参数
 * @param {KVNamespace} contextKvNamespace
 * @param {KVNamespace} imageDataKvNamespace
 * @param {number} groupId
 * @param {number} userId
 * @param {object} messageContent  新的消息内容 (例如 { role: 'user', content: '...' }) -  恢复为 messageContent
 * @param {number} maxHistoryLength  最大历史记录条数
 * @returns {Promise<void>}
 */
export async function updateUserContextHistory(contextKvNamespace, groupId, userId, messageContent, maxHistoryLength = 5) {
	//  !!!  恢复为 messageContent 参数  !!!
	const key = `context:${groupId}:${userId}`;
	const previousHistory = await getUserContextHistory(contextKvNamespace, groupId, userId);
	const history = [...previousHistory, ...messageContent];

	// history.push(messageContent); //  直接 push messageContent

	if (history.length > maxHistoryLength) {
		history.splice(0, history.length - maxHistoryLength);
	}

	await putJsonToKv(contextKvNamespace, key, history, 604800);

	console.log(`已更新用户 ${userId} 在群组 ${groupId} 的上下文`);
}

/**
 * 清空用户在群组中的上下文历史 (可选，如果需要)
 * @param {KVNamespace} contextKvNamespace
 * @param {number}chatId
 * @param {number} userId
 * @returns {Promise<void>}
 */
export async function clearUserContextHistory(env, botToken, contextKv, chatId, userId, userMessageId) {
	try {
		const tempReplyMessage = await sendTelegramMessage(botToken, chatId, '**开始清理**...', userMessageId, 'HTML');
		const tempReplyMessageId = tempReplyMessage?.message_id;

		const key = `context:${chatId}:${userId}`;
		await putJsonToKv(contextKv, key, []);

		console.log(`用户 ${userId} 在群组 ${chatId} 的上下文已清理...`);

		if (tempReplyMessageId) {
			await deleteTelegramMessage(botToken, chatId, tempReplyMessageId);
		}

		const clearReplyMessage = await sendTelegramMessage(botToken, chatId, '✅ 您的对话上下文**已清理**。', userMessageId, 'HTML');
		const clearReplyMessageId = clearReplyMessage?.message_id;

		if (clearReplyMessageId) {
			await scheduleDeletion(env, botToken, chatId, clearReplyMessageId, 5 * 1000);
		}

		if (userMessageId) {
			await scheduleDeletion(env, botToken, chatId, userMessageId, 5 * 1000);
		}
	} catch (error) {
		console.error(`Error in clearUserContextHistory: ${error}`);
	}
}

/**
 *  清理群组中所有用户的历史上下文
 */

export async function clearGroupContextHistory(env, botToken, contextKv, imageDataKv, chatId, userMessageId) {
	try {
		// 1. 发送“清理中...”消息
		const tempReplyMessage = await sendTelegramMessage(botToken, chatId, '**开始清理**\.\.\.', userMessageId, 'HTML');
		const tempReplyMessageId = tempReplyMessage?.message_id;

		const kvNamespaces = [contextKv, imageDataKv];
		const clearStatus = await deleteAllKeys(kvNamespaces, chatId);

		if (!clearStatus) {
			if (tempReplyMessageId) {
				await deleteTelegramMessage(botToken, chatId, tempReplyMessageId);
			}
			const errorReply = await sendTelegramMessage(botToken, chatId, '⚠️ 清理发生错误！', userMessageId, 'HTML');
			await scheduleDeletion(env, botToken, chatId, errorReply?.message_id, 5 * 1000);
			if (userMessageId) {
				await scheduleDeletion(env, botToken, chatId, userMessageId, 5 * 1000);
			}
			return;
		}

		console.log(`群组 ${chatId} 的所有用户上下文已清理...`);

		if (tempReplyMessageId) {
			await deleteTelegramMessage(botToken, chatId, tempReplyMessageId);
		}

		// 3. 发送“已清理”消息
		const replyText = '✅ 本周在本群组中积累的所有上下文和图片数据已清理完成。';
		const clearReplyMessage = await sendTelegramMessage(botToken, chatId, replyText, userMessageId, 'HTML');
		const clearReplyMessageId = clearReplyMessage?.message_id;

		if (clearReplyMessageId) {
			await scheduleDeletion(env, botToken, chatId, clearReplyMessageId, 5 * 1000);
		}
		if (userMessageId) {
			await scheduleDeletion(env, botToken, chatId, userMessageId, 5 * 1000);
		}
	} catch (error) {
		console.error(`Error in clearGroupContextHistory: ${error}`);
		throw error;
	}
}
