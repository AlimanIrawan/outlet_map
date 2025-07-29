const express = require('express');
const axios = require('axios');
const cron = require('node-cron');
const { Octokit } = require('@octokit/rest');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5001;

// 中间件配置
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // 添加静态文件服务

// 飞书API配置
const FEISHU_APP_ID = process.env.FEISHU_APP_ID;
const FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET;
const FEISHU_APP_TOKEN = process.env.FEISHU_APP_TOKEN;
const FEISHU_TABLE_ID = process.env.FEISHU_TABLE_ID;

// GitHub配置
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO_OWNER = process.env.GITHUB_REPO_OWNER;
const GITHUB_REPO_NAME = process.env.GITHUB_REPO_NAME;

const octokit = new Octokit({
  auth: GITHUB_TOKEN,
});

let accessToken = null;
let tokenExpiry = 0;

// 获取飞书访问令牌
async function getFeishuAccessToken() {
  try {
    if (accessToken && Date.now() < tokenExpiry) {
      return accessToken;
    }

    console.log('🔑 获取飞书访问令牌...');
    
    // 检查必要的环境变量
    if (!FEISHU_APP_ID || !FEISHU_APP_SECRET) {
      throw new Error('飞书API配置不完整：缺少APP_ID或APP_SECRET');
    }

    const response = await axios.post('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
      app_id: FEISHU_APP_ID,
      app_secret: FEISHU_APP_SECRET
    }, {
      timeout: 10000 // 10秒超时
    });

    if (response.data.code === 0) {
      accessToken = response.data.tenant_access_token;
      tokenExpiry = Date.now() + (response.data.expire - 300) * 1000; // 提前5分钟刷新
      console.log('✅ 飞书访问令牌获取成功');
      return accessToken;
    } else {
      throw new Error(`获取访问令牌失败 (code: ${response.data.code}): ${response.data.msg}`);
    }
  } catch (error) {
    if (error.response) {
      console.error('❌ 飞书API响应错误:', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data
      });
      throw new Error(`飞书API错误 ${error.response.status}: ${error.response.statusText}`);
    } else if (error.request) {
      console.error('❌ 飞书API网络错误:', error.message);
      throw new Error(`网络连接失败: ${error.message}`);
    } else {
      console.error('❌ 获取飞书访问令牌失败:', error.message);
      throw error;
    }
  }
}

// 获取今天的日期字符串 (YYYY/MM/DD 格式)
function getTodayDateString() {
  // 使用Jakarta时区获取当前日期
  const today = new Date();
  const jakartaDate = new Date(today.toLocaleString("en-US", {timeZone: "Asia/Jakarta"}));
  const year = jakartaDate.getFullYear();
  const month = String(jakartaDate.getMonth() + 1).padStart(2, '0');
  const day = String(jakartaDate.getDate()).padStart(2, '0');
  return `${year}/${month}/${day}`;
}

// 从飞书多维表格获取数据
async function getFeishuData() {
  try {
    const token = await getFeishuAccessToken();
    const todayDate = getTodayDateString();
    
    console.log(`📅 获取今天的送货数据: ${todayDate}`);
    
    // 获取所有记录
    let allRecords = [];
    let hasMore = true;
    let pageToken = null;

    while (hasMore) {
      const url = `https://open.feishu.cn/open-apis/bitable/v1/apps/${FEISHU_APP_TOKEN}/tables/${FEISHU_TABLE_ID}/records`;
      const params = {
        page_size: 500
      };
      
      if (pageToken) {
        params.page_token = pageToken;
      }

      console.log('🔍 正在获取飞书数据...');
      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        params,
        timeout: 15000 // 15秒超时
      });

      if (response.data.code === 0) {
        const records = response.data.data.items || [];
        allRecords = allRecords.concat(records);
        
        hasMore = response.data.data.has_more;
        pageToken = response.data.data.page_token;
        
        console.log(`📦 已获取 ${records.length} 条记录`);
      } else {
        console.error('❌ 飞书数据API错误:', {
          code: response.data.code,
          msg: response.data.msg,
          url: url
        });
        throw new Error(`获取数据失败 (code: ${response.data.code}): ${response.data.msg}`);
      }
    }

    console.log(`📊 总共获取 ${allRecords.length} 条记录`);

    // 添加调试：输出第一条记录的所有字段名和原始数据
    if (allRecords.length > 0) {
      console.log('📋 飞书表格字段列表:', Object.keys(allRecords[0].fields));
      console.log('\n🔍 === 第一条记录的原始字段数据 ===');
      const firstRecord = allRecords[0].fields;
      Object.keys(firstRecord).forEach(fieldName => {
        console.log(`📝 字段 "${fieldName}":`, JSON.stringify(firstRecord[fieldName], null, 2));
      });
      console.log('=== 原始字段数据结束 ===\n');
    }

    // 过滤符合条件的数据：只检查Outlet Status为Active，包含所有记录（包括没有冰柜投放日期的）
    const filteredRecords = allRecords.filter(record => {
      const outletStatus = getFieldText(record.fields['Outlet Status']);
      
      // 只检查Outlet Status是否为Active，不再过滤冰柜投放日期
      if (outletStatus !== 'Active') {
        console.log(`⚠️ 跳过非Active状态的记录: ${record.fields['Outlet Code'] || 'Unknown'} - 状态: ${outletStatus}`);
        return false;
      }
      
      console.log(`✅ 符合条件的记录: ${record.fields['Outlet Code']} - 状态: ${outletStatus}`);
      return true;
    });
    
    // 辅助函数：提取飞书字段的文本值
    function getFieldText(field) {
      if (!field) return '';
      if (Array.isArray(field) && field.length > 0 && field[0].text) {
        return field[0].text;
      }
      if (typeof field === 'string') return field;
      if (typeof field === 'number') return field.toString();
      return '';
    }
    
    // 辅助函数：提取飞书选择字段的值（处理选项ID数组）
    function getSelectFieldText(field) {
      if (!field) return '';
      
      // 处理选择字段的选项ID数组格式
      if (Array.isArray(field) && field.length > 0) {
        // 如果是文本数组格式 [{text: "value"}]
        if (field[0] && field[0].text) {
          return field[0].text;
        }
        // 如果是选项ID数组格式 ["opt5eb0nvd"]
        if (typeof field[0] === 'string') {
          // 这里我们需要将选项ID映射为实际文本
          // 根据飞书表格的选项配置，映射选项ID到实际文本
          const optionMapping = {
            'optJpS4dvk': 'Udah Pasang',
            'optKNgzwtU': 'Udah kasih, belum pasang',
            'optzNgL1Xk': 'iLang',
            'opt5eb0nvd': 'Belum kasih, belum pasang'
          };
          return optionMapping[field[0]] || field[0]; // 如果找不到映射就返回原始ID
        }
      }
      
      // 回退到普通文本处理
      return getFieldText(field);
    }
    
    // 辅助函数：处理日期字段格式
    function getDateFieldText(field) {
      if (!field) return '';
      
      let dateValue = '';
      
      // 处理不同的飞书日期字段格式
      if (Array.isArray(field) && field.length > 0) {
        if (field[0].text) {
          dateValue = field[0].text;
        } else if (field[0]) {
          dateValue = field[0].toString();
        }
      } else if (typeof field === 'string') {
        dateValue = field;
      } else if (typeof field === 'number') {
        // 区分毫秒时间戳和Excel序列号
        if (field > 1000000000000) {
          // 毫秒时间戳（13位数字，大于1000000000000）
          dateValue = new Date(field).toISOString().split('T')[0];
        } else if (field > 1000 && field < 100000) {
          // Excel序列号（4-5位数字）
          const excelEpoch = new Date(1900, 0, 1);
          const daysSinceEpoch = field - 2; // Excel的1900年闰年bug修正
          const resultDate = new Date(excelEpoch.getTime() + daysSinceEpoch * 24 * 60 * 60 * 1000);
          dateValue = resultDate.toISOString().split('T')[0];
        } else {
          // 其他数字格式，尝试直接转换
          dateValue = new Date(field).toISOString().split('T')[0];
        }
      } else if (field && typeof field === 'object') {
        // 处理飞书日期对象格式
        if (field.date) {
          dateValue = field.date;
        } else if (field.timestamp) {
          dateValue = new Date(field.timestamp * 1000).toISOString().split('T')[0];
        }
      }
      
      // 验证和格式化日期
      if (dateValue) {
        try {
          // 如果已经是YYYY-MM-DD格式，直接返回
          if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
            return dateValue;
          }
          
          // 检查是否为Excel序列号格式（字符串形式的数字）
          const numValue = parseFloat(dateValue);
          if (!isNaN(numValue) && numValue > 1000 && numValue < 100000) {
            // Excel序列号转换为日期
            const excelEpoch = new Date(1900, 0, 1);
            const daysSinceEpoch = numValue - 2; // Excel的1900年闰年bug修正
            const resultDate = new Date(excelEpoch.getTime() + daysSinceEpoch * 24 * 60 * 60 * 1000);
            return resultDate.toISOString().split('T')[0];
          }
          
          // 尝试解析标准日期格式
          const parsedDate = new Date(dateValue);
          if (!isNaN(parsedDate.getTime())) {
            // 返回 YYYY-MM-DD 格式
            return parsedDate.toISOString().split('T')[0];
          }
        } catch (error) {
          console.log(`⚠️ 日期格式解析错误: ${dateValue}`, error.message);
        }
      }
      
      return dateValue || '';
    }
    
    // 辅助函数：提取电话号码
    function getPhoneNumber(field) {
      if (!field) return '';
      if (Array.isArray(field) && field.length > 0 && field[0].fullPhoneNum) {
        return field[0].fullPhoneNum;
      }
      return getFieldText(field);
    }

    console.log(`🎯 筛选出符合条件的记录: ${filteredRecords.length} 条`);

    // 转换为CSV格式的数据 - 更新为25字段格式
    const csvData = filteredRecords.map(record => {
      const fields = record.fields;
      
      // 提取25字段结构 - 匹配新的数据格式
      const outletCode = getFieldText(fields['Outlet Code']);
      const namaPemilik = getFieldText(fields['Nama Pemilik']);
      const tanggalJoin = getDateFieldText(fields['Tanggal Join']);
      const type = getFieldText(fields['Type']);
      const tokoType = getFieldText(fields['Toko Type']);
      const event = getFieldText(fields['Event']);
      const contractSign = getDateFieldText(fields['Contract Sign']);
      const tanggalTurunFreezer = getDateFieldText(fields['Tanggal Turun Freezer']);
      const tanggalFirstPOEsKrim = getDateFieldText(fields['Tanggal First PO EsKrim']);
      const dusPerDay = getFieldText(fields['DUS per Day']);
      const totalValueIDR = getFieldText(fields['Total Value IDR']);
      const totalDUS = getFieldText(fields['Total DUS']);
      const poBerapaKali = getFieldText(fields['PO berapa Kali']);
      const poFrequency = getFieldText(fields['PO Frequency']);
      const freezerCode = getFieldText(fields['Freezer Code']);
      // 日期字段处理完成
      
      // 🔍 调试原始字段数据
      console.log(`🔍 原始字段数据 - ${outletCode}:`);
      console.log(`  Spanduk原始:`, JSON.stringify(fields['Spanduk'], null, 2));
      console.log(`  Flag Hanger原始:`, JSON.stringify(fields['Flag Hanger'], null, 2));
      console.log(`  Poster原始:`, JSON.stringify(fields['Poster'], null, 2));
      console.log(`  Papan Harga原始:`, JSON.stringify(fields['Papan Harga'], null, 2));
      console.log(`  Stiker Harga原始:`, JSON.stringify(fields['Stiker Harga'], null, 2));
      
      let spanduk = getSelectFieldText(fields['Spanduk']);
      let flagHanger = getSelectFieldText(fields['Flag Hanger']);
      let poster = getSelectFieldText(fields['Poster']);
      let papanHarga = getSelectFieldText(fields['Papan Harga']);
      let stikerHarga = getSelectFieldText(fields['Stiker Harga']);
      

      
      console.log(`🔍 映射后数据 - ${outletCode}:`);
      console.log(`  Spanduk映射: ${spanduk}`);
      console.log(`  Flag Hanger映射: ${flagHanger}`);
      console.log(`  Poster映射: ${poster}`);
      console.log(`  Papan Harga映射: ${papanHarga}`);
      console.log(`  Stiker Harga映射: ${stikerHarga}`);
      const lastService = getDateFieldText(fields['Last Service']);
      const lastBungaEs = getDateFieldText(fields['Last Bunga Es']);
      const latitude = parseFloat(getFieldText(fields['latitude']));
      const longitude = parseFloat(getFieldText(fields['longitude']));
      const outletStatus = getFieldText(fields['Outlet Status']);
      
      // 🔍 详细调试25字段数据
      console.log(`\n🔍 === 记录详情分析: ${outletCode} ===`);
      console.log(`📋 店主: ${namaPemilik}`);
      console.log(`📅 加入日期: ${tanggalJoin}`);
      console.log(`🏪 类型: ${type}, 店铺类型: ${tokoType}`);
      console.log(`📝 事件: ${event}`);
      console.log(`📄 合同签署: ${contractSign}`);
      console.log(`❄️ 冰柜下放: ${tanggalTurunFreezer}`);
      console.log(`🍦 首次PO: ${tanggalFirstPOEsKrim}`);
      console.log(`📦 每日DUS: ${dusPerDay}, 总价值: ${totalValueIDR}`);
      console.log(`📊 总DUS: ${totalDUS}, PO次数: ${poBerapaKali}`);
      console.log(`⏰ PO频率: ${poFrequency}`);
      console.log(`🧊 冰柜代码: ${freezerCode}`);
      console.log(`🎯 营销物料: 横幅=${spanduk}, 旗帜=${flagHanger}, 海报=${poster}`);
      console.log(`💰 价格物料: 价格牌=${papanHarga}, 价格贴=${stikerHarga}`);
      console.log(`🔧 最后服务: ${lastService}, 最后除冰: ${lastBungaEs}`);
      console.log(`📍 经纬度: lat=${latitude}, lng=${longitude}`);
      console.log(`✅ 状态: ${outletStatus}`);
      console.log(`=== 记录分析结束 ===\n`);
      
      // 如果经纬度无效，跳过此记录
      if (isNaN(latitude) || isNaN(longitude) || latitude === 0 || longitude === 0) {
        console.log(`⚠️ 跳过无效坐标的记录: ${outletCode}`);
        return null;
      }

      return {
        outletCode: outletCode || '',
        namaPemilik: namaPemilik || '',
        tanggalJoin: tanggalJoin || '',
        type: type || '',
        tokoType: tokoType || '',
        event: event || '',
        contractSign: contractSign || '',
        tanggalTurunFreezer: tanggalTurunFreezer || '',
        tanggalFirstPOEsKrim: tanggalFirstPOEsKrim || '',
        dusPerDay: dusPerDay || '',
        totalValueIDR: totalValueIDR || '',
        totalDUS: totalDUS || '',
        poBerapaKali: poBerapaKali || '',
        poFrequency: poFrequency || '',
        freezerCode: freezerCode || '',
        spanduk: spanduk || '',
        flagHanger: flagHanger || '',
        poster: poster || '',
        papanHarga: papanHarga || '',
        stikerHarga: stikerHarga || '',
        lastService: lastService || '',
        lastBungaEs: lastBungaEs || '',
        latitude: latitude,
        longitude: longitude,
        outletStatus: outletStatus || ''
      };
    }).filter(record => record !== null); // 过滤掉无效记录

    console.log(`✅ 有效的送货地点: ${csvData.length} 个`);
    return csvData;

  } catch (error) {
    console.error('❌ 获取飞书数据失败:', error.message);
    
    // 输出详细的错误信息
    if (error.response) {
      console.error('📄 错误状态码:', error.response.status);
      console.error('📄 错误响应头:', JSON.stringify(error.response.headers, null, 2));
      console.error('📄 错误响应数据:', JSON.stringify(error.response.data, null, 2));
    } else if (error.request) {
      console.error('📄 请求错误:', error.request);
    } else {
      console.error('📄 其他错误:', error.message);
    }
    
    throw error;
  }
}

// 生成CSV内容 - 更新为25字段格式
function generateCSV(data) {
  const headers = 'Outlet Code,Nama Pemilik,Tanggal Join,Type,Toko Type,Event,Contract Sign,Tanggal Turun Freezer,Tanggal First PO EsKrim,DUS per Day,Total Value IDR,Total DUS,PO berapa Kali,PO Frequency,Freezer Code,Spanduk,Flag Hanger,Poster,Papan Harga,Stiker Harga,Last Service,Last Bunga Es,latitude,longitude,Outlet Status';
  
  // 辅助函数：正确转义CSV字段
  function escapeCSVField(field) {
    if (field === null || field === undefined) {
      return '""';
    }
    
    const str = String(field);
    // 所有字段都用双引号包围，并转义内部的双引号
    return '"' + str.replace(/"/g, '""') + '"';
  }
  
  const rows = data.map(item => {
    return [
      escapeCSVField(item.outletCode),
      escapeCSVField(item.namaPemilik),
      escapeCSVField(item.tanggalJoin),
      escapeCSVField(item.type),
      escapeCSVField(item.tokoType),
      escapeCSVField(item.event),
      escapeCSVField(item.contractSign),
      escapeCSVField(item.tanggalTurunFreezer),
      escapeCSVField(item.tanggalFirstPOEsKrim),
      escapeCSVField(item.dusPerDay),
      escapeCSVField(item.totalValueIDR),
      escapeCSVField(item.totalDUS),
      escapeCSVField(item.poBerapaKali),
      escapeCSVField(item.poFrequency),
      escapeCSVField(item.freezerCode),
      escapeCSVField(item.spanduk),
      escapeCSVField(item.flagHanger),
      escapeCSVField(item.poster),
      escapeCSVField(item.papanHarga),
      escapeCSVField(item.stikerHarga),
      escapeCSVField(item.lastService),
      escapeCSVField(item.lastBungaEs),
      escapeCSVField(item.latitude),
      escapeCSVField(item.longitude),
      escapeCSVField(item.outletStatus)
    ].join(',');
  });
  
  return [headers, ...rows].join('\n') + '\n';
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
    const message = `🚚 更新送货数据 - ${today}`;

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
    if (error.status === 403) {
      console.error('❌ GitHub API权限错误 (403):', {
        message: error.message,
        documentation_url: error.response?.data?.documentation_url,
        repo: `${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}`
      });
      throw new Error(`GitHub权限不足：请检查Personal Access Token权限`);
    } else if (error.status === 401) {
      console.error('❌ GitHub API认证错误 (401):', error.message);
      throw new Error(`GitHub认证失败：请检查Personal Access Token是否有效`);
    } else if (error.status === 404) {
      console.error('❌ GitHub仓库不存在 (404):', `${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}`);
      throw new Error(`GitHub仓库不存在或无权访问：${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}`);
    } else {
      console.error('❌ 更新GitHub CSV文件失败:', {
        status: error.status,
        message: error.message,
        response: error.response?.data
      });
      throw new Error(`GitHub API错误 ${error.status || 'unknown'}: ${error.message}`);
    }
  }
}

// 保存本地CSV文件
function saveLocalCSV(csvContent) {
  const fs = require('fs');
  const path = require('path');
  
  try {
    // 保存到项目根目录
    const localPath = path.join(__dirname, '..', 'delivery_locations.csv');
    fs.writeFileSync(localPath, csvContent, 'utf8');
    console.log(`💾 本地CSV文件已保存: ${localPath}`);
    console.log(`📄 文件大小: ${csvContent.length} 字符`);
    return true;
  } catch (error) {
    console.error('❌ 保存本地CSV文件失败:', error.message);
    return false;
  }
}

// 执行同步任务
async function syncData() {
  try {
    console.log('\n🚀 开始执行飞书数据同步任务...');
    console.log(`⏰ 同步时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Jakarta' })}`);
    
    // 获取飞书数据
    const data = await getFeishuData();
    
    // 生成CSV内容
    const csvContent = generateCSV(data);
    
    if (data.length === 0) {
      console.log('📝 今天没有送货数据，清空地图标记');
    } else {
      console.log(`✅ 有效的送货地点: ${data.length} 个`);
    }
    
    // 保存本地CSV文件
    saveLocalCSV(csvContent);
    
    // 更新GitHub仓库
    await updateGitHubCSV(csvContent);
    
    console.log('🎉 数据同步完成！');
    console.log('=' .repeat(60));
    
  } catch (error) {
    console.error('❌ 数据同步失败:', error.message);
    console.log('=' .repeat(60));
  }
}

// 定时任务配置 - 每日凌晨2点自动同步
cron.schedule('0 2 * * *', async () => {
  console.log('\n⏰ 定时任务触发 - 每日凌晨2点自动同步');
  console.log(`🕐 当前时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Jakarta' })}`);
  await syncData();
}, {
  timezone: 'Asia/Jakarta'
});

console.log('⏰ 定时任务已设置: 每日凌晨2点(雅加达时间)自动同步');

// 健康检查端点
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        timezone: 'Asia/Jakarta',
        version: '3.0.0', // 简化版本
        features: ['data_sync', 'feishu_integration'], // 简化功能列表
        sync_schedule: '每日凌晨2点自动同步 + 手动刷新'
    });
});

// 调试端点 - 查看飞书原始数据
app.get('/debug/feishu-raw', async (req, res) => {
  try {
    const token = await getFeishuAccessToken();
    
    // 直接获取飞书原始数据
    const url = `https://open.feishu.cn/open-apis/bitable/v1/apps/${FEISHU_APP_TOKEN}/tables/${FEISHU_TABLE_ID}/records`;
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      params: {
        page_size: 3  // 只获取3条记录用于调试
      },
      timeout: 15000
    });
    
    if (response.data.code === 0) {
      const records = response.data.data.items || [];
      
      // 分析前3条记录的原始结构
      const sampleRecords = records.map(record => ({
        recordId: record.record_id,
        outletCode: record.fields['Outlet Code'],
        tanggalKirimAmbil: record.fields['Tanggal Kirim/Ambil'],
        tanggalType: typeof record.fields['Tanggal Kirim/Ambil'],
        tanggalValue: record.fields['Tanggal Kirim/Ambil'],
        allFieldNames: Object.keys(record.fields),
        hasDateField: 'Tanggal Kirim/Ambil' in record.fields
      }));
      
      res.json({
        message: "飞书原始记录结构",
        totalRecords: records.length,
        sampleRecords: sampleRecords,
        todayDate: getTodayDateString(),
        explanation: "检查 tanggalValue 和 tanggalType 来了解时间戳格式"
      });
    } else {
      res.status(500).json({ error: `飞书API错误: ${response.data.msg}` });
    }
  } catch (error) {
    res.status(500).json({ error: error.message, stack: error.stack });
  }
});

// 调试端点 - 查看特定记录的详细信息
app.get('/debug/record/:outletCode', async (req, res) => {
  try {
    const { outletCode } = req.params;
    const token = await getFeishuAccessToken();
    
    // 获取所有记录并查找特定的outlet code
    const url = `https://open.feishu.cn/open-apis/bitable/v1/apps/${FEISHU_APP_TOKEN}/tables/${FEISHU_TABLE_ID}/records`;
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      params: {
        page_size: 500  // 获取更多记录
      },
      timeout: 15000
    });
    
    if (response.data.code === 0) {
      const records = response.data.data.items || [];
      const targetRecord = records.find(record => record.fields['Outlet Code'] === outletCode);
      
      if (!targetRecord) {
        return res.status(404).json({ error: `未找到记录: ${outletCode}` });
      }
      
      // 详细分析目标记录
      const recordDetails = {
        recordId: targetRecord.record_id,
        outletCode: targetRecord.fields['Outlet Code'],
        namaPemilik: targetRecord.fields['Nama Pemilik'],
        spandukRaw: targetRecord.fields['Spanduk'],
        flagHangerRaw: targetRecord.fields['Flag Hanger'],
        posterRaw: targetRecord.fields['Poster'],
        papanHargaRaw: targetRecord.fields['Papan Harga'],
        stikerHargaRaw: targetRecord.fields['Stiker Harga'],
        spandukMapped: getSelectFieldText(targetRecord.fields['Spanduk']),
        flagHangerMapped: getSelectFieldText(targetRecord.fields['Flag Hanger']),
        posterMapped: getSelectFieldText(targetRecord.fields['Poster']),
        papanHargaMapped: getSelectFieldText(targetRecord.fields['Papan Harga']),
        stikerHargaMapped: getSelectFieldText(targetRecord.fields['Stiker Harga']),
        allFields: targetRecord.fields
      };
      
      res.json({
        message: `记录 ${outletCode} 的详细信息`,
        record: recordDetails,
        mappingTable: {
           'optJpS4dvk': 'Udah Pasang',
           'optKNgzwtU': 'Udah kasih, belum pasang',
           'optzNgL1Xk': 'iLang',
           'opt5eb0nvd': 'Belum kasih, belum pasang'
         }
      });
    } else {
      res.status(500).json({ error: `飞书API错误: ${response.data.msg}` });
    }
  } catch (error) {
    res.status(500).json({ error: error.message, stack: error.stack });
  }
});

// 调试端点 - 查看时间戳转换
app.get('/debug/timezone', async (req, res) => {
  try {
    const now = new Date();
    const utcTime = now.toISOString();
    const jakartaTime = now.toLocaleString("en-US", {timeZone: "Asia/Jakarta"});
    const jakartaDateObj = new Date(jakartaTime);
    const jakartaDateString = `${jakartaDateObj.getFullYear()}/${String(jakartaDateObj.getMonth() + 1).padStart(2, '0')}/${String(jakartaDateObj.getDate()).padStart(2, '0')}`;
    
    // 测试当前的转换逻辑
    const todayDate = getTodayDateString();
    
    res.json({
      currentTime: {
        utc: utcTime,
        jakarta: jakartaTime,
        jakartaDateObj: jakartaDateObj.toISOString(),
        jakartaDateString: jakartaDateString,
        todayDate: todayDate
      },
      note: "查看 /debug/feishu-raw 来看飞书实际返回的时间戳"
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 手动同步端点
app.post('/sync', async (req, res) => {
  try {
    await syncData();
    res.json({ success: true, message: '数据同步完成' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 调试字段结构端点
app.post('/debug-fields', async (req, res) => {
  try {
    const token = await getFeishuAccessToken();
    const todayDate = getTodayDateString();
    
    console.log(`📅 调试今天的字段结构: ${todayDate}`);
    
    // 获取前10条记录
    const url = `https://open.feishu.cn/open-apis/bitable/v1/apps/${FEISHU_APP_TOKEN}/tables/${FEISHU_TABLE_ID}/records`;
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      params: { page_size: 100 }
    });

    if (response.data.code === 0) {
      const records = response.data.data.items || [];
      
      // 过滤今天的记录
      const todayRecords = records.filter(record => {
        const tanggalKirim = record.fields['Tanggal Kirim/Ambil'] || record.fields['Tanggal Kirim EsKrim'];
        if (!tanggalKirim) return false;
        
        let recordDate = new Date(tanggalKirim);
        if (typeof tanggalKirim === 'number') {
          const jakartaDateString = recordDate.toLocaleDateString("en-CA", {timeZone: "Asia/Jakarta"});
          recordDate = new Date(jakartaDateString);
        }
        
        const recordDateString = `${recordDate.getFullYear()}/${String(recordDate.getMonth() + 1).padStart(2, '0')}/${String(recordDate.getDate()).padStart(2, '0')}`;
        return recordDateString === todayDate;
      });

      console.log(`找到 ${todayRecords.length} 条今天的记录`);
      
      // 显示字段结构
      const fieldInfo = todayRecords.map((record, index) => {
        const fields = record.fields;
        return {
          recordIndex: index + 1,
          outletCode: fields['Outlet Code'],
          allFieldNames: Object.keys(fields),
          latitudeField: {
            value: fields['latitude'],
            type: typeof fields['latitude']
          },
          longitudeField: {
            value: fields['longitude'], 
            type: typeof fields['longitude']
          },
          // 检查可能的其他坐标字段名
          possibleLatFields: Object.keys(fields).filter(key => 
            key.toLowerCase().includes('lat') || 
            key.toLowerCase().includes('纬度')
          ),
          possibleLngFields: Object.keys(fields).filter(key => 
            key.toLowerCase().includes('lng') || 
            key.toLowerCase().includes('long') ||
            key.toLowerCase().includes('经度')
          )
        };
      });
      
      res.json({
        success: true,
        todayDate: todayDate,
        recordCount: todayRecords.length,
        fieldInfo: fieldInfo
      });
    } else {
      throw new Error(`获取数据失败: ${response.data.msg}`);
    }
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// 调试同步端点 - 返回详细的执行过程
app.post('/debug-sync', async (req, res) => {
  const logs = [];
  const originalLog = console.log;
  const originalError = console.error;
  
  // 捕获所有日志输出
  console.log = (...args) => {
    const message = args.join(' ');
    logs.push({ type: 'info', message, timestamp: new Date().toISOString() });
    originalLog(...args);
  };
  
  console.error = (...args) => {
    const message = args.join(' ');
    logs.push({ type: 'error', message, timestamp: new Date().toISOString() });
    originalError(...args);
  };
  
  try {
    // 检查环境变量
    logs.push({ 
      type: 'info', 
      message: `环境变量检查: FEISHU_APP_ID=${FEISHU_APP_ID ? '已设置' : '未设置'}`, 
      timestamp: new Date().toISOString() 
    });
    logs.push({ 
      type: 'info', 
      message: `环境变量检查: FEISHU_APP_SECRET=${FEISHU_APP_SECRET ? '已设置' : '未设置'}`, 
      timestamp: new Date().toISOString() 
    });
    logs.push({ 
      type: 'info', 
      message: `环境变量检查: FEISHU_APP_TOKEN=${FEISHU_APP_TOKEN ? '已设置' : '未设置'}`, 
      timestamp: new Date().toISOString() 
    });
    logs.push({ 
      type: 'info', 
      message: `环境变量检查: FEISHU_TABLE_ID=${FEISHU_TABLE_ID ? '已设置' : '未设置'}`, 
      timestamp: new Date().toISOString() 
    });
    logs.push({ 
      type: 'info', 
      message: `环境变量检查: GITHUB_TOKEN=${GITHUB_TOKEN ? '已设置' : '未设置'}`, 
      timestamp: new Date().toISOString() 
    });
    
    await syncData();
    
    // 恢复原始的日志函数
    console.log = originalLog;
    console.error = originalError;
    
    res.json({ 
      success: true, 
      message: '调试同步完成',
      logs: logs
    });
  } catch (error) {
    // 恢复原始的日志函数
    console.log = originalLog;
    console.error = originalError;
    
    logs.push({ 
      type: 'error', 
      message: `同步失败: ${error.message}`, 
      timestamp: new Date().toISOString() 
    });
    
    res.status(500).json({ 
      success: false, 
      error: error.message,
      logs: logs
    });
  }
});

// 显示所有字段名称的调试端点
app.get('/debug-all-fields', async (req, res) => {
  try {
    const token = await getFeishuAccessToken();
    
    console.log('🔍 获取字段列表...');
    
    // 获取第一页数据来查看字段结构
    const url = `https://open.feishu.cn/open-apis/bitable/v1/apps/${FEISHU_APP_TOKEN}/tables/${FEISHU_TABLE_ID}/records`;
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      params: {
        page_size: 10 // 获取10条记录用于调试
      },
      timeout: 15000
    });

    if (response.data.code === 0) {
      const records = response.data.data.items || [];
      
      // 辅助函数：提取飞书字段的文本值
      function getFieldText(field) {
        if (!field) return '';
        if (Array.isArray(field) && field.length > 0 && field[0].text) {
          return field[0].text;
        }
        if (typeof field === 'string') return field;
        if (typeof field === 'number') return field.toString();
        return '';
      }
      
      // 辅助函数：处理日期字段格式
      function getDateFieldText(field) {
        if (!field) return '';
        
        let dateValue = '';
        
        // 处理不同的飞书日期字段格式
        if (Array.isArray(field) && field.length > 0) {
          if (field[0].text) {
            dateValue = field[0].text;
          } else if (field[0]) {
            dateValue = field[0].toString();
          }
        } else if (typeof field === 'string') {
          dateValue = field;
        } else if (typeof field === 'number') {
          // 如果是时间戳，转换为日期格式
          dateValue = new Date(field).toISOString().split('T')[0];
        } else if (field && typeof field === 'object') {
          // 处理飞书日期对象格式
          if (field.date) {
            dateValue = field.date;
          } else if (field.timestamp) {
            dateValue = new Date(field.timestamp * 1000).toISOString().split('T')[0];
          }
        }
        
        // 验证和格式化日期
        if (dateValue) {
          try {
            // 尝试解析日期
            const parsedDate = new Date(dateValue);
            if (!isNaN(parsedDate.getTime())) {
              // 返回 YYYY-MM-DD 格式
              return parsedDate.toISOString().split('T')[0];
            }
          } catch (error) {
            console.log(`⚠️ 日期格式解析错误: ${dateValue}`, error.message);
          }
        }
        
        return dateValue || '';
      }
      
      const debugInfo = {
        total_records: records.length,
        api_response_structure: {
          code: response.data.code,
          msg: response.data.msg,
          has_more: response.data.data.has_more
        },
        field_analysis: records.map((record, index) => {
          const fields = record.fields;
          const mingguIniServiceByRaw = fields['Hari Service Minggu Ini'];
          const mingguIniServiceByProcessed = getDateFieldText(mingguIniServiceByRaw);
          
          return {
            record_index: index,
            outlet_code: getFieldText(fields['Outlet Code']),
            record_id: record.record_id,
            all_available_fields: Object.keys(fields).sort(),
            minggu_ini_service_by_analysis: {
              field_exists: 'Hari Service Minggu Ini' in fields,
              raw_data: mingguIniServiceByRaw,
              raw_data_type: typeof mingguIniServiceByRaw,
              processed_value: mingguIniServiceByProcessed,
              processed_length: mingguIniServiceByProcessed.length,
              is_empty: !mingguIniServiceByProcessed || mingguIniServiceByProcessed.trim() === ''
            },
            alternative_service_fields: {
              'PIC': {
                exists: 'PIC' in fields,
                raw: fields['PIC'],
                processed: getFieldText(fields['PIC'])
              },
              'Service by': {
                exists: 'Service by' in fields,
                raw: fields['Service by'],
                processed: getFieldText(fields['Service by'])
              },
              'Minggu Service by': {
                exists: 'Minggu Service by' in fields,
                raw: fields['Minggu Service by'],
                processed: getFieldText(fields['Minggu Service by'])
              },
              'Service Person': {
                exists: 'Service Person' in fields,
                raw: fields['Service Person'],
                processed: getFieldText(fields['Service Person'])
              },
              'Petugas': {
                exists: 'Petugas' in fields,
                raw: fields['Petugas'],
                processed: getFieldText(fields['Petugas'])
              }
            },
            sample_other_fields: {
              'Nama Pemilik': getFieldText(fields['Nama Pemilik']),
              'Outlet Status': getFieldText(fields['Outlet Status']),
              'Tanggal Turun Freezer': getFieldText(fields['Tanggal Turun Freezer'])
            }
          };
        })
      };
      
      // 在服务器日志中也输出详细信息
      console.log('\n🔍 === DEBUG ALL FIELDS 调试信息 ===');
      console.log('📊 总记录数:', debugInfo.total_records);
      console.log('📋 所有可用字段:', debugInfo.field_analysis[0]?.all_available_fields || []);
      
      debugInfo.field_analysis.forEach((record, index) => {
        console.log(`\n📝 记录 ${index + 1} (${record.outlet_code}):`);
        console.log('  📅 Hari Service Minggu Ini 日期分析:');
        console.log('    - 字段存在:', record.minggu_ini_service_by_analysis.field_exists);
        console.log('    - 原始数据:', JSON.stringify(record.minggu_ini_service_by_analysis.raw_data));
        console.log('    - 处理后日期值:', `"${record.minggu_ini_service_by_analysis.processed_value}"`);
        console.log('    - 是否为空:', record.minggu_ini_service_by_analysis.is_empty);
        
        console.log('  🔍 替代字段检查:');
        Object.entries(record.alternative_service_fields).forEach(([fieldName, fieldInfo]) => {
          if (fieldInfo.exists && fieldInfo.processed) {
            console.log(`    - ${fieldName}: "${fieldInfo.processed}"`);
          }
        });
      });
      console.log('=== DEBUG 结束 ===\n');
      
      res.json(debugInfo);
    } else {
      res.status(500).json({ error: `飞书API错误: ${response.data.msg}` });
    }
  } catch (error) {
    console.error('❌ 获取字段列表失败:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取订单统计API（简化版本）
app.get('/api/order-status', async (req, res) => {
  try {
    console.log('📊 获取订单统计...');
    
    // 获取今天的飞书数据
    const allOrders = await getFeishuData();
    
    const totalDUS = allOrders.reduce((sum, order) => sum + (parseInt(order.totalDUS) || 0), 0);

    res.json({
      success: true,
      date: getTodayDateString(),
      total_orders: allOrders.length,
      total_dus: totalDUS,
      last_update: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ 获取订单统计失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 环境变量配置信息
// 提供CSV数据的API端点
app.get('/api/csv-data', async (req, res) => {
  try {
    // 获取最新的飞书数据
    const data = await getFeishuData();
    const csvContent = generateCSV(data);
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(csvContent);
  } catch (error) {
    console.error('获取CSV数据失败:', error);
    
    // 返回空的CSV（只有表头）- 使用正确的格式
    const emptyCSV = 'Outlet Code,Nama Pemilik,Hari Service Minggu Ini,Tanggal Turun Freezer,latitude,longitude,No Telepon Pemilik,Visit,PO,BuangEs,Outlet Status';
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(emptyCSV);
  }
});

app.get('/api/config-status', (req, res) => {
  res.json({
    feishu_configured: !!(FEISHU_APP_ID && FEISHU_APP_SECRET && FEISHU_APP_TOKEN && FEISHU_TABLE_ID),
    feishu_details: {
      app_id_set: !!FEISHU_APP_ID,
      app_secret_set: !!FEISHU_APP_SECRET,
      app_token_set: !!FEISHU_APP_TOKEN,
      table_id_set: !!FEISHU_TABLE_ID
    },
    github_configured: !!(GITHUB_TOKEN && GITHUB_REPO_OWNER && GITHUB_REPO_NAME),
    github_details: {
      token_set: !!GITHUB_TOKEN,
      repo_owner_set: !!GITHUB_REPO_OWNER,
      repo_name_set: !!GITHUB_REPO_NAME,
      repo_path: GITHUB_REPO_OWNER && GITHUB_REPO_NAME ? `${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}` : 'not_configured'
    },
    environment: process.env.NODE_ENV || 'development',
    node_version: process.version,
    timestamp: new Date().toISOString()
  });
});

// 连接测试端点
app.post('/api/test-connections', async (req, res) => {
  const results = {
    feishu: { status: 'not_tested', message: '', details: null },
    github: { status: 'not_tested', message: '', details: null }
  };

  // 测试飞书API连接
  try {
    if (FEISHU_APP_ID && FEISHU_APP_SECRET) {
      console.log('🧪 测试飞书API连接...');
      const token = await getFeishuAccessToken();
      results.feishu = {
        status: 'success',
        message: '飞书API连接成功',
        details: { token_obtained: !!token }
      };
    } else {
      results.feishu = {
        status: 'failed',
        message: '飞书API配置不完整',
        details: null
      };
    }
  } catch (error) {
    results.feishu = {
      status: 'failed',
      message: error.message,
      details: { error_type: error.constructor.name }
    };
  }

  // 测试GitHub API连接
  try {
    if (GITHUB_TOKEN && GITHUB_REPO_OWNER && GITHUB_REPO_NAME) {
      console.log('🧪 测试GitHub API连接...');
      const { data: repo } = await octokit.rest.repos.get({
        owner: GITHUB_REPO_OWNER,
        repo: GITHUB_REPO_NAME
      });
      results.github = {
        status: 'success',
        message: 'GitHub API连接成功',
        details: { 
          repo_accessible: true,
          repo_name: repo.full_name,
          permissions: repo.permissions
        }
      };
    } else {
      results.github = {
        status: 'failed',
        message: 'GitHub API配置不完整',
        details: null
      };
    }
  } catch (error) {
    results.github = {
      status: 'failed',
      message: `GitHub API错误 ${error.status || 'unknown'}: ${error.message}`,
      details: { 
        error_type: error.constructor.name,
        status_code: error.status
      }
    };
  }

  res.json({
    success: true,
    test_results: results,
    summary: {
      total_tests: Object.keys(results).length,
      passed: Object.values(results).filter(r => r.status === 'success').length,
      failed: Object.values(results).filter(r => r.status === 'failed').length,
      skipped: Object.values(results).filter(r => r.status === 'skipped').length
    },
    timestamp: new Date().toISOString()
  });
});

// 服务信息端点
app.get('/', (req, res) => {
  const now = new Date();
  const jakartaTime = now.toLocaleString('zh-CN', { timeZone: 'Asia/Jakarta' });
  
  res.json({
    service: '印尼送货数据同步服务',
    version: '3.0.0',
    description: '简化版数据展示系统',
    status: 'running',
    currentTime: jakartaTime,
    timezone: 'Asia/Jakarta (UTC+7)',
    schedule: '每日凌晨2点自动同步 + 手动刷新',
    lastSync: '查看日志了解详情',
    features: {
      data_sync: '飞书数据同步',
      map_display: '地图标记显示'
    },
    endpoints: {
      health: '/health',
      manualSync: 'POST /sync',
      orderStatus: 'GET /api/order-status',
      configStatus: 'GET /api/config-status',
      testConnections: 'POST /api/test-connections'
    }
  });
});

console.log('🌟 印尼送货数据同步服务启动中...');
console.log('🔗 手动同步: POST /sync');
console.log('❤️ 健康检查: GET /health');
console.log('⏰ 同步策略: 每日凌晨2点自动同步 + 手动刷新');
console.log('🚫 已禁用频繁自动同步，避免不必要的资源消耗');

app.listen(PORT, () => {
  console.log(`🚀 服务运行在端口 ${PORT}`);
  console.log(`🌍 服务地址: https://feishu-delivery-sync.onrender.com`);
  console.log('/' .repeat(60));
});