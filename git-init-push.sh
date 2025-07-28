#!/bin/bash

# 印尼冰柜配送地图系统 - Git初始化和推送脚本
# ===============================================

set -e

echo "❄️ 印尼冰柜配送地图系统 - Git仓库初始化"
echo "=========================================="
echo ""

# 获取当前目录
CURRENT_DIR=$(pwd)
echo "📁 当前目录: $CURRENT_DIR"

# 检查是否是冰柜配送系统目录
if [ ! -f "package.json" ] || ! grep -q "freezer-delivery-map-system" package.json; then
    echo "❌ 错误: 请在冰柜配送系统目录中运行此脚本"
    echo "确保目录包含 package.json 且项目名为 freezer-delivery-map-system"
    exit 1
fi

echo "✅ 确认这是冰柜配送地图系统目录"

# 清理旧的Git信息
echo ""
echo "🗑️ 清理旧的Git信息..."
if [ -d ".git" ]; then
    echo "发现 .git 目录，正在删除..."
    rm -rf .git
    echo "✅ 旧的Git信息已清理"
else
    echo "✅ 没有发现旧的Git信息"
fi

# 初始化新的Git仓库
echo ""
echo "📦 初始化新的Git仓库..."
git init
echo "✅ 新的Git仓库初始化完成"

# 创建.gitignore文件
echo ""
echo "📝 创建.gitignore文件..."
cat > .gitignore << 'GITIGNORE'
# 依赖目录
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# 构建输出
build/
dist/

# 环境变量文件
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# 日志文件
logs/
*.log

# 运行时文件
pids
*.pid
*.seed
*.pid.lock

# 系统文件
.DS_Store
Thumbs.db

# 临时文件
temp/
tmp/

# 敏感数据
secrets/
private/
GITIGNORE

echo "✅ .gitignore文件创建完成"

# 添加所有文件到Git
echo ""
echo "📋 添加文件到Git..."
git add .
echo "✅ 所有文件已添加到Git暂存区"

# 创建初始提交
echo ""
echo "💾 创建初始提交..."
git commit -m "feat: 印尼冰柜配送地图系统初始提交

✨ 功能特性:
- 冰柜配送地点地图标注系统
- 送冰柜和取冰柜分类显示 
- 飞书多维表格数据同步
- React前端界面 (TypeScript + Leaflet)
- 冰柜配送状态统计
- 地图可视化标注

🔧 技术栈:
- 前端: React + TypeScript + Leaflet地图
- 后端: Node.js + Express + 飞书API
- 数据同步: 飞书多维表格API

🎯 系统特色:
- 蓝色标记: 送冰柜地点
- 绿色标记: 取冰柜地点  
- 灰色标记: 已完成任务
- 橙色星形: 配送中心总部"

echo "✅ 初始提交创建完成"

echo ""
echo "🎉 冰柜配送地图系统Git仓库设置完成！"
echo "============================================"
echo ""
echo "🚀 下一步: 创建GitHub仓库并推送"
echo "   1. 在GitHub上创建新仓库"
echo "   2. 运行: git remote add origin <你的仓库URL>"
echo "   3. 运行: git push -u origin main"

