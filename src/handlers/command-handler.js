// src/handlers/command-handler.js

import {
	addGroupToWhitelist,
	isUserWhitelisted,
	removeGroupFromWhitelist,
	putJsonToKv,
	getJsonFromKv,
	isUserBlacklisted,
	addUserToBlacklist,
	removeUserFromBlacklist,
	sendErrorNotification,
} from '../utils/utils';
import { clearUserContextHistory, clearGroupContextHistory } from '../storage/context-storage';
import { sendTelegramMessage, setBotCommands } from '../api/telegram-api';
import { scheduleDeletion } from '../utils/scheduler';

export const botCommands = [
	{ command: 'start', description: '查看机器人介绍和使用方法' },
	{ command: 'help', description: '查看可用命令列表' },
	// { command: 'search', description: '使用 Google 搜索' },
	// { command: 'exp_img', description: '实验性图片生成' },
	{ command: 'clear_user_context', description: '清理您在本群组的历史上下文' },
	{ command: 'clear_group_context', description: '清理本群组中所有用户的历史上下文(白名单用户)' },
	{ command: 'whitelist_group', description: '将当前群组加入白名单 (白名单用户)' },
	{ command: 'unwhitelist_group', description: '将当前群组从白名单移除 (白名单用户)' },
	{ command: 'ban', description: '将用户加入黑名单 (白名单用户)' },
	{ command: 'uban', description: '将用户从黑名单移除 (白名单用户)' },
];

/**
 * 处理 Bot 命令 -  !!!  修正函数定义，添加 modelName 和 taskQueueKv 参数，并调整参数顺序 !!!
 * @param {object} message Telegram message 对象
 * @param {object} env Cloudflare Worker environment
 * @param {string} botName 机器人名称
 * @param {function} sendTelegramMessage  发送 Telegram 消息的函数 (从 index.js 传入)
 * @param {string} modelName  默认模型名称 (从 index.js 传入)  !!!  添加 modelName 参数 !!!
 * @param {function} deleteTelegramMessage  删除 Telegram 消息的函数 (从 index.js 传入)
 * @param {KVNamespace} taskQueueKv  任务队列 KV 命名空间  !!!  taskQueueKv 参数放在最后 !!!
 * @returns {Promise<Response>}
 */
export async function handleBotCommand(
	env,
	message,
	userId,
	chatId,
	replyToMessageId,
	botToken,
	botName,
	modelName,
	contextKv,
	imageDataKv,
	botConfigKv,
	userWhitelistKey,
	userBlacklistKey,
) {
	//  !!!  修正后的函数定义 !!!
	console.log('进入命令处理器 handleBotCommand');
	try {
		const botCommandPrefix = '/'; //  定义命令前缀
		const messageText = message.text || message.caption || ''; // 获取消息文本
		const botNameMention = `@${botName}`; //  完整的 @botName 提及
		const botNameMentionLowerCase = botNameMention.toLowerCase(); //  !!!  添加小写 botNameMention 用于忽略大小写匹配 !!!

		let command = '';
		let isBotCommand = false; // 标记是否为 Bot 命令

		const entitiesToCheck = message.entities ? message.entities : message.caption_entities ? message.caption_entities : [];

		if (entitiesToCheck.length > 0) {
			for (const entity of entitiesToCheck) {
				if (entity.type === 'bot_command') {
					const messageText = message.text || message.caption || ''; // 同时获取 message.text 和 message.caption
					const commandText = messageText.substring(entity.offset, entity.offset + entity.length);
					const normalizedCommandText = commandText.toLowerCase(); // !!! 将 entity 中的 commandText 也转换为小写进行匹配 !!!

					if (normalizedCommandText.startsWith(botCommandPrefix) && normalizedCommandText.includes(botNameMentionLowerCase)) {
						// !!! 检查命令是否以 / 开头 并且 包含 @botname (忽略大小写) !!!
						command = commandText.replace(botNameMention, '').substring(botCommandPrefix.length).trim().toLowerCase(); // 提取命令，移除 @botName, 去除前缀 '/', 转小写
						isBotCommand = true;
						break; // 找到第一个 bot_command entity 即可，跳出循环
					} else {
						console.log(`检测到 bot 命令：${commandText}, 但不是针对本 Bot, 忽略 `); // 更详细的日志
						return new Response('OK');
					}
				}
			}
		}

		console.log(`handleBotCommand: 解析出的命令: ${command}`);

		const userIsWhitelisted = await isUserWhitelisted(botConfigKv, userWhitelistKey, userId);

		const commandsToList = userIsWhitelisted
			? botCommands // 白名单用户显示所有命令
			: botCommands.filter((cmd) => !cmd.description.includes('白名单')); // 非白名单用户过滤掉包含“白名单”描述的命令

		await setBotCommands(botToken, commandsToList, chatId, userId);

		let replyText; // 默认回复
		let sendMessage;

		//  !!!  黑名单检测 (在命令处理之前)  !!!
		const isBlacklistedUser = await isUserBlacklisted(botConfigKv, userBlacklistKey, userId); //  !!!  检查用户是否在黑名单 !!!
		if (isBlacklistedUser) {
			console.log(`用户 ${userId} 在黑名单中，拒绝执行命令 ${command}`);
			replyText = '😅抱歉！你无权使用此机器人！';
			sendMessage = await sendTelegramMessage(botToken, chatId, replyText, replyToMessageId, 'HTML');
			await scheduleDeletion(env, botToken, chatId, sendMessage?.message_id, 10 * 1000);
			await scheduleDeletion(env, botToken, chatId, replyToMessageId, 10 * 1000);
			return;
		}

		let isWhitelistedUserForCommand = false; //  !!!  添加变量，标记用户是否有权限执行命令

		//  !!!  /search 命令的特殊权限处理 (保持不变) !!!
		if (command === 'start' || command === 'help' || command === 'clear_user_context') {
			const groupWhitelistKey = env.GROUP_WHITELIST_KV_KEY;
			const groupWhitelist = (await getJsonFromKv(botConfigKv, groupWhitelistKey)) || [];
			if (groupWhitelist.includes(chatId)) {
				console.log(`群组 ${chatId} 在白名单中，允许群组内所有用户使用特定命令`);
				isWhitelistedUserForCommand = true;
			} else {
				console.log(`群组 ${chatId} 不在白名单中，特定命令仅限白名单用户使用`);
				isWhitelistedUserForCommand = await isUserWhitelisted(botConfigKv, userWhitelistKey, userId); //  非白名单群组，仍然需要用户在白名单中
			}
		} else {
			//  !!!  其他命令的通用权限检查 (保持不变) !!!
			isWhitelistedUserForCommand = await isUserWhitelisted(botConfigKv, userWhitelistKey, userId); //  其他命令仍然需要用户在白名单中
		}

		//  !!!  检查用户是否有权限执行命令  !!!
		if (!isWhitelistedUserForCommand) {
			console.log(`用户 ${userId} 没有权限使用命令 ${command}`);
			replyText = '🚫 抱歉，您没有权限使用该命令。';
			sendMessage = await sendTelegramMessage(botToken, chatId, replyText, replyToMessageId, 'HTML');
			await scheduleDeletion(env, botToken, chatId, sendMessage?.message_id, 10 * 1000);
			await scheduleDeletion(env, botToken, chatId, replyToMessageId, 10 * 1000);
			return new Response('OK'); //  拒绝执行命令
		}

		console.log(`用户 ${userId} 拥有命令 ${command} 的执行权限`);

		switch (command) {
			case 'start':
				replyText =
					`👋 我是基于 **Gemini API** 的群组智能助手，我的任务是帮助大家使用 **GUI.for.Cores** 应用。\n\n` +
					`🤖️ 当前使用模型: \`${modelName}\`\n\n` +
					`✨ **使用说明**：\n\n` +
					`1. 💬 **问题解答**：\`@${botName} 你的问题\`，可以带上图片或者配置文件。\n` +
					`2. 🗣️ **连续对话**：冷却结束后直接回复我的回答，无需 @ 我，开始继续对话。\n` +
					`3. 📝 **引用提问**：回复某条消息，将那条消息作为引用来源提问。\n` +
					`4. 🧹 **清理上下文**：如我的回答错乱，可使用命令 /clear_user_context@${botName} 清理历史上下文。\n` +
					// `5. 📷 **图片生成**：\`/exp_img@${botName} 图片生成提示。\`\n\n` +
					`⏱️ **冷却机制**：因 API 请求存在频率限制，故需要 90 秒的冷却时间以保证正常工作。\n\n` +
					`❓ **提问须知**：请详细描述问题，我不会算命。\n\n` +
					`⚠️ **注意**：请勿私聊机器人！`;
				await sendTelegramMessage(botToken, chatId, replyText, replyToMessageId); // 发送回复
				break;
			case 'help': // !!! help 命令保持不变 !!!
				replyText = '🤖️ 当前可用命令列表：\n\n';
				const userIsWhitelisted = await isUserWhitelisted(botConfigKv, userWhitelistKey, userId);

				const commandsToList = userIsWhitelisted
					? botCommands // 白名单用户显示所有命令
					: botCommands.filter((cmd) => !cmd.description.includes('白名单')); // 非白名单用户过滤掉包含“白名单”描述的命令

				commandsToList.forEach((cmd) => {
					replyText += `/${cmd.command}@${botName} - ${cmd.description}\n`;
				});

				await sendTelegramMessage(botToken, chatId, replyText, replyToMessageId, 'HTML'); // 发送回复
				break;

			// case 'exp_img':
			// 	replyText = `😅 **抱歉！图片生成功能暂不可用...**`;
			// 	await sendTelegramMessage(botToken, chatId, replyText, replyToMessageId, 'HTML');
			//
			// 	await handleImageGeneration(
			// 		env,
			// 		message,
			// 		userId,
			// 		chatId,
			// 		replyToMessageId,
			// 		botToken,
			// 		botName,
			// 		botConfigKv,
			// 		isGroupInCooldown,
			// 		userWhitelistKey,
			// 		cooldownDuration,
			// 		sendTelegramMessage,
			// 		deleteTelegramMessage,
			// 		recordGroupRequestTimestamp,
			// 	);
			// 	break;
			case 'clear_user_context': //  !!!  新增 clear_user_context 命令处理 !!!
				console.log(`收到清理用户上下文命令，用户 ID: ${userId}, 群组 ID: ${chatId}`);
				await clearUserContextHistory(env, botToken, contextKv, chatId, userId, replyToMessageId);
				break;
			case 'clear_group_context':
				console.log(`收到清理群组上下文命令，群组 ID: ${chatId}`);
				await clearGroupContextHistory(env, botToken, contextKv, imageDataKv, chatId, replyToMessageId);
				break;
			case 'whitelist_group':
				console.log(`收到添加群组到白名单命令，群组 ID: ${chatId}`);
				const groupWhitelistKey = env.GROUP_WHITELIST_KV_KEY;
				await addGroupToWhitelist(botConfigKv, groupWhitelistKey, chatId);
				replyText = '✅ 本群组已添加到白名单。';
				sendMessage = await sendTelegramMessage(botToken, chatId, replyText, replyToMessageId, 'HTML');
				await scheduleDeletion(env, botToken, chatId, sendMessage?.message_id, 10 * 1000);
				await scheduleDeletion(env, botToken, chatId, replyToMessageId, 10 * 1000);
				break;
			case 'unwhitelist_group':
				console.log(`收到移除群组白名单命令，群组 ID: ${chatId}`);
				const groupWhitelistKeyForRemove = env.GROUP_WHITELIST_KV_KEY;
				await removeGroupFromWhitelist(botConfigKv, groupWhitelistKeyForRemove, chatId);
				replyText = '✅ 本群组已从白名单移除。';
				sendMessage = await sendTelegramMessage(botToken, chatId, replyText, replyToMessageId, 'HTML');
				await scheduleDeletion(env, botToken, chatId, sendMessage?.message_id, 10 * 1000);
				await scheduleDeletion(env, botToken, chatId, replyToMessageId, 10 * 1000);
				break;
			// case 'search': //  !!!  search 命令的处理 !!!
			// 	replyText = `😅 **抱歉！搜索功能正在维护中...**`;
			// 	await sendTelegramMessage(botToken, chatId, replyText, replyToMessageId, 'HTML');
			// 	break;
			// console.log('handleBotCommand: 检测到 /search 命令，调用 handleSearchCommand 处理');
			// return handleSearchCommand(message, env, botName, sendTelegramMessage, modelName, deleteTelegramMessage, taskQueueKv);
			case 'ban': //  !!!  ban 命令处理  !!!
				await handleBanCommand(message, env, botName); //  !!!  调用 handleBanCommand 函数 !!!
				break;
			case 'uban': //  !!!  uban 命令处理  !!!
				await handleUbanCommand(message, env, botName); //  !!!  调用 handleUbanCommand 函数 !!!
				break;
			default:
				console.log(`handleBotCommand: 未知命令: ${command}`);
				replyText = `🤖️ 未知命令：${command} \n\n可以使用 /help@${botName} 查看可用命令。`;
				const { message_id } = (await sendTelegramMessage(botToken, chatId, replyText, replyToMessageId, 'HTML')) || {};
				if (message_id) await scheduleDeletion(env, botToken, chatId, message_id, 10_000);
				if (replyToMessageId) await scheduleDeletion(env, botToken, chatId, replyToMessageId, 10_000);
		}
	} catch (error) {
		console.error(`Error in handleBotCommand: ${error}`);
		await sendErrorNotification(env, error, 'src/handlers/command-handler.js - handleBotCommand');
	}
	return new Response('OK');
}

/**
 * 处理 /ban 命令
 * @param {object} message Telegram message 对象
 * @param {object} env Cloudflare Worker environment
 * @param {string} botName 机器人名称
 * @param {function} sendTelegramMessage  发送 Telegram 消息的函数
 * @param {function} deleteTelegramMessage  删除 Telegram 消息的函数
 * @returns {Promise<Response>}
 */
async function handleBanCommand(message, env, botName) {
	//  !!!  新增 handleBanCommand 函数  !!!
	console.log('处理 /ban 命令');
	const chatId = message.chat.id;
	const botConfigKv = env.BOT_CONFIG;
	const userBlacklistKey = env.USER_BLACKLIST_KV_KEY;
	const commandText = message.text || message.caption || '';
	const args = commandText.split(/\s+/).slice(1); //  !!!  修正为 slice(1) !!!
	const targetUserId = parseInt(args[0]); //  尝试解析 userId 为整数

	if (!targetUserId || isNaN(targetUserId)) {
		const replyText = '🚫 请提供要加入黑名单的 **有效用户 ID**。\n\n例如：\`/ban@' + botName + ' 1234567890\`';
		await sendTelegramMessage(env.BOT_TOKEN, chatId, replyText, message.message_id, 'HTML');
		return new Response('OK');
	}

	await addUserToBlacklist(botConfigKv, userBlacklistKey, targetUserId); //  添加到黑名单
	const replyText = `✅ 用户 \`${targetUserId}\` 已加入黑名单。`;

	return new Response('OK');
}

/**
 * 处理 /uban 命令
 * @param {object} message Telegram message 对象
 * @param {object} env Cloudflare Worker environment
 * @param {string} botName 机器人名称
 * @param {function} sendTelegramMessage  发送 Telegram 消息的函数
 * @param {function} deleteTelegramMessage  删除 Telegram 消息的函数
 * @returns {Promise<Response>}
 */
async function handleUbanCommand(message, env, botName) {
	//  !!!  新增 handleUbanCommand 函数  !!!
	console.log('处理 /uban 命令');
	const chatId = message.chat.id;
	const botConfigKv = env.BOT_CONFIG;
	const userBlacklistKey = env.USER_BLACKLIST_KV_KEY;
	const commandText = message.text || message.caption || '';
	const args = commandText.split(/\s+/).slice(1); //  !!!  修正为 slice(1) !!!
	const targetUserId = parseInt(args[0]); //  尝试解析 userId 为整数

	if (!targetUserId || isNaN(targetUserId)) {
		const replyText = '🚫 请提供要从黑名单移除的 **有效用户 ID**。\n\n例如：\`/uban@' + botName + ' 1234567890\`';
		await sendTelegramMessage(env.BOT_TOKEN, chatId, replyText, message.message_id, 'HTML');
		return new Response('OK');
	}

	await removeUserFromBlacklist(botConfigKv, userBlacklistKey, targetUserId); //  从黑名单移除
	const replyText = `✅ 用户 \`${targetUserId}\` 已从黑名单移除。`;

	return new Response('OK');
}

/**
 * 处理命令回复并清理消息 (通用函数) -  修改为使用 KV 轮询实现延迟删除
 * @param {string} botToken Telegram Bot Token
 * @param {number} chatId  Chat ID
 * @param {string} replyText  回复文本
 * @param {number} commandMessageId  命令消息 ID
 * @param {function} sendTelegramMessage  发送 Telegram 消息的函数
 * @param {function} deleteTelegramMessage  删除 Telegram 消息的函数
 * @param {KVNamespace} botConfigKv  BOT_CONFIG KV 命名空间
 * @param {number} replyToMessageId  回复消息 ID (可选)
 * @returns {Promise<void>}
 */
export async function handleCommandReplyAndCleanup(
	botToken,
	chatId,
	replyText,
	commandMessageId,
	sendTelegramMessage,
	deleteTelegramMessage,
	env,
	replyToMessageId = null,
	botName,
) {
	//  !!!  新增 taskQueueKv 参数 !!!
	console.log('开始处理命令回复和清理消息 (KV 轮询延迟)...');
	const sendResult = await sendTelegramMessage(botToken, chatId, replyText, replyToMessageId, 'HTML'); //  发送回复消息
	if (sendResult.ok && sendResult.message_id) {
		const botReplyMessageId = sendResult.message_id; //  获取机器人回复消息 ID
		console.log(`机器人回复消息 ID: ${botReplyMessageId}`);

		const deletionReadyTimestamp = Date.now() + 3000; //  3 秒后的时间戳
		const deletionSignalKey = `delete_message:${chatId}:${commandMessageId}:${botReplyMessageId}`; //  唯一的 KV 键
		const taskQueueKv = env.TASK_QUEUE_KV; //  !!!  从 env 中获取 taskQueueKv !!!
		await putJsonToKv(taskQueueKv, deletionSignalKey, {
			chatId: chatId,
			commandMessageId: commandMessageId,
			botReplyMessageId: botReplyMessageId,
			deletionReadyTimestamp: deletionReadyTimestamp,
		});
		console.log(`已存储消息删除指令到 KV，key: ${deletionSignalKey}, 删除就绪时间戳: ${deletionReadyTimestamp}`);

		//  !!!  使用 KV 轮询实现延迟删除  !!!
		console.log('开始 KV 轮询检测删除就绪时间...');
		const delayCheckInterval = 1000; //  轮询间隔 500 毫秒
		let deletionTriggered = false; //  标记是否已触发删除，避免重复删除

		while (true) {
			//  无限循环，直到删除操作完成
			const now = Date.now();
			const storedDeletionSignal = await getJsonFromKv(taskQueueKv, deletionSignalKey); //  每次循环都从 KV 读取最新的删除指令
			if (storedDeletionSignal && now >= storedDeletionSignal.deletionReadyTimestamp && !deletionTriggered) {
				//  检查时间是否到达，并且尚未触发删除
				console.log(`删除就绪时间已到，开始删除消息... (当前时间: ${now}, 删除就绪时间: ${storedDeletionSignal.deletionReadyTimestamp})`);

				await deleteTelegramMessage(botToken, chatId, storedDeletionSignal.commandMessageId); //  删除用户命令消息
				await deleteTelegramMessage(botToken, chatId, storedDeletionSignal.botReplyMessageId); //  删除机器人回复消息
				await taskQueueKv.delete(deletionSignalKey); //  删除 KV 中的删除指令
				console.log(
					`用户命令消息 (ID: ${storedDeletionSignal.commandMessageId}) 和机器人回复消息 (ID: ${storedDeletionSignal.botReplyMessageId}) 删除完成`,
				);
				deletionTriggered = true; //  标记为已触发删除
				break; //  跳出循环，完成删除操作
			} else {
				//  时间未到，或删除指令不存在，则等待一段时间后再次检查
				//  如果删除指令已被其他请求处理 (例如，由于网络延迟导致重复请求)，则 storedDeletionSignal 可能为 null，此时也应该跳出循环，避免无限循环
				if (!storedDeletionSignal) {
					console.log('KV 中删除指令已不存在，跳出轮询');
					break; //  跳出循环
				}
				// console.log(`删除就绪时间未到，等待 ${delayCheckInterval} 毫秒后再次检查... (当前时间: ${now}, 删除就绪时间: ${storedDeletionSignal.deletionReadyTimestamp})`); //  减少日志输出
				await new Promise((resolve) => setTimeout(resolve, delayCheckInterval)); //  等待一段时间
			}
		} //  while 循环 结束

		console.log('KV 轮询延迟删除处理完成');
	} else {
		console.error('发送命令回复消息失败，无法进行消息清理 (KV 轮询延迟)'); //  如果回复消息发送失败，则无法进行消息清理
	}
}
