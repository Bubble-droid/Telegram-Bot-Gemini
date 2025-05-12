// src/handlers/document-handler.js

import { sendErrorNotification } from '../utils/utils';

/**
 * 处理通用文本文件消息并进行提问 (支持 txt, csv, md 等)
 * @param {object} message Telegram message 对象
 * @param {object} env Cloudflare Worker environment
 * @param {string} botName 机器人名称
 * @param {function} sendTelegramMessage 发送 Telegram 消息的函数
 * @param {function} getJsonFromKv 工具函数，从 KV 获取 JSON 数据
 * @returns {Promise<void>}
 */

export async function handleTextFileMessage(env, botToken, botName, message) {
	console.log('开始处理文本文件消息...');

	const {
		document: { file_id: fileId, file_name: fileName },
		caption: msgCaption = '',
	} = message;

	const text = msgCaption.replace(new RegExp(`@${botName}`, 'gi'), '').trim() || '';

	console.log(`文件 file_id: ${fileId}, 文件名: ${fileName}`);

	try {
		const fileInfoResponse = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`);
		if (!fileInfoResponse.ok) {
			console.error('获取文件信息失败:', fileInfoResponse.status, fileInfoResponse.statusText);
			return { role: 'user', content: `${text}\n\n文件 ${fileName} 内容: \n\n获取文件信息失败` };
		}
		const fileInfo = await fileInfoResponse.json();
		if (!fileInfo.ok) {
			console.error('获取文件 API 失败:', fileInfo);
			return { role: 'user', content: `${text}\n\n文件 ${fileName} 内容: \n\n获取文件 API 失败` };
		}
		const filePath = fileInfo.result.file_path;
		const fileDownloadUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;
		console.log(`文件下载 URL: ${fileDownloadUrl}`);

		const fileResponse = await fetch(fileDownloadUrl);
		if (!fileResponse.ok) {
			console.error('下载文件失败:', fileResponse.status, fileResponse.statusText);
			return { role: 'user', content: `${text}\n\n文件 ${fileName} 内容: \n\n下载文件失败` };
		}
		const fileText = await fileResponse.text(); //  !!!  使用 text() 获取文件内容 !!!
		return { role: 'user', content: `${text}\n\n文件 ${fileName} 内容: \n\n${fileText.trim()}` };
	} catch (e) {
		console.error('处理文本文件消息失败:', e);
		await sendErrorNotification(env, e, 'src/handlers/document-handler.js - handleTextFileMessage 函数 - 处理文本文件消息失败...');
		return { role: 'user', content: `${text}\n\n文件 ${fileName} 内容: \n\n处理文件消息失败` };
	}
}
