const fs = require('fs');
const path = require('path');
const { Octokit } = require('@octokit/rest');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// GitHub配置
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO_OWNER = process.env.GITHUB_REPO_OWNER;
const GITHUB_REPO_NAME = process.env.GITHUB_REPO_NAME;

const octokit = new Octokit({
  auth: GITHUB_TOKEN,
});

// 获取今天的日期字符串
function getTodayDateString() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}/${month}/${day}`;
}

// 更新GitHub仓库中的CSV文件
async function updateGitHubCSV(csvContent) {
  try {
    console.log('📤 更新GitHub仓库中的CSV文件...');
    
    // 检查必要的环境变量
    if (!GITHUB_TOKEN || !GITHUB_REPO_OWNER || !GITHUB_REPO_NAME) {
      throw new Error('GitHub配置不完整：缺少TOKEN、REPO_OWNER或REPO_NAME');
    }
    
    // 获取当前文件内容以获取SHA
    let sha = null;
    try {
      const { data: currentFile } = await octokit.rest.repos.getContent({
        owner: GITHUB_REPO_OWNER,
        repo: GITHUB_REPO_NAME,
        path: 'public/markers.csv',
      });
      sha = currentFile.sha;
    } catch (error) {
      if (error.status === 404) {
        console.log('📝 文件不存在，将创建新文件');
      } else {
        console.warn('⚠️ 获取文件SHA失败:', error.message);
      }
    }

    const today = getTodayDateString();
    const message = `🚚 更新送货数据 - ${today} (手动修正记录250610113146)`;

    // 🔍 调试：检查当前文件内容
    console.log(`🔍 当前文件SHA: ${sha}`);
    console.log(`🔍 新文件大小: ${csvContent.length} 字符`);
    console.log(`🔍 新文件前100字符: ${csvContent.substring(0, 100)}...`);
    
    // 更新或创建文件
    const updateResult = await octokit.rest.repos.createOrUpdateFileContents({
      owner: GITHUB_REPO_OWNER,
      repo: GITHUB_REPO_NAME,
      path: 'public/markers.csv',
      message: message,
      content: Buffer.from(csvContent).toString('base64'),
      sha: sha, // 如果文件存在则提供SHA，不存在则为null
    });

    console.log('✅ GitHub CSV文件更新成功');
    console.log(`📄 文件大小: ${csvContent.length} 字符`);
    console.log(`🔍 GitHub API响应:`, JSON.stringify({
      commit: updateResult.data.commit?.sha,
      content: updateResult.data.content?.sha,
      message: updateResult.data.commit?.message
    }, null, 2));
    return updateResult;
  } catch (error) {
    console.error('❌ 更新GitHub CSV文件失败:', {
      status: error.status,
      message: error.message,
      response: error.response?.data
    });
    throw error;
  }
}

// 主函数
async function main() {
  try {
    // 读取本地CSV文件
    const csvPath = path.join(__dirname, '..', 'delivery_locations.csv');
    const csvContent = fs.readFileSync(csvPath, 'utf8');
    
    console.log('📖 读取本地CSV文件成功');
    console.log(`📄 文件大小: ${csvContent.length} 字符`);
    
    // 更新GitHub
    await updateGitHubCSV(csvContent);
    
    console.log('🎉 GitHub CSV文件更新完成！');
  } catch (error) {
    console.error('❌ 更新失败:', error.message);
    process.exit(1);
  }
}

// 运行主函数
main();