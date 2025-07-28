const fs = require('fs');
const path = require('path');

// Excel序列号转换为日期的函数
function excelSerialToDate(serial) {
  const numValue = parseFloat(serial);
  if (isNaN(numValue) || numValue < 1000 || numValue > 100000) {
    return serial; // 如果不是有效的Excel序列号，返回原值
  }
  
  // Excel序列号转换为日期（Excel从1900年1月1日开始计算，但有闰年bug）
  const excelEpoch = new Date(1900, 0, 1); // 1900年1月1日
  const daysSinceEpoch = numValue - 2; // 减去2是因为Excel的1900年闰年bug
  const resultDate = new Date(excelEpoch.getTime() + daysSinceEpoch * 24 * 60 * 60 * 1000);
  return resultDate.toISOString().split('T')[0]; // 返回YYYY-MM-DD格式
}

// 读取CSV文件
const csvPath = path.join(__dirname, 'public', 'markers.csv');
const csvContent = fs.readFileSync(csvPath, 'utf8');

// 解析CSV
const lines = csvContent.split('\n');
const headers = lines[0];
const dataLines = lines.slice(1).filter(line => line.trim() !== '');

console.log('🔄 开始转换CSV文件中的日期格式...');
console.log(`📊 总共 ${dataLines.length} 条记录`);

// 找到"Tanggal Turun Freezer"列的索引
const headerArray = headers.split(',');
const dateColumnIndex = headerArray.findIndex(header => header.includes('Tanggal Turun Freezer'));

if (dateColumnIndex === -1) {
  console.error('❌ 未找到"Tanggal Turun Freezer"列');
  process.exit(1);
}

console.log(`📍 "Tanggal Turun Freezer"列位于第 ${dateColumnIndex + 1} 列`);

// 转换数据
let convertedCount = 0;
const convertedLines = dataLines.map(line => {
  // 简单的CSV解析（处理引号）
  const columns = [];
  let currentColumn = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      columns.push(currentColumn);
      currentColumn = '';
    } else {
      currentColumn += char;
    }
  }
  columns.push(currentColumn); // 添加最后一列
  
  // 转换日期列
  if (columns[dateColumnIndex]) {
    const originalValue = columns[dateColumnIndex].replace(/"/g, ''); // 移除引号
    const convertedValue = excelSerialToDate(originalValue);
    
    if (originalValue !== convertedValue) {
      console.log(`🔄 转换: ${originalValue} -> ${convertedValue}`);
      convertedCount++;
    }
    
    columns[dateColumnIndex] = `"${convertedValue}"`; // 重新添加引号
  }
  
  return columns.join(',');
});

console.log(`✅ 成功转换 ${convertedCount} 个日期值`);

// 重新组合CSV内容
const newCsvContent = [headers, ...convertedLines].join('\n');

// 写入文件
fs.writeFileSync(csvPath, newCsvContent, 'utf8');
console.log('💾 CSV文件已更新');
console.log('🎉 日期格式转换完成！');